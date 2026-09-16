import api from '../../../services/api';

/**
 * Fetch filtered/paginated list of User Projects & B2B Jobs
 * @param {Object} params - { source, status, search, category, priority, page, limit }
 */
export const fetchRequests = (params = {}) => {
  return api.get('/vendor/requests', { params });
};

/**
 * Fetch detailed view of a request by ID
 * @param {string} id - Request ID
 */
export const fetchRequestById = (id) => {
  return api.get(`/vendor/requests/${id}`);
};

/**
 * Accept a User Request or B2B Job
 * @param {string} id - Request ID
 * @param {Object} data - { amount, proposalText, timeline, teamSize }
 */
export const acceptRequest = (id, data = {}) => {
  return api.post(`/vendor/requests/${id}/accept`, data);
};

/**
 * Reject / decline a request
 * @param {string} id - Request ID
 * @param {string} reason - Rejection reason
 */
export const rejectRequest = (id, reason = '') => {
  return api.post(`/vendor/requests/${id}/reject`, { reason });
};

/**
 * Assign an engineer to an accepted project / job
 * @param {string} id - Project ID or B2B Job ID
 * @param {Object} data - { engineerId, notes, scheduledAt }
 */
export const assignEngineerToRequest = (id, data = {}) => {
  return api.post(`/vendor/requests/${id}/assign-engineer`, data);
};
