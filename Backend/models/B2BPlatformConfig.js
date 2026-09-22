const mongoose = require('mongoose');

/**
 * B2BPlatformConfig — the single admin-editable settings document for the B2B
 * ecosystem (routing, SLA defaults, payment methods, bulk limits, demo mode).
 *
 * One document, `key: 'default'`. Every service reads it through
 * getB2BConfig() so a settings change takes effect without a deploy, and no
 * timeout, threshold or fee is hardcoded in a controller or the frontend.
 */

const slaProfileSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  assignmentMinutes: { type: Number, default: 30 },
  acceptanceMinutes: { type: Number, default: 15 },
  arrivalMinutes: { type: Number, default: 240 },
  responseMinutes: { type: Number, default: 60 },
  resolutionMinutes: { type: Number, default: 1440 },
  isDefault: { type: Boolean, default: false }
}, { _id: false });

const topUpMethodSchema = new mongoose.Schema({
  /** CORPORATE_CARD · UPI · BANK_TRANSFER · PAYMENT_GATEWAY · DEMO */
  key: { type: String, required: true, uppercase: true, trim: true },
  label: { type: String, required: true, trim: true },
  enabled: { type: Boolean, default: true },
  minAmount: { type: Number, default: 0 },
  maxAmount: { type: Number, default: 0 },
  /** Instructions / account details shown to the company on the top-up screen. */
  instructions: { type: String, default: '' },
  /** Needs an admin to confirm receipt before the wallet is credited. */
  requiresApproval: { type: Boolean, default: false }
}, { _id: false });

const b2bPlatformConfigSchema = new mongoose.Schema({
  key: { type: String, default: 'default', unique: true, index: true },

  // ── Routing ───────────────────────────────────────────────────────────────
  routing: {
    /** Which provider pool is tried first. */
    mode: {
      type: String,
      enum: ['vendor_first', 'freelancer_first', 'vendor_only', 'freelancer_only'],
      default: 'vendor_first'
    },
    /** How long a vendor has to accept an offer before it lapses. */
    vendorOfferTimeoutMinutes: { type: Number, default: 10, min: 1 },
    /** How long an engineer/freelancer has to accept before the job EXPIRES. */
    engineerAcceptTimeoutMinutes: { type: Number, default: 10, min: 1 },
    /** Radii, in km, tried in order when searching for freelancers. */
    freelancerWaveRadiiKm: { type: [Number], default: [5, 10, 20, 50, 100] },
    /** Jobs an engineer may hold at once before routing skips them. */
    engineerMaxActiveJobs: { type: Number, default: 5, min: 1 },
    /** Consecutive failed offers before the job goes to the unassigned queue. */
    maxFallbackAttempts: { type: Number, default: 3, min: 1 },
    /** Order tried after a rejection/expiry, before giving up. */
    fallbackOrder: {
      type: [String],
      default: ['next_vendor', 'freelancer_pool', 'admin_escalation']
    },
    /** Park the job as UNASSIGNED instead of retrying forever. */
    escalateToUnassigned: { type: Boolean, default: true }
  },

  // ── SLA ───────────────────────────────────────────────────────────────────
  sla: {
    profiles: { type: [slaProfileSchema], default: undefined },
    /** How often the SLA checker looks for jobs past a due time (cron). */
    checkCron: { type: String, default: '*/5 * * * *' },
    breachNotificationsEnabled: { type: Boolean, default: true }
  },

  // ── Payments & wallet ─────────────────────────────────────────────────────
  payments: {
    topUpMethods: { type: [topUpMethodSchema], default: undefined },
    /** Reserve the full cost of an upload before any job is created. */
    reservationRequired: { type: Boolean, default: true },
    /** Allow DEMO companies to top up with simulated money. */
    demoPaymentsEnabled: { type: Boolean, default: false },
    /** Minimum available balance a company must keep. */
    minimumWalletBalance: { type: Number, default: 0 },
    /** Warn the company below this available balance. */
    lowBalanceThreshold: { type: Number, default: 5000 },
    defaultTaxPercent: { type: Number, default: 18, min: 0, max: 100 },
    /** Platform's cut of the job amount when settling vendors/freelancers. */
    platformFeePercent: { type: Number, default: 20, min: 0, max: 100 }
  },

  // ── After-hours / emergency window ────────────────────────────────────────
  businessHours: {
    start: { type: String, default: '09:00' },
    end: { type: String, default: '18:00' },
    /** 0 = Sunday … 6 = Saturday. */
    workingDays: { type: [Number], default: [1, 2, 3, 4, 5, 6] },
    timezone: { type: String, default: 'Asia/Kolkata' }
  },

  // ── Bulk upload ───────────────────────────────────────────────────────────
  bulkUpload: {
    maxRows: { type: Number, default: 1000, min: 1 },
    maxFileSizeMb: { type: Number, default: 10, min: 1 },
    allowedExtensions: { type: [String], default: ['.xlsx', '.csv'] },
    /** Reject the upload when it carries columns the template does not define. */
    rejectUnknownColumns: { type: Boolean, default: false },
    /** Treat rows matching an open job (same phone + address + service) as duplicates. */
    duplicateCheckEnabled: { type: Boolean, default: true },
    duplicateWindowDays: { type: Number, default: 7, min: 0 }
  },

  // ── Notifications ─────────────────────────────────────────────────────────
  notifications: {
    /** Event keys that are muted platform-wide (see notification eventCatalog). */
    disabledEvents: { type: [String], default: [] },
    channels: {
      inApp: { type: Boolean, default: true },
      push: { type: Boolean, default: true },
      email: { type: Boolean, default: true },
      sms: { type: Boolean, default: false }
    }
  },

  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null }
}, { timestamps: true });

module.exports = mongoose.model('B2BPlatformConfig', b2bPlatformConfigSchema);
