require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

(async () => {
  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
  const Vendor = require('../models/Vendor');
  const Opportunity = require('../models/Opportunity');
  const ServiceConfig = require('../models/ServiceConfig');

  const v = await Vendor.findOne({ businessName: /WETZEL|BARRON/i })
    .select('_id businessName approvedServices email')
    .lean();
  console.log('VENDOR', JSON.stringify(v, null, 2));

  if (v) {
    const codes = (v.approvedServices || []).map((s) => s.categoryCode);
    const openAll = await Opportunity.countDocuments({
      eligibleVendors: v._id,
      status: 'open'
    });
    const openMatched = await Opportunity.countDocuments({
      eligibleVendors: v._id,
      status: 'open',
      categoryCode: { $in: codes }
    });
    const sample = await Opportunity.find({ eligibleVendors: v._id })
      .select('title categoryCode type status')
      .limit(8)
      .lean();
    console.log({ openAll, openMatched, codes, sample });
    const cfg = await ServiceConfig.findOne({ categoryCode: 'C01' })
      .select('categoryCode categoryName extraKPIs')
      .lean();
    console.log('C01 config', cfg);
  }
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
