/**
 * Bridge: existing user enquiry forms → vendor Business Intake (Opportunity).
 * Does NOT change user UI — only creates marketplace opportunities after submit.
 */
const Opportunity = require('../models/Opportunity');
const Vendor = require('../models/Vendor');
const ServiceConfig = require('../models/ServiceConfig');
const ServiceRequest = require('../models/ServiceRequest');
const {
  expandCategoryMatchCodes,
  buildLegacyCategoryMatchers,
  LEGACY_ALIAS_MAP
} = require('./serviceCategoryAliases');
const { startAssignmentForOpportunity } = require('../services/projectAssignmentEngine.service');

/**
 * Normalize assignment metadata from any enquiry / service-request body.
 */
const buildAssignmentMetaFromEnquiry = (enquiry = {}, extra = {}) => {
  const requiredEngineers =
    Number(extra.requiredEngineers) ||
    Number(enquiry.requiredEngineers) ||
    Number(enquiry.engineerCount) ||
    Number(enquiry.numberOfEngineers) ||
    Number(enquiry.teamSize) ||
    1;

  let coordinates = extra.coordinates || null;
  if (!coordinates) {
    const lat =
      enquiry.latitude ??
      enquiry.lat ??
      enquiry.geoLat ??
      enquiry.address?.lat ??
      enquiry.location?.lat;
    const lng =
      enquiry.longitude ??
      enquiry.lng ??
      enquiry.geoLng ??
      enquiry.address?.lng ??
      enquiry.location?.lng;
    if (lat != null && lng != null && !Number.isNaN(Number(lat)) && !Number.isNaN(Number(lng))) {
      coordinates = { lat: Number(lat), lng: Number(lng) };
    }
  }

  return {
    ...extra,
    requiredEngineers: Math.max(1, requiredEngineers),
    coordinates,
    subCatCode: extra.subCatCode || enquiry.subCatCode || '',
    serviceRequestId: extra.serviceRequestId || enquiry.serviceRequestId || null
  };
};

/** Map equipment / enquiry keywords → ServiceConfig categoryCode (legacy regex fallback) */
const EQUIPMENT_TO_CATEGORY = [
  { test: /cctv|camera|surveillance|nvr|dvr/i, code: 'C01' },
  { test: /\bit\b|computer|laptop|desktop|pc\b/i, code: 'C02' },
  { test: /network|lan|wifi|switch|router/i, code: 'C03' },
  { test: /solar|ups|dg\b|power|energy|battery|inverter/i, code: 'C04' },
  { test: /atm|cdm|pos|banking/i, code: 'C05' },
  { test: /access\s*control|biometric|acs|security\s*system/i, code: 'C07' },
  { test: /telecom|vsat|fiber/i, code: 'C08' },
  { test: /medical|healthcare|hospital/i, code: 'C10' },
  { test: /fire|safety|fas/i, code: 'C19' },
  { test: /elevator|lift/i, code: 'C18' },
  { test: /smart\s*home|home\s*auto/i, code: 'C23' },
  { test: /ev\b|vehicle|auto/i, code: 'C22' },
  { test: /water|purifier|ro\b/i, code: 'C24' },
  { test: /web|website|digital|app\b|crm|marketing|design/i, code: 'WEB' }
];

const ENQUIRY_TYPE_DEFAULTS = {
  installation: 'C01',
  maintenance: 'C01',
  breakdown: 'C01',
  sitetesting: 'C01',
  powermonitoring: 'C04',
  multipleservices: 'C01',
  banking: 'C05',
  atm: 'C05',
  medical: 'C10',
  web: 'WEB',
  app: 'APP',
  design: 'WEB',
  marketing: 'WEB',
  crm: 'C02',
  service_request: null,
  b2b: null
};

/**
 * Generic words that must never drive a category decision on their own —
 * almost every catalog entry and every free-text service string contains them.
 */
const MATCH_STOPWORDS = new Set([
  'SERVICE', 'SERVICES', 'SERVICING', 'REPAIR', 'REPAIRS', 'REPAIRING',
  'INSTALL', 'INSTALLATION', 'MAINTENANCE', 'SETUP', 'SYSTEM', 'SYSTEMS',
  'AMC', 'AND', 'THE', 'FOR', 'WITH', 'NEW', 'OLD', 'GENERAL', 'OTHER',
  'OTHERS', 'MISC', 'WORK', 'JOB', 'REQUEST', 'CUSTOM'
]);

const tokenizeForMatch = (text) =>
  String(text || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .split(' ')
    .filter((t) => t && !MATCH_STOPWORDS.has(t));

/** ELECTRICIAN ~ ELECTRICAL, PLUMBER ~ PLUMBING: same 6+ char stem. */
const tokensMatch = (a, b) => {
  if (a === b) return true;
  const limit = Math.min(a.length, b.length);
  if (limit < 6) return false;
  let common = 0;
  while (common < limit && a[common] === b[common]) common += 1;
  return common >= 6;
};

/**
 * Similarity between the input text and one catalog label.
 * Rewards both how much of the label is covered and how much of the input is
 * explained, so a single incidental word ("Pest Control" vs "Access Control")
 * cannot win.
 */
const scoreCatalogLabel = (textTokens, label) => {
  const labelTokens = tokenizeForMatch(label);
  if (!labelTokens.length || !textTokens.length) return 0;
  let matched = 0;
  for (const lt of labelTokens) {
    if (textTokens.some((tt) => tokensMatch(tt, lt))) matched += 1;
  }
  if (!matched) return 0;
  return (matched / labelTokens.length) * 40 + (matched / textTokens.length) * 40 + matched * 5;
};

/** Below this the match is treated as "no category in the catalog fits". */
const MIN_CATALOG_MATCH_SCORE = 50;

/**
 * Pure scorer over an already-loaded catalog. Callers that classify many rows
 * (bulk upload) load the configs once and reuse this.
 * Scores every active category and returns the best one, rather than the first
 * whose name happens to be a substring of the input.
 */
const pickCategoryFromConfigs = (haystack, configs = []) => {
  const textTokens = tokenizeForMatch(haystack);
  if (!textTokens.length) return null;

  let best = { code: null, score: 0 };
  for (const cfg of configs) {
    const code = String(cfg.categoryCode || '').toUpperCase();
    if (!code) continue;

    // An explicit code in the text is authoritative.
    if (textTokens.includes(code)) return code;

    let score = scoreCatalogLabel(textTokens, cfg.categoryName);
    for (const alias of cfg.matchAliases || []) {
      if (!alias) continue;
      if (textTokens.includes(String(alias).toUpperCase())) {
        score = Math.max(score, 85);
        continue;
      }
      score = Math.max(score, scoreCatalogLabel(textTokens, alias));
    }
    for (const sub of cfg.subCategories || []) {
      const subCode = String(sub.subCatCode || sub.code || '').toUpperCase();
      if (subCode && textTokens.includes(subCode)) return code;
      const subName = sub.subCatName || sub.name || sub.subCategoryName;
      score = Math.max(score, scoreCatalogLabel(textTokens, subName));
    }

    if (score > best.score) best = { code, score };
  }

  return best.code && best.score >= MIN_CATALOG_MATCH_SCORE ? best.code : null;
};

const loadActiveServiceConfigs = () =>
  ServiceConfig.find({ isActive: true, status: { $ne: 'archived' } })
    .select('categoryCode categoryName matchAliases subCategories')
    .lean();

/**
 * Prefer admin ServiceConfig (name / aliases / subCategories) over hardcoded regex.
 */
const resolveCategoryCodeFromCatalog = async (haystack = '') => {
  if (!tokenizeForMatch(haystack).length) return null;
  try {
    return pickCategoryFromConfigs(haystack, await loadActiveServiceConfigs());
  } catch {
    /* fall through to regex */
    return null;
  }
};

const parseBudgetRange = (budgetRange = '') => {
  const text = String(budgetRange || '');
  const nums = text.replace(/,/g, '').match(/(\d+(\.\d+)?)/g);
  if (!nums || !nums.length) return { min: 0, max: 0 };
  const values = nums.map(Number).filter((n) => !Number.isNaN(n));
  if (values.length === 1) return { min: values[0], max: values[0] };
  return { min: Math.min(...values), max: Math.max(...values) };
};

/**
 * Resolve a category and report whether it was actually matched.
 * `matched: false` means nothing in the catalog fits and the returned code is
 * only a placeholder — callers that can escalate should do so instead of
 * routing the work to an unrelated vendor pool.
 */
const resolveCategoryMatch = async ({ enquiryType, equipmentType = [], hints = [] }) => {
  const haystack = [
    ...(Array.isArray(equipmentType) ? equipmentType : [equipmentType]),
    ...hints
  ]
    .filter(Boolean)
    .join(' ');

  const fromCatalog = await resolveCategoryCodeFromCatalog(haystack);
  if (fromCatalog) return { code: fromCatalog, matched: true, source: 'catalog', haystack };

  for (const rule of EQUIPMENT_TO_CATEGORY) {
    if (rule.test.test(haystack)) return { code: rule.code, matched: true, source: 'keyword', haystack };
  }

  const typeKey = String(enquiryType || '').toLowerCase();
  const typeDefault = ENQUIRY_TYPE_DEFAULTS[typeKey];
  if (typeDefault) return { code: typeDefault, matched: true, source: 'enquiryType', haystack };

  // Last resort: first active ServiceConfig (never invent a fake category)
  try {
    const any = await ServiceConfig.findOne({ isActive: true, status: { $ne: 'archived' } })
      .select('categoryCode')
      .sort({ categoryCode: 1 })
      .lean();
    if (any?.categoryCode) {
      return { code: String(any.categoryCode).toUpperCase(), matched: false, source: 'fallback', haystack };
    }
  } catch {
    /* ignore */
  }
  return { code: 'C01', matched: false, source: 'fallback', haystack };
};

const resolveCategoryCode = async (opts) => (await resolveCategoryMatch(opts)).code;

const resolveCategoryName = async (categoryCode) => {
  const code = String(categoryCode || '').toUpperCase();
  try {
    const cfg = await ServiceConfig.findOne({ categoryCode: code, isActive: true })
      .select('categoryName')
      .lean();
    if (cfg?.categoryName) return cfg.categoryName;
  } catch {
    /* ignore */
  }
  const aliasHit = Object.entries(LEGACY_ALIAS_MAP).find(([canonical]) => canonical === code);
  if (aliasHit) return code;
  return code;
};

/**
 * Find vendors who can receive this category (approved + active service).
 */
const findEligibleVendorIds = async (categoryCode) => {
  const codes = await expandCategoryMatchCodes([categoryCode]);
  if (!codes.length) return [];

  const vendors = await Vendor.find({
    approvalStatus: 'approved',
    $and: [
      { $or: [{ isActive: true }, { isActive: { $exists: false } }, { isActive: null }] },
      {
        $or: [
          {
            approvedServices: {
              $elemMatch: {
                categoryCode: { $in: codes },
                status: { $in: ['active', 'pending'] }
              }
            }
          },
          { categories: { $in: buildLegacyCategoryMatchers(codes) } }
        ]
      }
    ]
  })
    .select('_id')
    .lean();

  return vendors.map((v) => v._id);
};

const buildDescription = (enquiry = {}, enquiryType = '') => {
  const parts = [
    `Source: ${enquiryType} enquiry`,
    enquiry.siteAddress ? `Site: ${enquiry.siteAddress}` : null,
    enquiry.city ? `City: ${enquiry.city}` : null,
    enquiry.equipmentType?.length ? `Equipment: ${enquiry.equipmentType.join(', ')}` : null,
    enquiry.totalDevices != null ? `Devices: ${enquiry.totalDevices}` : null,
    enquiry.typeOfWork?.length ? `Work: ${enquiry.typeOfWork.join(', ')}` : null,
    enquiry.urgency ? `Urgency: ${enquiry.urgency}` : null,
    enquiry.additionalNotes ? `Notes: ${enquiry.additionalNotes}` : null
  ].filter(Boolean);
  return parts.join('\n');
};

/**
 * Create Opportunity from a saved public enquiry document.
 * Failures are logged but must not break enquiry submission.
 *
 * @returns {Promise<{ opportunity: object|null, eligibleCount: number, categoryCode: string|null }>}
 */
const createOpportunityFromEnquiry = async ({
  enquiry,
  enquiryType = 'installation',
  enquiryModel = 'InstallationEnquiry',
  categoryCode: forcedCode = null,
  titlePrefix = null,
  assignmentMeta = null,
  opportunityType = 'client_request'
}) => {
  if (!enquiry?._id) {
    return { opportunity: null, eligibleCount: 0, categoryCode: null };
  }

  const meta = buildAssignmentMetaFromEnquiry(enquiry, assignmentMeta || {});

  const categoryCode = forcedCode || (await resolveCategoryCode({
    enquiryType,
    equipmentType: enquiry.equipmentType || enquiry.equipment || [],
    hints: [
      enquiry.serviceType,
      enquiry.issueType,
      enquiry.monitoringType,
      titlePrefix
    ]
  }));

  const categoryName = await resolveCategoryName(categoryCode);
  const paidFromCustomer = Number(enquiry.customerPaidAmount) || 0;
  const budget =
    paidFromCustomer > 0
      ? { min: paidFromCustomer, max: paidFromCustomer }
      : parseBudgetRange(enquiry.budgetRange || enquiry.budget || '');

  const requiredEngineers = meta.requiredEngineers;

  const title =
    titlePrefix ||
    `${categoryName} — ${enquiryType.replace(/_/g, ' ')} request` +
      (enquiry.city ? ` (${enquiry.city})` : '');

  const deadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  // Preferred visit is start date, NOT vendor response deadline
  const startDate = enquiry.preferredVisitDate || enquiry.expectedStartDate || null;

  const opportunity = new Opportunity({
    type: opportunityType,
    title: String(title).slice(0, 180),
    description: buildDescription(enquiry, enquiryType),
    categoryCode,
    categoryName,
    subServices: Array.isArray(enquiry.equipmentType) ? enquiry.equipmentType.slice(0, 12) : [],
    clientInfo: {
      clientType: enquiry.clientType || (enquiry.companyName ? 'company' : 'individual'),
      name: enquiry.fullName || enquiry.name || enquiry.contactName || 'Client',
      company: enquiry.companyName || '',
      city: enquiry.city || '',
      state: enquiry.state || '',
      phone: enquiry.phone || enquiry.mobile || ''
    },
    requirements: {
      totalSites: enquiry.multipleSites === 'Yes' || enquiry.multipleSites === true ? 2 : 1,
      cities: enquiry.city ? [enquiry.city] : [],
      description: enquiry.siteAddress || enquiry.address || '',
      specialRequirements: enquiry.additionalNotes || enquiry.accessRestrictions || '',
      startDate: startDate ? new Date(startDate) : null
    },
    budget: {
      min: budget.min,
      max: budget.max,
      type: 'negotiable',
      currency: 'INR'
    },
    deadline,
    expiresAt: new Date(deadline.getTime() + 14 * 24 * 60 * 60 * 1000),
    priority: /urgent|emergency|critical/i.test(String(enquiry.urgency || '')) ? 'urgent' : 'normal',
    eligibleVendors: [],
    status: 'open',
    assignment: {
      phase: 'project_created',
      requiredEngineers,
      subCatCode: meta.subCatCode || '',
      serviceRequestId: meta.serviceRequestId || null,
      b2bJobId: meta.b2bJobId || null,
      b2bCompanyId: meta.b2bCompanyId || null,
      siteLocation: {
        city: enquiry.city || '',
        address: enquiry.siteAddress || enquiry.address || ''
      },
      timeline: [{ key: 'project_created', label: 'Project Created', at: new Date() }]
    },
    // Keep a soft link in description only — avoid schema churn
    createdBy: null
  });

  if (meta.coordinates?.lat != null && meta.coordinates?.lng != null) {
    opportunity.assignment.siteLocation.coordinates = {
      type: 'Point',
      coordinates: [meta.coordinates.lng, meta.coordinates.lat]
    };
  }

  // Attach source meta on description footer for audit
  opportunity.description += `\n\n[sourceEnquiry:${enquiryModel}:${enquiry._id}]`;

  await opportunity.save();

  try {
    const { bootstrapFlowFromOpportunity } = require('../services/enterpriseB2BOrchestrator.service');
    await bootstrapFlowFromOpportunity(opportunity._id, {
      serviceRequestId: meta.serviceRequestId
    });
  } catch (flowErr) {
    console.warn('[createOpportunityFromEnquiry] enterprise flow bootstrap:', flowErr.message);
  }

  if (assignmentMeta?.serviceRequestId) {
    await ServiceRequest.updateOne(
      { _id: assignmentMeta.serviceRequestId },
      { $set: { opportunityId: opportunity._id } }
    ).catch(() => {});
  }

  // Start enterprise assignment engine (vendor queue + timeouts)
  try {
    await startAssignmentForOpportunity(opportunity._id, {
      requiredEngineers,
      serviceRequestId: meta.serviceRequestId,
      subCatCode: meta.subCatCode,
      city: enquiry.city,
      address: enquiry.siteAddress || enquiry.address,
      coordinates: meta.coordinates
    });
  } catch (assignErr) {
    console.error('[createOpportunityFromEnquiry] assignment engine failed:', assignErr.message);
  }

  const refreshed = await Opportunity.findById(opportunity._id).select('eligibleVendors opportunityCode').lean();
  const vendorIds = refreshed?.eligibleVendors || [];
  const eligibleCount = vendorIds.length;

  // Real-time: legacy broadcast (per-vendor emits happen in assignment engine)
  try {
    if (global.io && eligibleCount) {
      const payload = {
        type: 'client_request',
        opportunityId: opportunity._id,
        opportunityCode: refreshed.opportunityCode || opportunity.opportunityCode,
        categoryCode,
        categoryName,
        title: opportunity.title,
        city: enquiry.city || '',
        message: `New ${categoryName} opportunity in your intake`
      };
      vendorIds.forEach((vid) => {
        global.io.to(`vendor:${vid}`).emit('opportunity:new', payload);
      });
      global.io.emit('new_opportunity', payload);
    }
  } catch (socketErr) {
    console.warn('[createOpportunityFromEnquiry] socket emit failed:', socketErr.message);
  }

  console.info('[createOpportunityFromEnquiry]', {
    enquiryId: String(enquiry._id),
    opportunityCode: opportunity.opportunityCode,
    categoryCode,
    eligibleCount
  });

  return {
    opportunity,
    eligibleCount,
    categoryCode
  };
};

/**
 * Fire-and-forget wrapper so enquiry APIs stay fast / never fail on marketplace bridge.
 */
const queueOpportunityFromEnquiry = (opts) => {
  Promise.resolve()
    .then(() => createOpportunityFromEnquiry(opts))
    .catch((err) => {
      console.error('[queueOpportunityFromEnquiry]', err.message);
    });
};

/**
 * Banking / ATM / POS / CDM device forms → C05 Business Intake.
 */
const queueBankingMarketplaceFromEnquiry = (enquiry, { enquiryModel, titleHint } = {}) => {
  if (!enquiry?._id) return;
  const hint = titleHint || enquiry.serviceType || 'Banking service';
  queueOpportunityFromEnquiry({
    enquiry: {
      ...(typeof enquiry.toObject === 'function' ? enquiry.toObject() : enquiry),
      equipmentType: ['ATM', 'banking', 'POS', hint].filter(Boolean),
      serviceType: enquiry.serviceType || hint
    },
    enquiryType: 'banking',
    enquiryModel: enquiryModel || 'BankingEnquiry',
    categoryCode: 'C05',
    titlePrefix: `${hint} — ${enquiry.city || 'Site'}`,
    assignmentMeta: buildAssignmentMetaFromEnquiry(enquiry)
  });
};

/**
 * B2B bulk / portal job → vendor marketplace opportunity (when assignmentMode = vendor_marketplace).
 */
const createOpportunityFromB2BJob = async (job) => {
  if (!job?._id) return { opportunity: null, eligibleCount: 0, categoryCode: null };

  const coords = job.coordinates?.coordinates || [];
  const lng = coords[0];
  const lat = coords[1];

  const match = await resolveCategoryMatch({
    enquiryType: 'b2b',
    equipmentType: [job.service, job.subService].filter(Boolean),
    hints: [job.deviceId, job.siteId]
  });

  // Routing a job to an unrelated vendor pool is worse than not routing it:
  // surface it so admin can add the missing category instead.
  if (!match.matched) {
    console.warn('[createOpportunityFromB2BJob] no catalog category matches service', {
      jobId: job.jobId,
      service: job.service,
      subService: job.subService
    });
    return { opportunity: null, eligibleCount: 0, categoryCode: null, unmatchedCategory: true };
  }

  const categoryCode = match.code;
  const budget = Number(job.charge) || 0;

  // Vendors need to see which corporate client the job belongs to.
  let companyName = '';
  try {
    const B2BCompany = require('../models/B2BCompany');
    const company = await B2BCompany.findById(job.companyId).select('companyName').lean();
    companyName = company?.companyName || '';
  } catch {
    /* name is informational only */
  }

  return createOpportunityFromEnquiry({
    enquiry: {
      _id: job._id,
      fullName: job.customerName,
      phone: job.phone,
      email: job.email || '',
      city: job.city,
      siteAddress: job.address,
      companyName,
      clientType: 'b2b',
      equipmentType: [job.service, job.subService].filter(Boolean),
      urgency: job.priority === 'High' ? 'Urgent' : 'Normal',
      preferredVisitDate: job.preferredDate,
      additionalNotes: `B2B Job ${job.jobId}`,
      budgetRange: budget ? `₹${budget}` : '',
      customerPaidAmount: budget,
      latitude: lat,
      longitude: lng
    },
    enquiryType: 'b2b',
    enquiryModel: 'B2BJob',
    categoryCode,
    titlePrefix: `${job.service} — ${job.city}`,
    assignmentMeta: buildAssignmentMetaFromEnquiry(
      {
        city: job.city,
        siteAddress: job.address,
        latitude: lat,
        longitude: lng,
        requiredEngineers: 1
      },
      { b2bJobId: job._id, b2bCompanyId: job.companyId }
    ),
    opportunityType: 'b2b_opportunity'
  });
};

module.exports = {
  createOpportunityFromEnquiry,
  queueOpportunityFromEnquiry,
  queueBankingMarketplaceFromEnquiry,
  createOpportunityFromB2BJob,
  buildAssignmentMetaFromEnquiry,
  resolveCategoryCode,
  resolveCategoryMatch,
  pickCategoryFromConfigs,
  loadActiveServiceConfigs,
  findEligibleVendorIds,
  parseBudgetRange
};
