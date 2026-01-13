# run_export.py
import os
import json
import datetime as dt
import sys
from pathlib import Path
import ee

# Add the project root directory to Python path
project_root = Path(__file__).parent.parent
sys.path.append(str(project_root))

# Import your project-specific modules from `src`
from src.modis_processing import create_decadal_composites
from src.dem_processing import load_dem, classify_aspect, reproject_and_analyze_dem
from src.snowline import get_snowline_elevation, calculate_glacier_metrics

# Initialize Earth Engine with service account
KEY_PATH = os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "thurgau-irrigation-4767961f11f5.json")
with open(KEY_PATH) as f:
    key = json.load(f)

sa_email = key["client_email"]
project_id = key.get("project_id")  # optional but recommended
creds = ee.ServiceAccountCredentials(sa_email, KEY_PATH)
ee.Initialize(creds, project=project_id)

print(f"Earth Engine initialized with service account: {sa_email}")
print(f"Project ID: {project_id}")

# Optional idempotency helper
def asset_exists(asset_id: str) -> bool:
    try:
        ee.data.getAsset(asset_id)
        return True
    except Exception:
        return False

def run_monthly_export():
    """Run the monthly export for current year up to previous month"""
    # Load data
    RiverBasins_2023 = ee.FeatureCollection('users/hydrosolutions/RiverBasins_CA_Jan2023_simple1000')
    RiverBasins_2023 = RiverBasins_2023.map(lambda ft: ft.set('NAME', ee.String(ft.get('BASIN')).cat(ee.String('_')).cat(ee.String(ft.get('CODE')))))
    glims = ee.FeatureCollection("GLIMS/20230607").filter(ee.Filter.eq('geog_area', "Randolph Glacier Inventory; Umbrella RC for merging the RGI into GLIMS"))
    
    # List all assets in the SLA folder
    layers_download = [
        'projects/ee-hydro4u/assets/snow_CentralAsia/Monthly_snow_cover_fraction_until2022-12_Terra',
        'projects/ee-hydro4u/assets/snow_CentralAsia/Monthly_snow_water_equivalents_ERA5-Land_until2022-10',
        'projects/ee-hydro4u/assets/snow_CentralAsia/Annual_first_day_of_no_snow_until2022',
        'projects/ee-hydro4u/assets/snow_CentralAsia/Annual_first_day_of_no_snow_TREND_until2022',
        'projects/ee-hydro4u/assets/snow_CentralAsia/Monthly_snow_water_equivalents_TerraClimate_until2021-12',
        'projects/ee-hydro4u/assets/snow_CentralAsia/Folder4SLA_v4'
    ]

    # Get list of assets and convert to FeatureCollections
    assets_list = ee.data.listAssets({'parent': layers_download[5]})['assets']
    assetList_SLA = [ee.FeatureCollection(asset['name']) for asset in assets_list]

    joinProperty='Year-Month-Day'
    print(f"Total assets found: {len(assetList_SLA)}")

    # Create current date using Earth Engine Date
    index_date = ee.Date(dt.datetime.now().strftime('%Y-%m-%d'))
    
    # Configuration
    dem = load_dem()
    scale = 500
    tile_scale = 2
    sc_th = 50
    aspect_keys = ['East', 'North', 'South', 'West', 'mixed']
    
    # Loop over each basin and export results for a given month (or several months)
    catchment_names = RiverBasins_2023.aggregate_array('NAME').getInfo()
    # Get the current month
    current_month = dt.datetime.now().month  # returns 1-12
    current_year = dt.datetime.now().year

    # Add system:time_start and value properties
    def add_time_properties(ft):
        time = ee.Date.parse('YYYY-MM-dd', ft.get(joinProperty))
        aspect_values = ft.select(['East', 'North', 'South', 'West']).toDictionary().values()
        mean_value = aspect_values.reduce(ee.Reducer.mean())
        return ft.set('system:time_start', time.millis()).set('value', mean_value)

    for catchment_name in catchment_names:
        print(f"Processing catchment {catchment_name}...")
        
        # Sanitize catchment name for asset lookup (dots are removed in asset names)
        sanitized_catchment_name = catchment_name.replace('.', '')
        
        # Get existing assets for this catchment and create a flattened collection
        existing_assets = ee.FeatureCollection([])
        matching_assets = []  # Initialize matching_assets before the loop
        
        for i, asset_info in enumerate(assets_list):
            asset_path = asset_info['name']
            # Check if the asset path contains our sanitized catchment name
            if sanitized_catchment_name in asset_path:
                matching_assets.append(assetList_SLA[i])
        
        # Merge all matching assets after collecting them
        for asset in matching_assets:
            existing_assets = existing_assets.merge(asset)

        # Process the collection to get the required format
        AoiMean_fromAsset = (existing_assets
                  .sort('Year-Month-Day')
                  .distinct(['Year-Month-Day'])
                  .select([joinProperty, 'SLA_East', 'SLA_North', 'SLA_South', 'SLA_West'],
                      [joinProperty, 'East', 'North', 'South', 'West']))

        AoiMean_fromAsset = AoiMean_fromAsset.map(add_time_properties)
        
        # Get the last export date
        last_export_date = ee.Date(AoiMean_fromAsset.sort('Year-Month-Day', False).first().get('Year-Month-Day'))

        year_last_export_date = last_export_date.get('year')
        year_index_date = index_date.get('year')
        
        # Filter by catchment
        aoi = RiverBasins_2023.filter(ee.Filter.eq('NAME', catchment_name)).geometry()

        # Load MODIS data for the year
        modis_ic = create_decadal_composites(aoi, year_last_export_date, year_index_date, agg_interval=10)
        modis_ic = modis_ic.filterDate(last_export_date.advance(1,'day'), index_date)

        modisProjection = modis_ic.filterBounds(aoi).first().projection()
        reprojected_dem, min_dem_dict, max_dem_dict, n_grid = reproject_and_analyze_dem(dem, modisProjection, aoi, scale, tile_scale, aspect_keys)
        aspects, aspect_coded = classify_aspect(dem, modisProjection, scale)    
        
        # Function to process each image and create a feature with properties
        def create_feature_with_properties(img):
            # Get snowline elevation for this image
            current_snowline_stats, current_fsc = get_snowline_elevation(
                img, reprojected_dem, aspect_coded, aoi, min_dem_dict, max_dem_dict, n_grid,
                scale=500, scale_dem=500, sc_th=50, canny_threshold=0.7,
                canny_sigma=0.7, ppha=10, tile_scale=1, point2sample=1000, 
                aspectKeys=aspect_keys
            )
            
            # Calculate glacier metrics
            current_glacier_metrics = calculate_glacier_metrics(
                glims, aoi, img, sc_th, current_snowline_stats, dem, aspect_keys, tile_scale, aspects
            )
            
            # Create a dictionary with aspect-specific values
            aspect_dict = {}
            base = ee.String('SLA_')
            
            # Add properties for each aspect (excluding 'mixed')
            for i, aspect in enumerate(aspect_keys[:-1]):
                aspect_dict[base.cat(aspect)] = current_snowline_stats.get(aspect)
            
            # Get date info
            img_date = ee.Date(img.get('system:time_start'))
            img_year = img_date.get('year')
            img_decade = ee.Number(img_date.get('day')).add(2).divide(10).ceil()
            
            # Create feature with all properties
            feature = ee.Feature(None).set(
                'Year-Month-Day', img_date.format('YYYY-MM-dd'),
                'year', img_year,
                'decade', img_decade,
                'gla_fsc', current_glacier_metrics['glims_fsc'],
                'gla_fsc_below_sl50', current_glacier_metrics['glims_fsc_below_sl'],
                'gla_area_below_sl50', current_glacier_metrics['glims_area_below_sl'],
                'fsc', current_fsc
            )
            
            # Add aspect-specific properties
            for key, value in aspect_dict.items():
                feature = feature.set(key, value)
                
            return feature
        
        # Apply the function to each image in the collection
        aoi_mean_tmp = modis_ic.map(create_feature_with_properties)
        
        # Add geometry to features (because null geometry can't be exported)
        joined = aoi_mean_tmp.map(lambda ft: ee.Feature(aoi.centroid(1000)).copyProperties(ft))
        
        # Sort by glacier snow cover below snowline
        table_to_export = joined
        
        export_layer_name = 'decadal_SLA'  # Modify as needed
        
        # Create year_month string for asset naming
        year_month = f"{current_year}_{current_month-1:02d}"
        
        # Export to asset
        task = ee.batch.Export.table.toAsset(
            collection=ee.FeatureCollection(table_to_export).set('NAME', catchment_name),
            description=f"{export_layer_name}_{catchment_name.replace('.', '')}_{year_month}",
            assetId=f"projects/ee-hydro4u/assets/snow_CentralAsia/Folder4SLA_v4/{export_layer_name}_{catchment_name.replace('.', '')}_{year_month}"
        )
        
        # Start the export task
        task.start()
        print(f"Export started for year {current_year} and month {current_month-1}.")

def main():
    """Main function to run the export"""
    print("Starting GlacierMapper-CA monthly export...")
    run_monthly_export()
    print("Export process completed.")

if __name__ == "__main__":
    main()
