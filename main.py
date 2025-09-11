# main.py

import ee
import geemap
import datetime
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt

# Initialize Earth Engine
ee.Initialize()

# ---------------------------------------------
# Parameters
# ---------------------------------------------

# Define your area of interest (AOI)
aoi = ee.Geometry.Polygon([
    [[70.0, 40.0], [70.0, 42.0], [75.0, 42.0], [75.0, 40.0], [70.0, 40.0]]
])

# Date range
start_date = '2001-01-01'
end_date = '2001-12-31'

# MODIS snow cover collections
modis_terra = ee.ImageCollection("MODIS/061/MOD10A1").filterBounds(aoi).filterDate(start_date, end_date)
modis_aqua = ee.ImageCollection("MODIS/061/MYD10A1").filterBounds(aoi).filterDate(start_date, end_date)

# Load DEM (ALOS)
dem = ee.ImageCollection("JAXA/ALOS/AW3D30/V3_2").select("DSM").mosaic()

# ---------------------------------------------
# Example function: fill MODIS gaps using AQUA
# ---------------------------------------------

def fill_modis_with_aqua(terra_img):
    date = terra_img.date()
    aqua_img = modis_aqua.filterDate(date, date.advance(1, 'day')).first()
    aqua_ndsi = ee.Image(ee.Algorithms.If(aqua_img, ee.Image(aqua_img).select('NDSI_Snow_Cover'), ee.Image.constant(0)))
    
    terra_ndsi = terra_img.select('NDSI_Snow_Cover')
    terra_class = terra_img.select('NDSI_Snow_Cover_Class')

    filled = terra_ndsi.where(terra_class.gte(200), aqua_ndsi).divide(100)
    return filled.set('system:time_start', terra_img.get('system:time_start'))

# ---------------------------------------------
# Apply the gap-filling function
# ---------------------------------------------

filled_modis = modis_terra.map(fill_modis_with_aqua)

# ---------------------------------------------
# Example visualization on map
# ---------------------------------------------

# Map (requires running in notebook or exporting tiles)
# Uncomment if running in Jupyter or using geemap interactive map:
# Map = geemap.Map()
# Map.addLayer(filled_modis.first(), {'min': 0, 'max': 1, 'palette': ['white', 'blue']}, 'Filled Snow Cover')
# Map.addLayer(dem, {'min': 0, 'max': 5000}, 'DEM')
# Map.centerObject(aoi, 7)
# Map

# ---------------------------------------------
# Print example
# ---------------------------------------------

print('Number of filled MODIS scenes:', filled_modis.size().getInfo())
