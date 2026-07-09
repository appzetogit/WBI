const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/authMiddleware');
const { isEngineer } = require('../../middleware/roleMiddleware');
const engineerB2BJobController = require('../../controllers/engineerControllers/engineerB2BJobController');

router.use(authenticate);
router.use(isEngineer);

router.get('/', engineerB2BJobController.getAssignedB2BJobs);
router.post('/:jobId/start', engineerB2BJobController.startB2BJob);
router.post('/:jobId/complete', engineerB2BJobController.completeB2BJob);

module.exports = router;
