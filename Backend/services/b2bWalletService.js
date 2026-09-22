const B2BWallet = require('../models/B2BWallet');
const B2BWalletTransaction = require('../models/B2BWalletTransaction');
const B2BDeductionRule = require('../models/B2BDeductionRule');
const B2BInvoice = require('../models/B2BInvoice');
const B2BJob = require('../models/B2BJob');
const JobHistory = require('../models/JobHistory');
const { holdB2BJobEscrow } = require('./escrowReleaseEngine.service');

/**
 * Compute pending_wallet activation gate for a company.
 */
const getPendingWalletGate = async (companyId) => {
  const wallet = await B2BWallet.findOne({ companyId });
  const balance = wallet ? wallet.balance : 0;

  const pendingJobs = await B2BJob.find({
    companyId,
    status: 'pending_wallet'
  }).select('jobId charge batchId paymentStatus');

  const pendingJobCount = pendingJobs.length;
  const pendingBatchCost = parseFloat(
    pendingJobs.reduce((sum, j) => sum + (j.charge || 0), 0).toFixed(2)
  );
  const shortfall = Math.max(0, parseFloat((pendingBatchCost - balance).toFixed(2)));
  const canActivate = pendingJobCount === 0 || balance >= pendingBatchCost;

  return {
    walletBalance: balance,
    escrowBalance: wallet?.escrowBalance || 0,
    pendingJobCount,
    pendingBatchCost,
    shortfall,
    canActivate,
    activationBlocked: pendingJobCount > 0 && !canActivate,
    message: pendingJobCount === 0
      ? 'No jobs awaiting wallet activation'
      : canActivate
        ? `${pendingJobCount} job(s) ready to activate (₹${pendingBatchCost})`
        : `Insufficient balance: need ₹${shortfall} more to activate ${pendingJobCount} pending job(s) (₹${pendingBatchCost})`
  };
};

/**
 * Activate pending_wallet jobs by locking each job's charge into escrow.
 */
const activatePendingWalletJobs = async (companyId, app = null) => {
  const gate = await getPendingWalletGate(companyId);
  if (gate.pendingJobCount === 0) {
    return { activated: 0, remaining: 0, deducted: 0, gate };
  }
  if (!gate.canActivate) {
    return { activated: 0, remaining: gate.pendingJobCount, deducted: 0, gate, blocked: true };
  }

  const pendingJobs = await B2BJob.find({ companyId, status: 'pending_wallet' }).sort({ createdAt: 1 });
  const historyLogs = [];
  let heldTotal = 0;
  const activatedIds = [];

  for (const job of pendingJobs) {
    const hold = await holdB2BJobEscrow({
      companyId,
      jobId: job._id,
      amount: job.charge,
      remark: `Escrow hold on activation — ${job.jobId}`
    });
    if (!hold.ok && !hold.alreadyHeld) {
      console.warn(`[Activate] Escrow hold failed for ${job.jobId}:`, hold.reason);
      break;
    }

    job.status = 'searching_engineer';
    job.paymentStatus = 'escrow_locked';
    job.payoutStatus = 'none';
    job.currentWave = 0;
    await job.save();
    heldTotal += Number(job.charge) || 0;
    activatedIds.push(job._id);
    historyLogs.push({
      jobId: job._id,
      status: 'searching_engineer',
      remark: 'Activated from pending_wallet — funds locked in escrow.',
      role: 'system'
    });
  }

  if (historyLogs.length) await JobHistory.insertMany(historyLogs);

  try {
    const { dispatchB2BJobAssignment } = require('./enterpriseB2BOrchestrator.service');
    for (const id of activatedIds) {
      dispatchB2BJobAssignment(id, app).catch((err) => {
        console.error(`[Activate] Assignment dispatch failed for ${id}:`, err.message);
      });
    }
  } catch (err) {
    console.error('[Activate] Assignment service load failed:', err.message);
  }

  const wallet = await B2BWallet.findOne({ companyId });
  if (app) {
    try {
      const io = app.get('socketio');
      if (io) {
        io.to(`b2b:${companyId}`).emit('b2b:walletUpdated', {
          balance: wallet?.balance || 0,
          escrowBalance: wallet?.escrowBalance || 0,
          totalSpent: wallet?.totalSpent || 0
        });
        io.to(`b2b:${companyId}`).emit('b2b:pendingJobsActivated', {
          activated: activatedIds.length,
          deducted: heldTotal,
          escrowHeld: heldTotal,
          balance: wallet?.balance || 0,
          escrowBalance: wallet?.escrowBalance || 0
        });
      }
    } catch (e) {
      console.warn('[Activate] Socket emit failed:', e.message);
    }
  }

  const refreshedGate = await getPendingWalletGate(companyId);
  console.log(
    `[Activate] Activated ${activatedIds.length} jobs for company ${companyId}, escrow held ₹${heldTotal}`
  );

  return {
    activated: activatedIds.length,
    remaining: refreshedGate.pendingJobCount,
    deducted: heldTotal,
    gate: refreshedGate,
    blocked: false
  };
};

/**
 * Legacy completion-time deduct. Skips jobs already in escrow / released.
 */
const deductWalletForCompletedJob = async (companyId, jobId, app = null) => {
  console.log(`[B2B Wallet Service] Triggering auto-deduction for company: ${companyId}, job: ${jobId}`);
  try {
    const job = await B2BJob.findById(jobId);
    if (!job) {
      console.error(`[B2B Wallet Service] Job ${jobId} not found`);
      return { success: false, error: 'Job not found' };
    }

    if (['deducted', 'escrow_locked', 'released', 'refunded'].includes(job.paymentStatus)) {
      console.log(`[B2B Wallet Service] Job ${job.jobId} already funded (${job.paymentStatus})`);
      return { success: true, message: 'Already funded / escrowed' };
    }

    let wallet = await B2BWallet.findOne({ companyId });
    if (!wallet) {
      wallet = await B2BWallet.create({ companyId, balance: 0 });
    }

    let rule = await B2BDeductionRule.findOne({ companyId, isActive: true });
    if (!rule) {
      rule = await B2BDeductionRule.create({ companyId, perJobCharge: 12, gstPercent: 18, isActive: true });
    }

    const perJobCharge = rule.perJobCharge;
    const gstPercent = rule.gstPercent;
    const gstAmount = parseFloat((perJobCharge * (gstPercent / 100)).toFixed(2));
    const totalDeduction = parseFloat((perJobCharge + gstAmount).toFixed(2));

    const emitEvent = (eventName, room, data) => {
      if (app) {
        try {
          const io = app.get('socketio');
          if (io) {
            io.to(room).emit(eventName, data);
          }
        } catch (err) {
          console.warn('[Socket.io] Emit failure:', err.message);
        }
      }
    };

    // Prefer true escrow hold over immediate spend
    const hold = await holdB2BJobEscrow({
      companyId,
      jobId,
      amount: totalDeduction,
      remark: `Escrow hold on completion path — ${job.jobId}`
    });
    if (hold.ok) {
      job.charge = totalDeduction;
      job.paymentStatus = 'escrow_locked';
      await job.save();

      emitEvent('b2b:walletUpdated', `b2b:${companyId}`, {
        balance: hold.balance,
        escrowBalance: hold.escrowBalance,
        totalSpent: wallet.totalSpent
      });
      return { success: true, hold, escrow: true };
    }

    // A memo of what could not be charged; it holds no money and moves no balance.
    wallet.pendingDeductions = parseFloat((wallet.pendingDeductions + totalDeduction).toFixed(2));
    wallet.lastUpdatedAt = new Date();
    await wallet.save();

    job.charge = totalDeduction;
    job.paymentStatus = 'pending_deduction';
    job.status = 'completed';
    await job.save();

    emitEvent('b2b:lowBalance', `b2b:${companyId}`, {
      balance: wallet.balance,
      required: totalDeduction,
      message: 'Wallet balance insufficient to lock escrow. Please top up.'
    });

    return { success: false, error: 'Insufficient balance', pending: true };
  } catch (error) {
    console.error('[B2B Wallet Service] Auto-deduction error:', error);
    return { success: false, error: error.message };
  }
};

module.exports = {
  deductWalletForCompletedJob,
  getPendingWalletGate,
  activatePendingWalletJobs
};
