require('dotenv').config();
const mongoose = require('mongoose');

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const Opp = require('../models/Opportunity');
  const opp = await Opp.findById(
    (await Opp.findOne({ opportunityCode: 'OPP-2026-0503' }).select('_id'))._id
  );
  const { buildVendorQueue, getAssignmentConfig } = require('../services/projectAssignmentEngine.service');
  const config = await getAssignmentConfig(opp.categoryCode);
  const queue = await buildVendorQueue(opp, config);
  console.log('queue length', queue.length, queue);
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
