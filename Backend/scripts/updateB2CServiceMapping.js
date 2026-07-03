const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const ServiceCategory = require('../models/ServiceCategory');
const OneTimeService = require('../models/OneTimeService');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

const dbUrl = process.env.MONGODB_URI;

const updateMappings = async () => {
  try {
    await mongoose.connect(dbUrl, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('MongoDB Connected for Mapping Update');

    // Get B2C categories
    const categories = await ServiceCategory.find({ audience: 'b2c' }).lean();
    const catMap = {};
    categories.forEach(c => {
      catMap[c.slug] = c._id;
    });

    const services = await OneTimeService.find({});
    for (const service of services) {
      const name = service.name.toLowerCase();
      let targetCategorySlug = 'home-appliances'; // Default fallback

      if (name.includes('plumb')) {
        targetCategorySlug = 'plumbing';
      } else if (name.includes('electr')) {
        targetCategorySlug = 'electrical';
      } else if (name.includes('cctv') || name.includes('camera')) {
        targetCategorySlug = 'cctv';
      } else if (name.includes('atm') || name.includes('pos') || name.includes('biometric')) {
        targetCategorySlug = 'banking-devices';
      } else if (name.includes('mobile') || name.includes('screen') || name.includes('battery')) {
        targetCategorySlug = 'mobile-gadgets';
      } else if (name.includes('laptop') || name.includes('desktop') || name.includes('computer')) {
        targetCategorySlug = 'it-computer';
      } else if (name.includes('tv') || name.includes('mounting') || name.includes('audio') || name.includes('theatre')) {
        targetCategorySlug = 'audio-video';
      }

      if (catMap[targetCategorySlug]) {
        service.categoryId = catMap[targetCategorySlug];
        await service.save();
        console.log(`Updated "${service.name}" -> Category: "${targetCategorySlug}"`);
      }
    }

    console.log('Mappings updated successfully!');
    await mongoose.disconnect();
  } catch (error) {
    console.error('Mapping update failed:', error);
  }
};

updateMappings();
