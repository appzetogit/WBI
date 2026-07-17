const mongoose = require('mongoose');

const vendorGlobalNotificationSchema = new mongoose.Schema({
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true, index: true },
  title: { type: String, required: true },
  message: { type: String, default: '' },
  type: {
    type: String,
    enum: [
      'new_opportunity', 'project_assigned', 'engineer_assigned', 'payment_received',
      'invoice_generated', 'bid_accepted', 'bid_rejected', 'document_expiry',
      'compliance_alert', 'new_chat', 'approval_pending', 'client_feedback',
      'quality_failed', 'rework', 'withdrawal_approved', 'system_announcement'
    ],
    required: true,
    index: true
  },
  module: { type: String, default: 'system', index: true },
  priority: { type: String, enum: ['low', 'normal', 'high', 'urgent'], default: 'normal', index: true },
  channels: [{ type: String, enum: ['in_app', 'email', 'sms', 'push', 'whatsapp'] }],
  read: { type: Boolean, default: false, index: true },
  archived: { type: Boolean, default: false, index: true },
  actionUrl: { type: String, default: '' },
  serviceCategoryCode: { type: String, default: '', index: true },
  serviceCategoryName: { type: String, default: '' },
  demoTag: { type: String, default: null, index: true }
}, { timestamps: true });

vendorGlobalNotificationSchema.index({ vendorId: 1, read: 1, createdAt: -1 });

module.exports = mongoose.model('VendorGlobalNotification', vendorGlobalNotificationSchema);
