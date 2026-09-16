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
  }
};

export default b2bAdminService;
