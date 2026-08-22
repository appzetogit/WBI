const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/authMiddleware');
const { isEngineer } = require('../../middleware/roleMiddleware');
const engineerB2BJobController = require('../../controllers/engineerControllers/engineerB2BJobController');
const rateLimiter = require('../../middleware/rateLimiter');
const { engineerApiLimiter, engineerActionLimiter } = rateLimiter;

router.use(authenticate);
router.use(isEngineer);

router.get('/', engineerApiLimiter, engineerB2BJobController.getAssignedB2BJobs);
router.post('/:jobId/accept', engineerActionLimiter, engineerB2BJobController.acceptB2BJobOffer);
router.get('/:jobId', engineerApiLimiter, engineerB2BJobController.getB2BJobById);
router.post('/:jobId/resend-otp', engineerActionLimiter, engineerB2BJobController.resendStartOtp);
router.post('/:jobId/start', engineerActionLimiter, engineerB2BJobController.startB2BJob);
router.post('/:jobId/complete', engineerActionLimiter, engineerB2BJobController.completeB2BJob);

module.exports = router;
