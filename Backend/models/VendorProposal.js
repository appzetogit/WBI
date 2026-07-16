const mongoose = require('mongoose');

// Reuse Counter from Opportunity or define inline
const counterSchema = new mongoose.Schema({
  _id: String,
  seq: { type: Number, default: 0 }
});
const Counter = mongoose.models.Counter || mongoose.model('Counter', counterSchema);

const lineItemSchema = new mongoose.Schema({
  description: { type: String, required: true },
  quantity: { type: Number, default: 1 },
  unitPrice: { type: Number, default: 0 },
  unit: { type: String, default: 'item' },
  total: { type: Number, default: 0 }
}, { _id: true });

const phaseSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: String,
  duration: { type: Number, default: 7 }, // days
  deliverables: [String]
}, { _id: true });

const vendorProposalSchema = new mongoose.Schema({
  proposalCode: {
    type: String,
    unique: true,
    index: true
  },
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    required: true,
    index: true
  },
  opportunityId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Opportunity',
    required: false, // Can be standalone
    default: null
  },

  title: { type: String, required: true, trim: true },
  coverLetter: { type: String, default: '' },

  // Pricing
  pricing: {
    lineItems: [lineItemSchema],
    subtotal: { type: Number, default: 0 },
    gstPercentage: { type: Number, default: 18 },
    gstAmount: { type: Number, default: 0 },
    totalAmount: { type: Number, default: 0 },
    validUntil: { type: Date, default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) } // 30 days
  },

  // Timeline
  timeline: {
    totalDays: { type: Number, default: 30 },
    startDate: Date,
    phases: [phaseSchema]
  },

  // Team
  teamStructure: [{
    role: String,
    count: { type: Number, default: 1 },
    experience: String
  }],

  // Attachments (Cloudinary URLs)
  attachments: [{
    name: String,
    url: String,
    type: { type: String, enum: ['document', 'image', 'presentation', 'other'], default: 'document' }
  }],

  // Status lifecycle
  status: {
    type: String,
    enum: ['draft', 'sent', 'viewed', 'accepted', 'rejected', 'negotiating'],
    default: 'draft',
    index: true
  },

  // When was it sent
  sentAt: { type: Date, default: null },
  viewedAt: { type: Date, default: null },

  // Client response
  clientResponse: {
    date: Date,
    message: String,
    counterOffer: Number
  },

  // Linked bid ID (if created from a bid)
  linkedBidId: { type: mongoose.Schema.Types.ObjectId, default: null }

}, { timestamps: true });

// Auto-generate proposalCode before saving
vendorProposalSchema.pre('save', async function (next) {
  if (!this.proposalCode) {
    try {
      const year = new Date().getFullYear();
      const counterId = `proposal_${year}`;
      const counter = await Counter.findByIdAndUpdate(
        counterId,
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
      );
      this.proposalCode = `PROP-${year}-${String(counter.seq).padStart(4, '0')}`;
    } catch (err) {
      console.error('Error generating proposalCode:', err);
    }
  }
  next();
});

vendorProposalSchema.index({ vendorId: 1, status: 1, createdAt: -1 });
vendorProposalSchema.index({ opportunityId: 1, vendorId: 1 });

module.exports = mongoose.model('VendorProposal', vendorProposalSchema);
