const {
  verifyVpa,
  lookupMobileUpi,
  listUpiVerifications,
  publicUpiProfile
} = require('../services/upiVerification.service');
const {
  detectLocation,
  listLocations,
  publicLocationProfile
} = require('../services/locationVerification.service');
const UpiVerification = require('../models/UpiVerification');
const LocationVerification = require('../models/LocationVerification');
const { isValidVpaFormat, normalizeVpa, isValidMobileFormat, normalizeMobile } = require('../utils/upi.util');
const { isValidCoordinates } = require('../utils/location.util');

function actorFromReq(req, entityType) {
  const role = String(req.userRole || req.user?.role || '').toLowerCase();
  if (role === 'admin' || role === 'super_admin') return 'admin';
  if (entityType && entityType !== 'unbound') return entityType;
  return 'anonymous';
}

/** GET /api/verification/upi/validate */
const validateVpaFormat = async (req, res) => {
  const vpa = normalizeVpa(req.query.vpa || '');
  res.json({
    success: true,
    data: { vpa, valid: isValidVpaFormat(vpa), message: isValidVpaFormat(vpa) ? 'Valid VPA format' : 'Invalid VPA format' }
  });
};

/** POST /api/verification/upi */
const verifyUpiHandler = async (req, res) => {
  try {
    const vpa = req.body.vpa || req.body.upiId || req.body.upi;
    if (!vpa) {
      return res.status(400).json({ success: false, code: 'UPI_REQUIRED', message: 'UPI / VPA is required' });
    }
    const entityType = req.body.entityType || 'unbound';
    const entityId =
      req.body.entityId ||
      req.user?.id ||
      req.vendorId ||
      req.companyId ||
      null;

    const result = await verifyVpa({
      vpa,
      entityType,
      entityId,
      actorType: actorFromReq(req, entityType),
      actorId: req.user?.id || null,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      forceRefresh: req.body.forceRefresh === true,
      bankId: req.body.bankId || null
    });

    return res.status(200).json({
      success: true,
      message: 'UPI verification completed',
      data: {
        verificationId: result.verification._id,
        verificationStatus: result.verification.verificationStatus,
        verifiedAt: result.verification.verifiedAt,
        cached: result.cached,
        profile: publicUpiProfile(result.profile),
        fields: publicUpiProfile(result.profile)
      }
    });
  } catch (error) {
    console.error('[UPI_VERIFY]', error.code || '', error.message);
    return res.status(error.statusCode || 500).json({
      success: false,
      code: error.code || 'UPI_VERIFY_FAILED',
      message: error.message || 'UPI verification failed',
      verificationId: error.verificationId || null
    });
  }
};

/** POST /api/verification/mobile-upi */
const mobileUpiHandler = async (req, res) => {
  try {
    const mobile = req.body.mobile || req.body.phone;
    if (!mobile) {
      return res.status(400).json({ success: false, code: 'MOBILE_REQUIRED', message: 'Mobile number is required' });
    }
    const entityType = req.body.entityType || 'unbound';
    const entityId = req.body.entityId || req.user?.id || null;

    const result = await lookupMobileUpi({
      mobile,
      entityType,
      entityId,
      actorType: actorFromReq(req, entityType),
      actorId: req.user?.id || null,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      forceRefresh: req.body.forceRefresh === true
    });

    return res.status(200).json({
      success: true,
      message: result.found
        ? 'Mobile to UPI lookup completed'
        : 'No linked UPI found for this mobile. You can enter UPI manually.',
      data: {
        verificationId: result.verification._id,
        verificationStatus: result.verification.verificationStatus,
        found: result.found,
        cached: result.cached,
        profile: publicUpiProfile(result.profile),
        fields: publicUpiProfile(result.profile),
        // Suggestion for one-click fill
        suggestedVpa: result.profile?.vpa || null,
        suggestedName: result.profile?.mobileLinkedName || null
      }
    });
  } catch (error) {
    console.error('[MOBILE_UPI]', error.code || '', error.message);
    return res.status(error.statusCode || 500).json({
      success: false,
      code: error.code || 'MOBILE_UPI_FAILED',
      message: error.message || 'Mobile to UPI lookup failed',
      verificationId: error.verificationId || null
    });
  }
};

/** GET /api/verification/mobile-upi/validate */
const validateMobileFormat = async (req, res) => {
  const mobile = normalizeMobile(req.query.mobile || '');
  res.json({
    success: true,
    data: {
      mobile,
      valid: isValidMobileFormat(mobile),
      message: isValidMobileFormat(mobile) ? 'Valid mobile' : 'Invalid mobile'
    }
  });
};

/** POST /api/verification/location */
const locationHandler = async (req, res) => {
  try {
    const { latitude, longitude, detailed, entityType, entityId, purpose, forceRefresh } = req.body;
    if (latitude == null || longitude == null) {
      return res.status(400).json({
        success: false,
        code: 'LOC_REQUIRED',
        message: 'latitude and longitude are required'
      });
    }
    if (!isValidCoordinates(latitude, longitude)) {
      return res.status(400).json({
        success: false,
        code: 'LOC_INVALID_COORDS',
        message: 'Invalid latitude/longitude coordinates'
      });
    }

    const et = entityType || 'unbound';
    const result = await detectLocation({
      latitude,
      longitude,
      detailed: detailed === true,
      entityType: et,
      entityId: entityId || req.user?.id || null,
      purpose: purpose || 'other',
      actorType: actorFromReq(req, et),
      actorId: req.user?.id || null,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      forceRefresh: forceRefresh === true
    });

    return res.status(200).json({
      success: true,
      message: 'Location detector completed',
      data: {
        verificationId: result.verification._id,
        verificationStatus: result.verification.verificationStatus,
        verifiedAt: result.verification.verifiedAt,
        cached: result.cached,
        profile: publicLocationProfile(result.profile),
        fields: result.fields
      }
    });
  } catch (error) {
    console.error('[LOC_DETECT]', error.code || '', error.message);
    return res.status(error.statusCode || 500).json({
      success: false,
      code: error.code || 'LOC_DETECT_FAILED',
      message: error.message || 'Location detection failed',
      verificationId: error.verificationId || null
    });
  }
};

/** Admin — UPI list */
const adminListUpi = async (req, res) => {
  try {
    const data = await listUpiVerifications(
      {
        kind: req.query.kind,
        status: req.query.status,
        entityType: req.query.entityType,
        vpa: req.query.vpa,
        mobile: req.query.mobile,
        q: req.query.q
      },
      { page: req.query.page || 1, limit: Math.min(Number(req.query.limit) || 20, 100) }
    );
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const adminGetUpi = async (req, res) => {
  try {
    const doc = await UpiVerification.findById(req.params.id).lean();
    if (!doc) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: doc });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const adminReverifyUpi = async (req, res) => {
  try {
    const doc = await UpiVerification.findById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, message: 'Not found' });
    let result;
    if (doc.kind === 'mobile_upi') {
      result = await lookupMobileUpi({
        mobile: doc.mobile,
        entityType: doc.entityType,
        entityId: doc.entityId,
        actorType: 'admin',
        actorId: req.user?.id,
        forceRefresh: true
      });
    } else {
      result = await verifyVpa({
        vpa: doc.vpa,
        entityType: doc.entityType,
        entityId: doc.entityId,
        actorType: 'admin',
        actorId: req.user?.id,
        forceRefresh: true
      });
    }
    res.json({
      success: true,
      message: 'Re-verified',
      data: {
        verificationId: result.verification._id,
        verificationStatus: result.verification.verificationStatus,
        profile: publicUpiProfile(result.profile)
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

/** Admin — locations */
const adminListLocations = async (req, res) => {
  try {
    const data = await listLocations(
      {
        status: req.query.status,
        entityType: req.query.entityType,
        purpose: req.query.purpose,
        entityId: req.query.entityId,
        city: req.query.city,
        state: req.query.state,
        pincode: req.query.pincode
      },
      { page: req.query.page || 1, limit: Math.min(Number(req.query.limit) || 20, 100) }
    );
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const adminGetLocation = async (req, res) => {
  try {
    const doc = await LocationVerification.findById(req.params.id).lean();
    if (!doc) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: doc });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  validateVpaFormat,
  verifyUpiHandler,
  mobileUpiHandler,
  validateMobileFormat,
  locationHandler,
  adminListUpi,
  adminGetUpi,
  adminReverifyUpi,
  adminListLocations,
  adminGetLocation
};
