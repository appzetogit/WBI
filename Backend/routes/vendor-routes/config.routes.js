const express = require('express');
const router = express.Router();
const vendorConfigController = require('../../controllers/vendorControllers/vendorConfigController');
const { authenticate } = require('../../middleware/authMiddleware');

router.get('/config', authenticate, vendorConfigController.getDynamicConfig);
router.get('/dashboard/kpis', authenticate, vendorConfigController.getDashboardKpis);
router.get('/dashboard/alerts', authenticate, vendorConfigController.getDashboardAlerts);

module.exports = router;
