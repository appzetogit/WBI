const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware');
const { isAdmin } = require('../middleware/roleMiddleware');
const { cinVerifyLimiter } = require('../middleware/rateLimiter');
const ctrl = require('../controllers/cinVerificationController');

// Format pre-check
router.get('/cin/validate', ctrl.validateFormat);

// Live CGPE MCA/CIN verification
router.post('/cin', cinVerifyLimiter, ctrl.verifyCinHandler);
router.post('/cin/secure', authenticate, cinVerifyLimiter, ctrl.verifyCinHandler);

// Admin console
router.get('/admin/cin-verifications', authenticate, isAdmin, ctrl.adminList);
router.get('/admin/cin-verifications/export', authenticate, isAdmin, ctrl.adminExport);
router.get('/admin/cin-verifications/:id', authenticate, isAdmin, ctrl.adminGet);
router.post('/admin/cin-verifications/:id/reverify', authenticate, isAdmin, ctrl.adminReverify);
router.post('/admin/cin-verifications/:id/override', authenticate, isAdmin, ctrl.adminOverrideHandler);

module.exports = router;
