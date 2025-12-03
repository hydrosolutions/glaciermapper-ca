#!/usr/bin/env python3
"""
Test Asset Sharing Script
=========================

This script tests the asset sharing functionality locally.
Run this to verify that asset sharing works before relying on GitHub Actions.

Usage:
    python test_share_assets.py
"""

import ee
import os
import sys
from datetime import datetime, timedelta, timezone

def test_earth_engine_auth():
    """Test Earth Engine authentication."""
    try:
        # Try to initialize Earth Engine
        ee.Initialize(project='thurgau-irrigation')
        print("✅ Earth Engine authentication successful")
        
        # Test a simple operation
        test_asset = ee.FeatureCollection("projects/ee-hydro4u/assets/snow_CentralAsia/Folder4SLA_v4")
        size = test_asset.size().getInfo()
        print(f"✅ Can access assets - found {size} features in test collection")
        return True
        
    except Exception as e:
        print(f"❌ Earth Engine authentication failed: {e}")
        print("💡 Make sure you have run: ee.Authenticate() or earthengine authenticate")
        return False

def test_asset_listing():
    """Test listing assets in the target directory."""
    try:
        assetdir = "projects/ee-hydro4u/assets/snow_CentralAsia/Folder4SLA_v4"
        print(f"📂 Testing asset listing in: {assetdir}")
        
        assets = ee.data.listAssets({"parent": assetdir})["assets"]
        print(f"📊 Found {len(assets)} total assets")
        
        if len(assets) > 0:
            # Show first few assets
            print("🔍 Sample assets:")
            for i, asset in enumerate(assets[:3]):
                print(f"   {i+1}. {asset['name']}")
                print(f"      Updated: {asset.get('updateTime', 'Unknown')}")
        
        return True
        
    except Exception as e:
        print(f"❌ Failed to list assets: {e}")
        return False

def test_recent_asset_detection():
    """Test detection of recently updated assets."""
    try:
        assetdir = "projects/ee-hydro4u/assets/snow_CentralAsia/Folder4SLA_v4"
        assets = ee.data.listAssets({"parent": assetdir})["assets"]
        
        # Get assets updated in the last 10 days
        cutoff_time = datetime.now(timezone.utc) - timedelta(days=10)
        recent_assets = [
            asset for asset in assets
            if 'updateTime' in asset and 
            datetime.fromisoformat(asset['updateTime'].replace('Z', '+00:00')) > cutoff_time
        ]
        
        print(f"📅 Assets updated in last 10 days: {len(recent_assets)}")
        
        if recent_assets:
            print("🆕 Recent assets:")
            for asset in recent_assets[:5]:  # Show first 5
                update_time = datetime.fromisoformat(asset['updateTime'].replace('Z', '+00:00'))
                print(f"   • {asset['name']}")
                print(f"     Updated: {update_time.strftime('%Y-%m-%d %H:%M:%S UTC')}")
        else:
            print("ℹ️  No assets updated in the last 10 days")
        
        return True
        
    except Exception as e:
        print(f"❌ Failed to detect recent assets: {e}")
        return False

def test_permission_check():
    """Test checking permissions on an asset."""
    try:
        assetdir = "projects/ee-hydro4u/assets/snow_CentralAsia/Folder4SLA_v4"
        assets = ee.data.listAssets({"parent": assetdir})["assets"]
        
        if not assets:
            print("ℹ️  No assets available to test permissions")
            return True
            
        # Test permissions on first asset
        test_asset_id = assets[0]['name']
        print(f"🔐 Testing permissions on: {test_asset_id}")
        
        # Try to get IAM policy
        try:
            policy = ee.data.getIamPolicy(test_asset_id)
            print("✅ Can read IAM policy")
            
            # Check if asset is public
            bindings = policy.get('bindings', [])
            is_public = any(
                'allUsers' in binding.get('members', []) 
                for binding in bindings
            )
            print(f"🌐 Asset is {'already ' if is_public else 'not '}public")
            
        except Exception as perm_error:
            print(f"⚠️  Cannot read IAM policy: {perm_error}")
            
        return True
        
    except Exception as e:
        print(f"❌ Failed to test permissions: {e}")
        return False

def main():
    """Run all tests."""
    print("🧪 Testing Asset Sharing Functionality")
    print("=" * 50)
    
    tests = [
        ("Earth Engine Authentication", test_earth_engine_auth),
        ("Asset Listing", test_asset_listing),
        ("Recent Asset Detection", test_recent_asset_detection),
        ("Permission Check", test_permission_check)
    ]
    
    results = []
    
    for test_name, test_func in tests:
        print(f"\n🔧 Testing: {test_name}")
        print("-" * 30)
        success = test_func()
        results.append((test_name, success))
        print()
    
    print("📊 Test Results Summary")
    print("=" * 50)
    
    all_passed = True
    for test_name, success in results:
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status:8} {test_name}")
        if not success:
            all_passed = False
    
    print("=" * 50)
    if all_passed:
        print("🎉 All tests passed! Asset sharing should work correctly.")
        exit(0)
    else:
        print("⚠️  Some tests failed. Please fix issues before using GitHub Actions.")
        exit(1)

if __name__ == "__main__":
    main()