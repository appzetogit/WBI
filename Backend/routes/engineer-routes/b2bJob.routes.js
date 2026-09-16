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
router.get('/summary', engineerApiLimiter, engineerB2BJobController.getB2BJobDashboardSummary);
router.get('/:jobId', engineerApiLimiter, engineerB2BJobController.getB2BJobById);

router.post('/:jobId/accept', engineerActionLimiter, engineerB2BJobController.acceptB2BJobOffer);
router.post('/:jobId/reject', engineerActionLimiter, engineerB2BJobController.rejectB2BJobOffer);
router.post('/:jobId/start-travel', engineerActionLimiter, engineerB2BJobController.startTravel);
router.post('/:jobId/update-location', engineerApiLimiter, engineerB2BJobController.updateLocation);
router.post('/:jobId/arrive', engineerActionLimiter, engineerB2BJobController.arriveAtSite);
router.post('/:jobId/resend-otp', engineerActionLimiter, engineerB2BJobController.resendStartOtp);
router.post('/:jobId/start', engineerActionLimiter, engineerB2BJobController.startB2BJob);
router.post('/:jobId/customer-unavailable', engineerActionLimiter, engineerB2BJobController.markCustomerUnavailable);
router.post('/:jobId/complete', engineerActionLimiter, engineerB2BJobController.completeB2BJob);

module.exports = router;
