import api from './api';

export const getDashboardStats = async (params) => {
  try {
    const response = await api.get('/admin/dashboard/stats', { params });
    return response.data;
  } catch (error) {
    throw error;
  }
};

export const getRevenueAnalytics = async (params) => {
  try {
    const response = await api.get('/admin/dashboard/revenue', { params });
    return response.data;
  } catch (error) {
    throw error;
  }
};

export const getBookingTrends = async (params = 30) => {
  try {
    const p = typeof params === 'object' ? params : { days: params };
    const response = await api.get('/admin/dashboard/bookings/trends', { params: p });
    return response.data;
  } catch (error) {
    throw error;
  }
};

export const getUserGrowthMetrics = async (params = 30) => {
  try {
    const p = typeof params === 'object' ? params : { days: params };
    const response = await api.get('/admin/dashboard/users/growth', { params: p });
    return response.data;
  } catch (error) {
    throw error;
  }
};

/** B2B, Vendor, Engineer (vendor-employed vs freelancer), payments & quality — everything the legacy Booking-only stats never covered. */
export const getPlatformOverview = async (params) => {
  try {
    const response = await api.get('/admin/dashboard/platform-overview', { params });
    return response.data;
  } catch (error) {
    throw error;
  }
};

/** Reuses the same live-tracking summary the B2B live map uses, admin-scoped (no companyId = platform-wide). */
export const getLiveOpsSummary = async () => {
  try {
    const response = await api.get('/b2b/live-tracking/summary');
    return response.data;
  } catch (error) {
    throw error;
  }
};

