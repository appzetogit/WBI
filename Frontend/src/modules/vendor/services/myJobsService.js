import api from '../../../services/api';

/**
 * Fetch list of vendor accepted jobs with filters & pagination
 * @param {Object} params - { source: 'all'|'user'|'b2b', status: 'all'|'new'|'accepted'|'assigned'|'dispatched'|'en_route'|'in_progress'|'completed', search: '', priority: '', page: 1, limit: 20 }
 */
export const fetchMyJobs = async (params = {}) => {
  const res = await api.get('/vendor/my-jobs', { params });
  return res.data;
};

/**
 * Fetch detailed job payload including timeline, engineer, customer, photos, notes, OTP, signature, proof
 * @param {string} id - Job ID
 */
export const fetchJobDetails = async (id) => {
  const res = await api.get(`/vendor/my-jobs/${id}`);
  return res.data;
};

/**
 * Assign engineer to a job
 * @param {string} id - Job ID
 * @param {Object} data - { engineerId: string, notes?: string, priority?: string }
 */
export const assignEngineerToJob = async (id, data) => {
  const res = await api.post(`/vendor/my-jobs/${id}/assign-engineer`, data);
  return res.data;
};

/**
 * Update job operational status (e.g. dispatch or verify)
 * @param {string} id - Job ID
 * @param {Object} data - { status: string, remarks?: string }
 */
export const updateJobStatus = async (id, data) => {
  const res = await api.post(`/vendor/my-jobs/${id}/status`, data);
  return res.data;
};
