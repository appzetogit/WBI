const DEFAULT_BYPASS_OTP = '123456';

const normalizePhone10 = (phone) => {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length < 10) return digits;
  return digits.slice(-10);
};

/** Bypass is never active in production, even if env is mis-set. */
const isBypassAllowedInEnv = () => {
  if (process.env.NODE_ENV === 'production') return false;
  // Explicit opt-in required in non-prod
  return process.env.ALLOW_OTP_BYPASS === 'true';
};

const getBypassPhones = () => {
  if (!isBypassAllowedInEnv()) return [];
  const raw = process.env.OTP_BYPASS_PHONES || '';
  return [...new Set(raw.split(',').map(normalizePhone10).filter((p) => p.length === 10))];
};

const isOtpBypassPhone = (phone) => {
  if (!isBypassAllowedInEnv()) return false;
  const n = normalizePhone10(phone);
  return n.length === 10 && getBypassPhones().includes(n);
};

const getBypassOtp = () => {
  if (!isBypassAllowedInEnv()) return null;
  return process.env.OTP_BYPASS_CODE || DEFAULT_BYPASS_OTP;
};

module.exports = {
  normalizePhone10,
  getBypassPhones,
  isOtpBypassPhone,
  getBypassOtp,
  isBypassAllowedInEnv
};
