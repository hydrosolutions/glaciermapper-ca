#!/usr/bin/env python3
"""
Basic validation tests for GlacierMapper-CA export script.
These tests verify the environment and dependencies without requiring full Earth Engine permissions.
"""

import os
import json
import sys
from pathlib import Path

def test_environment():
    """Test that all required files and environment variables are present"""
    print("🔍 Testing environment setup...")
    
    # Check service account file
    key_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "thurgau-irrigation-4767961f11f5.json")
    if not os.path.exists(key_path):
        print(f"❌ Service account file not found: {key_path}")
        print("   Make sure GOOGLE_APPLICATION_CREDENTIALS is set or file exists")
        return False
    
    try:
        with open(key_path) as f:
            content = f.read().strip()
        
        if not content:
            print("❌ Service account file is empty")
            print("   Check that the GitHub secret GEE_SERVICE_ACCOUNT_KEY is properly set")
            return False
        
        if content.startswith('${{') or content.startswith('***'):
            print("❌ Service account file contains GitHub secrets placeholder")
            print("   The GEE_SERVICE_ACCOUNT_KEY secret is not properly configured")
            print("   Go to repository Settings > Secrets and variables > Actions")
            print("   Add secret 'GEE_SERVICE_ACCOUNT_KEY' with your service account JSON content")
            return False
        
        key = json.loads(content)
        
        required_fields = ['client_email', 'project_id', 'private_key']
        for field in required_fields:
            if field not in key:
                print(f"❌ Service account missing field: {field}")
                return False
        
        print(f"✅ Service account file valid: {key['client_email']}")
        return True
    except json.JSONDecodeError as e:
        print(f"❌ Service account file contains invalid JSON: {e}")
        print("   Check that the GitHub secret GEE_SERVICE_ACCOUNT_KEY contains valid JSON")
        print("   The JSON should be the complete contents of your service account file")
        return False
    except Exception as e:
        print(f"❌ Service account file error: {e}")
        return False

def test_imports():
    """Test that all required modules can be imported"""
    print("🔍 Testing module imports...")
    
    try:
        # Test Earth Engine
        import ee
        print("✅ earthengine-api imported")
        
        # Test project modules - adjust path to parent directory
        project_root = Path(__file__).parent.parent
        sys.path.append(str(project_root))
        
        from src.modis_processing import create_decadal_composites
        from src.dem_processing import load_dem, classify_aspect, reproject_and_analyze_dem
        from src.snowline import get_snowline_elevation, calculate_glacier_metrics
        
        print("✅ All project modules imported successfully")
        return True
    except ImportError as e:
        print(f"❌ Import failed: {e}")
        return False

def test_file_structure():
    """Test that required files exist"""
    print("🔍 Testing file structure...")
    
    required_files = [
        "Github_Actions/run_export.py",  # Main export script (moved to Github_Actions)
        "requirements.txt",
        "src/modis_processing.py",
        "src/dem_processing.py", 
        "src/snowline.py"
    ]
    
    for file_path in required_files:
        if not os.path.exists(file_path):
            print(f"❌ Required file missing: {file_path}")
            return False
    
    print("✅ All required files present")
    return True

def run_tests():
    """Run all validation tests"""
    print("🧪 Running GlacierMapper validation tests...")
    print("=" * 50)
    
    tests = [
        ("Environment", test_environment),
        ("File Structure", test_file_structure),
        ("Module Imports", test_imports),
    ]
    
    results = []
    for test_name, test_func in tests:
        print(f"\n🔍 Running {test_name} test...")
        try:
            result = test_func()
            results.append((test_name, result))
        except Exception as e:
            print(f"❌ {test_name} test failed with error: {e}")
            results.append((test_name, False))
    
    print("\n" + "=" * 50)
    print("TEST RESULTS:")
    
    all_passed = True
    for test_name, result in results:
        status = "✅ PASSED" if result else "❌ FAILED"
        print(f"{test_name}: {status}")
        if not result:
            all_passed = False
    
    if all_passed:
        print("\n✅ All tests passed! Ready for export.")
        return True
    else:
        print("\n❌ Some tests failed. Please check the setup.")
        return False

if __name__ == "__main__":
    success = run_tests()
    sys.exit(0 if success else 1)