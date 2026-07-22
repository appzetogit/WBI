import api from './api';

const adminEngineerCouponService = {
  listCoupons: async () => {
    const res = await api.get('/admin/engineer-coupons');
    return res.data;
  },
  createCoupon: async (payload) => {
    const res = await api.post('/admin/engineer-coupons', payload);
    return res.data;
  },
  updateCoupon: async (id, payload) => {
    const res = await api.patch(`/admin/engineer-coupons/${id}`, payload);
    return res.data;
  },
  deleteCoupon: async (id) => {
    const res = await api.delete(`/admin/engineer-coupons/${id}`);
    return res.data;
  },
  toggleCoupon: async (id) => {
    const res = await api.patch(`/admin/engineer-coupons/${id}/toggle`);
    return res.data;
  },
  listBanners: async () => {
    const res = await api.get('/admin/engineer-offer-banners');
    return res.data;
  },
  createBanner: async (payload) => {
    const res = await api.post('/admin/engineer-offer-banners', payload);
    return res.data;
  },
  updateBanner: async (id, payload) => {
    const res = await api.patch(`/admin/engineer-offer-banners/${id}`, payload);
    return res.data;
  },
  deleteBanner: async (id) => {
    const res = await api.delete(`/admin/engineer-offer-banners/${id}`);
    return res.data;
  },
  getAnalytics: async () => {
    const res = await api.get('/admin/engineer-coupon-analytics');
    return res.data;
  },
  exportRedemptions: async () => {
    const res = await api.get('/admin/engineer-coupon-redemptions/export', {
      responseType: 'blob'
    });
    const blob = new Blob([res.data], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'engineer-coupon-redemptions.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  }
};

export default adminEngineerCouponService;
