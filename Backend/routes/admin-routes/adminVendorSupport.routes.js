const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/authMiddleware');
const { isAdmin } = require('../../middleware/roleMiddleware');
const ctrl = require('../../controllers/adminControllers/adminVendorSupportController');

router.use(authenticate, isAdmin);

router.get('/config', ctrl.getConfig);
router.put('/config', ctrl.upsertConfig);
router.patch('/config', ctrl.upsertConfig);

router.get('/tickets', ctrl.listTickets);
router.get('/tickets/export', ctrl.exportTickets);
router.get('/tickets/:id', ctrl.getTicket);
router.post('/tickets/:id/transition', ctrl.transitionTicket);
router.post('/tickets/:id/comments', ctrl.commentTicket);

router.get('/analytics', ctrl.getAnalytics);
router.post('/jobs/sla', ctrl.runSlaJob);

module.exports = router;
