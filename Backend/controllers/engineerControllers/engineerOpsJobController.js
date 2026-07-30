/**

 * Engineer-facing Vendor Ops Jobs (Business Intake → Project → Assign)

 */

const VendorOpsJob = require('../../models/VendorOpsJob');

const VendorOpsProject = require('../../models/VendorOpsProject');

const Opportunity = require('../../models/Opportunity');

const mongoose = require('mongoose');

const { creditEngineerForOpsJob, getEngineerPayoutPercent } = require('../../services/opsJobPayout.service');



const getEngineerId = (req) => req.user._id || req.user.id;

async function notifyVendorOpsJobStatus(job, engineerId, status) {
  try {
    const Engineer = require('../../models/Engineer');
    const engineer = await Engineer.findById(engineerId).select('name phone email').lean();
    const { dispatchVendorEngineerOpsUpdate, fireAndForget } = require('../../services/marketplaceNotify.service');
    fireAndForget(
      dispatchVendorEngineerOpsUpdate({ vendorId: job.vendorId, job, engineer, status })
    );
  } catch (e) {
    console.warn('notifyVendorOpsJobStatus:', e.message);
  }
}


const buildProgressSteps = (job) => {

  const status = job?.status || 'pending_acceptance';

  const stepOrder = ['pending_acceptance', 'accepted', 'in_progress', 'completed'];

  const idx = stepOrder.indexOf(status);

  const labels = {

    pending_acceptance: 'Assignment received',

    accepted: 'Accepted — ready to start',

    in_progress: 'Work in progress',

    completed: 'Completed'

  };

  return stepOrder.map((key, i) => ({

    key,

    label: labels[key],

    done: status === 'rejected' ? key === 'pending_acceptance' : i <= idx && status !== 'rejected',

    current: key === status

  }));

};



const syncProjectProgress = async (projectId) => {

  const [total, completed] = await Promise.all([

    VendorOpsJob.countDocuments({ projectId }),

    VendorOpsJob.countDocuments({ projectId, status: 'completed' })

  ]);

  if (!total) return;

  const progress = Math.min(100, Math.round((completed / total) * 100));

  const patch = {

    progress,

    currentStage: progress >= 100 ? 'Completed' : 'In Progress'

  };

  if (progress >= 100) {

    patch.status = 'completed';

  } else {

    patch.status = 'in_progress';

  }

  await VendorOpsProject.updateOne({ _id: projectId }, { $set: patch });

  if (progress >= 100) {
    const { autoFinalizeProjectEscrow } = require('../../services/enterpriseB2BOrchestrator.service');
    autoFinalizeProjectEscrow(projectId).catch((err) => {
      console.warn('[syncProjectProgress] escrow finalize:', err.message);
    });
  }
};



/** GET /api/engineers/ops-jobs */

exports.listOpsJobs = async (req, res) => {

  try {

    const engineerId = getEngineerId(req);

    const { status } = req.query;

    const filter = { engineerId: new mongoose.Types.ObjectId(engineerId) };

    if (status === 'pending') filter.status = 'pending_acceptance';

    else if (status === 'active') {

      filter.status = { $in: ['accepted', 'en_route', 'on_site', 'in_progress'] };

    } else if (status) filter.status = status;



    const jobs = await VendorOpsJob.find(filter)

      .sort({ createdAt: -1 })

      .limit(50)

      .populate('projectId', 'projectCode title progress currentStage status paymentStatus')

      .lean();



    res.status(200).json({ success: true, data: jobs });

  } catch (error) {

    console.error('listOpsJobs:', error);

    res.status(500).json({ success: false, message: 'Failed to fetch jobs' });

  }

};



/** GET /api/engineers/ops-jobs/:id */

exports.getOpsJob = async (req, res) => {

  try {

    const engineerId = getEngineerId(req);

    const job = await VendorOpsJob.findOne({

      _id: req.params.id,

      engineerId: new mongoose.Types.ObjectId(engineerId)

    })

      .populate('projectId', 'projectCode title progress currentStage status paymentStatus budget city clientName')

      .lean();

    if (!job) return res.status(404).json({ success: false, message: 'Job not found' });



    const payoutPercent = await getEngineerPayoutPercent();

    const estimatedPayout =

      job.payoutStatus === 'credited' && job.engineerPayout

        ? job.engineerPayout

        : Math.round((Number(job.budget) || 0) * (payoutPercent / 100));



    res.status(200).json({

      success: true,

      data: {

        ...job,

        progressSteps: buildProgressSteps(job),

        payment: {

          jobBudget: job.budget || 0,

          payoutPercent,

          estimatedPayout,

          payoutStatus: job.payoutStatus || 'pending',

          engineerPayout: job.engineerPayout || 0,

          payoutAt: job.payoutAt || null

        }

      }

    });

  } catch (error) {

    res.status(500).json({ success: false, message: 'Failed to fetch job' });

  }

};



exports.acceptOpsJob = async (req, res) => {

  try {

    const engineerId = getEngineerId(req);

    const job = await VendorOpsJob.findOne({

      _id: req.params.id,

      engineerId: new mongoose.Types.ObjectId(engineerId),

      status: 'pending_acceptance'

    });

    if (!job) {

      return res.status(404).json({ success: false, message: 'Pending job not found' });

    }

    const { parseEngineerConfirmation } = require('../../services/projectAssignmentEngine.service');

    let requiredEngineers = 1;
    let opportunity = null;
    const projectPreview = await VendorOpsProject.findById(job.projectId).select('opportunityId').lean();
    if (projectPreview?.opportunityId) {
      opportunity = await Opportunity.findById(projectPreview.opportunityId)
        .select('assignment.requiredEngineers assignment.phase status')
        .lean();
      requiredEngineers = opportunity?.assignment?.requiredEngineers || 1;
    }

    const parsed = parseEngineerConfirmation(req.body || {}, requiredEngineers);
    if (!parsed.ok) {
      return res.status(parsed.status || 400).json({ success: false, message: parsed.message });
    }

    job.status = 'accepted';

    job.respondedAt = new Date();
    job.acceptConfirmation = parsed.confirmation;

    await job.save();



    await VendorOpsProject.updateOne(

      { _id: job.projectId },

      {

        $set: {

          'assignedEngineers.$[e].status': 'accepted',

          currentStage: 'Engineer Accepted',

          status: 'in_progress'

        }

      },

      { arrayFilters: [{ 'e.engineerId': job.engineerId }] }

    ).catch(() => {});



    const project = await VendorOpsProject.findById(job.projectId).select('opportunityId').lean();
    if (project?.opportunityId) {
      await Opportunity.updateOne(
        { _id: project.opportunityId, status: 'open' },
        {
          $set: {
            status: 'awarded',
            'assignment.phase': 'awarded',
            'awardedTo.awardedAt': new Date(),
            'assignment.engineerConfirmation': {
              ...parsed.confirmation,
              engineerId: job.engineerId
            }
          }
        }
      );
      try {
        const { onEngineerAssigned } = require('../../services/enterpriseB2BOrchestrator.service');
        await onEngineerAssigned(project.opportunityId, engineerId);
      } catch (_) {}
    }



    try {

      const io = req.app.get('io');

      if (io) {

        io.to(`vendor:${job.vendorId}`).emit('ops:job_accepted', {

          jobId: job._id,

          projectId: job.projectId,

          engineerId,

          engineerName: job.engineerName

        });

      }

    } catch (_) {}



    await notifyVendorOpsJobStatus(job, engineerId, 'accepted');

    res.status(200).json({
      success: true,
      message: 'Job accepted — project awarded',
      data: job
    });

  } catch (error) {

    console.error('acceptOpsJob:', error);

    res.status(500).json({ success: false, message: 'Failed to accept job' });

  }

};



exports.rejectOpsJob = async (req, res) => {

  try {

    const engineerId = getEngineerId(req);

    const { reason = '' } = req.body || {};

    const job = await VendorOpsJob.findOne({

      _id: req.params.id,

      engineerId: new mongoose.Types.ObjectId(engineerId),

      status: 'pending_acceptance'

    });

    if (!job) {

      return res.status(404).json({ success: false, message: 'Pending job not found' });

    }



    job.status = 'rejected';

    job.respondedAt = new Date();

    job.rejectionReason = reason || 'Rejected by engineer';

    job.payoutStatus = 'not_applicable';

    await job.save();



    await VendorOpsProject.updateOne(

      { _id: job.projectId },

      {

        $set: {

          'assignedEngineers.$[e].status': 'rejected',

          currentStage: 'Reassign Engineer'

        }

      },

      { arrayFilters: [{ 'e.engineerId': job.engineerId }] }

    ).catch(() => {});



    try {

      const io = req.app.get('io');

      if (io) {

        io.to(`vendor:${job.vendorId}`).emit('ops:job_rejected', {

          jobId: job._id,

          projectId: job.projectId,

          engineerId,

          reason: job.rejectionReason

        });

      }

    } catch (_) {}



    await notifyVendorOpsJobStatus(job, engineerId, 'rejected');

    res.status(200).json({ success: true, message: 'Job rejected', data: job });

  } catch (error) {

    console.error('rejectOpsJob:', error);

    res.status(500).json({ success: false, message: 'Failed to reject job' });

  }

};



exports.startOpsJob = async (req, res) => {

  try {

    const engineerId = getEngineerId(req);

    const job = await VendorOpsJob.findOne({

      _id: req.params.id,

      engineerId: new mongoose.Types.ObjectId(engineerId),

      status: { $in: ['accepted', 'en_route', 'on_site'] }

    });

    if (!job) return res.status(404).json({ success: false, message: 'Job not found' });

    job.status = 'in_progress';

    job.startedAt = new Date();

    await job.save();



    await VendorOpsProject.updateOne(

      { _id: job.projectId },

      { $set: { currentStage: 'Work In Progress', status: 'in_progress' } }

    ).catch(() => {});



    res.status(200).json({ success: true, data: job });

  } catch (error) {

    res.status(500).json({ success: false, message: 'Failed to start job' });

  }

};



exports.completeOpsJob = async (req, res) => {

  try {

    const engineerId = getEngineerId(req);

    const job = await VendorOpsJob.findOne({

      _id: req.params.id,

      engineerId: new mongoose.Types.ObjectId(engineerId),

      status: { $in: ['in_progress', 'on_site', 'accepted'] }

    });

    if (!job) return res.status(404).json({ success: false, message: 'Job not found' });



    job.status = 'completed';

    job.completedAt = new Date();

    await job.save();



    const payoutResult = await creditEngineerForOpsJob(job);

    if (payoutResult.ok && !payoutResult.skipped && payoutResult.amount > 0) {

      job.engineerPayout = payoutResult.amount;

      job.payoutStatus = 'credited';

      job.payoutAt = new Date();

      job.payoutTransactionId = payoutResult.transactionId;

      await job.save();

    } else if ((Number(job.budget) || 0) <= 0) {

      job.payoutStatus = 'not_applicable';

      await job.save();

    }



    await syncProjectProgress(job.projectId);



    try {

      const io = req.app.get('io');

      if (io) {

        io.to(`vendor:${job.vendorId}`).emit('ops:job_completed', {

          jobId: job._id,

          projectId: job.projectId,

          engineerId

        });

        io.to('admin-room').emit('ops:job_completed', {

          jobId: job._id,

          jobCode: job.jobCode,

          projectId: job.projectId,

          vendorId: job.vendorId,

          engineerId,

          engineerPayout: job.engineerPayout || payoutResult.amount || 0,

          title: job.title

        });

      }

    } catch (_) {}



    await notifyVendorOpsJobStatus(job, engineerId, 'completed');

    const refreshed = await VendorOpsJob.findById(job._id).lean();



    res.status(200).json({

      success: true,

      message: payoutResult.amount

        ? `Job completed. ₹${payoutResult.amount} credited to your wallet.`

        : 'Job marked complete.',

      data: {

        ...refreshed,

        payout: payoutResult

      }

    });

  } catch (error) {

    console.error('completeOpsJob:', error);

    res.status(500).json({ success: false, message: 'Failed to complete job' });

  }

};


