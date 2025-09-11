import ee

def load_dem():
    """
    Load and mosaic ALOS DSM elevation data.
    """
    dem = ee.ImageCollection("JAXA/ALOS/AW3D30/V4_1").select("DSM")
    dem = dem.mosaic().setDefaultProjection(dem.first().select(0).projection())
    return dem

def classify_aspect(dem, modis_projection, scale):
    """
    Compute terrain aspect and classify into four directions: North, East, South, West.
    Returns an image with 4 binary bands plus a coded aspect band.
    """
    aspect = ee.Terrain.aspect(dem)

    north = aspect.gt(315).Or(aspect.lte(45)).rename('North')
    east  = aspect.gt(45).And(aspect.lte(135)).rename('East')
    south = aspect.gt(135).And(aspect.lte(225)).rename('South')
    west  = aspect.gt(225).And(aspect.lte(315)).rename('West')

    aspects = north.addBands(east).addBands(south).addBands(west) \
        .reduceResolution(
            reducer=ee.Reducer.mode(),
            maxPixels=1024
        ).reproject(
            crs=modis_projection,
            scale=scale
        )

    aspect_coded = ee.Image(5).setDefaultProjection(aspects.select(0).projection()) \
        .where(aspects.select('North').eq(1), 2) \
        .where(aspects.select('East').eq(1), 1) \
        .where(aspects.select('South').eq(1), 3) \
        .where(aspects.select('West').eq(1), 4) \
        .rename('mixed')

    aspects = aspects.addBands(aspect_coded.eq(5).rename('mixed'))

    return aspects, aspect_coded


def reproject_and_analyze_dem(dem, modis_projection, aoi, scale_dem, tile_scale, aspect_keys):
    """
    Reproject DEM to MODIS projection and compute min/max elevation values.
    
    Args:
        dem: Digital Elevation Model as Earth Engine Image
        modis_projection: Projection object from MODIS imagery
        aoi: Area of interest as Earth Engine Geometry
        scale_dem: Scale for DEM processing in meters
        tile_scale: Tile scale parameter for Earth Engine processing
        aspect_keys: List of aspect categories
        
    Returns:
        tuple: (reprojected_dem, min_dem_dict, max_dem_dict)
    """
    # Reproject the DEM to the MODIS projection with the MODIS scale
    reprojected_dem = dem.reduceResolution(
        reducer=ee.Reducer.mean(),
        maxPixels=1024
    ).reproject(
        crs=modis_projection,
        scale=scale_dem
    )
    
    # Get minimum DEM value in the AOI
    min_dem_value = reprojected_dem.reduceRegion(
        reducer=ee.Reducer.min(),
        geometry=aoi,
        scale=scale_dem,
        tileScale=tile_scale,
        maxPixels=1e13
    ).get(reprojected_dem.bandNames().get(0))
    
    # Build dictionary: each aspect key gets the same minimum value
    min_dem_dict = ee.Dictionary.fromLists(aspect_keys, ee.List.repeat(min_dem_value, len(aspect_keys)))
    
    # Get maximum DEM value in the AOI
    max_dem_value = reprojected_dem.reduceRegion(
        reducer=ee.Reducer.max(),
        geometry=aoi,
        scale=scale_dem,
        tileScale=tile_scale,
        maxPixels=1e13
    ).get(reprojected_dem.bandNames().get(0))
    
    # Build dictionary: each aspect key gets the same maximum value
    max_dem_dict = ee.Dictionary.fromLists(aspect_keys, ee.List.repeat(max_dem_value, len(aspect_keys)))
    
    #count number of grid cells
    n_grid=reprojected_dem.reduceRegion(
        reducer= 'count',
        geometry= aoi,
        scale= scale_dem,
        tileScale= tile_scale,
        maxPixels= 1e13,
    ).values().get(0)
    return reprojected_dem, min_dem_dict, max_dem_dict,n_grid