import ee

# Initialize Earth Engine (make sure to authenticate first)
# ee.Authenticate()  # Run this once if needed
ee.Initialize()

def buffer_equal(feature):
    """
    Buffer around the glacier to make it equal area
    """
    feature = ee.Feature(feature)
    ar = feature.geometry().area(100)
    perim = feature.perimeter(100)
    rooted = (perim.pow(2).add(ar.multiply(16).multiply(0.45))).sqrt()
    nomin = rooted.subtract(perim)
    
    soln = nomin.divide(8)
    
    buff = feature.geometry().buffer(soln, 100)
    
    feat_ar = feature.geometry().area(100)
    buffer_ar = buff.area(100)
    ratio = buffer_ar.divide(feat_ar)
    
    return ee.Feature(buff, {'featAr': feat_ar, 'bufferAr': buffer_ar, 'ratio': ratio})

def main(export_all=False):
    """
    Main function to export glacier mask tiles
    
    Args:
        export_all (bool): If True, export all tiles. If False, only export first 10 tiles for testing.
    """
    # Load river basins
    river_basins_2023 = ee.FeatureCollection('users/hydrosolutions/RiverBasins_CA_Jan2023_simple1000')
    
    # Load GLIMS data
    glims = (ee.FeatureCollection("GLIMS/20230607")
            .filter(ee.Filter.eq('geog_area', "Randolph Glacier Inventory; Umbrella RC for merging the RGI into GLIMS"))
            .filterBounds(river_basins_2023))
    
    # Create a grid over study region with 100km resolution
    bounds = river_basins_2023.geometry()
    grid = bounds.coveringGrid(ee.Projection('EPSG:4326').atScale(100000))
    
    if not export_all:
        # For testing, filter to a specific point
        geometry = ee.Geometry.Point([71.5564668249662, 39.62409902124268])
        grid = grid.filterBounds(geometry)
    
    print('Number of grids:', grid.size().getInfo())

    # Get the grid tiles as a list
    grid_list = grid.toList(grid.size())
    
    # Determine number of tiles to process
    total_tiles = grid.size().getInfo()
    num_tiles_to_process = 10 if not export_all else total_tiles
    
    print(f"Processing {'all' if export_all else 'first 10'} tiles ({num_tiles_to_process} total)...")
    
    for i in range(num_tiles_to_process):
        # Progress reporting
        if export_all and i % 10 == 0:
            print(f"Processing tile {i}/{total_tiles}")
        elif not export_all:
            print(f"\nProcessing tile {i}...")
        
        # Get this grid tile geometry
        this_grid = ee.Feature(grid_list.get(i)).geometry()
        
        # Filter glaciers within this tile
        tile_glaciers = glims.filterBounds(this_grid)
        glacier_count = tile_glaciers.size().getInfo()
        
        if glacier_count == 0:
            if not export_all:
                print(f"  No glaciers in tile {i}, skipping")
            continue
            
        if not export_all:
            print(f"  Found {glacier_count} glaciers in tile {i}")
        
        # Create buffered glacier outlines
        def buffer_glacier_geom(ft):
            glacier = ee.Feature(ft).geometry()
            return buffer_equal(glacier)
        
        glacier_outlines = ee.FeatureCollection(tile_glaciers.map(buffer_glacier_geom))
        glacier_outline = glacier_outlines.union(100).geometry()
        
        # Set up MODIS data
        date1 = '2024-01-01'
        date2 = '2024-12-30'
        
        modis_refl = (ee.ImageCollection('MODIS/061/MOD09GQ')
                     .filterDate(ee.Date(date1), ee.Date(date2))
                     .filter(ee.Filter.dayOfYear(152, 156))  # June-September
                     .filterBounds(glacier_outline)
                     .select(['sur_refl_b02'])
                     .map(lambda image: image.divide(10000)))
        
        # Create glacier intersection mask
        modis_area = modis_refl.first().select('sur_refl_b02')
        # modis_grid = glacier_outline.coveringGrid(modis_area.projection())
        
        # def add_intersection_value(f):
        #     return f.set('glacier_area', f.intersection(glacier_outline, 100).area(100))
        
        # # Select pixels covering at least 65% of the glacier: this code is too heavy for whole of CA
        # output = modis_grid.map(add_intersection_value)
        # min_area = ee.Number(0.65).multiply(
        #     ee.Number(output.sort('glacier_area', False).aggregate_array("glacier_area").get(0))
        # )
        # glacier_intersection = output.filter(ee.Filter.gte("glacier_area", min_area)).union(ee.ErrorMargin(100))
        
        # Convert to image: select pixels with a majority of (buffered) glacier coverage (i.e., mode of 1)
        glacier_intersection_fc = glacier_outlines.map(lambda ft: ee.Feature(ft).set('constant', 1))
        glacier_intersection_img = glacier_intersection_fc.reduceToImage(['constant'], ee.Reducer.first())\
            .setDefaultProjection(ee.Projection('EPSG:4326').atScale(30))\
            .reduceResolution(ee.Reducer.mode(),False,256)\
            .reproject(modis_area.projection()).mask().round().selfMask()
        # Export to asset
        task = ee.batch.Export.image.toAsset(
            image=glacier_intersection_img,
            description=f'glacier_intersection_tile_{i}',
            assetId=f'projects/ee-hydro4u/assets/snow_CentralAsia/glacier_mask_collection/glacier_intersection_tile_{i}',
            region=this_grid,
            scale=250,
            maxPixels=1e13
        )
        
        task.start()
        if not export_all:
            print(f"  Export task started for tile {i}: glacier_intersection_tile_{i}")
    
    print(f"\nAll {num_tiles_to_process} export tasks have been started!")
    print("Monitor progress at: https://code.earthengine.google.com/tasks")

if __name__ == "__main__":
    # Run main function for testing (processes first 10 tiles)
    main(export_all=False)
    
    # Uncomment below to export all tiles after testing
    # main(export_all=True)