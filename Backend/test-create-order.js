require('dotenv').config();
const mongoose = require('mongoose');
const { createJoiningFeeOrder } = require('./controllers/engineerControllers/engineerJoiningFeeController');

async function test() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected to MongoDB");

  const req = {
    body: {
      couponCode: '',
      name: 'Test',
      phone: '1234567890',
      email: 'test@example.com'
    }
  };

  const res = {
    status: (code) => ({
      json: (data) => console.log(`Status: ${code}, Data:`, data)
    })
  };

  await createJoiningFeeOrder(req, res);
  
  mongoose.disconnect();
}

test();
