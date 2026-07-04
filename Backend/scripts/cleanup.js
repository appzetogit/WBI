const mongoose = require('mongoose');
require('dotenv').config();
const ServiceCategory = require('../models/ServiceCategory');
const Worker = require('../models/Worker');
const Booking = require('../models/Booking');

const cleanup = async () => {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected. Deleting test data...');
    
    const catResult = await ServiceCategory.deleteMany({ name: { $regex: /^Test Service Category/ } });
    console.log(`Deleted ${catResult.deletedCount} test service categories.`);
    
    const workerResult = await Worker.deleteMany({ name: 'Test Worker' });
    console.log(`Deleted ${workerResult.deletedCount} test workers.`);
    
    const bookingResult = await Booking.deleteMany({ serviceName: 'Test Service' });
    console.log(`Deleted ${bookingResult.deletedCount} test bookings.`);
    
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

cleanup();
