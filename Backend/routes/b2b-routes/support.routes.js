const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/authMiddleware');
const { isApprovedB2B } = require('../../middleware/roleMiddleware');
const { uploadGenericFile, handleMulterError } = require('../../middleware/uploadMiddleware');
const {
  getSupportSummary,
  getTickets,
  createTicket,
  getTicketById,
  sendMessage,
  closeTicket,
  uploadSupportAttachment
} = require('../../controllers/b2bControllers/b2bSupportController');

// All endpoints are JWT authenticated and B2B approved status protected
router.use(authenticate, isApprovedB2B);

router.get('/summary', getSupportSummary);
router.get('/tickets', getTickets);
router.post('/tickets', createTicket);
router.get('/tickets/:ticketId', getTicketById);
router.post('/tickets/:ticketId/messages', sendMessage);
router.patch('/tickets/:ticketId/close', closeTicket);

// Direct attachment upload trigger
router.post('/tickets/:ticketId/attachments', uploadGenericFile, handleMulterError, uploadSupportAttachment);

module.exports = router;
