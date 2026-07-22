const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/authMiddleware');
const { isAdmin } = require('../../middleware/roleMiddleware');
const ctrl = require('../../controllers/adminControllers/adminVendorSettingsController');

router.use(authenticate, isAdmin);

router.get('/config', ctrl.getConfig);
router.put('/config', ctrl.saveConfig);
router.patch('/config', ctrl.saveConfig);

router.get('/vendors/:vendorId', ctrl.getVendorSettings);
router.put('/vendors/:vendorId', ctrl.updateVendorSettingsAdmin);
router.patch('/vendors/:vendorId', ctrl.updateVendorSettingsAdmin);

module.exports = router;
