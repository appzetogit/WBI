import api from './api';

/**
 * CIN / MCA verification (CGPE) — credentials stay on the server.
 */
export const cinVerificationService = {
  validateFormat: async (cin) => {
    const res = await api.get('/verification/cin/validate', { params: { cin } });
    return res.data;
  },

  /**
   * @param {object} payload
   * @param {string} payload.cinNumber
   * @param {'vendor'|'b2b'|'unbound'} [payload.entityType]
   * @param {string} [payload.entityId]
   * @param {boolean} [payload.forceRefresh]
   */
  verify: async (payload) => {
    const res = await api.post('/verification/cin', payload);
    return res.data;
  },

  reverifySecure: async (payload) => {
    const res = await api.post('/verification/cin/secure', payload);
    return res.data;
  }
};

/** Standard 21-char company CIN or LLP IN (AAB-1234) */
export const CIN_REGEX = /^[LU][0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}$/;
export const LLPIN_REGEX = /^[A-Z]{3}-[0-9]{4}$/;

export function normalizeCin(v) {
  return String(v || '').trim().toUpperCase().replace(/\s+/g, '');
}

export function isValidCinClient(v) {
  const c = normalizeCin(v);
  return CIN_REGEX.test(c) || LLPIN_REGEX.test(c);
}

export default cinVerificationService;
