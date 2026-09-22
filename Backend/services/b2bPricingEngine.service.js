/**
 * B2B Pricing Engine
 * ------------------
 * Configuration-driven cost calculation for B2B service jobs.
 *
 * Before this module, every job in every batch was billed at a single flat
 * `B2BDeductionRule.perJobCharge` (+ GST), regardless of service, geography or
 * volume. This engine resolves the most specific matching `B2BPricingRule` and
 * returns a transparent, auditable breakdown.
 *
 * BACKWARD COMPATIBILITY: when no B2BPricingRule matches, it falls back to the
 * company's existing B2BDeductionRule and reproduces the previous arithmetic
 * exactly (perJobCharge * (1 + gstPercent/100)). Installing this module changes
 * no prices until an admin creates a pricing rule.
 *
 * All arithmetic lives here. The frontend renders the returned breakdown and
 * never computes totals itself.
 */

const B2BPricingRule = require('../models/B2BPricingRule');
const B2BDeductionRule = require('../models/B2BDeductionRule');
const B2BContract = require('../models/B2BContract');
const B2BCompany = require('../models/B2BCompany');

/**
 * Resolution order is fixed and never negotiable:
 *   CONTRACT override → COMPANY pricing profile → DEFAULT pricing matrix.
 * A level is only consulted when the one above it produced nothing.
 */
const LEVELS = ['CONTRACT', 'COMPANY', 'DEFAULT'];

/**
 * Which level a stored rule belongs to. Rules written before levels existed
 * are classified by their scope, so nothing has to be migrated.
 */
const effectiveLevel = (rule) => {
  if (rule.level === 'CONTRACT' || rule.contractId) return 'CONTRACT';
  if (rule.level === 'COMPANY' || rule.companyId || rule.pricingProfile) return 'COMPANY';
  return 'DEFAULT';
};

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const norm = (v) => String(v || '').toLowerCase().trim();

/**
 * Specificity weights. A rule matching on a narrower dimension outranks a
 * broader one, so a company+service+pincode rule beats a platform default.
 */
const WEIGHT = {
  company: 100,
  serviceKey: 50,
  subServiceKey: 24,
  profile: 60,
  service: 40,
  subService: 20,
  categoryCode: 20,
  vendor: 30,
  tier: 10,
  pincode: 16,
  city: 8,
  state: 4
};

/**
 * Does `rule` apply to this job? Returns null when it does not, otherwise a
 * specificity score and which geographic dimension (if any) matched.
 */
const scoreRule = (rule, ctx) => {
  let score = 0;
  let geoMatched = false;

  // ── Company scope ──────────────────────────────────────────────────
  if (rule.companyId) {
    if (!ctx.companyId || String(rule.companyId) !== String(ctx.companyId)) return null;
    score += WEIGHT.company;
  }

  // ── Pricing profile scope ──────────────────────────────────────────
  if (rule.pricingProfile) {
    if (!ctx.pricingProfile || norm(rule.pricingProfile) !== norm(ctx.pricingProfile)) return null;
    score += WEIGHT.profile;
  }

  // ── Service scope: the service KEY is the identifier; the free-text
  //    service name is only matched for rules written before keys existed.
  if (rule.serviceKey) {
    if (!ctx.serviceKey || norm(rule.serviceKey) !== norm(ctx.serviceKey)) return null;
    score += WEIGHT.serviceKey;
  }
  if (rule.subServiceKey) {
    if (!ctx.subServiceKey || norm(rule.subServiceKey) !== norm(ctx.subServiceKey)) return null;
    score += WEIGHT.subServiceKey;
  }
  if (rule.service) {
    if (norm(rule.service) !== norm(ctx.service)) return null;
    score += WEIGHT.service;
  }
  if (rule.subService) {
    if (norm(rule.subService) !== norm(ctx.subService)) return null;
    score += WEIGHT.subService;
  }
  if (rule.categoryCode) {
    if (norm(rule.categoryCode) !== norm(ctx.categoryCode)) return null;
    score += WEIGHT.categoryCode;
  }

  // ── Vendor scope ───────────────────────────────────────────────────
  if (rule.vendorId) {
    if (!ctx.vendorId || String(rule.vendorId) !== String(ctx.vendorId)) return null;
    score += WEIGHT.vendor;
  }

  // ── Tier ───────────────────────────────────────────────────────────
  if (rule.serviceTier && rule.serviceTier !== 'any') {
    if (norm(rule.serviceTier) !== norm(ctx.serviceTier)) return null;
    score += WEIGHT.tier;
  }

  // ── Geography: each populated list is a constraint ─────────────────
  const region = rule.region || {};

  const prefixes = (region.pincodePrefixes || []).filter(Boolean);
  if (prefixes.length) {
    const pin = String(ctx.pincode || '');
    if (!pin || !prefixes.some((p) => pin.startsWith(String(p)))) return null;
    score += WEIGHT.pincode;
    geoMatched = true;
  }

  const cities = (region.cities || []).filter(Boolean);
  if (cities.length) {
    if (!cities.some((c) => norm(c) === norm(ctx.city))) return null;
    score += WEIGHT.city;
    geoMatched = true;
  }

  const states = (region.states || []).filter(Boolean);
  if (states.length) {
    if (!states.some((s) => norm(s) === norm(ctx.state))) return null;
    score += WEIGHT.state;
    geoMatched = true;
  }

  return { score, geoMatched };
};

/**
 * The company's pricing profile and its contract in force, if any. Cached per
 * call chain by the caller passing them back in on `ctx`.
 */
const loadCompanyPricingContext = async (companyId, at = new Date()) => {
  if (!companyId) return { company: null, contract: null };
  const company = await B2BCompany.findById(companyId)
    .select('pricingProfile activeContractId allowedServices')
    .lean();
  if (!company) return { company: null, contract: null };

  const contract = await B2BContract.findOne({
    companyId,
    status: 'ACTIVE',
    validFrom: { $lte: at },
    $or: [{ validTo: null }, { validTo: { $gte: at } }]
  }).lean();

  return { company, contract: contract || null };
};

/**
 * A contract's per-service override, shaped like a pricing rule so the rest of
 * the engine treats it identically.
 */
const contractRuleFor = (contract, ctx) => {
  if (!contract || !Array.isArray(contract.pricing)) return null;
  const key = norm(ctx.serviceKey);
  if (!key) return null;

  // An entry naming the sub-service wins over the service-wide entry.
  const entries = contract.pricing.filter((e) => norm(e.serviceKey) === key);
  if (!entries.length) return null;
  const entry =
    entries.find((e) => e.subServiceKey && norm(e.subServiceKey) === norm(ctx.subServiceKey))
    || entries.find((e) => !e.subServiceKey)
    || entries[0];

  return {
    _id: contract._id,
    name: `Contract ${contract.contractCode}`,
    level: 'CONTRACT',
    contractId: contract._id,
    companyId: contract.companyId,
    serviceKey: entry.serviceKey,
    subServiceKey: entry.subServiceKey || null,
    baseAmount: entry.baseAmount,
    serviceCharge: 0,
    geographicSurcharge: entry.geographicSurcharge || 0,
    priorityCharges: entry.priorityCharges || {},
    slaCharge: entry.slaCharge || 0,
    emergencyCharge: entry.emergencyCharge || 0,
    afterHoursCharge: entry.afterHoursCharge || 0,
    additionalCharges: [],
    volumeDiscounts: [],
    taxPercent: entry.taxPercent != null ? entry.taxPercent : 18,
    taxLabel: 'GST',
    vendorPayoutPercent: entry.vendorPayoutPercent || 0,
    currency: 'INR',
    priority: 0
  };
};

/**
 * Find the price for a job context, honouring the fixed level order.
 * @returns {{ rule:Object|null, geoMatched:boolean, score:number, level:String|null }}
 */
const resolvePricingRule = async (ctx = {}) => {
  const now = ctx.at ? new Date(ctx.at) : new Date();

  const loaded = ctx.company !== undefined && ctx.contract !== undefined
    ? { company: ctx.company, contract: ctx.contract }
    : await loadCompanyPricingContext(ctx.companyId, now);
  const pricingProfile = ctx.pricingProfile || loaded.company?.pricingProfile || null;
  const scopedCtx = { ...ctx, pricingProfile };

  // 1. Contract override.
  const fromContract = contractRuleFor(loaded.contract, scopedCtx);
  if (fromContract) {
    const hit = scoreRule(fromContract, scopedCtx) || { score: 0, geoMatched: false };
    return { rule: fromContract, score: hit.score, geoMatched: hit.geoMatched, level: 'CONTRACT' };
  }

  // Cheap pre-filter in Mongo; full scoping happens in memory because
  // wildcard-vs-scoped matching is not expressible as a single query.
  const candidates = await B2BPricingRule.find({
    isActive: true,
    effectiveFrom: { $lte: now },
    $and: [
      { $or: [{ effectiveTo: null }, { effectiveTo: { $gte: now } }] },
      {
        $or: [
          { companyId: null },
          { companyId: ctx.companyId || null }
        ]
      }
    ]
  }).lean();

  // 2. Company profile, then 3. default matrix — never the other way round.
  for (const level of LEVELS) {
    if (level === 'CONTRACT') continue;
    let best = null;
    for (const rule of candidates) {
      if (effectiveLevel(rule) !== level) continue;
      const hit = scoreRule(rule, scopedCtx);
      if (!hit) continue;
      if (
        !best
        || hit.score > best.score
        || (hit.score === best.score && (rule.priority || 0) > (best.rule.priority || 0))
      ) {
        best = { rule, score: hit.score, geoMatched: hit.geoMatched };
      }
    }
    if (best) return { ...best, level };
  }

  return { rule: null, score: 0, geoMatched: false, level: null };
};

/**
 * Legacy fallback: reproduce the pre-engine arithmetic from B2BDeductionRule
 * so behaviour is unchanged until an admin configures real pricing.
 */
const legacyBreakdown = async (companyId, quantity = 1) => {
  let rule = await B2BDeductionRule.findOne({ companyId, isActive: true }).lean();
  if (!rule) {
    rule = { perJobCharge: 12, gstPercent: 18 };
  }

  const base = round2(rule.perJobCharge);
  const tax = round2(base * (rule.gstPercent / 100));
  const perJob = round2(base + tax);

  return {
    source: 'deduction_rule',
    level: 'LEGACY',
    ruleId: null,
    ruleName: 'Legacy per-job deduction (no pricing rule matched)',
    currency: 'INR',
    quantity,
    perJob: {
      baseAmount: base,
      serviceCharge: 0,
      geographicCharge: 0,
      priorityCharge: 0,
      slaCharge: 0,
      emergencyCharge: 0,
      afterHoursCharge: 0,
      additionalCharges: [],
      additionalChargesTotal: 0,
      discountPercent: 0,
      discountAmount: 0,
      taxableAmount: base,
      taxPercent: rule.gstPercent,
      taxLabel: 'GST',
      taxAmount: tax,
      total: perJob
    },
    totals: {
      subtotal: round2(base * quantity),
      serviceCharges: 0,
      geographicCharges: 0,
      priorityCharges: 0,
      slaCharges: 0,
      emergencyCharges: 0,
      afterHoursCharges: 0,
      additionalCharges: 0,
      discount: 0,
      tax: round2(tax * quantity),
      grandTotal: round2(perJob * quantity)
    }
  };
};

/**
 * Price a single job (or `quantity` identical jobs) against resolved config.
 *
 * @param {Object} ctx
 * @param {String} ctx.companyId
 * @param {String} [ctx.service]
 * @param {String} [ctx.subService]
 * @param {String} [ctx.categoryCode]
 * @param {String} [ctx.serviceTier]  standard | priority | premium
 * @param {String} [ctx.vendorId]
 * @param {String} [ctx.pincode]
 * @param {String} [ctx.city]
 * @param {String} [ctx.state]
 * @param {Number} [ctx.quantity]     billable job count (drives volume discount)
 * @returns {Promise<Object>} transparent breakdown
 */
const calculateJobPrice = async (ctx = {}) => {
  const quantity = Math.max(1, parseInt(ctx.quantity, 10) || 1);
  const { rule, geoMatched, level } = await resolvePricingRule(ctx);

  if (!rule) {
    return legacyBreakdown(ctx.companyId, quantity);
  }

  const baseAmount = round2(rule.baseAmount);
  const serviceCharge = round2(rule.serviceCharge);
  // Surcharge only applies when the rule was actually selected on geography.
  const geographicCharge = geoMatched ? round2(rule.geographicSurcharge) : 0;

  // ── Per-job charge components ──────────────────────────────────────
  // Priority is charged from the job's own priority; SLA, emergency and
  // after-hours are charged only when the caller says they apply.
  const priorityKey = ['Low', 'Medium', 'High'].find(
    (k) => norm(k) === norm(ctx.priority)
  );
  const priorityCharge = priorityKey
    ? round2((rule.priorityCharges || {})[priorityKey] || 0)
    : 0;
  const slaCharge = ctx.slaTightened ? round2(rule.slaCharge || 0) : 0;
  const emergencyCharge = ctx.emergency ? round2(rule.emergencyCharge || 0) : 0;
  const afterHoursCharge = ctx.afterHours ? round2(rule.afterHoursCharge || 0) : 0;

  const preChargeSubtotal = round2(
    baseAmount + serviceCharge + geographicCharge
    + priorityCharge + slaCharge + emergencyCharge + afterHoursCharge
  );

  // ── Additional charges ─────────────────────────────────────────────
  const additionalCharges = (rule.additionalCharges || []).map((c) => {
    const amount =
      c.mode === 'percent'
        ? round2(preChargeSubtotal * (Number(c.amount) || 0) / 100)
        : round2(c.amount);
    return { label: c.label, mode: c.mode, amount, taxable: c.taxable !== false };
  });
  const additionalChargesTotal = round2(
    additionalCharges.reduce((s, c) => s + c.amount, 0)
  );

  // ── Volume discount: highest qualifying tier ───────────────────────
  const tiers = (rule.volumeDiscounts || [])
    .filter((d) => quantity >= d.minQuantity)
    .sort((a, b) => b.discountPercent - a.discountPercent);
  const discountPercent = tiers.length ? tiers[0].discountPercent : 0;
  const discountLabel = tiers.length ? tiers[0].label || `Volume ${quantity}+` : null;

  const grossPerJob = round2(preChargeSubtotal + additionalChargesTotal);
  const discountAmount = round2(grossPerJob * (discountPercent / 100));

  // ── Tax on the taxable portion only ────────────────────────────────
  const nonTaxable = round2(
    additionalCharges.filter((c) => !c.taxable).reduce((s, c) => s + c.amount, 0)
  );
  const taxableAmount = round2(Math.max(0, grossPerJob - discountAmount - nonTaxable));
  const taxPercent = Number(rule.taxPercent) || 0;
  const taxAmount = round2(taxableAmount * (taxPercent / 100));

  const perJobTotal = round2(grossPerJob - discountAmount + taxAmount);

  return {
    source: 'pricing_rule',
    /** Which level of the fixed chain produced this price. */
    level: level || 'DEFAULT',
    ruleId: rule._id,
    ruleName: rule.name,
    contractId: rule.contractId || null,
    currency: rule.currency || 'INR',
    quantity,
    matchedOn: {
      company: Boolean(rule.companyId),
      serviceKey: rule.serviceKey || null,
      service: rule.service || null,
      pricingProfile: rule.pricingProfile || null,
      tier: rule.serviceTier !== 'any' ? rule.serviceTier : null,
      geography: geoMatched
    },
    perJob: {
      baseAmount,
      serviceCharge,
      geographicCharge,
      priorityCharge,
      slaCharge,
      emergencyCharge,
      afterHoursCharge,
      additionalCharges,
      additionalChargesTotal,
      discountPercent,
      discountLabel,
      discountAmount,
      taxableAmount,
      taxPercent,
      taxLabel: rule.taxLabel || 'GST',
      taxAmount,
      total: perJobTotal
    },
    totals: {
      subtotal: round2(baseAmount * quantity),
      serviceCharges: round2(serviceCharge * quantity),
      geographicCharges: round2(geographicCharge * quantity),
      priorityCharges: round2(priorityCharge * quantity),
      slaCharges: round2(slaCharge * quantity),
      emergencyCharges: round2(emergencyCharge * quantity),
      afterHoursCharges: round2(afterHoursCharge * quantity),
      additionalCharges: round2(additionalChargesTotal * quantity),
      discount: round2(discountAmount * quantity),
      tax: round2(taxAmount * quantity),
      grandTotal: round2(perJobTotal * quantity)
    },
    vendorPayoutPercent: rule.vendorPayoutPercent || 0
  };
};

/**
 * Price a whole upload batch.
 *
 * Groups rows by their pricing dimensions so a mixed-service batch is billed
 * correctly instead of at one blended rate. The volume discount is evaluated
 * against the FULL batch size, not the per-group size, so splitting services
 * across a batch never reduces a customer's discount tier.
 *
 * @param {Object} params
 * @param {String} params.companyId
 * @param {Array}  params.jobs  rows with { service, subService, city, state, pincode, priority }
 * @returns {Promise<Object>} { lines[], totals, perJobCharge, estimatedCost }
 */
const calculateBatchPricing = async ({ companyId, jobs = [] } = {}) => {
  const billable = jobs.length;

  if (billable === 0) {
    return {
      lines: [],
      totals: {
        subtotal: 0, serviceCharges: 0, geographicCharges: 0,
        priorityCharges: 0, slaCharges: 0, emergencyCharges: 0, afterHoursCharges: 0,
        additionalCharges: 0, discount: 0, tax: 0, grandTotal: 0
      },
      perJobCharge: 0,
      estimatedCost: 0,
      currency: 'INR'
    };
  }

  const tierFor = (priority) => {
    const p = norm(priority);
    if (p === 'high') return 'priority';
    if (p === 'low') return 'standard';
    return 'standard';
  };

  // Load the company's profile and contract once for the whole batch.
  const { company, contract } = await loadCompanyPricingContext(companyId);

  // Group identical pricing contexts to avoid one resolution per row.
  const groups = new Map();
  for (const job of jobs) {
    const ctx = {
      companyId,
      company,
      contract,
      pricingProfile: company?.pricingProfile || null,
      serviceKey: job.serviceKey || null,
      subServiceKey: job.subServiceKey || null,
      service: job.service || null,
      subService: job.subService || null,
      serviceTier: tierFor(job.priority),
      priority: job.priority || 'Medium',
      emergency: Boolean(job.emergency),
      afterHours: Boolean(job.afterHours),
      slaTightened: Boolean(job.slaTightened),
      pincode: job.pincode || null,
      city: job.city || null,
      state: job.state || null
    };
    const key = [
      ctx.serviceKey, ctx.subServiceKey, ctx.service, ctx.subService, ctx.serviceTier,
      ctx.priority, ctx.emergency, ctx.afterHours, ctx.slaTightened,
      ctx.pincode, ctx.city, ctx.state
    ].map(norm).join('|');
    if (!groups.has(key)) groups.set(key, { ctx, count: 0 });
    groups.get(key).count += 1;
  }

  const lines = [];
  const totals = {
    subtotal: 0, serviceCharges: 0, geographicCharges: 0,
    priorityCharges: 0, slaCharges: 0, emergencyCharges: 0, afterHoursCharges: 0,
    additionalCharges: 0, discount: 0, tax: 0, grandTotal: 0
  };
  let currency = 'INR';

  for (const { ctx, count } of groups.values()) {
    // Discount tier from the whole batch; totals scaled by this group's count.
    const priced = await calculateJobPrice({ ...ctx, quantity: billable });
    currency = priced.currency;

    const line = {
      serviceKey: ctx.serviceKey,
      service: ctx.service,
      subService: ctx.subService,
      tier: ctx.serviceTier,
      priority: ctx.priority,
      city: ctx.city,
      pincode: ctx.pincode,
      count,
      source: priced.source,
      level: priced.level,
      ruleId: priced.ruleId,
      ruleName: priced.ruleName,
      perJob: priced.perJob,
      lineTotal: round2(priced.perJob.total * count)
    };
    lines.push(line);

    totals.subtotal = round2(totals.subtotal + priced.perJob.baseAmount * count);
    totals.serviceCharges = round2(totals.serviceCharges + priced.perJob.serviceCharge * count);
    totals.geographicCharges = round2(totals.geographicCharges + priced.perJob.geographicCharge * count);
    totals.priorityCharges = round2(totals.priorityCharges + (priced.perJob.priorityCharge || 0) * count);
    totals.slaCharges = round2(totals.slaCharges + (priced.perJob.slaCharge || 0) * count);
    totals.emergencyCharges = round2(totals.emergencyCharges + (priced.perJob.emergencyCharge || 0) * count);
    totals.afterHoursCharges = round2(totals.afterHoursCharges + (priced.perJob.afterHoursCharge || 0) * count);
    totals.additionalCharges = round2(totals.additionalCharges + priced.perJob.additionalChargesTotal * count);
    totals.discount = round2(totals.discount + priced.perJob.discountAmount * count);
    totals.tax = round2(totals.tax + priced.perJob.taxAmount * count);
    totals.grandTotal = round2(totals.grandTotal + line.lineTotal);
  }

  return {
    lines,
    totals,
    // Blended average — kept so existing B2BBatch.perJobCharge consumers work.
    perJobCharge: round2(totals.grandTotal / billable),
    estimatedCost: totals.grandTotal,
    currency
  };
};

module.exports = {
  resolvePricingRule,
  calculateJobPrice,
  calculateBatchPricing,
  loadCompanyPricingContext,
  contractRuleFor,
  effectiveLevel,
  scoreRule,
  LEVELS,
  WEIGHT
};
