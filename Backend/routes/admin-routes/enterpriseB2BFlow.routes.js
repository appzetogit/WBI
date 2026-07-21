const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/authMiddleware');
const { isAdmin } = require('../../middleware/roleMiddleware');
const ctrl = require('../../controllers/adminControllers/enterpriseB2BFlow.controller');

router.use(authenticate, isAdmin);

router.get('/flows', ctrl.listFlows);
router.get('/flow', ctrl.getFlow);
router.post('/flows/rebootstrap/:opportunityId', ctrl.rebootstrap);
router.post('/projects/:projectId/milestones/:milestoneId/qa-approve', ctrl.approveMilestoneQa);
router.post('/projects/:projectId/milestones/:milestoneId/customer-signoff', ctrl.approveMilestoneCustomer);
router.post('/projects/:projectId/milestones/:milestoneId/b2b-signoff', ctrl.approveMilestoneB2b);
router.get('/template-bundle/:categoryCode', ctrl.previewTemplateBundle);

module.exports = router;
