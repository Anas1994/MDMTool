import requests
import sys
import json
import io
from datetime import datetime

class MDMAPITester:
    def __init__(self, base_url="https://standardize-hub.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_base = f"{base_url}/api"
        self.tests_run = 0
        self.tests_passed = 0
        self.batch_id = None

    def run_test(self, name, method, endpoint, expected_status, data=None, files=None, params=None):
        """Run a single API test"""
        url = f"{self.api_base}/{endpoint}"
        headers = {}
        if not files:
            headers['Content-Type'] = 'application/json'

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        print(f"   URL: {url}")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, params=params)
            elif method == 'POST':
                if files:
                    response = requests.post(url, files=files, params=params)
                else:
                    response = requests.post(url, json=data, headers=headers, params=params)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=headers, params=params)

            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                try:
                    return True, response.json() if response.content else {}
                except:
                    return True, response.content
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                print(f"   Response: {response.text[:200]}")
                return False, {}

        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            return False, {}

    def test_health_check(self):
        """Test basic health endpoints"""
        print("\n=== HEALTH CHECK TESTS ===")
        
        # Test root endpoint
        self.run_test("Root endpoint", "GET", "", 200)
        
        # Test health endpoint
        self.run_test("Health check", "GET", "health", 200)

    def test_standards_api(self):
        """Test standards API"""
        print("\n=== STANDARDS API TESTS ===")
        
        success, response = self.run_test("Get standards", "GET", "standards", 200)
        if success and response:
            standards = response.get('standards', [])
            print(f"   Found {len(standards)} standards")
            if len(standards) >= 13:
                print("✅ Expected number of standards found")
                return True
            else:
                print(f"❌ Expected at least 13 standards, found {len(standards)}")
                return False
        return False

    def test_synonyms_api(self):
        """Test synonyms API"""
        print("\n=== SYNONYMS API TESTS ===")
        
        # Get synonyms
        success, response = self.run_test("Get synonyms", "GET", "synonyms", 200)
        if success and response:
            synonyms = response.get('synonyms', [])
            total = response.get('total', 0)
            print(f"   Found {len(synonyms)} synonyms (total: {total})")
            if total >= 20:
                print("✅ Expected number of synonyms found")
            else:
                print(f"❌ Expected at least 20 synonyms, found {total}")
        
        # Test create synonym
        success, response = self.run_test(
            "Create synonym", 
            "POST", 
            "synonyms", 
            200,
            params={
                'source_value': 'Test Discharge Home',
                'standard_code': 'HOME',
                'user': 'test_user'
            }
        )
        return success

    def test_dashboard_stats(self):
        """Test dashboard stats"""
        print("\n=== DASHBOARD STATS TESTS ===")
        
        success, response = self.run_test("Dashboard stats", "GET", "dashboard/stats", 200)
        if success and response:
            required_fields = ['total_batches', 'total_mappings', 'total_synonyms', 'total_values', 'auto_mapped', 'needs_review', 'unmapped']
            for field in required_fields:
                if field not in response:
                    print(f"❌ Missing field: {field}")
                    return False
            print("✅ All required dashboard fields present")
            return True
        return False

    def test_file_upload(self):
        """Test file upload functionality"""
        print("\n=== FILE UPLOAD TESTS ===")
        
        # Create a sample CSV file
        csv_content = """DISCHARGE_DESTINATION,PATIENT_ID
Home,P001
Referred to PHC,P002
LAMA,P003
Adult ICU,P004
Deceased,P005
Normal Discharge,P006
DAMA,P007
Emergency Room,P008
"""
        
        # Create file-like object
        csv_file = io.BytesIO(csv_content.encode('utf-8'))
        
        files = {
            'file': ('test_discharge.csv', csv_file, 'text/csv')
        }
        
        params = {
            'column_name': 'DISCHARGE_DESTINATION'
        }
        
        success, response = self.run_test(
            "Upload CSV file", 
            "POST", 
            "upload", 
            200,
            files=files,
            params=params
        )
        
        if success and response:
            self.batch_id = response.get('batch_id')
            print(f"   Batch ID: {self.batch_id}")
            print(f"   Total values: {response.get('total_values')}")
            print(f"   Unique values: {response.get('unique_values')}")
            print(f"   Auto-mapped: {response.get('auto_mapped')}")
            print(f"   Needs review: {response.get('needs_review')}")
            print(f"   Unmapped: {response.get('unmapped')}")
            return True
        return False

    def test_batches_api(self):
        """Test batches API"""
        print("\n=== BATCHES API TESTS ===")
        
        # Get all batches
        success, response = self.run_test("Get batches", "GET", "batches", 200)
        if not success:
            return False
        
        if self.batch_id:
            # Get specific batch
            success, response = self.run_test(
                "Get specific batch", 
                "GET", 
                f"batches/{self.batch_id}", 
                200
            )
            if success:
                print(f"   Batch status: {response.get('status')}")
                return True
        return False

    def test_batch_results(self):
        """Test batch results API"""
        print("\n=== BATCH RESULTS TESTS ===")
        
        if not self.batch_id:
            print("❌ No batch ID available for testing")
            return False
        
        # Get batch results
        success, response = self.run_test(
            "Get batch results", 
            "GET", 
            f"batches/{self.batch_id}/results", 
            200
        )
        
        if success and response:
            results = response.get('results', [])
            print(f"   Found {len(results)} mapping results")
            
            # Test with filters
            success, response = self.run_test(
                "Get batch results with status filter", 
                "GET", 
                f"batches/{self.batch_id}/results", 
                200,
                params={'status': 'auto'}
            )
            
            if success:
                auto_results = response.get('results', [])
                print(f"   Found {len(auto_results)} auto-mapped results")
                return True
        return False

    def test_mapping_approval(self):
        """Test mapping approval workflow"""
        print("\n=== MAPPING APPROVAL TESTS ===")
        
        if not self.batch_id:
            print("❌ No batch ID available for testing")
            return False
        
        # Get a mapping to approve
        success, response = self.run_test(
            "Get mappings for approval", 
            "GET", 
            f"batches/{self.batch_id}/results", 
            200,
            params={'status': 'needs_review', 'limit': 1}
        )
        
        if success and response:
            results = response.get('results', [])
            if results:
                mapping_id = results[0]['id']
                suggested_code = results[0].get('suggested_standard_code')
                
                if suggested_code:
                    # Approve the mapping
                    success, response = self.run_test(
                        "Approve mapping", 
                        "PUT", 
                        f"mappings/{mapping_id}/approve", 
                        200,
                        params={
                            'standard_code': suggested_code,
                            'add_as_synonym': True,
                            'user': 'test_user'
                        }
                    )
                    return success
                else:
                    print("   No suggested standard code to approve")
                    return True
            else:
                print("   No mappings need review")
                return True
        return False

    def test_export_functionality(self):
        """Test export functionality"""
        print("\n=== EXPORT TESTS ===")
        
        if not self.batch_id:
            print("❌ No batch ID available for testing")
            return False
        
        success, response = self.run_test(
            "Export batch", 
            "GET", 
            f"batches/{self.batch_id}/export", 
            200
        )
        
        if success:
            print(f"   Export size: {len(response) if isinstance(response, bytes) else 'N/A'} bytes")
            return True
        return False

    def test_audit_logs(self):
        """Test audit logs API"""
        print("\n=== AUDIT LOGS TESTS ===")
        
        success, response = self.run_test("Get audit logs", "GET", "audit", 200)
        if success and response:
            logs = response.get('logs', [])
            total = response.get('total', 0)
            print(f"   Found {len(logs)} audit logs (total: {total})")
            return True
        return False

def main():
    print("🚀 Starting MDM Mapping Tool API Tests")
    print("=" * 50)
    
    tester = MDMAPITester()
    
    # Run all tests
    test_results = []
    
    test_results.append(tester.test_health_check())
    test_results.append(tester.test_standards_api())
    test_results.append(tester.test_synonyms_api())
    test_results.append(tester.test_dashboard_stats())
    test_results.append(tester.test_file_upload())
    test_results.append(tester.test_batches_api())
    test_results.append(tester.test_batch_results())
    test_results.append(tester.test_mapping_approval())
    test_results.append(tester.test_export_functionality())
    test_results.append(tester.test_audit_logs())
    
    # Print final results
    print("\n" + "=" * 50)
    print(f"📊 Final Results: {tester.tests_passed}/{tester.tests_run} tests passed")
    
    if tester.tests_passed == tester.tests_run:
        print("🎉 All tests passed!")
        return 0
    else:
        print(f"❌ {tester.tests_run - tester.tests_passed} tests failed")
        return 1

if __name__ == "__main__":
    sys.exit(main())