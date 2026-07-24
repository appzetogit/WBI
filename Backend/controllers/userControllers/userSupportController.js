const UserSupportTicket = require('../../models/UserSupportTicket');
const { validationResult } = require('express-validator');

function makeTicketNumber() {
  const n = Date.now().toString(36).toUpperCase();
  const r = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `USR-${n}-${r}`;
}

/**
 * POST /api/users/support/tickets
 */
exports.createTicket = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
    }

    const userId = req.user.id;
    const { name, email, subject, message, category, phone } = req.body;

    const ticket = await UserSupportTicket.create({
      userId,
      ticketNumber: makeTicketNumber(),
      name: name || req.user.name || 'User',
      email: email || req.user.email,
      phone: phone || req.user.phone || null,
      subject: String(subject).trim(),
      message: String(message).trim(),
      category: category || 'Other'
    });

    res.status(201).json({
      success: true,
      message: 'Support request submitted. We will get back to you soon.',
      data: {
        id: ticket._id,
        ticketNumber: ticket.ticketNumber,
        status: ticket.status
      }
    });
  } catch (err) {
    console.error('[userSupport] createTicket:', err.message);
    res.status(500).json({ success: false, message: 'Failed to submit support request' });
  }
};

/**
 * GET /api/users/support/tickets
 */
exports.listTickets = async (req, res) => {
  try {
    const userId = req.user.id;
    const tickets = await UserSupportTicket.find({ userId })
      .sort({ createdAt: -1 })
      .limit(50)
      .select('ticketNumber subject status category createdAt')
      .lean();

    res.json({ success: true, data: tickets });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to load tickets' });
  }
};
