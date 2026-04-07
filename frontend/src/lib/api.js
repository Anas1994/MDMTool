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

export default api;
