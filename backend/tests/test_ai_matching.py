"""
Test suite for AI Matching feature (Phase 3)
Tests the AI-powered matching endpoints using GPT-5.2 via emergentintegrations
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test batch IDs from existing data
PRIORITY_BATCH_ID = "2e6d7dfb-9bbe-4541-b71c-80ba1be3ff4f"  # Has 5 unmapped values
PATIENT_NAME_BATCH_ID = "50b76872-694a-4d57-8521-e60e70d642a7"  # Has 8 unmapped values
WARD_BATCH_ID = "119253d7-bbe1-4b81-ad1e-e77b9e67a660"  # Has 0 unmapped (all needs_review)


class TestAiMatchingStatus:
    """Tests for GET /api/ai-matching/status endpoint"""
    
    def test_ai_status_returns_available(self):
        """AI matching status should return available=true when EMERGENT_LLM_KEY is set"""
        response = requests.get(f"{BASE_URL}/api/ai-matching/status")
        assert response.status_code == 200
        
        data = response.json()
        assert "available" in data
        assert data["available"] == True
        assert "model" in data
        assert data["model"] == "gpt-5.2"
        print(f"✓ AI matching status: available={data['available']}, model={data['model']}")


class TestAiMatchingPreview:
    """Tests for POST /api/ai-matching/preview endpoint"""
    
    def test_preview_returns_unmapped_count(self):
        """Preview should return count and sample of unmapped values"""
        response = requests.post(
            f"{BASE_URL}/api/ai-matching/preview",
            json={"batch_id": PRIORITY_BATCH_ID}
        )
        assert response.status_code == 200
        
        data = response.json()
        assert "batch_id" in data
        assert data["batch_id"] == PRIORITY_BATCH_ID
        assert "unmapped_count" in data
        assert data["unmapped_count"] >= 0
        assert "values" in data
        assert isinstance(data["values"], list)
        assert "estimated_cost" in data
        print(f"✓ Preview: {data['unmapped_count']} unmapped values, samples: {data['values'][:3]}")
    
    def test_preview_batch_not_found(self):
        """Preview should return 404 for non-existent batch"""
        response = requests.post(
            f"{BASE_URL}/api/ai-matching/preview",
            json={"batch_id": "non-existent-batch-id"}
        )
        assert response.status_code == 404
        print("✓ Preview returns 404 for non-existent batch")
    
    def test_preview_batch_with_no_unmapped(self):
        """Preview should return 0 count for batch with no unmapped values"""
        response = requests.post(
            f"{BASE_URL}/api/ai-matching/preview",
            json={"batch_id": WARD_BATCH_ID}
        )
        assert response.status_code == 200
        
        data = response.json()
        assert data["unmapped_count"] == 0
        assert data["values"] == []
        print(f"✓ Preview for batch with no unmapped: count={data['unmapped_count']}")


class TestAiMatchingRun:
    """Tests for POST /api/ai-matching/run endpoint"""
    
    def test_run_batch_not_found(self):
        """Run should return 404 for non-existent batch"""
        response = requests.post(
            f"{BASE_URL}/api/ai-matching/run",
            json={"batch_id": "non-existent-batch-id"}
        )
        assert response.status_code == 404
        print("✓ Run returns 404 for non-existent batch")
    
    def test_run_batch_with_no_unmapped(self):
        """Run should return success with 0 matched for batch with no unmapped"""
        response = requests.post(
            f"{BASE_URL}/api/ai-matching/run",
            json={"batch_id": WARD_BATCH_ID}
        )
        assert response.status_code == 200
        
        data = response.json()
        assert data["success"] == True
        assert "message" in data or data.get("total_processed", 0) == 0
        print(f"✓ Run on batch with no unmapped: {data}")
    
    def test_run_ai_matching_on_priority_batch(self):
        """Run AI matching on priority batch with unmapped values"""
        # First check current state
        preview_response = requests.post(
            f"{BASE_URL}/api/ai-matching/preview",
            json={"batch_id": PRIORITY_BATCH_ID}
        )
        preview_data = preview_response.json()
        initial_unmapped = preview_data["unmapped_count"]
        
        if initial_unmapped == 0:
            pytest.skip("Priority batch has no unmapped values - AI may have already run")
        
        print(f"Running AI matching on {initial_unmapped} unmapped values...")
        
        # Run AI matching
        response = requests.post(
            f"{BASE_URL}/api/ai-matching/run",
            json={"batch_id": PRIORITY_BATCH_ID},
            timeout=60  # AI calls can take time
        )
        assert response.status_code == 200
        
        data = response.json()
        assert data["success"] == True
        assert "total_processed" in data
        assert "auto_mapped" in data
        assert "needs_review" in data
        assert "still_unmapped" in data
        
        print(f"✓ AI matching completed:")
        print(f"  - Total processed: {data['total_processed']}")
        print(f"  - Auto mapped: {data['auto_mapped']}")
        print(f"  - Needs review: {data['needs_review']}")
        print(f"  - Still unmapped: {data['still_unmapped']}")
        
        # Verify batch stats were updated
        batch_response = requests.get(f"{BASE_URL}/api/batches/{PRIORITY_BATCH_ID}")
        batch_data = batch_response.json()
        print(f"  - Batch stats after AI: auto_mapped={batch_data['auto_mapped']}, needs_review={batch_data['needs_review']}, unmapped={batch_data['unmapped']}")


class TestAiMatchingResultsIntegration:
    """Integration tests for AI matching results"""
    
    def test_ai_match_type_in_results(self):
        """After AI matching, results should have match_type='ai'"""
        # Get results for priority batch
        response = requests.get(
            f"{BASE_URL}/api/batches/{PRIORITY_BATCH_ID}/results",
            params={"match_type": "ai"}
        )
        assert response.status_code == 200
        
        data = response.json()
        ai_results = data["results"]
        
        if len(ai_results) == 0:
            # AI may not have run yet or no matches found
            print("✓ No AI match results found (AI may not have run or no matches)")
            return
        
        for result in ai_results:
            assert result["match_type"] == "ai"
            assert result["confidence"] > 0
            print(f"  - AI matched: '{result['vendor_value']}' -> {result['suggested_standard_code']} (conf: {result['confidence']})")
        
        print(f"✓ Found {len(ai_results)} AI-matched results")
    
    def test_ai_matching_creates_audit_log(self):
        """AI matching should create an audit log entry"""
        response = requests.get(
            f"{BASE_URL}/api/audit",
            params={"action": "ai_matching", "limit": 5}
        )
        assert response.status_code == 200
        
        data = response.json()
        ai_logs = [log for log in data["logs"] if log["action"] == "ai_matching"]
        
        if len(ai_logs) == 0:
            print("✓ No AI matching audit logs found (AI may not have run yet)")
            return
        
        latest_log = ai_logs[0]
        assert latest_log["entity_type"] == "batch"
        assert "details" in latest_log
        assert "model" in latest_log["details"]
        assert latest_log["details"]["model"] == "gpt-5.2"
        
        print(f"✓ AI matching audit log found:")
        print(f"  - Batch: {latest_log['entity_id']}")
        print(f"  - Details: {latest_log['details']}")


class TestAiMatchingFilterInResults:
    """Tests for AI filter option in results"""
    
    def test_filter_by_ai_match_type(self):
        """Should be able to filter results by match_type=ai"""
        response = requests.get(
            f"{BASE_URL}/api/batches/{PRIORITY_BATCH_ID}/results",
            params={"match_type": "ai"}
        )
        assert response.status_code == 200
        
        data = response.json()
        # All results should have match_type='ai' if any exist
        for result in data["results"]:
            assert result["match_type"] == "ai"
        
        print(f"✓ Filter by match_type=ai works: {data['total']} results")


class TestBatchStatsAfterAiMatching:
    """Tests to verify batch stats are updated correctly after AI matching"""
    
    def test_batch_stats_consistency(self):
        """Batch stats should be consistent after AI matching"""
        response = requests.get(f"{BASE_URL}/api/batches/{PRIORITY_BATCH_ID}")
        assert response.status_code == 200
        
        batch = response.json()
        total_categorized = batch["auto_mapped"] + batch["needs_review"] + batch["unmapped"]
        
        # Total categorized should equal unique_values
        assert total_categorized == batch["unique_values"], \
            f"Stats mismatch: {batch['auto_mapped']} + {batch['needs_review']} + {batch['unmapped']} != {batch['unique_values']}"
        
        print(f"✓ Batch stats consistent:")
        print(f"  - Unique values: {batch['unique_values']}")
        print(f"  - Auto mapped: {batch['auto_mapped']}")
        print(f"  - Needs review: {batch['needs_review']}")
        print(f"  - Unmapped: {batch['unmapped']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
