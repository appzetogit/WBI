const B2BWallet = require('../models/B2BWallet');
const B2BWalletTransaction = require('../models/B2BWalletTransaction');
const B2BDeductionRule = require('../models/B2BDeductionRule');
const B2BInvoice = require('../models/B2BInvoice');
const B2BJob = require('../models/B2BJob');
const B2BCompany = require('../models/B2BCompany');
const JobHistory = require('../models/JobHistory');

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
 * Activate pending_wallet jobs when balance covers their charges.
 */
const activatePendingWalletJobs = async (companyId, app = null) => {
  const gate = await getPendingWalletGate(companyId);
  if (gate.pendingJobCount === 0) {
    return { activated: 0, remaining: 0, deducted: 0, gate };
  }
  if (!gate.canActivate) {
    return { activated: 0, remaining: gate.pendingJobCount, deducted: 0, gate, blocked: true };
  }

  const wallet = await B2BWallet.findOne({ companyId });
  if (!wallet) {
    return { activated: 0, remaining: gate.pendingJobCount, deducted: 0, gate, blocked: true };
  }

  const pendingJobs = await B2BJob.find({ companyId, status: 'pending_wallet' }).sort({ createdAt: 1 });
  const totalCost = parseFloat(pendingJobs.reduce((s, j) => s + (j.charge || 0), 0).toFixed(2));

  if (wallet.balance < totalCost) {
    const refreshed = await getPendingWalletGate(companyId);
    return { activated: 0, remaining: refreshed.pendingJobCount, deducted: 0, gate: refreshed, blocked: true };
  }

  wallet.balance = parseFloat((wallet.balance - totalCost).toFixed(2));
  wallet.totalSpent = parseFloat((wallet.totalSpent + totalCost).toFixed(2));
  wallet.lastUpdatedAt = new Date();
  await wallet.save();
  await B2BCompany.findByIdAndUpdate(companyId, { walletBalance: wallet.balance });

  const jobIds = pendingJobs.map((j) => j._id);
  await B2BWalletTransaction.create({
    companyId,
    walletId: wallet._id,
    transactionId: `TXN-ACT-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
    type: 'job_deduction',
    amount: -totalCost,
    totalAmount: -totalCost,
    status: 'success',
    paymentMethod: 'wallet',
    remark: `Activation of ${pendingJobs.length} pending_wallet job(s)`,
    relatedJobIds: jobIds
  });

  const historyLogs = [];
  for (const job of pendingJobs) {
    job.status = 'searching_engineer';
    job.paymentStatus = 'deducted';
    job.currentWave = 0;
    await job.save();
    historyLogs.push({
      jobId: job._id,
      status: 'searching_engineer',
      remark: 'Activated from pending_wallet after sufficient top-up / balance.',
      role: 'system'
    });
  }
  if (historyLogs.length) await JobHistory.insertMany(historyLogs);

  try {
    const { queueJobMatching } = require('./b2bMatchingService');
    for (const job of pendingJobs) {
      queueJobMatching(job._id, app).catch((err) => {
        console.error(`[Activate] Matching queue failed for ${job._id}:`, err.message);
      });
    }
  } catch (err) {
    console.error('[Activate] Matching service load failed:', err.message);
  }

  if (app) {
    try {
      const io = app.get('socketio');
      if (io) {
        io.to(`b2b:${companyId}`).emit('b2b:walletUpdated', {
          balance: wallet.balance,
          totalSpent: wallet.totalSpent
        });
        io.to(`b2b:${companyId}`).emit('b2b:pendingJobsActivated', {
          activated: pendingJobs.length,
          deducted: totalCost,
          balance: wallet.balance
        });
      }
    } catch (e) {
      console.warn('[Activate] Socket emit failed:', e.message);
    }
  }

  const refreshedGate = await getPendingWalletGate(companyId);
  console.log(`[Activate] Activated ${pendingJobs.length} jobs for company ${companyId}, deducted ₹${totalCost}`);

  return {
    activated: pendingJobs.length,
    remaining: refreshedGate.pendingJobCount,
    deducted: totalCost,
    gate: refreshedGate,
    blocked: false
  };
};

/**
 * Triggered when a B2B job is marked completed.
 */
const deductWalletForCompletedJob = async (companyId, jobId, app = null) => {
  console.log(`[B2B Wallet Service] Triggering auto-deduction for company: ${companyId}, job: ${jobId}`);
  try {
    const job = await B2BJob.findById(jobId);
    if (!job) {
      console.error(`[B2B Wallet Service] Job ${jobId} not found`);
      return { success: false, error: 'Job not found' };
    }

    if (job.paymentStatus === 'deducted') {
      console.log(`[B2B Wallet Service] Job ${job.jobId} already deducted`);
      return { success: true, message: 'Already deducted' };
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

    if (wallet.balance >= totalDeduction) {
      wallet.balance = parseFloat((wallet.balance - totalDeduction).toFixed(2));
      wallet.totalSpent = parseFloat((wallet.totalSpent + totalDeduction).toFixed(2));
      wallet.lastUpdatedAt = new Date();
      await wallet.save();

      await B2BCompany.findByIdAndUpdate(companyId, { walletBalance: wallet.balance });

      const transactionId = `TXN-DED-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      const txn = await B2BWalletTransaction.create({
        companyId,
        walletId: wallet._id,
        transactionId,
        type: 'job_deduction',
        amount: -perJobCharge,
        gstAmount: -gstAmount,
        totalAmount: -totalDeduction,
        status: 'success',
        paymentMethod: 'wallet',
        remark: `Auto-deduction for completed job ID: ${job.jobId}`,
        relatedJobIds: [jobId]
      });

      job.charge = totalDeduction;
      job.paymentStatus = 'deducted';
      job.status = 'completed';
      await job.save();

      const invoiceNumber = `WBI-DED-${Date.now().toString().substring(5)}`;
      await B2BInvoice.create({
        companyId,
        invoiceId: `INV-DED-${Date.now()}`,
        invoiceNumber,
        invoiceType: 'deduction',
        amount: perJobCharge,
        gstAmount,
        totalAmount: totalDeduction,
        status: 'Settled',
        fileUrl: `https://wbi-invoices.s3.amazonaws.com/${invoiceNumber}.pdf`
      });

      emitEvent('b2b:walletUpdated', `b2b:${companyId}`, {
        balance: wallet.balance,
        totalSpent: wallet.totalSpent
      });
      emitEvent('b2b:deductionSuccess', `b2b:${companyId}`, {
        jobId: job.jobId,
        amount: totalDeduction
      });
      emitEvent('admin:b2bWalletUpdated', 'admin', {
        companyId,
        balance: wallet.balance
      });

      return { success: true, txn, wallet };
    }

    wallet.pendingDeductions = parseFloat((wallet.pendingDeductions + totalDeduction).toFixed(2));
    wallet.lastUpdatedAt = new Date();
    await wallet.save();

    job.charge = totalDeduction;
    job.paymentStatus = 'pending_deduction';
    job.status = 'completed';
    await job.save();

    emitEvent('b2b:walletUpdated', `b2b:${companyId}`, {
      balance: wallet.balance,
      pendingDeductions: wallet.pendingDeductions
    });
    emitEvent('b2b:lowBalance', `b2b:${companyId}`, {
      balance: wallet.balance,
      required: totalDeduction,
      message: 'Wallet balance insufficient for completed job deductions. Please top up.'
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
