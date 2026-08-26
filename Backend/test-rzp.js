require('dotenv').config();
const Razorpay = require('razorpay');

async function test() {
  try {
    console.log("KEY_ID:", process.env.RAZORPAY_KEY_ID);
    console.log("KEY_SECRET:", process.env.RAZORPAY_KEY_SECRET);
    const razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET
    });

    const options = {
      amount: 24900,
      currency: "INR",
      receipt: `join_test`,
      notes: {}
    };

    const order = await razorpay.orders.create(options);
    console.log("Order created:", order);
  } catch (error) {
    console.error("Error:", error);
  }
}

test();
