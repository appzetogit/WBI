const ServiceRequest = require('../models/ServiceRequest');
const Vendor = require('../models/Vendor');
const VendorOpsProject = require('../models/VendorOpsProject');
const VendorOpsJob = require('../models/VendorOpsJob');
const Opportunity = require('../models/Opportunity');
const Transaction = require('../models/Transaction');
const razorpayService = require('./razorpayService');
const { queueOpportunityFromEnquiry, buildAssignmentMetaFromEnquiry } = require('../utils/createOpportunityFromEnquiry');
const { getEngineerPayoutPercent } = require('./opsJobPayout.service');

const isPaymentBypassed = () => {
  if (process.env.SERVICE_REQUEST_SKIP_PAYMENT === 'true') return true;
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) return true;
  return false;
};

const parseBudgetNumber = (raw) => {
  if (raw == null || raw === '') return null;
  const s = String(raw).replace(/[,₹\s]/g, '');
  const m = s.match(/(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
};

const resolvePayableAmount = (schema, formData = {}) => {
  const fromForm =
    parseBudgetNumber(formData.budget) ||
    parseBudgetNumber(formData.budgetRange) ||
    parseBudgetNumber(formData.estimatedBudget);
  if (fromForm) return fromForm;
  const base = Number(schema?.basePrice);
  if (Number.isFinite(base) && base > 0) return Math.round(base);
  return 0;
};

const buildMarketplacePayload = (request, schema, formData) => ({
  enquiry: {
    _id: request._id,
    fullName: request.contact.name,
    phone: request.contact.phone,
    email: request.contact.email,
    city: request.contact.city,
    siteAddress: request.contact.address,
    companyName: formData.companyName || '',
    equipmentType: [schema.subCategoryName],
    urgency: formData.urgency || 'Normal',
    preferredVisitDate: formData.preferredDate || null,
    requiredEngineers: formData.requiredEngineers || formData.engineerCount || formData.teamSize,
    additionalNotes: [
      `Sub-service: ${schema.subCatCode} ${schema.subCategoryName}`,
      ...Object.entries(formData)
        .filter(([k]) => !['fullName', 'phone', 'email', 'city', 'siteAddress', 'preferredDate', 'preferredTime'].includes(k))
        .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
    ].join('\n'),
    budgetRange: formData.budget || (schema.basePrice ? `From ₹${schema.basePrice}` : ''),
    customerPaidAmount:
      request.payment?.status === 'paid' ? Number(request.payment.amount) || 0 : 0
  },
  enquiryType: 'service_request',
  enquiryModel: 'ServiceRequest',
  categoryCode: schema.categoryCode,
  titlePrefix: `${schema.subCategoryName} — ${request.contact.city || 'Site'}`,
  assignmentMeta: buildAssignmentMetaFromEnquiry(
    {
      _id: request._id,
      city: request.contact.city,
      siteAddress: request.contact.address,
      requiredEngineers: formData.requiredEngineers || formData.engineerCount,
      latitude: formData.latitude,
      longitude: formData.longitude
    },
    { serviceRequestId: request._id, subCatCode: schema.subCatCode }
  )
});

async function queueMarketplaceForServiceRequest(request, schema, formData) {
  if (request.payment?.marketplaceQueued) return { alreadyQueued: true };
  // #region agent log
  try {
    const { agentDebugLog } = require('../utils/agentDebugLog');
    agentDebugLog({
      hypothesisId: 'E',
      location: 'serviceRequestPayment.service.js:queueMarketplace',
      message: 'Queueing marketplace for ServiceRequest',
      data: {
        requestId: String(request._id),
        requestCode: request.requestCode,
        categoryCode: schema.categoryCode,
        subCatCode: schema.subCatCode,
        paymentStatus: request.payment?.status || null,
        city: request.contact?.city || ''
      }
    });
  } catch (_) { /* ignore */ }
  // #endregion
  queueOpportunityFromEnquiry(buildMarketplacePayload(request, schema, formData));
  await ServiceRequest.updateOne(
    { _id: request._id },
    { $set: { 'payment.marketplaceQueued': true } }
  );
  if (global.io) {
    global.io.emit('new_enquiry', {
      type: 'ServiceRequest',
      message: `New ${schema.subCategoryName} request (${request.requestCode})`,
      data: request
    });
  }
  return { queued: true };
}

/**
 * After ServiceRequest is saved — set amount and either skip payment or wait for Razorpay.
 */
async function initializePaymentForNewRequest(request, schema, formData) {
  const amount = resolvePayableAmount(schema, formData);
  const bypass = isPaymentBypassed() || amount <= 0;

  if (bypass) {
    await ServiceRequest.updateOne(
      { _id: request._id },
      {
        $set: {
          'payment.amount': amount,
          'payment.status': amount <= 0 ? 'not_required' : 'skipped',
          'payment.escrowStatus': 'none'
        }
      }
    );
    await queueMarketplaceForServiceRequest(request, schema, formData);
    return {
      paymentRequired: false,
      amount,
      status: amount <= 0 ? 'not_required' : 'skipped'
    };
  }

  await ServiceRequest.updateOne(
    { _id: request._id },
    {
      $set: {
        'payment.amount': amount,
        'payment.status': 'pending',
        'payment.escrowStatus': 'none',
        'payment.marketplaceQueued': false
      }
    }
  );

  return { paymentRequired: true, amount, status: 'pending' };
}

async function createPaymentOrder(requestCode) {
  const request = await ServiceRequest.findOne({ requestCode });
  if (!request) return { ok: false, status: 404, message: 'Request not found' };

  if (request.payment?.status === 'paid' || request.payment?.status === 'skipped' || request.payment?.status === 'not_required') {
    return {
      ok: true,
      alreadyPaid: true,
      paymentRequired: false,
      data: { requestCode, amount: request.payment?.amount || 0 }
    };
  }

  if (isPaymentBypassed()) {
    return { ok: false, status: 400, message: 'Payment gateway not configured; set SERVICE_REQUEST_SKIP_PAYMENT=true for dev' };
  }

  const amount = Number(request.payment?.amount) || 0;
  if (amount <= 0) {
    return { ok: false, status: 400, message: 'No payable amount on this request' };
  }

  if (request.payment?.razorpayOrderId) {
    const existing = await razorpayService.getOrderDetails(request.payment.razorpayOrderId);
    if (existing.success && existing.order?.status !== 'paid') {
      return {
        ok: true,
        data: {
          requestCode,
          amount,
          orderId: existing.order.id,
          currency: 'INR',
          key: process.env.RAZORPAY_KEY_ID
        }
      };
    }
  }

  const receipt = `sr_${request.requestCode}_${Date.now()}`.slice(0, 40);
  const order = await razorpayService.createOrder(amount, 'INR', receipt, {
    type: 'service_request',
    requestCode: request.requestCode,
    serviceRequestId: String(request._id)
  });

  if (!order.success) {
    return { ok: false, status: 502, message: order.error || 'Failed to create payment order' };
  }

  await ServiceRequest.updateOne(
    { _id: request._id },
    { $set: { 'payment.razorpayOrderId': order.orderId, 'payment.status': 'pending' } }
  );

  return {
    ok: true,
    data: {
      requestCode,
      amount,
      orderId: order.orderId,
      currency: 'INR',
      key: process.env.RAZORPAY_KEY_ID
    }
  };
}

async function markPaidAndActivateMarketplace(request, schema, formData, paymentMeta) {
  await ServiceRequest.updateOne(
    { _id: request._id },
    {
      $set: {
        'payment.status': 'paid',
        'payment.razorpayOrderId': paymentMeta.orderId,
        'payment.razorpayPaymentId': paymentMeta.paymentId,
        'payment.paidAt': new Date(),
        'payment.escrowStatus': 'held'
      }
    }
  );
  request.payment = {
    ...request.payment,
    status: 'paid',
    escrowStatus: 'held',
    marketplaceQueued: request.payment?.marketplaceQueued
  };
  await queueMarketplaceForServiceRequest(request, schema, formData);
  try {
    const { dispatchUserServiceRequestPaid } = require('./marketplaceNotify.service');
    await dispatchUserServiceRequestPaid({
      request: { ...request.toObject?.() || request, payment: { ...request.payment, status: 'paid', amount: request.payment?.amount } },
      schema,
      paymentMeta
    });
  } catch (e) {
    console.warn('[serviceRequestPayment] user notify failed', e.message);
  }
}

async function verifyServiceRequestPayment(requestCode, { orderId, paymentId, signature }, formDataFallback = {}) {
  const request = await ServiceRequest.findOne({ requestCode });
  if (!request) return { ok: false, status: 404, message: 'Request not found' };

  if (request.payment?.status === 'paid') {
    return { ok: true, alreadyPaid: true, message: 'Payment already recorded' };
  }

  if (!razorpayService.verifyPayment(orderId, paymentId, signature)) {
    await ServiceRequest.updateOne({ _id: request._id }, { $set: { 'payment.status': 'failed' } });
    return { ok: false, status: 400, message: 'Invalid payment signature' };
  }

  const FormSchema = require('../models/FormSchema');
  const schema = await FormSchema.findOne({ subCatCode: request.subCatCode, isActive: true });
  if (!schema) {
    return { ok: false, status: 500, message: 'Form schema missing for request' };
  }

  const formData = { ...request.formData, ...formDataFallback };

  await markPaidAndActivateMarketplace(request, schema, formData, {
    orderId,
    paymentId
  });

  try {
    await Transaction.create({
      userId: request.userId || null,
      type: 'payment',
      amount: Number(request.payment?.amount) || 0,
      status: 'completed',
      paymentMethod: 'razorpay',
      description: `Service request ${request.requestCode} — escrow held until completion`,
      metadata: {
        escrow: 'held',
        requestCode: request.requestCode,
        subCatCode: request.subCatCode,
        categoryCode: request.categoryCode,
        razorpayPaymentId: paymentId
      }
    });
  } catch (txnErr) {
    console.warn('[serviceRequestPayment] escrow audit txn failed:', txnErr.message);
  }

  return { ok: true, message: 'Payment verified. Vendors will be notified shortly.' };
}

/**
 * When all ops jobs on a project are done, release remaining escrow to vendor wallet (minus engineer payouts).
 */
async function releaseVendorEscrowIfProjectComplete(projectId) {
  const project = await VendorOpsProject.findById(projectId).select('opportunityId vendorId status progress').lean();
  if (!project || project.progress < 100 || project.status !== 'completed') return { skipped: true };

  let opportunity = null;
  if (project.opportunityId) {
    opportunity = await Opportunity.findById(project.opportunityId).select('assignment.serviceRequestId').lean();
  }
  const srId = opportunity?.assignment?.serviceRequestId;
  if (!srId) return { skipped: true };

  const sr = await ServiceRequest.findById(srId);
  if (!sr || sr.payment?.escrowStatus !== 'held' || sr.payment?.status !== 'paid') return { skipped: true };

  const gross = Number(sr.payment.amount) || 0;
  if (gross <= 0) return { skipped: true };

  const jobs = await VendorOpsJob.find({ projectId }).select('engineerPayout payoutStatus budget').lean();
  let engineerTotal = 0;
  for (const j of jobs) {
    if (j.payoutStatus === 'credited' && j.engineerPayout > 0) {
      engineerTotal += Number(j.engineerPayout);
    }
  }
  if (!engineerTotal && jobs.length) {
    const pct = await getEngineerPayoutPercent();
    engineerTotal = jobs.reduce((sum, j) => sum + Math.round((Number(j.budget) || 0) * pct) / 100, 0);
  }

  const Settings = require('../models/Settings');
  const settings = await Settings.findOne().select('platformFeePercentage servicePayoutPercentage').lean();
  const platformPct = Number(settings?.platformFeePercentage);
  const platformFee = Math.round((gross * (Number.isFinite(platformPct) ? platformPct : 1)) / 100);
  const vendorShare = Math.max(0, gross - engineerTotal - platformFee);
  const vendorId = project.vendorId;

  const dup = await Transaction.findOne({
    vendorId,
    type: 'earnings_credit',
    'metadata.serviceRequestId': String(sr._id),
    status: 'completed'
  }).lean();
  if (dup) {
    await ServiceRequest.updateOne(
      { _id: sr._id },
      { $set: { 'payment.escrowStatus': 'released', 'payment.vendorEscrowReleasedAt': new Date() } }
    );
    return { skipped: true, alreadyReleased: true };
  }

  const vendor = await Vendor.findById(vendorId);
  if (!vendor) return { skipped: true, message: 'Vendor not found' };

  if (!vendor.wallet) vendor.wallet = {};
  const before = Number(vendor.wallet.earnings) || 0;
  vendor.wallet.earnings = before + vendorShare;
  await vendor.save();

  await Transaction.create({
    vendorId,
    type: 'earnings_credit',
    amount: vendorShare,
    status: 'completed',
    paymentMethod: 'system',
    description: `Service request ${sr.requestCode} — vendor share after job completion`,
    metadata: {
      serviceRequestId: String(sr._id),
      projectId: String(projectId),
      categoryCode: sr.categoryCode,
      subCatCode: sr.subCatCode,
      grossCustomerPayment: gross,
      engineerPayoutTotal: engineerTotal,
      platformFee,
      platformFeePercentage: Number.isFinite(platformPct) ? platformPct : 1,
      source: 'service_request_escrow'
    }
  });

  // Per-service finance ledger (Vendor Finance UI)
  try {
    const { postVendorFinanceLedger } = require('./vendorFinanceLedger.service');
    const projectDoc = await VendorOpsProject.findById(projectId)
      .select('projectCode serviceCategoryCode serviceCategoryName')
      .lean();
    await postVendorFinanceLedger({
      vendorId,
      type: 'escrow_release',
      amount: vendorShare,
      description: `Escrow released — ${sr.categoryName || sr.categoryCode} / ${sr.subCategoryName || sr.subCatCode}`,
      projectCode: projectDoc?.projectCode || '',
      referenceCode: sr.requestCode,
      serviceCategoryCode: sr.categoryCode || projectDoc?.serviceCategoryCode,
      serviceCategoryName: sr.categoryName || projectDoc?.serviceCategoryName || '',
      subCatCode: sr.subCatCode,
      subCategoryName: sr.subCategoryName || '',
      source: 'service_request_escrow'
    });
  } catch (ledgerErr) {
    console.warn('[escrow] finance ledger write failed:', ledgerErr.message);
  }

  await ServiceRequest.updateOne(
    { _id: sr._id },
    {
      $set: {
        'payment.escrowStatus': 'released',
        'payment.vendorEscrowReleasedAt': new Date(),
        'payment.settlement': {
          customerPaid: gross,
          engineerTotal,
          platformFee,
          vendorShare,
          settledAt: new Date()
        }
      },
      status: 'Completed'
    }
  );

  return { ok: true, vendorShare, engineerTotal, gross };
}

/**
 * Refund customer escrow when marketplace assignment fails (no vendor / queue exhausted).
 */
async function refundEscrowOnAssignmentFailure(serviceRequestId, { reason = 'assignment_failed', opportunityId = null } = {}) {
  const sr = await ServiceRequest.findById(serviceRequestId);
  if (!sr) return { skipped: true, reason: 'not_found' };
  if (sr.payment?.escrowStatus !== 'held' || sr.payment?.status !== 'paid') {
    return { skipped: true, reason: 'no_held_escrow' };
  }

  const amount = Number(sr.payment.amount) || 0;
  const paymentId = sr.payment.razorpayPaymentId;

  if (paymentId && !isPaymentBypassed()) {
    const refundResult = await razorpayService.refundPayment(paymentId, amount > 0 ? amount : null, {
      type: 'service_request_assignment_failed',
      requestCode: sr.requestCode,
      reason: String(reason).slice(0, 200),
      opportunityId: opportunityId ? String(opportunityId) : ''
    });
    if (!refundResult.success) {
      console.error('[serviceRequestPayment] Razorpay refund failed:', refundResult.error);
      return { ok: false, error: refundResult.error || 'refund_failed' };
    }
  }

  await ServiceRequest.updateOne(
    { _id: sr._id, 'payment.escrowStatus': 'held' },
    {
      $set: {
        'payment.escrowStatus': 'refunded',
        status: 'Cancelled'
      }
    }
  );

  try {
    if (sr.userId) {
      const { sendNotificationToUser } = require('./firebaseAdmin');
      await sendNotificationToUser(sr.userId, {
        title: 'Refund initiated',
        body: `We could not assign a provider for ${sr.requestCode}. Your payment will be refunded.`,
        data: { type: 'payment_refunded', requestCode: sr.requestCode || '' }
      });
    }
  } catch (_) {}

  return { ok: true, refunded: amount };
}

module.exports = {
  isPaymentBypassed,
  resolvePayableAmount,
  initializePaymentForNewRequest,
  createPaymentOrder,
  verifyServiceRequestPayment,
  releaseVendorEscrowIfProjectComplete,
  refundEscrowOnAssignmentFailure
};
