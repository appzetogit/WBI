const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/authMiddleware');
const { isApprovedB2B, checkB2BPermission } = require('../../middleware/roleMiddleware');
const b2bJobController = require('../../controllers/b2bControllers/b2bJobController');

// All routes require authentication and B2B approval
router.use(authenticate);
router.use(isApprovedB2B);

// Job Stats & Export (Must be placed before /:id routes)
router.get('/stats', checkB2BPermission('jobs.read'), b2bJobController.getStats);
router.get('/filter-meta', checkB2BPermission('jobs.read'), b2bJobController.getFilterMeta);
router.get('/recent-activity', checkB2BPermission('jobs.read'), b2bJobController.getRecentActivity);
router.get('/export', checkB2BPermission('jobs.read'), b2bJobController.exportJobs);

// Job Actions
router.post('/reassign', checkB2BPermission('jobs.manage'), b2bJobController.reassignEngineer);

// Quote / Dispute Approval Routes
router.get('/quotes/pending', checkB2BPermission('jobs.read'), b2bJobController.getPendingQuotes);
router.post('/quotes/:quoteId/approve', checkB2BPermission('jobs.manage'), b2bJobController.approveQuote);
router.post('/quotes/:quoteId/reject', checkB2BPermission('jobs.manage'), b2bJobController.rejectQuote);
router.post(
  '/projects/:projectId/milestones/:milestoneId/b2b-signoff',
  checkB2BPermission('jobs.manage'),
  b2bJobController.approveProjectMilestoneB2b
);

// Core CRUD and Job specific getters
router.get('/', checkB2BPermission('jobs.read'), b2bJobController.getJobs);
router.get('/:id/enterprise-flow', checkB2BPermission('jobs.read'), b2bJobController.getJobEnterpriseFlow);
router.post('/:id/rematch', checkB2BPermission('jobs.manage'), b2bJobController.rematchJob);
router.post('/:id/approve-work', checkB2BPermission('jobs.manage'), b2bJobController.approveJobWork);
router.get('/:id', checkB2BPermission('jobs.read'), b2bJobController.getJobDetails);
router.patch('/:id', checkB2BPermission('jobs.manage'), b2bJobController.updateJob);
router.delete('/:id', checkB2BPermission('jobs.manage'), b2bJobController.cancelJob);

// Tracking, Timelines, and Ratings
router.get('/timeline/:id', checkB2BPermission('jobs.read'), b2bJobController.getJobTimeline);
router.get('/live/:id', checkB2BPermission('jobs.read'), b2bJobController.getLiveTracking);
router.get('/logs/:id', checkB2BPermission('jobs.read'), b2bJobController.getJobLogs);
router.post('/:jobId/rating', checkB2BPermission('jobs.manage'), b2bJobController.submitEngineerRating);

module.exports = router;

