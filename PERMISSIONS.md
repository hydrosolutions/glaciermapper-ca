# Earth Engine Permissions Setup

## Issue Summary
Your [`run_export.py`](run_export.py ) script is ready to run, but the service account needs additional permissions to access Google Earth Engine.

## Current Status ✅
- ✅ Service account file is valid
- ✅ All Python modules import successfully  
- ✅ File structure is correct
- ✅ Code syntax is valid
- ❌ Earth Engine permissions need to be configured

## Required Google Cloud Permissions

Your service account (`glaciermapper@thurgau-irrigation.iam.gserviceaccount.com`) needs these permissions:

### 1. Service Usage Consumer
- **Role**: `roles/serviceusage.serviceUsageConsumer`
- **Purpose**: Allows using Google Cloud services
- **Required for**: Basic Earth Engine API access

### 2. Earth Engine Access
- **Role**: `roles/earthengine.viewer` or `roles/earthengine.developer`
- **Purpose**: Access to Earth Engine datasets and APIs
- **Required for**: Loading MODIS data, DEM, feature collections

### 3. Earth Engine Writer (for exports)
- **Role**: `roles/earthengine.writer`
- **Purpose**: Write access for exporting results
- **Required for**: Exporting processed data to Earth Engine assets

## Setup Instructions

### Step 1: Access Google Cloud Console
1. Go to [Google Cloud Console IAM](https://console.cloud.google.com/iam-admin/iam)
2. Select project: **thurgau-irrigation**
3. Find service account: `glaciermapper@thurgau-irrigation.iam.gserviceaccount.com`

### Step 2: Add Required Roles
1. Click the ✏️ "Edit" button next to the service account
2. Click "+ ADD ANOTHER ROLE" 
3. Add each of these roles:
   - `Service Usage Consumer`
   - `Earth Engine Viewer` (or `Earth Engine Developer`)
   - `Earth Engine Writer`
4. Click "SAVE"

### Step 3: Wait for Propagation
- Wait 5-10 minutes for permission changes to propagate
- This is normal for Google Cloud IAM changes

## Verification Steps

### Test 1: Check Basic Setup
```bash
cd "/Users/silvanragettli/hydrosolutions Dropbox/Silvan Ragettli/2025_04_GlacierMapper/snowcover-mapper"
python test_offline.py
```

### Test 2: Check Earth Engine Access
```bash
python test_run_export.py
```

### Test 3: Run the Full Script
```bash
export GOOGLE_APPLICATION_CREDENTIALS="thurgau-irrigation-4767961f11f5.json"
python run_export.py
```

## GitHub Actions Setup

Once permissions are working locally:

### 1. Add GitHub Secret
1. Go to your repository settings
2. Navigate to **Secrets and variables** → **Actions**
3. Click **"New repository secret"**
4. Name: `GEE_SERVICE_ACCOUNT_KEY`
5. Value: Copy the entire contents of [`thurgau-irrigation-4767961f11f5.json`](thurgau-irrigation-4767961f11f5.json )

### 2. Test the Workflow
1. Go to **Actions** tab in your GitHub repository
2. Find "Monthly Glacier Mapper Export" workflow
3. Click **"Run workflow"** → Enable **"Run in test mode"** → **"Run workflow"**

### 3. Monitor Automated Runs
- The workflow will automatically run on the 1st of each month at 02:00 UTC
- Check the **Actions** tab for status and logs
- Failed runs will automatically create GitHub issues

## Troubleshooting

### Permission Errors
If you see `Caller does not have required permission`, verify:
- All three roles are added to the service account
- You've waited 10+ minutes for propagation
- The project ID in the JSON file matches your GCP project

### Earth Engine Quotas
Earth Engine has usage quotas. If you hit limits:
- Check [Earth Engine Quotas](https://developers.google.com/earth-engine/quotas)
- Consider running exports during off-peak hours
- Break large exports into smaller chunks

### GitHub Actions Failures
Common issues and solutions:
- **Secret not found**: Ensure `GEE_SERVICE_ACCOUNT_KEY` is properly set
- **Permission denied**: The service account needs all three roles
- **Timeout**: Large exports may need workflow timeout adjustments

## Next Steps

1. **Fix permissions** using the instructions above
2. **Test locally** with `python run_export.py`
3. **Commit to GitHub**:
   ```bash
   git add .
   git commit -m "Add monthly export with GitHub Actions workflow"
   git push origin main
   ```
4. **Set up GitHub secret** for `GEE_SERVICE_ACCOUNT_KEY`
5. **Test the workflow** in test mode first
6. **Monitor first automated run** on January 1st

## Support

If you continue having issues:
1. Check Earth Engine authentication: [Earth Engine Authentication Guide](https://developers.google.com/earth-engine/guides/auth)
2. Verify service account setup: [Service Account Guide](https://cloud.google.com/iam/docs/service-accounts)
3. Review Earth Engine quotas and limits