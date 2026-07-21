/**
 * Vendor Company Code — generation, normalization, lookup.
 * Format: WBI-{YYYY}-{6 alphanumeric} e.g. WBI-2026-X7K9M2
 * Ambiguous chars excluded: 0/O, 1/I/L
 */
const crypto = require('crypto');
const Vendor = require('../models/Vendor');

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0,O,1,I,L
const CODE_SUFFIX_LEN = 6;
const MAX_GEN_RETRIES = 5;

function normalizeVendorCode(raw) {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

function randomSuffix(len = CODE_SUFFIX_LEN) {
  const bytes = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) {
    out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return out;
}

function buildCode(year = new Date().getFullYear()) {
  return `WBI-${year}-${randomSuffix()}`;
}

/**
 * Generate a unique active company code (does not save).
 * @returns {Promise<string>}
 */
async function generateUniqueCompanyCode() {
  for (let attempt = 0; attempt < MAX_GEN_RETRIES; attempt++) {
    const code = buildCode();
    const exists = await Vendor.exists({
      $or: [
        { uniqueCompanyCode: code },
        { 'companyCodeHistory.code': code }
      ]
    });
    if (!exists) return code;
  }
  throw new Error('Failed to generate unique vendor company code after retries');
}

/**
 * Ensure vendor has an active uniqueCompanyCode. Creates one if missing.
 * Call on admin approve / activate / first dashboard view.
 */
async function ensureVendorCompanyCode(vendor) {
  if (!vendor) return null;
  if (vendor.uniqueCompanyCode && vendor.codeStatus === 'active') {
    return vendor.uniqueCompanyCode;
  }
  const code = await generateUniqueCompanyCode();
  vendor.uniqueCompanyCode = code;
  vendor.codeStatus = 'active';
  vendor.codeGeneratedAt = new Date();
  if (typeof vendor.codeRegeneratedCount !== 'number') {
    vendor.codeRegeneratedCount = 0;
  }
  await vendor.save();
  return code;
}

/**
 * Find approved vendor by active company code only (no email/phone).
 */
async function findVendorByActiveCode(rawCode) {
  const code = normalizeVendorCode(rawCode);
  if (!code || !/^WBI-\d{4}-[A-Z0-9]{6}$/.test(code)) {
    return null;
  }
  return Vendor.findOne({
    uniqueCompanyCode: code,
    codeStatus: 'active',
    approvalStatus: 'approved'
  }).select('_id businessName name uniqueCompanyCode codeStatus approvalStatus');
}

/**
 * Invite token helpers
 */
function generateInviteToken() {
  return crypto.randomBytes(24).toString('hex'); // 48 hex chars; use 32-char slice for URL friendliness
}

module.exports = {
  normalizeVendorCode,
  generateUniqueCompanyCode,
  ensureVendorCompanyCode,
  findVendorByActiveCode,
  generateInviteToken,
  buildCode
};
