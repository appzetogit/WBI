/**
 * Admin — B2B Pricing Rule management (§9)
 *
 * Lets Admin configure pricing without a frontend or backend deploy. Rules are
 * consumed by services/b2bPricingEngine.service.js at batch-validation time.
 *
 * All handlers assume `authenticate` + `isAdmin` have already run (applied at
 * the router level in b2bPricingAdmin.routes.js).
 */

const mongoose = require('mongoose');
const B2BPricingRule = require('../../models/B2BPricingRule');
const B2BCompany = require('../../models/B2BCompany');
const { calculateJobPrice, calculateBatchPricing } = require('../../services/b2bPricingEngine.service');

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

/** Whitelist of writable fields — prevents mass-assignment of audit columns. */
const WRITABLE = [
  'name', 'description', 'companyId', 'service', 'subService', 'categoryCode',
  'serviceKey', 'subServiceKey', 'level', 'pricingProfile', 'contractId',
  'serviceTier', 'vendorId', 'region', 'baseAmount', 'serviceCharge',
  'geographicSurcharge', 'priorityCharges', 'slaCharge', 'emergencyCharge',
  'afterHoursCharge', 'additionalCharges', 'volumeDiscounts', 'taxPercent',
  'taxLabel', 'vendorPayoutPercent', 'currency', 'priority', 'effectiveFrom',
  'effectiveTo', 'isActive'
];

const pickWritable = (body = {}) => {
  const out = {};
  for (const key of WRITABLE) {
    if (body[key] !== undefined) out[key] = body[key];
  }
  // Normalise wildcard scopes: empty string means "any", stored as null.
  [
    'companyId', 'service', 'subService', 'categoryCode',
    'serviceKey', 'subServiceKey', 'pricingProfile', 'contractId', 'vendorId'
  ].forEach((k) => {
    if (out[k] === '' || out[k] === 'any' || out[k] === 'all') out[k] = null;
  });
  return out;
};

const validateRule = (data, { partial = false } = {}) => {
  const errors = [];

  if (!partial || data.name !== undefined) {
    if (!data.name || !String(data.name).trim()) errors.push('name is required');
  }
  if (!partial || data.baseAmount !== undefined) {
    const base = Number(data.baseAmount);
    if (!Number.isFinite(base) || base < 0) errors.push('baseAmount must be a number >= 0');
  }
  if (data.taxPercent !== undefined) {
    const t = Number(data.taxPercent);
    if (!Number.isFinite(t) || t < 0 || t > 100) errors.push('taxPercent must be between 0 and 100');
  }
  if (data.companyId && !isValidId(data.companyId)) errors.push('companyId is not a valid id');
  if (data.contractId && !isValidId(data.contractId)) errors.push('contractId is not a valid id');
  if (data.level && !['CONTRACT', 'COMPANY', 'DEFAULT'].includes(data.level)) {
    errors.push('level must be CONTRACT, COMPANY or DEFAULT');
  }
  ['slaCharge', 'emergencyCharge', 'afterHoursCharge'].forEach((k) => {
    if (data[k] !== undefined) {
      const v = Number(data[k]);
      if (!Number.isFinite(v) || v < 0) errors.push(`${k} must be a number >= 0`);
    }
  });
  if (data.priorityCharges !== undefined) {
    Object.entries(data.priorityCharges || {}).forEach(([k, v]) => {
      if (!['Low', 'Medium', 'High'].includes(k)) {
        errors.push(`priorityCharges.${k} is not a job priority`);
      } else if (!Number.isFinite(Number(v)) || Number(v) < 0) {
        errors.push(`priorityCharges.${k} must be a number >= 0`);
      }
    });
  }
  if (data.vendorId && !isValidId(data.vendorId)) errors.push('vendorId is not a valid id');

  (data.volumeDiscounts || []).forEach((d, i) => {
    if (!Number.isFinite(Number(d.minQuantity)) || Number(d.minQuantity) < 1) {
      errors.push(`volumeDiscounts[${i}].minQuantity must be >= 1`);
    }
    const p = Number(d.discountPercent);
    if (!Number.isFinite(p) || p < 0 || p > 100) {
      errors.push(`volumeDiscounts[${i}].discountPercent must be between 0 and 100`);
    }
  });

  (data.additionalCharges || []).forEach((c, i) => {
    if (!c.label || !String(c.label).trim()) errors.push(`additionalCharges[${i}].label is required`);
    if (!Number.isFinite(Number(c.amount))) errors.push(`additionalCharges[${i}].amount must be a number`);
    if (c.mode && !['flat', 'percent'].includes(c.mode)) {
      errors.push(`additionalCharges[${i}].mode must be flat or percent`);
    }
  });

  if (data.effectiveFrom && data.effectiveTo) {
    if (new Date(data.effectiveTo) < new Date(data.effectiveFrom)) {
      errors.push('effectiveTo must be after effectiveFrom');
    }
  }

  return errors;
};

/**
 * GET /api/admin/b2b/pricing-rules
 * Query: companyId, service, isActive, page, limit
 */
exports.listPricingRules = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));

    const filter = {};
    if (req.query.companyId) {
      if (req.query.companyId === 'platform') filter.companyId = null;
      else if (isValidId(req.query.companyId)) filter.companyId = req.query.companyId;
    }
    if (req.query.service) filter.service = new RegExp(`^${String(req.query.service).trim()}$`, 'i');
    if (req.query.isActive === 'true') filter.isActive = true;
    if (req.query.isActive === 'false') filter.isActive = false;

    const [rules, total] = await Promise.all([
      B2BPricingRule.find(filter)
        .populate('companyId', 'companyName email')
        .sort({ priority: -1, updatedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      B2BPricingRule.countDocuments(filter)
    ]);

    return res.status(200).json({
      success: true,
      data: rules,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) }
    });
  } catch (error) {
    console.error('[Admin Pricing] list error:', error);
    return res.status(500).json({ success: false, message: 'Failed to load pricing rules' });
  }
};

/** GET /api/admin/b2b/pricing-rules/:id */
exports.getPricingRule = async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid rule id' });
    }
    const rule = await B2BPricingRule.findById(req.params.id)
      .populate('companyId', 'companyName email')
      .lean();
    if (!rule) return res.status(404).json({ success: false, message: 'Pricing rule not found' });
    return res.status(200).json({ success: true, data: rule });
  } catch (error) {
    console.error('[Admin Pricing] get error:', error);
    return res.status(500).json({ success: false, message: 'Failed to load pricing rule' });
  }
};

/** POST /api/admin/b2b/pricing-rules */
exports.createPricingRule = async (req, res) => {
  try {
    const data = pickWritable(req.body);
    const errors = validateRule(data);
    if (errors.length) {
      return res.status(400).json({ success: false, message: 'Validation failed', errors });
    }

    if (data.companyId) {
      const company = await B2BCompany.findById(data.companyId).select('_id').lean();
      if (!company) return res.status(404).json({ success: false, message: 'B2B company not found' });
    }

    data.createdBy = req.user?.id || null;
    data.updatedBy = req.user?.id || null;

    const rule = await B2BPricingRule.create(data);
    return res.status(201).json({ success: true, message: 'Pricing rule created', data: rule });
  } catch (error) {
    console.error('[Admin Pricing] create error:', error);
    return res.status(500).json({ success: false, message: 'Failed to create pricing rule' });
  }
};

/** PUT /api/admin/b2b/pricing-rules/:id */
exports.updatePricingRule = async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid rule id' });
    }
    const data = pickWritable(req.body);
    const errors = validateRule(data, { partial: true });
    if (errors.length) {
      return res.status(400).json({ success: false, message: 'Validation failed', errors });
    }

    data.updatedBy = req.user?.id || null;

    const rule = await B2BPricingRule.findByIdAndUpdate(
      req.params.id,
      { $set: data },
      { new: true, runValidators: true }
    );
    if (!rule) return res.status(404).json({ success: false, message: 'Pricing rule not found' });

    return res.status(200).json({ success: true, message: 'Pricing rule updated', data: rule });
  } catch (error) {
    console.error('[Admin Pricing] update error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update pricing rule' });
  }
};

/**
 * DELETE /api/admin/b2b/pricing-rules/:id
 * Soft-deactivates by default so historical batch breakdowns stay explainable.
 * Pass ?hard=true to remove permanently.
 */
exports.deletePricingRule = async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid rule id' });
    }

    if (req.query.hard === 'true') {
      const removed = await B2BPricingRule.findByIdAndDelete(req.params.id);
      if (!removed) return res.status(404).json({ success: false, message: 'Pricing rule not found' });
      return res.status(200).json({ success: true, message: 'Pricing rule deleted' });
    }

    const rule = await B2BPricingRule.findByIdAndUpdate(
      req.params.id,
      { $set: { isActive: false, updatedBy: req.user?.id || null } },
      { new: true }
    );
    if (!rule) return res.status(404).json({ success: false, message: 'Pricing rule not found' });
    return res.status(200).json({ success: true, message: 'Pricing rule deactivated', data: rule });
  } catch (error) {
    console.error('[Admin Pricing] delete error:', error);
    return res.status(500).json({ success: false, message: 'Failed to delete pricing rule' });
  }
};

/**
 * POST /api/admin/b2b/pricing-rules/preview
 * Dry-run the engine against a hypothetical job so admins can verify a rule
 * before activating it. Reads nothing, writes nothing.
 *
 * Body: { companyId, service, subService, serviceTier, pincode, city, state, quantity }
 *   or { companyId, jobs: [...] } for a batch preview.
 */
exports.previewPricing = async (req, res) => {
  try {
    const { companyId, jobs } = req.body || {};

    if (companyId && !isValidId(companyId)) {
      return res.status(400).json({ success: false, message: 'Invalid companyId' });
    }

    if (Array.isArray(jobs) && jobs.length) {
      if (jobs.length > 1000) {
        return res.status(400).json({ success: false, message: 'Preview supports at most 1000 rows' });
      }
      const priced = await calculateBatchPricing({ companyId, jobs });
      return res.status(200).json({ success: true, data: priced });
    }

    const priced = await calculateJobPrice({
      companyId,
      serviceKey: req.body.serviceKey,
      subServiceKey: req.body.subServiceKey,
      service: req.body.service,
      subService: req.body.subService,
      categoryCode: req.body.categoryCode,
      serviceTier: req.body.serviceTier,
      priority: req.body.priority,
      emergency: req.body.emergency,
      afterHours: req.body.afterHours,
      slaTightened: req.body.slaTightened,
      vendorId: req.body.vendorId,
      pincode: req.body.pincode,
      city: req.body.city,
      state: req.body.state,
      quantity: req.body.quantity
    });

    return res.status(200).json({ success: true, data: priced });
  } catch (error) {
    console.error('[Admin Pricing] preview error:', error);
    return res.status(500).json({ success: false, message: 'Failed to preview pricing' });
  }
};
