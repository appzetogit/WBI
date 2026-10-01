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
  // In production, missing gateway keys must not silently skip payment.
  if (process.env.NODE_ENV === 'production') return false;
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

const BUDGET_FIELDS = ['budget', 'budgetRange', 'estimatedBudget'];

/**
 * The catalogue price (basePrice) is the floor. A budget the customer types can
 * only raise the amount, and only when the form actually asks for one — otherwise
 * any client could post `budget: 1` and book a ₹2,499 service for ₹1.
 */
const resolvePayableAmount = (schema, formData = {}) => {
  const base = Number(schema?.basePrice);
  const basePrice = Number.isFinite(base) && base > 0 ? Math.round(base) : 0;
  const formFields = new Set((schema?.fields || []).map((f) => f.fieldName));
  const offered =
    BUDGET_FIELDS.filter((key) => formFields.has(key))
      .map((key) => parseBudgetNumber(formData[key]))
      .find(Boolean) || 0;
  return Math.max(basePrice, offered);
};

/** Settled payment states — nothing left for the customer to pay. */
const isSettledPaymentStatus = (status) => ['paid', 'skipped', 'not_required'].includes(status);

const knownOrderIds = (request) =>
  [...new Set([...(request.payment?.razorpayOrderIds || []), request.payment?.razorpayOrderId].filter(Boolean))];

/** Form schema used to build the marketplace payload; survives a schema being archived after payment. */
const schemaForRequest = async (request) => {
  const FormSchema = require('../models/FormSchema');
  const schema = await FormSchema.findOne({ subCatCode: request.subCatCode }).lean();
  return (
    schema || {
      categoryCode: request.categoryCode,
      categoryName: request.categoryName,
      subCatCode: request.subCatCode,
      subCategoryName: request.subCategoryName,
      basePrice: Number(request.payment?.amount) || 0,
      fields: []
    }
  );
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
    equipmentType: [schema.subCategoryName, schema.subCatCode].filter(Boolean),
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
  // Atomic claim: the client verify call and the Razorpay webhook can arrive
  // together, and only one of them may create the marketplace opportunity.
  const claim = await ServiceRequest.updateOne(
    { _id: request._id, 'payment.marketplaceQueued': { $ne: true } },
    { $set: { 'payment.marketplaceQueued': true } }
  );
  if (!claim.modifiedCount) return { alreadyQueued: true };
  queueOpportunityFromEnquiry(buildMarketplacePayload(request, schema, formData));
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

/**
 * Mark a captured Razorpay payment against the request (escrow held) and start
 * vendor matching. Shared by the client verify call, the Razorpay webhook and
 * reconciliation, and safe to run from all three at once: only the caller that
 * flips the status to 'paid' does the follow-up work.
 *
 * @param {object} payment Razorpay payment entity (amount in paise)
 */
async function settleCapturedPayment(request, payment, { source = 'client' } = {}) {
  if (!payment || payment.status !== 'captured') {
    return {
      ok: false,
      status: 409,
      processing: payment?.status === 'authorized',
      message:
        payment?.status === 'authorized'
          ? 'Payment received — confirming with the bank'
          : 'Payment has not been captured'
    };
  }
  if (!knownOrderIds(request).includes(payment.order_id)) {
    return { ok: false, status: 400, message: 'This payment does not belong to this request' };
  }

  const expectedPaise = Math.round((Number(request.payment?.amount) || 0) * 100);
  if (String(payment.currency || 'INR') !== 'INR' || Number(payment.amount) < expectedPaise) {
    console.error('[serviceRequestPayment] amount mismatch', {
      requestCode: request.requestCode,
      expectedPaise,
      paidPaise: payment.amount,
      paymentId: payment.id,
      source
    });
    return { ok: false, status: 400, message: 'Paid amount does not match this request' };
  }

  const paid = await ServiceRequest.findOneAndUpdate(
    { _id: request._id, 'payment.status': { $ne: 'paid' } },
    {
      $set: {
        'payment.status': 'paid',
        'payment.razorpayOrderId': payment.order_id,
        'payment.razorpayPaymentId': payment.id,
        'payment.paidAt': new Date(),
        'payment.escrowStatus': 'held'
      },
      $addToSet: { 'payment.razorpayOrderIds': payment.order_id }
    },
    { new: true }
  );
  if (!paid) return { ok: true, alreadyPaid: true, message: 'Payment already recorded' };

  const schema = await schemaForRequest(paid);
  await queueMarketplaceForServiceRequest(paid, schema, paid.formData || {});

  try {
    const { dispatchUserServiceRequestPaid } = require('./marketplaceNotify.service');
    await dispatchUserServiceRequestPaid({
      request: paid.toObject(),
      schema,
      paymentMeta: { orderId: payment.order_id, paymentId: payment.id }
    });
  } catch (e) {
    console.warn('[serviceRequestPayment] user notify failed', e.message);
  }

  try {
    await Transaction.create({
      userId: paid.userId || null,
      type: 'payment',
      amount: Number(paid.payment?.amount) || 0,
      status: 'completed',
      paymentMethod: 'razorpay',
      description: `Service request ${paid.requestCode} — escrow held until completion`,
      metadata: {
        escrow: 'held',
        requestCode: paid.requestCode,
        subCatCode: paid.subCatCode,
        categoryCode: paid.categoryCode,
        razorpayPaymentId: payment.id,
        razorpayOrderId: payment.order_id,
        settledBy: source
      }
    });
  } catch (txnErr) {
    console.warn('[serviceRequestPayment] escrow audit txn failed:', txnErr.message);
  }

  return { ok: true, message: 'Payment verified. Vendors will be notified shortly.' };
}

/**
 * Settle a request whose customer paid but whose verify call never reached us
 * (tab closed, network drop). Looks for a captured payment on any of its orders.
 */
async function reconcileServiceRequestPayment(request) {
  if (request.payment?.status === 'paid') return { ok: true, alreadyPaid: true };
  if (isPaymentBypassed()) return { ok: false, notPaid: true };

  for (const orderId of knownOrderIds(request)) {
    const res = await razorpayService.getOrderPayments(orderId);
    const captured = (res.payments || []).find((p) => p.status === 'captured');
    if (captured) return settleCapturedPayment(request, captured, { source: 'reconcile' });
  }
  return { ok: false, notPaid: true };
}

async function createPaymentOrder(requestCode) {
  const request = await ServiceRequest.findOne({ requestCode });
  if (!request) return { ok: false, status: 404, message: 'Request not found' };

  if (isSettledPaymentStatus(request.payment?.status)) {
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

  // Never charge twice: if an earlier attempt was paid, settle it instead.
  const settled = await reconcileServiceRequestPayment(request);
  if (settled.ok) {
    return {
      ok: true,
      alreadyPaid: true,
      paymentRequired: false,
      data: { requestCode, amount }
    };
  }

  if (request.payment?.razorpayOrderId) {
    const existing = await razorpayService.getOrderDetails(request.payment.razorpayOrderId);
    if (
      existing.success &&
      existing.order?.status !== 'paid' &&
      Number(existing.order?.amount) === Math.round(amount * 100)
    ) {
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
    { _id: request._id, 'payment.status': { $ne: 'paid' } },
    {
      $set: { 'payment.razorpayOrderId': order.orderId, 'payment.status': 'pending' },
      $addToSet: { 'payment.razorpayOrderIds': order.orderId }
    }
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

/**
 * An order belongs to the request when we stored it, or (orders created before
 * order ids were tracked) when the notes we set at creation name this request.
 */
async function orderBelongsToRequest(request, orderId) {
  if (!orderId) return false;
  if (knownOrderIds(request).includes(orderId)) return true;
  const res = await razorpayService.getOrderDetails(orderId);
  const notes = res.success ? res.order?.notes || {} : {};
  if (notes.type === 'service_request' && notes.requestCode === request.requestCode) {
    await ServiceRequest.updateOne(
      { _id: request._id },
      { $addToSet: { 'payment.razorpayOrderIds': orderId } }
    );
    request.payment.razorpayOrderIds = [...(request.payment.razorpayOrderIds || []), orderId];
    return true;
  }
  return false;
}

/**
 * Client-side confirmation after Razorpay checkout. The signature alone only proves
 * that *some* payment happened on our account, so the payment is also tied to this
 * request's order and its captured amount is checked against what the request costs.
 */
async function verifyServiceRequestPayment(requestCode, { orderId, paymentId, signature }) {
  const request = await ServiceRequest.findOne({ requestCode });
  if (!request) return { ok: false, status: 404, message: 'Request not found' };

  if (request.payment?.status === 'paid') {
    return { ok: true, alreadyPaid: true, message: 'Payment already recorded' };
  }

  if (!razorpayService.verifyPayment(orderId, paymentId, signature)) {
    return { ok: false, status: 400, message: 'Invalid payment signature' };
  }

  if (!(await orderBelongsToRequest(request, orderId))) {
    return { ok: false, status: 400, message: 'This payment does not belong to this request' };
  }

  const fetched = await razorpayService.getPaymentDetails(paymentId);
  if (!fetched.success || !fetched.payment) {
    return {
      ok: false,
      status: 502,
      message: 'Could not confirm the payment with Razorpay. Please refresh in a moment.'
    };
  }
  if (fetched.payment.order_id !== orderId) {
    return { ok: false, status: 400, message: 'This payment does not belong to this request' };
  }

  const result = await settleCapturedPayment(request, fetched.payment, { source: 'client' });
  // Authorised-but-not-captured settles via the payment.captured webhook / next reconcile.
  if (result.processing) return { ok: true, processing: true, message: result.message };
  return result;
}

/**
 * Razorpay `payment.captured` webhook. Returns null when the payment is not for a
 * service request, so the caller can try its other payment types.
 */
async function settleServiceRequestFromWebhook(payment) {
  if (!payment?.order_id) return null;
  const request = await ServiceRequest.findOne({
    $or: [
      { 'payment.razorpayOrderId': payment.order_id },
      { 'payment.razorpayOrderIds': payment.order_id }
    ]
  });
  if (!request) return null;
  return settleCapturedPayment(request, payment, { source: 'webhook' });
}

/**
 * Recovery: a request that is paid (or needs no payment) but never got a
 * marketplace opportunity, e.g. the process died between payment and queueing.
 */
async function ensureMarketplaceForServiceRequest(request) {
  const existing = await Opportunity.findOne({ 'assignment.serviceRequestId': request._id })
    .select('_id')
    .lean();
  if (existing) {
    await ServiceRequest.updateOne(
      { _id: request._id, opportunityId: null },
      { $set: { opportunityId: existing._id } }
    );
    return { linked: true, opportunityId: existing._id };
  }
  const { createOpportunityFromEnquiry } = require('../utils/createOpportunityFromEnquiry');
  const schema = await schemaForRequest(request);
  await ServiceRequest.updateOne({ _id: request._id }, { $set: { 'payment.marketplaceQueued': true } });
  const result = await createOpportunityFromEnquiry(
    buildMarketplacePayload(request, schema, request.formData || {})
  );
  return { created: true, opportunityId: result?.opportunity?._id || null };
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
 * Milestone escrow for a project is fully paid out: close the customer's request
 * and record the split, as the single-release path above does.
 */
async function markServiceRequestEscrowReleased(projectId) {
  const project = await VendorOpsProject.findById(projectId).select('opportunityId').lean();
  if (!project?.opportunityId) return { skipped: true };
  const opportunity = await Opportunity.findById(project.opportunityId)
    .select('assignment.serviceRequestId')
    .lean();
  const srId = opportunity?.assignment?.serviceRequestId;
  if (!srId) return { skipped: true };

  const releases = await Transaction.find({
    type: 'earnings_credit',
    'metadata.projectId': String(projectId),
    'metadata.idempotencyKey': /^milestone_release:/
  })
    .select('amount metadata')
    .lean();
  const sum = (pick) => releases.reduce((s, t) => s + (Number(pick(t)) || 0), 0);

  const res = await ServiceRequest.updateOne(
    { _id: srId, 'payment.escrowStatus': 'held' },
    {
      $set: {
        status: 'Completed',
        'payment.escrowStatus': 'released',
        'payment.vendorEscrowReleasedAt': new Date(),
        'payment.settlement': {
          customerPaid: sum((t) => t.metadata?.sliceGross),
          engineerTotal: sum((t) => t.metadata?.engineerTotal),
          platformFee: sum((t) => t.metadata?.platformFee),
          gst: sum((t) => t.metadata?.gst),
          vendorShare: sum((t) => t.amount),
          settledAt: new Date()
        }
      }
    }
  );
  return { ok: true, updated: res.modifiedCount > 0 };
}

/**
 * Refund customer escrow when marketplace assignment fails (no vendor / queue exhausted).
 */
async function refundEscrowOnAssignmentFailure(serviceRequestId, { reason = 'assignment_failed', opportunityId = null } = {}) {
  // Claim the escrow first so two callers (queue worker + recovery sweep, or two
  // servers on one DB) can never both send a refund.
  const sr = await ServiceRequest.findOneAndUpdate(
    { _id: serviceRequestId, 'payment.status': 'paid', 'payment.escrowStatus': 'held' },
    { $set: { 'payment.escrowStatus': 'refunding' } },
    { new: true }
  );
  if (!sr) {
    // Nothing held (free / skipped payment) — still close the request so the
    // customer does not see it "pending" forever.
    await ServiceRequest.updateOne(
      {
        _id: serviceRequestId,
        status: 'Pending',
        'payment.escrowStatus': { $nin: ['held', 'refunding', 'released'] }
      },
      { $set: { status: 'Cancelled' } }
    );
    return { skipped: true, reason: 'no_held_escrow' };
  }

  const amount = Number(sr.payment.amount) || 0;
  const paymentId = sr.payment.razorpayPaymentId;
  let refundId = null;

  if (paymentId && !isPaymentBypassed()) {
    // Idempotent: a previous attempt may have refunded before we could record it.
    const current = await razorpayService.getPaymentDetails(paymentId);
    const alreadyRefundedPaise = Number(current.payment?.amount_refunded) || 0;
    if (current.success && alreadyRefundedPaise >= Math.round(amount * 100)) {
      console.warn('[serviceRequestPayment] refund already present on Razorpay', sr.requestCode);
    } else {
      const refundResult = await razorpayService.refundPayment(paymentId, amount > 0 ? amount : null, {
        type: 'service_request_assignment_failed',
        requestCode: sr.requestCode,
        reason: String(reason).slice(0, 200),
        opportunityId: opportunityId ? String(opportunityId) : ''
      });
      if (!refundResult.success) {
        console.error('[serviceRequestPayment] Razorpay refund failed:', refundResult.error);
        // Hand the escrow back so the recovery sweep retries the refund.
        await ServiceRequest.updateOne(
          { _id: sr._id, 'payment.escrowStatus': 'refunding' },
          { $set: { 'payment.escrowStatus': 'held' } }
        );
        return { ok: false, error: refundResult.error || 'refund_failed' };
      }
      refundId = refundResult.refund?.id || null;
    }
  }

  await ServiceRequest.updateOne(
    { _id: sr._id, 'payment.escrowStatus': 'refunding' },
    {
      $set: {
        'payment.escrowStatus': 'refunded',
        'payment.razorpayRefundId': refundId,
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
  reconcileServiceRequestPayment,
  settleServiceRequestFromWebhook,
  ensureMarketplaceForServiceRequest,
  releaseVendorEscrowIfProjectComplete,
  markServiceRequestEscrowReleased,
  refundEscrowOnAssignmentFailure
};
