const express = require('express');
const router = express.Router();
const { 
  getConfig, 
  createDraft, 
  updateDraft, 
  submitRegistration,
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
router.post('/registration-draft', createDraft);
router.patch('/registration-draft/:id', updateDraft);
router.post('/registration-submit', submitRegistration);

router.post('/verify-kyc', verifyKyc);
router.post('/verify-bank-penny-drop', verifyBankPennyDrop);
router.post('/complete-induction', completeInduction);
router.post('/activate-account', activateAccount);

module.exports = router;
