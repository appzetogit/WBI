/**
 * Targeted repair: recent ServiceRequest-linked opportunities only.
 * Usage: node scratch/repair_recent_sr_opportunities.js
 */
require('dotenv').config();
const mongoose = require('mongoose');

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const Opp = require('../models/Opportunity');
  const SR = require('../models/ServiceRequest');
  const { startAssignmentForOpportunity, buildVendorQueue, getAssignmentConfig } = require('../services/projectAssignmentEngine.service');

  const recent = await SR.find({ opportunityId: { $ne: null } })
    .sort({ createdAt: -1 })
    .limit(10)
    .select('requestCode opportunityId categoryCode subCatCode contact.city payment.status createdAt')
    .lean();

  console.log('Recent SRs with opportunity:', recent.length);

  for (const sr of recent) {
    const opp = await Opp.findById(sr.opportunityId);
    if (!opp || opp.status !== 'open') {
      console.log(sr.requestCode, 'skip — opp missing or not open');
      continue;
    }
    const queueLen = opp.assignment?.vendorQueue?.length || 0;
    if (queueLen > 0 && opp.assignment?.phase !== 'freelancer_pool') {
      console.log(sr.requestCode, opp.opportunityCode, 'already queued', queueLen, opp.assignment?.phase);
      continue;
    }

    const config = await getAssignmentConfig(opp.categoryCode);
    const preview = await buildVendorQueue(opp, config);
    console.log(sr.requestCode, opp.opportunityCode, {
      city: sr.contact?.city,
      phase: opp.assignment?.phase,
      preview: preview.length
    });
    if (!preview.length) continue;

    await startAssignmentForOpportunity(opp._id, {
      requiredEngineers: opp.assignment?.requiredEngineers || 1,
      serviceRequestId: sr._id,
      subCatCode: opp.assignment?.subCatCode || sr.subCatCode,
      city: sr.contact?.city,
      address: sr.contact?.address
    });

    const refreshed = await Opp.findById(opp._id).lean();
    console.log('  →', {
      queue: refreshed.assignment?.vendorQueue?.length,
      eligible: refreshed.eligibleVendors?.length,
      phase: refreshed.assignment?.phase
    });
  }

  await mongoose.disconnect();
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
