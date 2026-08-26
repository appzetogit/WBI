const mongoose = require('mongoose');
const Booking = require('../models/Booking');
require('dotenv').config();

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to DB successfully!');
  
  const booking = await Booking.findById('6a463d4b11434e8237fb3cf4');
  if (booking) {
    console.log('\n==================================================');
    console.log(`Booking ID:      ${booking._id}`);
    console.log(`Status:          ${booking.status}`);
    console.log(`Payment Status:  ${booking.paymentStatus}`);
    console.log('==================================================');
    console.log(`Base Price:      ₹${booking.basePrice}`);
    console.log(`Visiting Charge: ₹${booking.visitingCharges}`);
    console.log(`Platform Fee:    ₹${booking.platformFee}`);
    console.log(`GST (18%):       ₹${booking.tax}`);
    console.log('--------------------------------------------------');
    console.log(`Customer Paid:   ₹${booking.finalAmount}`);
    console.log('==================================================');
    console.log(`Worker Payout:   ₹${booking.workerPayout}`);
    console.log(`Platform/Admin:  ₹${booking.platformEarning}`);
    console.log('==================================================\n');
  } else {
    console.log('Booking not found');
  }
  
  await mongoose.disconnect();
}

run();
