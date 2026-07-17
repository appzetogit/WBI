import api from '../../../services/api';

const BASE = '/vendor/resources';

export const fetchResCounts = () => api.get(`${BASE}/counts`);
export const fetchCapacity = () => api.get(`${BASE}/capacity`);
export const fetchInventory = (params = {}) => api.get(`${BASE}/inventory`, { params });
export const updateInventory = (id, data) => api.patch(`${BASE}/inventory/${id}`, data);
export const fetchTools = (params = {}) => api.get(`${BASE}/tools`, { params });
export const updateTool = (id, data) => api.patch(`${BASE}/tools/${id}`, data);
export const fetchWarehouses = (params = {}) => api.get(`${BASE}/warehouses`, { params });
export const fetchAssets = (params = {}) => api.get(`${BASE}/assets`, { params });
export const updateAsset = (id, data) => api.patch(`${BASE}/assets/${id}`, data);

export const formatINR = (n) => {
  if (!n && n !== 0) return '—';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
};

export const statusColors = {
  in_stock: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  low_stock: 'bg-amber-50 text-amber-700 border-amber-100',
  reserved: 'bg-blue-50 text-blue-700 border-blue-100',
  allocated: 'bg-indigo-50 text-indigo-700 border-indigo-100',
  damaged: 'bg-red-50 text-red-700 border-red-100',
  out_of_stock: 'bg-red-50 text-red-700 border-red-100',
  available: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  assigned: 'bg-blue-50 text-blue-700 border-blue-100',
  maintenance: 'bg-amber-50 text-amber-700 border-amber-100',
  lost: 'bg-gray-100 text-gray-600 border-gray-200',
  active: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  installed: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  inspection: 'bg-blue-50 text-blue-700 border-blue-100',
  repair: 'bg-orange-50 text-orange-700 border-orange-100',
  replacement: 'bg-violet-50 text-violet-700 border-violet-100',
  retired: 'bg-gray-100 text-gray-500 border-gray-200',
  green: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  yellow: 'bg-amber-50 text-amber-700 border-amber-100',
  red: 'bg-red-50 text-red-700 border-red-100'
};
