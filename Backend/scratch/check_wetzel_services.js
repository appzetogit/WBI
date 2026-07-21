require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

(async () => {
  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
  const Vendor = require('../models/Vendor');
  const ServiceConfig = require('../models/ServiceConfig');

  const v = await Vendor.findOne({
    $or: [
      { companyName: /WETZEL|BARRON/i },
      { businessName: /WETZEL|BARRON/i }
    ]
  })
    .select('companyName businessName name approvedServices service categories onboarding vendorModels email phone')
    .lean();

  console.log('VENDOR:', JSON.stringify(v, null, 2));

  const scCount = await ServiceConfig.countDocuments({});
  const active = await ServiceConfig.countDocuments({ isActive: true });
  console.log('service_configs total:', scCount, 'active:', active);

  if (v?.approvedServices?.length) {
    const codes = v.approvedServices.map((s) => s.categoryCode);
    const matched = await ServiceConfig.find({ categoryCode: { $in: codes } })
      .select('categoryCode categoryName extraKPIs projectMilestones')
      .lean();
    console.log(
      'MATCHED CONFIGS:',
      matched.map((m) => ({
        code: m.categoryCode,
        name: m.categoryName,
        kpis: (m.extraKPIs || []).length,
        milestones: (m.projectMilestones || []).length
      }))
    );
  } else {
    console.log('approvedServices EMPTY or missing');
  }

  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
