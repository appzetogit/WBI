const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/authMiddleware');
const { isEngineer } = require('../../middleware/roleMiddleware');
const { getDashboardStats } = require('../../controllers/engineerControllers/engineerDashboardController');
const rateLimiter = require('../../middleware/rateLimiter');
const { engineerApiLimiter } = rateLimiter;

// Routes
router.get('/stats', authenticate, isEngineer, engineerApiLimiter, getDashboardStats);

module.exports = router;
