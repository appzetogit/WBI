import api from './api';

/**
 * CGPE verification suite client — credentials stay on server.
 */
export const cgpeSuiteService = {
  // —— UPI ——
  validateVpa: async (vpa) => {
    const res = await api.get('/verification/upi/validate', { params: { vpa } });
    return res.data;
  },
  verifyUpi: async (payload) => {
    const res = await api.post('/verification/upi', payload);
    return res.data;
  },

  // —— Mobile → UPI ——
  lookupMobileUpi: async (payload) => {
    const res = await api.post('/verification/mobile-upi', payload);
    return res.data;
  },

  // —— Location ——
  detectLocation: async (payload) => {
    const res = await api.post('/verification/location', payload);
    return res.data;
  }
};

export const VPA_REGEX = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/;

export function normalizeVpa(v) {
  return String(v || '').trim().toLowerCase().replace(/\s+/g, '');
}

export function isValidVpaClient(v) {
  return VPA_REGEX.test(normalizeVpa(v));
}

export function normalizeMobile10(v) {
  return String(v || '').replace(/\D/g, '').slice(-10);
}

export function isValidMobileClient(v) {
  return /^[6-9]\d{9}$/.test(normalizeMobile10(v));
}

export default cgpeSuiteService;
