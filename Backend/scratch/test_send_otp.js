const axios = require('axios');
async function test() {
  try {
    const res = await axios.post('https://api.wbinfs.com/api/users/auth/send-otp', { phone: '6261745842' });
    console.log('SUCCESS', res.data);
  } catch (e) {
    console.log('ERROR', e.response?.status, e.response?.data);
  }
}
test();
