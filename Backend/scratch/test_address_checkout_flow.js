const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const axios = require('axios');
const jwt = require('jsonwebtoken');

dotenv.config({ path: path.join(__dirname, '../.env') });

const User = require('../models/User');
const Address = require('../models/Address');
const BookingDraft = require('../models/BookingDraft');

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

    // 2. Clear old test addresses to clean up DB
    await Address.deleteMany({ userId: user._id });

    // 3. Create Address API
    console.log('\n--- 2. CREATING ADDRESS VIA POST API ---');
    const newAddressPayload = {
      label: 'Home',
      fullAddress: 'Vikas Nagar, South Tukoganj, Indore, Madhya Pradesh 452001',
      street: 'South Tukoganj',
      city: 'Indore',
      state: 'Madhya Pradesh',
      pincode: '452001',
      latitude: 22.7196,
      longitude: 75.8577
    };

    const createRes = await axios.post(`${BASE_URL}/users/addresses`, newAddressPayload, { headers });
    if (createRes.data.success) {
      console.log('✅ POST /api/users/addresses Passed! Address ID:', createRes.data.data._id);
    } else {
      throw new Error('Create address failed: ' + createRes.data.message);
    }

    const savedAddressId = createRes.data.data._id;

    // 4. Query Addresses API
    console.log('\n--- 3. QUERYING ADDRESSES VIA GET API ---');
    const getRes = await axios.get(`${BASE_URL}/users/addresses`, { headers });
    if (getRes.data.success && Array.isArray(getRes.data.data)) {
      console.log(`✅ GET /api/users/addresses Passed! Found ${getRes.data.data.length} addresses.`);
      const current = getRes.data.data.find(a => a._id === savedAddressId);
      if (current && current.isDefault === true) {
        console.log('✅ Default check: Address correctly auto-selected as default!');
      } else {
        throw new Error('Default check failed on created address');
      }
    } else {
      throw new Error('GET addresses failed');
    }

    // 5. Update Draft Checkout Details
    console.log('\n--- 4. UPDATING BOOKING DRAFT DETAILS ---');
    const draft = await BookingDraft.findOne({ userId: user._id }).sort({ createdAt: -1 });
    if (!draft) throw new Error('No draft found. Please run seed and sub-services test first.');

    const checkoutPayload = {
      bookingType: 'scheduled',
      address: {
        type: 'home',
        addressLine1: createRes.data.data.fullAddress,
        addressLine2: createRes.data.data.street,
        city: createRes.data.data.city,
        state: createRes.data.data.state,
        pincode: createRes.data.data.pincode,
        lat: createRes.data.data.latitude,
        lng: createRes.data.data.longitude
      },
      scheduledDate: new Date(),
      scheduledTime: '10:00 AM'
    };

    const updateRes = await axios.put(`${BASE_URL}/users/one-time-bookings/draft/${draft._id}`, checkoutPayload, { headers });
    if (updateRes.data.success) {
      console.log('✅ PUT /api/users/one-time-bookings/draft/:id Passed!');
    } else {
      throw new Error('Update draft checkout failed: ' + updateRes.data.message);
    }

    // 6. Review Draft Verification
    console.log('\n--- 5. CHECKING DRAFT REVIEW VERIFICATION ---');
    const reviewRes = await axios.get(`${BASE_URL}/booking-draft/${draft._id}/review`, { headers });
    if (reviewRes.data.success) {
      const reviewData = reviewRes.data.data;
      if (reviewData.bookingType === 'scheduled' && reviewData.address) {
        console.log('✅ Address & BookingType successfully updated in DB Review draft!');
      } else {
        throw new Error('Mismatched checkout data in review draft');
      }
    } else {
      throw new Error('GET review draft failed');
    }

    console.log('\n=======================================');
    console.log('🎉 ALL ADDRESS & TIME CHECKOUT FLOW INTEGRATION TESTS PASSED!');
    console.log('=======================================');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Address Checkout Test Failed:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
    process.exit(1);
  }
}

runTest();
