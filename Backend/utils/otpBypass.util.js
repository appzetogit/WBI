const DEFAULT_BYPASS_OTP = '123456';

/** Fixed QA phones — always accept OTP 123456 (even in production) for Flutter testing. */
const BUILTIN_QA_OTP_PHONES = ['9999999999', '8888888888'];

const normalizePhone10 = (phone) => {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length < 10) return digits;
  return digits.slice(-10);
};

const isBuiltinQaPhone = (phone) => {
  const n = normalizePhone10(phone);
  return n.length === 10 && BUILTIN_QA_OTP_PHONES.includes(n);
};

/** Bypass is never active in production for env-listed phones, even if env is mis-set.
 *  Builtin QA phones (rituraj eng/worker) are an intentional exception.
 */
const isBypassAllowedInEnv = () => {
  if (process.env.NODE_ENV === 'production') return false;
  // Explicit opt-in required in non-prod
  return process.env.ALLOW_OTP_BYPASS === 'true';
};

const getBypassPhones = () => {
  if (!isBypassAllowedInEnv()) return [...BUILTIN_QA_OTP_PHONES];
  const raw = process.env.OTP_BYPASS_PHONES || '';
  const fromEnv = raw.split(',').map(normalizePhone10).filter((p) => p.length === 10);
  return [...new Set([...BUILTIN_QA_OTP_PHONES, ...fromEnv])];
};

const isOtpBypassPhone = (phone) => {
  if (isBuiltinQaPhone(phone)) return true;
  if (!isBypassAllowedInEnv()) return false;
  const n = normalizePhone10(phone);
  return n.length === 10 && getBypassPhones().includes(n);
};

const getBypassOtp = () => {
  if (isBypassAllowedInEnv() || BUILTIN_QA_OTP_PHONES.length) {
    return process.env.OTP_BYPASS_CODE || DEFAULT_BYPASS_OTP;
  }
  return null;
};

module.exports = {
  normalizePhone10,
  getBypassPhones,
  isOtpBypassPhone,
  getBypassOtp,
  isBypassAllowedInEnv,
  isBuiltinQaPhone,
  BUILTIN_QA_OTP_PHONES
};
