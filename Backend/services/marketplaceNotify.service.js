/**
 * Orchestrates email + in-app + push for marketplace / ops flows (non-blocking helpers).
 */
const Vendor = require('../models/Vendor');
const Engineer = require('../models/Engineer');
const User = require('../models/User');
const { notifyVendor } = require('./vendorNotify.service');
const { notifyEngineer } = require('./engineerNotify.service');
const { createNotification } = require('../controllers/notificationControllers/notificationController');
const {
  sendEngineerOpsJobAssignedEmail,
  sendVendorOpportunityEmail,
  sendVendorEngineerJobUpdateEmail,
  sendServiceRequestPaymentEmail
} = require('./emailService');

function fireAndForget(promise) {
  Promise.resolve(promise).catch((err) => {
    console.warn('[marketplaceNotify]', err?.message || err);
  });
}

function formatBudget(budget) {
  if (!budget) return 'On request';
  const min = budget.min != null ? budget.min : budget;
  const max = budget.max != null ? budget.max : null;
  if (max != null && min != null && min !== max) return `₹${Number(min).toLocaleString('en-IN')} – ₹${Number(max).toLocaleString('en-IN')}`;
  const n = Number(max != null ? max : min);
  return Number.isFinite(n) ? `₹${n.toLocaleString('en-IN')}` : 'On request';
}

/**
 * Vendor turn in assignment queue — socket already emitted by assignment engine.
 */
async function dispatchVendorOpportunity(vendorId, payload = {}) {
  const vendor = await Vendor.findById(vendorId).select('name businessName email').lean();
  if (!vendor) return;

  const title = payload.title || 'New business opportunity';
  const message =
    payload.message ||
    `${payload.opportunityCode || 'Lead'} — ${payload.city || 'your area'}. Review in vendor portal.`;

  try {
    const { emitAsync } = require('./notification/notificationOrchestrator.service');
    emitAsync('opportunity_new', {
      targets: { vendorId },
      data: {
        title,
        message,
        opportunityId: payload.opportunityId,
        opportunityCode: payload.opportunityCode,
        categoryCode: payload.categoryCode,
        city: payload.city,
        budget: payload.budget,
        requiredEngineers: payload.requiredEngineers || 1,
        email: vendor.email,
        name: vendor.businessName || vendor.name
      }
    });
    return;
  } catch (e) {
    // Fallback to legacy path if orchestrator unavailable
    await notifyVendor(vendorId, {
      type: 'client_request',
      pushType: 'opportunity_new',
      category: 'leads',
      title,
      message,
      relatedId: payload.opportunityId,
      relatedType: 'opportunity',
      priority: 'high',
      data: {
        opportunityId: payload.opportunityId ? String(payload.opportunityId) : '',
        opportunityCode: payload.opportunityCode || '',
        categoryCode: payload.categoryCode || ''
      }
    });
  }

  fireAndForget(
    sendVendorOpportunityEmail(vendor, {
      opportunityCode: payload.opportunityCode,
      title: payload.title,
      city: payload.city,
      budgetLabel: formatBudget(payload.budget),
      requiredEngineers: payload.requiredEngineers || 1,
      opportunityId: payload.opportunityId
    })
  );
}

async function dispatchEngineerOpsJobAssigned({ engineer, vendor, job, project }) {
  if (!engineer?._id || !job) return;

  await notifyEngineer(engineer._id, {
    type: 'worker_assigned',
    pushType: 'ops_job_assigned',
    category: 'jobs',
    title: 'New job assigned',
    message: `${job.title} — ${job.clientName || job.city || 'New client request'}`,
    relatedId: job._id,
    relatedType: 'vendor_ops_job',
    priority: 'high',
    data: {
      jobId: String(job._id),
      projectId: project?._id ? String(project._id) : '',
      jobCode: job.jobCode || '',
      isOpsJob: '1'
    }
  });

  fireAndForget(
    sendEngineerOpsJobAssignedEmail(engineer, vendor, job, project)
  );
}

async function dispatchVendorEngineerOpsUpdate({ vendorId, job, engineer, status }) {
  if (!vendorId || !job) return;

  const engineerName = engineer?.name || job.engineerName || 'Engineer';
  const statusMap = {
    accepted: { title: 'Engineer accepted job', verb: 'accepted', type: 'ops_job_accepted' },
    rejected: { title: 'Engineer declined job', verb: 'declined', type: 'ops_job_rejected' },
    completed: { title: 'Field job completed', verb: 'completed', type: 'ops_job_completed' }
  };
  const meta = statusMap[status] || { title: 'Job update', verb: status, type: 'general' };

  await notifyVendor(vendorId, {
    type: meta.type,
    category: 'jobs',
    title: meta.title,
    message: `${engineerName} ${meta.verb} — ${job.title || job.jobCode || 'Ops job'}`,
    relatedId: job._id,
    relatedType: 'vendor_ops_job',
    priority: status === 'rejected' ? 'high' : 'normal',
    data: {
      jobId: String(job._id),
      projectId: job.projectId ? String(job.projectId) : '',
      engineerId: engineer?._id ? String(engineer._id) : '',
      status
    }
  });

  const vendor = await Vendor.findById(vendorId).select('name businessName email').lean();
  fireAndForget(
    sendVendorEngineerJobUpdateEmail(vendor, job, engineer || { name: engineerName }, status)
  );
}

async function dispatchUserServiceRequestPaid({ request, schema, paymentMeta }) {
  if (!request) return;

  const fresh = request._id && request.contact
    ? request
    : await require('../models/ServiceRequest').findById(request._id || request).lean();
  const doc = fresh || request;

  const serviceName = schema?.subCategoryName || doc.subCatCode || 'Service request';
  const amount = Number(doc.payment?.amount) || 0;
  const email = doc.contact?.email;
  let user = null;
  if (doc.userId) {
    user = await User.findById(doc.userId).select('email name').lean();
  }

  const toEmail = user?.email || email;
  const displayName = user?.name || doc.contact?.name || 'Customer';

  if (doc.userId) {
    await createNotification({
      userId: doc.userId,
      type: 'payment_success',
      title: 'Payment received',
      message: `We received ₹${amount.toLocaleString('en-IN')} for ${serviceName}. Vendors are being notified.`,
      relatedId: doc._id,
      relatedType: 'service_request',
      priority: 'high',
      pushData: {
        type: 'payment_success',
        requestCode: doc.requestCode || ''
      }
    });
  }

  fireAndForget(
    sendServiceRequestPaymentEmail({
      email: toEmail,
      name: displayName,
      serviceName,
      requestCode: doc.requestCode,
      amount,
      razorpayPaymentId: paymentMeta?.paymentId,
      serviceRequestId: doc._id
    })
  );

  try {
    if (global.io && doc._id) {
      global.io.emit(`service-request:${doc._id}`, {
        type: 'payment_paid',
        requestCode: doc.requestCode,
        status: 'paid'
      });
    }
  } catch (_) {}
}

async function dispatchUserProjectTimeline({ userId, serviceRequestId, message, opportunityId }) {
  if (!userId || !message) return;
  await createNotification({
    userId,
    type: 'general',
    title: 'Project update',
    message,
    relatedId: opportunityId || serviceRequestId,
    relatedType: opportunityId ? 'opportunity' : 'service_request',
    pushData: { type: 'project_assignment' }
  });
}

module.exports = {
  dispatchVendorOpportunity,
  dispatchEngineerOpsJobAssigned,
  dispatchVendorEngineerOpsUpdate,
  dispatchUserServiceRequestPaid,
  dispatchUserProjectTimeline,
  fireAndForget
};
