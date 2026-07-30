const express = require('express');
const router = express.Router();

const { authenticate } = require('../../middleware/authMiddleware');
const { isAdmin } = require('../../middleware/roleMiddleware');
const ctrl = require('../../controllers/adminControllers/b2bJobEscalationController');

router.use(authenticate, isAdmin);

router.get('/escalations', ctrl.listEscalations);
router.get('/unmatched-services', ctrl.listUnmatchedServices);
router.get('/escalations/:jobId', ctrl.getEscalationDetail);
router.get('/escalations/:jobId/engineer-suggestions', ctrl.suggestEngineers);
router.post('/escalations/:jobId/retry', ctrl.retryAllocation);
router.post('/escalations/:jobId/assign', ctrl.manualAssign);

module.exports = router;
