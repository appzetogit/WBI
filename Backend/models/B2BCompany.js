const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const branchSchema = new mongoose.Schema({
  branchName: { type: String, required: true, trim: true },
  branchAddress: { type: String, required: true, trim: true },
  city: { type: String, required: true, trim: true },
  state: { type: String, required: true, trim: true },
  pincode: { type: String, required: true, trim: true },
  contactPerson: { type: String, required: true, trim: true }
});

const authorizedPersonSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  designation: { type: String, required: true, trim: true },
  email: { type: String, required: true, lowercase: true, trim: true },
  phone: { type: String, required: true, trim: true },
  altPhone: { type: String, default: null, trim: true }
});

const b2bCompanyDocumentSchema = new mongoose.Schema({
  documentType: {
    type: String,
    required: true,
    trim: true,
    lowercase: true
  },
  fileUrl: { type: String, required: true },
  fileKey: { type: String, default: null },
  status: { 
    type: String, 
    enum: ['uploaded', 'verified', 'rejected'], 
    default: 'uploaded' 
  },
  rejectionReason: { type: String, default: null },
  uploadedAt: { type: Date, default: Date.now },
  verifiedAt: { type: Date, default: null }
});

const b2bCompanySchema = new mongoose.Schema({
  companyName: { type: String, required: [true, 'Company name is required'], trim: true },
  brandName: { type: String, default: null, trim: true },
  industryType: { type: String, default: null, trim: true },
  tenantId: { type: String, default: null, index: true, sparse: true },
  gstNumber: { type: String, required: [true, 'GST number is required'], trim: true },
  panNumber: { type: String, required: [true, 'PAN number is required'], trim: true },
  tanNumber: { type: String, required: [true, 'TAN number is required'], trim: true },
  cinNumber: { type: String, default: null, trim: true },
  logoUrl: { type: String, default: null },
  companyAddress: { type: String, required: [true, 'Company address is required'], trim: true },
  billingAddress: { type: String, required: [true, 'Billing address is required'], trim: true },
  branches: [branchSchema],
  authorizedPerson: { type: authorizedPersonSchema, required: true },
  
  // Credentials & Login fields
  email: { 
    type: String, 
    required: [true, 'Email is required'], 
    unique: true, 
    lowercase: true, 
    trim: true 
  },
  phone: { 
    type: String, 
    required: [true, 'Phone number is required'], 
    unique: true, 
    trim: true 
  },
  passwordHash: { type: String, required: [true, 'Password is required'] },
  
  // Verification states
  documents: [b2bCompanyDocumentSchema],
  verificationStatus: { 
    type: String, 
    enum: ['pending', 'verified', 'approved', 'rejected'], 
    default: 'pending' 
  },
  onboardingLifecycleStatus: {
    type: String,
    enum: ['draft', 'submitted', 'finance_review', 'compliance_review', 'operations_review', 'document_review', 'hold', 'active', 'rejected'],
    default: 'draft',
    index: true
  },
  rejectionReason: { type: String, default: null },
  isActive: { type: Boolean, default: true },
  walletBalance: { type: Number, default: 0 },
  deletedAt: { type: Date, default: null }
}, {
  timestamps: true
});

// Compare password method for authentication
b2bCompanySchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.passwordHash);
};

// Ensure indexes are set
b2bCompanySchema.index({ verificationStatus: 1 });

module.exports = mongoose.model('B2BCompany', b2bCompanySchema);
