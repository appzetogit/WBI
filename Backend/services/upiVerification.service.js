const cgpeService = require('./cgpeService');
const UpiVerification = require('../models/UpiVerification');
const VendorBank = require('../models/VendorBank');
const {
  normalizeVpa,
  isValidVpaFormat,
  normalizeMobile,
  isValidMobileFormat,
  mapProviderUpiResponse,
  mapProviderMobileUpiResponse,
  maskVpa
} = require('../utils/upi.util');
const { getRedis, isRedisConnected } = require('./redisService');

const CACHE_TTL_SEC = parseInt(process.env.UPI_VERIFY_CACHE_TTL_SEC, 10) || 3600;
const MAX_RETRIES = parseInt(process.env.UPI_VERIFY_MAX_RETRIES, 10) || 2;
const RETRY_BASE_MS = parseInt(process.env.UPI_VERIFY_RETRY_BASE_MS, 10) || 400;

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

function classifyError(err, prefix = 'UPI') {
  const msg = String(err?.message || 'Verification failed');
  if (err?.code) {
    return { code: err.code, message: msg, statusCode: err.statusCode || 422 };
  }
  const lower = msg.toLowerCase();
  if (lower.includes('invalid') && lower.includes('upi')) {
    return { code: `${prefix}_INVALID_FORMAT`, message: 'Invalid UPI ID format (e.g. name@paytm).', statusCode: 400 };
  }
  if (lower.includes('invalid') && lower.includes('mobile')) {
    return { code: 'MOBILE_INVALID_FORMAT', message: 'Enter a valid 10-digit Indian mobile number.', statusCode: 400 };
  }
  if (lower.includes('not found') || lower.includes('does not exist') || lower.includes('invalid vpa')) {
    return {
      code: `${prefix}_NOT_FOUND`,
      message: 'UPI ID not found or inactive. Please check and try again.',
      statusCode: 404
    };
  }
  if (lower.includes('timeout') || lower.includes('network')) {
    return {
      code: `${prefix}_PROVIDER_TIMEOUT`,
      message: 'Verification timed out. Please try again.',
      statusCode: 504
    };
  }
  if (lower.includes('rate') || lower.includes('too many')) {
    return {
      code: `${prefix}_RATE_LIMIT`,
      message: 'Too many verification attempts. Please wait and try again.',
      statusCode: 429
    };
  }
  return {
    code: `${prefix}_VERIFY_FAILED`,
    message: msg.replace(/^Verification Failed:\s*/i, ''),
    statusCode: 502
  };
}

async function cacheGet(key) {
  if (process.env.UPI_VERIFY_CACHE === 'false') return null;
  const redis = getRedis();
  if (!isRedisConnected() || !redis) return null;
  try {
    const raw = await redis.get(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function cacheSet(key, value) {
  if (process.env.UPI_VERIFY_CACHE === 'false') return;
  const redis = getRedis();
  if (!isRedisConnected() || !redis) return;
  try {
    await redis.set(key, JSON.stringify(value), 'EX', CACHE_TTL_SEC);
  } catch {
    /* ignore */
  }
}

async function withRetry(fn) {
  let lastErr;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
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
 * Live UPI VPA verification via CGPE.
 */
async function verifyVpa({
  vpa,
  entityType = 'unbound',
  entityId = null,
  actorType = 'anonymous',
  actorId = null,
  ipAddress = null,
  userAgent = null,
  forceRefresh = false,
  bankId = null
} = {}) {
  const cleaned = normalizeVpa(vpa);
  if (!isValidVpaFormat(cleaned)) {
    const err = new Error('Invalid UPI ID format. Example: name@paytm or 9876543210@ybl');
    err.code = 'UPI_INVALID_FORMAT';
    err.statusCode = 400;
    throw err;
  }

  let record = await UpiVerification.findOne({
    kind: 'vpa',
    vpa: cleaned,
    ...(entityId ? { entityType, entityId } : { entityType: entityType || 'unbound', entityId: null })
  }).sort({ createdAt: -1 });

  if (!record) {
    record = new UpiVerification({
      kind: 'vpa',
      vpa: cleaned,
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
  await record.save();

  const started = Date.now();
  try {
    let profile = null;
    let providerPayload = null;
    let cached = false;

    if (!forceRefresh) {
      const hit = await cacheGet(`upi:vpa:${cleaned}`);
      if (hit) {
        profile = hit;
        cached = true;
      }
    }

    if (!profile) {
      providerPayload = await withRetry(() => cgpeService.verifyUpi(cleaned));
      profile = mapProviderUpiResponse(providerPayload, cleaned);
      if (!profile.accountHolderName && process.env.UPI_REQUIRE_NAME === 'true') {
        const err = new Error('UPI ID could not be resolved. Please check the VPA.');
        err.code = 'UPI_NOT_FOUND';
        err.statusCode = 404;
        throw err;
      }
      await cacheSet(`upi:vpa:${cleaned}`, profile);
    }

    record.profile = profile;
    record.accountHolderName = profile.accountHolderName;
    record.transactionId = profile.transactionId;
    record.requestId = profile.requestId;
    record.providerResponse = providerPayload || { cached: true, data: profile };
    record.verificationStatus = 'verified';
    record.verifiedAt = new Date();
    record.errorCode = null;
    record.errorMessage = null;
    record.attempts.push({
      at: new Date(),
      status: 'success',
      transactionId: profile.transactionId,
      requestId: profile.requestId,
      latencyMs: Date.now() - started
    });
    await record.save();

    // Bind to VendorBank when requested
    if (bankId && entityType === 'vendor') {
      await VendorBank.findOneAndUpdate(
        { _id: bankId, ...(entityId ? { vendorId: entityId } : {}) },
        {
          $set: {
            upiId: cleaned,
            accountHolderName: profile.accountHolderName || undefined,
            verifiedAccountName: profile.accountHolderName || undefined,
            verificationStatus: 'verified',
            pennyDropStatus: 'not_required',
            method: 'upi',
            verifiedAt: new Date(),
            providerRef: profile.transactionId || profile.requestId || String(record._id)
          }
        }
      );
    }

    return { verification: record, profile, cached };
  } catch (err) {
    const classified = classifyError(err, 'UPI');
    record.verificationStatus = 'failed';
    record.errorCode = classified.code;
    record.errorMessage = classified.message;
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

/**
 * Mobile → linked UPI lookup via CGPE.
 */
async function lookupMobileUpi({
  mobile,
  entityType = 'unbound',
  entityId = null,
  actorType = 'anonymous',
  actorId = null,
  ipAddress = null,
  userAgent = null,
  forceRefresh = false
} = {}) {
  const cleaned = normalizeMobile(mobile);
  if (!isValidMobileFormat(cleaned)) {
    const err = new Error('Enter a valid 10-digit Indian mobile number.');
    err.code = 'MOBILE_INVALID_FORMAT';
    err.statusCode = 400;
    throw err;
  }

  let record = await UpiVerification.findOne({
    kind: 'mobile_upi',
    mobile: cleaned,
    ...(entityId ? { entityType, entityId } : { entityType: entityType || 'unbound', entityId: null })
  }).sort({ createdAt: -1 });

  if (!record) {
    record = new UpiVerification({
      kind: 'mobile_upi',
      mobile: cleaned,
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
  await record.save();

  const started = Date.now();
  try {
    let profile = null;
    let providerPayload = null;
    let cached = false;

    if (!forceRefresh) {
      const hit = await cacheGet(`upi:mobile:${cleaned}`);
      if (hit) {
        profile = hit;
        cached = true;
      }
    }

    if (!profile) {
      providerPayload = await withRetry(() => cgpeService.lookupMobileUpi(cleaned));
      profile = mapProviderMobileUpiResponse(providerPayload, cleaned);
      await cacheSet(`upi:mobile:${cleaned}`, profile);
    }

    const found = Boolean(profile.vpa);
    record.profile = profile;
    record.vpa = profile.vpa;
    record.mobileLinkedName = profile.mobileLinkedName;
    record.accountHolderName = profile.mobileLinkedName;
    record.transactionId = profile.transactionId;
    record.requestId = profile.requestId;
    record.providerResponse = providerPayload || { cached: true, data: profile };
    record.verificationStatus = found ? 'verified' : 'not_found';
    record.verifiedAt = found ? new Date() : null;
    record.errorCode = found ? null : 'MOBILE_UPI_NOT_FOUND';
    record.errorMessage = found ? null : 'No linked UPI found for this mobile. Enter UPI manually.';
    record.attempts.push({
      at: new Date(),
      status: found ? 'success' : 'not_found',
      transactionId: profile.transactionId,
      requestId: profile.requestId,
      latencyMs: Date.now() - started
    });
    await record.save();

    return { verification: record, profile, cached, found };
  } catch (err) {
    const classified = classifyError(err, 'MOBILE_UPI');
    record.verificationStatus = 'failed';
    record.errorCode = classified.code;
    record.errorMessage = classified.message;
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

/**
 * Ensure recent successful VPA verify (e.g. before UPI withdrawal).
 */
async function requireVerifiedVpa({
  vpa,
  verificationId = null,
  maxAgeHours = parseInt(process.env.UPI_VERIFY_MAX_AGE_HOURS, 10) || 720
} = {}) {
  const cleaned = normalizeVpa(vpa);
  if (!isValidVpaFormat(cleaned)) {
    const err = new Error('Invalid UPI ID format');
    err.code = 'UPI_INVALID_FORMAT';
    err.statusCode = 400;
    throw err;
  }

  let record = null;
  if (verificationId) record = await UpiVerification.findById(verificationId);
  if (!record) {
    record = await UpiVerification.findOne({
      kind: 'vpa',
      vpa: cleaned,
      verificationStatus: { $in: ['verified', 'admin_approved'] }
    }).sort({ verifiedAt: -1 });
  }

  if (!record || !['verified', 'admin_approved'].includes(record.verificationStatus)) {
    const err = new Error('Please verify the UPI ID before using it for payouts.');
    err.code = 'UPI_NOT_VERIFIED';
    err.statusCode = 422;
    throw err;
  }

  if (normalizeVpa(record.vpa) !== cleaned) {
    const err = new Error('UPI ID does not match the verified record.');
    err.code = 'UPI_MISMATCH';
    err.statusCode = 422;
    throw err;
  }

  if (record.verifiedAt && maxAgeHours > 0) {
    const ageMs = Date.now() - new Date(record.verifiedAt).getTime();
    if (ageMs > maxAgeHours * 3600 * 1000) {
      const err = new Error('UPI verification has expired. Please re-verify.');
      err.code = 'UPI_VERIFY_EXPIRED';
      err.statusCode = 422;
      throw err;
    }
  }

  return { record, profile: record.profile || {} };
}

async function listUpiVerifications(filters = {}, { page = 1, limit = 20 } = {}) {
  const q = {};
  if (filters.kind) q.kind = filters.kind;
  if (filters.status) q.verificationStatus = filters.status;
  if (filters.entityType) q.entityType = filters.entityType;
  if (filters.vpa) q.vpa = normalizeVpa(filters.vpa);
  if (filters.mobile) q.mobile = normalizeMobile(filters.mobile);
  if (filters.q) {
    const term = String(filters.q).trim();
    const re = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    q.$or = [{ vpa: re }, { mobile: re }, { accountHolderName: re }, { mobileLinkedName: re }];
  }

  const skip = (Math.max(1, page) - 1) * limit;
  const [items, total] = await Promise.all([
    UpiVerification.find(q).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    UpiVerification.countDocuments(q)
  ]);
  return { items, total, page: Number(page), limit: Number(limit) };
}

function publicUpiProfile(profile) {
  if (!profile) return null;
  return {
    vpa: profile.vpa,
    accountHolderName: profile.accountHolderName || profile.mobileLinkedName || null,
    mobile: profile.mobile || null,
    mobileLinkedName: profile.mobileLinkedName || null,
    status: profile.status,
    transactionId: profile.transactionId,
    requestId: profile.requestId
  };
}

module.exports = {
  verifyVpa,
  lookupMobileUpi,
  requireVerifiedVpa,
  listUpiVerifications,
  publicUpiProfile,
  maskVpa
};
