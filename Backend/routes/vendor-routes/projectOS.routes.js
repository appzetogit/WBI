const express = require('express');
const router = express.Router();
const projectOSController = require('../../controllers/vendorControllers/projectOSController');
const { authenticate } = require('../../middleware/authMiddleware');

router.get('/', authenticate, projectOSController.getVendorProjects);
router.get('/:projectId', authenticate, projectOSController.getProjectDetails);
router.put('/:projectId/milestones/:milestoneId', authenticate, projectOSController.updateMilestone);

module.exports = router;
