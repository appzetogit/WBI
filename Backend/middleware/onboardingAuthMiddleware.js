/**
 * Vendor onboarding authorization
 * -------------------------------
 * Vendor onboarding legitimately runs before the vendor can hold a normal
 * access token: `authenticate` rejects any vendor whose approvalStatus is not
 * 'approved', and onboarding is exactly the period before approval.
 *
 * These endpoints previously resolved identity as:
 *     const vendorId = req.user?.id || req.body.vendorId;
 * with no auth middleware mounted — so `req.user` was always undefined and the
 * caller fully controlled which vendor they were editing.
 *
 * This middleware establishes `req.onboardingVendorId` from, in order:
 *   1. A real authenticated vendor session (Bearer access token)
 *   2. A scoped onboarding token issued at submit time
 *   3. LEGACY: a raw body/query vendorId — only while the deprecation window
 *      is open, and logged on every use so the migration can be observed.
 *
 * Controllers must read `req.onboardingVendorId` and never `req.body.vendorId`.
 */

const { verifyAccessToken, verifyOnboardingToken } = require('../utils/tokenService');

/**
 * Legacy body-supplied vendorId acceptance.
 *
 * Defaults to ENABLED so deploying this does not strand vendors who are already
 * mid-onboarding with no token in their browser. Set to 'false' once the
 * frontend that stores `vendorOnboardingToken` has shipped and in-flight
 * onboardings have drained — watch for the warning below to stop appearing.
 */
const ALLOW_LEGACY_CLAIM = process.env.VENDOR_ONBOARDING_LEGACY_CLAIM !== 'false';

const extractBearer = (req) => {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) return header.split(' ')[1];
  if (req.cookies && req.cookies.accessToken) return req.cookies.accessToken;
  return null;
};

/** Onboarding token travels in its own header so it can never be mistaken for a session. */
const extractOnboardingToken = (req) =>
  req.headers['x-onboarding-token'] ||
  req.body?.onboardingToken ||
  req.query?.onboardingToken ||
  null;

/**
 * Resolves the vendor an onboarding request may act on.
 * Responds 401 when identity cannot be established.
 */
const authenticateOnboarding = (req, res, next) => {
  // 1. Real vendor session (approved vendors revisiting onboarding screens).
  const bearer = extractBearer(req);
  if (bearer) {
    try {
      const decoded = verifyAccessToken(bearer);
      const role = String(decoded.role || '').toUpperCase();
      if (role === 'VENDOR' && decoded.userId) {
        req.onboardingVendorId = String(decoded.userId);
        req.onboardingAuthSource = 'session';
        return next();
      }
    } catch (_) {
      // Fall through — an expired session must not block onboarding.
    }
  }

  // 2. Scoped onboarding token.
  const onboardingToken = extractOnboardingToken(req);
  if (onboardingToken) {
    const vendorId = verifyOnboardingToken(onboardingToken);
    if (vendorId) {
      req.onboardingVendorId = vendorId;
      req.onboardingAuthSource = 'onboarding_token';
      return next();
    }
    return res.status(401).json({
      success: false,
      message: 'Onboarding session expired. Please sign in or restart registration.',
      code: 'ONBOARDING_TOKEN_INVALID'
    });
  }

  // 3. Legacy: unauthenticated body/query vendorId.
  const legacyId = req.body?.vendorId || req.query?.vendorId;
  if (legacyId && ALLOW_LEGACY_CLAIM) {
    console.warn(
      '[Onboarding][LEGACY-CLAIM] Unauthenticated vendorId accepted from request body/query. ' +
        `vendorId=${legacyId} path=${req.originalUrl} ip=${req.ip}. ` +
        'Set VENDOR_ONBOARDING_LEGACY_CLAIM=false once clients send x-onboarding-token.'
    );
    req.onboardingVendorId = String(legacyId);
    req.onboardingAuthSource = 'legacy_body';
    return next();
  }

  return res.status(401).json({
    success: false,
    message: 'Onboarding authorization required.',
    code: 'ONBOARDING_AUTH_REQUIRED'
  });
};

/**
 * Optional variant for `/onboarding/submit`, which must stay public because it
 * CREATES the vendor record — there is no identity to authenticate on a first
 * submission. It resolves `req.onboardingVendorId` when a session or onboarding
 * token is present and otherwise continues anonymously, so the controller can
 * safely decide between "update the vendor I can prove you own" and "create a
 * new one". It never authorises an update from a body-supplied id alone.
 */
const optionalOnboardingAuth = (req, res, next) => {
  const bearer = extractBearer(req);
  if (bearer) {
    try {
      const decoded = verifyAccessToken(bearer);
      if (String(decoded.role || '').toUpperCase() === 'VENDOR' && decoded.userId) {
        req.onboardingVendorId = String(decoded.userId);
        req.onboardingAuthSource = 'session';
        return next();
      }
    } catch (_) {
      /* anonymous submit is legitimate here */
    }
  }

  const onboardingToken = extractOnboardingToken(req);
  if (onboardingToken) {
    const vendorId = verifyOnboardingToken(onboardingToken);
    if (vendorId) {
      req.onboardingVendorId = vendorId;
      req.onboardingAuthSource = 'onboarding_token';
    }
  }

  return next();
};

module.exports = { authenticateOnboarding, optionalOnboardingAuth, ALLOW_LEGACY_CLAIM };
