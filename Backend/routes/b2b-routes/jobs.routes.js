const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/authMiddleware');
const { isApprovedB2B } = require('../../middleware/roleMiddleware');
const b2bJobController = require('../../controllers/b2bControllers/b2bJobController');

// All routes require authentication and B2B approval
router.use(authenticate);
router.use(isApprovedB2B);

// Job Stats & Export (Must be placed before /:id routes)
router.get('/stats', b2bJobController.getStats);
router.get('/filter-meta', b2bJobController.getFilterMeta);
router.get('/recent-activity', b2bJobController.getRecentActivity);
router.get('/export', b2bJobController.exportJobs);

// Job Actions
router.post('/reassign', b2bJobController.reassignEngineer);

// Quote / Dispute Approval Routes
router.get('/quotes/pending', b2bJobController.getPendingQuotes);
router.post('/quotes/:quoteId/approve', b2bJobController.approveQuote);
router.post('/quotes/:quoteId/reject', b2bJobController.rejectQuote);
router.post(
  '/projects/:projectId/milestones/:milestoneId/b2b-signoff',
  b2bJobController.approveProjectMilestoneB2b
);

// Core CRUD and Job specific getters
router.get('/', b2bJobController.getJobs);
router.get('/:id/enterprise-flow', b2bJobController.getJobEnterpriseFlow);
router.post('/:id/rematch', b2bJobController.rematchJob);
router.post('/:id/approve-work', b2bJobController.approveJobWork);
router.get('/:id', b2bJobController.getJobDetails);
router.patch('/:id', b2bJobController.updateJob);
router.delete('/:id', b2bJobController.cancelJob);

// Tracking, Timelines, and Ratings
router.get('/timeline/:id', b2bJobController.getJobTimeline);
router.get('/live/:id', b2bJobController.getLiveTracking);
router.get('/logs/:id', b2bJobController.getJobLogs);
router.post('/:jobId/rating', b2bJobController.submitEngineerRating);

module.exports = router;

