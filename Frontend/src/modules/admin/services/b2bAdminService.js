import api from '../../../services/api';

const b2bAdminService = {
  getSubmissions: async (params = {}) => {
    const response = await api.get('/admin/b2b/jobs/submissions', { params });
    return response.data;
  },

  getSubmissionDetail: async (jobId) => {
    const response = await api.get(`/admin/b2b/jobs/submissions/${jobId}`);
    return response.data;
  },

  approveSubmission: async (jobId, payload = {}) => {
    const response = await api.post(`/admin/b2b/jobs/submissions/${jobId}/approve`, payload);
    return response.data;
  },

  rejectSubmission: async (jobId, payload) => {
    const response = await api.post(`/admin/b2b/jobs/submissions/${jobId}/reject`, payload);
    return response.data;
  },

  // ── Routing / unassigned queue (central job model) ──
  getUnassignedQueue: async (params = {}) => {
    const response = await api.get('/routing/unassigned', { params });
    return response.data;
  },

  retryRouting: async (jobIds, payload = {}) => {
    const response = await api.post('/routing/retry', { jobIds, ...payload });
    return response.data;
  },

  getVendorCandidates: async (jobId) => {
    const response = await api.get(`/routing/jobs/${jobId}/candidates`);
    return response.data;
  },

  routeToVendor: async (jobId, payload) => {
    const response = await api.post(`/routing/jobs/${jobId}/vendor`, payload);
    return response.data;
  },

  getEligibleEngineers: async (jobId) => {
    const response = await api.get(`/jobs/${jobId}/eligible-engineers`);
    return response.data;
  },

  assignEngineer: async (jobId, payload) => {
    const response = await api.post(`/jobs/${jobId}/assign`, payload);
    return response.data;
  },

  getJobTimeline: async (jobId) => {
    const response = await api.get(`/jobs/${jobId}/timeline`);
    return response.data;
  }
};

export default b2bAdminService;
