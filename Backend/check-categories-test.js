const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const ServiceCategory = require('./models/ServiceCategory');
const OneTimeService = require('./models/OneTimeService');

dotenv.config({ path: path.join(__dirname, '.env') });

async function check() {
  await mongoose.connect(process.env.MONGODB_URI);
  
  const cat = await ServiceCategory.findOne({ slug: 'audio-video' }).lean();
  if (cat) {
    const services = await OneTimeService.find({ categoryId: cat._id }).lean();
    console.log(`\nServices in audio-video category:`);
    console.log(`Found ${services.length} services`);
    services.forEach(s => console.log(`- ${s.name} (slug: ${s.slug})`));
  } else {
    console.log('Category audio-video not found');
  }

  await mongoose.disconnect();
}

check().catch(console.error);
