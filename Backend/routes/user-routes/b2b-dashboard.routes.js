const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/authMiddleware');
const { isApprovedB2B } = require('../../middleware/roleMiddleware');
const b2bDashboardController = require('../../controllers/b2bDashboard.controller');

/**
 * B2B Dashboard Analytics.
 *
 * Previously guarded by `authenticate` alone, so any logged-in user of ANY role
 * could read these — and the controller ignored the caller entirely, returning
 * platform-wide customer coordinates. Now restricted to approved B2B principals;
 * the controller scopes every query to `req.companyId` from the token.
 *
 * NOTE: this router lives under user-routes for historical reasons and is
 * mounted at /api/b2b-dashboard. It belongs in b2b-routes — see the panel
 * consolidation plan. Left in place here to avoid changing a live URL.
 */
router.use(authenticate, isApprovedB2B);

router.get('/heatmap', b2bDashboardController.getB2BHeatmapData);
router.get('/sla', b2bDashboardController.getB2BSLAMetrics);
router.get('/repeat-calls', b2bDashboardController.getChronicRepeatCalls);
router.get('/ledger', b2bDashboardController.getB2BFinancialLedger);

module.exports = router;
