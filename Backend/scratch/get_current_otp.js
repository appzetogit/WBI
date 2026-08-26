const mongoose = require('mongoose');
const Booking = require('../models/Booking');
const BookingEvent = require('../models/BookingEvent');
require('dotenv').config();

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to DB');
  
  const booking = await Booking.findOne().sort({ createdAt: -1 }).select('+visitOtp +paymentOtp');
  if (booking) {
    console.log('\n========================================');
    console.log(`Booking ID: ${booking._id}`);
    console.log(`Status: ${booking.status}`);
    console.log(`Visit OTP (OTP 1): ${booking.visitOtp}`);
    console.log(`Payment OTP (OTP 2): ${booking.paymentOtp}`);
    console.log(`Created At: ${booking.createdAt ? booking.createdAt.toISOString() : 'N/A'}`);
    console.log('========================================\n');
    
    const events = await BookingEvent.find({ bookingId: booking._id }).sort({ createdAt: 1 });
    console.log('Booking Events:');
    events.forEach(e => {
      const time = e.createdAt ? e.createdAt.toISOString() : (e.timestamp ? e.timestamp.toISOString() : 'N/A');
      console.log(`- [${time}] ${e.fromStatus} ➔ ${e.toStatus} (${e.actorRole}): "${e.action}"`);
    });
  } else {
    console.log('No bookings found');
  }
  
  await mongoose.disconnect();
}

run();
