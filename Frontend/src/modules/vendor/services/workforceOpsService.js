import api from '../../../services/api';

const BASE = '/vendor/workforce';

export const fetchWFCounts = () => api.get(`${BASE}/counts`);
export const syncWorkforce = () => api.post(`${BASE}/sync`);
export const fetchEngineers = (params = {}) => api.get(`${BASE}/engineers`, { params });
export const updateEngineer = (id, data) => api.patch(`${BASE}/engineers/${id}`, data);

export const fetchTeams = (params = {}) => api.get(`${BASE}/teams`, { params });
export const fetchStructure = () => api.get(`${BASE}/structure`);
export const fetchSkillMatrix = (params = {}) => api.get(`${BASE}/skills`, { params });

export const fetchAssignments = (params = {}) => api.get(`${BASE}/assignments`, { params });
export const updateAssignment = (id, data) => api.patch(`${BASE}/assignments/${id}`, data);

export const fetchAvailability = (params = {}) => api.get(`${BASE}/availability`, { params });
export const fetchAttendance = (params = {}) => api.get(`${BASE}/attendance`, { params });
export const fetchLeaves = (params = {}) => api.get(`${BASE}/leaves`, { params });
export const updateLeave = (id, data) => api.patch(`${BASE}/leaves/${id}`, data);
export const fetchCertifications = (params = {}) => api.get(`${BASE}/certifications`, { params });

export const formatINR = (n) => {
  if (!n && n !== 0) return '—';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
};

export const statusColors = {
  active: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  suspended: 'bg-amber-50 text-amber-700 border-amber-100',
  deactivated: 'bg-gray-100 text-gray-500 border-gray-200',
  onboarding: 'bg-blue-50 text-blue-700 border-blue-100',
  available: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  busy: 'bg-amber-50 text-amber-700 border-amber-100',
  on_project: 'bg-blue-50 text-blue-700 border-blue-100',
  traveling: 'bg-indigo-50 text-indigo-700 border-indigo-100',
  leave: 'bg-orange-50 text-orange-700 border-orange-100',
  offline: 'bg-gray-100 text-gray-600 border-gray-200',
  assigned: 'bg-blue-50 text-blue-700 border-blue-100',
  in_progress: 'bg-indigo-50 text-indigo-700 border-indigo-100',
  completed: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  rejected: 'bg-red-50 text-red-700 border-red-100',
  escalated: 'bg-red-50 text-red-700 border-red-100',
  pending: 'bg-amber-50 text-amber-700 border-amber-100',
  approved: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  manager_approved: 'bg-blue-50 text-blue-700 border-blue-100',
  verified: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  renewal_due: 'bg-amber-50 text-amber-700 border-amber-100',
  expired: 'bg-red-50 text-red-700 border-red-100',
  present: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  late: 'bg-amber-50 text-amber-700 border-amber-100',
  absent: 'bg-red-50 text-red-700 border-red-100',
  on_leave: 'bg-orange-50 text-orange-700 border-orange-100',
  deployed: 'bg-blue-50 text-blue-700 border-blue-100',
  idle: 'bg-gray-100 text-gray-600 border-gray-200'
};
