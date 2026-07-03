const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const OneTimeService = require('./Backend/models/OneTimeService');
const ServiceBrand = require('./Backend/models/ServiceBrand');

dotenv.config({ path: path.join(__dirname, 'Backend', '.env') });

async function verify() {
  await mongoose.connect(process.env.MONGODB_URI);
  
  const acService = await OneTimeService.findOne({ slug: 'ac-service' }).lean();
  console.log('AC Service Configuration:');
  console.log('Requires Brand:', acService.requiresBrand);
  console.log('Requires Problem:', acService.requiresProblem);
  console.log('Requires Package:', acService.requiresPackage);
  
  const acBrands = await ServiceBrand.find({ serviceId: acService._id }).lean();
  console.log('AC Service Brands Count:', acBrands.length);
  
  const carpenterService = await OneTimeService.findOne({ slug: 'carpenter' }).lean();
  console.log('\nCarpenter Service Configuration:');
  console.log('Requires Brand:', carpenterService.requiresBrand);
  console.log('Requires Problem:', carpenterService.requiresProblem);
  
  const carpenterBrands = await ServiceBrand.find({ serviceId: carpenterService._id }).lean();
  console.log('Carpenter Service Brands Count:', carpenterBrands.length);

  await mongoose.disconnect();
}

verify().catch(console.error);
