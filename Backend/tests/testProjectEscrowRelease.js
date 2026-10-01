/**
 * Project-based request → vendor → engineer → escrow release, on an in-memory
 * MongoDB (never the .env database). Drives the real controllers in order:
 *   vendor acceptRequest → vendor assignEngineerToRequest →
 *   engineer acceptOpsJob / startOpsJob / completeOpsJob → auto escrow release
 *
 *   node tests/testProjectEscrowRelease.js
 *
 * Scenario A — paid customer service request (Razorpay escrow, single release).
 * Scenario B — budget-based opportunity (project escrow ledger, milestone slices).
 * Both must pay the vendor: gross − platform fee − engineer payout.
 */
const assert = require('assert');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const PLATFORM_PCT = 1;
const ENGINEER_PCT = 60;

// C02 milestone plan as configured in the live catalogue (sums to 86%, rescaled).
const C02_MILESTONES = [
  ['Assessment', 0], ['Procurement', 14], ['Installation', 14], ['Config', 14],
  ['Testing', 14], ['User Training', 14], ['Handover', 16]
].map(([title, paymentPercent], i) => ({
  order: i + 1, title, defaultDays: 1, paymentPercent, proofTypes: ['photos', 'checklist']
}));

const call = (handler, { user, params = {}, body = {} }) =>
  new Promise((resolve, reject) => {
    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(payload) { resolve({ status: this.statusCode, body: payload }); return this; }
    };
    Promise.resolve(handler({ user, params, body, query: {}, app: { get: () => null } }, res)).catch(reject);
  });

const waitFor = async (check, label, timeoutMs = 10000) => {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`Timed out waiting for: ${label}`);
};

async function run() {
  const mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  await mongoose.connect(process.env.MONGODB_URI);

  const Settings = require('../models/Settings');
  const ServiceConfig = require('../models/ServiceConfig');
  const Vendor = require('../models/Vendor');
  const Engineer = require('../models/Engineer');
  const ServiceRequest = require('../models/ServiceRequest');
  const Opportunity = require('../models/Opportunity');
  const VendorOpsJob = require('../models/VendorOpsJob');
  const VendorOpsProject = require('../models/VendorOpsProject');
  const VendorOpsMilestone = require('../models/VendorOpsMilestone');
  const EscrowLedger = require('../models/EscrowLedger');
  const vendorRequests = require('../controllers/vendorControllers/vendorRequestsController');
  const engineerOps = require('../controllers/engineerControllers/engineerOpsJobController');

  await Settings.create({ platformFeePercentage: PLATFORM_PCT, servicePayoutPercentage: ENGINEER_PCT });
  await ServiceConfig.create({
    categoryCode: 'C02',
    categoryName: 'IT & Computer Services',
    isActive: true,
    status: 'active',
    projectMilestones: C02_MILESTONES
  });

  let seq = 0;
  const setup = async () => {
    seq += 1;
    const vendor = await Vendor.create({
      name: `Test Vendor ${seq}`, businessName: `Test Vendor ${seq}`,
      email: `vendor${seq}@escrow.test`, phone: `90000001${String(seq).padStart(2, '0')}`,
      password: 'Test@12345', approvalStatus: 'approved', isActive: true,
      approvedServices: [{ categoryCode: 'C02', categoryName: 'IT & Computer Services', status: 'active' }],
      categories: ['C02']
    });
    const engineer = await Engineer.create({
      name: `Test Engineer ${seq}`, email: `eng${seq}@escrow.test`,
      phone: `90000002${String(seq).padStart(2, '0')}`, password: 'Test@12345',
      role: 'engineer', roleType: 'Engineer', engineerType: 'vendor_engineer',
      approvalStatus: 'approved', isActive: true,
      vendorId: vendor._id, vendorApprovalStatus: 'approved'
    });
    return { vendor, engineer };
  };

  /** Vendor accepts, assigns, engineer accepts → starts → completes. */
  const runExecution = async ({ vendor, engineer, opportunity }) => {
    const vendorUser = { _id: vendor._id };
    const engineerUser = { _id: engineer._id };

    const accepted = await call(vendorRequests.acceptRequest, { user: vendorUser, params: { id: String(opportunity._id) } });
    assert.strictEqual(accepted.status, 200, `accept failed: ${JSON.stringify(accepted.body)}`);

    const assigned = await call(vendorRequests.assignEngineerToRequest, {
      user: vendorUser,
      params: { id: String(opportunity._id) },
      body: { engineerId: String(engineer._id) }
    });
    assert.strictEqual(assigned.status, 200, `assign failed: ${JSON.stringify(assigned.body)}`);

    const job = await VendorOpsJob.findOne({ engineerId: engineer._id });
    const confirm = { canComplete: true, canMeetTimeline: true, hasResources: true, availableTeamSize: 1 };
    for (const [step, body] of [['acceptOpsJob', confirm], ['startOpsJob', {}], ['completeOpsJob', {}]]) {
      const r = await call(engineerOps[step], { user: engineerUser, params: { id: String(job._id) }, body });
      assert.strictEqual(r.status, 200, `${step} failed: ${JSON.stringify(r.body)}`);
    }
    return VendorOpsProject.findOne({ opportunityId: opportunity._id });
  };

  // ── Scenario A: paid customer request (₹999) ────────────────────────────
  {
    const { vendor, engineer } = await setup();
    const gross = 999;
    const sr = await ServiceRequest.create({
      categoryCode: 'C02', categoryName: 'IT & Computer Services',
      subCatCode: 'C02-01', subCategoryName: 'Desktop Repair',
      contact: { name: 'Test Customer', city: 'Indore' },
      status: 'Pending',
      payment: {
        amount: gross, status: 'paid', escrowStatus: 'held',
        razorpayPaymentId: 'pay_TestEscrow0001', razorpayOrderId: 'order_TestEscrow0001'
      }
    });
    const opportunity = await Opportunity.create({
      type: 'client_request', title: 'Desktop Repair — Indore',
      categoryCode: 'C02', categoryName: 'IT & Computer Services',
      clientInfo: { name: 'Test Customer', city: 'Indore' },
      budget: { min: gross, max: gross },
      status: 'open',
      eligibleVendors: [vendor._id],
      assignment: {
        phase: 'waiting_vendor_acceptance', serviceRequestId: sr._id, requiredEngineers: 1,
        vendorQueue: [{ vendorId: vendor._id, rank: 1, score: 50, status: 'active' }]
      }
    });
    await ServiceRequest.updateOne({ _id: sr._id }, { $set: { opportunityId: opportunity._id } });

    await runExecution({ vendor, engineer, opportunity });
    await waitFor(
      async () => (await ServiceRequest.findById(sr._id).lean()).payment.escrowStatus === 'released',
      'service request escrow released'
    );

    const engineerPay = Math.round((gross * ENGINEER_PCT) / 100);
    const platformFee = Math.round((gross * PLATFORM_PCT) / 100);
    const done = await ServiceRequest.findById(sr._id).lean();
    const v = await Vendor.findById(vendor._id).lean();
    const e = await Engineer.findById(engineer._id).lean();

    assert.strictEqual(done.status, 'Completed');
    assert.strictEqual(e.wallet.balance, engineerPay, 'engineer payout');
    assert.strictEqual(v.wallet.earnings, gross - platformFee - engineerPay, 'vendor share');
    assert.strictEqual(done.payment.settlement.customerPaid, gross);
    assert.strictEqual(
      done.payment.settlement.vendorShare + done.payment.settlement.engineerTotal + done.payment.settlement.platformFee,
      gross,
      'settlement reconciles to what the customer paid'
    );
    console.log(`PASS A  paid request ₹${gross}: engineer ₹${engineerPay} · platform ₹${platformFee} · vendor ₹${v.wallet.earnings} · request Completed`);
  }

  // ── Scenario B: budget opportunity with milestone escrow (₹5,000) ────────
  {
    const { vendor, engineer } = await setup();
    const gross = 5000;
    const opportunity = await Opportunity.create({
      type: 'client_request', title: 'Server Setup — Indore',
      categoryCode: 'C02', categoryName: 'IT & Computer Services',
      clientInfo: { name: 'Test Client', city: 'Indore' },
      budget: { min: gross, max: gross },
      status: 'open',
      eligibleVendors: [vendor._id],
      assignment: {
        phase: 'waiting_vendor_acceptance', requiredEngineers: 1,
        vendorQueue: [{ vendorId: vendor._id, rank: 1, score: 50, status: 'active' }]
      }
    });

    const project = await runExecution({ vendor, engineer, opportunity });
    const milestones = await VendorOpsMilestone.find({ projectId: project._id }).lean();
    assert.strictEqual(
      milestones.reduce((s, m) => s + m.paymentPercent, 0), 100, 'milestone percentages sum to 100'
    );

    await waitFor(
      async () => (await EscrowLedger.findOne({ sourceType: 'project', sourceId: project._id }).lean())?.status === 'released',
      'project escrow fully released'
    );

    const engineerPay = Math.round((gross * ENGINEER_PCT) / 100);
    const platformFee = Math.round((gross * PLATFORM_PCT) / 100);
    const ledger = await EscrowLedger.findOne({ sourceType: 'project', sourceId: project._id }).lean();
    const v = await Vendor.findById(vendor._id).lean();
    const closed = await VendorOpsProject.findById(project._id).lean();
    const open = await VendorOpsMilestone.countDocuments({ projectId: project._id, status: { $ne: 'completed' } });

    assert.strictEqual(ledger.releasedAmount, gross, 'whole escrow released');
    assert.strictEqual(v.wallet.earnings, gross - platformFee - engineerPay, 'vendor share across milestones');
    assert.strictEqual(open, 0, 'every milestone completed');
    assert.strictEqual(closed.paymentStatus, 'paid');
    console.log(`PASS B  milestone escrow ₹${gross}: engineer ₹${engineerPay} · platform ₹${platformFee} · vendor ₹${v.wallet.earnings} · ${milestones.length} milestones closed`);
  }

  await mongoose.disconnect();
  await mongod.stop();
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('FAIL', err.message);
    process.exit(1);
  });
