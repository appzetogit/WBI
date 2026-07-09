const B2BJob = require('../../models/B2BJob');
const JobStatusTimeline = require('../../models/JobStatusTimeline');
const DeductionLedger = require('../../models/DeductionLedger');
const DeviceHistory = require('../../models/DeviceHistory');
const B2BWalletTransaction = require('../../models/B2BWalletTransaction');
const B2BWallet = require('../../models/B2BWallet');
const Wallet = require('../../models/Wallet');
const WalletTransaction = require('../../models/WalletTransaction');
const Engineer = require('../../models/Engineer');
const B2BCompany = require('../../models/B2BCompany');
const { sendB2BJobCompletionEmail } = require('../../services/emailService');

// GET all assigned B2B Jobs for the engineer
exports.getAssignedB2BJobs = async (req, res) => {
  try {
    const engineerId = req.user.id || req.user._id;
    const jobs = await B2BJob.find({ assignedTo: engineerId })
      .populate('companyId', 'companyName')
      .sort({ preferredDate: 1 });
    
    res.status(200).json({ success: true, jobs });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch B2B jobs' });
  }
};

// POST Start Job
exports.startB2BJob = async (req, res) => {
  try {
    const engineerId = req.user.id || req.user._id;
    const { jobId } = req.params;
    const { startOtp, location } = req.body;

    const job = await B2BJob.findOne({ _id: jobId, assignedTo: engineerId });
    if (!job) return res.status(404).json({ success: false, message: 'Job not found' });

    job.status = 'in_progress';
    job.trackingStatus = 'work_started';
    job.startedAt = new Date();
    await job.save();

    await JobStatusTimeline.create({
      jobId: job._id,
      companyId: job.companyId,
      engineerId,
      status: 'in_progress',
      remarks: 'Work started by engineer',
      location: location || { type: 'Point', coordinates: [0, 0] }
    });

    res.status(200).json({ success: true, message: 'Job started successfully', job });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to start job' });
  }
};

// POST Complete/Fail Job
exports.completeB2BJob = async (req, res) => {
  try {
    const engineerId = req.user.id || req.user._id;
    const { jobId } = req.params;
    const { status, incompleteReason, endOtp, beforePhotos, afterPhotos, partsReplaced, location } = req.body;

    const job = await B2BJob.findOne({ _id: jobId, assignedTo: engineerId });
    if (!job) return res.status(404).json({ success: false, message: 'Job not found' });

    if (['completed', 'cancelled', 'failed'].includes(job.status)) {
      return res.status(400).json({ success: false, message: `Job already ${job.status}` });
    }

    job.status = status; // 'completed' or 'failed'
    job.trackingStatus = status;
    job.completedAt = new Date();
    job.beforePhotos = beforePhotos || [];
    job.afterPhotos = afterPhotos || [];

    if (status === 'failed') {
      job.incompleteReason = incompleteReason;
      
      // Auto Deduction Logic for Client Dependencies
      if (['Customer Dependency', 'Site Closed', 'No Access'].includes(incompleteReason)) {
        const wallet = await B2BWallet.findOne({ companyId: job.companyId });
        const penaltyAmount = 250; // Example fixed penalty for incomplete site visit

        if (wallet) {
          const deduction = await DeductionLedger.create({
            companyId: job.companyId,
            jobId: job._id,
            engineerId,
            amount: penaltyAmount,
            reasonCode: incompleteReason,
            remarks: 'Auto-deduction for aborted job visit'
          });

          wallet.balance -= penaltyAmount;
          await wallet.save();

          await B2BWalletTransaction.create({
            companyId: job.companyId,
            walletId: wallet._id,
            transactionId: `DED-${Date.now()}`,
            type: 'job_deduction',
            amount: -penaltyAmount,
            totalAmount: -penaltyAmount,
            status: 'success',
            deductionId: deduction._id,
            remark: `Penalty for ${incompleteReason} on Job ${job.jobId}`
          });
        }
      }
    }

    await job.save();

    // Device History Push if device ID exists and job completed
    if (job.deviceId && (status === 'completed' || partsReplaced)) {
      let device = await DeviceHistory.findOne({ deviceId: job.deviceId, companyId: job.companyId });
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
      await device.save();
    }

    await JobStatusTimeline.create({
      jobId: job._id,
      companyId: job.companyId,
      engineerId,
      status,
      remarks: `Job marked as ${status}`,
      location: location || { type: 'Point', coordinates: [0, 0] }
    });

    // AUTO-PAYOUT: Credit engineer wallet on successful completion
    if (status === 'completed' && job.charge > 0) {
      try {
        const platformCutPercent = 15; // TazkY takes 15% platform fee
        const engineerShare = Math.round(job.charge * (1 - platformCutPercent / 100));

        // Find or create engineer wallet
        let engineerWallet = await Wallet.findOne({ ownerId: engineerId, ownerType: 'engineer' });
        if (!engineerWallet) {
          engineerWallet = await Wallet.create({ ownerId: engineerId, ownerType: 'engineer' });
        }

        engineerWallet.availableBalance += engineerShare;
        engineerWallet.totalEarned += engineerShare;
        await engineerWallet.save();

        // Log the payout transaction
        await WalletTransaction.create({
          walletId: engineerWallet._id,
          ownerId: engineerId,
          ownerType: 'engineer',
          type: 'credit',
          amount: engineerShare,
          description: `B2B Job Payout — Job ${job.jobId} (${platformCutPercent}% platform fee deducted)`,
          reference: job._id.toString(),
          status: 'completed'
        });

        console.log(`[B2B Payout] Credited ₹${engineerShare} to engineer ${engineerId} for Job ${job.jobId}`);

        // Send Thank-You email to B2B company (non-blocking)
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
        // Non-blocking — job completion still succeeds
        console.error('[B2B Payout] Auto-payout failed (non-blocking):', payoutErr.message);
      }
    }

    res.status(200).json({ success: true, message: `Job ${status} successfully`, job });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Failed to complete job' });
  }
};
