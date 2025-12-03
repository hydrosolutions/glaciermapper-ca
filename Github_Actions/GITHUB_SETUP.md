# GitHub Actions Setup Guide

## Setting up the GEE_SERVICE_ACCOUNT_KEY Secret

The GitHub Actions workflow requires your Google Earth Engine service account credentials to be stored as a repository secret.

### Step 1: Copy your service account JSON

You need to copy the complete contents of your `thurgau-irrigation-4767961f11f5.json` file.

```bash
# Copy the contents to clipboard (macOS)
cat thurgau-irrigation-4767961f11f5.json | pbcopy

# Or view the contents to copy manually
cat thurgau-irrigation-4767961f11f5.json
```

### Step 2: Add the secret to GitHub

1. Go to your repository on GitHub: https://github.com/hydrosolutions/glaciermapper-ca
2. Click **Settings** tab
3. In the left sidebar, click **Secrets and variables** → **Actions**
4. Click **"New repository secret"**
5. Set the following:
   - **Name**: `GEE_SERVICE_ACCOUNT_KEY`
   - **Value**: Paste the complete JSON content from your service account file
6. Click **"Add secret"**

### Step 3: Test the setup

1. Go to the **Actions** tab in your repository
2. Find "Monthly Glacier Mapper Export" workflow
3. Click **"Run workflow"** button
4. Check **"Run in test mode"** checkbox
5. Click **"Run workflow"**

### Troubleshooting

If the workflow fails with authentication errors:

- **"Service account file contains invalid JSON"**: Make sure you copied the complete JSON, including opening and closing braces
- **"GEE_SERVICE_ACCOUNT_KEY secret is not set"**: The secret name must be exactly `GEE_SERVICE_ACCOUNT_KEY`
- **"Expecting value: line 2 column 1"**: This usually means the secret is empty or not properly set

### Security Notes

- The service account JSON contains sensitive credentials
- Never commit the JSON file to your repository
- The secret is encrypted and only accessible during workflow runs
- The workflow automatically cleans up the credentials file after use