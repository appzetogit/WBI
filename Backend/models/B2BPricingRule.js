const mongoose = require('mongoose');

/**
 * B2BPricingRule
 * --------------
 * Admin-managed, configuration-driven pricing for B2B service jobs.
 *
 * Replaces the flat `B2BDeductionRule.perJobCharge` model with rules that can
 * vary by company, service, tier, vendor and geography. Resolution picks the
 * most SPECIFIC matching rule (see b2bPricingEngine.resolvePricingRule), so a
 * platform-wide default and a company/service/pincode override can coexist.
 *
 * A null scope field means "matches anything" for that dimension.
 *
 * Nothing here is consumed by the frontend directly — the pricing engine owns
 * all arithmetic so pricing can change without a deploy.
 */

const volumeDiscountSchema = new mongoose.Schema({
  /** Discount applies when the batch has at least this many billable jobs. */
  minQuantity: { type: Number, required: true, min: 1 },
  discountPercent: { type: Number, required: true, min: 0, max: 100 },
  label: { type: String, default: '' }
}, { _id: false });

const additionalChargeSchema = new mongoose.Schema({
  label: { type: String, required: true, trim: true },
  amount: { type: Number, required: true, default: 0 },
  /** flat = per job; percent = of base + service charge */
  mode: { type: String, enum: ['flat', 'percent'], default: 'flat' },
  taxable: { type: Boolean, default: true }
}, { _id: false });

const b2bPricingRuleSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, default: '' },

  // ── Scope (null / empty = wildcard) ─────────────────────────────────
  /** null = platform default rule, applies to every company. */
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'B2BCompany',
    default: null,
    index: true
  },
  /** Free-text service name as it appears on B2BJob.service. null = any. */
  service: { type: String, default: null, trim: true, index: true },
  subService: { type: String, default: null, trim: true },
  /** Matches ServiceConfig.categoryCode when the catalog is seeded. */
  categoryCode: { type: String, default: null, uppercase: true, trim: true },
  serviceTier: {
    type: String,
    enum: ['standard', 'priority', 'premium', 'any'],
    default: 'any'
  },
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    default: null
  },

  // ── Geography (empty array = wildcard) ──────────────────────────────
  region: {
    states: [{ type: String, trim: true }],
    cities: [{ type: String, trim: true }],
    /** Prefix match, e.g. "452" covers all 452xxx pincodes. */
    pincodePrefixes: [{ type: String, trim: true }]
  },

  // ── Amounts ─────────────────────────────────────────────────────────
  baseAmount: { type: Number, required: true, default: 0, min: 0 },
  serviceCharge: { type: Number, default: 0, min: 0 },
  /** Applied only when the job matched this rule on a geographic dimension. */
  geographicSurcharge: { type: Number, default: 0, min: 0 },
  additionalCharges: [additionalChargeSchema],
  volumeDiscounts: [volumeDiscountSchema],

  /** GST / applicable tax on the taxable subtotal. */
  taxPercent: { type: Number, default: 18, min: 0, max: 100 },
  taxLabel: { type: String, default: 'GST' },

  /** Payout reference for vendor/engineer settlement. 0 = use platform default. */
  vendorPayoutPercent: { type: Number, default: 0, min: 0, max: 100 },

  currency: { type: String, default: 'INR' },

  // ── Lifecycle ───────────────────────────────────────────────────────
  /** Higher wins when two rules score the same specificity. */
  priority: { type: Number, default: 0, index: true },
  effectiveFrom: { type: Date, default: Date.now },
  effectiveTo: { type: Date, default: null },
  isActive: { type: Boolean, default: true, index: true },

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null }
}, { timestamps: true });

// Resolution always filters on active + effective window, then scopes.
b2bPricingRuleSchema.index({ isActive: 1, companyId: 1, service: 1, priority: -1 });
b2bPricingRuleSchema.index({ isActive: 1, effectiveFrom: 1, effectiveTo: 1 });

module.exports = mongoose.model('B2BPricingRule', b2bPricingRuleSchema);
