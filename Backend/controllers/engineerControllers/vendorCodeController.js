/**
 * Public engineer APIs — validate vendor company code / invite token (pre-signup)
 */
const VendorCodeAttempt = require('../../models/VendorCodeAttempt');
const Vendor = require('../../models/Vendor');
const {
  normalizeVendorCode,
  findVendorByActiveCode
} = require('../../utils/vendorCompanyCode');

const FAILED_ATTEMPT_LIMIT = 5;
const FAILED_WINDOW_MS = 10 * 60 * 1000;

const getClientIp = (req) =>
  (req.headers['x-forwarded-for'] && String(req.headers['x-forwarded-for']).split(',')[0].trim())
  || req.ip
  || req.connection?.remoteAddress
  || '';

const logAttempt = async ({ ipAddress, sessionId, codeAttempted, success, vendorId }) => {
  try {
    await VendorCodeAttempt.create({
      ipAddress: ipAddress || '',
      sessionId: sessionId || '',
      codeAttempted: codeAttempted || '',
      success: !!success,
      vendorId: vendorId || null,
      attemptedAt: new Date()
    });
  } catch (e) {
    console.warn('VendorCodeAttempt log failed:', e.message);
  }
};

const checkFailedRateLimit = async (ipAddress, sessionId) => {
  const since = new Date(Date.now() - FAILED_WINDOW_MS);
  const filter = {
    success: false,
    attemptedAt: { $gte: since },
    $or: []
  };
  if (ipAddress) filter.$or.push({ ipAddress });
  if (sessionId) filter.$or.push({ sessionId });
  if (!filter.$or.length) return { blocked: false, count: 0 };

  const count = await VendorCodeAttempt.countDocuments(filter);
  return { blocked: count >= FAILED_ATTEMPT_LIMIT, count };
};

/**
 * POST /api/engineer/validate-vendor-code
 * Body: { code, sessionId? }
 * Public + rate-limited
 */
exports.validateVendorCode = async (req, res) => {
  const ipAddress = getClientIp(req);
  const sessionId = String(req.body?.sessionId || req.body?.deviceId || '').slice(0, 128);
  const rawCode = req.body?.code;

  try {
    const { blocked } = await checkFailedRateLimit(ipAddress, sessionId);
    if (blocked) {
      await logAttempt({
        ipAddress,
        sessionId,
        codeAttempted: normalizeVendorCode(rawCode),
        success: false
      });
      return res.status(429).json({
        success: false,
        valid: false,
        message: 'Too many attempts, try after 10 minutes'
      });
    }

    const code = normalizeVendorCode(rawCode);
    if (!code) {
      await logAttempt({ ipAddress, sessionId, codeAttempted: '', success: false });
      return res.status(400).json({
        success: false,
        valid: false,
        message: 'Vendor company code is required'
      });
    }

    const vendor = await findVendorByActiveCode(code);
    if (!vendor) {
      await logAttempt({ ipAddress, sessionId, codeAttempted: code, success: false });
      return res.status(404).json({
        success: false,
        valid: false,
        message: 'Invalid code. Please check with your vendor.'
      });
    }

    await logAttempt({
      ipAddress,
      sessionId,
      codeAttempted: code,
      success: true,
      vendorId: vendor._id
    });

    const companyName = vendor.businessName || vendor.name || 'Vendor Company';
    return res.status(200).json({
      success: true,
      valid: true,
      companyName,
      vendorCompanyId: vendor._id,
      code: vendor.uniqueCompanyCode
    });
  } catch (error) {
    console.error('validateVendorCode:', error);
    return res.status(500).json({
      success: false,
      valid: false,
      message: 'Failed to validate vendor code'
    });
  }
};

/**
 * GET /api/engineer/invite/:token
 * Public — resolve invite link → code + company (for read-only Step 1)
 */
exports.resolveInviteToken = async (req, res) => {
  try {
    const token = String(req.params.token || '').trim();
    if (!token) {
      return res.status(400).json({ success: false, message: 'Invite token required' });
    }

    const vendor = await Vendor.findOne({
      inviteLinkToken: token,
      codeStatus: 'active',
      approvalStatus: 'approved'
    }).select('_id businessName name uniqueCompanyCode inviteLinkExpiresAt');

    if (!vendor || !vendor.uniqueCompanyCode) {
      return res.status(404).json({
        success: false,
        message: 'Invite link is invalid or expired'
      });
    }

    if (vendor.inviteLinkExpiresAt && vendor.inviteLinkExpiresAt < new Date()) {
      return res.status(410).json({
        success: false,
        message: 'Invite link has expired. Ask your vendor for a new link or code.'
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        code: vendor.uniqueCompanyCode,
        companyName: vendor.businessName || vendor.name || 'Vendor Company',
        vendorCompanyId: vendor._id,
        expiresAt: vendor.inviteLinkExpiresAt
      }
    });
  } catch (error) {
    console.error('resolveInviteToken:', error);
    return res.status(500).json({ success: false, message: 'Failed to resolve invite' });
  }
};
