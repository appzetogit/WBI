const express = require('express');
const router = express.Router();
const { 
  getConfig, 
  updateBusinessDetails, 
  updateModels, 
  updateOneTimeCapability,
  updateProjectCapability,
  addPortfolio,
  getDocumentRequirements,
  submitApplication,
  verifyKyc,
  verifyBankPennyDrop,
  completeInduction,
  activateAccount
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

router.get('/registration-config', getConfig);
router.patch('/onboarding/business', updateBusinessDetails);
router.patch('/onboarding/models', updateModels);
router.patch('/onboarding/one-time-capability', updateOneTimeCapability);
router.patch('/onboarding/project-capability', updateProjectCapability);
router.post('/onboarding/portfolio', addPortfolio);
router.get('/onboarding/document-requirements', getDocumentRequirements);
// POST /onboarding/documents can be handled by /upload and updating the VendorDocument schema (not fully implemented in controller yet, but we'll leave placeholder)
router.post('/onboarding/submit', submitApplication);

router.post('/verify-kyc', verifyKyc);
router.post('/verify-bank-penny-drop', verifyBankPennyDrop);
router.post('/complete-induction', completeInduction);
router.post('/activate-account', activateAccount);

module.exports = router;
