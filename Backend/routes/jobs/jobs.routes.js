const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/authMiddleware');
const ctrl = require('../../controllers/jobs/jobController');

// Every endpoint resolves the caller's scope server-side (jobScope.service);
// out-of-scope jobs return 403 regardless of role.
router.use(authenticate);

router.post('/bulk-assign', ctrl.bulkAssign);
router.get('/:id', ctrl.getJob);
router.get('/:id/timeline', ctrl.getTimeline);
router.get('/:id/assignments', ctrl.getAssignments);
router.get('/:id/eligible-engineers', ctrl.getEligibleEngineers);
router.post('/:id/assign', ctrl.assign);
router.post('/:id/reassign', ctrl.reassign);
router.post('/:id/accept', ctrl.accept);
router.post('/:id/decline', ctrl.decline);
router.post('/:id/release', ctrl.release);
router.post('/:id/transition', ctrl.transition);

module.exports = router;
