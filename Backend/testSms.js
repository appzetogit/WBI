require('dotenv').config();
const axios = require('axios');
const { TASKY_REGISTRATION_OTP_SMS_TEMPLATE } = require('./services/smsService');

async function testSms() {
  const apiKey = process.env.SMS_INDIA_HUB_API_KEY || 'd5ebc5ace604448d95282cc4389e9ae4';
  const senderId =
    process.env.SMS_INDIA_HUB_SENDER_ID_TASKY ||
    process.env.SMS_INDIA_HUB_SENDER_ID ||
    'WBINFS';
  const templateId =
    process.env.SMS_INDIA_HUB_DLT_TEMPLATE_ID_TASKY || '1077311990016977854';

  const mobile = '916266925739';
  const otp = '123456';
  const messageText = TASKY_REGISTRATION_OTP_SMS_TEMPLATE(otp);

  const url = 'http://cloud.smsindiahub.in/api/mt/SendSMS';

  const params = {
    APIKey: apiKey,
    senderid: senderId,
    channel: 2,
    DCS: 0,
    flashsms: 0,
    number: mobile,
    text: messageText,
    route: 4,
    dlttemplateid: templateId
  };

  try {
    console.log('Sending request to SMS India Hub...', { senderId, templateId, messageText });
    const response = await axios.get(url, { params });
    console.log('Response Status:', response.status);
    console.log('Response Data:', response.data);
  } catch (err) {
    console.error('Error:', err.message);
    if (err.response) {
      console.error('Error Data:', err.response.data);
    }
  }
}

testSms();
