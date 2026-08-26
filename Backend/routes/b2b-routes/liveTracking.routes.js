const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/authMiddleware');
const controller = require('../../controllers/b2bControllers/b2bLiveTrackingController');

// All live tracking endpoints are JWT-protected (Admin, approved B2B company)
router.use(authenticate);

// Custom role verification middleware for Live Tracking
const verifyLiveTrackingAccess = (req, res, next) => {
  const isAdmin = ['ADMIN', 'super_admin', 'admin'].includes(req.userRole);
  const isB2B = req.userRole === 'B2B' || req.userRole === 'b2b';

  if (isAdmin) {
    return next();
  }

  if (isB2B) {
    if (req.user.verificationStatus !== 'approved') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. B2B account must be approved by admin.'
      });
    }
    return next();
  }

  return res.status(403).json({
    success: false,
    message: 'Access denied. Unauthorized role.'
  });
};

router.use(verifyLiveTrackingAccess);

// Summary & KPI route
router.get('/summary', controller.getSummary);

// Engineers tracking list
router.get('/engineers', controller.getEngineersList);

// Specific engineer tracking endpoints
router.get('/engineers/:engineerId', controller.getEngineerDetails);
router.get('/engineers/:engineerId/location', controller.getEngineerLocation);
router.get('/engineers/:engineerId/timeline', controller.getEngineerTimeline);

// Route mapping API
router.get('/jobs/:jobId/route', controller.getJobRoute);

// Refresh simulation
router.post('/refresh', controller.refreshTracking);

module.exports = router;
