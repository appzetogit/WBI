const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/authMiddleware');
const { isVendor } = require('../../middleware/roleMiddleware');

const {
  getVendorServiceOptions,
  getVendorServiceSummary,
  getVendorServiceOfferings,
  createVendorServiceOffering,
  updateVendorServiceOffering,
  submitForApproval,
  activateOffering,
  archiveOffering
} = require('../../controllers/vendorControllers/vendorServiceOffering.controller');

// Base route: /api/vendor/service-offerings

router.get('/options', authenticate, isVendor, getVendorServiceOptions);
router.get('/summary', authenticate, isVendor, getVendorServiceSummary);
router.get('/', authenticate, isVendor, getVendorServiceOfferings);

router.post('/', authenticate, isVendor, createVendorServiceOffering);
router.patch('/:id', authenticate, isVendor, updateVendorServiceOffering);

router.post('/:id/submit', authenticate, isVendor, submitForApproval);
router.post('/:id/activate', authenticate, isVendor, activateOffering);
router.post('/:id/archive', authenticate, isVendor, archiveOffering);

module.exports = router;
