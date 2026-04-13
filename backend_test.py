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
        self.session_id = None
        self.table_id = None
        self.batch_ids = []

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
            elif method == 'DELETE':
                response = requests.delete(url, headers=headers, params=params)

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

    def test_ingestion_sessions(self):
        """Test new ingestion session endpoints"""
        print("\n=== INGESTION SESSION TESTS ===")
        
        # Test domains endpoint
        success, response = self.run_test("Get domains", "GET", "domains", 200)
        if not success:
            return False
        
        domains = response.get('domains', {})
        print(f"   Found {len(domains)} domains")
        
        # Test session creation
        session_name = f"Test Session {datetime.now().strftime('%H%M%S')}"
        success, response = self.run_test(
            "Create session",
            "POST",
            "sessions",
            200,
            params={"name": session_name}
        )
        if not success or 'session' not in response:
            return False
        
        self.session_id = response['session']['id']
        print(f"   Created session: {self.session_id}")
        
        # Test list sessions
        success, response = self.run_test("List sessions", "GET", "sessions", 200)
        if not success:
            return False
        
        # Test get specific session
        success, response = self.run_test("Get session", "GET", f"sessions/{self.session_id}", 200)
        if not success:
            return False
        
        # Test file upload to session
        csv_content = "disposition,count\nHome,100\nReferral,50\nAdmitted,75\nLAMA,10"
        csv_file = io.BytesIO(csv_content.encode('utf-8'))
        files = {'file': ('test_data.csv', csv_file, 'text/csv')}
        
        success, response = self.run_test(
            "Upload file to session",
            "POST",
            f"sessions/{self.session_id}/upload",
            200,
            files=files
        )
        if not success or 'table' not in response:
            return False
        
        self.table_id = response['table']['id']
        print(f"   Uploaded file, created table: {self.table_id}")
        
        # Test manual table creation
        success, response = self.run_test(
            "Create manual table",
            "POST",
            f"sessions/{self.session_id}/tables",
            200,
            params={"table_name": "Manual Test Table"}
        )
        if not success:
            return False
        
        manual_table_id = response['table']['id']
        print(f"   Created manual table: {manual_table_id}")
        
        # Test add column to manual table
        success, response = self.run_test(
            "Add column to table",
            "POST",
            f"sessions/{self.session_id}/tables/{manual_table_id}/columns",
            200,
            params={"name": "test_column", "inferred_type": "string"}
        )
        if not success:
            return False
        
        # Test save field definitions
        field_definitions = {
            "fields": [
                {
                    "column_name": "disposition",
                    "data_type": "string",
                    "standardize": True,
                    "domain": "Disposition",
                    "store_as_is": False
                },
                {
                    "column_name": "count",
                    "data_type": "numeric",
                    "standardize": False,
                    "store_as_is": True
                }
            ]
        }
        
        success, response = self.run_test(
            "Save field definitions",
            "PUT",
            f"sessions/{self.session_id}/tables/{self.table_id}/fields",
            200,
            data=field_definitions
        )
        if not success:
            return False
        
        # Test process session
        success, response = self.run_test(
            "Process session",
            "POST",
            f"sessions/{self.session_id}/process",
            200
        )
        if not success:
            return False
        
        batch_ids = response.get('batch_ids', [])
        fields_processed = response.get('fields_processed', 0)
        print(f"   Processed {fields_processed} fields, created {len(batch_ids)} batches")
        
        # Test delete session
        success, response = self.run_test(
            "Delete session",
            "DELETE",
            f"sessions/{self.session_id}",
            200
        )
        if not success:
            return False
        
        print("✅ All ingestion session tests passed")
        return True

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
    test_results.append(tester.test_ingestion_sessions())  # New ingestion tests
    
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