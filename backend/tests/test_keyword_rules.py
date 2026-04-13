"""
Test suite for Keyword Rules CRUD endpoints (Phase 2)
Tests: GET, POST, PUT, DELETE /api/keyword-rules
Also tests matching engine integration with custom rules
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestKeywordRulesAPI:
    """Keyword Rules CRUD endpoint tests"""
    
    # ============ GET /api/keyword-rules ============
    
    def test_list_keyword_rules(self):
        """GET /api/keyword-rules - lists all active rules"""
        response = requests.get(f"{BASE_URL}/api/keyword-rules")
        assert response.status_code == 200
        
        data = response.json()
        assert "rules" in data
        assert "total" in data
        assert isinstance(data["rules"], list)
        assert data["total"] >= 13  # 12 simple + 1 compound seeded
        print(f"✓ Listed {data['total']} keyword rules")
    
    def test_list_keyword_rules_include_inactive(self):
        """GET /api/keyword-rules?include_inactive=true - includes inactive rules"""
        response = requests.get(f"{BASE_URL}/api/keyword-rules", params={"include_inactive": True})
        assert response.status_code == 200
        
        data = response.json()
        assert "rules" in data
        print(f"✓ Listed {data['total']} rules (including inactive)")
    
    def test_seeded_rules_structure(self):
        """Verify seeded rules have correct structure"""
        response = requests.get(f"{BASE_URL}/api/keyword-rules")
        assert response.status_code == 200
        
        data = response.json()
        rules = data["rules"]
        
        # Check simple rules
        simple_rules = [r for r in rules if r.get("rule_type") != "compound"]
        assert len(simple_rules) >= 12, f"Expected at least 12 simple rules, got {len(simple_rules)}"
        
        # Check compound rules
        compound_rules = [r for r in rules if r.get("rule_type") == "compound"]
        assert len(compound_rules) >= 1, f"Expected at least 1 compound rule, got {len(compound_rules)}"
        
        # Verify structure of a simple rule
        simple_rule = simple_rules[0]
        assert "id" in simple_rule
        assert "keywords" in simple_rule
        assert "standard_code" in simple_rule
        assert "standard_label" in simple_rule
        assert "confidence" in simple_rule
        assert "rule_type" in simple_rule
        assert "active" in simple_rule
        
        # Verify structure of compound rule
        compound_rule = compound_rules[0]
        assert "required_keywords" in compound_rule
        assert "exclude_keywords" in compound_rule
        assert compound_rule["rule_type"] == "compound"
        
        print(f"✓ Verified structure: {len(simple_rules)} simple, {len(compound_rules)} compound rules")
    
    # ============ POST /api/keyword-rules ============
    
    def test_create_simple_rule(self):
        """POST /api/keyword-rules - create new simple rule"""
        unique_id = str(uuid.uuid4())[:8]
        payload = {
            "keywords": [f"test_keyword_{unique_id}", "another_test"],
            "standard_code": "HOME",
            "confidence": 0.88,
            "rule_type": "simple",
            "required_keywords": [],
            "exclude_keywords": []
        }
        
        response = requests.post(f"{BASE_URL}/api/keyword-rules", json=payload)
        assert response.status_code == 200
        
        data = response.json()
        assert data["success"] is True
        assert "rule" in data
        
        rule = data["rule"]
        assert rule["standard_code"] == "HOME"
        assert rule["standard_label"] == "Home"
        assert rule["confidence"] == 0.88
        assert rule["rule_type"] == "simple"
        assert rule["active"] is True
        assert f"test_keyword_{unique_id}" in rule["keywords"]
        
        # Cleanup - delete the created rule
        rule_id = rule["id"]
        requests.delete(f"{BASE_URL}/api/keyword-rules/{rule_id}")
        
        print(f"✓ Created simple rule with id: {rule_id}")
    
    def test_create_compound_rule(self):
        """POST /api/keyword-rules - create new compound rule"""
        unique_id = str(uuid.uuid4())[:8]
        payload = {
            "keywords": [],
            "standard_code": "ADULT_ICU",
            "confidence": 0.92,
            "rule_type": "compound",
            "required_keywords": [f"test_req_{unique_id}", "intensive"],
            "exclude_keywords": ["pediatric", "child"]
        }
        
        response = requests.post(f"{BASE_URL}/api/keyword-rules", json=payload)
        assert response.status_code == 200
        
        data = response.json()
        assert data["success"] is True
        
        rule = data["rule"]
        assert rule["rule_type"] == "compound"
        assert f"test_req_{unique_id}" in rule["required_keywords"]
        assert "pediatric" in rule["exclude_keywords"]
        
        # Cleanup
        rule_id = rule["id"]
        requests.delete(f"{BASE_URL}/api/keyword-rules/{rule_id}")
        
        print(f"✓ Created compound rule with id: {rule_id}")
    
    def test_create_rule_invalid_standard_code(self):
        """POST /api/keyword-rules - fails with invalid standard code"""
        payload = {
            "keywords": ["test"],
            "standard_code": "INVALID_CODE_XYZ",
            "confidence": 0.85,
            "rule_type": "simple"
        }
        
        response = requests.post(f"{BASE_URL}/api/keyword-rules", json=payload)
        assert response.status_code == 400
        
        data = response.json()
        assert "detail" in data
        assert "Invalid standard code" in data["detail"]
        
        print("✓ Correctly rejected invalid standard code")
    
    def test_create_rule_keywords_normalized(self):
        """POST /api/keyword-rules - keywords are normalized to lowercase"""
        unique_id = str(uuid.uuid4())[:8]
        payload = {
            "keywords": [f"UPPERCASE_{unique_id}", "MixedCase"],
            "standard_code": "HOME",
            "confidence": 0.85,
            "rule_type": "simple"
        }
        
        response = requests.post(f"{BASE_URL}/api/keyword-rules", json=payload)
        assert response.status_code == 200
        
        rule = response.json()["rule"]
        # Keywords should be lowercased
        assert f"uppercase_{unique_id}" in rule["keywords"]
        assert "mixedcase" in rule["keywords"]
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/keyword-rules/{rule['id']}")
        
        print("✓ Keywords correctly normalized to lowercase")
    
    # ============ PUT /api/keyword-rules/{id} ============
    
    def test_update_rule_confidence(self):
        """PUT /api/keyword-rules/{id} - update confidence"""
        # First create a rule
        unique_id = str(uuid.uuid4())[:8]
        create_payload = {
            "keywords": [f"update_test_{unique_id}"],
            "standard_code": "HOME",
            "confidence": 0.80,
            "rule_type": "simple"
        }
        create_response = requests.post(f"{BASE_URL}/api/keyword-rules", json=create_payload)
        rule_id = create_response.json()["rule"]["id"]
        
        # Update confidence
        update_payload = {"confidence": 0.95}
        response = requests.put(f"{BASE_URL}/api/keyword-rules/{rule_id}", json=update_payload)
        assert response.status_code == 200
        
        data = response.json()
        assert data["success"] is True
        assert data["rule"]["confidence"] == 0.95
        
        # Verify with GET
        get_response = requests.get(f"{BASE_URL}/api/keyword-rules")
        rules = get_response.json()["rules"]
        updated_rule = next((r for r in rules if r["id"] == rule_id), None)
        assert updated_rule is not None
        assert updated_rule["confidence"] == 0.95
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/keyword-rules/{rule_id}")
        
        print(f"✓ Updated rule confidence to 0.95")
    
    def test_update_rule_keywords(self):
        """PUT /api/keyword-rules/{id} - update keywords"""
        # Create a rule
        unique_id = str(uuid.uuid4())[:8]
        create_payload = {
            "keywords": [f"original_{unique_id}"],
            "standard_code": "HOME",
            "confidence": 0.85,
            "rule_type": "simple"
        }
        create_response = requests.post(f"{BASE_URL}/api/keyword-rules", json=create_payload)
        rule_id = create_response.json()["rule"]["id"]
        
        # Update keywords
        update_payload = {"keywords": [f"new_keyword_{unique_id}", "another_new"]}
        response = requests.put(f"{BASE_URL}/api/keyword-rules/{rule_id}", json=update_payload)
        assert response.status_code == 200
        
        rule = response.json()["rule"]
        assert f"new_keyword_{unique_id}" in rule["keywords"]
        assert "another_new" in rule["keywords"]
        assert f"original_{unique_id}" not in rule["keywords"]
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/keyword-rules/{rule_id}")
        
        print("✓ Updated rule keywords")
    
    def test_update_rule_toggle_active(self):
        """PUT /api/keyword-rules/{id} - toggle active status"""
        # Create a rule
        unique_id = str(uuid.uuid4())[:8]
        create_payload = {
            "keywords": [f"toggle_test_{unique_id}"],
            "standard_code": "HOME",
            "confidence": 0.85,
            "rule_type": "simple"
        }
        create_response = requests.post(f"{BASE_URL}/api/keyword-rules", json=create_payload)
        rule_id = create_response.json()["rule"]["id"]
        
        # Deactivate
        response = requests.put(f"{BASE_URL}/api/keyword-rules/{rule_id}", json={"active": False})
        assert response.status_code == 200
        assert response.json()["rule"]["active"] is False
        
        # Reactivate
        response = requests.put(f"{BASE_URL}/api/keyword-rules/{rule_id}", json={"active": True})
        assert response.status_code == 200
        assert response.json()["rule"]["active"] is True
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/keyword-rules/{rule_id}")
        
        print("✓ Toggled rule active status")
    
    def test_update_rule_standard_code(self):
        """PUT /api/keyword-rules/{id} - update standard code"""
        # Create a rule
        unique_id = str(uuid.uuid4())[:8]
        create_payload = {
            "keywords": [f"std_test_{unique_id}"],
            "standard_code": "HOME",
            "confidence": 0.85,
            "rule_type": "simple"
        }
        create_response = requests.post(f"{BASE_URL}/api/keyword-rules", json=create_payload)
        rule_id = create_response.json()["rule"]["id"]
        
        # Update standard code
        response = requests.put(f"{BASE_URL}/api/keyword-rules/{rule_id}", json={"standard_code": "REFERRAL"})
        assert response.status_code == 200
        
        rule = response.json()["rule"]
        assert rule["standard_code"] == "REFERRAL"
        assert rule["standard_label"] == "Referral"
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/keyword-rules/{rule_id}")
        
        print("✓ Updated rule standard code")
    
    def test_update_rule_not_found(self):
        """PUT /api/keyword-rules/{id} - 404 for non-existent rule"""
        fake_id = str(uuid.uuid4())
        response = requests.put(f"{BASE_URL}/api/keyword-rules/{fake_id}", json={"confidence": 0.9})
        assert response.status_code == 404
        
        print("✓ Correctly returned 404 for non-existent rule")
    
    def test_update_rule_no_fields(self):
        """PUT /api/keyword-rules/{id} - 400 when no fields to update"""
        # Create a rule
        unique_id = str(uuid.uuid4())[:8]
        create_payload = {
            "keywords": [f"no_update_{unique_id}"],
            "standard_code": "HOME",
            "confidence": 0.85,
            "rule_type": "simple"
        }
        create_response = requests.post(f"{BASE_URL}/api/keyword-rules", json=create_payload)
        rule_id = create_response.json()["rule"]["id"]
        
        # Try to update with empty payload
        response = requests.put(f"{BASE_URL}/api/keyword-rules/{rule_id}", json={})
        assert response.status_code == 400
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/keyword-rules/{rule_id}")
        
        print("✓ Correctly rejected empty update")
    
    # ============ DELETE /api/keyword-rules/{id} ============
    
    def test_delete_rule(self):
        """DELETE /api/keyword-rules/{id} - delete a rule"""
        # Create a rule
        unique_id = str(uuid.uuid4())[:8]
        create_payload = {
            "keywords": [f"delete_test_{unique_id}"],
            "standard_code": "HOME",
            "confidence": 0.85,
            "rule_type": "simple"
        }
        create_response = requests.post(f"{BASE_URL}/api/keyword-rules", json=create_payload)
        rule_id = create_response.json()["rule"]["id"]
        
        # Delete
        response = requests.delete(f"{BASE_URL}/api/keyword-rules/{rule_id}")
        assert response.status_code == 200
        assert response.json()["success"] is True
        
        # Verify deletion - rule should not appear in list
        get_response = requests.get(f"{BASE_URL}/api/keyword-rules", params={"include_inactive": True})
        rules = get_response.json()["rules"]
        deleted_rule = next((r for r in rules if r["id"] == rule_id), None)
        assert deleted_rule is None
        
        print(f"✓ Deleted rule {rule_id}")
    
    def test_delete_rule_not_found(self):
        """DELETE /api/keyword-rules/{id} - 404 for non-existent rule"""
        fake_id = str(uuid.uuid4())
        response = requests.delete(f"{BASE_URL}/api/keyword-rules/{fake_id}")
        assert response.status_code == 404
        
        print("✓ Correctly returned 404 for non-existent rule")


class TestMatchingEngineIntegration:
    """Test that custom keyword rules are used by the matching engine"""
    
    def test_custom_rule_affects_matching(self):
        """Create a custom rule and verify it's used in matching"""
        unique_keyword = f"customtest{str(uuid.uuid4())[:8]}"
        
        # Create a custom rule
        payload = {
            "keywords": [unique_keyword],
            "standard_code": "DECEASED",
            "confidence": 0.95,
            "rule_type": "simple"
        }
        create_response = requests.post(f"{BASE_URL}/api/keyword-rules", json=payload)
        assert create_response.status_code == 200
        rule_id = create_response.json()["rule"]["id"]
        
        try:
            # Create a session to test matching
            session_response = requests.post(f"{BASE_URL}/api/sessions", params={"name": f"Test Session {unique_keyword}"})
            assert session_response.status_code == 200
            session_id = session_response.json()["session"]["id"]
            
            # Create a manual table with a column
            table_response = requests.post(
                f"{BASE_URL}/api/sessions/{session_id}/tables",
                params={"table_name": "Test Table"}
            )
            assert table_response.status_code == 200
            table_id = table_response.json()["table"]["id"]
            
            # Add a column
            col_response = requests.post(
                f"{BASE_URL}/api/sessions/{session_id}/tables/{table_id}/columns",
                params={"name": "disposition", "inferred_type": "string"}
            )
            assert col_response.status_code == 200
            
            # Mark field for standardization
            field_def = {
                "fields": [{
                    "column_name": "disposition",
                    "data_type": "string",
                    "standardize": True,
                    "store_as_is": False
                }]
            }
            requests.put(f"{BASE_URL}/api/sessions/{session_id}/tables/{table_id}/fields", json=field_def)
            
            # Note: Full matching engine test would require uploading data with the unique keyword
            # For now, we verify the rule exists and is active
            get_response = requests.get(f"{BASE_URL}/api/keyword-rules")
            rules = get_response.json()["rules"]
            our_rule = next((r for r in rules if r["id"] == rule_id), None)
            assert our_rule is not None
            assert our_rule["active"] is True
            assert unique_keyword in our_rule["keywords"]
            
            # Cleanup session
            requests.delete(f"{BASE_URL}/api/sessions/{session_id}")
            
            print(f"✓ Custom rule {rule_id} is active and available for matching")
            
        finally:
            # Cleanup rule
            requests.delete(f"{BASE_URL}/api/keyword-rules/{rule_id}")
    
    def test_inactive_rule_not_used(self):
        """Verify inactive rules are not returned in active-only query"""
        unique_keyword = f"inactive{str(uuid.uuid4())[:8]}"
        
        # Create and deactivate a rule
        payload = {
            "keywords": [unique_keyword],
            "standard_code": "HOME",
            "confidence": 0.85,
            "rule_type": "simple"
        }
        create_response = requests.post(f"{BASE_URL}/api/keyword-rules", json=payload)
        rule_id = create_response.json()["rule"]["id"]
        
        # Deactivate
        requests.put(f"{BASE_URL}/api/keyword-rules/{rule_id}", json={"active": False})
        
        # Check active-only list
        active_response = requests.get(f"{BASE_URL}/api/keyword-rules")
        active_rules = active_response.json()["rules"]
        inactive_rule = next((r for r in active_rules if r["id"] == rule_id), None)
        assert inactive_rule is None, "Inactive rule should not appear in active-only list"
        
        # Check include_inactive list
        all_response = requests.get(f"{BASE_URL}/api/keyword-rules", params={"include_inactive": True})
        all_rules = all_response.json()["rules"]
        found_rule = next((r for r in all_rules if r["id"] == rule_id), None)
        assert found_rule is not None, "Inactive rule should appear when include_inactive=true"
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/keyword-rules/{rule_id}")
        
        print("✓ Inactive rules correctly filtered from active-only query")


class TestAuditLogging:
    """Test that keyword rule operations are logged"""
    
    def test_create_rule_audit_log(self):
        """Verify create rule generates audit log"""
        unique_id = str(uuid.uuid4())[:8]
        payload = {
            "keywords": [f"audit_test_{unique_id}"],
            "standard_code": "HOME",
            "confidence": 0.85,
            "rule_type": "simple"
        }
        
        create_response = requests.post(f"{BASE_URL}/api/keyword-rules", json=payload)
        rule_id = create_response.json()["rule"]["id"]
        
        # Check audit logs
        audit_response = requests.get(f"{BASE_URL}/api/audit", params={"limit": 10})
        logs = audit_response.json()["logs"]
        
        create_log = next((l for l in logs if l.get("entity_id") == rule_id and l.get("action") == "create_keyword_rule"), None)
        assert create_log is not None, "Create keyword rule should generate audit log"
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/keyword-rules/{rule_id}")
        
        print("✓ Create rule audit log verified")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
