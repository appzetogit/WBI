/**
 * Config-driven escrow hold / milestone release (no hardcoded service splits).
 * Rules source: ServiceConfig.paymentRules + commissionRules, with Settings fallback.
 */
const EscrowLedger = require('../models/EscrowLedger');
const ServiceConfig = require('../models/ServiceConfig');
const Settings = require('../models/Settings');
const Transaction = require('../models/Transaction');
const Vendor = require('../models/Vendor');
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

async function resolvePaymentRules(categoryCode, configSnapshot = null) {
  if (configSnapshot?.paymentRules && Object.keys(configSnapshot.paymentRules).length) {
    return { ...DEFAULT_PAYMENT_RULES, ...configSnapshot.paymentRules };
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
  const settings = await Settings.findOne().select('platformFeePercentage servicePayoutPercentage').lean();
  if (settings?.platformFeePercentage != null && merged.platformCommissionPercent == null) {
    merged.platformCommissionPercent = Number(settings.platformFeePercentage);
  }
  if (settings?.servicePayoutPercentage != null && merged.engineerSharePercent == null) {
    merged.engineerSharePercent = Number(settings.servicePayoutPercentage);
  }
  return merged;
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

  const rules = await resolvePaymentRules(categoryCode, configSnapshot);
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
  const B2BWallet = require('../models/B2BWallet');
  const B2BWalletTransaction = require('../models/B2BWalletTransaction');
  const B2BCompany = require('../models/B2BCompany');
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

  const wallet = await B2BWallet.findOneAndUpdate(
    { companyId, balance: { $gte: amt } },
    {
      $inc: { balance: -amt, escrowBalance: amt },
      $set: { lastUpdatedAt: new Date() }
    },
    { new: true }
  );
  if (!wallet) {
    return { ok: false, reason: 'insufficient_balance', amount: amt };
  }

  await B2BCompany.findByIdAndUpdate(companyId, { walletBalance: wallet.balance });

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

  const txnId = `TXN-ESH-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  await B2BWalletTransaction.create({
    companyId,
    walletId: wallet._id,
    transactionId: txnId,
    type: 'escrow_hold',
    amount: -amt,
    totalAmount: -amt,
    status: 'success',
    paymentMethod: 'wallet',
    remark: remark || `Escrow hold for B2B job`,
    relatedJobIds: [jobId]
  });

  await B2BJob.updateOne(
    { _id: jobId },
    { $set: { paymentStatus: 'escrow_locked', payoutStatus: 'none' } }
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
  const B2BWallet = require('../models/B2BWallet');
  const B2BWalletTransaction = require('../models/B2BWalletTransaction');
  const B2BCompany = require('../models/B2BCompany');
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

  const wallet = await B2BWallet.findOneAndUpdate(
    { companyId: job.companyId, escrowBalance: { $gte: remaining } },
    {
      $inc: { balance: remaining, escrowBalance: -remaining },
      $set: { lastUpdatedAt: new Date() }
    },
    { new: true }
  );
  if (!wallet) {
    // Soft recover if escrowBalance was never tracked (legacy deducted jobs)
    const fallback = await B2BWallet.findOneAndUpdate(
      { companyId: job.companyId },
      {
        $inc: { balance: remaining },
        $set: { lastUpdatedAt: new Date() }
      },
      { new: true }
    );
    if (!fallback) return { ok: false, reason: 'wallet_not_found' };
    await B2BCompany.findByIdAndUpdate(job.companyId, { walletBalance: fallback.balance });
  } else {
    await B2BCompany.findByIdAndUpdate(job.companyId, { walletBalance: wallet.balance });
  }

  ledger.refundedAmount = (Number(ledger.refundedAmount) || 0) + remaining;
  ledger.status = 'refunded';
  ledger.releaseReason = reason;
  await ledger.save();

  const refreshed = await B2BWallet.findOne({ companyId: job.companyId });
  await B2BWalletTransaction.create({
    companyId: job.companyId,
    walletId: refreshed?._id,
    transactionId: `TXN-ESR-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
    type: 'escrow_refund',
    amount: remaining,
    totalAmount: remaining,
    status: 'success',
    paymentMethod: 'wallet',
    remark: reason || `Escrow refund for ${job.jobId}`,
    relatedJobIds: [jobId]
  });

  await B2BJob.updateOne(
    { _id: jobId },
    { $set: { paymentStatus: 'refunded', payoutStatus: 'refunded' } }
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
    balance: refreshed?.balance,
    escrowBalance: refreshed?.escrowBalance
  };
}

async function resolveVendorForB2BJob(job, flow) {
  const Opportunity = require('../models/Opportunity');
  const VendorOpsProject = require('../models/VendorOpsProject');

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
  const B2BWallet = require('../models/B2BWallet');
  const B2BWalletTransaction = require('../models/B2BWalletTransaction');
  const B2BCompany = require('../models/B2BCompany');
  const B2BJob = require('../models/B2BJob');
  const Wallet = require('../models/Wallet');
  const WalletTransaction = require('../models/WalletTransaction');
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
  const rules = await resolvePaymentRules(flow?.categoryCode, flow?.configSnapshot);
  const modeRaw = String(rules.assignmentMode || rules.marketplaceMode || 'engineer_direct').toLowerCase();
  const mode =
    modeRaw === 'vendor_marketplace' || modeRaw === 'vendor_first'
      ? 'vendor_marketplace'
      : 'engineer_direct';
  const split = computeSplit(remaining, rules);

  let creditedTo = null;
  let creditAmount = 0;

  if (mode === 'vendor_marketplace') {
    const vendorId = await resolveVendorForB2BJob(job, flow);
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
    // engineer_direct
    const engineerId = job.assignedTo;
    if (!engineerId) {
      return { ok: false, reason: 'engineer_not_assigned', status: 428 };
    }
    creditAmount = split.engineerShare;
    let engineerWallet = await Wallet.findOne({ ownerId: engineerId, ownerType: 'engineer' });
    if (!engineerWallet) {
      engineerWallet = await Wallet.create({ ownerId: engineerId, ownerType: 'engineer' });
    }
    engineerWallet.availableBalance = (Number(engineerWallet.availableBalance) || 0) + creditAmount;
    engineerWallet.totalEarned = (Number(engineerWallet.totalEarned) || 0) + creditAmount;
    // Clear any pending marker
    engineerWallet.pendingBalance = Math.max(
      0,
      (Number(engineerWallet.pendingBalance) || 0) - creditAmount
    );
    await engineerWallet.save();

    await WalletTransaction.create({
      walletId: engineerWallet._id,
      ownerId: engineerId,
      ownerType: 'engineer',
      transactionType: 'credit',
      amount: creditAmount,
      description: `B2B escrow release — ${job.jobId}`,
      sourceType: 'job',
      sourceId: jobId,
      status: 'completed',
      idempotencyKey: idemKey
    });
    creditedTo = { role: 'engineer', id: engineerId, amount: creditAmount };
  }

  // Move company escrow → spent (funds leave the company permanently)
  const companyWallet = await B2BWallet.findOneAndUpdate(
    { companyId: job.companyId, escrowBalance: { $gte: remaining } },
    {
      $inc: { escrowBalance: -remaining, totalSpent: remaining },
      $set: { lastUpdatedAt: new Date() }
    },
    { new: true }
  );
  if (!companyWallet) {
    // Legacy deducted path: escrowBalance may be 0 — still mark spent if not already
    await B2BWallet.findOneAndUpdate(
      { companyId: job.companyId },
      { $set: { lastUpdatedAt: new Date() } }
    );
  } else {
    await B2BCompany.findByIdAndUpdate(job.companyId, { walletBalance: companyWallet.balance });
  }

  ledger.releasedAmount = (Number(ledger.releasedAmount) || 0) + remaining;
  ledger.status = 'released';
  ledger.releaseReason = `job_completed_approved:${mode}`;
  await ledger.save();

  await B2BJob.updateOne(
    { _id: jobId },
    { $set: { paymentStatus: 'released', payoutStatus: 'released' } }
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
    type: 'earnings_credit',
    amount: creditAmount,
    status: 'completed',
    paymentMethod: 'system',
    description: `B2B escrow release (${mode}) — ${job.jobId}`,
    metadata: {
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

  const refreshed = await B2BWallet.findOne({ companyId: job.companyId });
  await B2BWalletTransaction.create({
    companyId: job.companyId,
    walletId: refreshed?._id,
    transactionId: `TXN-ESX-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
    type: 'escrow_release',
    amount: -remaining,
    totalAmount: -remaining,
    status: 'success',
    paymentMethod: 'wallet',
    remark: `Escrow released (${mode}) for ${job.jobId}`,
    relatedJobIds: [jobId]
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
