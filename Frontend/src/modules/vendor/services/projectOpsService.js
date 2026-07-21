import api from '../../../services/api';

const BASE = '/vendor/project-ops';

export const fetchPOCounts = () => api.get(`${BASE}/counts`);
export const fetchProjects = (params = {}) => api.get(`${BASE}/projects`, { params });
export const createProject = (data) => api.post(`${BASE}/projects`, data);
export const fetchProjectById = (id) => api.get(`${BASE}/projects/${id}`);
export const updateProject = (id, data) => api.patch(`${BASE}/projects/${id}`, data);

export const fetchSites = (params = {}) => api.get(`${BASE}/sites`, { params });
export const siteCheckIn = (id) => api.post(`${BASE}/sites/${id}/check-in`);
export const siteCheckOut = (id) => api.post(`${BASE}/sites/${id}/check-out`);

export const fetchMilestones = (params = {}) => api.get(`${BASE}/milestones`, { params });
export const updateMilestone = (id, data) => api.patch(`${BASE}/milestones/${id}`, data);

export const fetchDispatches = (params = {}) => api.get(`${BASE}/dispatch`, { params });
export const assignDispatch = (id, data) => api.post(`${BASE}/dispatch/${id}/assign`, data);

export const fetchAssignableEngineers = (params = {}) => api.get(`${BASE}/engineers`, { params });
export const assignEngineerToProject = (projectId, data) =>
  api.post(`${BASE}/projects/${projectId}/assign-engineer`, data);
export const fetchProjectJobs = (projectId) => api.get(`${BASE}/projects/${projectId}/jobs`);

export const fetchLiveOps = () => api.get(`${BASE}/live`);
export const fetchCalendar = (params = {}) => api.get(`${BASE}/calendar`, { params });

export const formatINR = (n) => {
  if (!n && n !== 0) return '—';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
};

export const statusColors = {
  draft: 'bg-gray-100 text-gray-700 border-gray-200',
  planning: 'bg-blue-50 text-blue-700 border-blue-100',
  in_progress: 'bg-indigo-50 text-indigo-700 border-indigo-100',
  on_hold: 'bg-amber-50 text-amber-700 border-amber-100',
  at_risk: 'bg-red-50 text-red-700 border-red-100',
  completed: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  archived: 'bg-gray-100 text-gray-500 border-gray-200',
  pending: 'bg-amber-50 text-amber-700 border-amber-100',
  active: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  blocked: 'bg-red-50 text-red-700 border-red-100',
  overdue: 'bg-red-50 text-red-700 border-red-100',
  available: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  on_job: 'bg-blue-50 text-blue-700 border-blue-100',
  on_leave: 'bg-amber-50 text-amber-700 border-amber-100',
  offline: 'bg-gray-100 text-gray-600 border-gray-200',
  todo: 'bg-gray-100 text-gray-600',
  done: 'bg-emerald-50 text-emerald-700',
  rejected: 'bg-red-50 text-red-700'
};
