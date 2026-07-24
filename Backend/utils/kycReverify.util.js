const crypto = require('crypto');

const TTL_DAYS = parseInt(process.env.KYC_VERIFICATION_TTL_DAYS || '365', 10);

function hashDocumentValue(value) {
  if (!value) return null;
  return crypto.createHash('sha256').update(String(value).trim().toUpperCase()).digest('hex');
}

function isExpired(verifiedAt, ttlDays = TTL_DAYS) {
  if (!verifiedAt) return true;
  const ms = ttlDays * 24 * 60 * 60 * 1000;
  return Date.now() - new Date(verifiedAt).getTime() > ms;
}

/**
 * Skip re-verify when record is verified, not expired, and document identity unchanged.
 * @param {object} record - KYCVerification lean doc
 * @param {string|null} incomingNumberOrHash - raw number (will be hashed) or precomputed hash
 */
function shouldSkipReverify(record, incomingNumberOrHash = null) {
  if (!record || record.status !== 'verified') return false;
  if (isExpired(record.verifiedAt)) return false;
  if (incomingNumberOrHash == null || incomingNumberOrHash === '') return true;
  const incomingHash =
    String(incomingNumberOrHash).length === 64 && /^[a-f0-9]+$/i.test(String(incomingNumberOrHash))
      ? String(incomingNumberOrHash).toLowerCase()
      : hashDocumentValue(incomingNumberOrHash);
  if (!record.documentHash) return true;
  return record.documentHash === incomingHash;
}

function sanitizeDraftPayload(payload = {}) {
  if (!payload || typeof payload !== 'object') return {};
  const clone = JSON.parse(JSON.stringify(payload));
  const stripKeys = ['password', 'otp', 'aadhaarOtp', 'verificationOtp', 'cvv', 'cardNumber'];
  const walk = (obj) => {
    if (!obj || typeof obj !== 'object') return;
    for (const k of Object.keys(obj)) {
      if (stripKeys.includes(k) || k.toLowerCase().includes('password')) {
        delete obj[k];
        continue;
      }
      if (typeof obj[k] === 'object') walk(obj[k]);
    }
  };
  walk(clone);
  return clone;
}

module.exports = {
  TTL_DAYS,
  hashDocumentValue,
  isExpired,
  shouldSkipReverify,
  sanitizeDraftPayload
};
