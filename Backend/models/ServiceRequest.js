const mongoose = require('mongoose');

const counterSchema = new mongoose.Schema({
  _id: String,
  seq: { type: Number, default: 0 }
});
const Counter = mongoose.models.Counter || mongoose.model('Counter', counterSchema);

const serviceRequestSchema = new mongoose.Schema({
  requestCode: { type: String, unique: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  categoryCode: { type: String, required: true, uppercase: true, index: true },
  categoryName: { type: String, required: true },
  subCatCode: { type: String, required: true, uppercase: true, index: true },
  subCategoryName: { type: String, required: true },
  formData: { type: mongoose.Schema.Types.Mixed, default: {} },
  contact: {
    name: String,
    phone: String,
    email: String,
    city: String,
    address: String
  },
  status: {
    type: String,
    enum: ['Pending', 'Assigned', 'In Progress', 'Completed', 'Cancelled'],
    default: 'Pending',
    index: true
  },
  payment: {
    amount: { type: Number, default: 0 },
    currency: { type: String, default: 'INR' },
    status: {
      type: String,
      enum: ['not_required', 'pending', 'paid', 'failed', 'skipped'],
      default: 'pending',
      index: true
    },
    razorpayOrderId: { type: String, default: null, index: true },
    // Every order ever created for this request (a retry creates a new one), so a
    // late payment / webhook against an older order can still be matched.
    razorpayOrderIds: { type: [String], default: [], index: true },
    razorpayPaymentId: { type: String, default: null },
    razorpayRefundId: { type: String, default: null },
    paidAt: { type: Date, default: null },
    escrowStatus: {
      type: String,
      enum: ['none', 'held', 'refunding', 'released', 'refunded'],
      default: 'none'
    },
    vendorEscrowReleasedAt: { type: Date, default: null },
    marketplaceQueued: { type: Boolean, default: false },
    settlement: {
      customerPaid: { type: Number, default: 0 },
      engineerTotal: { type: Number, default: 0 },
      platformFee: { type: Number, default: 0 },
      gst: { type: Number, default: 0 },
      vendorShare: { type: Number, default: 0 },
      settledAt: { type: Date, default: null }
    }
  },
  opportunityId: { type: mongoose.Schema.Types.ObjectId, ref: 'Opportunity', default: null },
  assignedVendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', default: null }
}, { timestamps: true });

serviceRequestSchema.pre('save', async function (next) {
  if (!this.requestCode) {
    try {
      const year = new Date().getFullYear();
      const counter = await Counter.findByIdAndUpdate(
        `service_request_${year}`,
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
      );
      this.requestCode = `SR-${year}-${String(counter.seq).padStart(5, '0')}`;
    } catch (err) {
      console.error('serviceRequestCode error:', err.message);
    }
  }
  next();
});

module.exports = mongoose.model('ServiceRequest', serviceRequestSchema);
