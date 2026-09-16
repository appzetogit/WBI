const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/authMiddleware');
const { isVendor } = require('../../middleware/roleMiddleware');
const { authenticateOnboarding, optionalOnboardingAuth } = require('../../middleware/onboardingAuthMiddleware');
const { registrationLimiter } = require('../../middleware/rateLimiter');
const { 
  getConfig, 
  updateBusinessDetails, 
  updateModels, 
  updateOneTimeCapability,
  updateProjectCapability,
  addPortfolio,
  getDocumentRequirements,
  getKycSnapshot,
  syncKycCompliance,
  submitApplication,
  verifyKyc,
  verifyBankPennyDrop,
  completeInduction,
  activateAccount,
  getOnboardingStatus
} = require('../../controllers/vendorControllers/vendorRegistrationController');
const { uploadGenericFile, handleMulterError } = require('../../middleware/uploadMiddleware');

router.post('/upload', uploadGenericFile, handleMulterError, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }
    res.status(200).json({ success: true, url: req.file.path });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Upload failed', error: error.message });
  }
});

// Public: read-only registration form configuration (no vendor data).
router.get('/registration-config', getConfig);

// Public: creates the Vendor record — there is no identity to authenticate yet.
// Rate-limited to blunt automated vendor-record creation.
router.post('/onboarding/submit', registrationLimiter, optionalOnboardingAuth, submitApplication);

/**
 * Onboarding-scoped endpoints.
 *
 * These act on an existing, not-yet-approved vendor, so a normal vendor session
 * is not available (`authenticate` rejects unapproved vendors). They are guarded
 * by `authenticateOnboarding`, which resolves the vendor from a session or a
 * signed onboarding token instead of a body-supplied vendorId.
 */
router.get('/onboarding/status', authenticateOnboarding, getOnboardingStatus);
router.get('/onboarding/document-requirements', authenticateOnboarding, getDocumentRequirements);
router.get('/onboarding/kyc-snapshot', authenticateOnboarding, getKycSnapshot);
router.post('/onboarding/sync-kyc', authenticateOnboarding, syncKycCompliance);
router.post('/verify-kyc', authenticateOnboarding, verifyKyc);
router.post('/verify-bank-penny-drop', authenticateOnboarding, verifyBankPennyDrop);
router.post('/complete-induction', authenticateOnboarding, completeInduction);

/**
 * Step-wise wizard endpoints — no current frontend caller (verified by grep
 * across Frontend/src). Kept for API compatibility but require a full vendor
 * session, since nothing legitimately calls them pre-auth.
 */
router.patch('/onboarding/business', authenticate, isVendor, updateBusinessDetails);
router.patch('/onboarding/models', authenticate, isVendor, updateModels);
router.patch('/onboarding/one-time-capability', authenticate, isVendor, updateOneTimeCapability);
router.patch('/onboarding/project-capability', authenticate, isVendor, updateProjectCapability);
router.post('/onboarding/portfolio', authenticate, isVendor, addPortfolio);

router.post('/activate-account', authenticate, isVendor, activateAccount);

module.exports = router;
