import api from '../../../services/api';

/**
 * Vendor Management API client (central job entity).
 * Every endpoint is scoped server-side to the logged-in vendor; the vendor id
 * here only selects the URL — the backend returns 403 for any other vendor.
 */

const decodeJwtUserId = (token) => {
  try {
    const payload = JSON.parse(atob(String(token).split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload.userId || payload.id || null;
  } catch {
    return null;
  }
};

export const getVendorId = () => {
  try {
    const data = JSON.parse(localStorage.getItem('vendorData') || '{}');
    if (data._id || data.id) return String(data._id || data.id);
  } catch {
    /* fall through */
  }
  return decodeJwtUserId(localStorage.getItem('vendorAccessToken'));
};

const v = (path) => `/vendors/${getVendorId()}${path}`;
const data = (res) => res.data;

// ── Jobs ────────────────────────────────────────────────────────────────
export const listJobs = (params) => api.get(v('/jobs'), { params }).then(data);
export const getJob = (id) => api.get(`/jobs/${id}`).then(data);
export const getJobTimeline = (id) => api.get(`/jobs/${id}/timeline`).then(data);
export const getJobAssignments = (id) => api.get(`/jobs/${id}/assignments`).then(data);
export const getEligibleEngineers = (id) => api.get(`/jobs/${id}/eligible-engineers`).then(data);
export const acceptJob = (id) => api.post(`/jobs/${id}/accept`).then(data);
export const declineJob = (id, reason) => api.post(`/jobs/${id}/decline`, { reason }).then(data);
export const releaseJob = (id, reason) => api.post(`/jobs/${id}/release`, { reason }).then(data);
export const assignJob = (id, engineerId, notes) => api.post(`/jobs/${id}/assign`, { engineerId, notes }).then(data);
export const reassignJob = (id, engineerId, reason) => api.post(`/jobs/${id}/reassign`, { engineerId, reason }).then(data);
export const transitionJob = (id, to, reason) => api.post(`/jobs/${id}/transition`, { to, reason }).then(data);
export const bulkAssign = (assignments) => api.post('/jobs/bulk-assign', { assignments }).then(data);

// ── Vendor-scoped views ───────────────────────────────────────────────────
export const getDashboard = (params) => api.get(v('/dashboard'), { params }).then(data);
export const getAnalytics = (params) => api.get(v('/analytics'), { params }).then(data);
export const listEngineers = (params) => api.get(v('/engineers'), { params }).then(data);
export const listAssignments = (params) => api.get(v('/assignments'), { params }).then(data);
export const listPayments = (params) => api.get(v('/payments'), { params }).then(data);
export const listSettlements = (params) => api.get(v('/settlements'), { params }).then(data);
export const downloadSettlement = (settlementId) =>
  api.get(v(`/settlements/${settlementId}/download`), { responseType: 'blob' }).then((res) => res.data);
export const getCoverage = () => api.get(v('/service-coverage')).then(data);
export const saveCoverage = (serviceKey, body) => api.put(v(`/service-coverage/${serviceKey}`), body).then(data);

// ── Assignments ───────────────────────────────────────────────────────────
export const getAssignmentQueue = (params) => api.get(v('/assignments/queue'), { params }).then(data);
export const autoAssignJobs = (jobIds) => api.post(v('/assignments/auto'), { jobIds }).then(data);
export const getReassignable = () => api.get(v('/assignments/reassignable')).then(data);

// ── Services ──────────────────────────────────────────────────────────────
export const getMyServices = () => api.get(v('/services')).then(data);
export const getServiceKeys = () => api.get(v('/service-keys')).then(data);
export const resolveServiceName = (params) => api.get(v('/service-keys/resolve'), { params }).then(data);
export const getServiceAreas = () => api.get(v('/service-areas')).then(data);
export const updateServiceAreas = (body) => api.post(v('/service-areas'), body).then(data);

// ── Parts ─────────────────────────────────────────────────────────────────
export const getPartsCatalog = (params) => api.get(v('/parts/catalog'), { params }).then(data);
export const getInventory = (params) => api.get(v('/parts/inventory'), { params }).then(data);
export const createInventoryItem = (body) => api.post(v('/parts/inventory'), body).then(data);
export const adjustInventoryItem = (id, body) => api.patch(v(`/parts/inventory/${id}`), body).then(data);
export const getInventoryMovements = (id) => api.get(v(`/parts/inventory/${id}/movements`)).then(data);
export const listJobParts = (params) => api.get(v('/parts/jobs'), { params }).then(data);
export const addRequiredPart = (body) => api.post(v('/parts/jobs'), body).then(data);
export const recordUsedPart = (body) => api.post(v('/parts/jobs/used'), body).then(data);
export const reserveJobPart = (id) => api.post(v(`/parts/jobs/${id}/reserve`)).then(data);
export const markJobPartUsed = (id, body = {}) => api.post(v(`/parts/jobs/${id}/use`), body).then(data);
export const cancelJobPart = (id, reason) => api.post(v(`/parts/jobs/${id}/cancel`), { reason }).then(data);

// ── Engineers ─────────────────────────────────────────────────────────────
export const addEngineer = (body) => api.post('/vendor/engineers', body).then(data);
export const updateEngineer = (id, body) => api.patch(`/vendor/engineers/${id}`, body).then(data);
export const getEngineer = (id) => api.get(v(`/engineers/${id}`)).then(data);
export const getEngineerSkills = () => api.get(v('/engineers/skills')).then(data);
export const getEngineerPerformance = (params) => api.get(v('/engineers/performance'), { params }).then(data);
export const deactivateEngineer = (id, reason) => api.post(v(`/engineers/${id}/deactivate`), { reason }).then(data);
export const activateEngineer = (id) => api.post(v(`/engineers/${id}/activate`)).then(data);
export const approveEngineerJoin = (id) => api.post(v(`/engineers/${id}/approve`)).then(data);
export const rejectEngineerJoin = (id, reason) => api.post(v(`/engineers/${id}/reject`), { reason }).then(data);

/** Human-readable message from an API error (backend sends { message }). */
export const errorMessage = (err, fallback = 'Something went wrong') =>
  err?.response?.data?.message || err?.message || fallback;
