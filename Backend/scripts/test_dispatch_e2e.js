const mongoose = require('mongoose');
require('dotenv').config();
const Worker = require('../models/Worker');
const Booking = require('../models/Booking');
const ServiceCategory = require('../models/ServiceCategory');
const BookingDispatchLog = require('../models/BookingDispatchLog');
const WaveManagerService = require('../services/WaveManagerService');

const runTest = async () => {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected.');

    // 1. Create a dummy service category
    const category = await ServiceCategory.create({
      name: 'Test Service Category ' + Date.now(),
      description: 'Test',
      isActive: true
    });
    console.log('Created Service Category:', category._id);

    // 2. Create a dummy worker
    const worker = await Worker.create({
      name: 'Test Worker',
      phone: '+91999999999' + Math.floor(Math.random() * 10),
      email: `test${Date.now()}@example.com`,
      status: 'ONLINE',
      isActive: true,
      approvalStatus: 'approved',
      location: {
        type: 'Point',
        coordinates: [77.2090, 28.6139] // Delhi
      },
      serviceCategoryRefs: [category._id],
      rating: 4.8,
      completedJobs: 50
    });
    console.log('Created Worker:', worker._id);

    // 3. Create a dummy booking
    const booking = await Booking.create({
      userId: new mongoose.Types.ObjectId(), // dummy user
      serviceId: category._id,
      serviceName: 'Test Service',
      serviceCategory: 'One-Time',
      address: {
        lat: 28.6139,
        lng: 77.2090,
        addressLine1: 'Test Address',
        city: 'Delhi',
        state: 'Delhi',
        pincode: '110001',
        fullAddress: 'Test Location, Delhi'
      },
      scheduledDate: new Date(),
      scheduledTime: '10:00 AM',
      timeSlot: {
        start: '10:00 AM',
        end: '11:00 AM'
      },
      basePrice: 500,
      finalAmount: 500,
      status: 'searching_worker',
      paymentStatus: 'pending',
      bookingType: 'scheduled'
    });
    console.log('Created Booking:', booking._id);

    // 4. Run dispatch logic
    console.log('\n--- STARTING DISPATCH ---');
    await WaveManagerService.dispatchWave(booking._id, 0);

    // 5. Verify the results
    console.log('\n--- VERIFYING DISPATCH LOGS ---');
    const logs = await BookingDispatchLog.find({ bookingId: booking._id });
    console.log(`Found ${logs.length} dispatch logs.`);
    if (logs.length > 0) {
      console.log('SUCCESS! The worker was successfully dispatched to:', logs[0].workerId);
    } else {
      console.error('FAILED! No workers were dispatched.');
    }

    // Cleanup
    await Worker.findByIdAndDelete(worker._id);
    await Booking.findByIdAndDelete(booking._id);
    await ServiceCategory.findByIdAndDelete(category._id);
    await BookingDispatchLog.deleteMany({ bookingId: booking._id });

    process.exit(0);
  } catch (err) {
    console.error('Error during test:', err);
    process.exit(1);
  }
};

runTest();
