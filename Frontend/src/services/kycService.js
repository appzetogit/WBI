import api from './api';

export const kycService = {
  getDocumentRules: async (role) => {
    try {
      const response = await api.get(`/kyc/document-rules?role=${role}`);
      return response.data;
    } catch (error) {
      throw error.response?.data || { success: false, message: 'Failed to fetch document rules' };
    }
  },

  initiateDigiLocker: async (payload) => {
    try {
      const response = await api.post('/kyc/digilocker/initiate', payload);
      return response.data;
    } catch (error) {
      throw error.response?.data || { success: false, message: 'Failed to initiate DigiLocker' };
    }
  },

  completeDigiLocker: async (transactionId) => {
    try {
      const response = await api.post('/kyc/digilocker/complete', { transactionId });
      return response.data;
    } catch (error) {
      throw error.response?.data || { success: false, message: 'Failed to complete DigiLocker' };
    }
  },

  verifyPan: async (payload) => {
    try {
      const response = await api.post('/kyc/pan/verify', payload);
      return response.data;
    } catch (error) {
      throw error.response?.data || { success: false, message: 'PAN verification failed' };
    }
  },

  verifyBank: async (payload) => {
    try {
      const response = await api.post('/kyc/bank/verify', payload);
      return response.data;
    } catch (error) {
      throw error.response?.data || { success: false, message: 'Bank verification failed' };
    }
  },

  uploadDocument: async (payload) => {
    try {
      const response = await api.post('/kyc/document/upload', payload);
      return response.data;
    } catch (error) {
      throw error.response?.data || { success: false, message: 'Failed to upload document' };
    }
  }
};
