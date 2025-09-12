# Snowcover Mapper

A Python project for analyzing snow cover data and mapping snowlines using MODIS satellite data and digital elevation models.

## Project Structure

```
snowcover-mapper/
├── main.py                 # Main application entry point
├── data/                   # Data files
│   ├── fsc_sla_timeseries_gapfilled.csv
│   ├── fsc_sla_timeseries.csv
│   └── fsc_sla_TS_batch4.csv
├── notebooks/              # Jupyter notebooks for analysis
│   └── Snowcover Analysis.ipynb
└── src/                    # Source code modules
    ├── dem_processing.py   # Digital elevation model processing
    ├── modis_processing.py # MODIS data processing
    └── snowline.py         # Snowline detection algorithms
```

## Features

- MODIS satellite data processing
- Digital elevation model (DEM) analysis
- Snowline detection and mapping
- Time series analysis of snow cover
- Interactive data analysis through Jupyter notebooks

## Installation

1. Clone this repository:
```bash
git clone https://github.com/yourusername/snowcover-mapper.git
cd snowcover-mapper
```

2. Install required dependencies:
```bash
pip install -r requirements.txt
```

## Usage

Run the main analysis:
```bash
python main.py
```

For interactive analysis, open the Jupyter notebook:
```bash
jupyter notebook notebooks/Snowcover\ Analysis.ipynb
```

## Data

The project includes time series data of fractional snow cover (FSC) and snow line altitude (SLA) data.

## Contributing

Feel free to submit issues and enhancement requests!

## License

This project is licensed under the MIT License - see the LICENSE file for details.