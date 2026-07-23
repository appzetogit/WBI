const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/authMiddleware');
const { isAdmin } = require('../../middleware/roleMiddleware');
const ctrl = require('../../controllers/adminControllers/adminPaymentConfigController');

router.use(authenticate, isAdmin);

router.get('/', ctrl.getConfig);
router.put('/', ctrl.updateConfig);
router.get('/audit-logs', ctrl.getAuditLogs);
router.get('/settlements', ctrl.getSettlements);

module.exports = router;
