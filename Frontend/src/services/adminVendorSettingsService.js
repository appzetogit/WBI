import api from './api';

const BASE = '/admin/vendor-settings';

const adminVendorSettingsService = {
  getConfig: async () => {
    const res = await api.get(`${BASE}/config`);
    return res.data;
  },
  saveConfig: async (payload) => {
    const res = await api.put(`${BASE}/config`, payload);
    return res.data;
  },
  getVendorSettings: async (vendorId) => {
    const res = await api.get(`${BASE}/vendors/${vendorId}`);
    return res.data;
  },
  updateVendorSettings: async (vendorId, payload) => {
    const res = await api.put(`${BASE}/vendors/${vendorId}`, payload);
    return res.data;
  }
};

export default adminVendorSettingsService;
