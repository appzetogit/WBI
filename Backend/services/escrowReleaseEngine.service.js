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

module.exports = {
  DEFAULT_PAYMENT_RULES,
  resolvePaymentRules,
  computeSplit,
  computeB2BEngineerPayout,
  lockEscrowForProject,
  releaseMilestoneEscrow
};
