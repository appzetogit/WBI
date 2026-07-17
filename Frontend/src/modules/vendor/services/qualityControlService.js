import api from '../../../services/api';

const BASE = '/vendor/quality';

export const fetchQCCounts = () => api.get(`${BASE}/counts`);

export const fetchProofs = (params = {}) => api.get(`${BASE}/proofs`, { params });
export const updateProof = (id, data) => api.patch(`${BASE}/proofs/${id}`, data);

export const fetchReviews = (params = {}) => api.get(`${BASE}/reviews`, { params });
export const updateReview = (id, data) => api.patch(`${BASE}/reviews/${id}`, data);

export const fetchClientApprovals = (params = {}) => api.get(`${BASE}/client-approvals`, { params });
export const fetchB2BApprovals = (params = {}) => api.get(`${BASE}/b2b-approvals`, { params });
export const updateApproval = (id, data) => api.patch(`${BASE}/approvals/${id}`, data);

export const fetchIssues = (params = {}) => api.get(`${BASE}/issues`, { params });
export const updateIssue = (id, data) => api.patch(`${BASE}/issues/${id}`, data);

export const fetchChangeRequests = (params = {}) => api.get(`${BASE}/change-requests`, { params });
export const updateChangeRequest = (id, data) => api.patch(`${BASE}/change-requests/${id}`, data);

export const fetchDamages = (params = {}) => api.get(`${BASE}/damage`, { params });
export const updateDamage = (id, data) => api.patch(`${BASE}/damage/${id}`, data);

export const formatINR = (n) => {
  if (!n && n !== 0) return '—';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
};

export const statusColors = {
  pending_review: 'bg-amber-50 text-amber-700 border-amber-100',
  under_review: 'bg-blue-50 text-blue-700 border-blue-100',
  approved: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  rejected: 'bg-red-50 text-red-700 border-red-100',
  resubmit_required: 'bg-orange-50 text-orange-700 border-orange-100',
  pending: 'bg-amber-50 text-amber-700 border-amber-100',
  passed: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  failed: 'bg-red-50 text-red-700 border-red-100',
  waiting_changes: 'bg-orange-50 text-orange-700 border-orange-100',
  open: 'bg-amber-50 text-amber-700 border-amber-100',
  in_progress: 'bg-blue-50 text-blue-700 border-blue-100',
  escalated: 'bg-red-50 text-red-700 border-red-100',
  resolved: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  closed: 'bg-gray-100 text-gray-500 border-gray-200',
  requested: 'bg-amber-50 text-amber-700 border-amber-100',
  under_approval: 'bg-blue-50 text-blue-700 border-blue-100',
  implementing: 'bg-indigo-50 text-indigo-700 border-indigo-100',
  reported: 'bg-amber-50 text-amber-700 border-amber-100',
  investigation: 'bg-blue-50 text-blue-700 border-blue-100',
  approval: 'bg-indigo-50 text-indigo-700 border-indigo-100',
  settlement: 'bg-violet-50 text-violet-700 border-violet-100',
  low: 'bg-gray-100 text-gray-600 border-gray-200',
  medium: 'bg-blue-50 text-blue-700 border-blue-100',
  high: 'bg-amber-50 text-amber-700 border-amber-100',
  critical: 'bg-red-50 text-red-700 border-red-100'
};
