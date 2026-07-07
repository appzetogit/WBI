require('dotenv').config();
const axios = require('axios');

async function testSms() {
  const apiKey = process.env.SMS_INDIA_HUB_API_KEY || 'd5ebc5ace604448d95282cc4389e9ae4';
  const senderId = 'SMSHUB';
  const templateId = process.env.SMS_INDIA_HUB_DLT_TEMPLATE_ID || '1007282516644508833';
  
  const mobile = '916266925739'; 
  const otp = '123456';
  
  const messageText = `Welcome to the Homecare powered by Appzeto.Your OTP for registration is ${otp}.BGADEC`;
  
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
    console.log('Sending request to SMS India Hub...');
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
