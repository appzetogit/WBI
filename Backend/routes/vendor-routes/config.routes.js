const express = require('express');
const router = express.Router();
const vendorConfigController = require('../../controllers/vendorControllers/vendorConfigController');
const { authenticate } = require('../../middleware/authMiddleware');

router.get('/config', authenticate, vendorConfigController.getDynamicConfig);

module.exports = router;
