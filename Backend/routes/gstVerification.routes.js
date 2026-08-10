const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware');
const { isAdmin } = require('../middleware/roleMiddleware');
const { verificationLimiter, gstVerifyLimiter } = require('../middleware/rateLimiter');
const ctrl = require('../controllers/gstVerificationController');

// Format pre-check (cheap, no provider call)
router.get('/gst/validate', ctrl.validateFormat);

// Live CGPE GST verification — rate limited (registration may be unauthenticated)
router.post('/gst', gstVerifyLimiter, ctrl.verifyGstHandler);

// Authenticated re-verify for logged-in vendor/b2b with body entity binding
router.post('/gst/secure', authenticate, gstVerifyLimiter, ctrl.verifyGstHandler);

// Admin GST verification console
router.get('/admin/gst-verifications', authenticate, isAdmin, ctrl.adminList);
router.get('/admin/gst-verifications/:id', authenticate, isAdmin, ctrl.adminGet);
router.post('/admin/gst-verifications/:id/reverify', authenticate, isAdmin, ctrl.adminReverify);
router.post('/admin/gst-verifications/:id/override', authenticate, isAdmin, ctrl.adminOverrideHandler);

module.exports = router;
