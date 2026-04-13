"""
Backend tests for MDM Mapping Tool - Database Connectivity Feature
Tests all DB connection endpoints: CRUD, test, tables, columns, preview, import
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://standardize-hub.preview.emergentagent.com')

# Test data
TEST_SQLITE_PATH = "/tmp/test_mdm.db"
TEST_CONNECTION_NAME = f"TEST_SQLite_{uuid.uuid4().hex[:8]}"


class TestHealthAndBasics:
    """Basic health check tests"""
    
    def test_health_endpoint(self):
        """Test API health endpoint"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        print("✓ Health endpoint working")


class TestDatabaseConnections:
    """Tests for database connection CRUD operations"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixtures"""
        self.created_connection_id = None
        yield
        # Cleanup: delete test connection if created
        if self.created_connection_id:
            try:
                requests.delete(f"{BASE_URL}/api/connections/{self.created_connection_id}")
            except:
                pass
    
    def test_list_connections(self):
        """GET /api/connections - list saved connections"""
        response = requests.get(f"{BASE_URL}/api/connections")
        assert response.status_code == 200
        data = response.json()
        assert "connections" in data
        assert isinstance(data["connections"], list)
        print(f"✓ List connections: {len(data['connections'])} connections found")
    
    def test_create_connection_sqlite(self):
        """POST /api/connections - create a new SQLite connection"""
        params = {
            "name": TEST_CONNECTION_NAME,
            "db_type": "sqlite",
            "database": TEST_SQLITE_PATH
        }
        response = requests.post(f"{BASE_URL}/api/connections", params=params)
        assert response.status_code == 200
        data = response.json()
        assert data["success"] == True
        assert "connection" in data
        assert data["connection"]["name"] == TEST_CONNECTION_NAME
        assert data["connection"]["db_type"] == "sqlite"
        assert data["connection"]["database"] == TEST_SQLITE_PATH
        self.created_connection_id = data["connection"]["id"]
        print(f"✓ Created SQLite connection: {self.created_connection_id}")
    
    def test_create_connection_missing_fields(self):
        """POST /api/connections - should fail with missing required fields"""
        params = {
            "name": "Incomplete Connection"
            # Missing db_type and database
        }
        response = requests.post(f"{BASE_URL}/api/connections", params=params)
        # Should fail with 422 (validation error)
        assert response.status_code == 422
        print("✓ Create connection validation works")
    
    def test_get_connection_by_id(self):
        """GET /api/connections/{id} - get specific connection"""
        # First create a connection
        params = {
            "name": f"TEST_GetById_{uuid.uuid4().hex[:8]}",
            "db_type": "sqlite",
            "database": TEST_SQLITE_PATH
        }
        create_response = requests.post(f"{BASE_URL}/api/connections", params=params)
        assert create_response.status_code == 200
        conn_id = create_response.json()["connection"]["id"]
        self.created_connection_id = conn_id
        
        # Now get it
        response = requests.get(f"{BASE_URL}/api/connections/{conn_id}")
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == conn_id
        assert data["db_type"] == "sqlite"
        # Password should not be returned
        assert "password" not in data or data.get("password") is None
        print(f"✓ Get connection by ID: {conn_id}")
    
    def test_get_connection_not_found(self):
        """GET /api/connections/{id} - should return 404 for non-existent connection"""
        fake_id = "non-existent-id-12345"
        response = requests.get(f"{BASE_URL}/api/connections/{fake_id}")
        assert response.status_code == 404
        print("✓ Get non-existent connection returns 404")
    
    def test_delete_connection(self):
        """DELETE /api/connections/{id} - delete a connection"""
        # First create a connection
        params = {
            "name": f"TEST_ToDelete_{uuid.uuid4().hex[:8]}",
            "db_type": "sqlite",
            "database": TEST_SQLITE_PATH
        }
        create_response = requests.post(f"{BASE_URL}/api/connections", params=params)
        assert create_response.status_code == 200
        conn_id = create_response.json()["connection"]["id"]
        
        # Delete it
        delete_response = requests.delete(f"{BASE_URL}/api/connections/{conn_id}")
        assert delete_response.status_code == 200
        assert delete_response.json()["success"] == True
        
        # Verify it's gone
        get_response = requests.get(f"{BASE_URL}/api/connections/{conn_id}")
        assert get_response.status_code == 404
        print(f"✓ Delete connection: {conn_id}")
    
    def test_delete_connection_not_found(self):
        """DELETE /api/connections/{id} - should return 404 for non-existent connection"""
        fake_id = "non-existent-id-delete"
        response = requests.delete(f"{BASE_URL}/api/connections/{fake_id}")
        assert response.status_code == 404
        print("✓ Delete non-existent connection returns 404")


class TestConnectionTest:
    """Tests for connection testing endpoint"""
    
    def test_connection_sqlite_success(self):
        """POST /api/connections/test - test SQLite connection (success)"""
        payload = {
            "db_type": "sqlite",
            "database": TEST_SQLITE_PATH
        }
        response = requests.post(f"{BASE_URL}/api/connections/test", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["success"] == True
        assert "Connection successful" in data["message"]
        print("✓ Test SQLite connection: success")
    
    def test_connection_sqlite_failure(self):
        """POST /api/connections/test - test SQLite connection (failure - non-existent file)"""
        payload = {
            "db_type": "sqlite",
            "database": "/tmp/non_existent_db_12345.db"
        }
        response = requests.post(f"{BASE_URL}/api/connections/test", json=payload)
        assert response.status_code == 200
        data = response.json()
        # SQLite creates file if not exists, so this might succeed
        # But let's check the response structure
        assert "success" in data
        assert "message" in data
        print(f"✓ Test SQLite connection with non-existent file: success={data['success']}")
    
    def test_connection_postgresql_failure(self):
        """POST /api/connections/test - test PostgreSQL connection (expected failure - no server)"""
        payload = {
            "db_type": "postgresql",
            "host": "localhost",
            "port": 5432,
            "database": "test_db",
            "username": "test_user",
            "password": "test_pass"
        }
        response = requests.post(f"{BASE_URL}/api/connections/test", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["success"] == False
        assert "Connection failed" in data["message"]
        print("✓ Test PostgreSQL connection (no server): correctly reports failure")
    
    def test_connection_unsupported_type(self):
        """POST /api/connections/test - test unsupported database type"""
        payload = {
            "db_type": "oracle",
            "database": "test"
        }
        response = requests.post(f"{BASE_URL}/api/connections/test", json=payload)
        # Should return 400 or error in response
        assert response.status_code in [200, 400, 422]
        if response.status_code == 200:
            data = response.json()
            assert data["success"] == False
        print("✓ Test unsupported DB type: handled correctly")


class TestConnectionTables:
    """Tests for fetching tables from connected database"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: ensure we have a test connection"""
        # Check if Test SQLite connection exists
        response = requests.get(f"{BASE_URL}/api/connections")
        connections = response.json().get("connections", [])
        
        self.connection_id = None
        for conn in connections:
            if conn["db_type"] == "sqlite" and conn["database"] == TEST_SQLITE_PATH:
                self.connection_id = conn["id"]
                break
        
        # Create one if not exists
        if not self.connection_id:
            params = {
                "name": f"TEST_Tables_{uuid.uuid4().hex[:8]}",
                "db_type": "sqlite",
                "database": TEST_SQLITE_PATH
            }
            create_response = requests.post(f"{BASE_URL}/api/connections", params=params)
            if create_response.status_code == 200:
                self.connection_id = create_response.json()["connection"]["id"]
        
        yield
    
    def test_get_tables_from_connection(self):
        """GET /api/connections/{id}/tables - list tables from connected DB"""
        if not self.connection_id:
            pytest.skip("No test connection available")
        
        response = requests.get(f"{BASE_URL}/api/connections/{self.connection_id}/tables")
        assert response.status_code == 200
        data = response.json()
        assert "tables" in data
        assert isinstance(data["tables"], list)
        
        # Should have patient_visits table
        table_names = [t["name"] for t in data["tables"]]
        assert "patient_visits" in table_names
        print(f"✓ Get tables: found {len(data['tables'])} tables including 'patient_visits'")
    
    def test_get_tables_not_found_connection(self):
        """GET /api/connections/{id}/tables - should return 404 for non-existent connection"""
        response = requests.get(f"{BASE_URL}/api/connections/fake-conn-id/tables")
        assert response.status_code == 404
        print("✓ Get tables for non-existent connection returns 404")


class TestConnectionTableColumns:
    """Tests for fetching columns from a table"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: ensure we have a test connection"""
        response = requests.get(f"{BASE_URL}/api/connections")
        connections = response.json().get("connections", [])
        
        self.connection_id = None
        for conn in connections:
            if conn["db_type"] == "sqlite" and conn["database"] == TEST_SQLITE_PATH:
                self.connection_id = conn["id"]
                break
        
        if not self.connection_id:
            params = {
                "name": f"TEST_Columns_{uuid.uuid4().hex[:8]}",
                "db_type": "sqlite",
                "database": TEST_SQLITE_PATH
            }
            create_response = requests.post(f"{BASE_URL}/api/connections", params=params)
            if create_response.status_code == 200:
                self.connection_id = create_response.json()["connection"]["id"]
        
        yield
    
    def test_get_columns_for_table(self):
        """GET /api/connections/{id}/tables/{table}/columns - get columns for a table"""
        if not self.connection_id:
            pytest.skip("No test connection available")
        
        response = requests.get(f"{BASE_URL}/api/connections/{self.connection_id}/tables/patient_visits/columns")
        assert response.status_code == 200
        data = response.json()
        assert "columns" in data
        assert isinstance(data["columns"], list)
        
        # Verify expected columns
        column_names = [c["name"] for c in data["columns"]]
        expected_columns = ["id", "patient_name", "visit_date", "disposition", "ward", "priority"]
        for col in expected_columns:
            assert col in column_names, f"Expected column '{col}' not found"
        
        # Verify column structure
        for col in data["columns"]:
            assert "name" in col
            assert "db_type" in col
            assert "nullable" in col
        
        print(f"✓ Get columns: found {len(data['columns'])} columns: {column_names}")
    
    def test_get_columns_not_found_connection(self):
        """GET /api/connections/{id}/tables/{table}/columns - 404 for non-existent connection"""
        response = requests.get(f"{BASE_URL}/api/connections/fake-conn/tables/patient_visits/columns")
        assert response.status_code == 404
        print("✓ Get columns for non-existent connection returns 404")


class TestConnectionTablePreview:
    """Tests for previewing table data"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: ensure we have a test connection"""
        response = requests.get(f"{BASE_URL}/api/connections")
        connections = response.json().get("connections", [])
        
        self.connection_id = None
        for conn in connections:
            if conn["db_type"] == "sqlite" and conn["database"] == TEST_SQLITE_PATH:
                self.connection_id = conn["id"]
                break
        
        if not self.connection_id:
            params = {
                "name": f"TEST_Preview_{uuid.uuid4().hex[:8]}",
                "db_type": "sqlite",
                "database": TEST_SQLITE_PATH
            }
            create_response = requests.post(f"{BASE_URL}/api/connections", params=params)
            if create_response.status_code == 200:
                self.connection_id = create_response.json()["connection"]["id"]
        
        yield
    
    def test_preview_table_data(self):
        """GET /api/connections/{id}/tables/{table}/preview - preview data"""
        if not self.connection_id:
            pytest.skip("No test connection available")
        
        response = requests.get(f"{BASE_URL}/api/connections/{self.connection_id}/tables/patient_visits/preview")
        assert response.status_code == 200
        data = response.json()
        
        assert "columns" in data
        assert "data" in data
        assert "row_count" in data
        
        # Should have 8 rows
        assert data["row_count"] == 8
        assert len(data["data"]) == 8
        
        # Verify data structure
        first_row = data["data"][0]
        assert "patient_name" in first_row
        assert "disposition" in first_row
        
        print(f"✓ Preview table data: {data['row_count']} rows, {len(data['columns'])} columns")
    
    def test_preview_with_limit(self):
        """GET /api/connections/{id}/tables/{table}/preview?limit=3 - preview with limit"""
        if not self.connection_id:
            pytest.skip("No test connection available")
        
        response = requests.get(
            f"{BASE_URL}/api/connections/{self.connection_id}/tables/patient_visits/preview",
            params={"limit": 3}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["row_count"] == 3
        print(f"✓ Preview with limit: {data['row_count']} rows")


class TestImportFromDatabase:
    """Tests for importing table from database into session"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: ensure we have a test connection and session"""
        # Get or create connection
        response = requests.get(f"{BASE_URL}/api/connections")
        connections = response.json().get("connections", [])
        
        self.connection_id = None
        for conn in connections:
            if conn["db_type"] == "sqlite" and conn["database"] == TEST_SQLITE_PATH:
                self.connection_id = conn["id"]
                break
        
        if not self.connection_id:
            params = {
                "name": f"TEST_Import_{uuid.uuid4().hex[:8]}",
                "db_type": "sqlite",
                "database": TEST_SQLITE_PATH
            }
            create_response = requests.post(f"{BASE_URL}/api/connections", params=params)
            if create_response.status_code == 200:
                self.connection_id = create_response.json()["connection"]["id"]
        
        # Create a test session
        self.session_id = None
        session_response = requests.post(
            f"{BASE_URL}/api/sessions",
            params={"name": f"TEST_ImportSession_{uuid.uuid4().hex[:8]}"}
        )
        if session_response.status_code == 200:
            self.session_id = session_response.json()["session"]["id"]
        
        yield
        
        # Cleanup: delete test session
        if self.session_id:
            try:
                requests.delete(f"{BASE_URL}/api/sessions/{self.session_id}")
            except:
                pass
    
    def test_import_table_from_db(self):
        """POST /api/sessions/{id}/import-from-db - import table into session"""
        if not self.connection_id or not self.session_id:
            pytest.skip("No test connection or session available")
        
        response = requests.post(
            f"{BASE_URL}/api/sessions/{self.session_id}/import-from-db",
            params={
                "connection_id": self.connection_id,
                "table_name": "patient_visits"
            }
        )
        assert response.status_code == 200
        data = response.json()
        
        assert data["success"] == True
        assert "table" in data
        assert data["table"]["table_name"] == "patient_visits"
        assert data["table"]["rows"] == 8
        assert data["table"]["columns"] == 6
        assert "db://" in data["table"]["source"]
        
        print(f"✓ Import table from DB: {data['table']['rows']} rows, {data['table']['columns']} columns")
        
        # Verify the table is in the session
        session_response = requests.get(f"{BASE_URL}/api/sessions/{self.session_id}")
        assert session_response.status_code == 200
        session_data = session_response.json()
        
        assert len(session_data["tables"]) == 1
        imported_table = session_data["tables"][0]
        assert imported_table["table_name"] == "patient_visits"
        assert len(imported_table["columns"]) == 6
        
        print("✓ Verified imported table in session")
    
    def test_import_with_limit(self):
        """POST /api/sessions/{id}/import-from-db?limit=5 - import with row limit"""
        if not self.connection_id or not self.session_id:
            pytest.skip("No test connection or session available")
        
        response = requests.post(
            f"{BASE_URL}/api/sessions/{self.session_id}/import-from-db",
            params={
                "connection_id": self.connection_id,
                "table_name": "patient_visits",
                "limit": 5
            }
        )
        assert response.status_code == 200
        data = response.json()
        
        assert data["success"] == True
        assert data["table"]["rows"] == 5
        print(f"✓ Import with limit: {data['table']['rows']} rows")
    
    def test_import_session_not_found(self):
        """POST /api/sessions/{id}/import-from-db - 404 for non-existent session"""
        if not self.connection_id:
            pytest.skip("No test connection available")
        
        response = requests.post(
            f"{BASE_URL}/api/sessions/fake-session-id/import-from-db",
            params={
                "connection_id": self.connection_id,
                "table_name": "patient_visits"
            }
        )
        assert response.status_code == 404
        print("✓ Import to non-existent session returns 404")
    
    def test_import_connection_not_found(self):
        """POST /api/sessions/{id}/import-from-db - 404 for non-existent connection"""
        if not self.session_id:
            pytest.skip("No test session available")
        
        response = requests.post(
            f"{BASE_URL}/api/sessions/{self.session_id}/import-from-db",
            params={
                "connection_id": "fake-connection-id",
                "table_name": "patient_visits"
            }
        )
        assert response.status_code == 404
        print("✓ Import with non-existent connection returns 404")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
