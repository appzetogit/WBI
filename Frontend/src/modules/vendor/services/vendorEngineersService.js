import api from '../../../services/api';

/**
 * Fetch vendor engineers with real-time availability and counts
 * @param {Object} params { status, search, category, page, limit }
 */
export const fetchVendorEngineers = async (params = {}) => {
  const res = await api.get('/vendor/engineers', { params });
  return res.data;
};

/**
 * Fetch full profile, skills, active job, and history for a specific engineer
 * @param {string} id Engineer ID
 */
export const fetchVendorEngineerDetails = async (id) => {
  const res = await api.get(`/vendor/engineers/${id}`);
  return res.data;
};

/**
 * Fetch accepted unassigned jobs across User Projects, B2B Jobs, and Bookings
 * @param {Object} params { search }
 */
export const fetchAssignableJobs = async (params = {}) => {
  const res = await api.get('/vendor/engineers/assignable-jobs', { params });
  return res.data;
};

/**
 * Assign an accepted job to an engineer
 * @param {string} engineerId
 * @param {Object} payload { jobId, jobType, notes, priority }
 */
export const assignJobToEngineer = async (engineerId, payload) => {
  const res = await api.post(`/vendor/engineers/${engineerId}/assign-job`, payload);
  return res.data;
};

/**
 * Update engineer status (active/suspended) or availability
 * @param {string} engineerId
 * @param {Object} payload { action, status, availability }
 */
export const updateEngineerStatus = async (engineerId, payload) => {
  const res = await api.patch(`/vendor/engineers/${engineerId}/status`, payload);
  return res.data;
};

/**
 * Trigger manual workforce sync with linked engineers
 */
export const syncEngineers = async () => {
  const res = await api.post('/vendor/engineers/sync');
  return res.data;
};
