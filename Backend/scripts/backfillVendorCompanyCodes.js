/**
 * One-time: generate uniqueCompanyCode for all approved vendors missing a code.
 * Usage: node Backend/scripts/backfillVendorCompanyCodes.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const Vendor = require('../models/Vendor');
const { ensureVendorCompanyCode } = require('../utils/vendorCompanyCode');

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
    console.error('MONGODB_URI missing');
    process.exit(1);
  }
  await mongoose.connect(uri);
  const vendors = await Vendor.find({
    approvalStatus: 'approved',
    $or: [
      { uniqueCompanyCode: null },
      { uniqueCompanyCode: { $exists: false } },
      { uniqueCompanyCode: '' }
    ]
  });
  console.log(`Found ${vendors.length} approved vendors without company code`);
  for (const v of vendors) {
    const code = await ensureVendorCompanyCode(v);
    console.log(`✓ ${v.businessName || v.name || v._id} → ${code}`);
  }
  await mongoose.disconnect();
  console.log('Done');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
