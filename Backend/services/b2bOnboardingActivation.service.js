const B2BCompany = require('../models/B2BCompany');
const B2BEnterpriseOnboarding = require('../models/B2BEnterpriseOnboarding');
const B2BVerificationLog = require('../models/B2BVerificationLog');
const AuditLog = require('../models/AuditLog');
const {
  getOrCreateActiveConfig,
  getOnboardingState,
  pushTimeline,
  computeScores
} = require('./b2bEnterpriseOnboarding.service');
const { materializeOnActivation } = require('./b2bOnboardingSync.service');

function activationBlockers(onboarding, config) {
  const rules = config.activationRules || {};
  const k = onboarding.kycFlags || {};
  const blockers = [];

  if ((rules.requireGstVerified ?? true) && k.gst?.status !== 'verified') blockers.push('GST not verified');
  if ((rules.requirePanVerified ?? true) && k.pan?.status !== 'verified') blockers.push('PAN not verified');
  if ((rules.requireBankVerified ?? true) && k.bank?.status !== 'verified') blockers.push('Bank not verified');
  if (rules.requireDocumentsApproved !== false) {
    const ds = onboarding.documentStatusSummary || {};
    if (ds.total > 0 && ds.verified < ds.total) blockers.push('Required documents not approved');
  }
  if ((rules.requireSlaSigned ?? true) && k.agreementSigned?.status !== 'verified') blockers.push('SLA not signed');
  if ((rules.requireFinanceApproved ?? true) && k.financeApproved?.status !== 'verified') blockers.push('Finance review pending');
  if ((rules.requireComplianceApproved ?? true) && k.complianceApproved?.status !== 'verified') blockers.push('Compliance review pending');
  if ((rules.requireOperationsApproved ?? true) && k.operationsApproved?.status !== 'verified') blockers.push('Operations review pending');

  return blockers;
}

async function evaluateActivation(companyId) {
  const { onboarding, config } = await getOnboardingState(companyId);
  const blockers = activationBlockers(onboarding, config);
  return {
    canActivate: blockers.length === 0,
    blockers,
    scores: onboarding.scores,
    lifecycleStatus: onboarding.lifecycleStatus
  };
}

async function submitOnboarding(companyId, actorId) {
  const onboarding = await B2BEnterpriseOnboarding.findOne({ companyId, deletedAt: null });
  if (!onboarding) {
    const err = new Error('Onboarding record not found');
    err.statusCode = 404;
    throw err;
  }

  onboarding.lifecycleStatus = 'finance_review';
  onboarding.submittedAt = new Date();
  pushTimeline(onboarding, 'onboarding_submitted', 'b2b', actorId);
  await onboarding.save();

  const company = await B2BCompany.findById(companyId);
  if (company) {
    company.verificationStatus = 'pending';
    company.onboardingLifecycleStatus = 'finance_review';
    await company.save();
  }

  return onboarding;
}

async function adminReviewTransition({ companyId, action, note, adminId }) {
  const { onboarding, config } = await getOnboardingState(companyId);
  const transitions = {
    finance_approve: { flag: 'financeApproved', next: 'finance_review' },
    finance_reject: { flag: null, next: 'rejected' },
    compliance_approve: { flag: 'complianceApproved', next: 'compliance_review' },
    compliance_reject: { flag: null, next: 'rejected' },
    operations_approve: { flag: 'operationsApproved', next: 'operations_review' },
    operations_reject: { flag: null, next: 'rejected' },
    admin_approve: { flag: 'adminApproved', next: 'active' },
    admin_reject: { flag: null, next: 'rejected' },
    hold: { flag: null, next: 'hold' }
  };

  const t = transitions[action];
  if (!t) {
    const err = new Error('Invalid review action');
    err.statusCode = 400;
    throw err;
  }

  if (t.flag) {
    onboarding.kycFlags[t.flag] = {
      status: 'verified',
      verifiedAt: new Date(),
      provider: 'admin',
      raw: { note }
    };
  }

  if (action === 'finance_reject' || action === 'compliance_reject' || action === 'operations_reject' || action === 'admin_reject') {
    onboarding.review.rejectionReason = note || 'Rejected by reviewer';
    onboarding.lifecycleStatus = 'rejected';
  } else if (action === 'hold') {
    onboarding.review.holdReason = note || 'On hold';
    onboarding.lifecycleStatus = 'hold';
  } else if (action === 'finance_approve') {
    onboarding.lifecycleStatus = 'compliance_review';
    onboarding.review.financeNote = note;
  } else if (action === 'compliance_approve') {
    onboarding.lifecycleStatus = 'operations_review';
    onboarding.review.complianceNote = note;
  } else if (action === 'operations_approve') {
    onboarding.lifecycleStatus = 'document_review';
    onboarding.review.operationsNote = note;
  } else if (action === 'admin_approve') {
    const blockers = activationBlockers(onboarding, config);
    if (blockers.length) {
      const err = new Error(`Cannot activate: ${blockers.join(', ')}`);
      err.statusCode = 400;
      err.blockers = blockers;
      throw err;
    }
    onboarding.lifecycleStatus = 'active';
    onboarding.activatedAt = new Date();
    await materializeOnActivation(companyId, onboarding, adminId);
  }

  pushTimeline(onboarding, `admin_${action}`, 'admin', adminId, { note });
  computeScores(onboarding);
  await onboarding.save();
  return onboarding;
}

async function signSla(companyId, { signaturePayload, actorId }) {
  const onboarding = await B2BEnterpriseOnboarding.findOne({ companyId, deletedAt: null });
  if (!onboarding) {
    const err = new Error('Onboarding not found');
    err.statusCode = 404;
    throw err;
  }
  onboarding.slaConfig = {
    ...(onboarding.slaConfig || {}),
    signedAt: new Date(),
    signature: signaturePayload || {}
  };
  onboarding.kycFlags.agreementSigned = {
    status: 'verified',
    verifiedAt: new Date(),
    provider: 'digital',
    raw: { method: signaturePayload?.method || 'clickwrap' }
  };
  pushTimeline(onboarding, 'sla_signed', 'b2b', actorId);
  await onboarding.save();
  return onboarding;
}

module.exports = {
  activationBlockers,
  evaluateActivation,
  submitOnboarding,
  adminReviewTransition,
  signSla
};
