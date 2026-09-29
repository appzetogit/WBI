const mongoose = require('mongoose');

/** A complaint raised against a B2C booking or a B2B job, resolved by an admin. */
const timelineSchema = new mongoose.Schema({
  status: String,
  note: String,
  actorRole: String,
  actorId: mongoose.Schema.Types.ObjectId,
  at: { type: Date, default: Date.now }
}, { _id: false });

const disputeSchema = new mongoose.Schema({
  disputeNumber: { type: String, unique: true },
  sourceType: { type: String, enum: ['booking', 'b2b_job'], required: true, index: true },
  sourceId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  sourceRef: String, // booking number / job id for display
  raisedByRole: { type: String, enum: ['user', 'b2b', 'vendor', 'engineer', 'worker', 'admin'], required: true },
  raisedById: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  companyId: { type: mongoose.Schema.Types.ObjectId, default: null },
  category: {
    type: String,
    enum: ['quality', 'incomplete_work', 'overcharged', 'no_show', 'damage', 'behaviour', 'payment', 'other'],
    default: 'other'
  },
  reason: { type: String, required: true, trim: true, maxlength: 200 },
  description: { type: String, trim: true, maxlength: 4000 },
  attachments: [String],
  amountInDispute: { type: Number, default: 0 },
  status: { type: String, enum: ['open', 'in_review', 'resolved', 'rejected'], default: 'open', index: true },
  resolution: { type: String, enum: [null, 'refund', 'partial_refund', 'rework', 'no_action'], default: null },
  resolutionNote: String,
  refundAmount: { type: Number, default: 0 },
  refundRef: String,
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  resolvedAt: Date,
  timeline: [timelineSchema]
}, { timestamps: true });

disputeSchema.index({ status: 1, createdAt: -1 });

disputeSchema.pre('save', function (next) {
  if (!this.disputeNumber) {
    this.disputeNumber = `DSP-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 900 + 100)}`;
  }
  next();
});

module.exports = mongoose.model('Dispute', disputeSchema);
