const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/authMiddleware');
const { isAdmin } = require('../../middleware/roleMiddleware');
const { getSettings, updateSettings } = require('../../controllers/adminControllers/b2bPlatformConfigController');

// Admin-only, applied at router level.
router.use(authenticate, isAdmin);

router.get('/', getSettings);
router.patch('/', updateSettings);

module.exports = router;
