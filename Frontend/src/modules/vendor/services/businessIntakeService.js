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
  client_request: { label: 'Client Request', color: 'bg-blue-100 text-blue-700' },
  b2b_opportunity: { label: 'B2B Opportunity', color: 'bg-purple-100 text-purple-700' },
  bulk_requirement: { label: 'Bulk Requirement', color: 'bg-orange-100 text-orange-700' },
  bid_quote_request: { label: 'RFQ / Bid', color: 'bg-green-100 text-green-700' },
  direct_invitation: { label: 'Direct Invitation', color: 'bg-amber-100 text-amber-700' }
};

export const priorityConfig = {
  normal: { label: 'Normal', color: 'text-gray-500' },
  high: { label: 'High Priority', color: 'text-orange-500' },
  urgent: { label: '🔴 Urgent', color: 'text-red-600' }
};
