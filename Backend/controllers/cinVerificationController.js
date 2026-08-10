const {
  verifyCin,
  adminOverride,
  listVerifications,
  publicProfile,
  toCsvRows
} = require('../services/cinVerification.service');
const CinVerification = require('../models/CinVerification');
const { isValidCinFormat, normalizeCin } = require('../utils/cin.util');

/**
 * POST /api/verification/cin
 * Live MCA/CIN verify — credentials stay on server.
 */
const verifyCinHandler = async (req, res) => {
  try {
    const cinNumber = req.body.cinNumber || req.body.cin;
    if (!cinNumber) {
      return res.status(400).json({
        success: false,
        code: 'CIN_REQUIRED',
        message: 'CIN number is required'
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

    const result = await verifyCin({
      cinNumber,
      entityType,
      entityId,
      actorType,
      actorId: req.user?.id || req.userId || null,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      forceRefresh: req.body.forceRefresh === true,
      skipDuplicateCheck: req.body.skipDuplicateCheck === true && actorType === 'admin'
    });

    return res.status(200).json({
      success: true,
      message: 'CIN verification completed',
      data: {
        verificationId: result.verification._id,
        verificationStatus: result.verification.verificationStatus,
        verifiedAt: result.verification.verifiedAt,
        locked: result.verification.lockedFields,
        cached: result.cached,
        transactionId: result.profile?.transactionId,
        requestId: result.profile?.requestId,
        profile: publicProfile(result.profile),
        fields: publicProfile(result.profile)
      }
    });
  } catch (error) {
    console.error('[CIN_VERIFY]', error.code || '', error.message);
    return res.status(error.statusCode || 500).json({
      success: false,
      code: error.code || 'CIN_VERIFY_FAILED',
      message: error.message || 'CIN verification failed',
      verificationId: error.verificationId || null
    });
  }
};

/** GET /api/verification/cin/validate?cin= */
const validateFormat = async (req, res) => {
  const cin = normalizeCin(req.query.cin || req.query.cinNumber || '');
  const valid = isValidCinFormat(cin);
  return res.json({
    success: true,
    data: {
      cin,
      valid,
      message: valid ? 'Valid CIN format' : 'Invalid CIN format'
    }
  });
};

const adminList = async (req, res) => {
  try {
    const result = await listVerifications(
      {
        status: req.query.status,
        entityType: req.query.entityType,
        cin: req.query.cin,
        entityId: req.query.entityId,
        q: req.query.q
      },
      { page: req.query.page || 1, limit: Math.min(Number(req.query.limit) || 20, 100) }
    );
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const adminGet = async (req, res) => {
  try {
    const doc = await CinVerification.findById(req.params.id).lean();
    if (!doc) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: doc });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const adminReverify = async (req, res) => {
  try {
    const doc = await CinVerification.findById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, message: 'Not found' });
    const result = await verifyCin({
      cinNumber: doc.cin,
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
      message: 'CIN re-verified',
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
    res.json({ success: true, message: `CIN verification ${action}d`, data: record });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

/** GET export CSV */
const adminExport = async (req, res) => {
  try {
    const result = await listVerifications(
      {
        status: req.query.status,
        entityType: req.query.entityType,
        cin: req.query.cin,
        q: req.query.q
      },
      { page: 1, limit: Math.min(Number(req.query.limit) || 5000, 10000) }
    );
    const csv = toCsvRows(result.items);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="cin-verifications-${Date.now()}.csv"`
    );
    res.send(csv);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  verifyCinHandler,
  validateFormat,
  adminList,
  adminGet,
  adminReverify,
  adminOverrideHandler,
  adminExport
};
