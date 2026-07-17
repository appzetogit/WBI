const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  sender: {
    type: String,
    enum: ['vendor', 'client', 'system'],
    required: true
  },
  text: { type: String, default: '' },
  attachments: [{
    name: String,
    url: String,
    type: { type: String, enum: ['document', 'image', 'pdf', 'other'], default: 'document' }
  }],
  internal: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
}, { _id: true });

const clientConversationSchema = new mongoose.Schema({
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    required: true,
    index: true
  },
  clientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'VendorClient',
    required: true,
    index: true
  },
  channel: {
    type: String,
    enum: ['all', 'project', 'contract', 'payment', 'support'],
    default: 'all',
    index: true
  },
  subject: { type: String, required: true, trim: true },
  unreadCount: { type: Number, default: 0 },
  pinned: { type: Boolean, default: false },
  starred: { type: Boolean, default: false },
  lastMessageAt: { type: Date, default: Date.now, index: true },
  messages: [messageSchema],
  demoTag: { type: String, default: null, index: true }
}, { timestamps: true });

clientConversationSchema.index({ vendorId: 1, lastMessageAt: -1 });
clientConversationSchema.index({ vendorId: 1, unreadCount: 1 });

module.exports = mongoose.model('ClientConversation', clientConversationSchema);
