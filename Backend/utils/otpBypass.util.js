const DEFAULT_BYPASS_OTP = '123456';

const normalizePhone10 = (phone) => {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length < 10) return digits;
  return digits.slice(-10);
};

const getBypassPhones = () => {
  const raw = process.env.OTP_BYPASS_PHONES || '6261745842,6261745843';
  return [...new Set(raw.split(',').map(normalizePhone10).filter((p) => p.length === 10))];
};

const isOtpBypassPhone = (phone) => {
  const n = normalizePhone10(phone);
  return n.length === 10 && getBypassPhones().includes(n);
};

const getBypassOtp = () => process.env.OTP_BYPASS_CODE || DEFAULT_BYPASS_OTP;

module.exports = {
  normalizePhone10,
  getBypassPhones,
  isOtpBypassPhone,
  getBypassOtp
};
