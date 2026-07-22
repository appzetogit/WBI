const mongoose = require('mongoose');

const counterSchema = new mongoose.Schema({ _id: String, seq: { type: Number, default: 0 } });
const Counter = mongoose.models.Counter || mongoose.model('Counter', counterSchema);

const replySchema = new mongoose.Schema(
  {
    author: String,
    authorId: { type: mongoose.Schema.Types.ObjectId, default: null },
    role: String,
    message: String,
    internal: { type: Boolean, default: false },
    attachments: [{ name: String, url: String, mimeType: String, size: Number }],
    createdAt: { type: Date, default: Date.now }
  },
  { _id: true }
);

const timelineSchema = new mongoose.Schema(
  {
    event: { type: String, required: true },
    label: { type: String, default: '' },
    actorRole: { type: String, default: '' },
    actorName: { type: String, default: '' },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
    at: { type: Date, default: Date.now }
  },
  { _id: false }
);

const attachmentSchema = new mongoose.Schema(
  {
    name: String,
    url: { type: String, required: true },
    mimeType: String,
    size: Number,
    uploadedByRole: String,
    uploadedAt: { type: Date, default: Date.now }
  },
  { _id: true }
);

/**
 * Vendor support tickets — enums intentionally NOT hardcoded.
 * Status/priority/category codes are validated against SupportModuleConfig at runtime.
 */
const vendorGlobalSupportTicketSchema = new mongoose.Schema(
  {
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true, index: true },
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'B2BCompany', default: null, index: true },
    ticketCode: { type: String, unique: true, sparse: true, index: true },
    subject: { type: String, required: true, trim: true },
    description: { type: String, default: '' },

    category: { type: String, required: true, index: true },
    priority: { type: String, required: true, index: true },
    status: { type: String, required: true, index: true },
    tags: { type: [String], default: [], index: true },

    serviceCategoryCode: { type: String, default: '', index: true },
    serviceCategoryName: { type: String, default: '' },
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', default: null, index: true },
    clientId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
    engineerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Engineer', default: null, index: true },
    workerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Worker', default: null, index: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, default: null },
    bookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', default: null },

    assignedTeam: { type: String, default: '' },
    assignedDepartmentCode: { type: String, default: '', index: true },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null, index: true },
    assignedToName: { type: String, default: '' },

    customFields: { type: Map, of: mongoose.Schema.Types.Mixed, default: {} },
    attachments: { type: [attachmentSchema], default: [] },
    attachmentsCount: { type: Number, default: 0 },
    replies: { type: [replySchema], default: [] },
    timeline: { type: [timelineSchema], default: [] },

    escalationLevel: { type: Number, default: 0, index: true },
    slaFirstResponseDueAt: { type: Date, default: null, index: true },
    slaResolutionDueAt: { type: Date, default: null, index: true },
    firstRespondedAt: { type: Date, default: null },
    resolvedAt: { type: Date, default: null },
    closedAt: { type: Date, default: null },
    reopenedAt: { type: Date, default: null },
    vendorConfirmedAt: { type: Date, default: null },
    averageResponseMinutes: { type: Number, default: 0 },
    slaBreached: { type: Boolean, default: false, index: true },

    createdByRole: { type: String, default: 'vendor' },
    createdById: { type: mongoose.Schema.Types.ObjectId, default: null },
    createdByName: { type: String, default: '' },
    source: { type: String, default: 'vendor_portal' },
    demoTag: { type: String, default: null, index: true }
  },
  { timestamps: true }
);

vendorGlobalSupportTicketSchema.index({ vendorId: 1, status: 1, priority: 1, updatedAt: -1 });
vendorGlobalSupportTicketSchema.index({ vendorId: 1, serviceCategoryCode: 1, createdAt: -1 });
vendorGlobalSupportTicketSchema.index({ assignedTo: 1, status: 1 });
vendorGlobalSupportTicketSchema.index({ subject: 'text', description: 'text', ticketCode: 'text' });

vendorGlobalSupportTicketSchema.statics.nextTicketCode = async function nextTicketCode(fmt = {}, serviceCode = '') {
  const year = new Date().getFullYear();
  const prefix = fmt.prefix || 'SUP';
  const sep = fmt.separator || '-';
  const pad = Math.max(3, Number(fmt.padding) || 5);
  const parts = [prefix];
  if (fmt.includeYear !== false) parts.push(String(year));
  if (fmt.includeServiceCode && serviceCode) parts.push(String(serviceCode).slice(0, 8).toUpperCase());
  // Legacy tickets used counter `_id: vendor_support_<year>` (no prefix). Keep that key so new codes
  // continue after SUP-2026-00200 instead of restarting on vendor_support_SUP_<year>.
  const counterKey =
    fmt.includeServiceCode && serviceCode
      ? `vendor_support_${parts.join('_')}`
      : `vendor_support_${year}`;

  // If counter is missing or behind existing ticketCodes, bump it first.
  const codePrefix = `${parts.join(sep)}${sep}`;
  const latest = await this.findOne({ ticketCode: { $regex: `^${codePrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}` } })
    .sort({ ticketCode: -1 })
    .select('ticketCode')
    .lean();
  let minSeq = 0;
  if (latest?.ticketCode) {
    const n = parseInt(String(latest.ticketCode).split(sep).pop(), 10);
    if (!Number.isNaN(n)) minSeq = n;
  }
  if (minSeq > 0) {
    await Counter.findByIdAndUpdate(
      counterKey,
      { $max: { seq: minSeq } },
      { upsert: true, setDefaultsOnInsert: true }
    );
  }

  const counter = await Counter.findByIdAndUpdate(counterKey, { $inc: { seq: 1 } }, { new: true, upsert: true });
  parts.push(String(counter.seq).padStart(pad, '0'));
  return parts.join(sep);
};

module.exports = mongoose.model('VendorGlobalSupportTicket', vendorGlobalSupportTicketSchema);
