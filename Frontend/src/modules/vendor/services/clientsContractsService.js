/**
 * Clients & Contracts API Service
 */
import api from '../../../services/api';

const BASE = '/vendor/clients-contracts';

export const fetchCCCounts = () => api.get(`${BASE}/counts`);

export const fetchClients = (params = {}) => api.get(`${BASE}/clients`, { params });
export const fetchClientById = (id) => api.get(`${BASE}/clients/${id}`);
export const createClient = (data) => api.post(`${BASE}/clients`, data);
export const updateClient = (id, data) => api.patch(`${BASE}/clients/${id}`, data);

export const fetchContracts = (params = {}) => api.get(`${BASE}/contracts`, { params });
export const fetchContractById = (id) => api.get(`${BASE}/contracts/${id}`);
export const createContract = (data) => api.post(`${BASE}/contracts`, data);
export const updateContract = (id, data) => api.patch(`${BASE}/contracts/${id}`, data);

export const fetchScopeChanges = (params = {}) => api.get(`${BASE}/scope-changes`, { params });
export const createScopeChange = (data) => api.post(`${BASE}/scope-changes`, data);
export const updateScopeChange = (id, data) => api.patch(`${BASE}/scope-changes/${id}`, data);

export const fetchConversations = (params = {}) => api.get(`${BASE}/conversations`, { params });
export const fetchConversationById = (id) => api.get(`${BASE}/conversations/${id}`);
export const sendConversationMessage = (id, data) => api.post(`${BASE}/conversations/${id}/messages`, data);

export const fetchCCProposals = (params = {}) => api.get(`${BASE}/proposals`, { params });

export const formatINR = (amount) => {
  if (!amount && amount !== 0) return '—';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(amount);
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

export const statusColors = {
  active: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  inactive: 'bg-gray-100 text-gray-600 border-gray-200',
  prospect: 'bg-blue-50 text-blue-700 border-blue-100',
  draft: 'bg-gray-100 text-gray-700 border-gray-200',
  pending_signature: 'bg-amber-50 text-amber-700 border-amber-100',
  expired: 'bg-orange-50 text-orange-700 border-orange-100',
  terminated: 'bg-red-50 text-red-700 border-red-100',
  pending: 'bg-amber-50 text-amber-700 border-amber-100',
  approved: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  rejected: 'bg-red-50 text-red-700 border-red-100'
};
