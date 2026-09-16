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

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[6-9]\d{9}$/;
const PINCODE_RE = /^\d{6}$/;
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;

function validateStepPayload(step, payload, onboarding) {
  const errors = [];
  const data = payload || {};

  switch (step) {
    case 1: {
      if (!data.legalName?.trim()) errors.push('Legal company name is required');
      if (!data.gstNumber?.trim()) errors.push('GSTIN is required');
      else if (!GSTIN_RE.test(String(data.gstNumber).trim().toUpperCase())) errors.push('Invalid GSTIN format');
      if (!data.panNumber?.trim()) errors.push('PAN is required');
      else if (!PAN_RE.test(String(data.panNumber).trim().toUpperCase())) errors.push('Invalid PAN format');
      break;
    }
    case 2: {
      const addr = data;
      if (!addr.registered?.trim() && !addr.registeredAddress?.trim()) errors.push('Registered address is required');
      break;
    }
    case 3: {
      if (!data.name?.trim()) errors.push('Contact name is required');
      if (!data.email?.trim()) errors.push('Email is required');
      else if (!EMAIL_RE.test(data.email)) errors.push('Invalid email format');
      if (!data.phone?.trim() && !data.mobile?.trim()) errors.push('Phone number is required');
      else {
        const ph = String(data.phone || data.mobile || '').replace(/\D/g, '').slice(-10);
        if (ph && !PHONE_RE.test(ph)) errors.push('Invalid phone number format');
      }
      break;
    }
    case 4: {
      if (!data.name?.trim()) errors.push('Finance contact name is required');
      if (!data.email?.trim()) errors.push('Finance contact email is required');
      else if (!EMAIL_RE.test(data.email)) errors.push('Invalid email format');
      break;
    }
    case 5: {
      const selected = data.selectedServices || [];
      if (!selected.length) errors.push('At least one service must be selected');
      break;
    }
    case 6: {
      // Coverage - optional but check if branches exist
      break;
    }
    case 7: {
      if (!data.accountNumber?.trim() && !data.accountHolderName?.trim()) {
        errors.push('Bank account details are required');
      }
      if (data.ifsc && !IFSC_RE.test(String(data.ifsc).trim().toUpperCase())) {
        errors.push('Invalid IFSC code format');
      }
      break;
    }
    case 8: // Credit - optional
    case 9: // Payment rules - optional
    case 10: // SLA - optional
    case 11: // Approvals - optional
    case 12: // Bulk projects - optional
    case 13: // Compliance - optional
      break;
    case 14: // KYC - validated by verification flags
    case 15: // Review - read-only
    case 16: // Submit - handled separately
      break;
  }
  return errors;
}

function computeStepCompletion(onboarding) {
  const completion = new Map();
  const o = onboarding;

  // Step 1: Company Info
  const ci = o.companyInfo || {};
  const s1Complete = !!(ci.legalName?.trim() && ci.gstNumber?.trim() && ci.panNumber?.trim());
  completion.set('1', { completed: s1Complete, completedAt: s1Complete ? (o.updatedAt || new Date()) : null, validationErrors: s1Complete ? [] : ['Incomplete'] });

  // Step 2: Addresses
  const addr = o.addresses || {};
  const s2Complete = !!(addr.registered?.trim() || addr.registeredAddress?.trim());
  completion.set('2', { completed: s2Complete, completedAt: s2Complete ? (o.updatedAt || new Date()) : null, validationErrors: s2Complete ? [] : ['Incomplete'] });

  // Step 3: Primary Contact
  const pc = o.primaryContact || {};
  const s3Complete = !!(pc.name?.trim() && (pc.email?.trim() || pc.phone?.trim()));
  completion.set('3', { completed: s3Complete, completedAt: s3Complete ? (o.updatedAt || new Date()) : null, validationErrors: s3Complete ? [] : ['Incomplete'] });

  // Step 4: Finance Contact
  const fc = o.financeContact || {};
  const s4Complete = !!(fc.name?.trim() && fc.email?.trim());
  completion.set('4', { completed: s4Complete, completedAt: s4Complete ? (o.updatedAt || new Date()) : null, validationErrors: s4Complete ? [] : ['Incomplete'] });

  // Step 5: Services
  const sr = o.serviceRequirements || {};
  const s5Complete = (sr.selectedServices || []).length > 0;
  completion.set('5', { completed: s5Complete, completedAt: s5Complete ? (o.updatedAt || new Date()) : null, validationErrors: s5Complete ? [] : ['Incomplete'] });

  // Step 6: Coverage - optional, always complete if visited
  const oc = o.operationalCoverage || {};
  const s6Complete = !!(oc.regions?.trim() || (oc.branches && oc.branches.length > 0));
  completion.set('6', { completed: s6Complete, completedAt: s6Complete ? (o.updatedAt || new Date()) : null, validationErrors: [] });

  // Step 7: Banking
  const bk = o.banking || {};
  const s7Complete = !!(bk.accountNumber || bk.accountHolderName);
  completion.set('7', { completed: s7Complete, completedAt: s7Complete ? (o.updatedAt || new Date()) : null, validationErrors: s7Complete ? [] : ['Incomplete'] });

  // Steps 8-13: Optional config steps - mark complete if any data exists
  const optionalSteps = [
    { step: '8', field: o.creditProfile },
    { step: '9', field: o.escrowPaymentRules },
    { step: '10', field: o.slaConfig },
    { step: '11', field: o.approvalHierarchy },
    { step: '12', field: o.bulkProjectSettings },
    { step: '13', field: o.compliance }
  ];
  optionalSteps.forEach(({ step, field }) => {
    const data = field || {};
    const hasData = Object.keys(data).some(k => k !== '_id' && data[k] != null && data[k] !== '' && data[k] !== false);
    completion.set(step, { completed: hasData, completedAt: hasData ? (o.updatedAt || new Date()) : null, validationErrors: [] });
  });

  // Step 14: KYC & Docs
  const k = o.kycFlags || {};
  const kycChecks = ['gst', 'pan', 'bank'];
  const kycPassed = kycChecks.filter(c => k[c]?.status === 'verified').length;
  const s14Complete = kycPassed >= 2; // At least GST+PAN verified
  completion.set('14', { completed: s14Complete, completedAt: s14Complete ? (o.updatedAt || new Date()) : null, validationErrors: s14Complete ? [] : ['KYC verification incomplete'] });

  // Step 15: Review - always accessible
  completion.set('15', { completed: true, completedAt: o.updatedAt || new Date(), validationErrors: [] });

  // Step 16: Submit
  const s16Complete = !!o.submittedAt;
  completion.set('16', { completed: s16Complete, completedAt: o.submittedAt || null, validationErrors: [] });

  return completion;
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
  const company = await B2BCompany.findById(companyId).lean();

  if (!onboarding) {
    onboarding = await B2BEnterpriseOnboarding.create({
      companyId,
      currentStep: 1,
      lifecycleStatus: 'draft',
      companyInfo: {
        legalName: company?.companyName || '',
        brandName: company?.companyName || '',
        gstNumber: company?.gstNumber || '',
        panNumber: company?.panNumber || '',
        tanNumber: company?.tanNumber || '',
        cinNumber: company?.cinNumber || ''
      },
      addresses: {
        registeredAddress: company?.companyAddress || '',
        billingAddress: company?.billingAddress || company?.companyAddress || ''
      },
      primaryContact: {
        name: company?.authorizedPerson?.name || company?.authorizedPerson?.fullName || '',
        designation: company?.authorizedPerson?.designation || '',
        email: company?.email || '',
        phone: company?.phone || '',
        altPhone: company?.authorizedPerson?.altPhone || ''
      },
      financeContact: {
        name: company?.authorizedPerson?.name || '',
        email: company?.email || '',
        phone: company?.phone || ''
      },
      timeline: [{ event: 'onboarding_created', actorType: 'system' }]
    });
  } else if (company) {
    let modified = false;
    if (!onboarding.companyInfo?.legalName && company.companyName) {
      onboarding.companyInfo = {
        legalName: company.companyName,
        brandName: company.companyName,
        gstNumber: company.gstNumber || '',
        panNumber: company.panNumber || '',
        tanNumber: company.tanNumber || '',
        cinNumber: company.cinNumber || '',
        ...(onboarding.companyInfo || {})
      };
      modified = true;
    }
    if (!onboarding.addresses?.registeredAddress && company.companyAddress) {
      onboarding.addresses = {
        registeredAddress: company.companyAddress,
        billingAddress: company.billingAddress || company.companyAddress,
        ...(onboarding.addresses || {})
      };
      modified = true;
    }
    if (!onboarding.primaryContact?.name && (company.authorizedPerson?.name || company.email)) {
      onboarding.primaryContact = {
        name: company.authorizedPerson?.name || '',
        designation: company.authorizedPerson?.designation || '',
        email: company.email || '',
        phone: company.phone || '',
        altPhone: company.authorizedPerson?.altPhone || '',
        ...(onboarding.primaryContact || {})
      };
      modified = true;
    }
    if (modified) {
      await onboarding.save();
    }
  }

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
  
  // Track step completion and validation
  const completionMap = computeStepCompletion(onboarding);
  onboarding.stepCompletion = completionMap;
  const validationErrors = validateStepPayload(Number(step), onboarding[field], onboarding);

  pushTimeline(onboarding, `step_${step}_saved`, actorType, actorId, { field, validationErrors });
  await onboarding.save();

  try {
    const { syncOnboardingPartial } = require('./b2bOnboardingSync.service');
    if (companyId) await syncOnboardingPartial(companyId, onboarding);
  } catch (e) {
    console.error('[onboarding] partial sync failed:', e.message);
  }

  return { onboarding, validationErrors };
}

async function getOnboardingState(companyId) {
  const config = await syncServiceCatalogFromPlatform(await getOrCreateActiveConfig());
  const onboarding = await getOrCreateOnboardingForCompany(companyId);
  await resolveRequiredDocuments(onboarding, config);
  await refreshDocumentSummary(companyId, onboarding);
  computeScores(onboarding);
  onboarding.stepCompletion = computeStepCompletion(onboarding);
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
  stepFieldMap,
  validateStepPayload,
  computeStepCompletion
};
