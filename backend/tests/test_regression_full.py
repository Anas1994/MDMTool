"""
Full Regression Test Suite for MDM Mapping Tool
Tests all major features: Dashboard, Standards, Synonyms, Keyword Rules, 
Sessions, Batches, Review, Sandbox, Analytics, AI Matching
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestHealthAndBasicEndpoints:
    """Test health check and basic API endpoints"""
    
    def test_health_check(self):
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        print("✓ Health check passed")
    
    def test_api_root(self):
        response = requests.get(f"{BASE_URL}/api/")
        assert response.status_code == 200
        data = response.json()
        assert "MDM Mapping Tool API" in data["message"]
        assert data["version"] == "1.0.0"
        print("✓ API root endpoint passed")


class TestDashboardAndAnalytics:
    """Test dashboard stats and analytics endpoints"""
    
    def test_dashboard_stats(self):
        response = requests.get(f"{BASE_URL}/api/dashboard/stats")
        assert response.status_code == 200
        data = response.json()
        # Verify all expected fields
        assert "total_batches" in data
        assert "total_mappings" in data
        assert "total_synonyms" in data
        assert "total_values" in data
        assert "auto_mapped" in data
        assert "needs_review" in data
        assert "unmapped" in data
        print(f"✓ Dashboard stats: {data['total_batches']} batches, {data['total_values']} values")
    
    def test_analytics_endpoint(self):
        response = requests.get(f"{BASE_URL}/api/analytics")
        assert response.status_code == 200
        data = response.json()
        # Verify analytics structure
        assert "match_type_distribution" in data
        assert "status_distribution" in data
        assert "confidence_distribution" in data
        assert "top_unmapped" in data
        assert "batch_performance" in data
        assert "totals" in data
        print(f"✓ Analytics: {data['totals']['standards']} standards, {data['totals']['synonyms']} synonyms")


class TestStandardsCRUD:
    """Test Standards CRUD operations"""
    
    def test_get_standards(self):
        response = requests.get(f"{BASE_URL}/api/standards")
        assert response.status_code == 200
        data = response.json()
        assert "standards" in data
        assert len(data["standards"]) > 0
        # Verify standard structure
        std = data["standards"][0]
        assert "code" in std
        assert "label" in std
        assert "active_flag" in std
        print(f"✓ GET standards: {len(data['standards'])} standards found")
    
    def test_create_standard(self):
        response = requests.post(
            f"{BASE_URL}/api/standards",
            params={
                "code": "TEST_REGRESSION",
                "label": "Test Regression Standard",
                "description": "Created by regression test"
            }
        )
        # May return 400 if already exists
        if response.status_code == 400:
            assert "already exists" in response.json().get("detail", "")
            print("✓ Create standard: already exists (expected)")
        else:
            assert response.status_code == 200
            data = response.json()
            assert data["success"] == True
            print("✓ Create standard: created successfully")
    
    def test_update_standard(self):
        response = requests.put(
            f"{BASE_URL}/api/standards/HOME",
            params={"description": "Updated by regression test"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] == True
        print("✓ Update standard: HOME updated")


class TestSynonymsCRUD:
    """Test Synonyms CRUD operations"""
    
    def test_get_synonyms(self):
        response = requests.get(f"{BASE_URL}/api/synonyms")
        assert response.status_code == 200
        data = response.json()
        assert "synonyms" in data
        assert "total" in data
        assert "page" in data
        print(f"✓ GET synonyms: {data['total']} total synonyms")
    
    def test_create_synonym(self):
        response = requests.post(
            f"{BASE_URL}/api/synonyms",
            params={
                "source_value": "TEST_REGRESSION_VALUE",
                "standard_code": "HOME"
            }
        )
        # May return 400 if already exists
        if response.status_code == 400:
            assert "already exists" in response.json().get("detail", "")
            print("✓ Create synonym: already exists (expected)")
        else:
            assert response.status_code == 200
            data = response.json()
            assert data["success"] == True
            print("✓ Create synonym: created successfully")


class TestKeywordRulesCRUD:
    """Test Keyword Rules CRUD operations"""
    
    def test_get_keyword_rules(self):
        response = requests.get(f"{BASE_URL}/api/keyword-rules")
        assert response.status_code == 200
        data = response.json()
        assert "rules" in data
        assert "total" in data
        # Verify rule structure
        if len(data["rules"]) > 0:
            rule = data["rules"][0]
            assert "id" in rule
            assert "keywords" in rule
            assert "standard_code" in rule
            assert "confidence" in rule
            assert "rule_type" in rule
            assert "active" in rule
        print(f"✓ GET keyword rules: {data['total']} rules found")
    
    def test_get_keyword_rules_with_inactive(self):
        response = requests.get(f"{BASE_URL}/api/keyword-rules?include_inactive=true")
        assert response.status_code == 200
        data = response.json()
        assert "rules" in data
        print(f"✓ GET keyword rules (include inactive): {data['total']} rules")
    
    def test_create_keyword_rule(self):
        response = requests.post(
            f"{BASE_URL}/api/keyword-rules",
            json={
                "keywords": ["test_regression_kw"],
                "standard_code": "HOME",
                "confidence": 0.85,
                "rule_type": "simple"
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] == True
        assert "rule" in data
        # Store rule ID for cleanup
        rule_id = data["rule"]["id"]
        print(f"✓ Create keyword rule: {rule_id}")
        
        # Cleanup - delete the rule
        delete_response = requests.delete(f"{BASE_URL}/api/keyword-rules/{rule_id}")
        assert delete_response.status_code == 200
        print("✓ Delete keyword rule: cleaned up")


class TestBatchesAndResults:
    """Test Batches and Mapping Results endpoints"""
    
    def test_get_batches(self):
        response = requests.get(f"{BASE_URL}/api/batches")
        assert response.status_code == 200
        data = response.json()
        assert "batches" in data
        assert "total" in data
        assert "page" in data
        print(f"✓ GET batches: {data['total']} batches found")
    
    def test_get_batch_by_id(self):
        # First get list of batches
        batches_response = requests.get(f"{BASE_URL}/api/batches")
        batches = batches_response.json().get("batches", [])
        
        if len(batches) > 0:
            batch_id = batches[0]["id"]
            response = requests.get(f"{BASE_URL}/api/batches/{batch_id}")
            assert response.status_code == 200
            data = response.json()
            assert data["id"] == batch_id
            assert "filename" in data
            assert "auto_mapped" in data
            print(f"✓ GET batch by ID: {data['filename']}")
        else:
            pytest.skip("No batches available for testing")
    
    def test_get_batch_results(self):
        # First get list of batches
        batches_response = requests.get(f"{BASE_URL}/api/batches")
        batches = batches_response.json().get("batches", [])
        
        if len(batches) > 0:
            batch_id = batches[0]["id"]
            response = requests.get(f"{BASE_URL}/api/batches/{batch_id}/results")
            assert response.status_code == 200
            data = response.json()
            assert "results" in data
            assert "total" in data
            print(f"✓ GET batch results: {data['total']} results")
        else:
            pytest.skip("No batches available for testing")
    
    def test_batch_results_with_filters(self):
        batches_response = requests.get(f"{BASE_URL}/api/batches")
        batches = batches_response.json().get("batches", [])
        
        if len(batches) > 0:
            batch_id = batches[0]["id"]
            # Test status filter
            response = requests.get(f"{BASE_URL}/api/batches/{batch_id}/results?status=auto")
            assert response.status_code == 200
            
            # Test match_type filter
            response = requests.get(f"{BASE_URL}/api/batches/{batch_id}/results?match_type=keyword")
            assert response.status_code == 200
            
            # Test AI match_type filter
            response = requests.get(f"{BASE_URL}/api/batches/{batch_id}/results?match_type=ai")
            assert response.status_code == 200
            print("✓ Batch results filters work correctly")
        else:
            pytest.skip("No batches available for testing")


class TestSandboxMatching:
    """Test Sandbox/Test Value Matching endpoint"""
    
    def test_sandbox_exact_match(self):
        response = requests.post(f"{BASE_URL}/api/sandbox/test?value=Home")
        assert response.status_code == 200
        data = response.json()
        assert "input_value" in data
        assert "normalized_value" in data
        assert "steps" in data
        assert "final_result" in data
        assert len(data["steps"]) == 4  # 4 matching steps
        print(f"✓ Sandbox test: 'Home' -> {data['final_result'].get('standard_code', 'no match')}")
    
    def test_sandbox_keyword_match(self):
        response = requests.post(f"{BASE_URL}/api/sandbox/test?value=Patient transferred to ICU")
        assert response.status_code == 200
        data = response.json()
        assert "steps" in data
        assert "final_result" in data
        print(f"✓ Sandbox keyword test: result = {data['final_result'].get('match_type', 'no match')}")
    
    def test_sandbox_no_match(self):
        response = requests.post(f"{BASE_URL}/api/sandbox/test?value=XYZ123NOMATCH")
        assert response.status_code == 200
        data = response.json()
        assert data["final_result"]["match_type"] == "no_match"
        print("✓ Sandbox no match test passed")


class TestSessionsAndIngestion:
    """Test Sessions and Ingestion Pipeline endpoints"""
    
    def test_get_sessions(self):
        response = requests.get(f"{BASE_URL}/api/sessions")
        assert response.status_code == 200
        data = response.json()
        assert "sessions" in data
        assert "total" in data
        print(f"✓ GET sessions: {data['total']} sessions found")
    
    def test_create_and_delete_session(self):
        # Create session
        response = requests.post(
            f"{BASE_URL}/api/sessions",
            params={"name": "TEST_REGRESSION_SESSION"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] == True
        session_id = data["session"]["id"]
        print(f"✓ Create session: {session_id}")
        
        # Delete session
        delete_response = requests.delete(f"{BASE_URL}/api/sessions/{session_id}")
        assert delete_response.status_code == 200
        print("✓ Delete session: cleaned up")
    
    def test_get_domains(self):
        response = requests.get(f"{BASE_URL}/api/domains")
        assert response.status_code == 200
        data = response.json()
        assert "domains" in data
        # Verify expected domains exist
        domains = data["domains"]
        assert "Disposition" in domains
        assert "Ward" in domains
        assert "Specialty" in domains
        print(f"✓ GET domains: {len(domains)} domains found")


class TestAIMatchingEndpoints:
    """Test AI Matching endpoints"""
    
    def test_ai_matching_status(self):
        response = requests.get(f"{BASE_URL}/api/ai-matching/status")
        assert response.status_code == 200
        data = response.json()
        assert "available" in data
        assert "model" in data
        print(f"✓ AI matching status: available={data['available']}, model={data['model']}")
    
    def test_ai_matching_preview(self):
        # Get a batch with unmapped values
        batches_response = requests.get(f"{BASE_URL}/api/batches")
        batches = batches_response.json().get("batches", [])
        
        batch_with_unmapped = None
        for batch in batches:
            if batch.get("unmapped", 0) > 0:
                batch_with_unmapped = batch
                break
        
        if batch_with_unmapped:
            response = requests.post(
                f"{BASE_URL}/api/ai-matching/preview",
                json={"batch_id": batch_with_unmapped["id"]}
            )
            assert response.status_code == 200
            data = response.json()
            assert "unmapped_count" in data
            assert "values" in data
            print(f"✓ AI matching preview: {data['unmapped_count']} unmapped values")
        else:
            pytest.skip("No batch with unmapped values for AI preview test")


class TestDatabaseConnections:
    """Test Database Connection endpoints"""
    
    def test_get_connections(self):
        response = requests.get(f"{BASE_URL}/api/connections")
        assert response.status_code == 200
        data = response.json()
        assert "connections" in data
        print(f"✓ GET connections: {len(data['connections'])} connections found")
    
    def test_test_sqlite_connection(self):
        response = requests.post(
            f"{BASE_URL}/api/connections/test",
            json={
                "db_type": "sqlite",
                "database": "/tmp/test_mdm.db"
            }
        )
        assert response.status_code == 200
        data = response.json()
        # Connection may succeed or fail depending on file existence
        assert "success" in data
        print(f"✓ Test SQLite connection: success={data['success']}")


class TestAuditLogs:
    """Test Audit Log endpoints"""
    
    def test_get_audit_logs(self):
        response = requests.get(f"{BASE_URL}/api/audit")
        assert response.status_code == 200
        data = response.json()
        assert "logs" in data
        assert "total" in data
        print(f"✓ GET audit logs: {data['total']} logs found")
    
    def test_audit_logs_with_filter(self):
        response = requests.get(f"{BASE_URL}/api/audit?action=upload")
        assert response.status_code == 200
        data = response.json()
        assert "logs" in data
        print(f"✓ GET audit logs (filtered): {len(data['logs'])} upload logs")


class TestRetryMatching:
    """Test Retry Matching endpoint"""
    
    def test_retry_batch_matching(self):
        # Get a batch
        batches_response = requests.get(f"{BASE_URL}/api/batches")
        batches = batches_response.json().get("batches", [])
        
        if len(batches) > 0:
            batch_id = batches[0]["id"]
            response = requests.post(
                f"{BASE_URL}/api/batches/{batch_id}/retry",
                params={"status_filter": "unmapped"}
            )
            assert response.status_code == 200
            data = response.json()
            assert "success" in data
            assert "retried" in data
            print(f"✓ Retry matching: retried {data['retried']} values")
        else:
            pytest.skip("No batches available for retry test")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
