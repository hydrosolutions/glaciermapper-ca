# GitHub Actions Files for GlacierMapper-CA

This folder contains all files required for the automated GitHub Actions workflow that runs the GlacierMapper-CA export process.

## Files

### Core Scripts
- **`run_export.py`** - Main export script that processes MODIS data and calculates snowline elevations
- **`test_validate.py`** - Validates environment setup, dependencies, and service account configuration
- **`test_mode.py`** - Safe test mode simulation that shows what would be processed without running the full export

### Documentation
- **`GITHUB_SETUP.md`** - Step-by-step guide for setting up the `GEE_SERVICE_ACCOUNT_KEY` GitHub secret
- **`PERMISSIONS.md`** - Detailed instructions for configuring Google Earth Engine permissions

## Workflow Schedule

The workflow runs **semi-annually**:
- **January 1st** at 02:00 UTC - Processes July-December of previous year
- **July 1st** at 02:00 UTC - Processes January-June of current year

## Workflow Location

The actual GitHub Actions workflow is at:
```
.github/workflows/semiannual-export.yml
```

## Manual Testing

You can test the components locally:

```bash
# Test environment validation
python Github_Actions/test_validate.py

# Test the export simulation
python Github_Actions/test_mode.py
```

## GitHub Actions Usage

1. **Automatic runs**: The workflow runs automatically every 6 months
2. **Manual testing**: Go to Actions tab → "Semi-Annual Glacier Mapper Export" → "Run workflow" → Check "test mode"
3. **Full run**: Run without test mode for actual data processing

## Setup Requirements

1. Set up the `GEE_SERVICE_ACCOUNT_KEY` secret (see `GITHUB_SETUP.md`)
2. Configure Earth Engine permissions (see `PERMISSIONS.md`)
3. Workflow will automatically validate setup before running