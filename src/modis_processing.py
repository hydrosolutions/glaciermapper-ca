import ee

# functions to load and process MODIS 500 m data: 
# - MOD10A1.061 Terra Snow Cover Daily Global 500m for NDSI snow cover
# - MYD10A1.061 Aqua Snow Cover Daily Global 500m for NDSI snow cover
# Functions to load and process MODIS 250m data ('_250' suffix):
# - MOD09GQ.061 Terra Surface Reflectance Daily Global 250m for band 2 (sur_refl_b02)
# - MYD09GQ.061 Aqua Surface Reflectance Daily Global 250m for band 2 (sur_refl_b02)

def load_modis(aoi):
    """
    Load MODIS Terra and Aqua image collections filtered by AOI and date.
    """
    terra = ee.ImageCollection("MODIS/061/MOD10A1") \
        .filterBounds(aoi) #\
        # .filterDate(start_date, end_date)

    return terra

def load_modis_250(aoi):
    """
    Load MODIS Terra and Aqua image collections filtered by AOI and date.
    """
    terra = ee.ImageCollection("MODIS/061/MOD09GQ") \
        .filterBounds(aoi) #\
        # .filterDate(start_date, end_date)

    return terra

def fill_modis_with_aqua(terra_img):
    """
    Fill gaps in MODIS Terra NDSI snow cover using Aqua image of the same day.
    """
    date = terra_img.date()

    aqua_col = ee.ImageCollection("MODIS/061/MYD10A1") \
        .filterDate(terra_img.date(),terra_img.date().advance(1, 'day'))
    
    aqua_ndsi = ee.Image(ee.Algorithms.If(
        aqua_col.size().gt(0),
        ee.Image(aqua_col.first()).select('NDSI_Snow_Cover'),
        ee.Image.constant(0).rename('NDSI_Snow_Cover')
    ))

    terra_ndsi = terra_img.select('NDSI_Snow_Cover')
    terra_class = terra_img.select('NDSI_Snow_Cover_Class')

    filled = terra_ndsi.where(terra_class.gte(200), aqua_ndsi)
    return filled.set('system:time_start', terra_img.get('system:time_start'))

def fill_modis_with_aqua_250(terra_img,aoi,glacier_mask):
    """
    Fill gaps in MODIS Terra NDSI snow cover using Aqua image of the same day.
    """
    date = terra_img.date()

    aqua_col = ee.ImageCollection("MODIS/061/MYD09GQ") \
        .filterDate(terra_img.date(),terra_img.date().advance(1, 'day'))
    

    terra_reflectance = terra_img.select('sur_refl_b02')
    
    def get_qa_bits(image, start, end, new_name):
        """
        Extract QA bits from a quality band.
        
        Args:
            image: Input image
            start: Start bit position
            end: End bit position
            new_name: Name for the output band
            
        Returns:
            Image with extracted QA bits
        """
        pattern = 0
        for i in range(start, end + 1):
            pattern += 2 ** i
        
        return (image.select([0], [new_name])
                .bitwiseAnd(pattern)
                .rightShift(start))

    """
    Create cloud mask using MODIS MOD09GA state_1km band.
    
    Args:
        terra_img: MODIS Terra image
        
    Returns:
        Cloud mask image
    """

    modis_cloud = (ee.ImageCollection('MODIS/061/MOD09GA')
                .filterDate(terra_img.date(), terra_img.date().advance(1, 'day'))
                .filterBounds(aoi)
                .first())
    
    # Mask cloudy pixels with state_1km, leave pixels marked clear, mixed and undecided
    cloud = get_qa_bits(modis_cloud.select('state_1km'), 0, 1, 'Clouds').expression("b(0) == 1")
    cloud_mask = cloud.unmask(0).eq(1)

    myd_cloud = (ee.ImageCollection('MODIS/061/MYD09GA')
                .filterDate(terra_img.date(), terra_img.date().advance(1, 'day'))
                .filterBounds(aoi)
                .first())    
    
    # modis_cloud = (ee.ImageCollection('MODIS/061/MOD09GQ')
    #             .filterDate(terra_img.date(), terra_img.date().advance(1, 'day'))
    #             .filterBounds(aoi)
    #             .first()).select('QC_250m')

    # myd_cloud = (ee.ImageCollection('MODIS/061/MYD09GQ')
    #             .filterDate(terra_img.date(), terra_img.date().advance(1, 'day'))
    #             .filterBounds(aoi)
    #             .first()).select('QC_250m')
        
    # # Mask cloudy pixels with QC_250m
    # cloud_state = get_qa_bits(modis_cloud, 2, 3, 'cloud_state')
    # cloud_shadow = get_qa_bits(modis_cloud, 4, 4, 'cloud_shadow')
    # cloud = cloud_state.eq(1).Or(cloud_shadow.eq(1))
    # cloud_mask = cloud.unmask(-9999).eq(1)

    # Calculate cloud cover over glacier area
    cc_fraction = cloud_mask.updateMask(glacier_mask).reduceRegion(
        reducer=ee.Reducer.mean(),
        geometry=aoi,
        scale=250,
        maxPixels=1e13,
        tileScale=1
    ).values()

    # Extract cloud information from Aqua QA band and mask properly
    aqua_cloud_mask = ee.Image(ee.Algorithms.If(
        aqua_col.size().gt(0),
        ee.Image(ee.Algorithms.If(
            myd_cloud.bandNames().size().gt(0),
            get_qa_bits(myd_cloud.select('state_1km'), 0, 1, 'Clouds').expression("b(0) == 1").unmask(0).eq(1),
            # get_qa_bits(myd_cloud, 2, 3, 'cloud_state').eq(1).Or(get_qa_bits(myd_cloud, 4, 4, 'cloud_shadow').eq(1)),
            ee.Image.constant(1).rename('cloud_mask')  # Assume cloudy if no QA data
        )),
        ee.Image.constant(1).rename('cloud_mask')  # No Aqua data available
    ))
    
    aqua_reflectance = ee.Image(ee.Algorithms.If(
        aqua_col.size().gt(0),
        ee.Image(aqua_col.first()).select('sur_refl_b02').updateMask(aqua_cloud_mask.Not()),
        ee.Image().rename('sur_refl_b02')
    ))

    # Calculate cloud cover over glacier area
    cc_fraction2 = aqua_reflectance.blend(terra_reflectance.updateMask(cloud_mask.neq(1))).mask().Not().updateMask(glacier_mask).reduceRegion(
        reducer=ee.Reducer.mean(),
        geometry=aoi,
        scale=250,
        maxPixels=1e13,
        tileScale=1
    ).values()

    # cloud = get_qa_bits(myd_cloud.select('state_1km'), 0, 1, 'Clouds').expression("b(0) == 1")
    # cloud_mask_myd = myd_cloud.select('sur_refl_b02').updateMask(cloud).unmask(-9999).gte(0)

    filled = aqua_reflectance.blend(terra_reflectance.updateMask(cloud_mask.neq(1))).divide(10000)##10000 is the scale factor for MOD09GQ
    return filled.set('system:time_start', terra_img.get('system:time_start')) \
        .set('cc_fraction', cc_fraction.get(0)) \
        .set('cc_fraction2', cc_fraction2.get(0))
        # .addBands(terra_reflectance.where(cloud_mask.eq(1), aqua_ndsi).mask().rename('cloud_mask')) \

def modis_cloud_masking_250(terra_img, aoi):
    """
    Fill gaps in MODIS Terra NDSI snow cover using Aqua image of the same day.
    """
    date = terra_img.date()

    terra_reflectance = terra_img.select('sur_refl_b02')

    def get_qa_bits(image, start, end, new_name):
        """
        Extract QA bits from a quality band.
        
        Args:
            image: Input image
            start: Start bit position
            end: End bit position
            new_name: Name for the output band
            
        Returns:
            Image with extracted QA bits
        """
        pattern = 0
        for i in range(start, end + 1):
            pattern += 2 ** i
        
        return (image.select([0], [new_name])
                .bitwiseAnd(pattern)
                .rightShift(start))

    """
    Create cloud mask using MODIS MOD09GA state_1km band.
    
    Args:
        terra_img: MODIS Terra image
        
    Returns:
        Cloud mask image
    """
    modis_cloud = (ee.ImageCollection('MODIS/061/MOD09GA')
                .filterDate(terra_img.date(), terra_img.date().advance(1, 'day'))
                .filterBounds(aoi)
                .first())
    
    # Mask cloudy pixels with state_1km, leave pixels marked clear, mixed and undecided
    cloud = get_qa_bits(modis_cloud.select('state_1km'), 0, 1, 'Clouds').expression("b(0) == 1")
    cloud_mask = modis_cloud.select('sur_refl_b02').updateMask(cloud).unmask(-9999).gte(0)
        
    masked = terra_reflectance.updateMask(cloud_mask.neq(1)).divide(10000)##10000 is the scale factor for MOD09GQ
    return masked.set('system:time_start', terra_img.get('system:time_start'))

def add_date_bands(img):
    """
    Add year, month, day, and DOY as metadata properties to an image.
    """
    date = img.date()
    return img.set({
        'year': date.get('year'),
        'month': date.get('month'),
        'day': date.get('day'),
        'doy': date.getRelative('day', 'year')
    })
# ...existing code...

def extract_time_ranges(start_date, end_date, agg_interval: int) -> ee.List:
    """
    Extract time intervals for generating temporal composites.

    Args:
        time_range (List[str]): Start and end dates in 'YYYY-MM-DD' format.
        agg_interval (int): Number of days for each interval.

    Returns:
        ee.List: List of time intervals. Each interval is an ee.List with [start_date, end_date].
    """

    interval_no = (
        ee.Date(end_date)
        .difference(ee.Date(start_date), "day")
        .divide(agg_interval)
        .round()
    )
    month_check = ee.Number(30).divide(agg_interval).ceil()
    rel_delta = (
        ee.Number(end_date.difference(start_date, "day"))
        .divide(ee.Number(30.5).multiply(interval_no))
        .ceil()
    )

    end_date = start_date.advance(
        start_date.advance(rel_delta, "month")
        .difference(start_date, "day")
        .divide(month_check),
        "day",
    )

    time_intervals = ee.List([ee.List([start_date, end_date])])

    def add_interval(x, previous):
        x = ee.Number(x)
        start_date1 = ee.Date(
            ee.List(ee.List(previous).reverse().get(0)).get(1)
        )  # end_date of last element
        end_date1 = start_date1.advance(
            start_date1.advance(rel_delta, "month")
            .difference(start_date1, "day")
            .divide(month_check),
            "day",
        )
        return ee.List(previous).add(ee.List([start_date1, end_date1]))

    time_intervals = ee.List(
        ee.List.sequence(2, interval_no).iterate(add_interval, time_intervals)
    )

    return time_intervals


def extract_year_ranges(year_range, agg_interval):
    """
    Generate a list of time intervals for creating temporal composites.

    Args:
        year_range: List of years to process
        agg_interval: Aggregation interval in days (e.g., 10 for decadal)

    Returns:
        ee.List: List of time intervals for all years
    """
    def iterate_years(y, prev):
        y = ee.Number(y)
        start_date = ee.Date.fromYMD(y, 1, 1)
        end_date = ee.Date.fromYMD(y, 12, 31)
        time_intervals = extract_time_ranges(start_date, end_date, agg_interval)
        return ee.List(prev).add(time_intervals)

    intervals_per_year = ee.List(ee.List(year_range).iterate(iterate_years, ee.List([])))
    return intervals_per_year

# Create composites for each interval
def process_interval(mscf,date_range):
    date_range= ee.List(date_range)
    start = ee.Date(date_range.get(0))
    end = ee.Date(date_range.get(1))
    year = start.get('year')
    month = start.get('month')
    day = start.get('day')

    def interpolate(img):
        date = ee.Date(img.get('system:time_start'))

        # Look forward and backward ±5 days to find nearest images
        mscf_fwd = mscf.filterDate(date, end.advance(5, 'day')).sort('system:time_start')
        mscf_bwd = mscf.filterDate(start.advance(-5, 'day'), date.advance(0.1, 'day')).sort('system:time_start', False)

        mscf_fwd_nonnull = mscf_fwd.reduce(ee.Reducer.firstNonNull())
        mscf_bwd_nonnull = mscf_bwd.reduce(ee.Reducer.firstNonNull())

        imgs4avg = ee.ImageCollection([mscf_fwd_nonnull, mscf_bwd_nonnull])
        mean_img = imgs4avg.mean().updateMask(imgs4avg.count().eq(2))  # Require both sides for interpolation

        return mean_img
    
    # Interpolate over the month
    mscf_month = mscf.filterDate(start, end)
    # mscf_interpolated = mscf_month.map(interpolate)
    # img2return = mscf_interpolated.mean().rename('value')
    # Simple mean composite without the complex interpolation
    img2return = mscf_month.mean().rename('value')

    # Smooth and blend for filling gaps
    img2return = img2return.focal_mean(radius=2, kernelType='circle', units='pixels', iterations=1).blend(img2return)

    # Set image metadata
    return img2return.set({
        'system:time_start': ee.Date.fromYMD(year, month, day).millis(),
        'Year-Month-Day': start.format('YYYY-MM-dd')
    })


# Create composites for each interval
def process_interval_250(mscf,date_range):
    date_range= ee.List(date_range)
    start = ee.Date(date_range.get(0))
    end = ee.Date(date_range.get(1))
    year = start.get('year')
    month = start.get('month')
    day = start.get('day')

    mscf_month = mscf.filterDate(start, end)
    # Simple mean composite without the complex interpolation
    img2return = mscf_month.mean().rename('value')

    # Set image metadata
    return img2return.set({
        'system:time_start': ee.Date.fromYMD(year, month, day).millis(),
        'Year-Month-Day': start.format('YYYY-MM-dd'),
    })

def process_interval_250_with_with_cc_info(mscf,date_range):
    date_range= ee.List(date_range)
    start = ee.Date(date_range.get(0))
    end = ee.Date(date_range.get(1))
    year = start.get('year')
    month = start.get('month')
    day = start.get('day')

    mscf_month = mscf.filterDate(start, end)
    # Simple mean composite without the complex interpolation
    img2return = mscf_month.mean().rename('value')

    # Set image metadata
    return img2return.set({
        'system:time_start': ee.Date.fromYMD(year, month, day).millis(),
        'Year-Month-Day': start.format('YYYY-MM-dd'),
        'cc_fraction': mscf_month.aggregate_mean('cc_fraction'),
        'cc_fraction2': mscf_month.aggregate_mean('cc_fraction2')
    })

def create_decadal_composites(aoi, start_year, end_year, agg_interval=10):
    """
    Create decadal (or other interval) composites from MODIS snow cover data.
    
    Args:
        aoi: Area of interest as an ee.Geometry
        start_year: Starting year for processing
        end_year: Ending year for processing
        agg_interval: Aggregation interval in days (default: 10 for decadal)
        
    Returns:
        An ee.ImageCollection of composites
    """
    # Generate time intervals
    year_range = ee.List.sequence(start_year, end_year)
    # First get all intervals and flatten the list
    time_intervals_all = ee.List(extract_year_ranges(year_range, agg_interval)
        .iterate(lambda list, previous: ee.List(previous).cat(ee.List(list)), ee.List([])))
    
    # Load all MODIS data for the entire time span
    start_date = ee.Date.fromYMD(start_year, 1, 1)
    end_date = ee.Date.fromYMD(end_year, 12, 31)
    terra_coll = load_modis(aoi)#start_date, end_date
    
    # Create filled MODIS snow cover fraction collection
    mscf = terra_coll.map(lambda img: fill_modis_with_aqua(img))
    
    # time_intervals_all should be an ee.List of [start, end] ee.Date pairs
    modis_ic = ee.ImageCollection(time_intervals_all.map(lambda list:process_interval(mscf, list)))
        
    # Tag images with band count and filter out empty images
    tagged = modis_ic.map(lambda img: img.set('band_count', img.bandNames().size()))
    modis_ic = tagged.filter(ee.Filter.gt('band_count', 0))
    
    return modis_ic

def create_decadal_composites_250(aoi, start_year, end_year, agg_interval=10, glacier_mask=None):
    """
    Create decadal (or other interval) composites from MODIS reflectance data.
    Two option to fill gaps: 1) with Aqua data, 2) with cloud masking only.
    We are currently using option 2, because it is more lightweight and gives similar results.
    
    Args:
        aoi: Area of interest as an ee.Geometry
        start_year: Starting year for processing
        end_year: Ending year for processing
        agg_interval: Aggregation interval in days (default: 10 for decadal)
        
    Returns:
        An ee.ImageCollection of composites
    """
    # Generate time intervals
    year_range = ee.List.sequence(start_year, end_year)
    # First get all intervals and flatten the list
    time_intervals_all = ee.List(extract_year_ranges(year_range, agg_interval)
        .iterate(lambda list, previous: ee.List(previous).cat(ee.List(list)), ee.List([])))
    
    # Load all MODIS data for the entire time span
    start_date = ee.Date.fromYMD(start_year, 1, 1)
    end_date = ee.Date.fromYMD(end_year, 12, 31)
    terra_coll = load_modis_250(aoi).filterDate(start_date, end_date)
    
    # Create filled MODIS snow cover fraction collection
    mscf = terra_coll.map(lambda img: modis_cloud_masking_250(img,aoi))
    # mscf = terra_coll.map(lambda img: fill_modis_with_aqua_250(img,aoi,glacier_mask))
    
    # time_intervals_all should be an ee.List of [start, end] ee.Date pairs
    modis_ic = ee.ImageCollection(time_intervals_all.map(lambda list:process_interval_250(mscf, list)))
    # modis_ic = ee.ImageCollection(time_intervals_all.map(lambda list:process_interval_250_with_with_cc_info(mscf, list)))
        
    # Tag images with band count and filter out empty images
    tagged = modis_ic.map(lambda img: img.set('band_count', img.bandNames().size()))
    modis_ic = tagged.filter(ee.Filter.gt('band_count', 0))
    
    return modis_ic