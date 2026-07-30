/**
 * P0 B2B escrow verification (hold → double-release idempotent → refund path).
 *
 *   node scripts/verifyB2BEscrowP0.js
 *
 * Creates a temporary company wallet + synthetic B2BJob, exercises money moves,
 * then cleans up the synthetic job/ledger (leaves company wallet if it already existed).
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');

(async () => {
  await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);

  const B2BCompany = require('../models/B2BCompany');
  const B2BWallet = require('../models/B2BWallet');
  const B2BJob = require('../models/B2BJob');
  const EscrowLedger = require('../models/EscrowLedger');
  const Engineer = require('../models/Engineer');
  const Wallet = require('../models/Wallet');
  const {
    holdB2BJobEscrow,
    releaseB2BJobEscrowPayment,
    refundB2BJobEscrow,
    computeSplit,
    DEFAULT_PAYMENT_RULES
  } = require('../services/escrowReleaseEngine.service');

  const company = await B2BCompany.findOne({}).select('_id companyName').lean();
  if (!company) {
    console.error('FAIL: no B2BCompany in DB');
    process.exit(1);
  }

  let wallet = await B2BWallet.findOne({ companyId: company._id });
  if (!wallet) {
    wallet = await B2BWallet.create({ companyId: company._id, balance: 10000, escrowBalance: 0 });
  }

  const seedBalance = 5000;
  await B2BWallet.updateOne(
    { _id: wallet._id },
    { $set: { balance: seedBalance, escrowBalance: 0 } }
  );

  const engineer = await Engineer.findOne({ approvalStatus: 'approved' }).select('_id').lean();
  const charge = 500;
  const job = await B2BJob.create({
    companyId: company._id,
    jobId: `JOB-ESCROW-P0-${Date.now()}`,
    customerName: 'Escrow P0 Test',
    phone: '9000000001',
    address: 'Test Address',
    city: 'Indore',
    coordinates: { type: 'Point', coordinates: [75.8577, 22.7196] },
    service: 'CCTV Installation',
    preferredDate: new Date(),
    status: 'searching_engineer',
    charge,
    paymentStatus: 'unpaid',
    assignedTo: engineer?._id || null
  });

  let failures = 0;
  const assert = (ok, msg) => {
    if (ok) console.log(`PASS  ${msg}`);
    else {
      console.log(`FAIL  ${msg}`);
      failures += 1;
    }
  };

  // 1. Hold
  const hold = await holdB2BJobEscrow({
    companyId: company._id,
    jobId: job._id,
    amount: charge,
    remark: 'verifyB2BEscrowP0'
  });
  assert(hold.ok, `hold ok (amount=${charge})`);

  wallet = await B2BWallet.findOne({ companyId: company._id });
  assert(wallet.balance === seedBalance - charge, `available = ${seedBalance - charge} (got ${wallet.balance})`);
  assert(wallet.escrowBalance === charge, `escrow locked = ${charge} (got ${wallet.escrowBalance})`);

  const hold2 = await holdB2BJobEscrow({
    companyId: company._id,
    jobId: job._id,
    amount: charge
  });
  assert(hold2.alreadyHeld, 'second hold is idempotent');

  // 2. Release (engineer_direct — default)
  if (!engineer) {
    console.log('SKIP  release — no approved engineer; testing refund path only');
    const refund = await refundB2BJobEscrow({ jobId: job._id, reason: 'verify_refund' });
    assert(refund.ok, `refund ok amount=${refund.amount}`);
    wallet = await B2BWallet.findOne({ companyId: company._id });
    assert(wallet.balance === seedBalance, `after refund available restored (got ${wallet.balance})`);
    assert(wallet.escrowBalance === 0, `after refund escrow=0 (got ${wallet.escrowBalance})`);
  } else {
    const beforeEng = await Wallet.findOne({ ownerId: engineer._id, ownerType: 'engineer' });
    const beforeAvail = beforeEng ? Number(beforeEng.availableBalance) || 0 : 0;

    const release = await releaseB2BJobEscrowPayment({ jobId: job._id });
    assert(release.ok, `release ok mode=${release.mode}`);

    const release2 = await releaseB2BJobEscrowPayment({ jobId: job._id });
    assert(release2.alreadyReleased || release2.skipped, 'second release is idempotent');

    wallet = await B2BWallet.findOne({ companyId: company._id });
    assert(wallet.escrowBalance === 0, `after release escrow=0 (got ${wallet.escrowBalance})`);
    assert(wallet.totalSpent >= charge, `totalSpent includes released charge`);

    const split = computeSplit(charge, DEFAULT_PAYMENT_RULES);
    const afterEng = await Wallet.findOne({ ownerId: engineer._id, ownerType: 'engineer' });
    const delta = (Number(afterEng?.availableBalance) || 0) - beforeAvail;
    assert(
      release.mode === 'vendor_marketplace' || Math.abs(delta - split.engineerShare) < 1,
      `engineer credited ~${split.engineerShare} (delta=${delta}, mode=${release.mode})`
    );

    const ledger = await EscrowLedger.findOne({ sourceType: 'b2b_job', sourceId: job._id });
    assert(ledger?.status === 'released', `ledger status=released (got ${ledger?.status})`);
  }

  // Cleanup synthetic job (keep company wallet state from last step)
  await EscrowLedger.deleteMany({ sourceId: job._id });
  await B2BJob.deleteOne({ _id: job._id });

  console.log(`\n${failures === 0 ? 'ALL PASSED' : `${failures} FAILED`}`);
  await mongoose.disconnect();
  process.exit(failures ? 1 : 0);
})().catch(async (e) => {
  console.error('ERROR:', e);
  try {
    await mongoose.disconnect();
  } catch (_) {
    /* ignore */
  }
  process.exit(1);
});
