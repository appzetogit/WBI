const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/authMiddleware');
const { isEngineer } = require('../../middleware/roleMiddleware');
const ctrl = require('../../controllers/assignment/projectAssignment.controller');
const rateLimiter = require('../../middleware/rateLimiter');
const { engineerApiLimiter, engineerActionLimiter } = rateLimiter;

router.use(authenticate, isEngineer);

router.get('/pool', engineerApiLimiter, ctrl.listFreelancerPool);
router.post('/pool/:id/accept', engineerActionLimiter, ctrl.acceptFreelancerPool);

module.exports = router;
