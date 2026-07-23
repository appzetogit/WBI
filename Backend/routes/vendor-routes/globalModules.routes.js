const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/authMiddleware');
const ctrl = require('../../controllers/vendorControllers/globalModulesController');

router.get('/counts', authenticate, ctrl.getGlobalCounts);

router.get('/performance', authenticate, ctrl.getPerformance);

router.get('/compliance', authenticate, ctrl.getCompliance);
router.post('/compliance/sync', authenticate, ctrl.syncCompliance);
router.patch('/compliance/:id', authenticate, ctrl.updateCompliance);
router.post(
  '/compliance/:id/upload',
  authenticate,
  require('../../middleware/uploadMiddleware').uploadGenericFile,
  ctrl.uploadComplianceDocument
);

router.get('/notifications', authenticate, ctrl.getNotifications);
router.patch('/notifications/:id', authenticate, ctrl.updateNotification);
router.post('/notifications/bulk', authenticate, ctrl.bulkUpdateNotifications);
router.post('/notifications/read-all', authenticate, ctrl.markAllNotificationsRead);
router.get('/notification-preferences', authenticate, ctrl.getNotificationPreferences);
router.patch('/notification-preferences', authenticate, ctrl.updateNotificationPreferences);

router.get('/support/config', authenticate, ctrl.getSupportConfig);
router.get('/support', authenticate, ctrl.getSupport);
router.get('/support/:id', authenticate, ctrl.getSupportTicket);
router.post('/support', authenticate, ctrl.createSupportTicket);
router.patch('/support/:id', authenticate, ctrl.updateSupportTicket);

router.get('/settings', authenticate, ctrl.getSettings);
router.patch('/settings', authenticate, ctrl.updateSettings);

module.exports = router;
