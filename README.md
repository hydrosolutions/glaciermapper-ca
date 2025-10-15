# GlacierMapper-CA: Central Asia Glacier Monitoring

A comprehensive toolkit for analyzing snow cover data in glacierized basins of Central Asia, featuring an interactive web application for real-time glacier monitoring and Python tools for advanced data processing.

## 🌐 Interactive Web Application

**[GlacierMapper-CA](https://hydrosolutions.users.earthengine.app/view/glaciermapper-ca)** - Access pre-processed snow metrics online

The GlacierMapper-CA Google Earth Engine application provides intuitive access to snow cover data across Central Asian glacierized catchments without requiring any coding knowledge.

### User Interaction Features:
- **🗺️ Basin Selection**: Select any basin to visualize comprehensive snow metrics at the catchment level
- **🏔️ Live Glacier Information**: Click on glacier polygons to display real-time glacier statistics and trends
- **📅 Temporal Navigation**: Use the date slider to browse through decadal snow cover fraction (SCF) composites from 2001 to present
- **📊 Interactive Visualizations**: View time series plots, elevation profiles, and aspect-specific analysis

### Key Capabilities:
- Real-time snow cover fraction mapping
- Snowline altitude tracking by terrain aspect
- Glacier-specific snow metrics
- Historical trend analysis (2001-2024)
- Multi-temporal composite visualization

The source code for the web application is available in this repository (`notebooks/CA_glaciermapper.js`).

## 🛠️ Development Tools & Project Structure

Beyond the web application, this repository contains the complete toolkit for snow cover analysis and data processing:

```
glaciermapper-ca/
├── main.py                    # Main application entry point
├── data/                      # Processed data files
│   ├── fsc_sla_timeseries_gapfilled.csv  # Gap-filled snow metrics
│   ├── fsc_sla_timeseries.csv            # Raw time series data
│   └── meanNIR_TS_allBasins.csv          # NIR reflectance data
├── notebooks/                 # Analysis tools
│   ├── CA_glaciermapper.js               # Web application source code
│   └── Snowcover Analysis.ipynb          # Jupyter notebook for analysis
└── src/                       # Python processing modules
    ├── dem_processing.py      # Digital elevation model processing
    ├── glacier_mask_tiles.py  # Glacier mask generation and tiling
    ├── modis_processing.py    # MODIS data processing (500m & 250m)
    └── snowline.py            # Snowline detection algorithms
```

## Features

- **MODIS satellite data processing**
  - MODIS 500m snow cover fraction data processing
  - MODIS 250m reflectance data (NIR) processing
  - Decadal composite generation and gap-filling
  - Cloud masking and quality assessment

- **Glacier monitoring capabilities**
  - Glacier mask generation using buffered glacier outlines
  - NIR time series extraction over glacierized areas
  - Glacier fractional snow cover calculation
  - Snow cover analysis below snowline elevation

- **Digital elevation model (DEM) analysis**
  - DEM reprojection and terrain aspect classification
  - Elevation-based snow cover analysis
  - Aspect-specific snowline altitude estimation

- **Snowline detection and mapping**
  - Automated snowline elevation detection by terrain aspect
  - Canny edge detection for snowline identification
  - Multi-aspect snowline analysis (East, North, South, West)

- **Time series analysis**
  - Gap-filled time series generation
  - Decadal temporal resolution processing
  - Multi-basin batch processing capabilities

- **Interactive analysis**
  - Jupyter notebooks for data exploration
  - Google Earth Engine integration
  - Automated data export to cloud assets

## 🚀 Quick Start

### Option 1: Use the Web Application (Recommended)
Simply visit **[GlacierMapper-CA](https://hydrosolutions.users.earthengine.app/view/glaciermapper-ca)** in your web browser - no installation required!

### Option 2: Local Development Setup

1. Clone this repository:
```bash
git clone https://github.com/hydrosolutions/glaciermapper-ca.git
cd glaciermapper-ca
```

2. Install required dependencies:
```bash
pip install -r requirements.txt
```

3. Set up Google Earth Engine authentication:
```bash
earthengine authenticate
```

## Usage

### Web Application
Visit the [GlacierMapper-CA app](https://hydrosolutions.users.earthengine.app/view/glaciermapper-ca) and:
1. Select a basin from the dropdown menu
2. Explore glacier polygons by clicking on them
3. Use the date slider to view temporal changes
4. Analyze snow cover trends and patterns

### Local Analysis
Run the main analysis:
```bash
python main.py
```

For interactive analysis, open the Jupyter notebook:
```bash
jupyter notebook notebooks/Snowcover\ Analysis.ipynb
```

## Data

The project processes and generates several types of data:

- **Fractional Snow Cover (FSC) and Snow Line Altitude (SLA) time series**
  - Gap-filled decadal time series from 2001-2024
  - Aspect-specific snowline elevations (East, North, South, West)
  - Glacier fractional snow cover metrics

- **NIR reflectance time series**
  - MODIS 250m Near-Infrared reflectance over glacierized areas
  - Cloud cover fraction metrics
  - Decadal temporal resolution

- **Glacier masks**
  - Buffered glacier outlines for accurate area calculations
  - Tiled glacier masks for efficient processing

## Key Modules

### `src/modis_processing.py`
- MODIS data loading and preprocessing
- Support for both Terra and Aqua satellites
- 500m and 250m resolution data processing
- Gap-filling algorithms and composite generation

### `src/glacier_mask_tiles.py`
- Glacier mask generation using GLIMS database
- Buffer application for glacier outline processing
- Tiled processing for large-scale analysis

### `src/snowline.py`
- Snowline elevation detection algorithms
- Glacier metrics calculation
- Aspect-specific analysis

### `src/dem_processing.py`
- Digital elevation model preprocessing
- Terrain aspect classification
- Elevation band analysis

## 🌐 Web Application Architecture

The **GlacierMapper-CA** Google Earth Engine application (`notebooks/CA_glaciermapper.js`) provides:

- **Interactive Basin Explorer**: Dynamic basin selection with real-time data loading
- **Glacier Information Panel**: Detailed glacier metrics including area, elevation range, and snow cover statistics
- **Temporal Slider**: Seamless navigation through 20+ years of satellite data
- **Multi-layer Visualization**: Simultaneous display of glacier outlines, snow cover, and terrain data
- **Real-time Processing**: On-demand calculation of snow metrics using Google Earth Engine's cloud computing

The application leverages pre-processed MODIS data assets hosted on Google Earth Engine, enabling fast and responsive user interactions without local data downloads.

## 📊 Data Products

The toolkit generates standardized data products used by the web application:

- **Decadal Snow Cover Composites**: 10-day temporal resolution from 2001-present
- **Snowline Altitude Time Series**: Aspect-specific elevation tracking
- **Glacier Snow Metrics**: Area-weighted statistics for each glacier polygon
- **Quality Assessment Layers**: Cloud cover and data availability metrics

## Contributing

We welcome contributions! Please feel free to submit issues, enhancement requests, or pull requests.

## Citation

If you use GlacierMapper-CA in your research, please cite:
```
[Citation information to be added]
```

## License

This project is licensed under the MIT License - see the LICENSE file for details.
