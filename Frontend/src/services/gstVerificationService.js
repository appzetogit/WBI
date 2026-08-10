import api from './api';

/**
 * GST verification (CGPE/GSP) — credentials stay on the server.
 */
export const gstVerificationService = {
  validateFormat: async (gstin) => {
    const res = await api.get('/verification/gst/validate', { params: { gstin } });
    return res.data;
  },

  /**
   * @param {object} payload
   * @param {string} payload.gstNumber
   * @param {'vendor'|'b2b'|'unbound'} [payload.entityType]
   * @param {string} [payload.entityId]
   * @param {string} [payload.expectedPan]
   * @param {string} [payload.expectedLegalName]
   * @param {boolean} [payload.forceRefresh]
   */
  verify: async (payload) => {
    const res = await api.post('/verification/gst', payload);
    return res.data;
  },

  reverifySecure: async (payload) => {
    const res = await api.post('/verification/gst/secure', payload);
    return res.data;
  }
};

export const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

export function normalizeGstin(v) {
  return String(v || '').trim().toUpperCase().replace(/\s+/g, '');
}

export function isValidGstinClient(v) {
  return GSTIN_REGEX.test(normalizeGstin(v));
}

export default gstVerificationService;
