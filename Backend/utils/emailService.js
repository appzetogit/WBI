/**
 * OTP email used by the shared password-reset flow and B2B contact
 * verification. Delivery goes through the shared mailer (services/mail).
 */
const { deliverOtpEmail } = require('../services/emailService');
const { isConfigured, isProduction, maskEmail } = require('../services/mail/mailer');

/**
 * @param {string} email
 * @param {string} otp
 * @param {string} role       account type (user, vendor, engineer, b2b, ...)
 * @param {'password_reset'|'verification'} [purpose]
 * @param {number} [validMinutes]
 * @returns {Promise<true>} throws when the email could not be sent
 */
const sendOtpEmail = async (email, otp, role, purpose = 'password_reset', validMinutes = purpose === 'password_reset' ? 5 : 10) => {
  if (!isConfigured() && !isProduction()) {
    console.log(`[mail] (dev, no SMTP) OTP for ${maskEmail(email)} (${role}): ${otp}`);
    return true;
  }
  try {
    await deliverOtpEmail(email, otp, { purpose, role, validMinutes });
    return true;
  } catch (error) {
    console.error(`[mail] OTP email to ${maskEmail(email)} failed:`, error.message);
    throw error;
  }
};

module.exports = {
  sendOtpEmail
};
