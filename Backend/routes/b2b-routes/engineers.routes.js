const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/authMiddleware');
const { isApprovedB2B, checkB2BPermission } = require('../../middleware/roleMiddleware');
const b2bEngineerController = require('../../controllers/b2bControllers/b2bEngineerController');

router.use(authenticate);
router.use(isApprovedB2B);

router.get('/stats', checkB2BPermission('engineers.read'), b2bEngineerController.getStats);
router.get('/export', checkB2BPermission('engineers.read'), b2bEngineerController.exportEngineers);
router.get('/live', checkB2BPermission('engineers.read'), b2bEngineerController.getLiveTracking);

router.get('/', checkB2BPermission('engineers.read'), b2bEngineerController.getEngineers);
router.get('/:engineerId', checkB2BPermission('engineers.read'), b2bEngineerController.getEngineerDetails);
router.get('/:engineerId/current-job', checkB2BPermission('engineers.read'), b2bEngineerController.getCurrentJob);
router.get('/:engineerId/performance', checkB2BPermission('engineers.read'), b2bEngineerController.getPerformance);
router.get('/:engineerId/timeline', checkB2BPermission('engineers.read'), b2bEngineerController.getTimeline);

module.exports = router;
