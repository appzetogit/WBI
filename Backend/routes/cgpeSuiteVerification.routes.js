const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware');
const { isAdmin } = require('../middleware/roleMiddleware');
const { cgpeSuiteLimiter } = require('../middleware/rateLimiter');
const ctrl = require('../controllers/cgpeSuiteVerificationController');

// UPI VPA
router.get('/upi/validate', ctrl.validateVpaFormat);
router.post('/upi', cgpeSuiteLimiter, ctrl.verifyUpiHandler);
router.post('/upi/secure', authenticate, cgpeSuiteLimiter, ctrl.verifyUpiHandler);

// Mobile → UPI
router.get('/mobile-upi/validate', ctrl.validateMobileFormat);
router.post('/mobile-upi', cgpeSuiteLimiter, ctrl.mobileUpiHandler);
router.post('/mobile-upi/secure', authenticate, cgpeSuiteLimiter, ctrl.mobileUpiHandler);

// Location detector
router.post('/location', cgpeSuiteLimiter, ctrl.locationHandler);
router.post('/location/secure', authenticate, cgpeSuiteLimiter, ctrl.locationHandler);

// Admin
router.get('/admin/upi-verifications', authenticate, isAdmin, ctrl.adminListUpi);
router.get('/admin/upi-verifications/:id', authenticate, isAdmin, ctrl.adminGetUpi);
router.post('/admin/upi-verifications/:id/reverify', authenticate, isAdmin, ctrl.adminReverifyUpi);
router.get('/admin/location-verifications', authenticate, isAdmin, ctrl.adminListLocations);
router.get('/admin/location-verifications/:id', authenticate, isAdmin, ctrl.adminGetLocation);

module.exports = router;
