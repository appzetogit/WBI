import api from './api';

const BASE = '/registration-drafts';

const registrationDraftService = {
  upsert: async (payload) => {
    const res = await api.post(BASE, payload);
    return res.data;
  },
  get: async (draftKey, role) => {
    const res = await api.get(`${BASE}/${encodeURIComponent(draftKey)}`, {
      params: role ? { role } : undefined
    });
    return res.data;
  },
  getByPhone: async (role, phone) => {
    const res = await api.get(`${BASE}/by-phone`, { params: { role, phone } });
    return res.data;
  },
  remove: async (draftKey, role) => {
    const res = await api.delete(`${BASE}/${encodeURIComponent(draftKey)}`, {
      params: role ? { role } : undefined
    });
    return res.data;
  }
};

export default registrationDraftService;
