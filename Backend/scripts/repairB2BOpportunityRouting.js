/**
 * Repair B2B jobs whose marketplace opportunity was created with the wrong
 * category (everything used to collapse into the first catalog code) or with
 * the wrong opportunity type, and rebuild their vendor queue.
 *
 * Usage:
 *   node scripts/repairB2BOpportunityRouting.js            # dry run
 *   node scripts/repairB2BOpportunityRouting.js --apply    # persist changes
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');

const APPLY = process.argv.includes('--apply');

(async () => {
  await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);

  const Opportunity = require('../models/Opportunity');
  const B2BJob = require('../models/B2BJob');
  const B2BCompany = require('../models/B2BCompany');
  const ServiceConfig = require('../models/ServiceConfig');
  const { resolveCategoryMatch } = require('../utils/createOpportunityFromEnquiry');
  const { startAssignmentForOpportunity } = require('../services/projectAssignmentEngine.service');

  const opportunities = await Opportunity.find({
    'assignment.b2bJobId': { $ne: null },
    status: 'open'
  }).sort({ createdAt: -1 });

  console.log(`${APPLY ? 'APPLY' : 'DRY RUN'} — ${opportunities.length} open B2B-linked opportunities\n`);

  const stats = { recategorized: 0, retyped: 0, requeued: 0, escalated: 0, unchanged: 0 };

  for (const opp of opportunities) {
    const job = await B2BJob.findById(opp.assignment.b2bJobId);
    if (!job) {
      console.log(`- ${opp.opportunityCode}: source B2B job missing, skipped`);
      continue;
    }

    const match = await resolveCategoryMatch({
      enquiryType: 'b2b',
      equipmentType: [job.service, job.subService].filter(Boolean),
      hints: [job.deviceId, job.siteId]
    });

    if (!match.matched) {
      console.log(
        `- ${opp.opportunityCode}: "${job.service}" has no catalog category -> escalate job ${job.jobId}`
      );
      stats.escalated += 1;
      if (APPLY) {
        opp.status = 'cancelled';
        await opp.save();
        await B2BJob.updateOne(
          { _id: job._id },
          {
            $set: {
              status: 'escalated',
              incompleteReason: `No service category configured for "${job.service}"`
            }
          }
        );
      }
      continue;
    }

    const changes = [];
    if (String(opp.categoryCode).toUpperCase() !== match.code) {
      const cfg = await ServiceConfig.findOne({ categoryCode: match.code }).select('categoryName').lean();
      changes.push(`category ${opp.categoryCode} -> ${match.code}`);
      if (APPLY) {
        opp.categoryCode = match.code;
        opp.categoryName = cfg?.categoryName || match.code;
      }
      stats.recategorized += 1;
    }

    if (opp.type !== 'b2b_opportunity') {
      changes.push(`type ${opp.type} -> b2b_opportunity`);
      if (APPLY) opp.type = 'b2b_opportunity';
      stats.retyped += 1;
    }

    if (!opp.clientInfo?.company) {
      const company = await B2BCompany.findById(job.companyId).select('companyName').lean();
      if (company?.companyName && APPLY) {
        opp.clientInfo.company = company.companyName;
        opp.clientInfo.clientType = 'b2b';
      }
      if (company?.companyName) changes.push(`company -> ${company.companyName}`);
    }

    const queueEmpty = !(opp.assignment.vendorQueue || []).length;
    const allClosed = (opp.assignment.vendorQueue || []).every((q) =>
      ['timeout', 'rejected', 'skipped'].includes(q.status)
    );
    const needsRequeue = changes.length > 0 || queueEmpty || allClosed;

    if (!needsRequeue) {
      stats.unchanged += 1;
      continue;
    }

    console.log(
      `- ${opp.opportunityCode} (${job.service}): ${changes.join(', ') || 'no field change'}${
        needsRequeue ? ' + rebuild vendor queue' : ''
      }`
    );

    if (APPLY) {
      await opp.save();
      const updated = await startAssignmentForOpportunity(opp._id, {
        city: job.city,
        address: job.address,
        requiredEngineers: 1
      });
      const count = updated?.assignment?.vendorQueue?.length || 0;
      console.log(`    -> vendors queued: ${count}`);
      if (count > 0) {
        await B2BJob.updateOne({ _id: job._id }, { $set: { status: 'pending' } });
      }
      stats.requeued += 1;
    }
  }

  console.log('\nSummary:', stats);
  if (!APPLY) console.log('\nNothing was written. Re-run with --apply to persist.');

  await mongoose.disconnect();
})().catch(async (e) => {
  console.error('REPAIR ERROR:', e);
  try {
    await mongoose.disconnect();
  } catch (_) {
    /* ignore */
  }
  process.exit(1);
});
