require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const Vendor = require('../models/Vendor');
const Engineer = require('../models/Engineer');
const { ensureVendorCompanyCode } = require('../utils/vendorCompanyCode');

(async () => {
  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);

  const vendor = await Vendor.findOne({ email: /kunal@gmail/i });
  if (!vendor) {
    console.log('kunal vendor not found');
    process.exit(1);
  }

  vendor.approvalStatus = 'approved';
  await vendor.save();
  const code = await ensureVendorCompanyCode(vendor);

  const eng = await Engineer.findById('6a5b7a6ad5044878739f989e');
  if (eng) {
    eng.vendorId = vendor._id;
    eng.linkedViaCode = code;
    eng.vendorApprovalStatus = 'approved';
    eng.approvalStatus = 'approved';
    eng.engineerType = 'vendor_engineer';
    eng.isActive = true;
    await eng.save();
  }

  const list = await Engineer.find({ vendorId: vendor._id })
    .select('name phone vendorApprovalStatus approvalStatus linkedViaCode')
    .lean();

  console.log(JSON.stringify({
    vendor: {
      id: String(vendor._id),
      name: vendor.businessName || vendor.name,
      email: vendor.email,
      code
    },
    engineers: list
  }, null, 2));

  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
