import api from './api';

const BASE = '/admin/payment-config';

const adminPaymentConfigService = {
  getConfig: async () => {
    const res = await api.get(BASE);
    return res.data;
  },
  updateConfig: async (payload) => {
    const res = await api.put(BASE, payload);
    return res.data;
  },
  getAuditLogs: async (params = {}) => {
    const res = await api.get(`${BASE}/audit-logs`, { params });
    return res.data;
  },
  getSettlements: async (params = {}) => {
    const res = await api.get(`${BASE}/settlements`, { params });
    return res.data;
  }
};

export default adminPaymentConfigService;
