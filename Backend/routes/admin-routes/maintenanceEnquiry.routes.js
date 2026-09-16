const express = require('express');
const router = express.Router();
const maintenanceEnquiryController = require('../../controllers/maintenanceEnquiry.controller');
const { authenticate } = require('../../middleware/authMiddleware');
const { isAdmin } = require('../../middleware/roleMiddleware');

// Admin-only: these expose enquiry records containing customer names, phone
// numbers and addresses. Previously mounted with no auth middleware at all.
router.use(authenticate, isAdmin);

router.get('/', maintenanceEnquiryController.getAllEnquiries);
router.get('/:id', maintenanceEnquiryController.getEnquiryById);
router.put('/:id/status', maintenanceEnquiryController.updateEnquiryStatus);
router.delete('/:id', maintenanceEnquiryController.deleteEnquiry);

module.exports = router;
