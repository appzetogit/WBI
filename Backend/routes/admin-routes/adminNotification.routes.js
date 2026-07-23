const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/authMiddleware');
const { isAdmin } = require('../../middleware/roleMiddleware');
const {
  getDeliveryLogs,
  announce,
  listEvents,
  testEmit
} = require('../../controllers/adminControllers/adminNotificationController');

router.use(authenticate, isAdmin);

router.get('/delivery-logs', getDeliveryLogs);
router.get('/events', listEvents);
router.post('/announce', announce);
router.post('/test-emit', testEmit);

module.exports = router;
