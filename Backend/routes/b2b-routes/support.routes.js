const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/authMiddleware');
const { isApprovedB2B, checkB2BPermission } = require('../../middleware/roleMiddleware');
const { uploadGenericFile, handleMulterError } = require('../../middleware/uploadMiddleware');
const {
  getSupportSummary,
  getTickets,
  createTicket,
  getTicketById,
  sendMessage,
  closeTicket,
  uploadSupportAttachment,
  handleChatbotMessage
} = require('../../controllers/b2bControllers/b2bSupportController');

// All endpoints are JWT authenticated and B2B approved status protected
router.use(authenticate, isApprovedB2B);

router.get('/summary', checkB2BPermission('support.manage'), getSupportSummary);
router.get('/tickets', checkB2BPermission('support.manage'), getTickets);
router.post('/tickets', checkB2BPermission('support.manage'), createTicket);
router.get('/tickets/:ticketId', checkB2BPermission('support.manage'), getTicketById);
router.post('/tickets/:ticketId/messages', checkB2BPermission('support.manage'), sendMessage);
router.patch('/tickets/:ticketId/close', checkB2BPermission('support.manage'), closeTicket);

// Direct attachment upload trigger
router.post('/tickets/:ticketId/attachments', checkB2BPermission('support.manage'), uploadGenericFile, handleMulterError, uploadSupportAttachment);

// Chatbot
router.post('/chatbot', checkB2BPermission('support.manage'), handleChatbotMessage);

module.exports = router;
