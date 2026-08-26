const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const ServiceCategory = require('./Backend/models/ServiceCategory');
const OneTimeService = require('./Backend/models/OneTimeService');

dotenv.config({ path: path.join(__dirname, 'Backend', '.env') });

async function check() {
  await mongoose.connect(process.env.MONGODB_URI);
  
  const categories = await ServiceCategory.find().lean();
  console.log('Categories:');
  categories.forEach(c => console.log(`- ${c.name} (slug: ${c.slug}, audience: ${c.audience})`));

  console.log('\nServices in mobile-gadgets category:');
  const cat = await ServiceCategory.findOne({ slug: 'mobile-gadgets' }).lean();
  if (cat) {
    const services = await OneTimeService.find({ categoryId: cat._id }).lean();
    console.log(`Found ${services.length} services`);
    services.forEach(s => console.log(`- ${s.name} (slug: ${s.slug})`));
  } else {
    console.log('Category mobile-gadgets not found');
  }

  const mobileService = await OneTimeService.findOne({ slug: 'mobile-gadgets' }).lean();
  console.log('\nMobile & Gadgets Service:');
  if (mobileService) {
    console.log(`Found: ${mobileService.name}, categoryId: ${mobileService.categoryId}`);
    const actualCat = await ServiceCategory.findById(mobileService.categoryId).lean();
    console.log(`Actual category: ${actualCat ? actualCat.name : 'Unknown'}`);
  }

  await mongoose.disconnect();
}

check().catch(console.error);
