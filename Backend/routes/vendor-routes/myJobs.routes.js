const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/authMiddleware');
const { isVendor } = require('../../middleware/roleMiddleware');
const {
  getMyJobs,
  getJobDetails,
  assignEngineerToJob,
  updateJobStatus
} = require('../../controllers/vendorControllers/vendorMyJobsController');

// All endpoints require vendor authentication
router.get('/', authenticate, isVendor, getMyJobs);
router.get('/:id', authenticate, isVendor, getJobDetails);
router.post('/:id/assign-engineer', authenticate, isVendor, assignEngineerToJob);
router.post('/:id/status', authenticate, isVendor, updateJobStatus);

module.exports = router;
