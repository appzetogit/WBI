const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const axios = require('axios');
const jwt = require('jsonwebtoken');

dotenv.config({ path: path.join(__dirname, '../.env') });

const User = require('../models/User');
const BookingDraft = require('../models/BookingDraft');
const Booking = require('../models/Booking');
const Worker = require('../models/Worker');
const WorkerAvailability = require('../models/WorkerAvailability');

const PORT = process.env.PORT || 5000;
const BASE_URL = `http://localhost:${PORT}/api`;

async function runTest() {
  try {
    console.log('Connecting to database...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected!');

    // 1. Set up test user
    console.log('\n--- 1. SETTING UP TEST USER ---');
    let user = await User.findOne({ phone: '9876543210' });
    if (!user) {
      user = await User.create({
        name: 'Test Customer',
        phone: '9876543210',
        role: 'user',
        isActive: true
      });
      console.log('Created test customer!');
    }
    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET || 'jwt_secret_key_12345',
      { expiresIn: '1h' }
    );
    const headers = { Authorization: `Bearer ${token}` };

    // 2. Make sure draft exists
    console.log('\n--- 2. GETTING OR CREATING BOOKING DRAFT ---');
    let draft = await BookingDraft.findOne({ userId: user._id, status: 'draft' });
    if (!draft) {
      const OneTimeService = require('../models/OneTimeService');
      const service = await OneTimeService.findOne({ isActive: true });
      if (!service) {
        throw new Error('Please run seed script first, no OneTimeService found');
      }
      
      const ServicePackage = require('../models/ServicePackage');
      const pkg = await ServicePackage.findOne({ serviceId: service._id });
      
      draft = new BookingDraft({
        userId: user._id,
        serviceId: service._id,
        packageIds: pkg ? [pkg._id] : [],
        quantities: pkg ? { [pkg._id.toString()]: 1 } : {},
        priceSnapshot: {
          packageTotal: 500,
          finalAmount: 500,
          itemCount: 1
        },
        address: {
          type: 'home',
          addressLine1: 'Vikas Nagar, South Tukoganj, Indore, Madhya Pradesh 452001',
          city: 'Indore',
          state: 'Madhya Pradesh',
          pincode: '452001',
          lat: 22.7196,
          lng: 75.8577
        }
      });
      await draft.save();
      console.log('Created a new test BookingDraft:', draft._id);
    } else {
      console.log('Using existing BookingDraft:', draft._id);
    }

    // 3. Test dynamic slots retrieval API
    console.log('\n--- 3. RETRIEVING AVAILABLE DATES AND SLOTS ---');
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = tomorrow.toISOString().split('T')[0];

    const datesRes = await axios.get(`${BASE_URL}/users/one-time-bookings/available-dates?serviceId=${draft.serviceId}`, { headers });
    if (datesRes.data.success) {
      console.log('✅ GET /users/one-time-bookings/available-dates Passed! Found dates count:', datesRes.data.data.length);
    } else {
      throw new Error('Available dates failed: ' + datesRes.data.message);
    }

    const slotsRes = await axios.get(`${BASE_URL}/users/one-time-bookings/available-slots?date=${dateStr}&serviceId=${draft.serviceId}&city=Indore`, { headers });
    if (slotsRes.data.success) {
      console.log('✅ GET /users/one-time-bookings/available-slots Passed! Available slots count:', slotsRes.data.data.filter(s => s.isAvailable).length);
    } else {
      throw new Error('Available slots failed: ' + slotsRes.data.message);
    }

    const firstSlot = slotsRes.data.data.find(s => s.isAvailable) || slotsRes.data.data[0];
    console.log('Selected slot for scheduling:', firstSlot.time);

    // 4. Update draft with scheduled details
    console.log('\n--- 4. UPDATING BOOKING DRAFT FOR SCHEDULED TYPE ---');
    const updateRes = await axios.put(`${BASE_URL}/users/one-time-bookings/draft/${draft._id}`, {
      bookingType: 'scheduled',
      address: draft.address,
      scheduledDate: tomorrow,
      scheduledTime: firstSlot.time
    }, { headers });

    if (updateRes.data.success) {
      console.log('✅ PUT /users/one-time-bookings/draft/:id Passed!');
    } else {
      throw new Error('Draft update failed: ' + updateRes.data.message);
    }

    // 5. Confirm scheduled booking draft
    console.log('\n--- 5. CONFIRMING REVIEW AND CREATING SCHEDULED BOOKING ---');
    const confirmRes = await axios.post(`${BASE_URL}/booking-draft/confirm`, {
      draftId: draft._id
    }, { headers });

    if (confirmRes.data.success) {
      console.log('✅ POST /booking-draft/confirm Passed! Booking ID:', confirmRes.data.bookingId);
    } else {
      throw new Error('Confirmation failed: ' + confirmRes.data.message);
    }

    const bookingId = confirmRes.data.bookingId;
    const createdBooking = await Booking.findById(bookingId);
    
    console.log('Created booking details:');
    console.log('- Booking type:', createdBooking.bookingType);
    console.log('- Status:', createdBooking.status);
    console.log('- Scheduled start time (IST/Local):', createdBooking.scheduledStartAt);
    
    if (createdBooking.bookingType === 'scheduled' && createdBooking.status === 'scheduled') {
      console.log('✅ Scheduled status correct! Immediate worker matching bypassed successfully.');
    } else {
      throw new Error(`Scheduled status verification failed. Type: ${createdBooking.bookingType}, Status: ${createdBooking.status}`);
    }

    // 6. Test background scheduler matching logic
    console.log('\n--- 6. SIMULATING SCHEDULER MATCHING TRIGGER ---');
    
    // Simulate time passing: shift scheduledStartAt to 15 minutes from now so scheduler matches it
    const now = new Date();
    createdBooking.scheduledStartAt = new Date(now.getTime() + 15 * 60 * 1000); // 15 mins in future
    await createdBooking.save();

    console.log('Shifted booking start time to 15 minutes from now to trigger matching.');

    // Import and trigger matching task manually
    const { initializeScheduledScheduler } = require('../services/scheduledBookingScheduler');
    const scheduler = initializeScheduledScheduler();
    
    console.log('Running processScheduledBookings() tick manually...');
    await scheduler.processScheduledBookings();

    // Verify booking status shifted to searching_worker
    const matchedBooking = await Booking.findById(bookingId);
    console.log('After scheduler tick:');
    console.log('- Status:', matchedBooking.status);
    console.log('- Potential workers count:', matchedBooking.potentialWorkers.length);

    if (matchedBooking.status === 'searching_worker') {
      console.log('✅ Scheduler matched successfully! Booking transitioned to searching_worker.');
    } else if (matchedBooking.status === 'admin_action_required') {
      console.log('✅ Scheduler ran successfully! Set to admin_action_required since no workers online.');
    } else {
      throw new Error('Scheduler matching verification failed. Status: ' + matchedBooking.status);
    }

    console.log('\n✅ All tests passed successfully!');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Test failed with error:', err.message);
    process.exit(1);
  }
}

runTest();
