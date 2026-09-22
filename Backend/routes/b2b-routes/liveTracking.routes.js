const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/authMiddleware');
const { checkB2BPermission } = require('../../middleware/roleMiddleware');
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

// Admins have platform-wide tracking access (the controllers scope B2B callers
// to their company and let admins see every company). B2B callers still need
// the tracking permission of their role.
const trackingPermission = (req, res, next) => (
  ['ADMIN', 'super_admin', 'admin'].includes(req.userRole) ? next() : checkB2BPermission('tracking.read')(req, res, next)
);

// Summary & KPI route
router.get('/summary', trackingPermission, controller.getSummary);

// Engineers tracking list
router.get('/engineers', trackingPermission, controller.getEngineersList);

// Specific engineer tracking endpoints
router.get('/engineers/:engineerId', trackingPermission, controller.getEngineerDetails);
router.get('/engineers/:engineerId/location', trackingPermission, controller.getEngineerLocation);
router.get('/engineers/:engineerId/timeline', trackingPermission, controller.getEngineerTimeline);

// Route mapping API
router.get('/jobs/:jobId/route', trackingPermission, controller.getJobRoute);

// Recalculate ETAs
router.post('/refresh', trackingPermission, controller.refreshTracking);

module.exports = router;
