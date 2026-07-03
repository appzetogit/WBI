const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const OneTimeService = require('./Backend/models/OneTimeService');

dotenv.config({ path: path.join(__dirname, 'Backend', '.env') });

async function remove() {
  await mongoose.connect(process.env.MONGODB_URI);
  
  const slugs = ['office-equipment-repair', 'automobile-repair-setup'];
  const res = await OneTimeService.deleteMany({ slug: { $in: slugs } });
  console.log(`Deleted ${res.deletedCount} old grouped services.`);

  await mongoose.disconnect();
}

remove().catch(console.error);
