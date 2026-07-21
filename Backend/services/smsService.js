const axios = require('axios');

/**
 * Send SMS via SMS India Hub
 * @param {string} phone - Phone number
 * @param {string} message - Message content
 * @param {{ templateId?: string }} [options]
 * @returns {Promise<Object>} - Response data
 */
const sendSMS = async (phone, message, options = {}) => {
  try {
    if (!process.env.SMS_INDIA_HUB_API_KEY || !process.env.SMS_INDIA_HUB_SENDER_ID) {
      console.warn('[SMS] SMS credentials missing in .env. SMS not sent.');
      console.log(`[SMS MOCK] To: ${phone}, Msg: ${message}`);
      return { success: false, message: 'SMS configuration missing' };
    }

    const formattedPhone = (phone && phone.length === 10) ? `91${phone}` : phone;
    const baseUrl = process.env.SMS_BASE_URL || 'https://cloud.smsindiahub.in/vendorsms/pushsms.aspx';
    const encodedMsg = encodeURIComponent(message);
    const templateId = options.templateId ?? process.env.SMS_INDIA_HUB_DLT_TEMPLATE_ID;
    const templateIdParam = templateId ? `&TemplateId=${templateId}` : '';

    const finalUrl = `${baseUrl}?APIKey=${process.env.SMS_INDIA_HUB_API_KEY}&msisdn=${formattedPhone}&sid=${process.env.SMS_INDIA_HUB_SENDER_ID}&msg=${encodedMsg}&fl=0&gwid=2${templateIdParam}`;

    console.log('[SMS] Sending request to (HTTPS):', baseUrl);
    console.log('[SMS] Constructed URL (Masked):', finalUrl.replace(process.env.SMS_INDIA_HUB_API_KEY, '***'));

    const response = await axios.get(finalUrl, { timeout: 5000 });

    console.log('[SMS] Response status:', response.status);
    console.log('[SMS] Response data:', response.data);

    let isSuccess = false;
    const data = response.data;

    if (typeof data === 'object' && data !== null) {
      if (data.ErrorCode === '000' || data.ErrorMessage === 'Done' || data.ErrorMessage === 'Success') {
        isSuccess = true;
      }
    } else {
      const responseStr = String(data || '');
      if (responseStr.startsWith('Success')) {
        isSuccess = true;
      }
    }

    if (isSuccess) {
      console.log({ phone });
      return { success: true, data: response.data };
    }

    console.error('[SMS] ❌ SMS Provider Error:', JSON.stringify(response.data));
    if (typeof data === 'string' && data.includes('Invalid Login')) {
      console.error('[SMS] ⚠️  Authentication failed - check SMS_INDIA_HUB_USERNAME and SMS_INDIA_HUB_API_KEY');
    }
    return { success: false, error: response.data };
  } catch (error) {
    console.error('[SMS] Network Error:', error.message);
    if (error.response) {
      console.error('[SMS] Error Response:', error.response.data);
    }
    return { success: false, error: error.message };
  }
};

/** Default OTP (user, vendor, B2B, shared auth, login flows) — unchanged legacy DLT text */
const LEGACY_OTP_SMS_TEMPLATE = (otp) =>
  `Welcome to the WBIPVTLTD powered by Appzeto.Your OTP for registration is ${otp}.BGADEC`;

/** Engineer & worker registration only — must match DLT template (##var## = otp) */
const TASKY_REGISTRATION_OTP_SMS_TEMPLATE = (otp) =>
  `Welcome to TaskY powered by WBI. Your registration OTP is ${otp}. Valid for 10 minutes. Do not share this OTP with anyone.`;

/**
 * Generic OTP SMS (legacy template) — user, vendor, B2B, etc.
 */
const sendOTP = async (phone, otp) => {
  const message = LEGACY_OTP_SMS_TEMPLATE(otp);
  console.log(`[SMS] Attempting to send OTP (legacy) to ${phone}`);
  const result = await sendSMS(phone, message);
  if (!result.success) {
    console.error(`[SMS] Failed to send OTP to ${phone}:`, result.error);
  }
  return result;
};

/**
 * Engineer / worker registration OTP only (TaskY template + optional separate DLT id)
 */
const sendRegistrationOTP = async (phone, otp) => {
  const message = TASKY_REGISTRATION_OTP_SMS_TEMPLATE(otp);
  const templateId =
    process.env.SMS_INDIA_HUB_DLT_TEMPLATE_ID_TASKY ||
    process.env.SMS_INDIA_HUB_DLT_TEMPLATE_ID;

  console.log(`[SMS] Attempting to send registration OTP (TaskY) to ${phone}`);
  const result = await sendSMS(phone, message, { templateId });
  if (!result.success) {
    console.error(`[SMS] Failed to send registration OTP to ${phone}:`, result.error);
    console.error('[SMS] Check TaskY DLT template text/id, sender, API key, EC2 IP whitelist');
  }
  return result;
};

module.exports = {
  sendSMS,
  sendOTP,
  sendRegistrationOTP,
  LEGACY_OTP_SMS_TEMPLATE,
  TASKY_REGISTRATION_OTP_SMS_TEMPLATE
};
