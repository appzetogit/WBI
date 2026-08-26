require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const Vendor = require('../models/Vendor');
const { ensureVendorCompanyCode } = require('../utils/vendorCompanyCode');

(async () => {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
    console.error('NO_URI');
    process.exit(1);
  }
  await mongoose.connect(uri);

  let v = await Vendor.findOne({
    approvalStatus: 'approved',
    uniqueCompanyCode: { $nin: [null, ''] }
  }).select('businessName name email phone uniqueCompanyCode');

  if (!v) {
    v = await Vendor.findOne({ approvalStatus: 'approved' })
      .select('businessName name email phone uniqueCompanyCode approvalStatus');
    if (!v) {
      console.log(JSON.stringify({ error: 'No approved vendor found' }, null, 2));
      await mongoose.disconnect();
      process.exit(0);
    }
    await ensureVendorCompanyCode(v);
  }

  console.log(JSON.stringify({
    companyName: v.businessName || v.name,
    email: v.email,
    phone: v.phone,
    code: v.uniqueCompanyCode,
  }, null, 2));

  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
