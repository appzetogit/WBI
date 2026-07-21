/**
 * Re-run assignment for opportunities stuck with empty vendorQueue (one-off repair).
 * Usage: node scratch/repair_opp_assignment.js OPP-2026-0503
 */
require('dotenv').config();
const mongoose = require('mongoose');

(async () => {
  const code = process.argv[2] || 'OPP-2026-0503';
  await mongoose.connect(process.env.MONGODB_URI);
  const Opp = require('../models/Opportunity');
  const SR = require('../models/ServiceRequest');
  const { startAssignmentForOpportunity } = require('../services/projectAssignmentEngine.service');

  const opp = await Opp.findOne({ opportunityCode: code });
  if (!opp) {
    console.error('Opportunity not found', code);
    process.exit(1);
  }

  const srId = opp.assignment?.serviceRequestId;
  const sr = srId ? await SR.findById(srId).lean() : null;

  await startAssignmentForOpportunity(opp._id, {
    requiredEngineers: opp.assignment?.requiredEngineers || 1,
    serviceRequestId: srId,
    subCatCode: opp.assignment?.subCatCode,
    city: sr?.contact?.city || opp.clientInfo?.city,
    address: sr?.contact?.address,
    coordinates: null
  });

  if (srId) {
    await SR.updateOne({ _id: srId }, { $set: { opportunityId: opp._id } });
  }

  const refreshed = await Opp.findById(opp._id).lean();
  console.log('Repaired', {
    code: refreshed.opportunityCode,
    queue: refreshed.assignment?.vendorQueue?.length,
    eligible: refreshed.eligibleVendors?.length,
    phase: refreshed.assignment?.phase
  });
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
