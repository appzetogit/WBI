const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const kycController = require('../controllers/kycController');
const { authenticate } = require('../middleware/authMiddleware');
const { isAdmin } = require('../middleware/roleMiddleware');

// Draft registrations verify KYC before an account exists (their entityId is a
// client-generated temp id), so those calls stay public. Once entityId names a
// real account, only that account (or an admin) may read or change its KYC.
const ACCOUNT_MODELS = ['User', 'Vendor', 'Worker', 'Engineer', 'B2BCompany'];

const isRealAccount = async (entityId) => {
  for (const name of ACCOUNT_MODELS) {
    const Model = mongoose.models[name] || require(`../models/${name}`);
    if (await Model.exists({ _id: entityId })) return true;
  }
  return false;
};

const guardKycEntity = async (req, res, next) => {
  try {
    const entityId = req.body?.entityId || req.query?.entityId;
    if (!entityId || !mongoose.Types.ObjectId.isValid(entityId)) return next();
    if (!(await isRealAccount(entityId))) return next();

    return authenticate(req, res, () => {
      const role = String(req.userRole || '').toUpperCase();
      const isAdminCaller = role === 'ADMIN' || role === 'SUPER_ADMIN';
      const isSelf = String(req.userId) === String(entityId) || String(req.companyId || '') === String(entityId);
      if (isAdminCaller || isSelf) return next();
      return res.status(403).json({ success: false, message: 'You can only verify your own account' });
    });
  } catch (error) {
    console.error('[KYC] entity guard error:', error);
    return res.status(500).json({ success: false, message: 'KYC authorization check failed' });
  }
};

// 1. Get document rules
router.get('/document-rules', kycController.getDocumentRules);
router.get('/status', guardKycEntity, kycController.getVerificationStatus);

// 2. DigiLocker flow
router.post('/digilocker/initiate', guardKycEntity, kycController.initiateDigiLocker);
router.post('/digilocker/complete', guardKycEntity, kycController.completeDigiLocker);

// 3. API Verifications
router.post('/pan/verify', guardKycEntity, kycController.verifyPan);
router.post('/bank/verify', guardKycEntity, kycController.verifyBank);
router.post('/aadhaar/generate-otp', guardKycEntity, kycController.generateAadhaarOtp);
router.post('/aadhaar/verify', guardKycEntity, kycController.verifyAadhaar);
router.post('/selfie/verify', guardKycEntity, kycController.verifySelfieMatch);
router.post('/license/verify', guardKycEntity, kycController.verifyLicense);

// 4. File uploads (Selfie, DL, etc)
router.post('/document/upload', guardKycEntity, kycController.uploadDocument);

// 5. Admin Routes
router.post('/admin/document-rules', authenticate, isAdmin, kycController.updateDocumentRules);

module.exports = router;
