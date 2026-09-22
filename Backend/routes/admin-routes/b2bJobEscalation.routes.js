const express = require('express');
const router = express.Router();

const { authenticate } = require('../../middleware/authMiddleware');
const { isAdmin } = require('../../middleware/roleMiddleware');
const ctrl = require('../../controllers/adminControllers/b2bJobEscalationController');

router.use(authenticate, isAdmin);

// Escalations
router.get('/escalations', ctrl.listEscalations);
router.get('/unmatched-services', ctrl.listUnmatchedServices);
router.get('/escalations/:jobId', ctrl.getEscalationDetail);
router.get('/escalations/:jobId/engineer-suggestions', ctrl.suggestEngineers);
router.get('/escalations/:jobId/vendor-candidates', ctrl.suggestVendors);
router.post('/escalations/:jobId/retry', ctrl.retryAllocation);
router.post('/escalations/:jobId/assign', ctrl.manualAssign);
router.post('/escalations/:jobId/route-to-vendor', ctrl.routeToVendor);

// Submissions QA / Verification Review
router.get('/submissions', ctrl.listSubmissions);
router.get('/submissions/:jobId', ctrl.getSubmissionDetail);
router.post('/submissions/:jobId/approve', ctrl.approveCompletion);
router.post('/submissions/:jobId/reject', ctrl.rejectCompletion);

module.exports = router;
