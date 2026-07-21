const Engineer = require('../models/Engineer');
const Transaction = require('../models/Transaction');
const Settings = require('../models/Settings');

async function getEngineerPayoutPercent() {
  const settings = await Settings.findOne().select('servicePayoutPercentage').lean();
  const pct = Number(settings?.servicePayoutPercentage);
  return Number.isFinite(pct) && pct > 0 ? pct : 70;
}

/**
 * Credit engineer wallet when a vendor ops field job is completed (idempotent per job).
 */
async function creditEngineerForOpsJob(job) {
  if (!job?._id || !job.engineerId) {
    return { ok: false, skipped: true, amount: 0, message: 'Invalid job' };
  }
  if (job.payoutStatus === 'credited') {
    return { ok: true, skipped: true, amount: job.engineerPayout || 0 };
  }

  const gross = Number(job.budget) || 0;
  const payoutPercent = await getEngineerPayoutPercent();
  const payout = Math.round((gross * payoutPercent) / 100);

  if (payout <= 0) {
    return { ok: true, skipped: true, amount: 0, payoutPercent };
  }

  const existingTxn = await Transaction.findOne({
    engineerId: job.engineerId,
    'metadata.vendorOpsJobId': String(job._id),
    type: 'earnings_credit',
    status: 'completed'
  }).lean();
  if (existingTxn) {
    return { ok: true, skipped: true, amount: existingTxn.amount, transactionId: existingTxn._id };
  }

  const engineer = await Engineer.findById(job.engineerId);
  if (!engineer) {
    return { ok: false, skipped: false, amount: 0, message: 'Engineer not found' };
  }

  if (!engineer.wallet) {
    engineer.wallet = { balance: 0, totalEarnings: 0, withdrawnAmount: 0, pendingBalance: 0 };
  }
  const balanceBefore = Number(engineer.wallet.balance) || 0;
  engineer.wallet.balance = balanceBefore + payout;
  engineer.wallet.totalEarnings = (Number(engineer.wallet.totalEarnings) || 0) + payout;
  await engineer.save();

  const txn = await Transaction.create({
    engineerId: job.engineerId,
    vendorId: job.vendorId,
    type: 'earnings_credit',
    amount: payout,
    status: 'completed',
    paymentMethod: 'wallet',
    description: `Vendor job ${job.jobCode || job._id} — ₹${payout} credited`,
    balanceBefore,
    balanceAfter: engineer.wallet.balance,
    metadata: {
      vendorOpsJobId: String(job._id),
      projectId: job.projectId ? String(job.projectId) : null,
      gross,
      payoutPercent,
      source: 'vendor_ops'
    }
  });

  try {
    if (global.io) {
      const payload = {
        amount: payout,
        balanceAfter: engineer.wallet.balance,
        jobCode: job.jobCode,
        jobId: String(job._id),
        message: `₹${payout.toLocaleString('en-IN')} credited to your wallet`
      };
      global.io.to(`engineer:${job.engineerId}`).emit('wallet:credited', payload);
      global.io.to(`engineer:${job.engineerId}`).emit('wallet:updated', payload);
    }
  } catch (_) {}

  try {
    const { notifyEngineer } = require('./engineerNotify.service');
    await notifyEngineer(job.engineerId, {
      type: 'payment_received',
      category: 'payments',
      title: 'Payment received',
      message: `₹${payout.toLocaleString('en-IN')} credited for job ${job.jobCode || 'complete'}`,
      relatedId: txn._id,
      relatedType: 'transaction',
      data: {
        amount: String(payout),
        jobId: String(job._id),
        jobCode: job.jobCode || ''
      }
    });
  } catch (_) {}

  return {
    ok: true,
    skipped: false,
    amount: payout,
    payoutPercent,
    transactionId: txn._id,
    balanceAfter: engineer.wallet.balance
  };
}

module.exports = {
  creditEngineerForOpsJob,
  getEngineerPayoutPercent
};
