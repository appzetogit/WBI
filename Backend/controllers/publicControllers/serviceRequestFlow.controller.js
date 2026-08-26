const mongoose = require('mongoose');
const ServiceRequest = require('../../models/ServiceRequest');
const { approveServiceRequestMilestoneCustomer } = require('../../services/enterpriseB2BOrchestrator.service');

exports.approveMilestoneCustomer = async (req, res) => {
  try {
    const { requestCode, milestoneId } = req.params;
    const { approved = true } = req.body || {};

    const sr = await ServiceRequest.findOne({ requestCode }).select('_id').lean();
    if (!sr) {
      return res.status(404).json({ success: false, message: 'Service request not found' });
    }

    const result = await approveServiceRequestMilestoneCustomer({
      serviceRequestId: sr._id,
      milestoneId,
      approved: approved !== false
    });

    if (result?.pending || result?.code === 'APPROVAL_PENDING') {
      return res.status(200).json({ success: true, pending: true, data: result });
    }
    if (result?.ok === false && result.status) {
      return res.status(result.status).json({ success: false, message: result.message, data: result });
    }

    res.status(200).json({ success: true, data: result });
  } catch (error) {
    console.error('[approveMilestoneCustomer]', error);
    res.status(500).json({ success: false, message: 'Failed to record customer approval' });
  }
};

function normalizePhone(p) {
  return String(p || '').replace(/\D/g, '').slice(-10);
}

/** End-customer sign-off on completed B2B field job (jobId or WBI job ref). */
exports.approveB2BJobCustomer = async (req, res) => {
  try {
    const { jobRef } = req.params;
    const { approved = true, phone } = req.body || {};
    const B2BJob = require('../../models/B2BJob');
    const { approveB2BJobWork } = require('../../services/enterpriseB2BOrchestrator.service');

    let job = null;
    if (mongoose.Types.ObjectId.isValid(jobRef)) {
      job = await B2BJob.findById(jobRef).select('phone jobId').lean();
    }
    if (!job) {
      job = await B2BJob.findOne({ jobId: String(jobRef) }).select('phone jobId').lean();
    }
    if (!job) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }
    if (phone && normalizePhone(phone) !== normalizePhone(job.phone)) {
      return res.status(403).json({ success: false, message: 'Phone does not match job contact' });
    }

    const result = await approveB2BJobWork(job._id, null, {
      party: 'customer',
      approved: approved !== false
    });
    if (!result.ok && result.status) {
      return res.status(result.status).json({ success: false, message: result.message, data: result });
    }
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    console.error('[approveB2BJobCustomer]', error);
    res.status(500).json({ success: false, message: 'Failed to record customer approval' });
  }
};
