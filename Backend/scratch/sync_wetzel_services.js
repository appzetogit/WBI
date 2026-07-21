require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

(async () => {
  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
  const Vendor = require('../models/Vendor');
  const { invalidateVendorConfigCache } = require('../controllers/vendorControllers/vendorConfigController');

  const v = await Vendor.findOne({ businessName: /WETZEL|BARRON/i });
  if (!v) {
    console.log('Vendor not found');
    process.exit(1);
  }

  v.service = (v.approvedServices || []).filter((s) => s.status !== 'suspended').map((s) => s.categoryName);
  v.categories = (v.approvedServices || []).filter((s) => s.status !== 'suspended').map((s) => s.categoryCode);
  await v.save();
  await invalidateVendorConfigCache(v._id);

  console.log('Synced legacy fields + invalidated cache for', v.businessName);
  console.log({ service: v.service, categories: v.categories, approvedServices: v.approvedServices });
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
