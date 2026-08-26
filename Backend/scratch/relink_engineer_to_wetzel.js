require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const Vendor = require('../models/Vendor');
const Engineer = require('../models/Engineer');

(async () => {
  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);

  const wetzel = await Vendor.findOne({ email: 'kunal@gmail.com' })
    || await Vendor.findOne({ businessName: /WETZEL/i });

  if (!wetzel) {
    console.log('WETZEL not found');
    process.exit(1);
  }

  // Prefer kunal login vendor if different from aakash email one
  const kunal = await Vendor.findOne({ email: /kunal@gmail/i });
  const target = kunal || wetzel;

  console.log('Target vendor:', {
    id: String(target._id),
    name: target.businessName || target.name,
    email: target.email,
    code: target.uniqueCompanyCode
  });

  const eng = await Engineer.findOne({ phone: '6261745842' })
    || await Engineer.findOne({ name: /Aakash/i }).sort({ createdAt: -1 });

  if (!eng) {
    console.log('Engineer not found');
    process.exit(1);
  }

  eng.vendorId = target._id;
  eng.engineerType = 'vendor_engineer';
  eng.linkedViaCode = target.uniqueCompanyCode || 'WBI-2026-9H9NEQ';
  eng.vendorApprovalStatus = 'approved';
  eng.approvalStatus = 'approved';
  eng.isActive = true;
  await eng.save();

  console.log('Relinked engineer:', {
    id: String(eng._id),
    name: eng.name,
    phone: eng.phone,
    vendorId: String(eng.vendorId),
    vendorApprovalStatus: eng.vendorApprovalStatus,
    approvalStatus: eng.approvalStatus,
    linkedViaCode: eng.linkedViaCode
  });

  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
