const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/authMiddleware');
const {
  getCompanyCode,
  regenerateCompanyCode,
  generateInviteLink,
  listPendingEngineerApprovals,
  listLinkedEngineers,
  approveLinkedEngineer,
  rejectLinkedEngineer
} = require('../../controllers/vendorControllers/vendorCompanyCodeController');

router.get('/company-code', authenticate, getCompanyCode);
router.post('/regenerate-code', authenticate, regenerateCompanyCode);
router.post('/generate-invite-link', authenticate, generateInviteLink);

router.get('/engineers/pending-approvals', authenticate, listPendingEngineerApprovals);
router.get('/engineers/linked', authenticate, listLinkedEngineers);
router.post('/engineers/:id/approve', authenticate, approveLinkedEngineer);
router.post('/engineers/:id/reject', authenticate, rejectLinkedEngineer);

module.exports = router;
