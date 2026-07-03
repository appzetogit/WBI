const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const ServiceCategory = require('../models/ServiceCategory');
const OneTimeService = require('../models/OneTimeService');
const SubService = require('../models/SubService');
const ServiceIssue = require('../models/ServiceIssue');

dotenv.config({ path: path.join(__dirname, '../.env') });

const dbUrl = process.env.MONGODB_URI;

const verifyCatalog = async () => {
  try {
    await mongoose.connect(dbUrl, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('--- WBI CATALOG ARCHITECTURE VERIFICATION ---');

    // 1. Verify Service Categories schema fields
    const categories = await ServiceCategory.find({ isActive: true }).lean();
    console.log(`\n1. Found ${categories.length} total active categories.`);
    
    const b2cCategories = categories.filter(c => c.audience === 'b2c');
    const b2bCategories = categories.filter(c => c.audience === 'b2b');
    console.log(`   - B2C Categories count: ${b2cCategories.length}`);
    console.log(`   - B2B Categories count: ${b2bCategories.length}`);

    if (b2cCategories.length === 0) {
      throw new Error('Verification Failed: No B2C categories found.');
    }

    // 2. Verify sub-services linking
    const oneTimeServices = await OneTimeService.find({ isActive: true }).lean();
    console.log(`\n2. Found ${oneTimeServices.length} active B2C sub-services.`);
    
    const linkedB2CServices = oneTimeServices.filter(s => s.categoryId);
    console.log(`   - Linked B2C Sub-services count: ${linkedB2CServices.length}`);

    if (linkedB2CServices.length === 0) {
      throw new Error('Verification Failed: No linked B2C sub-services found.');
    }

    // 3. Test home grouping controllers logic
    const { getHomeServices } = require('../controllers/userControllers/userHome.controller');
    // Simulate req/res
    let jsonCalled = false;
    let responseData = null;
    const req = {};
    const res = {
      status: (code) => ({
        json: (data) => {
          jsonCalled = true;
          responseData = data;
        }
      })
    };

    console.log('\n3. Simulating userHome/getHomeServices aggregation...');
    // We clear redis cache temporarily to force DB query in simulation if cache exists
    const { delCache } = require('../services/redisService');
    await delCache('homeServicesData');

    await getHomeServices(req, res);

    if (!jsonCalled || !responseData || !responseData.success) {
      throw new Error('Verification Failed: getHomeServices failed to return data.');
    }

    console.log('   - getHomeServices returned successfully.');
    console.log(`   - Categories returned: ${responseData.categories.length}`);
    const firstCatId = responseData.categories[0].id;
    console.log(`   - Services grouped for category ID ${firstCatId}: ${responseData.services[firstCatId]?.length || 0}`);

    console.log('\n--- VERIFICATION SUCCESSFUL: ALL CHECKS PASSED ---');
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('\nVerification Failed with Error:', error);
    process.exit(1);
  }
};

verifyCatalog();
