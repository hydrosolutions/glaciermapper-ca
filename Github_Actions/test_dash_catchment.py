#!/usr/bin/env python3
"""
Test script to debug the dash issue in catchment names.
This will run the export for a single catchment with dashes in the name.
"""

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
project_id = key.get("project_id")
creds = ee.ServiceAccountCredentials(sa_email, KEY_PATH)
ee.Initialize(creds, project=project_id)

print(f"✅ Earth Engine initialized with service account: {sa_email}")
print(f"✅ Project ID: {project_id}")

def test_dash_catchment():
    """Test export for a catchment with dashes in the name"""
    
    # Load data
    RiverBasins_2023 = ee.FeatureCollection('users/hydrosolutions/RiverBasins_CA_Jan2023_simple1000')
    RiverBasins_2023 = RiverBasins_2023.map(lambda ft: ft.set('NAME', ee.String(ft.get('BASIN')).cat(ee.String('_')).cat(ee.String(ft.get('CODE')))))
    glims = ee.FeatureCollection("GLIMS/20230607").filter(ee.Filter.eq('geog_area', "Randolph Glacier Inventory; Umbrella RC for merging the RGI into GLIMS"))
    
    # List all assets in the SLA folder
    layers_download = 'projects/ee-hydro4u/assets/snow_CentralAsia/Folder4SLA_v4'
    assets_list = ee.data.listAssets({'parent': layers_download})['assets']
    assetList_SLA = [ee.FeatureCollection(asset['name']) for asset in assets_list]

    joinProperty='Year-Month-Day'
    print(f"✅ Total assets found: {len(assetList_SLA)}")

    # Test with a catchment that has dashes and dots
    test_catchment = 'BALKH_12-0.000-10M'
    
    print(f"\n🧪 Testing catchment: {test_catchment}")
    print(f"   Contains dashes: {'-' in test_catchment}")
    print(f"   Contains dots: {'.' in test_catchment}")
    
    # Sanitize catchment name for asset lookup (dots are removed in asset names)
    sanitized_catchment_name = test_catchment.replace('.', '')
    print(f"   Sanitized for lookup: {sanitized_catchment_name}")
    
    # Check if this catchment exists
    all_catchments = RiverBasins_2023.aggregate_array('NAME').getInfo()
    if test_catchment not in all_catchments:
        print(f"\n⚠️  Catchment '{test_catchment}' not found in basin collection")
        print(f"   Looking for similar names...")
        similar = [name for name in all_catchments if 'BALKH' in name and '12' in name]
        if similar:
            print(f"   Found similar catchments: {similar}")
            test_catchment = similar[0]
            print(f"   Using: {test_catchment}")
        else:
            print(f"   Available catchments with BALKH: {[name for name in all_catchments if 'BALKH' in name][:5]}")
            return
    
    # Create current date
    index_date = ee.Date(dt.datetime.now().strftime('%Y-%m-%d'))
    
    # Configuration
    dem = load_dem()
    scale = 500
    tile_scale = 2
    sc_th = 50
    aspect_keys = ['East', 'North', 'South', 'West', 'mixed']
    
    current_month = dt.datetime.now().month
    current_year = dt.datetime.now().year
    
    print(f"\n📅 Export configuration:")
    print(f"   Current date: {dt.datetime.now().strftime('%Y-%m-%d')}")
    print(f"   Year: {current_year}, Month: {current_month}")
    
    # Get existing assets for this catchment
    existing_assets = ee.FeatureCollection([])
    matching_assets = []
    
    print(f"\n🔍 Looking for existing assets for: {test_catchment}")
    print(f"   Searching with sanitized name: {sanitized_catchment_name}")
    for i, asset_info in enumerate(assets_list):
        asset_path = asset_info['name']
        if sanitized_catchment_name in asset_path:
            print(f"   Found: {asset_path}")
            matching_assets.append(assetList_SLA[i])
    
    if not matching_assets:
        print(f"   No existing assets found for {test_catchment}")
        print(f"   Will create initial export")
    
    # Merge all matching assets
    for asset in matching_assets:
        existing_assets = existing_assets.merge(asset)

    def add_time_properties(ft):
        time = ee.Date.parse('YYYY-MM-dd', ft.get(joinProperty))
        aspect_values = ft.select(['East', 'North', 'South', 'West']).toDictionary().values()
        mean_value = aspect_values.reduce(ee.Reducer.mean())
        return ft.set('system:time_start', time.millis()).set('value', mean_value)

    # Process the collection
    AoiMean_fromAsset = (existing_assets
              .sort('Year-Month-Day')
              .distinct(['Year-Month-Day'])
              .select([joinProperty, 'SLA_East', 'SLA_North', 'SLA_South', 'SLA_West'],
                  [joinProperty, 'East', 'North', 'South', 'West']))

    AoiMean_fromAsset = AoiMean_fromAsset.map(add_time_properties)
    
    # Get the last export date or use a default
    try:
        last_export_date = ee.Date(AoiMean_fromAsset.sort('Year-Month-Day', False).first().get('Year-Month-Day'))
        print(f"   Last export date: {last_export_date.format('YYYY-MM-dd').getInfo()}")
    except:
        # If no existing assets, start from beginning of year
        last_export_date = ee.Date(f"{current_year}-01-01")
        print(f"   No previous exports, starting from: {last_export_date.format('YYYY-MM-dd').getInfo()}")

    year_last_export_date = last_export_date.get('year')
    year_index_date = index_date.get('year')
    
    # Filter by catchment
    aoi = RiverBasins_2023.filter(ee.Filter.eq('NAME', test_catchment)).geometry()

    print(f"\n🗺️  Loading MODIS data...")
    # Load MODIS data
    modis_ic = create_decadal_composites(aoi, year_last_export_date, year_index_date, agg_interval=10)
    modis_ic = modis_ic.filterDate(last_export_date.advance(1,'day'), index_date)
    
    image_count = modis_ic.size().getInfo()
    print(f"   Found {image_count} MODIS images to process")
    
    if image_count == 0:
        print(f"   ⚠️  No new images to process, export skipped")
        return

    modisProjection = modis_ic.filterBounds(aoi).first().projection()
    reprojected_dem, min_dem_dict, max_dem_dict, n_grid = reproject_and_analyze_dem(dem, modisProjection, aoi, scale, tile_scale, aspect_keys)
    aspects, aspect_coded = classify_aspect(dem, modisProjection, scale)    
    
    print(f"\n⚙️  Processing snowline calculations...")
    
    # Function to process each image
    def create_feature_with_properties(img):
        current_snowline_stats, current_fsc = get_snowline_elevation(
            img, reprojected_dem, aspect_coded, aoi, min_dem_dict, max_dem_dict, n_grid,
            scale=500, scale_dem=500, sc_th=50, canny_threshold=0.7,
            canny_sigma=0.7, ppha=10, tile_scale=1, point2sample=1000, 
            aspectKeys=aspect_keys
        )
        
        current_glacier_metrics = calculate_glacier_metrics(
            glims, aoi, img, sc_th, current_snowline_stats, dem, aspect_keys, tile_scale, aspects
        )
        
        aspect_dict = {}
        base = ee.String('SLA_')
        
        for i, aspect in enumerate(aspect_keys[:-1]):
            aspect_dict[base.cat(aspect)] = current_snowline_stats.get(aspect)
        
        img_date = ee.Date(img.get('system:time_start'))
        img_year = img_date.get('year')
        img_decade = ee.Number(img_date.get('day')).add(2).divide(10).ceil()
        
        feature = ee.Feature(None).set(
            'Year-Month-Day', img_date.format('YYYY-MM-dd'),
            'year', img_year,
            'decade', img_decade,
            'gla_fsc', current_glacier_metrics['glims_fsc'],
            'gla_fsc_below_sl50', current_glacier_metrics['glims_fsc_below_sl'],
            'gla_area_below_sl50', current_glacier_metrics['glims_area_below_sl'],
            'fsc', current_fsc
        )
        
        for key, value in aspect_dict.items():
            feature = feature.set(key, value)
            
        return feature
    
    # Apply the function
    aoi_mean_tmp = modis_ic.map(create_feature_with_properties)
    joined = aoi_mean_tmp.map(lambda ft: ee.Feature(aoi.centroid(1000)).copyProperties(ft))
    table_to_export = joined
    
    export_layer_name = 'decadal_SLA'
    year_month = f"{current_year}_{current_month-1:02d}"
    
    # Create the description and asset ID
    description = f"{export_layer_name}_{test_catchment.replace('.', '')}_{year_month}"
    assetId = f"projects/ee-hydro4u/assets/snow_CentralAsia/Folder4SLA_v4/{export_layer_name}_{test_catchment.replace('.', '')}_{year_month}"
    
    print(f"\n📤 Preparing export task:")
    print(f"   Description: {description}")
    print(f"   Asset ID: {assetId}")
    print(f"   Description length: {len(description)} chars")
    print(f"   Asset ID length: {len(assetId)} chars")
    
    try:
        # Export to asset
        task = ee.batch.Export.table.toAsset(
            collection=ee.FeatureCollection(table_to_export).set('NAME', test_catchment),
            description=description,
            assetId=assetId
        )
        
        # Start the export task
        task.start()
        print(f"\n✅ Export task started successfully!")
        print(f"   Task ID: {task.id}")
        print(f"   Status: {task.status()}")
        
    except Exception as e:
        print(f"\n❌ ERROR starting export task:")
        print(f"   {type(e).__name__}: {str(e)}")
        print(f"\n🔍 Debugging info:")
        print(f"   Catchment name: '{test_catchment}'")
        print(f"   Contains dash: {'-' in test_catchment}")
        print(f"   Description: '{description}'")
        print(f"   Asset ID: '{assetId}'")
        raise

def main():
    """Main function"""
    print("🧪 Testing export with catchment containing dashes")
    print("=" * 60)
    
    try:
        test_dash_catchment()
        print("\n" + "=" * 60)
        print("✅ Test completed successfully!")
    except Exception as e:
        print("\n" + "=" * 60)
        print(f"❌ Test failed with error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()
