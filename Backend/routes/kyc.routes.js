const express = require('express');
const router = express.Router();
const kycController = require('../controllers/kycController');
// const { authenticate } = require('../middleware/authMiddleware'); 
// For some KYC like draft registrations, user might not be authenticated yet.
// We will rely on draftId or allow public access for initiation if needed.

// 1. Get document rules
router.get('/document-rules', kycController.getDocumentRules);
router.get('/status', kycController.getVerificationStatus);

// 2. DigiLocker flow
router.post('/digilocker/initiate', kycController.initiateDigiLocker);
router.post('/digilocker/complete', kycController.completeDigiLocker);

// 3. API Verifications
router.post('/pan/verify', kycController.verifyPan);
router.post('/bank/verify', kycController.verifyBank);
router.post('/aadhaar/generate-otp', kycController.generateAadhaarOtp);
router.post('/aadhaar/verify', kycController.verifyAadhaar);
router.post('/selfie/verify', kycController.verifySelfieMatch);
router.post('/license/verify', kycController.verifyLicense);

// 4. File uploads (Selfie, DL, etc)
router.post('/document/upload', kycController.uploadDocument);

// 5. Admin Routes
router.post('/admin/document-rules', kycController.updateDocumentRules);

module.exports = router;
