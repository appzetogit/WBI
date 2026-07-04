require('dotenv').config();
const Razorpay = require('razorpay');

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

async function test() {
  try {
    const order = await razorpay.orders.create({
      amount: 24900,
      currency: 'INR',
      receipt: 'test_receipt',
      notes: {
        type: 'engineer_registration',
        name: 'User',
        phone: 'N/A',
        email: 'N/A',
        couponCode: 'none'
      }
    });
    console.log("Success:", order);
  } catch (error) {
    console.error("Error:", error);
  }
}

test();
