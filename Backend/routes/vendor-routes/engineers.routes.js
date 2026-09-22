const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/authMiddleware');
const { isVendor } = require('../../middleware/roleMiddleware');
const {
  getEngineers,
  getEngineerDetails,
  getAssignableJobs,
  assignJobToEngineer,
  updateEngineerStatus,
  syncEngineers,
  createEngineer,
  updateEngineerProfile
} = require('../../controllers/vendorControllers/vendorEngineersController');

// All routes require vendor authentication
router.use(authenticate);
router.use(isVendor);

router.get('/', getEngineers);
router.post('/', createEngineer);
router.get('/assignable-jobs', getAssignableJobs);
router.post('/sync', syncEngineers);
router.get('/:id', getEngineerDetails);
router.patch('/:id', updateEngineerProfile);
router.post('/:id/assign-job', assignJobToEngineer);
router.patch('/:id/status', updateEngineerStatus);

module.exports = router;
