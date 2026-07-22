import api from './api';

const BASE = '/admin/vendor-support';

const adminVendorSupportService = {
  getConfig: async (params = {}) => {
    const res = await api.get(`${BASE}/config`, { params });
    return res.data;
  },
  saveConfig: async (payload) => {
    const res = await api.put(`${BASE}/config`, payload);
    return res.data;
  },
  listTickets: async (params = {}) => {
    const res = await api.get(`${BASE}/tickets`, { params });
    return res.data;
  },
  getTicket: async (id) => {
    const res = await api.get(`${BASE}/tickets/${id}`);
    return res.data;
  },
  transition: async (id, payload) => {
    const res = await api.post(`${BASE}/tickets/${id}/transition`, payload);
    return res.data;
  },
  comment: async (id, payload) => {
    const res = await api.post(`${BASE}/tickets/${id}/comments`, payload);
    return res.data;
  },
  analytics: async (params = {}) => {
    const res = await api.get(`${BASE}/analytics`, { params });
    return res.data;
  },
  exportTickets: async () => {
    const res = await api.get(`${BASE}/tickets/export`, { responseType: 'blob' });
    const blob = new Blob([res.data], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'vendor-support-tickets.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  }
};

export default adminVendorSupportService;
