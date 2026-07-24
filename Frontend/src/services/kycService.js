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

  completeDigiLocker: async (payload) => {
    try {
      const body =
        typeof payload === 'string'
          ? { transactionId: payload, recordId: payload }
          : {
              transactionId: payload.transactionId || payload.recordId,
              recordId: payload.recordId || payload.transactionId,
              code: payload.code,
              state: payload.state,
              codeVerifier: payload.codeVerifier,
              role: payload.role,
              entityId: payload.entityId
            };
      const response = await api.post('/kyc/digilocker/complete', body);
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

  generateAadhaarOtp: async (payload) => {
    try {
      const response = await api.post('/kyc/aadhaar/generate-otp', payload);
      return response.data;
    } catch (error) {
      throw error.response?.data || { success: false, message: 'Failed to generate Aadhaar OTP' };
    }
  },

  verifyAadhaar: async (payload) => {
    try {
      const response = await api.post('/kyc/aadhaar/verify', payload);
      return response.data;
    } catch (error) {
      throw error.response?.data || { success: false, message: 'Aadhaar verification failed' };
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

  verifyLicense: async (payload) => {
    try {
      const response = await api.post('/kyc/license/verify', payload);
      return response.data;
    } catch (error) {
      throw error.response?.data || { success: false, message: 'License verification failed' };
    }
  },

  uploadDocument: async (payload) => {
    try {
      const response = await api.post('/kyc/document/upload', payload);
      return response.data;
    } catch (error) {
      throw error.response?.data || { success: false, message: 'Failed to upload document' };
    }
  },

  verifySelfieMatch: async (payload) => {
    try {
      const response = await api.post('/kyc/selfie/verify', payload);
      return response.data;
    } catch (error) {
      throw error.response?.data || { success: false, message: 'Selfie verification failed' };
    }
  },

  getStatus: async (role, entityId) => {
    try {
      const response = await api.get('/kyc/status', { params: { role, entityId } });
      return response.data;
    } catch (error) {
      throw error.response?.data || { success: false, message: 'Failed to load KYC status' };
    }
  }
};
