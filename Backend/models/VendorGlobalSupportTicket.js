const mongoose = require('mongoose');

const counterSchema = new mongoose.Schema({ _id: String, seq: { type: Number, default: 0 } });
const Counter = mongoose.models.Counter || mongoose.model('Counter', counterSchema);

const replySchema = new mongoose.Schema({
  author: String,
  role: String,
  message: String,
  internal: { type: Boolean, default: false },
  attachments: [{ name: String, url: String }],
  createdAt: { type: Date, default: Date.now }
}, { _id: false });

const vendorGlobalSupportTicketSchema = new mongoose.Schema({
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true, index: true },
  ticketCode: { type: String, unique: true, index: true },
  subject: { type: String, required: true },
  description: { type: String, default: '' },
  category: {
    type: String,
    enum: ['technical', 'payment', 'project', 'engineer', 'quality', 'inventory', 'billing', 'api', 'bug_report', 'feature_request', 'general'],
    default: 'general',
    index: true
  },
  priority: { type: String, enum: ['low', 'medium', 'high', 'urgent'], default: 'medium', index: true },
  status: { type: String, enum: ['open', 'assigned', 'investigation', 'resolved', 'closed'], default: 'open', index: true },
  assignedTeam: { type: String, default: 'Vendor Support' },
  serviceCategoryCode: { type: String, default: '', index: true },
  serviceCategoryName: { type: String, default: '' },
  attachmentsCount: { type: Number, default: 0 },
  averageResponseMinutes: { type: Number, default: 0 },
  replies: [replySchema],
  demoTag: { type: String, default: null, index: true }
}, { timestamps: true });

vendorGlobalSupportTicketSchema.pre('save', async function (next) {
  if (!this.ticketCode) {
    try {
      const year = new Date().getFullYear();
      const counter = await Counter.findByIdAndUpdate(`vendor_support_${year}`, { $inc: { seq: 1 } }, { new: true, upsert: true });
      this.ticketCode = `SUP-${year}-${String(counter.seq).padStart(5, '0')}`;
    } catch (error) {
      console.error('ticketCode error:', error);
    }
  }
  next();
});

vendorGlobalSupportTicketSchema.index({ vendorId: 1, status: 1, priority: 1 });

module.exports = mongoose.model('VendorGlobalSupportTicket', vendorGlobalSupportTicketSchema);
