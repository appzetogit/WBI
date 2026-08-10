const cgpeService = require('./cgpeService');
const LocationVerification = require('../models/LocationVerification');
const {
  isValidCoordinates,
  mapProviderLocationResponse,
  fullAddressLine,
  toNumber
} = require('../utils/location.util');
const { getRedis, isRedisConnected } = require('./redisService');

const CACHE_TTL_SEC = parseInt(process.env.LOC_VERIFY_CACHE_TTL_SEC, 10) || 86400;
const MAX_RETRIES = parseInt(process.env.LOC_VERIFY_MAX_RETRIES, 10) || 2;
const RETRY_BASE_MS = parseInt(process.env.LOC_VERIFY_RETRY_BASE_MS, 10) || 400;

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
    msg.includes('temporar')
  );
}

function classifyError(err) {
  const msg = String(err?.message || 'Location detection failed');
  if (err?.code) {
    return { code: err.code, message: msg, statusCode: err.statusCode || 422 };
  }
  const lower = msg.toLowerCase();
  if (lower.includes('invalid') || lower.includes('coordinate')) {
    return {
      code: 'LOC_INVALID_COORDS',
      message: 'Invalid latitude/longitude coordinates.',
      statusCode: 400
    };
  }
  if (lower.includes('timeout') || lower.includes('network')) {
    return {
      code: 'LOC_PROVIDER_TIMEOUT',
      message: 'Location detector timed out. Please try again.',
      statusCode: 504
    };
  }
  return {
    code: 'LOC_DETECT_FAILED',
    message: msg.replace(/^Verification Failed:\s*/i, ''),
    statusCode: 502
  };
}

async function cacheGet(key) {
  if (process.env.LOC_VERIFY_CACHE === 'false') return null;
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
  if (process.env.LOC_VERIFY_CACHE === 'false') return;
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
 * Reverse geocode lat/lng via CGPE location-detector.
 */
async function detectLocation({
  latitude,
  longitude,
  detailed = false,
  entityType = 'unbound',
  entityId = null,
  purpose = 'other',
  actorType = 'anonymous',
  actorId = null,
  ipAddress = null,
  userAgent = null,
  forceRefresh = false
} = {}) {
  const lat = toNumber(latitude);
  const lng = toNumber(longitude);

  if (!isValidCoordinates(lat, lng)) {
    const err = new Error('Invalid latitude/longitude. Provide valid GPS coordinates.');
    err.code = 'LOC_INVALID_COORDS';
    err.statusCode = 400;
    throw err;
  }

  // Round for cache key stability (~11m precision at 4 decimals)
  const cacheKey = `loc:${lat.toFixed(4)}:${lng.toFixed(4)}:${detailed ? 1 : 0}`;

  const record = new LocationVerification({
    latitude: lat,
    longitude: lng,
    detailed: Boolean(detailed),
    entityType: entityType || 'unbound',
    entityId: entityId || null,
    purpose: purpose || 'other',
    actorType,
    actorId,
    ipAddress,
    userAgent,
    verificationStatus: 'verifying',
    attemptCount: 1,
    lastVerificationAt: new Date()
  });
  await record.save();

  const started = Date.now();
  try {
    let profile = null;
    let providerPayload = null;
    let cached = false;

    if (!forceRefresh) {
      const hit = await cacheGet(cacheKey);
      if (hit) {
        profile = hit;
        cached = true;
      }
    }

    if (!profile) {
      providerPayload = await withRetry(() =>
        cgpeService.detectLocation(lat, lng, Boolean(detailed))
      );
      profile = mapProviderLocationResponse(providerPayload, lat, lng);
      await cacheSet(cacheKey, profile);
    }

    record.profile = profile;
    record.displayName = profile.displayName;
    record.city = profile.address?.city || null;
    record.state = profile.address?.state || null;
    record.district = profile.address?.district || null;
    record.pincode = profile.address?.pincode || null;
    record.country = profile.address?.country || null;
    record.transactionId = profile.transactionId;
    record.requestId = profile.requestId;
    record.providerResponse = providerPayload || { cached: true, data: profile };
    record.verificationStatus = 'verified';
    record.verifiedAt = new Date();
    record.attempts.push({
      at: new Date(),
      status: 'success',
      latencyMs: Date.now() - started
    });
    await record.save();

    return {
      verification: record,
      profile,
      fields: {
        ...profile,
        fullAddress: fullAddressLine(profile)
      },
      cached
    };
  } catch (err) {
    const classified = classifyError(err);
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

async function listLocations(filters = {}, { page = 1, limit = 20 } = {}) {
  const q = {};
  if (filters.status) q.verificationStatus = filters.status;
  if (filters.entityType) q.entityType = filters.entityType;
  if (filters.purpose) q.purpose = filters.purpose;
  if (filters.entityId) q.entityId = filters.entityId;
  if (filters.city) q.city = new RegExp(String(filters.city), 'i');
  if (filters.state) q.state = new RegExp(String(filters.state), 'i');
  if (filters.pincode) q.pincode = String(filters.pincode);

  const skip = (Math.max(1, page) - 1) * limit;
  const [items, total] = await Promise.all([
    LocationVerification.find(q).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    LocationVerification.countDocuments(q)
  ]);
  return { items, total, page: Number(page), limit: Number(limit) };
}

function publicLocationProfile(profile) {
  if (!profile) return null;
  return {
    displayName: profile.displayName,
    latitude: profile.latitude,
    longitude: profile.longitude,
    detailed: profile.detailed,
    address: profile.address,
    osmData: profile.osmData,
    fullAddress: fullAddressLine(profile),
    transactionId: profile.transactionId,
    requestId: profile.requestId
  };
}

module.exports = {
  detectLocation,
  listLocations,
  publicLocationProfile,
  fullAddressLine
};
