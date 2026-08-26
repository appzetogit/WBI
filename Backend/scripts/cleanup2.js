const mongoose = require('mongoose');
require('dotenv').config();
const ServiceCategory = require('../models/ServiceCategory');
const OneTimeService = require('../models/OneTimeService');

const cleanup = async () => {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected. Finding test categories...');
    
    const cats = await ServiceCategory.find({ name: { $regex: /test/i } });
    console.log('Found ServiceCategories:', cats.map(c => c.name));
    
    const oneTime = await OneTimeService.find({ name: { $regex: /test/i } });
    console.log('Found OneTimeServices:', oneTime.map(c => c.name));
    
    const deleteCat = await ServiceCategory.deleteMany({ name: { $regex: /test/i } });
    console.log('Deleted ServiceCategories:', deleteCat.deletedCount);
    
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

cleanup();
