const mongoose = require('mongoose');

const vendorClientSchema = new mongoose.Schema({
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    required: true,
    index: true
  },
  type: {
    type: String,
    enum: ['individual', 'b2b'],
    required: true,
    index: true
  },
  name: { type: String, required: true, trim: true },
  company: { type: String, trim: true, default: '' },
  email: { type: String, trim: true, lowercase: true, default: '' },
  phone: { type: String, trim: true, default: '' },
  city: { type: String, trim: true, default: '' },
  state: { type: String, trim: true, default: '' },
  gstNumber: { type: String, trim: true, uppercase: true, default: '' },
  industry: { type: String, trim: true, default: '' },
  companySize: { type: String, default: '' },
  serviceCategoryCodes: [{ type: String, index: true }],
  serviceCategoryNames: [String],
  status: {
    type: String,
    enum: ['active', 'inactive', 'prospect'],
    default: 'active',
    index: true
  },
  rating: { type: Number, default: 0, min: 0, max: 5 },
  totalSpend: { type: Number, default: 0 },
  pendingPayments: { type: Number, default: 0 },
  activeProjects: { type: Number, default: 0 },
  totalSites: { type: Number, default: 1 },
  cities: [String],
  lastActivityAt: { type: Date, default: Date.now },
  assignedTeam: [{
    name: String,
    role: String,
    engineerId: { type: mongoose.Schema.Types.ObjectId, default: null }
  }],
  slaTier: {
    type: String,
    enum: ['standard', 'premium', 'enterprise'],
    default: 'standard'
  },
  priority: {
    type: String,
    enum: ['normal', 'high', 'urgent'],
    default: 'normal'
  },
  tags: [String],
  notes: { type: String, default: '' },
  demoTag: { type: String, default: null, index: true }
}, { timestamps: true });

vendorClientSchema.index({ vendorId: 1, type: 1, status: 1 });
vendorClientSchema.index({ vendorId: 1, serviceCategoryCodes: 1 });
vendorClientSchema.index({ vendorId: 1, name: 'text', company: 'text', city: 'text' });

module.exports = mongoose.model('VendorClient', vendorClientSchema);
