const mongoose = require('mongoose');

/**
 * B2BContract — the commercial agreement with a company.
 *
 * A contract is the TOP of the pricing chain: contract override → company
 * pricing profile → default pricing matrix. It also narrows what the company
 * may raise jobs for (services, locations), the SLA it is owed and how it
 * pays. Only one contract per company is ACTIVE at a time; the company's
 * activeContractId points at it.
 */

const contractPricingSchema = new mongoose.Schema({
  /** ServiceConfig.categoryCode — contracts are keyed on service keys only. */
  serviceKey: { type: String, required: true, uppercase: true, trim: true },
  subServiceKey: { type: String, default: null, uppercase: true, trim: true },
  baseAmount: { type: Number, required: true, min: 0 },
  geographicSurcharge: { type: Number, default: 0, min: 0 },
  priorityCharges: {
    Low: { type: Number, default: 0, min: 0 },
    Medium: { type: Number, default: 0, min: 0 },
    High: { type: Number, default: 0, min: 0 }
  },
  slaCharge: { type: Number, default: 0, min: 0 },
  emergencyCharge: { type: Number, default: 0, min: 0 },
  afterHoursCharge: { type: Number, default: 0, min: 0 },
  taxPercent: { type: Number, default: 18, min: 0, max: 100 },
  /** Vendor share of the job amount for settlement, 0 = platform default. */
  vendorPayoutPercent: { type: Number, default: 0, min: 0, max: 100 },
  notes: { type: String, default: '' }
}, { _id: false });

const contractSlaSchema = new mongoose.Schema({
  assignmentMinutes: { type: Number, default: null },
  acceptanceMinutes: { type: Number, default: null },
  arrivalMinutes: { type: Number, default: null },
  responseMinutes: { type: Number, default: null },
  resolutionMinutes: { type: Number, default: null },
  /** Penalty the contract attaches to a breach, for reporting only. */
  breachPenaltyPercent: { type: Number, default: 0, min: 0, max: 100 }
}, { _id: false });

const b2bContractSchema = new mongoose.Schema({
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'B2BCompany',
    required: true,
    index: true
  },
  contractCode: { type: String, required: true, unique: true, trim: true },
  title: { type: String, default: '', trim: true },
  status: {
    type: String,
    enum: ['DRAFT', 'ACTIVE', 'EXPIRED', 'TERMINATED'],
    default: 'DRAFT',
    index: true
  },

  /** Service keys covered. Empty = the company's own allowedServices apply. */
  services: [{ type: String, uppercase: true, trim: true }],
  allowedLocations: [{
    type: { type: String, enum: ['city', 'pincode', 'state', 'zone'], default: 'city' },
    value: { type: String, trim: true }
  }],

  /** Per-service overrides; the first match on serviceKey wins. */
  pricing: [contractPricingSchema],
  sla: { type: contractSlaSchema, default: () => ({}) },

  paymentTerms: {
    mode: {
      type: String,
      enum: ['PREPAID_WALLET', 'CREDIT', 'POSTPAID_INVOICE'],
      default: 'PREPAID_WALLET'
    },
    creditLimit: { type: Number, default: 0, min: 0 },
    paymentTermsDays: { type: Number, default: 0, min: 0 },
    /** Balance the company must keep before bulk uploads are accepted. */
    minimumWalletBalance: { type: Number, default: 0, min: 0 },
    /** Reserve the full upload cost before any job is created. */
    reservationRequired: { type: Boolean, default: true }
  },

  /** Routing constraints this contract imposes, over the platform defaults. */
  assignmentRules: {
    preferredVendorIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Vendor' }],
    excludedVendorIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Vendor' }],
    allowFreelancers: { type: Boolean, default: true },
    /** vendor_first · freelancer_first · vendor_only · freelancer_only */
    routingMode: {
      type: String,
      enum: ['vendor_first', 'freelancer_first', 'vendor_only', 'freelancer_only', 'platform_default'],
      default: 'platform_default'
    }
  },

  validFrom: { type: Date, required: true },
  validTo: { type: Date, default: null },
  documentUrl: { type: String, default: null },
  notes: { type: String, default: '' },

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  terminatedAt: { type: Date, default: null },
  terminationReason: { type: String, default: null }
}, { timestamps: true });

b2bContractSchema.index({ companyId: 1, status: 1, validFrom: -1 });
b2bContractSchema.index({ status: 1, validTo: 1 });

/** True while the contract is ACTIVE and today falls inside its window. */
b2bContractSchema.methods.isInForce = function (at = new Date()) {
  if (this.status !== 'ACTIVE') return false;
  if (this.validFrom && at < this.validFrom) return false;
  if (this.validTo && at > this.validTo) return false;
  return true;
};

module.exports = mongoose.model('B2BContract', b2bContractSchema);
