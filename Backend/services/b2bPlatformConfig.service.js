const B2BPlatformConfig = require('../models/B2BPlatformConfig');

/**
 * Reader for the single B2B settings document.
 *
 * Every B2B service asks this module for timeouts, SLA thresholds, payment
 * methods and bulk limits instead of hardcoding them. The document is cached
 * for a short window because it is read on every job transition; admin writes
 * call invalidateB2BConfig() so a change is visible immediately.
 */

const CACHE_TTL_MS = 30 * 1000;

const DEFAULT_SLA_PROFILES = [
  {
    name: 'standard',
    assignmentMinutes: 30,
    acceptanceMinutes: 15,
    arrivalMinutes: 240,
    responseMinutes: 60,
    resolutionMinutes: 1440,
    isDefault: true
  },
  {
    name: 'priority',
    assignmentMinutes: 15,
    acceptanceMinutes: 10,
    arrivalMinutes: 120,
    responseMinutes: 30,
    resolutionMinutes: 480,
    isDefault: false
  },
  {
    name: 'emergency',
    assignmentMinutes: 5,
    acceptanceMinutes: 5,
    arrivalMinutes: 60,
    responseMinutes: 15,
    resolutionMinutes: 240,
    isDefault: false
  }
];

const DEFAULT_TOPUP_METHODS = [
  { key: 'PAYMENT_GATEWAY', label: 'Card / Netbanking (Razorpay)', enabled: true, minAmount: 500, maxAmount: 0, instructions: '', requiresApproval: false },
  { key: 'UPI', label: 'UPI', enabled: true, minAmount: 100, maxAmount: 100000, instructions: '', requiresApproval: false },
  { key: 'BANK_TRANSFER', label: 'Bank transfer (NEFT/RTGS)', enabled: true, minAmount: 1000, maxAmount: 0, instructions: 'Share the UTR after transferring; the wallet is credited once finance confirms receipt.', requiresApproval: true },
  { key: 'CORPORATE_CARD', label: 'Corporate card', enabled: false, minAmount: 500, maxAmount: 0, instructions: '', requiresApproval: false }
];

let cache = null;
let cachedAt = 0;

/** Defaults used when no document exists yet — same shape as the schema. */
function defaults() {
  const doc = new B2BPlatformConfig({ key: 'default' }).toObject();
  delete doc._id;
  doc.sla.profiles = DEFAULT_SLA_PROFILES;
  doc.payments.topUpMethods = DEFAULT_TOPUP_METHODS;
  return doc;
}

function withDefaults(doc) {
  if (!doc) return defaults();
  const out = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };
  out.sla = out.sla || {};
  if (!out.sla.profiles || !out.sla.profiles.length) out.sla.profiles = DEFAULT_SLA_PROFILES;
  out.payments = out.payments || {};
  if (!out.payments.topUpMethods || !out.payments.topUpMethods.length) {
    out.payments.topUpMethods = DEFAULT_TOPUP_METHODS;
  }
  return out;
}

/** The settings document, creating it on first use. Cached for CACHE_TTL_MS. */
async function getB2BConfig({ fresh = false } = {}) {
  if (!fresh && cache && Date.now() - cachedAt < CACHE_TTL_MS) return cache;
  let doc = await B2BPlatformConfig.findOne({ key: 'default' }).lean();
  if (!doc) {
    // Upsert so every environment converges on one document.
    doc = await B2BPlatformConfig.findOneAndUpdate(
      { key: 'default' },
      { $setOnInsert: { key: 'default' } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();
  }
  cache = withDefaults(doc);
  cachedAt = Date.now();
  return cache;
}

function invalidateB2BConfig() {
  cache = null;
  cachedAt = 0;
}

/** SLA thresholds for a named profile, falling back to the default profile. */
async function getSlaProfile(name) {
  const cfg = await getB2BConfig();
  const profiles = cfg.sla.profiles || [];
  return (
    profiles.find((p) => p.name && name && p.name.toLowerCase() === String(name).toLowerCase())
    || profiles.find((p) => p.isDefault)
    || profiles[0]
    || DEFAULT_SLA_PROFILES[0]
  );
}

/** Top-up methods a company may actually use, given its billing mode. */
async function getTopUpMethods({ billingMode = 'LIVE' } = {}) {
  const cfg = await getB2BConfig();
  const methods = (cfg.payments.topUpMethods || []).filter((m) => m.enabled);
  if (billingMode === 'DEMO' && cfg.payments.demoPaymentsEnabled) {
    return [
      ...methods,
      {
        key: 'DEMO',
        label: 'Simulated top-up (demo account)',
        enabled: true,
        minAmount: 0,
        maxAmount: 0,
        instructions: 'Demo money. Never settled as a real transaction.',
        requiresApproval: false
      }
    ];
  }
  return methods;
}

/** Whether `at` falls outside the configured business hours. */
async function isAfterHours(at = new Date()) {
  const cfg = await getB2BConfig();
  const bh = cfg.businessHours || {};
  const days = bh.workingDays && bh.workingDays.length ? bh.workingDays : [1, 2, 3, 4, 5, 6];
  if (!days.includes(at.getDay())) return true;
  const [sh, sm] = String(bh.start || '09:00').split(':').map(Number);
  const [eh, em] = String(bh.end || '18:00').split(':').map(Number);
  const minutes = at.getHours() * 60 + at.getMinutes();
  return minutes < (sh * 60 + sm) || minutes >= (eh * 60 + em);
}

module.exports = {
  getB2BConfig,
  invalidateB2BConfig,
  getSlaProfile,
  getTopUpMethods,
  isAfterHours,
  DEFAULT_SLA_PROFILES,
  DEFAULT_TOPUP_METHODS
};
