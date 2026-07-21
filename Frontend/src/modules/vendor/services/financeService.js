import api from '../../../services/api';

const BASE = '/vendor/finance';

export const fetchFinanceCounts = () => api.get(`${BASE}/counts`);
export const fetchEarningsByService = () => api.get(`${BASE}/earnings-by-service`);
export const fetchWallet = (params = {}) => api.get(`${BASE}/wallet`, { params });
export const requestWithdrawal = (amount) => api.post(`${BASE}/wallet/withdraw`, { amount });

export const fetchClientReceivables = (params = {}) => api.get(`${BASE}/client-receivables`, { params });
export const fetchB2BReceivables = (params = {}) => api.get(`${BASE}/b2b-receivables`, { params });
export const updateReceivable = (id, data) => api.patch(`${BASE}/receivables/${id}`, data);

export const fetchQuotations = (params = {}) => api.get(`${BASE}/quotations`, { params });
export const fetchInvoices = (params = {}) => api.get(`${BASE}/invoices`, { params });
export const updateFinanceDocument = (id, data) => api.patch(`${BASE}/documents/${id}`, data);

export const fetchPaymentMilestones = (params = {}) => api.get(`${BASE}/milestones`, { params });
export const updatePaymentMilestone = (id, data) => api.patch(`${BASE}/milestones/${id}`, data);

export const formatINR = (value) => new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0
}).format(Number(value) || 0);

export const statusColors = {
  pending: 'bg-amber-50 text-amber-700 border-amber-100',
  processing: 'bg-blue-50 text-blue-700 border-blue-100',
  completed: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  failed: 'bg-red-50 text-red-700 border-red-100',
  partial: 'bg-blue-50 text-blue-700 border-blue-100',
  paid: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  overdue: 'bg-red-50 text-red-700 border-red-100',
  cancelled: 'bg-gray-100 text-gray-500 border-gray-200',
  draft: 'bg-gray-100 text-gray-600 border-gray-200',
  sent: 'bg-blue-50 text-blue-700 border-blue-100',
  negotiation: 'bg-violet-50 text-violet-700 border-violet-100',
  approved: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  rejected: 'bg-red-50 text-red-700 border-red-100',
  expired: 'bg-gray-100 text-gray-500 border-gray-200',
  issued: 'bg-indigo-50 text-indigo-700 border-indigo-100',
  upcoming: 'bg-gray-100 text-gray-600 border-gray-200',
  due: 'bg-amber-50 text-amber-700 border-amber-100',
  qa_pending: 'bg-orange-50 text-orange-700 border-orange-100',
  approval_pending: 'bg-violet-50 text-violet-700 border-violet-100',
  invoice_ready: 'bg-blue-50 text-blue-700 border-blue-100',
  invoiced: 'bg-indigo-50 text-indigo-700 border-indigo-100',
  blocked: 'bg-red-50 text-red-700 border-red-100'
};
