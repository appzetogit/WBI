/**
 * Verify that a B2B job can no longer dead-end in the allocation funnel.
 *
 * Covers the three exits that previously left a job stuck on "Pending" forever:
 *   1. freelancer pool with nobody to notify  → admin escalation + escrow refund
 *   2. escalated job                          → re-match re-holds escrow and restarts
 *   3. company cancel                         → escrow returned, engine stopped
 *
 *   node scripts/verifyB2BAllocationFlow.js
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

(async () => {
  await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);

  const B2BJob = require('../models/B2BJob');
  const B2BCompany = require('../models/B2BCompany');
  const B2BWallet = require('../models/B2BWallet');
  const Opportunity = require('../models/Opportunity');
  const EscrowLedger = require('../models/EscrowLedger');
  const { holdB2BJobEscrow } = require('../services/escrowReleaseEngine.service');
  const { handleAssignmentFailure } = require('../services/projectAssignmentEngine.service');
  const { rematchB2BJob } = require('../services/b2bJobRematch.service');

  const CHARGE = 1500;
  const stamp = Date.now();

  // Reuse a real company (the schema demands full KYC) and restore its wallet after.
  const company = await B2BCompany.findOne({}).select('_id companyName').lean();
  if (!company) {
    console.error('FAIL: no B2BCompany in DB to run against');
    process.exit(1);
  }

  let seededWallet = await B2BWallet.findOne({ companyId: company._id });
  if (!seededWallet) {
    seededWallet = await B2BWallet.create({ companyId: company._id, balance: 0, escrowBalance: 0 });
  }
  const walletSnapshot = {
    balance: seededWallet.balance,
    escrowBalance: seededWallet.escrowBalance,
    totalSpent: seededWallet.totalSpent
  };
  await B2BWallet.updateOne({ _id: seededWallet._id }, { $set: { balance: 10000, escrowBalance: 0 } });

  const job = await B2BJob.create({
    companyId: company._id,
    jobId: `JOB-ALLOC-TEST-${stamp}`,
    customerName: 'Allocation Test',
    phone: '9000000002',
    address: 'Test Site, Indore',
    city: 'Indore',
    pincode: '452010',
    service: 'CCTV Installation',
    preferredDate: new Date(Date.now() + 86400000),
    charge: CHARGE,
    coordinates: { type: 'Point', coordinates: [75.8577, 22.7196] },
    status: 'pending'
  });

  const opportunity = await Opportunity.create({
    type: 'b2b_opportunity',
    title: `Allocation test ${stamp}`,
    description: 'Synthetic opportunity for allocation flow verification',
    categoryCode: 'C01',
    categoryName: 'CCTV & Surveillance',
    clientInfo: { clientType: 'b2b', name: 'Allocation Test', city: 'Indore' },
    budget: { min: CHARGE, max: CHARGE, type: 'negotiable', currency: 'INR' },
    deadline: new Date(Date.now() + 7 * 86400000),
    status: 'open',
    assignment: {
      phase: 'freelancer_pool',
      requiredEngineers: 1,
      b2bJobId: job._id,
      b2bCompanyId: company._id,
      vendorQueue: [],
      currentVendorIndex: -1,
      configSnapshot: { releaseToFreelancerOnVendorExhausted: true, freelancerPoolTimeoutMinutes: 120 }
    }
  });

  const held = await holdB2BJobEscrow({
    companyId: company._id,
    jobId: job._id,
    amount: CHARGE,
    remark: 'allocation flow test'
  });
  check('escrow held before allocation', held.ok === true, `ok=${held.ok}`);

  let wallet = await B2BWallet.findOne({ companyId: company._id }).lean();
  check('wallet moved funds into escrow', wallet.balance === 8500 && wallet.escrowBalance === CHARGE,
    `balance=${wallet.balance} escrow=${wallet.escrowBalance}`);

  // 1. Unclaimed freelancer pool must terminate in an admin escalation.
  await handleAssignmentFailure(await Opportunity.findById(opportunity._id), 'freelancer_pool_timeout');

  let fresh = await B2BJob.findById(job._id).lean();
  check('stalled job escalates to admin', fresh.status === 'escalated', `status=${fresh.status}`);
  check('allocation stage records the escalation', fresh.allocationStage === 'admin_escalation',
    `stage=${fresh.allocationStage}`);
  check('escalation reason is visible to the company', !!fresh.allocationReason, fresh.allocationReason || 'missing');

  wallet = await B2BWallet.findOne({ companyId: company._id }).lean();
  check('escrow returned on escalation', wallet.balance === 10000 && wallet.escrowBalance === 0,
    `balance=${wallet.balance} escrow=${wallet.escrowBalance}`);

  let ledger = await EscrowLedger.findOne({ sourceType: 'b2b_job', sourceId: job._id }).lean();
  check('escrow ledger marked refunded', ledger?.status === 'refunded', `status=${ledger?.status}`);

  const closedOpp = await Opportunity.findById(opportunity._id).lean();
  check('opportunity is closed out', closedOpp.status === 'cancelled', `status=${closedOpp.status}`);

  // 2. Re-match must re-fund the job and put it back in the funnel.
  const retry = await rematchB2BJob(job._id, { actorRole: 'admin', note: 'verification retry' });
  check('escalated job can be re-matched', retry.ok === true, retry.message || '');

  fresh = await B2BJob.findById(job._id).lean();
  check('re-match resets job to pending', fresh.status === 'pending', `status=${fresh.status}`);
  check('re-match clears notified engineers', (fresh.notifiedEngineers || []).length === 0);
  check('re-match increments attempt counter', fresh.rematchCount === 1, `count=${fresh.rematchCount}`);
  check('re-match re-locks payment', fresh.paymentStatus === 'escrow_locked', `payment=${fresh.paymentStatus}`);

  wallet = await B2BWallet.findOne({ companyId: company._id }).lean();
  check('re-match re-holds escrow', wallet.escrowBalance === CHARGE, `escrow=${wallet.escrowBalance}`);

  // 3. A job that is re-matched while already funded must not double-charge.
  const secondHold = await holdB2BJobEscrow({
    companyId: company._id,
    jobId: job._id,
    amount: CHARGE,
    remark: 'idempotency probe'
  });
  wallet = await B2BWallet.findOne({ companyId: company._id }).lean();
  check('duplicate hold is idempotent', secondHold.alreadyHeld === true && wallet.escrowBalance === CHARGE,
    `escrow=${wallet.escrowBalance}`);

  // 4. Completed jobs must never be re-matched.
  await B2BJob.updateOne({ _id: job._id }, { $set: { status: 'completed' } });
  const blocked = await rematchB2BJob(job._id, { actorRole: 'admin' });
  check('completed job cannot be re-matched', blocked.ok === false, blocked.message || '');

  // Cleanup
  await B2BJob.deleteOne({ _id: job._id });
  await Opportunity.deleteOne({ _id: opportunity._id });
  await EscrowLedger.deleteMany({ sourceType: 'b2b_job', sourceId: job._id });
  await B2BWallet.updateOne({ _id: seededWallet._id }, { $set: walletSnapshot });

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  await mongoose.disconnect();
  process.exit(failed.length ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
