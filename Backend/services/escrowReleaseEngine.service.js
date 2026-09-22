/**
 * Config-driven escrow hold / milestone release (no hardcoded service splits).
 * Rules source: ServiceConfig.paymentRules + commissionRules, with Settings fallback.
 */
const EscrowLedger = require('../models/EscrowLedger');
const ServiceConfig = require('../models/ServiceConfig');
const Settings = require('../models/Settings');
const Transaction = require('../models/Transaction');
const Vendor = require('../models/Vendor');
const Engineer = require('../models/Engineer');
const VendorOpsProject = require('../models/VendorOpsProject');
const VendorOpsMilestone = require('../models/VendorOpsMilestone');
const VendorOpsJob = require('../models/VendorOpsJob');
const { postVendorFinanceLedger } = require('./vendorFinanceLedger.service');
const { getEngineerPayoutPercent } = require('./opsJobPayout.service');

const DEFAULT_PAYMENT_RULES = {
  releaseTrigger: 'qa_passed',
  platformCommissionPercent: 1,
  gstPercent: 0,
  engineerSharePercent: 40,
  vendorSharePercent: 60
};

const hasOwnGstPercent = (rules) => !!rules && Object.prototype.hasOwnProperty.call(rules, 'gstPercent');

/**
 * @param {number|null} fallbackGstPercent - Used ONLY when no category config explicitly
 *   sets gstPercent. B2B callers pass the company's charge-side deduction-rule GST here
 *   so the payout-side deduction defaults to the same rate instead of silently 0.
 */
async function resolvePaymentRules(categoryCode, configSnapshot = null, fallbackGstPercent = null) {
  if (configSnapshot?.paymentRules && Object.keys(configSnapshot.paymentRules).length) {
    const merged = { ...DEFAULT_PAYMENT_RULES, ...configSnapshot.paymentRules };
    if (!hasOwnGstPercent(configSnapshot.paymentRules) && fallbackGstPercent != null) {
      merged.gstPercent = fallbackGstPercent;
    }
    return merged;
  }
  const cfg = await ServiceConfig.findOne({
    categoryCode: String(categoryCode || '').toUpperCase(),
    isActive: true
  })
    .select('paymentRules commissionRules')
    .lean();
  const merged = {
    ...DEFAULT_PAYMENT_RULES,
    ...(cfg?.paymentRules || {}),
    ...(cfg?.commissionRules || {})
  };
  if (
    !hasOwnGstPercent(cfg?.paymentRules) &&
    !hasOwnGstPercent(cfg?.commissionRules) &&
    fallbackGstPercent != null
  ) {
    merged.gstPercent = fallbackGstPercent;
  }
  const settings = await Settings.findOne().select('platformFeePercentage servicePayoutPercentage').lean();
  if (settings?.platformFeePercentage != null && merged.platformCommissionPercent == null) {
    merged.platformCommissionPercent = Number(settings.platformFeePercentage);
  }
  if (settings?.servicePayoutPercentage != null && merged.engineerSharePercent == null) {
    merged.engineerSharePercent = Number(settings.servicePayoutPercentage);
  }
  return merged;
}

/** B2B-only: the charge-side GST rate the company was billed, to default the payout-side rate to. */
async function getB2BFallbackGstPercent(companyId) {
  if (!companyId) return null;
  try {
    const B2BDeductionRule = require('../models/B2BDeductionRule');
    const rule = await B2BDeductionRule.findOne({ companyId, isActive: true }).select('gstPercent').lean();
    const pct = Number(rule?.gstPercent);
    return Number.isFinite(pct) ? pct : null;
  } catch (_) {
    return null;
  }
}

function computeSplit(gross, rules) {
  const platformPct = Number(rules.platformCommissionPercent) || 0;
  const gstPct = Number(rules.gstPercent) || 0;
  const platformFee = Math.round((gross * platformPct) / 100);
  const gst = Math.round((gross * gstPct) / 100);
  const net = Math.max(0, gross - platformFee - gst);
  const engPct = Number(rules.engineerSharePercent) || 40;
  const vendorPct = Number(rules.vendorSharePercent) || 60;
  const engineerShare = Math.round((net * engPct) / 100);
  const vendorShare = Math.max(0, net - engineerShare);
  return { gross, platformFee, gst, net, engineerShare, vendorShare, platformPct, gstPct };
}

/**
 * B2B field job engineer payout from ServiceConfig paymentRules (replaces hardcoded platform %).
 */
async function computeB2BEngineerPayout(job, configSnapshot = null) {
  const gross = Math.max(0, Number(job.charge) || 0);
  if (gross <= 0) {
    return { engineerShare: 0, platformFee: 0, gst: 0, net: 0, rules: DEFAULT_PAYMENT_RULES };
  }

  let categoryCode = null;
  try {
    const { resolveCategoryCode } = require('../utils/createOpportunityFromEnquiry');
    categoryCode = await resolveCategoryCode({
      enquiryType: 'b2b',
      equipmentType: [job.service, job.subService].filter(Boolean)
    });
  } catch (_) {
    categoryCode = null;
  }

  const fallbackGstPercent = await getB2BFallbackGstPercent(job.companyId);
  const rules = await resolvePaymentRules(categoryCode, configSnapshot, fallbackGstPercent);
  const split = computeSplit(gross, rules);
  return {
    engineerShare: split.engineerShare,
    platformFee: split.platformFee,
    gst: split.gst,
    net: split.net,
    platformCommissionPercent: split.platformPct,
    rules,
    categoryCode
  };
}

/**
 * Record escrow hold against a project / opportunity (after customer payment).
 */
async function lockEscrowForProject({
  projectId,
  opportunityId,
  grossAmount,
  paymentId = null,
  categoryCode = '',
  configSnapshot = null
}) {
  const gross = Math.max(0, Number(grossAmount) || 0);
  if (!projectId || gross <= 0) return { skipped: true, reason: 'invalid_input' };

  const dup = await EscrowLedger.findOne({
    sourceType: 'project',
    sourceId: projectId,
    status: { $in: ['held', 'partial_release'] }
  }).lean();
  if (dup) return { skipped: true, alreadyHeld: true, ledgerId: dup._id };

  const ledger = await EscrowLedger.create({
    paymentId: paymentId || projectId,
    sourceType: 'project',
    sourceId: projectId,
    grossAmount: gross,
    heldAmount: gross,
    releasedAmount: 0,
    status: 'held',
    releaseReason: opportunityId ? `opportunity:${opportunityId}` : 'project_escrow_lock'
  });

  await VendorOpsProject.updateOne(
    { _id: projectId },
    { $set: { paymentStatus: 'partial', currentStage: 'Escrow Locked' } }
  );

  return { ok: true, ledger, rules: await resolvePaymentRules(categoryCode, configSnapshot) };
}

/**
 * Release a milestone slice (% of contract) after QA / customer approval.
 */
async function releaseMilestoneEscrow({
  projectId,
  milestoneId,
  categoryCode,
  configSnapshot = null,
  actor = { id: null, role: 'system' }
}) {
  const project = await VendorOpsProject.findById(projectId).lean();
  if (!project) return { ok: false, status: 404, message: 'Project not found' };

  const milestone = await VendorOpsMilestone.findOne({ _id: milestoneId, projectId });
  if (!milestone) return { ok: false, status: 404, message: 'Milestone not found' };

  const { getPendingApprovalParty } = require('./milestoneApproval.service');
  const pending = getPendingApprovalParty(milestone, configSnapshot);
  if (pending) {
    return {
      ok: false,
      status: 428,
      code: 'APPROVAL_PENDING',
      pendingParty: pending.party,
      message: pending.message
    };
  }

  const pct = Number(milestone.paymentPercent) || 0;
  if (pct <= 0) {
    return { ok: false, status: 400, message: 'Milestone has no paymentPercent configured' };
  }

  const ledger = await EscrowLedger.findOne({
    sourceType: 'project',
    sourceId: projectId,
    status: { $in: ['held', 'partial_release'] }
  });
  if (!ledger) {
    return { ok: false, status: 400, message: 'No escrow ledger for this project' };
  }

  const remaining = Math.max(0, Number(ledger.heldAmount) - Number(ledger.releasedAmount));
  const contractGross = Number(ledger.grossAmount) || Number(project.budget) || 0;
  let slice = Math.round((contractGross * pct) / 100);
  slice = Math.min(slice, remaining);
  if (slice <= 0) return { skipped: true, reason: 'nothing_to_release' };

  const rules = await resolvePaymentRules(categoryCode || project.serviceCategoryCode, configSnapshot);
  const split = computeSplit(slice, rules);

  const vendorId = project.vendorId;
  const jobs = await VendorOpsJob.find({ projectId }).select('engineerPayout payoutStatus budget engineerId').lean();
  let engineerTotal = split.engineerShare;
  const credited = jobs.filter((j) => j.payoutStatus === 'credited' && j.engineerPayout > 0);
  if (credited.length) {
    engineerTotal = credited.reduce((s, j) => s + Number(j.engineerPayout), 0);
  } else if (jobs.length) {
    const pctEng = await getEngineerPayoutPercent();
    engineerTotal = Math.round((split.net * pctEng) / 100);
  }
  const vendorShare = Math.max(0, slice - split.platformFee - split.gst - engineerTotal);

  const idemKey = `milestone_release:${milestoneId}`;
  const dupTxn = await Transaction.findOne({ 'metadata.idempotencyKey': idemKey }).lean();
  if (dupTxn) return { skipped: true, alreadyReleased: true };

  const vendor = await Vendor.findById(vendorId);
  if (vendor) {
    if (!vendor.wallet) vendor.wallet = {};
    vendor.wallet.earnings = (Number(vendor.wallet.earnings) || 0) + vendorShare;
    await vendor.save();
  }

  await Transaction.create({
    vendorId,
    type: 'earnings_credit',
    amount: vendorShare,
    status: 'completed',
    paymentMethod: 'system',
    description: `Milestone escrow release — ${milestone.title} (${pct}%)`,
    metadata: {
      idempotencyKey: idemKey,
      projectId: String(projectId),
      milestoneId: String(milestoneId),
      milestoneCode: milestone.milestoneCode,
      sliceGross: slice,
      platformFee: split.platformFee,
      gst: split.gst,
      engineerTotal,
      vendorShare,
      paymentRules: rules,
      actorRole: actor.role
    }
  });

  try {
    await postVendorFinanceLedger({
      vendorId,
      type: 'escrow_release',
      amount: vendorShare,
      description: `Milestone ${milestone.milestoneCode || milestone.title} — ${pct}%`,
      projectCode: project.projectCode || '',
      serviceCategoryCode: project.serviceCategoryCode,
      serviceCategoryName: project.serviceCategoryName,
      source: 'escrow_milestone'
    });
  } catch (e) {
    console.warn('[escrowReleaseEngine] finance ledger:', e.message);
  }

  ledger.releasedAmount = (Number(ledger.releasedAmount) || 0) + slice;
  ledger.status = ledger.releasedAmount >= ledger.heldAmount ? 'released' : 'partial_release';
  ledger.releaseReason = `milestone:${milestoneId}`;
  await ledger.save();

  milestone.escrowReleasedAmount = (Number(milestone.escrowReleasedAmount) || 0) + vendorShare;
  milestone.status = 'completed';
  milestone.progress = 100;
  await milestone.save();

  const allMs = await VendorOpsMilestone.countDocuments({ projectId, status: { $ne: 'completed' } });
  if (!allMs) {
    await VendorOpsProject.updateOne(
      { _id: projectId },
      { $set: { paymentStatus: 'paid', status: 'completed', progress: 100, currentStage: 'Closed' } }
    );
  }

  return {
    ok: true,
    released: slice,
    vendorShare,
    engineerTotal,
    platformFee: split.platformFee,
    gst: split.gst,
    ledgerStatus: ledger.status
  };
}

/**
 * True B2B corporate escrow: move Available → Escrow Locked on the company wallet,
 * write EscrowLedger, and record an audit trail. Idempotent per job.
 */
async function holdB2BJobEscrow({ companyId, jobId, amount, remark = '' } = {}) {
  const B2BJob = require('../models/B2BJob');
  const PaymentAuditLog = require('../models/PaymentAuditLog');

  const amt = Math.max(0, Number(amount) || 0);
  if (!companyId || !jobId || amt <= 0) {
    return { ok: false, reason: 'invalid_input' };
  }

  const existing = await EscrowLedger.findOne({
    sourceType: 'b2b_job',
    sourceId: jobId,
    status: { $in: ['held', 'partial_release', 'released'] }
  }).lean();
  if (existing) {
    return { ok: true, alreadyHeld: true, ledgerId: existing._id, amount: existing.heldAmount };
  }

  // The wallet ledger moves Available → Reserved and writes the transaction
  // row in one database transaction; nothing else may touch the balances.
  const walletLedger = require('./b2bWalletLedger.service');
  let reservation;
  try {
    reservation = await walletLedger.reserve({
      companyId,
      amount: amt,
      reservationId: `JOB-${jobId}`,
      jobId,
      idempotencyKey: `job-reservation:${jobId}`,
      remark: remark || 'Escrow hold for B2B job'
    });
  } catch (err) {
    if (err.code === 'INSUFFICIENT_FUNDS') {
      return { ok: false, reason: 'insufficient_balance', amount: amt, shortfall: err.details };
    }
    throw err;
  }
  const wallet = { balance: reservation.balance.available, escrowBalance: reservation.balance.reserved };

  const ledger = await EscrowLedger.create({
    paymentId: jobId,
    sourceType: 'b2b_job',
    sourceId: jobId,
    grossAmount: amt,
    heldAmount: amt,
    releasedAmount: 0,
    refundedAmount: 0,
    status: 'held',
    releaseReason: remark || `b2b_hold:${jobId}`
  });

  await B2BJob.updateOne(
    { _id: jobId },
    {
      $set: {
        paymentStatus: 'escrow_locked',
        payoutStatus: 'none',
        walletStatus: 'reserved',
        walletReservationId: `JOB-${jobId}`,
        paymentReference: reservation.transaction._id,
        paymentMode: reservation.transaction.paymentMode || 'REAL'
      }
    }
  );

  try {
    const EnterpriseProjectFlow = require('../models/EnterpriseProjectFlow');
    await EnterpriseProjectFlow.updateOne(
      { b2bJobId: jobId },
      {
        $set: {
          'escrow.grossAmount': amt,
          'escrow.heldAmount': amt,
          'escrow.releasedAmount': 0,
          'escrow.status': 'held'
        }
      }
    );
  } catch (_) {
    /* flow may not exist yet */
  }

  try {
    await PaymentAuditLog.create({
      actorRole: 'system',
      action: 'b2b_escrow_hold',
      targetType: 'b2b_job',
      targetId: String(jobId),
      meta: { companyId: String(companyId), amount: amt, ledgerId: String(ledger._id) }
    });
  } catch (_) {
    /* non-blocking */
  }

  return {
    ok: true,
    ledgerId: ledger._id,
    amount: amt,
    balance: wallet.balance,
    escrowBalance: wallet.escrowBalance
  };
}

/**
 * Reverse a held escrow back to company Available balance.
 */
async function refundB2BJobEscrow({ jobId, reason = 'job_cancelled' } = {}) {
  const B2BJob = require('../models/B2BJob');
  const PaymentAuditLog = require('../models/PaymentAuditLog');

  if (!jobId) return { ok: false, reason: 'invalid_input' };

  const ledger = await EscrowLedger.findOne({
    sourceType: 'b2b_job',
    sourceId: jobId,
    status: { $in: ['held', 'partial_release'] }
  });
  if (!ledger) {
    const already = await EscrowLedger.findOne({
      sourceType: 'b2b_job',
      sourceId: jobId,
      status: 'refunded'
    }).lean();
    if (already) return { ok: true, alreadyRefunded: true };
    return { ok: false, reason: 'no_held_ledger' };
  }

  const remaining = Math.max(
    0,
    Number(ledger.heldAmount) - Number(ledger.releasedAmount) - Number(ledger.refundedAmount || 0)
  );
  if (remaining <= 0) {
    ledger.status = 'refunded';
    ledger.releaseReason = reason;
    await ledger.save();
    return { ok: true, amount: 0 };
  }

  const job = await B2BJob.findById(jobId).select('companyId jobId').lean();
  if (!job?.companyId) return { ok: false, reason: 'job_not_found' };

  // Reserved → Available through the ledger, so the release is recorded.
  const walletLedger = require('./b2bWalletLedger.service');
  let released;
  try {
    released = await walletLedger.release({
      companyId: job.companyId,
      amount: remaining,
      reservationId: `JOB-${jobId}`,
      jobId,
      remark: reason || `Escrow refund for ${job.jobId}`
    });
  } catch (err) {
    if (err.code === 'RESERVATION_TOO_SMALL') {
      // Legacy jobs whose money was spent without ever being reserved: credit
      // the refund instead of releasing a hold that was never recorded.
      released = await walletLedger.refund({
        companyId: job.companyId,
        amount: remaining,
        jobId,
        remark: `${reason || 'Escrow refund'} (legacy job with no recorded hold)`
      });
    } else {
      throw err;
    }
  }
  const wallet = { balance: released.balance.available, escrowBalance: released.balance.reserved };

  ledger.refundedAmount = (Number(ledger.refundedAmount) || 0) + remaining;
  ledger.status = 'refunded';
  ledger.releaseReason = reason;
  await ledger.save();

  await B2BJob.updateOne(
    { _id: jobId },
    {
      $set: {
        paymentStatus: 'refunded',
        payoutStatus: 'refunded',
        walletStatus: 'refunded'
      }
    }
  );

  try {
    const EnterpriseProjectFlow = require('../models/EnterpriseProjectFlow');
    await EnterpriseProjectFlow.updateOne(
      { b2bJobId: jobId },
      { $set: { 'escrow.status': 'refunded', 'escrow.heldAmount': 0 } }
    );
  } catch (_) {
    /* ignore */
  }

  try {
    await PaymentAuditLog.create({
      actorRole: 'system',
      action: 'b2b_escrow_refund',
      targetType: 'b2b_job',
      targetId: String(jobId),
      meta: { amount: remaining, reason }
    });
  } catch (_) {
    /* ignore */
  }

  try {
    const { emit } = require('./notification/notificationOrchestrator.service');
    await emit('invoice_generated', {
      targets: { b2bCompanyId: job.companyId },
      data: {
        message: `Escrow of ₹${remaining} refunded to company wallet (${reason})`,
        amount: remaining,
        jobId: String(jobId)
      },
      channels: ['in_app'],
      dedupeKey: `escrow_refunded:${jobId}`
    });
  } catch (_) {
    /* ignore */
  }

  return {
    ok: true,
    amount: remaining,
    balance: wallet.balance,
    escrowBalance: wallet.escrowBalance
  };
}

async function resolveVendorForB2BJob(job, flow) {
  const Opportunity = require('../models/Opportunity');
  const VendorOpsProject = require('../models/VendorOpsProject');

  // The vendor holding the job is authoritative: it accepted the job and its
  // engineer did the work, so the release is credited to the vendor.
  if (job?.assignedVendorId) return job.assignedVendorId;
  if (flow?.vendorId) return flow.vendorId;
  if (flow?.opportunityId) {
    const opp = await Opportunity.findById(flow.opportunityId)
      .select('awardedTo assignment.vendorQueue')
      .lean();
    if (opp?.awardedTo?.vendorId) return opp.awardedTo.vendorId;
    const accepted = (opp?.assignment?.vendorQueue || []).find((q) => q.status === 'accepted');
    if (accepted?.vendorId) return accepted.vendorId;
  }
  if (flow?.vendorOpsProjectId) {
    const project = await VendorOpsProject.findById(flow.vendorOpsProjectId).select('vendorId').lean();
    if (project?.vendorId) return project.vendorId;
  }
  return null;
}

/**
 * Release held B2B escrow after approvals.
 * engineer_direct  → credit Engineer Wallet (engineerShare); platform/GST retained
 * vendor_marketplace → credit VendorFinanceWallet with net; vendor pays engineers later
 */
async function releaseB2BJobEscrowPayment({ jobId, actor = { id: null, role: 'system' } } = {}) {
  const B2BJob = require('../models/B2BJob');
  const Transaction = require('../models/Transaction');
  const PaymentAuditLog = require('../models/PaymentAuditLog');
  const EnterpriseProjectFlow = require('../models/EnterpriseProjectFlow');

  if (!jobId) return { ok: false, reason: 'invalid_input' };

  const idemKey = `b2b_job_release:${jobId}`;
  const dupTxn = await Transaction.findOne({ 'metadata.idempotencyKey': idemKey }).lean();
  if (dupTxn) return { ok: true, alreadyReleased: true, skipped: true };

  const job = await B2BJob.findById(jobId);
  if (!job) return { ok: false, reason: 'job_not_found' };

  const fundedStatuses = ['escrow_locked', 'deducted'];
  if (job.paymentStatus === 'released') {
    return { ok: true, alreadyReleased: true, skipped: true };
  }
  if (job.paymentStatus === 'refunded') {
    return { ok: false, reason: 'already_refunded' };
  }

  let ledger = await EscrowLedger.findOne({
    sourceType: 'b2b_job',
    sourceId: jobId,
    status: { $in: ['held', 'partial_release'] }
  });

  // Legacy: job marked deducted but no ledger — create held ledger from charge without double-moving wallet
  if (!ledger && fundedStatuses.includes(job.paymentStatus) && Number(job.charge) > 0) {
    ledger = await EscrowLedger.create({
      paymentId: jobId,
      sourceType: 'b2b_job',
      sourceId: jobId,
      grossAmount: job.charge,
      heldAmount: job.charge,
      releasedAmount: 0,
      status: 'held',
      releaseReason: `legacy_hold:${job.jobId}`
    });
  }
  if (!ledger) return { ok: false, reason: 'no_held_ledger' };

  const remaining = Math.max(0, Number(ledger.heldAmount) - Number(ledger.releasedAmount));
  if (remaining <= 0) {
    ledger.status = 'released';
    await ledger.save();
    return { ok: true, skipped: true, reason: 'nothing_to_release' };
  }

  const flow = await EnterpriseProjectFlow.findOne({ b2bJobId: jobId });
  const fallbackGstPercent = await getB2BFallbackGstPercent(job.companyId);
  const rules = await resolvePaymentRules(flow?.categoryCode, flow?.configSnapshot, fallbackGstPercent);
  // Payout must follow WHO ACTUALLY DID THE WORK, not a static config flag.
  //
  // Previously the mode came only from ServiceConfig.paymentRules.assignmentMode,
  // which is unset on all 24 live ServiceConfigs — so every job defaulted to
  // 'engineer_direct'. Meanwhile 45 opportunities had genuinely been awarded to
  // vendors through the marketplace fallback. Those vendors would have been paid
  // nothing, and where B2BJob.assignedTo was null the release aborted with
  // 'engineer_not_assigned', stranding the money in escrow.
  //
  // Resolution order:
  //   1. An explicitly configured mode still wins (deliberate business override).
  //   2. Otherwise, if a vendor actually won/accepted this job → vendor_marketplace.
  //   3. Otherwise, if an engineer is assigned → engineer_direct.
  const configuredRaw = String(rules.assignmentMode || rules.marketplaceMode || '').toLowerCase();
  const configuredMode = configuredRaw
    ? (configuredRaw === 'vendor_marketplace' || configuredRaw === 'vendor_first'
        ? 'vendor_marketplace'
        : 'engineer_direct')
    : null;

  const executingVendorId = await resolveVendorForB2BJob(job, flow);
  const detectedMode = executingVendorId
    ? 'vendor_marketplace'
    : (job.assignedTo ? 'engineer_direct' : null);

  const mode = configuredMode || detectedMode || 'engineer_direct';

  if (!configuredMode && detectedMode) {
    console.info(
      `[escrow] ${job.jobId}: payout mode resolved from executor → ${detectedMode}` +
        (executingVendorId ? ` (vendor ${executingVendorId})` : ` (engineer ${job.assignedTo})`)
    );
  }
  const split = computeSplit(remaining, rules);

  let creditedTo = null;
  let creditAmount = 0;

  if (mode === 'vendor_marketplace') {
    // Already resolved above when detecting the executor; re-resolve only if the
    // mode was force-configured without a detected vendor.
    const vendorId = executingVendorId || (await resolveVendorForB2BJob(job, flow));
    if (!vendorId) {
      return { ok: false, reason: 'vendor_not_assigned', status: 428 };
    }
    // Enterprise default: vendor receives net; pays engineers via pay-worker
    creditAmount = split.net;
    await postVendorFinanceLedger({
      vendorId,
      type: 'escrow_release',
      amount: creditAmount,
      description: `B2B escrow release — ${job.jobId}`,
      projectCode: job.jobId,
      referenceCode: idemKey,
      serviceCategoryCode: flow?.categoryCode || '',
      source: 'b2b_escrow'
    });
    creditedTo = { role: 'vendor', id: vendorId, amount: creditAmount };

    try {
      const { emit } = require('./notification/notificationOrchestrator.service');
      await emit('payment_released', {
        targets: { vendorId },
        data: {
          amount: creditAmount,
          paymentId: String(jobId),
          txnId: idemKey,
          message: `₹${creditAmount} released to your wallet for ${job.jobId}`
        },
        channels: ['in_app', 'push'],
        dedupeKey: `payment_released:${jobId}:${vendorId}`
      });
    } catch (_) {
      /* ignore */
    }
  } else {
    // engineer_direct — credit Engineer.wallet.balance, the SAME field Flow 2's
    // opsJobPayout.service.js credits and the only one the engineer wallet
    // screen (GET /api/engineers/wallet) actually reads. The standalone `Wallet`
    // model (ownerType:'engineer') this used to credit is never read by that
    // screen, so money released here was previously invisible to the engineer.
    const engineerId = job.assignedTo;
    if (!engineerId) {
      return { ok: false, reason: 'engineer_not_assigned', status: 428 };
    }
    creditAmount = split.engineerShare;

    const engineer = await Engineer.findById(engineerId);
    if (!engineer) {
      return { ok: false, reason: 'engineer_not_found', status: 404 };
    }
    if (!engineer.wallet) {
      engineer.wallet = { balance: 0, totalEarnings: 0, withdrawnAmount: 0, pendingBalance: 0 };
    }
    engineer.wallet.balance = (Number(engineer.wallet.balance) || 0) + creditAmount;
    engineer.wallet.totalEarnings = (Number(engineer.wallet.totalEarnings) || 0) + creditAmount;
    await engineer.save();

    creditedTo = { role: 'engineer', id: engineerId, amount: creditAmount };

    try {
      if (global.io) {
        const payload = {
          amount: creditAmount,
          balanceAfter: engineer.wallet.balance,
          jobId: job.jobId,
          message: `₹${creditAmount.toLocaleString('en-IN')} credited to your wallet`
        };
        global.io.to(`engineer:${engineerId}`).emit('wallet:credited', payload);
        global.io.to(`engineer:${engineerId}`).emit('wallet:updated', payload);
      }
    } catch (_) {
      /* non-blocking */
    }
  }

  // Move company Reserved → spent (the money leaves the company for good).
  // The ledger books the charge and its row together.
  const walletLedger = require('./b2bWalletLedger.service');
  let charged = null;
  try {
    charged = await walletLedger.charge({
      companyId: job.companyId,
      amount: remaining,
      reservationId: `JOB-${jobId}`,
      jobId,
      idempotencyKey: `job-charge:${jobId}`,
      remark: `Escrow released (${mode}) for ${job.jobId}`
    });
  } catch (err) {
    // Legacy jobs deducted before escrow existed hold nothing in reserve; the
    // money already left the wallet, so there is nothing further to charge.
    if (err.code !== 'RESERVATION_TOO_SMALL') throw err;
    console.warn(`[Escrow] Job ${job.jobId} had no recorded hold to charge; leaving balances untouched.`);
  }

  ledger.releasedAmount = (Number(ledger.releasedAmount) || 0) + remaining;
  ledger.status = 'released';
  ledger.releaseReason = `job_completed_approved:${mode}`;
  await ledger.save();

  await B2BJob.updateOne(
    { _id: jobId },
    {
      $set: {
        paymentStatus: 'released',
        payoutStatus: 'released',
        walletStatus: charged ? 'charged' : 'released'
      }
    }
  );

  if (flow) {
    if (!flow.escrow) flow.escrow = {};
    flow.escrow.releasedAmount = ledger.releasedAmount;
    flow.escrow.heldAmount = 0;
    flow.escrow.status = 'released';
    await flow.save();
  }

  await Transaction.create({
    vendorId: creditedTo?.role === 'vendor' ? creditedTo.id : undefined,
    engineerId: creditedTo?.role === 'engineer' ? creditedTo.id : undefined,
    type: 'earnings_credit',
    amount: creditAmount,
    status: 'completed',
    paymentMethod: 'system',
    description: `B2B escrow release (${mode}) — ${job.jobId}`,
    metadata: {
      source: 'b2b_escrow',
      idempotencyKey: idemKey,
      jobId: String(jobId),
      mode,
      gross: remaining,
      platformFee: split.platformFee,
      gst: split.gst,
      engineerShare: split.engineerShare,
      vendorShare: split.vendorShare,
      net: split.net,
      creditedTo,
      actorRole: actor.role,
      actorId: actor.id
    }
  });

  try {
    await PaymentAuditLog.create({
      actorRole: actor.role === 'admin' ? 'admin' : 'system',
      actorId: actor.id || null,
      action: 'b2b_escrow_release',
      targetType: 'b2b_job',
      targetId: String(jobId),
      meta: { mode, remaining, creditedTo, split }
    });
  } catch (_) {
    /* ignore */
  }

  try {
    const { emit } = require('./notification/notificationOrchestrator.service');
    await emit('invoice_generated', {
      targets: { b2bCompanyId: job.companyId },
      data: {
        message: `Payment of ₹${remaining} released from escrow for job ${job.jobId}`,
        amount: remaining,
        jobId: String(jobId)
      },
      channels: ['in_app'],
      dedupeKey: `escrow_released_b2b:${jobId}`
    });
  } catch (_) {
    /* ignore */
  }

  return {
    ok: true,
    mode,
    released: remaining,
    creditedTo,
    platformFee: split.platformFee,
    gst: split.gst,
    ledgerStatus: 'released'
  };
}

module.exports = {
  DEFAULT_PAYMENT_RULES,
  resolvePaymentRules,
  computeSplit,
  computeB2BEngineerPayout,
  lockEscrowForProject,
  releaseMilestoneEscrow,
  holdB2BJobEscrow,
  refundB2BJobEscrow,
  releaseB2BJobEscrowPayment
};
