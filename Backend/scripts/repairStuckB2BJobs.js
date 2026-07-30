/**
 * One-off repair for B2B jobs that stalled before the allocation dead-ends were
 * fixed: opportunities parked forever in `freelancer_pool`, and jobs sitting in
 * `pending` with no owner.
 *
 * Each stuck job is driven through the corrected terminal path — escalated to
 * admin with its escrow returned — so nothing is left silently waiting.
 *
 *   node scripts/repairStuckB2BJobs.js          # report only
 *   node scripts/repairStuckB2BJobs.js --apply  # write changes
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');

const APPLY = process.argv.includes('--apply');

(async () => {
  await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);

  const B2BJob = require('../models/B2BJob');
  const Opportunity = require('../models/Opportunity');
  const { handleAssignmentFailure, markB2BAllocationStage } = require('../services/projectAssignmentEngine.service');

  const jobs = await B2BJob.find({
    status: { $in: ['pending', 'searching_engineer', 'escalated'] },
    assignedTo: null
  }).lean();

  console.log(`Found ${jobs.length} unassigned job(s) in a non-terminal state\n`);

  const summary = { escalated: 0, stageOnly: 0, alreadyEscalated: 0, noOpportunity: 0 };

  for (const job of jobs) {
    const opp = await Opportunity.findOne({ 'assignment.b2bJobId': job._id }).sort({ createdAt: -1 });
    const phase = opp?.assignment?.phase || null;
    const label = `${job.jobId} [${job.status}] ${job.service}`;

    // Opportunity is gone or was never created — the job can only be escalated.
    if (!opp) {
      summary.noOpportunity += 1;
      console.log(`${label}: no opportunity → escalate`);
      if (APPLY && job.status !== 'escalated') {
        await B2BJob.updateOne(
          { _id: job._id },
          {
            $set: {
              status: 'escalated',
              allocationStage: 'admin_escalation',
              allocationReason: 'No marketplace opportunity was created for this job',
              allocationUpdatedAt: new Date()
            }
          }
        );
      }
      continue;
    }

    // Already-cancelled opportunity + escalated job: only the new stage fields are missing.
    if (opp.status !== 'open') {
      summary.alreadyEscalated += 1;
      console.log(`${label}: opportunity ${opp.status} → backfill stage`);
      if (APPLY) {
        await B2BJob.updateOne(
          { _id: job._id },
          {
            $set: {
              status: 'escalated',
              allocationStage: 'admin_escalation',
              allocationReason:
                job.allocationReason ||
                `No provider accepted "${job.service}" — needs admin action`,
              allocationUpdatedAt: new Date()
            }
          }
        );
      }
      continue;
    }

    // Live vendor round in progress — leave it alone, just record the stage.
    if (phase === 'waiting_vendor_acceptance') {
      summary.stageOnly += 1;
      console.log(`${label}: vendor still reviewing → stage only`);
      if (APPLY) await markB2BAllocationStage(opp, 'vendor_marketplace', 'Vendor reviewing');
      continue;
    }

    // A provider already owns this job; it needs an engineer, not an escalation.
    if (['awaiting_engineer', 'vendor_accepted', 'awarded'].includes(phase)) {
      summary.stageOnly += 1;
      console.log(`${label}: provider accepted @ ${phase} → stage only`);
      if (APPLY) {
        await markB2BAllocationStage(opp, 'allocated', 'Vendor accepted — assigning an engineer');
      }
      continue;
    }

    // Dead end: parked in the freelancer pool (or an empty queue) with nobody to act.
    summary.escalated += 1;
    console.log(`${label}: opportunity open @ ${phase} → escalate + refund escrow`);
    if (APPLY) {
      await handleAssignmentFailure(opp, 'stalled_allocation_repair');
    }
  }

  console.log('\n=== Summary ===');
  console.log(summary);
  console.log(APPLY ? 'Changes applied.' : 'Dry run — re-run with --apply to write.');

  await mongoose.disconnect();
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
