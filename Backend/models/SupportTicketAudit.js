const mongoose = require('mongoose');

const supportTicketAuditSchema = new mongoose.Schema(
  {
    ticketId: { type: mongoose.Schema.Types.ObjectId, ref: 'VendorGlobalSupportTicket', required: true, index: true },
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', index: true },
    action: { type: String, required: true, index: true },
    fromStatus: { type: String, default: '' },
    toStatus: { type: String, default: '' },
    actorRole: { type: String, default: '' },
    actorId: { type: mongoose.Schema.Types.ObjectId, default: null },
    actorName: { type: String, default: '' },
    message: { type: String, default: '' },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
    ipAddress: { type: String, default: '' },
    userAgent: { type: String, default: '' }
  },
  { timestamps: true }
);

supportTicketAuditSchema.index({ ticketId: 1, createdAt: -1 });
supportTicketAuditSchema.index({ vendorId: 1, createdAt: -1 });

module.exports = mongoose.model('SupportTicketAudit', supportTicketAuditSchema);
