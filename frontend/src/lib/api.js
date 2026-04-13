import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API_BASE = `${BACKEND_URL}/api`;

const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Dashboard
export const getDashboardStats = () => api.get('/dashboard/stats');

// Standards
export const getStandards = (includeInactive = false) => 
  api.get('/standards', { params: { include_inactive: includeInactive } });

export const createStandard = (code, label, description = '', user = 'user') =>
  api.post('/standards', null, { params: { code, label, description, user } });

export const updateStandard = (code, updates, user = 'user') =>
  api.put(`/standards/${code}`, null, { 
    params: { ...updates, user } 
  });

export const deactivateStandard = (code, user = 'user') =>
  api.delete(`/standards/${code}`, { params: { user } });

// Synonyms
export const getSynonyms = (page = 1, limit = 50) => 
  api.get('/synonyms', { params: { page, limit } });

export const createSynonym = (sourceValue, standardCode, user = 'user') =>
  api.post('/synonyms', null, { params: { source_value: sourceValue, standard_code: standardCode, user } });

// File Upload
export const uploadFile = (file, columnName) => {
  const formData = new FormData();
  formData.append('file', file);
  return api.post('/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    params: { column_name: columnName },
  });
};

// Batches
export const getBatches = (page = 1, limit = 20) =>
  api.get('/batches', { params: { page, limit } });

export const getBatch = (batchId) => api.get(`/batches/${batchId}`);

export const getBatchResults = (batchId, params = {}) => {
  const { status, matchType, search, page = 1, limit = 50 } = params;
  return api.get(`/batches/${batchId}/results`, {
    params: {
      status,
      match_type: matchType,
      search,
      page,
      limit,
    },
  });
};

export const exportBatch = (batchId) => 
  api.get(`/batches/${batchId}/export`, { responseType: 'blob' });

// Mappings
export const approveMapping = (mappingId, standardCode = null, addAsSynonym = false, user = 'user') =>
  api.put(`/mappings/${mappingId}/approve`, null, {
    params: {
      standard_code: standardCode,
      add_as_synonym: addAsSynonym,
      user,
    },
  });

export const bulkApproveMappings = (mappingIds, user = 'user') =>
  api.post('/mappings/bulk-approve', mappingIds, { params: { user } });

export const markUnmapped = (mappingId, user = 'user') =>
  api.put(`/mappings/${mappingId}/unmapped`, null, { params: { user } });

// Audit
export const getAuditLogs = (page = 1, limit = 50, action = null) =>
  api.get('/audit', { params: { page, limit, action } });

// ============ INGESTION SESSIONS ============

// Sessions
export const createSession = (name, description = null) =>
  api.post('/sessions', null, { params: { name, description } });

export const getSessions = (page = 1, limit = 20) =>
  api.get('/sessions', { params: { page, limit } });

export const getSession = (sessionId) =>
  api.get(`/sessions/${sessionId}`);

export const updateSession = (sessionId, name = null, description = null) =>
  api.put(`/sessions/${sessionId}`, null, { params: { name, description } });

export const deleteSession = (sessionId) =>
  api.delete(`/sessions/${sessionId}`);

export const exportSession = (sessionId) =>
  api.get(`/sessions/${sessionId}/export`, { responseType: 'blob' });

export const importSession = (file) => {
  const formData = new FormData();
  formData.append('file', file);
  return api.post('/sessions/import', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

// Session Tables
export const uploadToSession = (sessionId, file) => {
  const formData = new FormData();
  formData.append('file', file);
  return api.post(`/sessions/${sessionId}/upload`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

export const createManualTable = (sessionId, tableName) =>
  api.post(`/sessions/${sessionId}/tables`, null, { params: { table_name: tableName } });

export const updateTable = (sessionId, tableId, tableName = null, description = null) =>
  api.put(`/sessions/${sessionId}/tables/${tableId}`, null, { params: { table_name: tableName, description } });

export const deleteTable = (sessionId, tableId) =>
  api.delete(`/sessions/${sessionId}/tables/${tableId}`);

export const addColumnToTable = (sessionId, tableId, name, inferredType = 'string') =>
  api.post(`/sessions/${sessionId}/tables/${tableId}/columns`, null, {
    params: { name, inferred_type: inferredType }
  });

export const saveFieldDefinitions = (sessionId, tableId, fields) =>
  api.put(`/sessions/${sessionId}/tables/${tableId}/fields`, { fields });

export const processSession = (sessionId) =>
  api.post(`/sessions/${sessionId}/process`);

export const getTablePreview = (sessionId, tableId, limit = 20) =>
  api.get(`/sessions/${sessionId}/tables/${tableId}/preview`, { params: { limit } });

// Domains
export const getDomains = () => api.get('/domains');

// ============ KEYWORD RULES ============

export const getKeywordRules = (includeInactive = false) =>
  api.get('/keyword-rules', { params: { include_inactive: includeInactive } });

export const createKeywordRule = (data) =>
  api.post('/keyword-rules', data);

export const updateKeywordRule = (ruleId, data) =>
  api.put(`/keyword-rules/${ruleId}`, data);

export const deleteKeywordRule = (ruleId) =>
  api.delete(`/keyword-rules/${ruleId}`);

// ============ DATABASE CONNECTIONS ============

export const getConnections = () => api.get('/connections');

export const createConnection = (data) =>
  api.post('/connections', null, { params: data });

export const testConnection = (data) =>
  api.post('/connections/test', data);

export const deleteConnection = (connectionId) =>
  api.delete(`/connections/${connectionId}`);

export const getConnectionTables = (connectionId) =>
  api.get(`/connections/${connectionId}/tables`);

export const getConnectionTableColumns = (connectionId, tableName) =>
  api.get(`/connections/${connectionId}/tables/${encodeURIComponent(tableName)}/columns`);

export const previewTableData = (connectionId, tableName, limit = 100) =>
  api.get(`/connections/${connectionId}/tables/${encodeURIComponent(tableName)}/preview`, { params: { limit } });

export const importTableFromDb = (sessionId, connectionId, tableName, limit = 10000) =>
  api.post(`/sessions/${sessionId}/import-from-db`, null, {
    params: { connection_id: connectionId, table_name: tableName, limit }
  });

export default api;
