const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/authMiddleware');
const { isApprovedB2B, checkB2BPermission } = require('../../middleware/roleMiddleware');
const ctrl = require('../../controllers/b2bControllers/b2bAssignmentController');

router.use(authenticate, isApprovedB2B);

router.get('/summary', checkB2BPermission('jobs.read'), ctrl.getSummary);
router.get('/current', checkB2BPermission('jobs.read'), ctrl.getCurrent);
router.get('/history', checkB2BPermission('jobs.read'), ctrl.getHistory);

module.exports = router;
