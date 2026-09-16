const express = require('express');
const router = express.Router();
const designEnquiryController = require('../../controllers/designEnquiry.controller');
const { authenticate } = require('../../middleware/authMiddleware');
const { isAdmin } = require('../../middleware/roleMiddleware');

// Admin-only: these expose enquiry records containing customer names, phone
// numbers and addresses. Previously mounted with no auth middleware at all.
router.use(authenticate, isAdmin);

// All routes here should be protected by admin middleware in server.js
router.get('/', designEnquiryController.getAllEnquiries);
router.get('/:id', designEnquiryController.getEnquiryById);
router.put('/:id/status', designEnquiryController.updateEnquiryStatus);
router.delete('/:id', designEnquiryController.deleteEnquiry);

module.exports = router;
