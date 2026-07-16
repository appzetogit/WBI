const axios = require('axios');

/**
 * Send SMS via SMS India Hub
 * @param {string} phone - Phone number
 * @param {string} message - Message content
 * @returns {Promise<Object>} - Response data
 */
const sendSMS = async (phone, message) => {
  try {
    // MOCK mode removed for production

    // Check if SMS credentials are configured
    if (!process.env.SMS_INDIA_HUB_API_KEY || !process.env.SMS_INDIA_HUB_SENDER_ID) {
      console.warn('[SMS] SMS credentials missing in .env. SMS not sent.');
      console.log(`[SMS MOCK] To: ${phone}, Msg: ${message}`);
      return { success: false, message: 'SMS configuration missing' };
    }

    // Prepend 91 to 10-digit Indian numbers as required by most vendors
    const formattedPhone = (phone && phone.length === 10) ? `91${phone}` : phone;

    // Build parameters exactly as per the working URL provided by the vendor
    // Manually construct the URL to avoid any Axios params serialization issues
    const baseUrl = process.env.SMS_BASE_URL || 'https://cloud.smsindiahub.in/vendorsms/pushsms.aspx';
    
    // We encode the message to handle spaces properly
    const encodedMsg = encodeURIComponent(message);
    
    // Add TemplateId if it exists in .env for faster DLT processing and bypassing regex matching
    const templateIdParam = process.env.SMS_INDIA_HUB_DLT_TEMPLATE_ID ? `&TemplateId=${process.env.SMS_INDIA_HUB_DLT_TEMPLATE_ID}` : '';
    
    const finalUrl = `${baseUrl}?APIKey=${process.env.SMS_INDIA_HUB_API_KEY}&msisdn=${formattedPhone}&sid=${process.env.SMS_INDIA_HUB_SENDER_ID}&msg=${encodedMsg}&fl=0&gwid=2${templateIdParam}`;

    console.log('[SMS] Sending request to (HTTPS):', baseUrl);
    console.log('[SMS] Constructed URL (Masked):', finalUrl.replace(process.env.SMS_INDIA_HUB_API_KEY, '***'));

    // Added 5-second timeout to prevent hanging the event loop if SMS API provider is slow
    const response = await axios.get(finalUrl, { timeout: 5000 });

    console.log('[SMS] Response status:', response.status);
    console.log('[SMS] Response data:', response.data);

    // Check for successful response
    // SMS India Hub can return JSON object OR string
    let isSuccess = false;
    const data = response.data;

    if (typeof data === 'object' && data !== null) {
      // Handle JSON response
      if (data.ErrorCode === '000' || data.ErrorMessage === 'Done' || data.ErrorMessage === 'Success') {
        isSuccess = true;
      }
    } else {
      // Handle String response
      const responseStr = String(data || '');
      if (responseStr.startsWith('Success')) {
        isSuccess = true;
      }
    }

    if (isSuccess) {
      console.log({phone})
      return { success: true, data: response.data };
    } else {
      console.error(`[SMS] ❌ SMS Provider Error:`, JSON.stringify(response.data));
      // Parse common string errors if it is a string
      if (typeof data === 'string' && data.includes('Invalid Login')) {
        console.error('[SMS] ⚠️  Authentication failed - check SMS_INDIA_HUB_USERNAME and SMS_INDIA_HUB_API_KEY');
      }
      return { success: false, error: response.data };
    }

  } catch (error) {
    console.error('[SMS] Network Error:', error.message);
    if (error.response) {
      console.error('[SMS] Error Response:', error.response.data);
    }
    return { success: false, error: error.message };
  }
};

/**
 * Send OTP specific SMS
 * @param {string} phone - Phone number
 * @param {string} otp - OTP code
 */
const sendOTP = async (phone, otp) => {
  // DLT-compliant message format exactly as approved by the provider
  const message = `Welcome to the WBIPVTLTD powered by Appzeto.Your OTP for registration is ${otp}.BGADEC`;

  console.log(`[SMS] Attempting to send OTP to ${phone}`);
  console.log(`[SMS] Message: ${message}`);

  const result = await sendSMS(phone, message);

  if (!result.success) {
    console.error(`[SMS] Failed to send OTP to ${phone}:`, result.error);
  }

  return result;
};

module.exports = {
  sendSMS,
  sendOTP
};
