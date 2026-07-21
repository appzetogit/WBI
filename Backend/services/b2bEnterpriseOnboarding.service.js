const crypto = require('crypto');
const B2BOnboardingConfig = require('../models/B2BOnboardingConfig');
const B2BEnterpriseOnboarding = require('../models/B2BEnterpriseOnboarding');
const B2BDocument = require('../models/B2BDocument');
const B2BCompany = require('../models/B2BCompany');
const ServiceConfig = require('../models/ServiceConfig');
const RegistrationTemplate = require('../models/RegistrationTemplate');

const DEFAULT_DOC_TEMPLATES = [
  { key: 'gst_certificate', label: 'GST Certificate', required: true, verificationMode: 'api', sortOrder: 1 },
  { key: 'pan_card', label: 'PAN Card', required: true, verificationMode: 'api', sortOrder: 2 },
  { key: 'company_registration', label: 'Company Registration / CIN', required: false, verificationMode: 'api', sortOrder: 3 },
  { key: 'cancelled_cheque', label: 'Cancelled Cheque / Bank Proof', required: true, verificationMode: 'upload_only', sortOrder: 4 },
  { key: 'address_proof', label: 'Registered Address Proof', required: true, verificationMode: 'manual', sortOrder: 5 }
];

const DEFAULT_SLA = {
  key: 'standard_enterprise',
  name: 'Standard Enterprise SLA',
  firstResponseMinutes: 60,
  arrivalMinutes: 240,
  resolutionMinutes: 1440,
  fieldRules: {
    otpRequired: true,
    geoFencingRequired: false,
    beforePhotoRequired: true,
    afterPhotoRequired: true,
    customerSignatureRequired: false,
    videoProofRequired: false
  }
};

async function getOrCreateActiveConfig() {
  let config = await B2BOnboardingConfig.findOne({ isActive: true }).sort({ version: -1 });
  if (config) return config;

  config = await B2BOnboardingConfig.create({
    version: 1,
    isActive: true,
    documentTemplates: DEFAULT_DOC_TEMPLATES,
    serviceCatalog: [],
    slaTemplates: [DEFAULT_SLA],
    projectTemplates: [],
    approvalTemplates: [{
      key: 'default_enterprise',
      name: 'Default Enterprise Approval',
      levels: [
        { role: 'creator', label: 'Requester', required: true },
        { role: 'manager', label: 'Manager', required: true },
        { role: 'finance', label: 'Finance', required: true },
        { role: 'final_approver', label: 'Final Approver', required: true }
      ],
      rules: {}
    }]
  });
  return config;
}

async function syncServiceCatalogFromPlatform(config) {
  const serviceConfigs = await ServiceConfig.find({ isActive: true }).select('categoryCode name category serviceType').lean();
  const catalog = [...(config.serviceCatalog || [])];
  const byKey = new Map(catalog.map((c) => [c.key, c]));

  for (const sc of serviceConfigs) {
    const key = String(sc.categoryCode || sc._id).toLowerCase();
    if (!byKey.has(key)) {
      const regTpl = await RegistrationTemplate.findOne({ categoryCode: sc.categoryCode, isActive: true }).lean();
      const docKeys = (regTpl?.requiredDocuments || []).map((d) => String(d.key || d.documentType || d).toLowerCase());
      catalog.push({
        key,
        name: sc.name || sc.categoryCode,
        categoryCode: sc.categoryCode || sc.category || null,
        serviceTypes: sc.serviceType ? [sc.serviceType] : [],
        requiredDocumentKeys: docKeys,
        requiredCertificationKeys: [],
        defaultSlaTemplateKey: 'standard_enterprise',
        isActive: true
      });
    }
  }

  config.serviceCatalog = catalog;
  await config.save();
  return config;
}

function pushTimeline(onboarding, event, actorType = 'system', actorId = null, meta = {}) {
  onboarding.timeline = onboarding.timeline || [];
  onboarding.timeline.push({ at: new Date(), event, actorType, actorId, meta });
}

function stepFieldMap() {
  return {
    1: 'companyInfo',
    2: 'addresses',
    3: 'primaryContact',
    4: 'financeContact',
    5: 'serviceRequirements',
    6: 'operationalCoverage',
    7: 'banking',
    8: 'creditProfile',
    9: 'escrowPaymentRules',
    10: 'slaConfig',
    11: 'approvalHierarchy',
    12: 'bulkProjectSettings',
    13: 'compliance',
    14: 'kycFlags',
    15: 'review',
    16: 'submitted'
  };
}

async function resolveRequiredDocuments(onboarding, config) {
  const baseKeys = (config.documentTemplates || [])
    .filter((d) => d.required)
    .map((d) => d.key);

  const selected = onboarding.serviceRequirements?.selectedServices || [];
  const catalog = config.serviceCatalog || [];
  const serviceKeys = new Set();

  for (const sel of selected) {
    const key = String(sel.key || sel).toLowerCase();
    const item = catalog.find((c) => c.key === key);
    if (item?.requiredDocumentKeys?.length) {
      item.requiredDocumentKeys.forEach((k) => serviceKeys.add(String(k).toLowerCase()));
    }
  }

  const merged = [...new Set([...baseKeys, ...serviceKeys])];
  onboarding.requiredDocumentKeys = merged;
  return merged;
}

async function refreshDocumentSummary(companyId, onboarding) {
  const required = onboarding.requiredDocumentKeys || [];
  const docs = await B2BDocument.find({ companyId }).lean();
  const byType = new Map(docs.map((d) => [d.documentType, d]));

  let uploaded = 0;
  let verified = 0;
  let missing = 0;

  let expired = 0;
  const now = new Date();

  for (const key of required) {
    const doc = byType.get(key);
    if (!doc) {
      missing += 1;
    } else {
      uploaded += 1;
      if (doc.status === 'verified') verified += 1;
      if (doc.expiresAt && new Date(doc.expiresAt) < now) expired += 1;
    }
  }

  onboarding.documentStatusSummary = {
    total: required.length,
    uploaded,
    verified,
    missing,
    expired
  };
}

function computeScores(onboarding) {
  const k = onboarding.kycFlags || {};
  const checks = ['gst', 'pan', 'bank', 'contactMobile', 'contactEmail'];
  let passed = 0;
  checks.forEach((c) => {
    if (k[c]?.status === 'verified') passed += 1;
  });
  const doc = onboarding.documentStatusSummary || {};
  const docScore = doc.total ? Math.round((doc.verified / doc.total) * 100) : 0;
  onboarding.scores = onboarding.scores || {};
  onboarding.scores.kyc = Math.round((passed / checks.length) * 50 + docScore * 0.5);
  onboarding.scores.risk = Math.max(0, 100 - onboarding.scores.kyc);
  const credit = onboarding.creditProfile?.requestedLimit || 0;
  onboarding.scores.credit = credit > 0 ? Math.min(100, Math.round(onboarding.scores.kyc * 0.8)) : 0;
}

async function getOrCreateOnboardingForCompany(companyId) {
  let onboarding = await B2BEnterpriseOnboarding.findOne({ companyId, deletedAt: null });
  if (onboarding) return onboarding;

  onboarding = await B2BEnterpriseOnboarding.create({
    companyId,
    currentStep: 1,
    lifecycleStatus: 'draft',
    timeline: [{ event: 'onboarding_created', actorType: 'system' }]
  });
  return onboarding;
}

async function saveOnboardingStep({ companyId, step, payload, actorType = 'b2b', actorId = null }) {
  const fieldMap = stepFieldMap();
  const field = fieldMap[step];
  if (!field || field === 'submitted') {
    const err = new Error('Invalid onboarding step');
    err.statusCode = 400;
    throw err;
  }

  const onboarding = await getOrCreateOnboardingForCompany(companyId);
  onboarding[field] = { ...(onboarding[field] || {}), ...payload };
  onboarding.currentStep = Math.max(onboarding.currentStep || 1, step);
  pushTimeline(onboarding, `step_${step}_saved`, actorType, actorId, { field });
  await onboarding.save();

  try {
    const { syncOnboardingPartial } = require('./b2bOnboardingSync.service');
    if (companyId) await syncOnboardingPartial(companyId, onboarding);
  } catch (e) {
    console.error('[onboarding] partial sync failed:', e.message);
  }

  return onboarding;
}

async function getOnboardingState(companyId) {
  const config = await syncServiceCatalogFromPlatform(await getOrCreateActiveConfig());
  const onboarding = await getOrCreateOnboardingForCompany(companyId);
  await resolveRequiredDocuments(onboarding, config);
  await refreshDocumentSummary(companyId, onboarding);
  computeScores(onboarding);
  await onboarding.save();

  const company = await B2BCompany.findById(companyId).select('-passwordHash').lean();
  const documents = await B2BDocument.find({ companyId }).lean();

  return { onboarding, config, company, documents };
}

async function createDraftSession() {
  const draftToken = crypto.randomBytes(24).toString('hex');
  const onboarding = await B2BEnterpriseOnboarding.create({
    draftToken,
    lifecycleStatus: 'draft',
    timeline: [{ event: 'draft_started' }]
  });
  return { draftToken, onboardingId: onboarding._id };
}

module.exports = {
  getOrCreateActiveConfig,
  syncServiceCatalogFromPlatform,
  getOrCreateOnboardingForCompany,
  saveOnboardingStep,
  getOnboardingState,
  resolveRequiredDocuments,
  refreshDocumentSummary,
  computeScores,
  pushTimeline,
  createDraftSession,
  stepFieldMap
};
