const mongoose = require('mongoose');

/**
 * Admin override for a catalog event (services/notification/eventCatalog.js):
 * switch it off, change channels, or replace the title/message text.
 * Text may use {{variable}} placeholders filled from the event data.
 */
const notificationTemplateSchema = new mongoose.Schema({
  eventKey: { type: String, required: true, unique: true, trim: true },
  enabled: { type: Boolean, default: true },
  channels: [{ type: String, enum: ['in_app', 'push', 'email', 'sms', 'whatsapp'] }],
  title: { type: String, trim: true, maxlength: 200 },
  message: { type: String, trim: true, maxlength: 1000 },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null }
}, { timestamps: true });

module.exports = mongoose.model('NotificationTemplate', notificationTemplateSchema);
