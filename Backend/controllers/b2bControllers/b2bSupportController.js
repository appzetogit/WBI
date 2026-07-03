const mongoose = require('mongoose');
const SupportTicket = require('../../models/SupportTicket');
const SupportMessage = require('../../models/SupportMessage');
const SupportAttachment = require('../../models/SupportAttachment');
const B2BCompany = require('../../models/B2BCompany');
const B2BJob = require('../../models/B2BJob');
const B2BInvoice = require('../../models/B2BInvoice');
const Payment = require('../../models/Payment');
const AuditLog = require('../../models/AuditLog');

/**
 * Socket.IO events broadcast helper
 */
const emitSocketEvent = (room, event, data) => {
  try {
    const { getIO } = require('../../sockets/index');
    const io = getIO();
    if (io) {
      io.to(room).emit(event, data);
      console.log(`[Socket.io Support] Emitted ${event} to room ${room}`);
    }
  } catch (err) {
    console.warn(`[Socket.io Support] Emit warning for ${event}:`, err.message);
  }
};

/**
 * Log support actions for auditing
 */
const writeAuditLog = async (companyId, action, ticketId, details) => {
  try {
    if (mongoose.modelNames().includes('AuditLog')) {
      await AuditLog.create({
        user: companyId,
        action,
        target: 'SupportTicket',
        targetId: ticketId,
        details: JSON.stringify(details),
        timestamp: new Date()
      });
    } else {
      console.log(`[B2B Support Audit] ${action} on ticket ${ticketId} by company ${companyId}`);
    }
  } catch (err) {
    console.warn('[B2B Support Audit] Logging failed:', err.message);
  }
};

/**
 * Helper to generate the next unique Sup ticket number: SUP-YYYY-00001
 */
const getNextTicketNumber = async (year) => {
  const lastTicket = await SupportTicket.findOne({
    ticketNumber: new RegExp(`^SUP-${year}-`),
  }).sort({ createdAt: -1 });

  let sequence = 1;
  if (lastTicket && lastTicket.ticketNumber) {
    const parts = lastTicket.ticketNumber.split('-');
    if (parts.length === 3) {
      const lastSeq = parseInt(parts[2], 10);
      if (!isNaN(lastSeq)) {
        sequence = lastSeq + 1;
      }
    }
  }

  const paddedSeq = String(sequence).padStart(5, '0');
  return `SUP-${year}-${paddedSeq}`;
};

/**
 * GET /api/b2b/support/summary
 * Ticket summary cards counts
 */
const getSupportSummary = async (req, res) => {
  try {
    const companyId = new mongoose.Types.ObjectId(req.user.id);

    const stats = await SupportTicket.aggregate([
      { $match: { companyId } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    const summary = {
      total: 0,
      open: 0,
      in_progress: 0,
      resolved: 0,
      closed: 0
    };

    stats.forEach(item => {
      const status = (item._id || '').toLowerCase();
      const count = item.count || 0;

      summary.total += count;

      if (status === 'open') {
        summary.open = count;
      } else if (status === 'in progress') {
        summary.in_progress = count;
      } else if (status === 'resolved') {
        summary.resolved = count;
      } else if (status === 'closed') {
        summary.closed = count;
      }
    });

    return res.status(200).json({
      success: true,
      data: summary
    });
  } catch (error) {
    console.error('[B2B Support Controller] Summary error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch support summary' });
  }
};

/**
 * GET /api/b2b/support/tickets
 * Paginated tickets list table payload
 */
const getTickets = async (req, res) => {
  try {
    const companyId = req.user.id;
    const {
      page = 1,
      limit = 10,
      status = '',
      category = '',
      priority = '',
      startDate = '',
      endDate = '',
      search = ''
    } = req.query;

    const query = { companyId: new mongoose.Types.ObjectId(companyId) };

    // Set filters
    if (status) query.status = status;
    if (category) query.category = category;
    if (priority) query.priority = priority;

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.createdAt.$lte = end;
      }
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

    // Retrieve list fields only for optimal database memory usage
    const tickets = await SupportTicket.find(query)
      .select('ticketNumber subject category status priority createdAt lastMessageAt resolvedAt')
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
    console.error('[B2B Support Controller] List error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch tickets list' });
  }
};

/**
 * POST /api/b2b/support/tickets
 * Create support ticket
 */
const createTicket = async (req, res) => {
  try {
    const companyId = req.user.id;
    const {
      subject,
      description,
      category,
      priority = 'Medium',
      relatedJobId,
      relatedInvoiceId,
      relatedPaymentId,
      relatedBatchId,
      attachments = []
    } = req.body;

    if (!subject || !description || !category) {
      return res.status(400).json({
        success: false,
        message: 'Subject, description, and category are required'
      });
    }

    const company = await B2BCompany.findById(companyId);
    if (!company) {
      return res.status(404).json({ success: false, message: 'Company profile not found' });
    }

    const year = new Date().getFullYear();
    const ticketNumber = await getNextTicketNumber(year);

    // Validate relationships if specified
    if (relatedJobId && !mongoose.Types.ObjectId.isValid(relatedJobId)) {
      return res.status(400).json({ success: false, message: 'Invalid Job ID' });
    }
    if (relatedInvoiceId && !mongoose.Types.ObjectId.isValid(relatedInvoiceId)) {
      return res.status(400).json({ success: false, message: 'Invalid Invoice ID' });
    }
    if (relatedPaymentId && !mongoose.Types.ObjectId.isValid(relatedPaymentId)) {
      return res.status(400).json({ success: false, message: 'Invalid Payment ID' });
    }
    if (relatedBatchId && !mongoose.Types.ObjectId.isValid(relatedBatchId)) {
      return res.status(400).json({ success: false, message: 'Invalid Batch ID' });
    }

    const ticket = await SupportTicket.create({
      companyId: company._id,
      ticketNumber,
      subject,
      description,
      category,
      priority,
      status: 'Open',
      relatedJobId: relatedJobId || null,
      relatedInvoiceId: relatedInvoiceId || null,
      relatedPaymentId: relatedPaymentId || null,
      relatedBatchId: relatedBatchId || null,
      createdBy: company.authorizedPerson?.name || company.companyName,
      contactEmail: company.email,
      contactNumber: company.phone,
      attachments,
      lastMessageAt: new Date()
    });

    // Seed initial support message mapping the ticket description
    const firstMsg = await SupportMessage.create({
      ticketId: ticket._id,
      senderId: company._id,
      senderRole: 'b2b',
      senderName: company.companyName,
      message: description,
      attachments
    });

    // Populate attachments ledger Audit logs
    if (attachments.length > 0) {
      const attachmentRecords = attachments.map(att => ({
        ticketId: ticket._id,
        messageId: firstMsg._id,
        fileUrl: att.fileUrl,
        fileName: att.fileName,
        fileType: att.fileType,
        fileSize: att.fileSize,
        uploadedBy: company._id
      }));
      await SupportAttachment.insertMany(attachmentRecords);
    }

    await writeAuditLog(company._id, 'CREATE_TICKET', ticket._id, { ticketNumber });

    // Emit Real-time Socket notifications
    emitSocketEvent(`b2b:${companyId}`, 'support:ticketCreated', ticket);
    emitSocketEvent('support', 'admin:supportTicketCreated', ticket);
    emitSocketEvent('admin', 'admin:supportTicketCreated', ticket);

    return res.status(201).json({
      success: true,
      message: 'Support ticket raised successfully',
      data: ticket
    });
  } catch (error) {
    console.error('[B2B Support Controller] Create error:', error);
    return res.status(500).json({ success: false, message: 'Failed to create support ticket' });
  }
};

/**
 * GET /api/b2b/support/tickets/:ticketId
 * Fetch ticket details and full conversation history
 */
const getTicketById = async (req, res) => {
  try {
    const { ticketId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(ticketId)) {
      return res.status(400).json({ success: false, message: 'Invalid ticket ID format' });
    }

    const ticket = await SupportTicket.findById(ticketId)
      .populate('relatedJobId', 'jobId service status')
      .populate('relatedInvoiceId', 'invoiceNumber totalAmount status')
      .populate('relatedPaymentId', 'transactionId amount status')
      .lean();

    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    // Ownership check
    if (ticket.companyId.toString() !== req.user.id.toString()) {
      return res.status(403).json({ success: false, message: 'Access denied. Ownership mismatch.' });
    }

    // Retrieve conversation thread (excluding admin internal notes!)
    const messages = await SupportMessage.find({ 
      ticketId, 
      isInternalNote: false 
    }).sort({ createdAt: 1 }).lean();

    return res.status(200).json({
      success: true,
      data: {
        ...ticket,
        conversation: messages
      }
    });
  } catch (error) {
    console.error('[B2B Support Controller] Fetch details error:', error);
    return res.status(500).json({ success: false, message: 'Failed to retrieve ticket details' });
  }
};

/**
 * POST /api/b2b/support/tickets/:ticketId/messages
 * B2B Company replies to conversation
 */
const sendMessage = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { message, attachments = [] } = req.body;

    if (!message && attachments.length === 0) {
      return res.status(400).json({ success: false, message: 'Cannot send an empty message' });
    }

    if (!mongoose.Types.ObjectId.isValid(ticketId)) {
      return res.status(400).json({ success: false, message: 'Invalid ticket ID format' });
    }

    const ticket = await SupportTicket.findById(ticketId);
    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    // Ownership validation
    if (ticket.companyId.toString() !== req.user.id.toString()) {
      return res.status(403).json({ success: false, message: 'Access denied. Ownership mismatch.' });
    }

    const company = await B2BCompany.findById(req.user.id);

    // Save support message
    const newMessage = await SupportMessage.create({
      ticketId: ticket._id,
      senderId: company._id,
      senderRole: 'b2b',
      senderName: company.companyName,
      message: message || '',
      attachments
    });

    // Populate attachments ledger logs
    if (attachments.length > 0) {
      const attachmentRecords = attachments.map(att => ({
        ticketId: ticket._id,
        messageId: newMessage._id,
        fileUrl: att.fileUrl,
        fileName: att.fileName,
        fileType: att.fileType,
        fileSize: att.fileSize,
        uploadedBy: company._id
      }));
      await SupportAttachment.insertMany(attachmentRecords);
    }

    // Update ticket activity time
    ticket.lastMessageAt = new Date();
    await ticket.save();

    await writeAuditLog(company._id, 'SEND_MESSAGE', ticket._id, { messageLength: message?.length });

    // Emit Real-time chat Socket updates
    emitSocketEvent(`b2b:${ticket.companyId}`, 'support:newMessage', newMessage);
    emitSocketEvent('support', 'support:newMessage', newMessage);
    emitSocketEvent('admin', 'support:newMessage', newMessage);

    return res.status(201).json({
      success: true,
      data: newMessage
    });
  } catch (error) {
    console.error('[B2B Support Controller] Send message error:', error);
    return res.status(500).json({ success: false, message: 'Failed to send support message' });
  }
};

/**
 * PATCH /api/b2b/support/tickets/:ticketId/close
 * B2B Company closes the support ticket
 */
const closeTicket = async (req, res) => {
  try {
    const { ticketId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(ticketId)) {
      return res.status(400).json({ success: false, message: 'Invalid ticket ID format' });
    }

    const ticket = await SupportTicket.findById(ticketId);
    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    // Ownership validation
    if (ticket.companyId.toString() !== req.user.id.toString()) {
      return res.status(403).json({ success: false, message: 'Access denied. Ownership mismatch.' });
    }

    ticket.status = 'Closed';
    ticket.closedAt = new Date();
    ticket.lastMessageAt = new Date();
    await ticket.save();

    await writeAuditLog(req.user.id, 'CLOSE_TICKET', ticket._id, { ticketNumber: ticket.ticketNumber });

    // Emit status changed notifications
    emitSocketEvent(`b2b:${ticket.companyId}`, 'support:statusChanged', ticket);
    emitSocketEvent('support', 'support:statusChanged', ticket);
    emitSocketEvent('admin', 'support:statusChanged', ticket);

    return res.status(200).json({
      success: true,
      message: 'Support ticket closed successfully',
      data: ticket
    });
  } catch (error) {
    console.error('[B2B Support Controller] Close ticket error:', error);
    return res.status(500).json({ success: false, message: 'Failed to close ticket' });
  }
};

/**
 * POST /api/b2b/support/tickets/:ticketId/attachments
 * B2B uploads dynamic chat files on-the-fly via Form-data
 */
const uploadSupportAttachment = async (req, res) => {
  try {
    const { ticketId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(ticketId)) {
      return res.status(400).json({ success: false, message: 'Invalid ticket ID format' });
    }

    const ticket = await SupportTicket.findById(ticketId);
    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    if (ticket.companyId.toString() !== req.user.id.toString()) {
      return res.status(403).json({ success: false, message: 'Access denied. Ownership mismatch.' });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No attachment file provided' });
    }

    // Enforce 10MB limits
    if (req.file.size > 10 * 1024 * 1024) {
      return res.status(400).json({ success: false, message: 'File size exceeds maximum 10MB limit' });
    }

    const attachmentObj = {
      fileUrl: req.file.path,
      fileName: req.file.originalname || 'attachment',
      fileType: req.file.mimetype,
      fileSize: req.file.size
    };

    // Save attachment record
    await SupportAttachment.create({
      ticketId: ticket._id,
      fileUrl: attachmentObj.fileUrl,
      fileName: attachmentObj.fileName,
      fileType: attachmentObj.fileType,
      fileSize: attachmentObj.fileSize,
      uploadedBy: ticket.companyId
    });

    // Append to ticket's global file lists
    ticket.attachments.push(attachmentObj);
    ticket.lastMessageAt = new Date();
    await ticket.save();

    return res.status(200).json({
      success: true,
      message: 'Attachment uploaded successfully',
      data: attachmentObj
    });
  } catch (error) {
    console.error('[B2B Support Controller] Attachment upload error:', error);
    return res.status(500).json({ success: false, message: 'Failed to upload attachment' });
  }
};

module.exports = {
  getSupportSummary,
  getTickets,
  createTicket,
  getTicketById,
  sendMessage,
  closeTicket,
  uploadSupportAttachment
};
