/**
 * Business Intake API Service
 * All calls use vendor JWT from localStorage/cookies (handled by `api` axios instance)
 */
import api from '../../../services/api';

const BASE = '/vendor/business-intake';

// ── Opportunities ────────────────────────────────────────
export const fetchOpportunities = (params = {}) =>
  api.get(`${BASE}/opportunities`, { params });

export const fetchOpportunityById = (id) =>
  api.get(`${BASE}/opportunities/${id}`);

export const submitBid = (id, data) =>
  api.post(`${BASE}/opportunities/${id}/bid`, data);

export const updateBid = (id, bidId, data) =>
  api.put(`${BASE}/opportunities/${id}/bid/${bidId}`, data);

// ── Invitations ──────────────────────────────────────────
export const fetchInvitations = (params = {}) =>
  api.get(`${BASE}/invitations`, { params });

export const acceptInvitation = (id) =>
  api.post(`${BASE}/invitations/${id}/accept`);

export const declineInvitation = (id, reason) =>
  api.post(`${BASE}/invitations/${id}/decline`, { reason });

// ── Proposals ────────────────────────────────────────────
export const fetchProposals = (params = {}) =>
  api.get(`${BASE}/proposals`, { params });

export const fetchProposalById = (id) =>
  api.get(`${BASE}/proposals/${id}`);

export const createProposal = (data) =>
  api.post(`${BASE}/proposals`, data);

export const updateProposal = (id, data) =>
  api.put(`${BASE}/proposals/${id}`, data);

export const sendProposal = (id) =>
  api.post(`${BASE}/proposals/${id}/send`);

export const downloadProposalPdf = (id) =>
  api.get(`${BASE}/proposals/${id}/download-pdf`, { responseType: 'blob' });

// ── Accepted Work ─────────────────────────────────────────
export const fetchAcceptedWork = (params = {}) =>
  api.get(`${BASE}/accepted-work`, { params });

// ── Counts (Sidebar Badges) ───────────────────────────────
export const fetchCounts = () =>
  api.get(`${BASE}/counts`);

// ── Utility: Format ₹ ────────────────────────────────────
export const formatINR = (amount) => {
  if (!amount && amount !== 0) return '—';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(amount);
};

export const formatBudget = (budget) => {
  if (!budget) return '—';
  const { min, max, type } = budget;
  const suffix = type === 'per_site' ? '/site' : type === 'per_month' ? '/month' : '';
  if (min && max) return `${formatINR(min)} – ${formatINR(max)}${suffix}`;
  if (max) return `Up to ${formatINR(max)}${suffix}`;
  if (min) return `From ${formatINR(min)}${suffix}`;
  return '—';
};

export const deadlineCountdown = (deadline) => {
  if (!deadline) return null;
  const diff = new Date(deadline) - new Date();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);
  if (diff < 0) return { text: 'Expired', expired: true, urgent: true };
  if (hours < 24) return { text: `${hours}h left`, expired: false, urgent: true };
  if (days < 3) return { text: `${days}d left`, expired: false, urgent: true };
  return { text: `${days} days left`, expired: false, urgent: false };
};

export const typeLabels = {
  client_request: { label: 'Client Request', badge: 'Individual Client', color: 'bg-blue-50 text-blue-700 border border-blue-100' },
  b2b_opportunity: { label: 'B2B Opportunity', badge: 'B2B Opportunity', color: 'bg-violet-50 text-violet-700 border border-violet-100' },
  bulk_requirement: { label: 'Bulk Requirement', badge: 'Bulk Requirement', color: 'bg-orange-50 text-orange-700 border border-orange-100' },
  bid_quote_request: { label: 'RFQ / Bid', badge: 'Bid Request', color: 'bg-emerald-50 text-emerald-700 border border-emerald-100' },
  direct_invitation: { label: 'Direct Invitation', badge: 'Direct Invitation', color: 'bg-amber-50 text-amber-700 border border-amber-100' }
};

export const getActionLabel = (type) => {
  switch (type) {
    case 'client_request': return 'Accept';
    case 'b2b_opportunity': return 'Bid Now';
    case 'bulk_requirement': return 'Submit Quote';
    case 'bid_quote_request': return 'Submit Quote';
    case 'direct_invitation': return 'Respond';
    default: return 'Apply';
  }
};

export const timeAgo = (date) => {
  if (!date) return '';
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

export const priorityConfig = {
  normal: { label: 'Normal', color: 'text-gray-500' },
  high: { label: 'High Priority', color: 'text-orange-500' },
  urgent: { label: '🔴 Urgent', color: 'text-red-600' }
};
