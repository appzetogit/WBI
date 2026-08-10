const cgpeService = require('./cgpeService');
const GstVerification = require('../models/GstVerification');
const Vendor = require('../models/Vendor');
const B2BCompany = require('../models/B2BCompany');
const {
  normalizeGstin,
  isValidGstinFormat,
  mapProviderGstResponse,
  assertGstActive,
  maskGstin
} = require('../utils/gst.util');
const { getRedis, isRedisConnected } = require('./redisService');

const CACHE_TTL_SEC = parseInt(process.env.GST_VERIFY_CACHE_TTL_SEC, 10) || 3600;
const MAX_RETRIES = parseInt(process.env.GST_VERIFY_MAX_RETRIES, 10) || 2;
const RETRY_BASE_MS = parseInt(process.env.GST_VERIFY_RETRY_BASE_MS, 10) || 400;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function isRetryableError(err) {
  const msg = String(err?.message || '').toLowerCase();
  const status = err?.response?.status || err?.statusCode;
  if (status === 429 || status === 502 || status === 503 || status === 504) return true;
  return (
    msg.includes('timeout') ||
    msg.includes('econnreset') ||
    msg.includes('network') ||
    msg.includes('temporar') ||
    msg.includes('rate limit')
  );
}

function classifyError(err) {
  const msg = String(err?.message || 'Verification failed');
  if (err?.code) {
    return { code: err.code, message: msg, statusCode: err.statusCode || 422 };
  }
  const lower = msg.toLowerCase();
  if (lower.includes('invalid gst') || lower.includes('format')) {
    return { code: 'GST_INVALID_FORMAT', message: 'Invalid GSTIN format. Example: 27ABCDE1234F1Z5', statusCode: 400 };
  }
  if (lower.includes('cancel')) {
    return { code: 'GST_CANCELLED', message: 'This GSTIN is cancelled and cannot be used.', statusCode: 422 };
  }
  if (lower.includes('suspend')) {
    return { code: 'GST_SUSPENDED', message: 'This GSTIN is suspended and cannot be used.', statusCode: 422 };
  }
  if (lower.includes('not found') || lower.includes('inactive') || lower.includes('does not exist')) {
    return { code: 'GST_NOT_FOUND', message: 'GSTIN not found or inactive in the GST portal.', statusCode: 404 };
  }
  if (lower.includes('timeout') || lower.includes('network')) {
    return { code: 'GST_PROVIDER_TIMEOUT', message: 'GST verification timed out. Please try again.', statusCode: 504 };
  }
  if (lower.includes('rate') || lower.includes('too many')) {
    return { code: 'GST_RATE_LIMIT', message: 'Too many GST verification attempts. Please wait and try again.', statusCode: 429 };
  }
  if (lower.includes('ip not') || lower.includes('whitelist')) {
    return {
      code: 'GST_PROVIDER_IP',
      message: 'Verification service is temporarily unavailable from this server. Admin: whitelist server IP at the GSP portal.',
      statusCode: 503
    };
  }
  return { code: 'GST_VERIFY_FAILED', message: msg.replace(/^Verification Failed:\s*/i, ''), statusCode: 502 };
}

async function cacheGet(gstin) {
  if (process.env.GST_VERIFY_CACHE === 'false') return null;
  const redis = getRedis();
  if (!isRedisConnected() || !redis) return null;
  try {
    const raw = await redis.get(`gst:verify:${gstin}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function cacheSet(gstin, profile) {
  if (process.env.GST_VERIFY_CACHE === 'false') return;
  const redis = getRedis();
  if (!isRedisConnected() || !redis) return;
  try {
    await redis.set(`gst:verify:${gstin}`, JSON.stringify(profile), 'EX', CACHE_TTL_SEC);
  } catch {
    /* ignore */
  }
}

async function callProviderWithRetry(gstin) {
  let lastErr;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await cgpeService.verifyGst(gstin);
    } catch (err) {
      lastErr = err;
      if (attempt < MAX_RETRIES && isRetryableError(err)) {
        await sleep(RETRY_BASE_MS * Math.pow(2, attempt));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

/**
 * Check if GSTIN already registered for another active entity.
 */
async function assertNotDuplicate({ gstin, entityType, entityId }) {
  if (process.env.GST_ALLOW_DUPLICATE === 'true') return;

  const vendorQ = {
    gstin,
    approvalStatus: { $nin: ['rejected', 'suspended'] }
  };
  if (entityType === 'vendor' && entityId) vendorQ._id = { $ne: entityId };

  const existingVendor = await Vendor.findOne(vendorQ).select('_id').lean();
  if (existingVendor) {
    const err = new Error('This GSTIN is already registered with another vendor on the platform.');
    err.code = 'GST_DUPLICATE';
    err.statusCode = 409;
    throw err;
  }

  const b2bQ = {
    gstNumber: gstin,
    isActive: true,
    verificationStatus: { $ne: 'rejected' }
  };
  if (entityType === 'b2b' && entityId) b2bQ._id = { $ne: entityId };

  const existingB2b = await B2BCompany.findOne(b2bQ).select('_id').lean();
  if (existingB2b) {
    const err = new Error('This GSTIN is already registered with another B2B company.');
    err.code = 'GST_DUPLICATE';
    err.statusCode = 409;
    throw err;
  }
}

/**
 * Optional business-name / PAN cross-check against user-supplied values.
 */
function assertIdentityMatch(profile, { expectedLegalName, expectedPan } = {}) {
  if (expectedPan && profile.pan) {
    if (String(expectedPan).toUpperCase().trim() !== profile.pan) {
      const err = new Error('PAN does not match PAN embedded in the verified GSTIN.');
      err.code = 'GST_PAN_MISMATCH';
      err.statusCode = 422;
      throw err;
    }
  }
  if (expectedLegalName && profile.legalName) {
    const a = expectedLegalName.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const b = profile.legalName.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (a && b && !b.includes(a) && !a.includes(b) && a !== b) {
      const err = new Error('Business name does not match the legal name on the GST portal.');
      err.code = 'GST_NAME_MISMATCH';
      err.statusCode = 422;
      throw err;
    }
  }
}

/**
 * Live GST verification via CGPE/GSP with logging, cache, retries, and entity binding.
 *
 * @returns {{ verification, profile, cached }}
 */
async function verifyGst({
  gstNumber,
  entityType = 'unbound',
  entityId = null,
  actorType = 'anonymous',
  actorId = null,
  ipAddress = null,
  userAgent = null,
  expectedLegalName = null,
  expectedPan = null,
  skipDuplicateCheck = false,
  forceRefresh = false
} = {}) {
  const gstin = normalizeGstin(gstNumber);

  if (!isValidGstinFormat(gstin)) {
    const err = new Error('Invalid GSTIN format. Example: 27ABCDE1234F1Z5');
    err.code = 'GST_INVALID_FORMAT';
    err.statusCode = 400;
    throw err;
  }

  if (!skipDuplicateCheck) {
    await assertNotDuplicate({ gstin, entityType, entityId });
  }

  let record = await GstVerification.findOne({
    gstin,
    ...(entityId
      ? { entityType, entityId }
      : { entityType: entityType || 'unbound', entityId: null })
  }).sort({ createdAt: -1 });

  if (!record) {
    record = new GstVerification({
      gstin,
      entityType: entityType || 'unbound',
      entityId: entityId || null,
      actorType,
      actorId,
      ipAddress,
      userAgent
    });
  }

  record.verificationStatus = 'verifying';
  record.attemptCount = (record.attemptCount || 0) + 1;
  record.lastVerificationAt = new Date();
  record.ipAddress = ipAddress || record.ipAddress;
  record.userAgent = userAgent || record.userAgent;
  await record.save();

  const started = Date.now();

  try {
    let providerPayload = null;
    let profile = null;
    let cached = false;

    if (!forceRefresh) {
      const cachedProfile = await cacheGet(gstin);
      if (cachedProfile) {
        profile = cachedProfile;
        cached = true;
      }
    }

    if (!profile) {
      providerPayload = await callProviderWithRetry(gstin);
      profile = mapProviderGstResponse(providerPayload, gstin);
      // Fail closed on cancelled/suspended
      assertGstActive(profile.registrationStatus, { hasLegalName: Boolean(profile.legalName) });
      await cacheSet(gstin, profile);
    } else {
      assertGstActive(profile.registrationStatus, { hasLegalName: Boolean(profile.legalName) });
    }

    assertIdentityMatch(profile, { expectedLegalName, expectedPan });

    record.profile = profile;
    record.provider = 'cgpe';
    record.apiReferenceId = profile.apiReferenceId;
    record.providerResponse = providerPayload
      ? {
          success: providerPayload.success,
          message: providerPayload.message,
          statusCode: providerPayload.statusCode,
          // Store mapped fields + lightweight raw (avoid huge dumps)
          data: profile
        }
      : { cached: true, data: profile };
    record.verificationStatus = 'verified';
    record.verifiedAt = new Date();
    record.lastVerificationAt = new Date();
    record.errorCode = null;
    record.errorMessage = null;
    record.lockedFields = true;
    record.attempts.push({
      at: new Date(),
      status: 'success',
      apiReferenceId: profile.apiReferenceId,
      latencyMs: Date.now() - started
    });
    await record.save();

    // Persist onto Vendor / B2BCompany when bound
    await applyProfileToEntity({ entityType, entityId, profile, verificationId: record._id });

    return { verification: record, profile, cached };
  } catch (err) {
    const classified = classifyError(err);
    if (err.code === 'GST_CANCELLED') record.verificationStatus = 'cancelled_gst';
    else if (err.code === 'GST_SUSPENDED') record.verificationStatus = 'suspended_gst';
    else record.verificationStatus = 'failed';

    record.errorCode = classified.code;
    record.errorMessage = classified.message;
    record.lastVerificationAt = new Date();
    record.attempts.push({
      at: new Date(),
      status: 'failed',
      errorCode: classified.code,
      errorMessage: classified.message,
      latencyMs: Date.now() - started
    });
    await record.save().catch(() => {});

    const e = new Error(classified.message);
    e.code = classified.code;
    e.statusCode = classified.statusCode;
    e.verificationId = record._id;
    throw e;
  }
}

function buildEntityGstPayload(profile, verificationId, verificationStatus = 'verified') {
  return {
    gstin: profile.gstin,
    verificationStatus,
    verifiedAt: new Date(),
    verificationId,
    legalName: profile.legalName,
    tradeName: profile.tradeName,
    pan: profile.pan,
    constitutionOfBusiness: profile.constitutionOfBusiness,
    taxpayerType: profile.taxpayerType,
    registrationStatus: profile.registrationStatus,
    registrationDate: profile.registrationDate,
    businessAddress: profile.businessAddress,
    state: profile.state,
    stateCode: profile.stateCode,
    pincode: profile.pincode,
    natureOfBusiness: profile.natureOfBusiness,
    lastUpdated: profile.lastUpdated,
    locked: true
  };
}

async function applyProfileToEntity({ entityType, entityId, profile, verificationId }) {
  if (!entityId || !entityType) return;

  const gstPayload = buildEntityGstPayload(profile, verificationId, 'verified');

  if (entityType === 'vendor') {
    await Vendor.findByIdAndUpdate(entityId, {
      $set: {
        gstin: profile.gstin,
        businessName: profile.legalName || profile.tradeName,
        'compliance.gstVerified': true,
        gstVerification: gstPayload
      }
    });
  }

  if (entityType === 'b2b') {
    await B2BCompany.findByIdAndUpdate(entityId, {
      $set: {
        gstNumber: profile.gstin,
        companyName: profile.legalName || undefined,
        brandName: profile.tradeName || undefined,
        panNumber: profile.pan || undefined,
        companyAddress: profile.businessAddress || undefined,
        gstVerification: gstPayload
      }
    });
  }
}

/**
 * Ensure a recent successful live GST verify exists before registration proceeds.
 * Binds the unbound verification record to the new entity when entityId is provided.
 *
 * @returns {{ record, profile }}
 */
async function requireSuccessfulGstVerification({
  gstin,
  verificationId = null,
  entityType = 'unbound',
  entityId = null,
  maxAgeHours = parseInt(process.env.GST_VERIFY_MAX_AGE_HOURS, 10) || 72
} = {}) {
  const normalized = normalizeGstin(gstin);
  if (!isValidGstinFormat(normalized)) {
    const err = new Error('Invalid GSTIN format. Example: 27ABCDE1234F1Z5');
    err.code = 'GST_INVALID_FORMAT';
    err.statusCode = 400;
    throw err;
  }

  let record = null;
  if (verificationId) {
    record = await GstVerification.findById(verificationId);
  }
  if (!record) {
    record = await GstVerification.findOne({
      gstin: normalized,
      verificationStatus: { $in: ['verified', 'admin_approved'] },
      $or: [{ entityId: null }, ...(entityId ? [{ entityId }] : [])]
    }).sort({ verifiedAt: -1, createdAt: -1 });
  }

  if (!record || !['verified', 'admin_approved'].includes(record.verificationStatus)) {
    const err = new Error('Please verify your GSTIN with the GST portal before continuing registration.');
    err.code = 'GST_NOT_VERIFIED';
    err.statusCode = 422;
    throw err;
  }

  if (normalizeGstin(record.gstin) !== normalized) {
    const err = new Error('GSTIN does not match the verified record. Please re-verify.');
    err.code = 'GST_MISMATCH';
    err.statusCode = 422;
    throw err;
  }

  if (record.verifiedAt && maxAgeHours > 0) {
    const ageMs = Date.now() - new Date(record.verifiedAt).getTime();
    if (ageMs > maxAgeHours * 3600 * 1000) {
      const err = new Error('GST verification has expired. Please re-verify your GSTIN.');
      err.code = 'GST_VERIFY_EXPIRED';
      err.statusCode = 422;
      throw err;
    }
  }

  assertGstActive(record.profile?.registrationStatus, {
    hasLegalName: Boolean(record.profile?.legalName)
  });

  if (entityId && entityType && entityType !== 'unbound') {
    record.entityType = entityType;
    record.entityId = entityId;
    await record.save();
    await applyProfileToEntity({
      entityType,
      entityId,
      profile: record.profile,
      verificationId: record._id
    });
  }

  return { record, profile: record.profile || {} };
}

async function adminOverride({
  verificationId,
  action, // approve | reject
  reason,
  adminId
}) {
  const record = await GstVerification.findById(verificationId);
  if (!record) {
    const err = new Error('GST verification record not found');
    err.statusCode = 404;
    throw err;
  }
  if (action === 'approve') {
    record.verificationStatus = 'admin_approved';
    record.verifiedAt = new Date();
    record.lockedFields = true;
  } else {
    record.verificationStatus = 'admin_rejected';
    record.lockedFields = false;
  }
  record.adminOverride = {
    overridden: true,
    by: adminId,
    at: new Date(),
    reason: reason || null,
    action
  };
  await record.save();

  if (record.entityType === 'vendor' && record.entityId) {
    await Vendor.findByIdAndUpdate(record.entityId, {
      $set: {
        'compliance.gstVerified': action === 'approve',
        'gstVerification.verificationStatus': action === 'approve' ? 'admin_approved' : 'admin_rejected',
        'gstVerification.locked': action === 'approve'
      }
    });
  }
  if (record.entityType === 'b2b' && record.entityId) {
    await B2BCompany.findByIdAndUpdate(record.entityId, {
      $set: {
        'gstVerification.verificationStatus': action === 'approve' ? 'admin_approved' : 'admin_rejected',
        'gstVerification.locked': action === 'approve'
      }
    });
  }

  return record;
}

async function listVerifications(filters = {}, { page = 1, limit = 20 } = {}) {
  const q = {};
  if (filters.status) q.verificationStatus = filters.status;
  if (filters.entityType) q.entityType = filters.entityType;
  if (filters.gstin) q.gstin = normalizeGstin(filters.gstin);
  if (filters.entityId) q.entityId = filters.entityId;

  const skip = (Math.max(1, page) - 1) * limit;
  const [items, total] = await Promise.all([
    GstVerification.find(q).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    GstVerification.countDocuments(q)
  ]);
  return { items, total, page: Number(page), limit: Number(limit) };
}

function publicProfile(profile) {
  if (!profile) return null;
  return {
    gstin: profile.gstin,
    legalName: profile.legalName,
    tradeName: profile.tradeName,
    pan: profile.pan,
    constitutionOfBusiness: profile.constitutionOfBusiness,
    taxpayerType: profile.taxpayerType,
    registrationStatus: profile.registrationStatus,
    registrationDate: profile.registrationDate,
    businessAddress: profile.businessAddress,
    state: profile.state,
    stateCode: profile.stateCode,
    pincode: profile.pincode,
    natureOfBusiness: profile.natureOfBusiness,
    lastUpdated: profile.lastUpdated
  };
}

module.exports = {
  verifyGst,
  adminOverride,
  listVerifications,
  publicProfile,
  maskGstin,
  classifyError,
  assertNotDuplicate,
  requireSuccessfulGstVerification,
  buildEntityGstPayload,
  applyProfileToEntity
};
