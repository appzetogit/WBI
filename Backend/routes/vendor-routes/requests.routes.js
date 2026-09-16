const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/authMiddleware');
const { isVendor } = require('../../middleware/roleMiddleware');
const {
  getRequests,
  getRequestDetails,
  acceptRequest,
  rejectRequest,
  assignEngineerToRequest
} = require('../../controllers/vendorControllers/vendorRequestsController');

// All endpoints require vendor authentication
router.get('/', authenticate, isVendor, getRequests);
router.get('/:id', authenticate, isVendor, getRequestDetails);
router.post('/:id/accept', authenticate, isVendor, acceptRequest);
router.post('/:id/reject', authenticate, isVendor, rejectRequest);
router.post('/:id/assign-engineer', authenticate, isVendor, assignEngineerToRequest);

module.exports = router;
