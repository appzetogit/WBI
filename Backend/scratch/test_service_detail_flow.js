const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const axios = require('axios');
const jwt = require('jsonwebtoken');

dotenv.config({ path: path.join(__dirname, '../.env') });

const User = require('../models/User');
const OneTimeService = require('../models/OneTimeService');
const ServiceBrand = require('../models/ServiceBrand');
const ServiceIssue = require('../models/ServiceIssue');
const BookingDraft = require('../models/BookingDraft');

const API_BASE = 'http://localhost:5173/api'; // Or 5000 depending on nodemon port. Let's check which port nodemon runs.
// Wait! Let's check the PORT configured in backend .env or server.js.
// We can use a direct local require test to call the controllers if we don't know the exact port, OR we can check server.js.
// Let's inspect the active nodemon process in the backend. It runs `server.js` on port 5000 by default in most MERN apps.
// To be absolute safe, let's load variables and test endpoints directly or hit http://localhost:5000/api
const PORT = process.env.PORT || 5000;
const BASE_URL = `http://localhost:${PORT}/api`;

async function runTest() {
  try {
    console.log('Connecting to database...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected!');

    // 1. Create or Find test user
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
    } else {
      console.log('Test customer already exists.');
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET || 'jwt_secret_key_12345',
      { expiresIn: '1h' }
    );
    const headers = { Authorization: `Bearer ${token}` };

    // 2. Fetch AC Service details
    console.log('\n--- 2. FETCHING SERVICE DETAILS ---');
    const service = await OneTimeService.findOne({ slug: 'ac-service' });
    if (!service) {
      throw new Error('AC Service details not found. Please run the seed script first.');
    }
    console.log(`Found service: ${service.name} (${service._id})`);

    const svcRes = await axios.get(`${BASE_URL}/users/one-time-services/ac-service`);
    if (svcRes.data.success && svcRes.data.data.name === 'AC Service') {
      console.log('✅ GET /api/users/one-time-services/:slug Passed!');
    } else {
      throw new Error('GET service details failed');
    }

    // 3. Fetch Brands
    console.log('\n--- 3. FETCHING BRANDS ---');
    const brandsRes = await axios.get(`${BASE_URL}/users/one-time-services/${service._id}/brands`);
    if (brandsRes.data.success && Array.isArray(brandsRes.data.data)) {
      console.log(`✅ GET /api/users/one-time-services/:serviceId/brands Passed! Found ${brandsRes.data.data.length} brands.`);
    } else {
      throw new Error('GET brands failed');
    }
    const sampleBrand = brandsRes.data.data[0];

    // 4. Fetch Issues
    console.log('\n--- 4. FETCHING ISSUES ---');
    const issuesRes = await axios.get(`${BASE_URL}/users/one-time-services/${service._id}/issues`);
    if (issuesRes.data.success && Array.isArray(issuesRes.data.data)) {
      console.log(`✅ GET /api/users/one-time-services/:serviceId/issues Passed! Found ${issuesRes.data.data.length} issues.`);
    } else {
      throw new Error('GET issues failed');
    }
    const sampleIssue = issuesRes.data.data[0];

    // 5. Check & Toggle Wishlist Status
    console.log('\n--- 5. TESTING WISHLIST FAVORITES API ---');
    // Check initially
    let favStatusRes = await axios.get(`${BASE_URL}/users/one-time-services/${service._id}/wishlist-status`, { headers });
    console.log('Initial wishlist status:', favStatusRes.data.isWishlisted);

    // Toggle ON
    const toggleOnRes = await axios.post(`${BASE_URL}/users/one-time-services/${service._id}/wishlist`, {}, { headers });
    if (toggleOnRes.data.success && toggleOnRes.data.isWishlisted === true) {
      console.log('✅ Toggle ON: Wishlist Favorite persisted successfully!');
    } else {
      throw new Error('Toggle ON failed');
    }

    // Verify status is true
    favStatusRes = await axios.get(`${BASE_URL}/users/one-time-services/${service._id}/wishlist-status`, { headers });
    if (favStatusRes.data.success && favStatusRes.data.isWishlisted === true) {
      console.log('✅ Status verification: true Passed!');
    } else {
      throw new Error('Status verification after toggle ON failed');
    }

    // Toggle OFF
    const toggleOffRes = await axios.post(`${BASE_URL}/users/one-time-services/${service._id}/wishlist`, {}, { headers });
    if (toggleOffRes.data.success && toggleOffRes.data.isWishlisted === false) {
      console.log('✅ Toggle OFF: Wishlist Favorite removed successfully!');
    } else {
      throw new Error('Toggle OFF failed');
    }

    // Verify status is false
    favStatusRes = await axios.get(`${BASE_URL}/users/one-time-services/${service._id}/wishlist-status`, { headers });
    if (favStatusRes.data.success && favStatusRes.data.isWishlisted === false) {
      console.log('✅ Status verification: false Passed!');
    } else {
      throw new Error('Status verification after toggle OFF failed');
    }

    // 6. Test Estimate API
    console.log('\n--- 6. TESTING ESTIMATE API ---');
    const estRes = await axios.get(`${BASE_URL}/users/one-time-services/${service._id}/estimate?brandId=${sampleBrand._id}&issueIds=${sampleIssue._id}`);
    if (estRes.data.success && estRes.data.data.startingPrice === 299) {
      console.log('✅ GET /api/users/one-time-services/:serviceId/estimate Passed! startingPrice is 299.');
    } else {
      throw new Error('GET estimate failed or startingPrice invalid');
    }

    // 7. Test Create Draft with Custom description
    console.log('\n--- 7. TESTING BOOKING DRAFT MAPPING ---');
    const draftPayload = {
      serviceId: service._id,
      brandId: sampleBrand._id,
      issueIds: [sampleIssue._id, 'other'],
      packageIds: [service._id], // dummy package Id representation for testing validation
      quantities: { [service._id]: 1 },
      priceSnapshot: {
        packageTotal: 299,
        finalAmount: 299
      },
      customIssueText: 'My AC filter is completely blocked and blowing hot air.'
    };

    // To allow packageIds to pass validation in draft controller, let's seed a ServicePackage if needed.
    // Wait, the seed script already created a starter package for AC Service! Let's query it.
    const ServicePackage = require('../models/ServicePackage');
    const pkg = await ServicePackage.findOne({ serviceId: service._id });
    if (pkg) {
      draftPayload.packageIds = [pkg._id];
      draftPayload.quantities = { [pkg._id]: 1 };
    }

    const draftRes = await axios.post(`${BASE_URL}/users/one-time-bookings/draft`, draftPayload, { headers });
    if (draftRes.data.success) {
      const draftId = draftRes.data.data._id;
      console.log('Draft created successfully. ID:', draftId);

      // Verify the specialInstructions in MongoDB contains customIssueText
      const savedDraft = await BookingDraft.findById(draftId);
      if (savedDraft.specialInstructions === 'My AC filter is completely blocked and blowing hot air.') {
        console.log('✅ MongoDB Draft Verification: specialInstructions correctly mapped to customIssueText! Passed!');
      } else {
        throw new Error('specialInstructions mismatch: ' + savedDraft.specialInstructions);
      }
    } else {
      throw new Error('Create draft post failed: ' + draftRes.data.message);
    }

    console.log('\n=======================================');
    console.log('🎉 ALL SERVICE DETAILS INTEGRATION TESTS PASSED!');
    console.log('=======================================');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Integration Test Failed:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
    process.exit(1);
  }
}

runTest();
