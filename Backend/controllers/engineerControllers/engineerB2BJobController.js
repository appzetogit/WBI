const mongoose = require('mongoose');
const B2BJob = require('../../models/B2BJob');
const JobStatusTimeline = require('../../models/JobStatusTimeline');
const JobHistory = require('../../models/JobHistory');
const DeductionLedger = require('../../models/DeductionLedger');
const DeviceHistory = require('../../models/DeviceHistory');
const B2BWalletTransaction = require('../../models/B2BWalletTransaction');
const B2BWallet = require('../../models/B2BWallet');
const Wallet = require('../../models/Wallet');
const WalletTransaction = require('../../models/WalletTransaction');
const Engineer = require('../../models/Engineer');
const B2BCompany = require('../../models/B2BCompany');
const EnterpriseProjectFlow = require('../../models/EnterpriseProjectFlow');
const { sendB2BJobCompletionEmail } = require('../../services/emailService');
const { sendSMS } = require('../../services/smsService');

const SPARE_PARTS_REASONS = ['Spare Parts', 'Spare Parts Required', 'Parts Unavailable'];
const CLIENT_DEPENDENCY_REASONS = ['Customer Dependency', 'Site Closed', 'No Access'];
const VISIT_FEE_SPARE_PARTS = parseFloat(process.env.B2B_SPARE_PARTS_VISIT_FEE || '250');
const CLIENT_DEPENDENCY_PENALTY = parseFloat(process.env.B2B_CLIENT_DEPENDENCY_PENALTY || '250');

const generateOtp = () => {
  if (process.env.USE_DEFAULT_OTP === 'true') return '123456';
  return Math.floor(100000 + Math.random() * 900000).toString();
};

exports.getAssignedB2BJobs = async (req, res) => {
  try {
    const engineerId = req.user.id || req.user._id;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const skip = (page - 1) * limit;

    const jobs = await B2BJob.find({ assignedTo: engineerId })
      .populate('companyId', 'companyName')
      .select('-startOtp -endOtp')
      .sort({ preferredDate: 1 })
      .skip(skip)
      .limit(limit)
      .lean();

    res.status(200).json({ success: true, jobs });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch B2B jobs' });
  }
};

exports.getB2BJobById = async (req, res) => {
  try {
    const engineerId = req.user.id || req.user._id;
    const job = await B2BJob.findOne({ _id: req.params.jobId, assignedTo: engineerId })
      .populate('companyId', 'companyName')
      .select('-startOtp -endOtp')
      .lean();

    if (!job) return res.status(404).json({ success: false, message: 'Job not found' });

    res.status(200).json({
      success: true,
      job: {
        ...job,
        hasStartOtp: true,
        workElapsedMs: job.startedAt ? Date.now() - new Date(job.startedAt).getTime() : null
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch job' });
  }
};

exports.resendStartOtp = async (req, res) => {
  try {
    const engineerId = req.user.id || req.user._id;
    const job = await B2BJob.findOne({ _id: req.params.jobId, assignedTo: engineerId });
    if (!job) return res.status(404).json({ success: false, message: 'Job not found' });

    if (job.status === 'in_progress') {
      return res.status(400).json({ success: false, message: 'Job already started' });
    }
    if (job.status !== 'assigned') {
      return res.status(400).json({ success: false, message: 'OTP can only be resent before work starts' });
    }

    const otp = generateOtp();
    job.startOtp = otp;
    job.startOtpSentAt = new Date();
    await job.save();

    if (job.phone) {
      try {
        await sendSMS(
          job.phone,
          `WBIPVTLTD: Your service start OTP for job ${job.jobId} is ${otp}. Share only with the engineer on site.`
        );
      } catch (e) {
        console.warn('[B2B OTP] Resend SMS failed:', e.message);
      }
    }

    if (process.env.USE_DEFAULT_OTP === 'true') {
      console.log(`[DEV] B2B Start OTP resent for ${job.jobId}: ${otp}`);
    }

    res.status(200).json({ success: true, message: 'Start OTP sent to customer phone' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to resend OTP' });
  }
};

exports.startB2BJob = async (req, res) => {
  try {
    const engineerId = req.user.id || req.user._id;
    const { jobId } = req.params;
    const { startOtp, location, beforePhotos } = req.body;

    const job = await B2BJob.findOne({ _id: jobId, assignedTo: engineerId });
    if (!job) return res.status(404).json({ success: false, message: 'Job not found' });

    if (job.reopenBlocked || job.requiresNewJob) {
      return res.status(400).json({
        success: false,
        message: 'This job is closed and requires a new job ticket. It cannot be restarted.'
      });
    }

    if (job.status === 'in_progress') {
      return res.status(400).json({ success: false, message: 'Job already in progress', job });
    }

    if (job.status !== 'assigned') {
      return res.status(400).json({
        success: false,
        message: `Cannot start job in status '${job.status}'`
      });
    }

    if (!startOtp || String(startOtp).trim().length < 4) {
      return res.status(400).json({ success: false, message: 'Start OTP is required' });
    }

    if (!job.startOtp) {
      return res.status(400).json({
        success: false,
        message: 'No start OTP on this job. Request a resend OTP.'
      });
    }

    if (String(startOtp).trim() !== String(job.startOtp).trim()) {
      return res.status(400).json({ success: false, message: 'Invalid start OTP' });
    }

    const photos = Array.isArray(beforePhotos) ? beforePhotos.filter(Boolean) : [];
    if (photos.length < 1) {
      return res.status(400).json({
        success: false,
        message: 'At least one before-work photo is required to start the job'
      });
    }

    const now = new Date();
    job.status = 'in_progress';
    job.trackingStatus = 'work_started';
    job.startedAt = now;
    job.startOtpVerifiedAt = now;
    job.beforePhotos = photos;
    job.startOtp = null;
    await job.save();

    await JobStatusTimeline.create({
      jobId: job._id,
      companyId: job.companyId,
      engineerId,
      status: 'in_progress',
      remarks: 'Work started — OTP verified, before photos captured, timer started',
      location: location || { type: 'Point', coordinates: [0, 0] }
    });

    await JobHistory.create({
      jobId: job._id,
      status: 'in_progress',
      remark: 'Engineer started job with OTP + before photos. Work timer running.',
      role: 'engineer',
      changedBy: engineerId
    });

    const safeJob = job.toObject();
    delete safeJob.startOtp;
    delete safeJob.endOtp;

    res.status(200).json({
      success: true,
      message: 'Job started successfully. Work timer is running.',
      job: safeJob,
      workTimerStartedAt: now
    });
  } catch (error) {
    console.error('[startB2BJob]', error);
    res.status(500).json({ success: false, message: 'Failed to start job' });
  }
};

async function applyWalletAdjustment({ companyId, job, engineerId, amount, reasonCode, remarks, session }) {
  const q = B2BWallet.findOne({ companyId });
  if (session) q.session(session);
  const wallet = await q;
  if (!wallet) return { success: false, error: 'Wallet not found' };

  const absAmount = Math.abs(amount);
  if (amount < 0 && wallet.balance < absAmount) {
    return { success: false, error: 'Insufficient wallet balance', available: wallet.balance, required: absAmount };
  }

  wallet.balance = parseFloat((wallet.balance + amount).toFixed(2));
  if (amount < 0) {
    wallet.totalSpent = parseFloat((wallet.totalSpent + absAmount).toFixed(2));
  }
  wallet.lastUpdatedAt = new Date();
  await wallet.save(session ? { session } : undefined);

  await B2BCompany.findByIdAndUpdate(
    companyId,
    { walletBalance: wallet.balance },
    session ? { session } : undefined
  );

  const dedOpts = session ? { session } : undefined;
  const deductionDocs = await DeductionLedger.create([{
    companyId,
    jobId: job._id,
    engineerId,
    amount: absAmount,
    reasonCode,
    remarks
  }], dedOpts);

  const deduction = Array.isArray(deductionDocs) ? deductionDocs[0] : deductionDocs;

  await B2BWalletTransaction.create([{
    companyId,
    walletId: wallet._id,
    transactionId: `DED-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
    type: amount < 0 ? 'job_deduction' : 'adjustment',
    amount,
    totalAmount: amount,
    status: 'success',
    deductionId: deduction._id,
    remark: remarks
  }], dedOpts);

  return { success: true, wallet, deduction };
}

exports.completeB2BJob = async (req, res) => {
  let session = null;
  let useTxn = false;

  try {
    session = await mongoose.startSession();
    session.startTransaction();
    useTxn = true;
  } catch (txnStartErr) {
    console.warn('[completeB2BJob] Transactions unavailable, continuing without session:', txnStartErr.message);
    session = null;
    useTxn = false;
  }

  try {
    const engineerId = req.user.id || req.user._id;
    const { jobId } = req.params;
    const {
      status,
      incompleteReason,
      incompleteRemarks,
      beforePhotos,
      afterPhotos,
      partsReplaced,
      location,
      quoteAdjustmentAmount
    } = req.body;

    if (!['completed', 'failed'].includes(status)) {
      if (useTxn) { await session.abortTransaction(); session.endSession(); }
      return res.status(400).json({ success: false, message: 'status must be completed or failed' });
    }

    let jobQuery = B2BJob.findOne({ _id: jobId, assignedTo: engineerId });
    if (useTxn) jobQuery = jobQuery.session(session);
    const job = await jobQuery;
    if (!job) {
      if (useTxn) { await session.abortTransaction(); session.endSession(); }
      return res.status(404).json({ success: false, message: 'Job not found' });
    }

    if (['completed', 'cancelled', 'failed'].includes(job.status)) {
      if (useTxn) { await session.abortTransaction(); session.endSession(); }
      return res.status(400).json({ success: false, message: `Job already ${job.status}` });
    }

    if (job.reopenBlocked) {
      if (useTxn) { await session.abortTransaction(); session.endSession(); }
      return res.status(400).json({
        success: false,
        message: 'Job is permanently closed. Create a fresh job ticket.'
      });
    }

    if (job.status !== 'in_progress') {
      if (useTxn) { await session.abortTransaction(); session.endSession(); }
      return res.status(400).json({
        success: false,
        message: 'Job must be started (OTP + before photos) before completion'
      });
    }

    job.status = status;
    job.trackingStatus = status;
    job.completedAt = new Date();
    if (beforePhotos?.length) job.beforePhotos = beforePhotos;
    job.afterPhotos = afterPhotos || [];

    if (status === 'failed') {
      if (!incompleteReason) {
        if (useTxn) { await session.abortTransaction(); session.endSession(); }
        return res.status(400).json({ success: false, message: 'incompleteReason is required when marking failed' });
      }

      job.incompleteReason = incompleteReason;
      job.incompleteRemarks = incompleteRemarks || '';

      const isSpareParts = SPARE_PARTS_REASONS.includes(incompleteReason);
      const isClientDep = CLIENT_DEPENDENCY_REASONS.includes(incompleteReason);

      if (isSpareParts) {
        if (!incompleteRemarks || String(incompleteRemarks).trim().length < 5) {
          if (useTxn) { await session.abortTransaction(); session.endSession(); }
          return res.status(400).json({
            success: false,
            message: 'Spare Parts closure requires remarks describing parts needed'
          });
        }

        const visitFee = Math.min(VISIT_FEE_SPARE_PARTS, job.charge > 0 ? job.charge : VISIT_FEE_SPARE_PARTS);
        let walletDelta = 0;
        let adjustmentNote = '';

        if (job.paymentStatus === 'deducted' && job.charge > visitFee) {
          const refund = parseFloat((job.charge - visitFee).toFixed(2));
          walletDelta = refund;
          job.quoteAdjustmentAmount = -refund;
          adjustmentNote = `Spare Parts: kept visit fee ₹${visitFee}, refunded ₹${refund}`;
        } else if (job.paymentStatus !== 'deducted') {
          walletDelta = -visitFee;
          job.quoteAdjustmentAmount = visitFee;
          adjustmentNote = `Spare Parts: visit fee ₹${visitFee} deducted`;
        } else {
          adjustmentNote = `Spare Parts: visit fee already covered in deducted charge ₹${job.charge}`;
        }

        const extraAdj = parseFloat(quoteAdjustmentAmount || 0);
        if (!Number.isNaN(extraAdj) && extraAdj !== 0) {
          walletDelta -= extraAdj;
          job.quoteAdjustmentAmount = parseFloat(((job.quoteAdjustmentAmount || 0) + extraAdj).toFixed(2));
          adjustmentNote += `; extra adjustment ₹${extraAdj}`;
        }

        if (walletDelta !== 0) {
          const result = await applyWalletAdjustment({
            companyId: job.companyId,
            job,
            engineerId,
            amount: walletDelta,
            reasonCode: 'Spare Parts Required',
            remarks: `${adjustmentNote}. ${incompleteRemarks}`,
            session: useTxn ? session : null
          });
          if (!result.success) {
            if (useTxn) { await session.abortTransaction(); session.endSession(); }
            return res.status(400).json({
              success: false,
              message: result.error || 'Wallet adjustment failed',
              available: result.available,
              required: result.required
            });
          }
        }

        job.paymentStatus = 'adjusted';
        job.requiresNewJob = true;
        job.reopenBlocked = true;
        job.charge = visitFee;
      } else if (isClientDep) {
        const result = await applyWalletAdjustment({
          companyId: job.companyId,
          job,
          engineerId,
          amount: -CLIENT_DEPENDENCY_PENALTY,
          reasonCode: incompleteReason,
          remarks: incompleteRemarks || `Auto-deduction for aborted job visit (${incompleteReason})`,
          session: useTxn ? session : null
        });
        if (!result.success && result.error === 'Insufficient wallet balance') {
          let wq = B2BWallet.findOne({ companyId: job.companyId });
          if (useTxn) wq = wq.session(session);
          const wallet = await wq;
          if (wallet) {
            wallet.pendingDeductions = parseFloat(
              ((wallet.pendingDeductions || 0) + CLIENT_DEPENDENCY_PENALTY).toFixed(2)
            );
            await wallet.save(useTxn ? { session } : undefined);
          }
        }
      }
    } else if (status === 'completed') {
      const after = Array.isArray(afterPhotos) ? afterPhotos.filter(Boolean) : [];
      if (after.length < 1) {
        if (useTxn) { await session.abortTransaction(); session.endSession(); }
        return res.status(400).json({
          success: false,
          message: 'At least one after-work photo is required to complete the job'
        });
      }
    }

    await job.save(useTxn ? { session } : undefined);

    if (job.deviceId && (status === 'completed' || partsReplaced)) {
      let dq = DeviceHistory.findOne({ deviceId: job.deviceId, companyId: job.companyId });
      if (useTxn) dq = dq.session(session);
      let device = await dq;
      if (!device) {
        device = new DeviceHistory({ companyId: job.companyId, deviceId: job.deviceId, siteId: job.siteId });
      }
      device.jobHistory.push({
        jobId: job._id,
        engineerId,
        engineerName: job.assignedToName,
        issueReported: job.service,
        partsReplaced: partsReplaced || 'None'
      });
      await device.save(useTxn ? { session } : undefined);
    }

    const timelinePayload = {
      jobId: job._id,
      companyId: job.companyId,
      engineerId,
      status,
      remarks: status === 'failed'
        ? `Job failed: ${incompleteReason}${incompleteRemarks ? ` — ${incompleteRemarks}` : ''}`
        : `Job marked as ${status}`,
      location: location || { type: 'Point', coordinates: [0, 0] }
    };
    if (useTxn) {
      await JobStatusTimeline.create([timelinePayload], { session });
    } else {
      await JobStatusTimeline.create(timelinePayload);
    }

    const historyPayload = {
      jobId: job._id,
      status,
      remark: status === 'failed'
        ? `Incomplete: ${incompleteReason}. requiresNewJob=${!!job.requiresNewJob}`
        : 'Job completed successfully',
      role: 'engineer',
      changedBy: engineerId
    };
    if (useTxn) {
      await JobHistory.create([historyPayload], { session });
    } else {
      await JobHistory.create(historyPayload);
    }

    if (useTxn) {
      await session.commitTransaction();
      session.endSession();
    }

    try {
      const { onB2BJobCompleted } = require('../../services/enterpriseB2BOrchestrator.service');
      await onB2BJobCompleted(job._id, { status });
    } catch (flowErr) {
      console.warn('[completeB2BJob] enterprise flow:', flowErr.message);
    }

    // P0: do NOT credit engineer on complete — escrow release after B2B Company approval
    // credits engineer (engineer_direct) or vendor (vendor_marketplace).
    if (status === 'completed' && job.charge > 0) {
      try {
        await B2BJob.updateOne(
          { _id: job._id },
          { $set: { payoutStatus: 'pending_release' } }
        );
        try {
          const company = await B2BCompany.findById(job.companyId).select('email companyName');
          if (company && company.email) {
            const engineer = await Engineer.findById(engineerId).select('name');
            sendB2BJobCompletionEmail(company.email, company.companyName, job, engineer?.name);
          }
        } catch (emailErr) {
          console.error('[B2B Email] Thank-you email failed (non-blocking):', emailErr.message);
        }
      } catch (payoutErr) {
        console.error('[B2B Payout] pending_release marker failed (non-blocking):', payoutErr.message);
      }
    }

    const safeJob = job.toObject();
    delete safeJob.startOtp;
    delete safeJob.endOtp;

    res.status(200).json({
      success: true,
      message: status === 'failed' && job.requiresNewJob
        ? 'Job closed as Spare Parts Required. Create a fresh job when parts are available.'
        : `Job ${status} successfully`,
      job: safeJob
    });
  } catch (error) {
    if (useTxn && session) {
      await session.abortTransaction().catch(() => {});
      session.endSession();
    }
    console.error('[completeB2BJob]', error);
    res.status(500).json({ success: false, message: 'Failed to complete job' });
  }
};
