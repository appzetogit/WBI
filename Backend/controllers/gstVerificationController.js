const {
  verifyGst,
  adminOverride,
  listVerifications,
  publicProfile
} = require('../services/gstVerification.service');
const GstVerification = require('../models/GstVerification');
const { isValidGstinFormat, normalizeGstin } = require('../utils/gst.util');

/**
 * POST /api/verification/gst
 * Live GST verify (registration + bound entity). Rate-limited. Secrets never exposed.
 */
const verifyGstHandler = async (req, res) => {
  try {
    const gstNumber = req.body.gstNumber || req.body.gstin;
    if (!gstNumber) {
      return res.status(400).json({
        success: false,
        code: 'GST_REQUIRED',
        message: 'GST number is required'
      });
    }

    const entityType = req.body.entityType || 'unbound';
    const entityId =
      req.body.entityId ||
      (entityType === 'vendor' ? req.user?.id : null) ||
      (entityType === 'b2b' ? req.companyId || req.user?.id : null) ||
      null;

    const actorType =
      req.userRole?.toLowerCase() === 'admin'
        ? 'admin'
        : entityType === 'vendor'
          ? 'vendor'
          : entityType === 'b2b'
            ? 'b2b'
            : 'anonymous';

    const result = await verifyGst({
      gstNumber,
      entityType,
      entityId,
      actorType,
      actorId: req.user?.id || req.userId || null,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      expectedLegalName: req.body.expectedLegalName || req.body.businessName || null,
      expectedPan: req.body.expectedPan || req.body.panNumber || null,
      forceRefresh: req.body.forceRefresh === true,
      skipDuplicateCheck: req.body.skipDuplicateCheck === true && actorType === 'admin'
    });

    return res.status(200).json({
      success: true,
      message: 'GST verification completed',
      data: {
        verificationId: result.verification._id,
        verificationStatus: result.verification.verificationStatus,
        verifiedAt: result.verification.verifiedAt,
        locked: result.verification.lockedFields,
        cached: result.cached,
        profile: publicProfile(result.profile),
        // Convenience flat map for form auto-fill
        fields: publicProfile(result.profile)
      }
    });
  } catch (error) {
    console.error('[GST_VERIFY]', error.code || '', error.message);
    return res.status(error.statusCode || 500).json({
      success: false,
      code: error.code || 'GST_VERIFY_FAILED',
      message: error.message || 'GST verification failed',
      verificationId: error.verificationId || null
    });
  }
};

/** GET /api/verification/gst/validate?gstin= */
const validateFormat = async (req, res) => {
  const gstin = normalizeGstin(req.query.gstin || req.query.gstNumber || '');
  const valid = isValidGstinFormat(gstin);
  return res.json({
    success: true,
    data: { gstin, valid, message: valid ? 'Valid GSTIN format' : 'Invalid GSTIN format' }
  });
};

/** GET /api/admin/gst-verifications */
const adminList = async (req, res) => {
  try {
    const result = await listVerifications(
      {
        status: req.query.status,
        entityType: req.query.entityType,
        gstin: req.query.gstin,
        entityId: req.query.entityId
      },
      { page: req.query.page || 1, limit: Math.min(Number(req.query.limit) || 20, 100) }
    );
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/** GET /api/admin/gst-verifications/:id */
const adminGet = async (req, res) => {
  try {
    const doc = await GstVerification.findById(req.params.id).lean();
    if (!doc) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: doc });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/** POST /api/admin/gst-verifications/:id/reverify */
const adminReverify = async (req, res) => {
  try {
    const doc = await GstVerification.findById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, message: 'Not found' });
    const result = await verifyGst({
      gstNumber: doc.gstin,
      entityType: doc.entityType,
      entityId: doc.entityId,
      actorType: 'admin',
      actorId: req.user?.id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      forceRefresh: true,
      skipDuplicateCheck: true
    });
    res.json({
      success: true,
      message: 'GST re-verified',
      data: {
        verificationId: result.verification._id,
        verificationStatus: result.verification.verificationStatus,
        profile: publicProfile(result.profile)
      }
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      success: false,
      code: error.code,
      message: error.message
    });
  }
};

/** POST /api/admin/gst-verifications/:id/override  { action: approve|reject, reason } */
const adminOverrideHandler = async (req, res) => {
  try {
    const { action, reason } = req.body;
    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ success: false, message: 'action must be approve or reject' });
    }
    const record = await adminOverride({
      verificationId: req.params.id,
      action,
      reason,
      adminId: req.user?.id
    });
    res.json({ success: true, message: `GST verification ${action}d`, data: record });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

module.exports = {
  verifyGstHandler,
  validateFormat,
  adminList,
  adminGet,
  adminReverify,
  adminOverrideHandler
};
