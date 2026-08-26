const mongoose = require('mongoose');
const SupportTicket = require('../../models/SupportTicket');
const SupportMessage = require('../../models/SupportMessage');
const SupportAttachment = require('../../models/SupportAttachment');
const Admin = require('../../models/Admin');

/**
 * Socket.IO event broadcaster
 */
const emitSocketEvent = (room, event, data) => {
  try {
    const { getIO } = require('../../sockets/index');
    const io = getIO();
    if (io) {
      io.to(room).emit(event, data);
    }
  } catch (err) {
    console.warn(`[Socket.io Support Admin] Emit warning for ${event}:`, err.message);
  }
};

/**
 * GET /api/admin/support/tickets
 * Admin views all corporate tickets with filtering
 */
const getTicketsAdmin = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status = '',
      category = '',
      priority = '',
      companyId = '',
      search = ''
    } = req.query;

    const query = {};

    if (status) query.status = status;
    if (category) query.category = category;
    if (priority) query.priority = priority;

    if (companyId && mongoose.Types.ObjectId.isValid(companyId)) {
      query.companyId = new mongoose.Types.ObjectId(companyId);
    }

    if (search.trim()) {
      query.$or = [
        { ticketNumber: { $regex: search.trim(), $options: 'i' } },
        { subject: { $regex: search.trim(), $options: 'i' } }
      ];
    }

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skipNum = (pageNum - 1) * limitNum;

    const tickets = await SupportTicket.find(query)
      .populate('companyId', 'companyName email phone')
      .populate('assignedTo', 'name email')
      .sort({ lastMessageAt: -1 })
      .skip(skipNum)
      .limit(limitNum)
      .lean();

    const total = await SupportTicket.countDocuments(query);

    return res.status(200).json({
      success: true,
      data: tickets,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    console.error('[Admin Support Controller] List error:', error);
    return res.status(500).json({ success: false, message: 'Failed to retrieve support tickets' });
  }
};

/**
 * GET /api/admin/support/tickets/:ticketId
 * Fetch ticket details (admin bypass and full internal logs access)
 */
const getTicketByIdAdmin = async (req, res) => {
  try {
    const { ticketId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(ticketId)) {
      return res.status(400).json({ success: false, message: 'Invalid ticket ID format' });
    }

    const ticket = await SupportTicket.findById(ticketId)
      .populate('companyId', 'companyName email phone')
      .populate('assignedTo', 'name email')
      .lean();

    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Support ticket not found' });
    }

    // Admins can see ALL messages including internal notes
    const messages = await SupportMessage.find({ ticketId }).sort({ createdAt: 1 }).lean();

    return res.status(200).json({
      success: true,
      data: {
        ...ticket,
        conversation: messages
      }
    });
  } catch (error) {
    console.error('[Admin Support Controller] Fetch details error:', error);
    return res.status(500).json({ success: false, message: 'Failed to retrieve ticket details' });
  }
};

/**
 * PATCH /api/admin/support/tickets/:ticketId/status
 * Admin updates ticket status (Open -> In Progress -> Resolved -> Closed)
 */
const updateTicketStatusAdmin = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { status } = req.body;

    if (!status || !['Open', 'In Progress', 'Resolved', 'Closed'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Valid status parameter is required' });
    }

    if (!mongoose.Types.ObjectId.isValid(ticketId)) {
      return res.status(400).json({ success: false, message: 'Invalid ticket ID format' });
    }

    const ticket = await SupportTicket.findById(ticketId);
    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Support ticket not found' });
    }

    ticket.status = status;
    if (status === 'Resolved') {
      ticket.resolvedAt = new Date();
    } else if (status === 'Closed') {
      ticket.closedAt = new Date();
    }

    ticket.lastMessageAt = new Date();
    await ticket.save();

    // Broadcast updates
    emitSocketEvent(`b2b:${ticket.companyId}`, 'support:statusChanged', ticket);
    emitSocketEvent('support', 'support:statusChanged', ticket);
    emitSocketEvent('admin', 'support:statusChanged', ticket);

    return res.status(200).json({
      success: true,
      message: `Ticket status successfully changed to ${status}`,
      data: ticket
    });
  } catch (error) {
    console.error('[Admin Support Controller] Update status error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update ticket status' });
  }
};

/**
 * PATCH /api/admin/support/tickets/:ticketId/assign
 * Admin assigns support ticket to a specific support agent
 */
const assignTicketAdmin = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { assignedTo } = req.body; // Admin user ID

    if (!mongoose.Types.ObjectId.isValid(ticketId)) {
      return res.status(400).json({ success: false, message: 'Invalid ticket ID format' });
    }

    const ticket = await SupportTicket.findById(ticketId);
    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Support ticket not found' });
    }

    if (assignedTo) {
      if (!mongoose.Types.ObjectId.isValid(assignedTo)) {
        return res.status(400).json({ success: false, message: 'Invalid assignedTo admin ID format' });
      }
      const adminAgent = await Admin.findById(assignedTo);
      if (!adminAgent) {
        return res.status(404).json({ success: false, message: 'Support agent not found' });
      }
      ticket.assignedTo = adminAgent._id;
    } else {
      ticket.assignedTo = null;
    }

    // Automatically transition to 'In Progress' on assignment
    if (ticket.status === 'Open') {
      ticket.status = 'In Progress';
    }

    ticket.lastMessageAt = new Date();
    await ticket.save();

    emitSocketEvent(`b2b:${ticket.companyId}`, 'support:ticketUpdated', ticket);
    emitSocketEvent('support', 'support:ticketUpdated', ticket);
    emitSocketEvent('admin', 'support:ticketUpdated', ticket);

    return res.status(200).json({
      success: true,
      message: 'Support ticket successfully assigned',
      data: ticket
    });
  } catch (error) {
    console.error('[Admin Support Controller] Assign error:', error);
    return res.status(500).json({ success: false, message: 'Failed to assign ticket' });
  }
};

/**
 * POST /api/admin/support/tickets/:ticketId/messages
 * Admin/Support team replies to conversation
 */
const sendMessageAdmin = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { message, attachments = [], isInternalNote = false } = req.body;

    if (!message && attachments.length === 0) {
      return res.status(400).json({ success: false, message: 'Cannot send an empty message' });
    }

    if (!mongoose.Types.ObjectId.isValid(ticketId)) {
      return res.status(400).json({ success: false, message: 'Invalid ticket ID format' });
    }

    const ticket = await SupportTicket.findById(ticketId);
    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Support ticket not found' });
    }

    // Admin info
    const adminUser = await Admin.findById(req.user.id);
    const adminName = adminUser ? adminUser.name : 'Support Agent';

    const newMessage = await SupportMessage.create({
      ticketId: ticket._id,
      senderId: req.user.id,
      senderRole: 'admin',
      senderName: adminName,
      message: message || '',
      attachments,
      isInternalNote
    });

    if (attachments.length > 0) {
      const attachmentRecords = attachments.map(att => ({
        ticketId: ticket._id,
        messageId: newMessage._id,
        fileUrl: att.fileUrl,
        fileName: att.fileName,
        fileType: att.fileType,
        fileSize: att.fileSize,
        uploadedBy: req.user.id
      }));
      await SupportAttachment.insertMany(attachmentRecords);
    }

    // Auto-update status to In Progress when admin replies to an Open ticket (only for customer-facing messages!)
    if (!isInternalNote && ticket.status === 'Open') {
      ticket.status = 'In Progress';
    }

    ticket.lastMessageAt = new Date();
    await ticket.save();

    // Broadcast messages (Internal notes only go to support room!)
    if (isInternalNote) {
      emitSocketEvent('support', 'support:newMessage', newMessage);
      emitSocketEvent('admin', 'support:newMessage', newMessage);
    } else {
      emitSocketEvent(`b2b:${ticket.companyId}`, 'support:newMessage', newMessage);
      emitSocketEvent('support', 'support:newMessage', newMessage);
      emitSocketEvent('admin', 'support:newMessage', newMessage);
    }

    return res.status(201).json({
      success: true,
      data: newMessage
    });
  } catch (error) {
    console.error('[Admin Support Controller] Reply error:', error);
    return res.status(500).json({ success: false, message: 'Failed to post reply' });
  }
};

module.exports = {
  getTicketsAdmin,
  getTicketByIdAdmin,
  updateTicketStatusAdmin,
  assignTicketAdmin,
  sendMessageAdmin
};
