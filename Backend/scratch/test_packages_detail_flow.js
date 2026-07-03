const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const axios = require('axios');
const jwt = require('jsonwebtoken');

dotenv.config({ path: path.join(__dirname, '../.env') });

const User = require('../models/User');
const OneTimeService = require('../models/OneTimeService');
const ServiceBrand = require('../models/ServiceBrand');
const OneTimeSubService = require('../models/OneTimeSubService');
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

    // 2. Fetch AC Service details and LG brand
    console.log('\n--- 2. GETTING SERVICE & BRAND ---');
    const service = await OneTimeService.findOne({ slug: 'ac-service' });
    if (!service) throw new Error('AC Service not found in DB. Run seed first.');

    const brand = await ServiceBrand.findOne({ serviceId: service._id, brandName: 'LG' });
    if (!brand) throw new Error('LG brand not found in DB. Run seed first.');
    console.log(`Found service: ${service.name}, brand: ${brand.brandName}`);

    // 3. Query sub-services API
    console.log('\n--- 3. QUERYING SUB-SERVICES API ---');
    const subRes = await axios.get(`${BASE_URL}/services/${service._id}/sub-services?brandId=${brand._id}`);
    if (subRes.data.success && Array.isArray(subRes.data.data)) {
      console.log(`✅ GET /api/services/:serviceId/sub-services Passed! Found ${subRes.data.data.length} sub-services.`);
      
      // Check that General Service is present and is default
      const general = subRes.data.data.find(s => s.name.includes('General Service'));
      if (general && general.isDefault === true) {
        console.log('✅ Default check: General Service is pre-checked!');
      } else {
        throw new Error('Default check failed: General Service missing or not pre-checked');
      }
    } else {
      throw new Error('Query sub-services failed');
    }

    const firstSub = subRes.data.data[0];
    const secondSub = subRes.data.data[1];

    // 4. Test Create Draft with selected sub-services
    console.log('\n--- 4. CREATING BOOKING DRAFT ---');
    const draftPayload = {
      serviceId: service._id,
      brandId: brand._id,
      issueIds: [],
      packageIds: [firstSub.subServiceId, secondSub.subServiceId], // selected sub-services
      quantities: {
        [firstSub.subServiceId]: 1,
        [secondSub.subServiceId]: 1
      },
      priceSnapshot: {
        packageTotal: firstSub.price + secondSub.price,
        finalAmount: firstSub.price + secondSub.price
      },
      customIssueText: 'Testing dynamic sub-services flow'
    };

    const draftRes = await axios.post(`${BASE_URL}/users/one-time-bookings/draft`, draftPayload, { headers });
    if (draftRes.data.success) {
      const draftId = draftRes.data.data._id;
      console.log('✅ POST /api/users/one-time-bookings/draft Passed! Draft ID:', draftId);

      // 5. Query review draft to test manual population & pricing calculations
      console.log('\n--- 5. CHECKING DRAFT REVIEW & MANUAL POPULATION ---');
      const reviewRes = await axios.get(`${BASE_URL}/booking-draft/${draftId}/review`);
      if (reviewRes.data.success) {
        const reviewData = reviewRes.data.data;
        console.log('Populated packageIds items list:', reviewData.packageIds);
        
        // Assert that names and prices are correctly populated from OneTimeSubService
        const names = reviewData.packageIds.map(p => p.name);
        if (names.includes(firstSub.name) && names.includes(secondSub.name)) {
          console.log('✅ Manual Population check: Sub-service names correctly populated!');
        } else {
          throw new Error('Manual Population check failed: Names mismatch');
        }

        // Assert calculated packageTotal is correct sum
        if (reviewData.priceSnapshot.packageTotal === (firstSub.price + secondSub.price)) {
          console.log(`✅ Pricing Calculation check: Package total sum matches checked items (₹${reviewData.priceSnapshot.packageTotal})!`);
        } else {
          throw new Error('Pricing Calculation check failed: total sum mismatch: ' + reviewData.priceSnapshot.packageTotal);
        }
      } else {
        throw new Error('GET review draft failed');
      }
    } else {
      throw new Error('POST draft failed: ' + draftRes.data.message);
    }

    console.log('\n=======================================');
    console.log('🎉 ALL ADD SERVICES STEP 2 INTEGRATION TESTS PASSED!');
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
