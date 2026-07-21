import api from '../../../services/api';
import { fetchEarningsByService } from './financeService';

/**
 * Live earnings APIs — per-service breakdown from Vendor Finance ledger.
 */

export const getEarningsOverview = async () => {
  const res = await fetchEarningsByService();
  const payload = res.data?.data || {};
  return {
    totalEarnings: payload.totals?.totalEarnings || 0,
    pendingReceivables: payload.totals?.pendingReceivables || 0,
    escrowHeld: payload.totals?.escrowHeld || 0,
    serviceCount: payload.serviceCount || 0
  };
};

export const getEarningsHistory = async (filters = {}) => {
  const params = new URLSearchParams();
  if (filters.category) params.append('category', filters.category);
  if (filters.limit) params.append('limit', filters.limit);
  const response = await api.get(`/vendor/finance/wallet?${params.toString()}`);
  return response.data?.data?.transactions || [];
};

export const getEarningsByServiceType = async () => {
  const res = await fetchEarningsByService();
  return res.data?.data?.byService || [];
};

export const getEarningsByWorker = async () => [];

export const getPayoutBreakdown = async () => {
  const overview = await getEarningsOverview();
  return {
    totalEarnings: overview.totalEarnings,
    pendingReceivables: overview.pendingReceivables,
    escrowHeld: overview.escrowHeld,
    netEarnings: overview.totalEarnings
  };
};
