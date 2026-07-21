const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/authMiddleware');
const { isEngineer } = require('../../middleware/roleMiddleware');
const ctrl = require('../../controllers/engineerControllers/engineerOpsJobController');
const rateLimiter = require('../../middleware/rateLimiter');
const { engineerApiLimiter, engineerActionLimiter } = rateLimiter;

router.use(authenticate, isEngineer);

router.get('/', engineerApiLimiter, ctrl.listOpsJobs);
router.get('/:id', engineerApiLimiter, ctrl.getOpsJob);
router.post('/:id/accept', engineerActionLimiter, ctrl.acceptOpsJob);
router.post('/:id/reject', engineerActionLimiter, ctrl.rejectOpsJob);
router.post('/:id/start', engineerActionLimiter, ctrl.startOpsJob);
router.post('/:id/complete', engineerActionLimiter, ctrl.completeOpsJob);

module.exports = router;
