require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const Vendor = require('../models/Vendor');
const Engineer = require('../models/Engineer');
const { ensureVendorCompanyCode } = require('../utils/vendorCompanyCode');

(async () => {
  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);

  const wetzel = await Vendor.findOne({
    $or: [
      { email: /kunal@gmail/i },
      { businessName: /WETZEL/i },
      { name: /WETZEL/i }
    ]
  }).select('businessName name email uniqueCompanyCode approvalStatus codeStatus');

  console.log('\n=== WETZEL VENDOR ===');
  if (!wetzel) {
    console.log('NOT FOUND');
  } else {
    if (wetzel.approvalStatus === 'approved') {
      await ensureVendorCompanyCode(wetzel);
    }
    console.log({
      id: String(wetzel._id),
      name: wetzel.businessName || wetzel.name,
      email: wetzel.email,
      approvalStatus: wetzel.approvalStatus,
      code: wetzel.uniqueCompanyCode
    });

    const linked = await Engineer.find({ vendorId: wetzel._id })
      .select('name phone email engineerType vendorApprovalStatus approvalStatus linkedViaCode createdAt')
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();
    console.log('\n=== ENGINEERS LINKED TO WETZEL ===', linked.length);
    console.log(JSON.stringify(linked, null, 2));
  }

  const recent = await Engineer.find({})
    .select('name phone email engineerType vendorId vendorApprovalStatus approvalStatus linkedViaCode createdAt')
    .sort({ createdAt: -1 })
    .limit(8)
    .lean();
  console.log('\n=== RECENT ENGINEERS (any vendor) ===');
  for (const e of recent) {
    let vName = null;
    if (e.vendorId) {
      const v = await Vendor.findById(e.vendorId).select('businessName name email').lean();
      vName = v ? (v.businessName || v.name || v.email) : String(e.vendorId);
    }
    console.log({
      name: e.name,
      phone: e.phone,
      type: e.engineerType,
      linkedViaCode: e.linkedViaCode,
      vendorApprovalStatus: e.vendorApprovalStatus,
      approvalStatus: e.approvalStatus,
      vendor: vName,
      createdAt: e.createdAt
    });
  }

  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
