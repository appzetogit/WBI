import api from './api';

const engineerWalletService = {
  getWallet: async () => {
    const response = await api.get('/engineers/wallet');
    return response.data;
  },

  getTransactions: async (params = {}) => {
    const response = await api.get('/engineers/wallet/transactions', { params });
    return response.data;
  },

  getAssignedServices: async () => {
    try {
      const res = await api.get('/engineers/ops-jobs', { params: { status: 'active' } });
      const jobs = res.data?.data || [];
      const first = jobs[0];
      return {
        success: true,
        data: {
          categoryName: first?.serviceCategoryName || 'Vendor projects',
          vendorName: first?.clientName || 'Active vendor jobs',
          activeJobsCount: jobs.length,
          paymentMode: 'On job completion'
        }
      };
    } catch {
      return {
        success: true,
        data: {
          categoryName: 'Vendor projects',
          vendorName: '—',
          activeJobsCount: 0,
          paymentMode: 'On job completion'
        }
      };
    }
  },

  getPayments: async (params) => {
    const response = await api.get('/engineers/wallet/transactions', {
      params: { ...params, type: 'earnings_credit' }
    });
    return response.data;
  },

  getWithdrawals: async () => {
    const response = await api.get('/engineers/wallet/transactions', {
      params: { type: 'withdrawal' }
    });
    return response.data;
  },

  requestWithdraw: async (data) => {
    const response = await api.post('/engineers/wallet/withdraw', {
      amount: data.amount,
      method: data.method,
      upiId: data.upiId,
      bankDetails: data.bankDetails
    });
    return response.data;
  },

  verifyUpi: async (upiId) => {
    const response = await api.post('/engineers/wallet/verify-upi', { upiId });
    return response.data;
  },

  getBankDetails: async () => {
    const response = await api.get('/engineers/profile');
    const eng = response.data?.engineer || response.data?.worker;
    return {
      success: true,
      data: eng?.bankDetails || eng?.bank || null
    };
  },

  updateBankDetails: async (data) => {
    const response = await api.put('/engineers/profile', { bankDetails: data });
    return response.data;
  }
};

export default engineerWalletService;
