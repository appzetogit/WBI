import api from '../../../services/api';

const BASE = '/vendor';

export const fetchCompanyCode = () => api.get(`${BASE}/company-code`);
export const regenerateCompanyCode = () => api.post(`${BASE}/regenerate-code`);
export const generateInviteLink = () => api.post(`${BASE}/generate-invite-link`);
export const fetchPendingEngineerApprovals = () => api.get(`${BASE}/engineers/pending-approvals`);
export const fetchLinkedEngineers = () => api.get(`${BASE}/engineers/linked`);
export const approveLinkedEngineer = (id) => api.post(`${BASE}/engineers/${id}/approve`);
export const rejectLinkedEngineer = (id, reason = '') =>
  api.post(`${BASE}/engineers/${id}/reject`, { reason });
