const express = require('express');
const router = express.Router();
const installationEnquiryController = require('../../controllers/installationEnquiry.controller');
const { authenticate } = require('../../middleware/authMiddleware');
const { isAdmin } = require('../../middleware/roleMiddleware');

// Admin-only: these expose enquiry records containing customer names, phone
// numbers and addresses. Previously mounted with no auth middleware at all.
router.use(authenticate, isAdmin);

router.get('/', installationEnquiryController.getAllEnquiries);
router.get('/:id', installationEnquiryController.getEnquiryById);
router.put('/:id/status', installationEnquiryController.updateEnquiryStatus);
router.delete('/:id', installationEnquiryController.deleteEnquiry);

module.exports = router;
