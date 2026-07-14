/**
 * WBI Project OS — API Service Layer
 */
import api from '../../../services/api';

// ─── Templates ────────────────────────────────────────────────────────────────
export const templateApi = {
  getAll: (params) => api.get('/project-os/templates', { params }),
  getById: (id) => api.get(`/project-os/templates/${id}`),
  getRegistries: () => api.get('/project-os/registries'),
  create: (data) => api.post('/project-os/admin/templates', data),
  update: (id, data) => api.patch(`/project-os/admin/templates/${id}`, data),
  validate: (id) => api.post(`/project-os/admin/templates/${id}/validate`),
  publish: (id, note) => api.post(`/project-os/admin/templates/${id}/publish`, { note }),
  clone: (id, data) => api.post(`/project-os/admin/templates/${id}/clone`, data),
  deprecate: (id) => api.post(`/project-os/admin/templates/${id}/deprecate`),
};

// ─── Projects ─────────────────────────────────────────────────────────────────
export const projectApi = {
  getAll: (params) => api.get('/project-os/projects', { params }),
  getById: (id) => api.get(`/project-os/projects/${id}`),
  create: (data) => api.post('/project-os/projects', data),
  update: (id, data) => api.patch(`/project-os/projects/${id}`, data),
  delete: (id) => api.delete(`/project-os/projects/${id}`),
  transition: (id, toStatus, reason) => api.post(`/project-os/projects/${id}/transition`, { toStatus, reason }),

  // Dashboard endpoints
  getDashboard: (id) => api.get(`/project-os/projects/${id}/dashboard`),
  getModules: (id) => api.get(`/project-os/projects/${id}/modules`),
  getMetrics: (id, keys) => api.get(`/project-os/projects/${id}/metrics`, { params: keys ? { keys: keys.join(',') } : {} }),
};

// ─── Sites ────────────────────────────────────────────────────────────────────
export const siteApi = {
  getAll: (projectId, params) => api.get(`/project-os/projects/${projectId}/sites`, { params }),
  getById: (siteId) => api.get(`/project-os/sites/${siteId}`),
  create: (projectId, data) => api.post(`/project-os/projects/${projectId}/sites`, data),
  update: (siteId, data) => api.patch(`/project-os/sites/${siteId}`, data),
  bulkImport: (projectId, file) => {
    const fd = new FormData();
    fd.append('file', file);
    return api.post(`/project-os/projects/${projectId}/sites/import`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  getImportTemplate: (projectId) => api.get(`/project-os/projects/${projectId}/sites/import-template`, { responseType: 'blob' }),
};

// ─── Tasks ────────────────────────────────────────────────────────────────────
export const taskApi = {
  getAll: (projectId, params) => api.get(`/project-os/projects/${projectId}/tasks`, { params }),
  getById: (taskId) => api.get(`/project-os/tasks/${taskId}`),
  create: (projectId, data) => api.post(`/project-os/projects/${projectId}/tasks`, data),
  update: (taskId, data) => api.patch(`/project-os/tasks/${taskId}`, data),
  assign: (taskId, data) => api.post(`/project-os/tasks/${taskId}/assign`, data),
  transition: (taskId, toStatus, options = {}) => api.post(`/project-os/tasks/${taskId}/transition`, { toStatus, ...options }),
  submitForm: (taskId, formId, data) => api.post(`/project-os/tasks/${taskId}/forms/${formId}/submit`, data),
};

// ─── Milestones ───────────────────────────────────────────────────────────────
export const milestoneApi = {
  getAll: (projectId) => api.get(`/project-os/projects/${projectId}/milestones`),
  create: (projectId, data) => api.post(`/project-os/projects/${projectId}/milestones`, data),
  update: (milestoneId, data) => api.patch(`/project-os/milestones/${milestoneId}`, data),
};

// ─── Issues ───────────────────────────────────────────────────────────────────
export const issueApi = {
  getAll: (projectId, params) => api.get(`/project-os/projects/${projectId}/issues`, { params }),
  create: (projectId, data) => api.post(`/project-os/projects/${projectId}/issues`, data),
  update: (issueId, data) => api.patch(`/project-os/issues/${issueId}`, data),
};

// ─── Activity ─────────────────────────────────────────────────────────────────
export const activityApi = {
  getAll: (projectId, params) => api.get(`/project-os/projects/${projectId}/activity`, { params }),
};

// ─── Finance ──────────────────────────────────────────────────────────────────
export const financeApi = {
  getSummary: (projectId) => api.get(`/project-os/projects/${projectId}/finance`),
};
