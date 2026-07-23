import api from '../../../services/api';

const BASE = '/vendor/global';

export const fetchGlobalCounts = () => api.get(`${BASE}/counts`);
export const fetchPerformance = (params = {}) => api.get(`${BASE}/performance`, { params });

export const fetchCompliance = (params = {}) => api.get(`${BASE}/compliance`, { params });
export const updateCompliance = (id, data) => api.patch(`${BASE}/compliance/${id}`, data);
export const syncCompliance = () => api.post(`${BASE}/compliance/sync`);
export const uploadComplianceDocument = (id, formData) =>
  api.post(`${BASE}/compliance/${id}/upload`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });

export const fetchGlobalNotifications = (params = {}) => api.get(`${BASE}/notifications`, { params });
export const updateGlobalNotification = (id, data) => api.patch(`${BASE}/notifications/${id}`, data);
export const bulkUpdateNotifications = (data) => api.post(`${BASE}/notifications/bulk`, data);
export const markAllNotificationsRead = () => api.post(`${BASE}/notifications/read-all`);
export const fetchNotificationPreferences = () => api.get(`${BASE}/notification-preferences`);
export const updateNotificationPreferences = (data) => api.patch(`${BASE}/notification-preferences`, data);

export const fetchSupportConfig = (params = {}) => api.get(`${BASE}/support/config`, { params });
export const fetchSupportTickets = (params = {}) => api.get(`${BASE}/support`, { params });
export const fetchSupportTicket = (id) => api.get(`${BASE}/support/${id}`);
export const createSupportTicket = (data) => api.post(`${BASE}/support`, data);
export const updateSupportTicket = (id, data) => api.patch(`${BASE}/support/${id}`, data);

export const fetchVendorSettings = () => api.get(`${BASE}/settings`);
export const updateVendorSettings = (data) => api.patch(`${BASE}/settings`, data);

export const formatINR = (value) => new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0
}).format(Number(value) || 0);

/** Build badge class from optional hex color in config; fallback neutrals */
export const badgeStyleFromColor = (hex) => {
  if (!hex) return {};
  return { borderColor: `${hex}55`, color: hex, backgroundColor: `${hex}14` };
};

export const statusColors = {
  verified: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  pending: 'bg-amber-50 text-amber-700 border-amber-100',
  expired: 'bg-red-50 text-red-700 border-red-100',
  rejected: 'bg-red-50 text-red-700 border-red-100',
  renewal_required: 'bg-orange-50 text-orange-700 border-orange-100',
  low: 'bg-gray-100 text-gray-600 border-gray-200',
  normal: 'bg-blue-50 text-blue-700 border-blue-100',
  medium: 'bg-blue-50 text-blue-700 border-blue-100',
  high: 'bg-amber-50 text-amber-700 border-amber-100',
  critical: 'bg-red-100 text-red-800 border-red-200',
  urgent: 'bg-red-50 text-red-700 border-red-100',
  open: 'bg-amber-50 text-amber-700 border-amber-100',
  assigned: 'bg-blue-50 text-blue-700 border-blue-100',
  investigation: 'bg-indigo-50 text-indigo-700 border-indigo-100',
  in_progress: 'bg-indigo-50 text-indigo-700 border-indigo-100',
  waiting: 'bg-purple-50 text-purple-700 border-purple-100',
  escalation: 'bg-red-50 text-red-700 border-red-100',
  resolved: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  vendor_confirmation: 'bg-teal-50 text-teal-700 border-teal-100',
  reopened: 'bg-orange-50 text-orange-700 border-orange-100',
  closed: 'bg-gray-100 text-gray-500 border-gray-200',
  good: 'bg-blue-50 text-blue-700 border-blue-100',
  excellent: 'bg-emerald-50 text-emerald-700 border-emerald-100'
};
