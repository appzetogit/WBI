const express = require('express');
const router = express.Router();
const breakdownEnquiryController = require('../../controllers/breakdownEnquiry.controller');
const { authenticate } = require('../../middleware/authMiddleware');
const { isAdmin } = require('../../middleware/roleMiddleware');

// Admin-only: these expose enquiry records containing customer names, phone
// numbers and addresses. Previously mounted with no auth middleware at all.
router.use(authenticate, isAdmin);

router.get('/', breakdownEnquiryController.getAllEnquiries);
router.get('/:id', breakdownEnquiryController.getEnquiryById);
router.put('/:id/status', breakdownEnquiryController.updateEnquiryStatus);
router.delete('/:id', breakdownEnquiryController.deleteEnquiry);

module.exports = router;
