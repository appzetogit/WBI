import api from '../../../services/api';

const vendorOfferingService = {
  getServiceOptions: async (params) => {
    const res = await api.get('/vendors/service-offerings/options', { params });
    return res.data;
  },
  getServiceSummary: async () => {
    const res = await api.get('/vendors/service-offerings/summary');
    return res.data;
  },
  getServiceOfferings: async (params) => {
    const res = await api.get('/vendors/service-offerings', { params });
    return res.data;
  },
  createServiceOffering: async (data) => {
    const res = await api.post('/vendors/service-offerings', data);
    return res.data;
  },
  updateServiceOffering: async (id, data) => {
    const res = await api.patch(`/vendors/service-offerings/${id}`, data);
    return res.data;
  },
  submitForApproval: async (id) => {
    const res = await api.post(`/vendors/service-offerings/${id}/submit`);
    return res.data;
  },
  activateOffering: async (id) => {
    const res = await api.post(`/vendors/service-offerings/${id}/activate`);
    return res.data;
  },
  archiveOffering: async (id) => {
    const res = await api.post(`/vendors/service-offerings/${id}/archive`);
    return res.data;
  }
};

export default vendorOfferingService;
