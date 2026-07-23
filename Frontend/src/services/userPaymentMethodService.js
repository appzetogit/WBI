import api from './api';

const BASE = '/user/payment-methods';

const userPaymentMethodService = {
  getConfig: async () => {
    const res = await api.get(`${BASE}/config`);
    return res.data;
  },
  list: async () => {
    const res = await api.get(BASE);
    return res.data;
  },
  startInstrument: async (methodType) => {
    const res = await api.post(`${BASE}/instruments/start`, { methodType });
    return res.data;
  },
  confirmInstrument: async (payload) => {
    const res = await api.post(`${BASE}/instruments/confirm`, payload);
    return res.data;
  },
  verifyUpi: async (vpa) => {
    const res = await api.post(`${BASE}/upi/verify`, { vpa });
    return res.data;
  },
  setDefault: async (id, otp) => {
    const res = await api.patch(`${BASE}/${id}/default`, { otp });
    return res.data;
  },
  deleteMethod: async (id, otp) => {
    const res = await api.delete(`${BASE}/${id}`, { data: { otp } });
    return res.data;
  },
  setCodPreference: async (enabled) => {
    const res = await api.post(`${BASE}/cod-preference`, { enabled });
    return res.data;
  },
  sendSensitiveOtp: async () => {
    const res = await api.post(`${BASE}/sensitive/otp`);
    return res.data;
  },
  getHistory: async (params = {}) => {
    const res = await api.get(`${BASE}/history`, { params });
    return res.data;
  },
  getReceipt: async (id) => {
    const res = await api.get(`${BASE}/history/${id}/receipt`);
    return res.data;
  },
  downloadReceiptHtml: async (id) => {
    const res = await api.get(`${BASE}/history/${id}/receipt`, {
      params: { format: 'html' },
      responseType: 'text'
    });
    return res.data;
  },
  retryPayment: async (id) => {
    const res = await api.post(`${BASE}/history/${id}/retry`);
    return res.data;
  }
};

export default userPaymentMethodService;
