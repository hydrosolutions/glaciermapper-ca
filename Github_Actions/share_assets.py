#!/usr/bin/env python3
"""
Asset Sharing Script for GlacierMapper-CA
==========================================

This script automatically shares Google Earth Engine assets publicly 
after export tasks complete. It finds assets updated in the last 10 days
and sets appropriate permissions for the web application.

Usage:
    python share_assets.py

Requirements:
    - Google Earth Engine API credentials
    - Service account with appropriate permissions
"""

import ee
import os
from datetime import datetime, timedelta, timezone

def initialize_earth_engine():
    """Initialize Google Earth Engine with service account credentials."""
    try:
        # Check if service account key file exists
        if os.path.exists('service_account_key.json'):
            # Use service account authentication
            service_account = 'glaciermapper@thurgau-irrigation.iam.gserviceaccount.com'
            credentials = ee.ServiceAccountCredentials(service_account, 'service_account_key.json')
            ee.Initialize(credentials, project='thurgau-irrigation')
            print("✅ Earth Engine initialized successfully with service account")
        else:
            # Fallback to default authentication (for local testing)
            ee.Initialize(project='thurgau-irrigation')
            print("✅ Earth Engine initialized successfully with default credentials")
        return True
    except Exception as e:
        print(f"❌ Failed to initialize Earth Engine: {e}")
        return False

def share_recent_assets():
    """
    Share assets updated in the last 10 days publicly.
    
    This function:
    1. Lists all assets in the SLA folder
    2. Identifies assets updated in the last 10 days
    3. Sets public viewing permissions for each asset
    """
    try:
        # Define the asset directory
        assetdir = "projects/ee-hydro4u/assets/snow_CentralAsia/Folder4SLA_v4"
        
        print(f"📂 Checking assets in: {assetdir}")
        
        # Get list of all assets
        assets = ee.data.listAssets({"parent": assetdir})["assets"]
        print(f"📊 Total assets found: {len(assets)}")
        
        # Get the current UTC time and subtract 10 days
        cutoff_time = datetime.now(timezone.utc) - timedelta(days=10)
        print(f"⏰ Looking for assets updated after: {cutoff_time.strftime('%Y-%m-%d %H:%M:%S UTC')}")
        
        # Filter assets updated in the last 10 days
        recent_assets = [
            asset for asset in assets
            if 'updateTime' in asset and 
            datetime.fromisoformat(asset['updateTime'].replace('Z', '+00:00')) > cutoff_time
        ]
        
        print(f"🆕 Assets updated in the last 10 days: {len(recent_assets)}")
        
        if len(recent_assets) == 0:
            print("ℹ️  No recent assets to share")
            return True
        
        # Share each recent asset publicly
        shared_count = 0
        failed_count = 0
        
        for asset in recent_assets:
            asset_id = asset['id']
            try:
                # Get asset info
                asset_info = ee.data.getAsset(asset_id)
                
                # Set IAM policy to make asset publicly viewable
                ee.data.setIamPolicy(asset_id, {
                    'bindings': [
                        {
                            'role': 'roles/viewer', 
                            'members': ['allUsers']
                        }
                    ]
                })
                
                print(f"✅ Shared publicly: {asset_id}")
                shared_count += 1
                
            except Exception as e:
                error_msg = str(e)
                if "Permission" in error_msg and "setIamPolicy" in error_msg:
                    print(f"❌ Failed to share {asset_id}: Missing IAM permissions")
                    print(f"   💡 Service account needs 'Earth Engine Admin' role")
                    print(f"   📖 See Github_Actions/PERMISSIONS.md for setup instructions")
                else:
                    print(f"❌ Failed to share {asset_id}: {e}")
                failed_count += 1
        
        print(f"\n📈 Summary:")
        print(f"   ✅ Successfully shared: {shared_count} assets")
        print(f"   ❌ Failed to share: {failed_count} assets")
        
        # Find and report oldest asset for maintenance purposes
        if assets:
            oldest_asset = sorted(assets, key=lambda x: x['updateTime'])[0]
            oldest_date = datetime.fromisoformat(oldest_asset['updateTime'].replace('Z', '+00:00'))
            print(f"   📅 Oldest asset: {oldest_asset['id']}")
            print(f"      Updated: {oldest_date.strftime('%Y-%m-%d %H:%M:%S UTC')}")
        
        return failed_count == 0
        
    except Exception as e:
        print(f"❌ Error in share_recent_assets: {e}")
        return False

def main():
    """Main execution function."""
    print("🚀 Starting asset sharing process...")
    print("=" * 60)
    
    # Initialize Earth Engine
    if not initialize_earth_engine():
        exit(1)
    
    # Share recent assets
    success = share_recent_assets()
    
    print("=" * 60)
    if success:
        print("🎉 Asset sharing completed successfully!")
        exit(0)
    else:
        print("⚠️  Asset sharing completed with some errors")
        exit(1)

if __name__ == "__main__":
    main()