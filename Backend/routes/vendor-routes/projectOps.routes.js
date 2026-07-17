const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/authMiddleware');
const {
  getCounts,
  getProjects,
  getProjectById,
  updateProject,
  getSites,
  siteCheckIn,
  siteCheckOut,
  getMilestones,
  updateMilestone,
  getDispatches,
  assignDispatch,
  getLiveOps,
  getCalendar
} = require('../../controllers/vendorControllers/projectOpsController');

router.get('/counts', authenticate, getCounts);

router.get('/projects', authenticate, getProjects);
router.get('/projects/:id', authenticate, getProjectById);
router.patch('/projects/:id', authenticate, updateProject);

router.get('/sites', authenticate, getSites);
router.post('/sites/:id/check-in', authenticate, siteCheckIn);
router.post('/sites/:id/check-out', authenticate, siteCheckOut);

router.get('/milestones', authenticate, getMilestones);
router.patch('/milestones/:id', authenticate, updateMilestone);

router.get('/dispatch', authenticate, getDispatches);
router.post('/dispatch/:id/assign', authenticate, assignDispatch);

router.get('/live', authenticate, getLiveOps);
router.get('/calendar', authenticate, getCalendar);

module.exports = router;
