const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/authMiddleware');
const ctrl = require('../../controllers/jobs/routingController');

router.use(authenticate);

router.get('/unassigned', ctrl.unassignedQueue);
router.post('/retry', ctrl.retry);
router.post('/jobs/:id', ctrl.rerun);
router.get('/jobs/:id/candidates', ctrl.candidates);
router.post('/jobs/:id/vendor', ctrl.pickVendor);

module.exports = router;
