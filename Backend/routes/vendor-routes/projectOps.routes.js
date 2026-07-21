const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/authMiddleware');
const {
  getCounts,
  getProjects,
  getProjectById,
  createProject,
  updateProject,
  getSites,
  siteCheckIn,
  siteCheckOut,
  getMilestones,
  updateMilestone,
  getDispatches,
  assignDispatch,
  getLiveOps,
  getCalendar,
  listAssignableEngineers,
  assignEngineerToProject,
  getProjectJobs,
  getProjectEnterpriseFlow,
  approveMilestoneQa
} = require('../../controllers/vendorControllers/projectOpsController');

router.get('/counts', authenticate, getCounts);

router.get('/engineers', authenticate, listAssignableEngineers);

router.get('/projects', authenticate, getProjects);
router.post('/projects', authenticate, createProject);
router.get('/projects/:id', authenticate, getProjectById);
router.patch('/projects/:id', authenticate, updateProject);
router.get('/projects/:id/enterprise-flow', authenticate, getProjectEnterpriseFlow);
router.get('/projects/:id/jobs', authenticate, getProjectJobs);
router.post('/projects/:id/assign-engineer', authenticate, assignEngineerToProject);

router.get('/sites', authenticate, getSites);
router.post('/sites/:id/check-in', authenticate, siteCheckIn);
router.post('/sites/:id/check-out', authenticate, siteCheckOut);

router.get('/milestones', authenticate, getMilestones);
router.patch('/milestones/:id', authenticate, updateMilestone);
router.post('/milestones/:id/qa-approve', authenticate, approveMilestoneQa);

router.get('/dispatch', authenticate, getDispatches);
router.post('/dispatch/:id/assign', authenticate, assignDispatch);

router.get('/live', authenticate, getLiveOps);
router.get('/calendar', authenticate, getCalendar);

module.exports = router;
