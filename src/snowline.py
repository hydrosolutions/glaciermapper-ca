import ee

def get_snowline_elevation(modis_img=None, dem=None, aspect_coded=None, aoi=None, min_dem=None, max_dem=None,n_grid=None, scale=500, scale_dem=500, sc_th=50, canny_threshold=0.7, 
                           canny_sigma=0.7, ppha=10, tile_scale=1, point2sample=1000, aspectKeys=['East', 'North', 'South', 'West', 'mixed']):
    if modis_img is None:
        raise ValueError("The 'modis_img' parameter must be provided.")
    
    """
    Estimate snowline elevation using MODIS imagery, DEM, and aspect information.
    
    Args:
        modis_img: Earth Engine Image with snow cover fraction (0-1)
        dem: Digital Elevation Model as Earth Engine Image
        aoi: Area of interest as Earth Engine Geometry
        scale: Scale for MODIS processing in meters
        scale_dem: Scale for DEM processing in meters
        sc_th: Snow cover threshold for binary classification (0-100)
        canny_threshold: Threshold for Canny edge detector
        canny_sigma: Sigma parameter for Canny edge detector
        ppha: Minimum patch size (in pixels)
        tile_scale: Tile scale parameter for Earth Engine processing
        point2sample: Number of points to sample at snowline
        aspectKeys: List of aspect categories
        
    Returns:
        Dictionary with snowline elevation statistics by aspect
    """
    modis_projection = modis_img.projection()
    
    # -------------------------------------
    # PRE-PROCESSING: CLEAN MASK AND BINARY SNOW IMAGE
    # -------------------------------------
    
    # Clip image edges to avoid edge effects
    mask = modis_img.clip(aoi).mask().gt(0).focal_min(ee.Number(scale).multiply(2), 'circle', 'meters')
    
    # Convert fractional snow cover to binary using threshold
    binary_snow = modis_img.gt(sc_th).rename('value')
    
    # Convert to integer and apply projection
    img0 = binary_snow.rename('classification').int().reproject(crs=modis_projection, scale=scale)
    
    # Count connected pixels in snow clusters
    target_pixels = img0.mask(img0).unmask(0).rename('sieve').connectedPixelCount(ppha + 1, False)
    
    # Filter out small snow patches (sieving step)
    small_clusters = target_pixels.reproject(crs=modis_projection, scale=scale)
    img_sieve = img0.addBands(small_clusters)
    
    # Remove small snow patches by setting them to 0
    img_pos = img_sieve.select('classification').where(img_sieve.select('sieve').lte(ppha), 0)
    
    # Fill small holes inside snow areas
    img0_inv = img_pos.Not().mask(img_pos.Not()).unmask(0)
    target_pixels2 = img0_inv.rename('sieve').connectedPixelCount(ppha + 1, False)
    
    small_clusters2 = target_pixels2.reproject(crs=modis_projection, scale=scale)
    img_sieve2 = img0_inv.addBands(small_clusters2)
    
    # Fill isolated non-snow pixels inside snow with snow (value = 1)
    binary_snow = img_pos.where(img_sieve2.select('sieve').lte(ppha), 1).rename('value').mask(img0.gte(0))
    
    # Match final resolution and projection
    binary_snow = binary_snow.reproject(crs=modis_projection, scale=scale_dem)
    
    # -------------------------------------
    # EDGE DETECTION (SNOWLINE)
    # -------------------------------------
    
    # Use Canny edge detector on binary snow map
    edge = ee.Algorithms.CannyEdgeDetector(binary_snow, canny_threshold, canny_sigma)
    edge = edge.multiply(mask)
    
    # Reproject edge to DEM scale and update with valid mask
    edge_buffer = edge.reproject(crs=modis_projection, scale=scale_dem)
    edge_buffer = edge_buffer.updateMask(mask.eq(1))
    
    # -------------------------------------
    # STRATIFIED SAMPLING TO CHECK VALIDITY
    # -------------------------------------
    
    # Clean mask for stratified sampling
    binary_snow_mask = binary_snow.add(1).clip(aoi).mask().gt(0).focal_min(ee.Number(scale).multiply(2), 'circle', 'meters')
    
    # Get snow/no-snow classes to check if both are present
    stratified_samples = binary_snow.updateMask(binary_snow_mask.gt(0)).stratifiedSample(
        numPoints=1,
        classBand='value',
        region=aoi,
        scale=scale_dem,
        tileScale=tile_scale,
        seed=123,
        geometries=False
    ).aggregate_array('value')
    
    # Get min and max class sampled (0 = no snow, 1 = snow)
    sample_max = ee.Number(stratified_samples.reduce(ee.Reducer.max()))
    sample_min = ee.Number(stratified_samples.reduce(ee.Reducer.min()))
    
    # Default feature with null values for all aspects
    null_object = ee.Feature(ee.Dictionary.fromLists(
        ee.List(aspectKeys), [None, None, None, None, None]
    ))

    # -------------------------------------
    # MAIN ANALYSIS: ELEVATION AT SNOWLINE BY ASPECT
    # -------------------------------------

    # Sample elevation values at snowline edge pixels stratified by aspect class
    sample_points = aspect_coded.addBands(dem).updateMask(edge_buffer.gt(0)).updateMask(aspect_coded.gte(0)).stratifiedSample(
            region=aoi,
            classBand='mixed',  # aspect class codes: 1-East, 2-North, 3-South, 4-West, 5-Unclassified
            numPoints=point2sample,
            tileScale=16,
            scale=scale_dem,
            seed=123,
            geometries=True,
            dropNulls=True
        )

    # Median elevation by aspect
    rr2 = ee.Feature(ee.List.sequence(0, 4).iterate(
        lambda x, previous: ee.Feature(previous).set(
            ee.List(aspectKeys).get(ee.Number(x)),
            sample_points.filter(ee.Filter.eq('mixed', ee.Number(x).add(1)))
                .aggregate_array('DSM').reduce(ee.Reducer.median())
        ),
        ee.Feature(None)
    )).toDictionary()

    # 10th percentile elevation by aspect
    rr1 = ee.Feature(ee.List.sequence(0, 4).iterate(
        lambda x, previous: ee.Feature(previous).set(
            ee.List(aspectKeys).get(ee.Number(x)),
            sample_points.filter(ee.Filter.eq('mixed', ee.Number(x).add(1)))
                .aggregate_array('DSM').reduce(ee.Reducer.percentile([10]))
        ),
        ee.Feature(None)
    )).toDictionary()

    # Count of points per aspect
    rr2_count = ee.Feature(ee.List.sequence(0, 4).iterate(
        lambda x, previous: ee.Feature(previous).set(
            ee.List(aspectKeys).get(ee.Number(x)),
            sample_points.filter(ee.Filter.eq('mixed', ee.Number(x).add(1)))
                .aggregate_array('DSM').reduce(ee.Reducer.count())
        ),
        ee.Feature(None)
    )).toDictionary()

    # -------------------------------------
    # FRACTIONAL SNOW COVER OVER AOI
    # -------------------------------------

    fsc = binary_snow.reduceRegion(
        reducer='mean',
        geometry=aoi,
        scale=scale,
        tileScale=tile_scale,
        maxPixels=1e13
    ).values().get(0)

    # -------------------------------------
    # REPLACEMENT LOGIC FOR MISSING VALUES
    # -------------------------------------

    # If rr2 has null values, replace with mean of valid values
    valid_values = rr2.values().removeAll([None])
    mean_value = ee.Algorithms.If(
        valid_values.size().gt(0),
        valid_values.reduce(ee.Reducer.mean()),
        None
    )

    # Choose fallback DEM elevation based on snow coverage
    replacement_value = ee.Number(ee.Algorithms.If(
        ee.Algorithms.IsEqual(fsc, None), None,
        ee.Algorithms.If(
            ee.Number(fsc).gte(0.9),
            min_dem.values().reduce(ee.Reducer.min()),
            ee.Number(ee.Algorithms.If(
                ee.Number(fsc).lte(0.1),
                max_dem.values().reduce(ee.Reducer.max()),
                rr2.values().reduce(ee.Reducer.mean())
            ))
        )
    ))

    # Use minDEM or maxDEM if only one class exists, else use rr2
    rr2 = ee.Feature(None, ee.Algorithms.If(
        ee.Algorithms.IsEqual(sample_min, None), rr2,
        ee.Algorithms.If(
            sample_min.eq(1), min_dem,
            ee.Algorithms.If(sample_max.eq(0), max_dem, rr2)
        )
    ))

    # Replace individual nulls in rr2 with fallback value (mean or fallback DEM)
    rr2 = ee.Feature(ee.List(aspectKeys).iterate(
        lambda item, previous: ee.Algorithms.If(
            ee.Algorithms.IsEqual(ee.Feature(previous).get(ee.String(item)), None),
            ee.Feature(previous).set(ee.String(item), replacement_value),
            ee.Algorithms.If(
                ee.Number(rr2_count.get(ee.String(item))).lt(10).And(
                    ee.Number(ee.Number(rr2_count.get(ee.String(item)))).divide(n_grid).lt(0.01)
                ),
                ee.Feature(previous).set(ee.String(item), replacement_value),
                ee.Feature(previous)
            )
        ),
        rr2
    ))

    # If all values are missing, use null_object
    rr2 = ee.Feature(ee.Algorithms.If(
        rr2.propertyNames().size().eq(0),
        ee.Feature(None, null_object),
        rr2
    ))

    return rr2,fsc

def calculate_glacier_metrics(glims, aoi, modis_img,sc_th, rr2, dem, aspectKeys, tileScaleValue, aspects):
    """
    Calculate glacier snow cover fraction and area metrics.
    
    Args:
        glims: Earth Engine FeatureCollection of glaciers
        aoi: Area of interest as an Earth Engine Geometry
        modis_img: Input snow cover image
        sc_th: Snow cover threshold for binary classification (0-100)
        rr2: Feature containing aspect-specific elevation thresholds
        dem: Digital Elevation Model as an Earth Engine Image
        aspectKeys: List of aspect categories (e.g., ['North', 'East', 'South', 'West', 'mixed'])
        tileScaleValue: Value for tileScale parameter to handle computation
        aspects: Image with aspect classifications
        
    Returns:
        Dictionary with glacier metrics
    """
    # Convert fractional snow cover to binary using threshold
    binarySnow = modis_img.gt(sc_th).rename('value')

    # Create glacier snow cover fraction image
    glims_scf_image = glims.filterBounds(aoi).reduceToImage(['area'], ee.Reducer.first()) \
                           .gt(0).multiply(binarySnow)
    
    # Iterate through aspect categories to identify areas below snowline
    def process_aspect(item, previous):
        item = ee.String(item)
        threshold = rr2.get(item)
        img = ee.Image(ee.Algorithms.If(
            ee.Algorithms.IsEqual(threshold, None),
            previous,
            ee.Image(previous).where(
                dem.gt(ee.Number(threshold)).And(aspects.select(item).eq(1)),
                -1
            )
        ))
        return img.updateMask(img.neq(-1))
    
    glims_scf_below_sl_img = ee.Image(ee.List(aspectKeys).iterate(process_aspect, glims_scf_image))
    
    # Calculate area below snowline in square kilometers
    glims_area_below_SL_img = glims_scf_below_sl_img.gte(0).multiply(ee.Image.pixelArea()).multiply(1e-6)
    
    # Calculate glacier snow cover fraction
    glims_fsc = glims_scf_image.reduceRegion(
        reducer=ee.Reducer.mean(),
        geometry=aoi,
        scale=30,
        tileScale=tileScaleValue,
        maxPixels=1e13
    ).values().get(0)
    
    # Calculate glacier snow cover fraction below snowline
    glims_fsc_below_sl = glims_scf_below_sl_img.reduceRegion(
        reducer=ee.Reducer.mean(),
        geometry=aoi,
        scale=30,
        tileScale=tileScaleValue,
        maxPixels=1e13
    ).values().get(0)
    
    # If North aspect threshold is null, set below snowline metrics to null
    glims_fsc_below_sl = ee.Number(ee.Algorithms.If(
        ee.Algorithms.IsEqual(rr2.get('North'), None),
        None,
        glims_fsc_below_sl
    ))
    
    # Calculate glacier area below snowline
    glims_area_below_sl = glims_area_below_SL_img.reduceRegion(
        reducer=ee.Reducer.sum(),
        geometry=aoi,
        scale=30,
        tileScale=tileScaleValue,
        maxPixels=1e13
    ).values().get(0)
    
    # If North aspect threshold is null, set area below snowline to null
    glims_area_below_sl = ee.Number(ee.Algorithms.If(
        ee.Algorithms.IsEqual(rr2.get('North'), None),
        None,
        glims_area_below_sl
    ))
    
    # Return results as a dictionary
    return {
        'glims_fsc': glims_fsc,
        'glims_fsc_below_sl': glims_fsc_below_sl,
        'glims_area_below_sl': glims_area_below_sl,
    }