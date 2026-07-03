const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/authMiddleware');
const { isAdmin } = require('../../middleware/roleMiddleware');
const {
  getTicketsAdmin,
  getTicketByIdAdmin,
  updateTicketStatusAdmin,
  assignTicketAdmin,
  sendMessageAdmin
} = require('../../controllers/adminControllers/b2bSupportAdminController');

// All endpoints are JWT authenticated and admin role protected
router.use(authenticate, isAdmin);

router.get('/tickets', getTicketsAdmin);
router.get('/tickets/:ticketId', getTicketByIdAdmin);
router.patch('/tickets/:ticketId/status', updateTicketStatusAdmin);
router.patch('/tickets/:ticketId/assign', assignTicketAdmin);
router.post('/tickets/:ticketId/messages', sendMessageAdmin);

module.exports = router;
