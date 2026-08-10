const cgpeService = require('./cgpeService');
const CinVerification = require('../models/CinVerification');
const Vendor = require('../models/Vendor');
const B2BCompany = require('../models/B2BCompany');
const {
  normalizeCin,
  isValidCinFormat,
  mapProviderCinResponse,
  assertCompanyActive,
  maskCin
} = require('../utils/cin.util');
const { getRedis, isRedisConnected } = require('./redisService');

const CACHE_TTL_SEC = parseInt(process.env.CIN_VERIFY_CACHE_TTL_SEC, 10) || 3600;
const MAX_RETRIES = parseInt(process.env.CIN_VERIFY_MAX_RETRIES, 10) || 2;
const RETRY_BASE_MS = parseInt(process.env.CIN_VERIFY_RETRY_BASE_MS, 10) || 400;

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
  if (lower.includes('invalid cin') || lower.includes('format')) {
    return {
      code: 'CIN_INVALID_FORMAT',
      message: 'Invalid CIN format. Example: U72900MH2019PTC123456',
      statusCode: 400
    };
  }
  if (lower.includes('not found') || lower.includes('no record')) {
    return {
      code: 'CIN_NOT_FOUND',
      message: 'Company not found on MCA records for this CIN.',
      statusCode: 404
    };
  }
  if (lower.includes('struck') || lower.includes('inactive') || lower.includes('liquidat')) {
    return {
      code: 'CIN_INACTIVE',
      message: 'This company is not Active on MCA and cannot be registered.',
      statusCode: 422
    };
  }
  if (lower.includes('timeout') || lower.includes('network')) {
    return {
      code: 'CIN_PROVIDER_TIMEOUT',
      message: 'MCA verification timed out. Please try again.',
      statusCode: 504
    };
  }
  if (lower.includes('rate') || lower.includes('too many')) {
    return {
      code: 'CIN_RATE_LIMIT',
      message: 'Too many CIN verification attempts. Please wait and try again.',
      statusCode: 429
    };
  }
  if (lower.includes('credential') || lower.includes('unauthorized') || lower.includes('api key')) {
    return {
      code: 'CIN_PROVIDER_AUTH',
      message: 'Verification service configuration error. Admin: check CGPE credentials.',
      statusCode: 503
    };
  }
  if (lower.includes('ip not') || lower.includes('whitelist')) {
    return {
      code: 'CIN_PROVIDER_IP',
      message:
        'Verification service is temporarily unavailable from this server. Admin: whitelist server IP at the GSP portal.',
      statusCode: 503
    };
  }
  return {
    code: 'CIN_VERIFY_FAILED',
    message: msg.replace(/^Verification Failed:\s*/i, ''),
    statusCode: 502
  };
}

async function cacheGet(cin) {
  if (process.env.CIN_VERIFY_CACHE === 'false') return null;
  const redis = getRedis();
  if (!isRedisConnected() || !redis) return null;
  try {
    const raw = await redis.get(`cin:verify:${cin}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function cacheSet(cin, profile) {
  if (process.env.CIN_VERIFY_CACHE === 'false') return;
  const redis = getRedis();
  if (!isRedisConnected() || !redis) return;
  try {
    await redis.set(`cin:verify:${cin}`, JSON.stringify(profile), 'EX', CACHE_TTL_SEC);
  } catch {
    /* ignore */
  }
}

async function callProviderWithRetry(cin) {
  let lastErr;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await cgpeService.verifyCin(cin);
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

async function assertNotDuplicate({ cin, entityType, entityId }) {
  if (process.env.CIN_ALLOW_DUPLICATE === 'true') return;

  const vendorQ = {
    $or: [{ cin }, { cinNumber: cin }],
    approvalStatus: { $nin: ['rejected', 'suspended'] }
  };
  if (entityType === 'vendor' && entityId) vendorQ._id = { $ne: entityId };

  const existingVendor = await Vendor.findOne(vendorQ).select('_id').lean().catch(() => null);
  if (existingVendor) {
    const err = new Error('This CIN is already registered with another vendor on the platform.');
    err.code = 'CIN_DUPLICATE';
    err.statusCode = 409;
    throw err;
  }

  const b2bQ = {
    cinNumber: cin,
    isActive: true,
    verificationStatus: { $ne: 'rejected' }
  };
  if (entityType === 'b2b' && entityId) b2bQ._id = { $ne: entityId };

  const existingB2b = await B2BCompany.findOne(b2bQ).select('_id').lean();
  if (existingB2b) {
    const err = new Error('This CIN is already registered with another B2B company.');
    err.code = 'CIN_DUPLICATE';
    err.statusCode = 409;
    throw err;
  }
}

function buildEntityCinPayload(profile, verificationId, verificationStatus = 'verified') {
  return {
    cin: profile.cin,
    verificationStatus,
    verifiedAt: new Date(),
    verificationId,
    companyName: profile.companyName,
    companyType: profile.companyType,
    companyCategory: profile.companyCategory,
    companyClass: profile.companyClass,
    rocCode: profile.rocCode,
    registrationNumber: profile.registrationNumber,
    dateOfIncorporation: profile.dateOfIncorporation,
    companyStatus: profile.companyStatus,
    listedStatus: profile.listedStatus,
    registeredAddress: profile.registeredAddress,
    state: profile.state,
    pincode: profile.pincode,
    authorisedCapital: profile.authorisedCapital,
    paidUpCapital: profile.paidUpCapital,
    directors: profile.directors || profile.presentDirectors || [],
    charges: profile.charges || [],
    transactionId: profile.transactionId,
    requestId: profile.requestId,
    locked: true
  };
}

async function applyProfileToEntity({ entityType, entityId, profile, verificationId }) {
  if (!entityId || !entityType) return;
  const payload = buildEntityCinPayload(profile, verificationId);

  if (entityType === 'vendor') {
    await Vendor.findByIdAndUpdate(entityId, {
      $set: {
        cin: profile.cin,
        cinNumber: profile.cin,
        businessName: profile.companyName || undefined,
        cinVerification: payload
      }
    });
  }

  if (entityType === 'b2b') {
    await B2BCompany.findByIdAndUpdate(entityId, {
      $set: {
        cinNumber: profile.cin,
        companyName: profile.companyName || undefined,
        companyAddress: profile.registeredAddress || undefined,
        cinVerification: payload
      }
    });
  }
}

/**
 * Live CIN/MCA verification via CGPE with cache, retries, audit, entity bind.
 */
async function verifyCin({
  cinNumber,
  entityType = 'unbound',
  entityId = null,
  actorType = 'anonymous',
  actorId = null,
  ipAddress = null,
  userAgent = null,
  skipDuplicateCheck = false,
  forceRefresh = false
} = {}) {
  const cin = normalizeCin(cinNumber);

  if (!isValidCinFormat(cin)) {
    const err = new Error('Invalid CIN format. Example: U72900MH2019PTC123456');
    err.code = 'CIN_INVALID_FORMAT';
    err.statusCode = 400;
    throw err;
  }

  if (!skipDuplicateCheck) {
    await assertNotDuplicate({ cin, entityType, entityId });
  }

  let record = await CinVerification.findOne({
    cin,
    ...(entityId
      ? { entityType, entityId }
      : { entityType: entityType || 'unbound', entityId: null })
  }).sort({ createdAt: -1 });

  if (!record) {
    record = new CinVerification({
      cin,
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
      const cachedProfile = await cacheGet(cin);
      if (cachedProfile) {
        profile = cachedProfile;
        cached = true;
      }
    }

    if (!profile) {
      providerPayload = await callProviderWithRetry(cin);
      profile = mapProviderCinResponse(providerPayload, cin);
      assertCompanyActive(profile.companyStatus, {
        hasCompanyName: Boolean(profile.companyName)
      });
      if (!profile.companyName) {
        const err = new Error('Company not found on MCA for this CIN.');
        err.code = 'CIN_NOT_FOUND';
        err.statusCode = 404;
        throw err;
      }
      await cacheSet(cin, profile);
    } else {
      assertCompanyActive(profile.companyStatus, {
        hasCompanyName: Boolean(profile.companyName)
      });
    }

    record.profile = profile;
    record.provider = 'cgpe';
    record.transactionId = profile.transactionId;
    record.requestId = profile.requestId;
    record.providerResponse = providerPayload
      ? providerPayload
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
      transactionId: profile.transactionId,
      requestId: profile.requestId,
      latencyMs: Date.now() - started
    });
    await record.save();

    await applyProfileToEntity({
      entityType,
      entityId,
      profile,
      verificationId: record._id
    });

    return { verification: record, profile, cached };
  } catch (err) {
    const classified = classifyError(err);
    if (err.code === 'CIN_INACTIVE' || classified.code === 'CIN_INACTIVE') {
      record.verificationStatus = 'inactive_company';
    } else {
      record.verificationStatus = 'failed';
    }
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

async function requireSuccessfulCinVerification({
  cinNumber,
  verificationId = null,
  entityType = 'unbound',
  entityId = null,
  maxAgeHours = parseInt(process.env.CIN_VERIFY_MAX_AGE_HOURS, 10) || 72
} = {}) {
  const cin = normalizeCin(cinNumber);
  if (!isValidCinFormat(cin)) {
    const err = new Error('Invalid CIN format. Example: U72900MH2019PTC123456');
    err.code = 'CIN_INVALID_FORMAT';
    err.statusCode = 400;
    throw err;
  }

  let record = null;
  if (verificationId) {
    record = await CinVerification.findById(verificationId);
  }
  if (!record) {
    record = await CinVerification.findOne({
      cin,
      verificationStatus: { $in: ['verified', 'admin_approved'] },
      $or: [{ entityId: null }, ...(entityId ? [{ entityId }] : [])]
    }).sort({ verifiedAt: -1, createdAt: -1 });
  }

  if (!record || !['verified', 'admin_approved'].includes(record.verificationStatus)) {
    const err = new Error('Please verify your CIN with MCA before continuing registration.');
    err.code = 'CIN_NOT_VERIFIED';
    err.statusCode = 422;
    throw err;
  }

  if (normalizeCin(record.cin) !== cin) {
    const err = new Error('CIN does not match the verified record. Please re-verify.');
    err.code = 'CIN_MISMATCH';
    err.statusCode = 422;
    throw err;
  }

  if (record.verifiedAt && maxAgeHours > 0) {
    const ageMs = Date.now() - new Date(record.verifiedAt).getTime();
    if (ageMs > maxAgeHours * 3600 * 1000) {
      const err = new Error('CIN verification has expired. Please re-verify your CIN.');
      err.code = 'CIN_VERIFY_EXPIRED';
      err.statusCode = 422;
      throw err;
    }
  }

  assertCompanyActive(record.profile?.companyStatus, {
    hasCompanyName: Boolean(record.profile?.companyName)
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

async function adminOverride({ verificationId, action, reason, adminId }) {
  const record = await CinVerification.findById(verificationId);
  if (!record) {
    const err = new Error('CIN verification record not found');
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
        'cinVerification.verificationStatus':
          action === 'approve' ? 'admin_approved' : 'admin_rejected',
        'cinVerification.locked': action === 'approve'
      }
    });
  }
  if (record.entityType === 'b2b' && record.entityId) {
    await B2BCompany.findByIdAndUpdate(record.entityId, {
      $set: {
        'cinVerification.verificationStatus':
          action === 'approve' ? 'admin_approved' : 'admin_rejected',
        'cinVerification.locked': action === 'approve'
      }
    });
  }

  return record;
}

async function listVerifications(filters = {}, { page = 1, limit = 20 } = {}) {
  const q = {};
  if (filters.status) q.verificationStatus = filters.status;
  if (filters.entityType) q.entityType = filters.entityType;
  if (filters.cin) q.cin = normalizeCin(filters.cin);
  if (filters.entityId) q.entityId = filters.entityId;
  if (filters.q) {
    const term = String(filters.q).trim();
    q.$or = [
      { cin: new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') },
      { 'profile.companyName': new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }
    ];
  }

  const skip = (Math.max(1, page) - 1) * limit;
  const [items, total] = await Promise.all([
    CinVerification.find(q).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    CinVerification.countDocuments(q)
  ]);
  return { items, total, page: Number(page), limit: Number(limit) };
}

function publicProfile(profile) {
  if (!profile) return null;
  return {
    cin: profile.cin,
    companyName: profile.companyName,
    companyType: profile.companyType,
    companyCategory: profile.companyCategory,
    companyClass: profile.companyClass,
    rocCode: profile.rocCode,
    registrationNumber: profile.registrationNumber,
    dateOfIncorporation: profile.dateOfIncorporation,
    companyStatus: profile.companyStatus,
    listedStatus: profile.listedStatus,
    registeredAddress: profile.registeredAddress,
    state: profile.state,
    pincode: profile.pincode,
    authorisedCapital: profile.authorisedCapital,
    paidUpCapital: profile.paidUpCapital,
    presentDirectors: profile.presentDirectors || [],
    pastDirectors: profile.pastDirectors || [],
    directors: profile.directors || profile.presentDirectors || [],
    relatedParties: profile.relatedParties || [],
    charges: profile.charges || [],
    transactionId: profile.transactionId,
    requestId: profile.requestId,
    providerTimestamp: profile.providerTimestamp
  };
}

function toCsvRows(items = []) {
  const header = [
    'CIN',
    'Company Name',
    'Status',
    'Verification Status',
    'Entity Type',
    'ROC',
    'Incorporation Date',
    'Verified At',
    'Transaction ID',
    'Request ID'
  ];
  const rows = items.map((row) => [
    row.cin || '',
    (row.profile?.companyName || '').replace(/"/g, '""'),
    row.profile?.companyStatus || '',
    row.verificationStatus || '',
    row.entityType || '',
    row.profile?.rocCode || '',
    row.profile?.dateOfIncorporation || '',
    row.verifiedAt ? new Date(row.verifiedAt).toISOString() : '',
    row.transactionId || '',
    row.requestId || ''
  ]);
  return [header, ...rows]
    .map((cols) => cols.map((c) => `"${String(c)}"`).join(','))
    .join('\n');
}

module.exports = {
  verifyCin,
  requireSuccessfulCinVerification,
  adminOverride,
  listVerifications,
  publicProfile,
  maskCin,
  classifyError,
  buildEntityCinPayload,
  applyProfileToEntity,
  toCsvRows
};
