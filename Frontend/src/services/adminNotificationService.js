import api from './api';

const BASE = '/admin/notifications';

const adminNotificationService = {
  getDeliveryLogs: async (params = {}) => {
    const res = await api.get(`${BASE}/delivery-logs`, { params });
    return res.data;
  },
  listEvents: async () => {
    const res = await api.get(`${BASE}/events`);
    return res.data;
  },
  announce: async (payload) => {
    const res = await api.post(`${BASE}/announce`, payload);
    return res.data;
  },
  testEmit: async (payload) => {
    const res = await api.post(`${BASE}/test-emit`, payload);
    return res.data;
  }
};

export default adminNotificationService;
