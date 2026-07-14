const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/authMiddleware');
const b2bDashboardController = require('../../controllers/b2bDashboard.controller');

// B2B Dashboard Analytics APIs
router.get('/heatmap', authenticate, b2bDashboardController.getB2BHeatmapData);
router.get('/sla', authenticate, b2bDashboardController.getB2BSLAMetrics);
router.get('/repeat-calls', authenticate, b2bDashboardController.getChronicRepeatCalls);
router.get('/ledger', authenticate, b2bDashboardController.getB2BFinancialLedger);

module.exports = router;
