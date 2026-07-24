const mongoose = require('mongoose');

/**
 * Consumer (User App) support tickets — separate from B2B SupportTicket.
 */
const userSupportTicketSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    ticketNumber: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    phone: { type: String, default: null, trim: true },
    subject: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    category: {
      type: String,
      enum: ['Booking', 'Payment', 'Account', 'Technical', 'Other'],
      default: 'Other',
      index: true
    },
    status: {
      type: String,
      enum: ['open', 'in_progress', 'resolved', 'closed'],
      default: 'open',
      index: true
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      default: null
    }
  },
  { timestamps: true }
);

userSupportTicketSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('UserSupportTicket', userSupportTicketSchema);
