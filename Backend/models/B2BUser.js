const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const b2bUserSchema = new mongoose.Schema({
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'B2BCompany',
    required: [true, 'Company reference is required'],
    index: true
  },
  fullName: {
    type: String,
    required: [true, 'Full Name is required'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    index: true
  },
  mobile: {
    type: String,
    required: [true, 'Mobile number is required'],
    trim: true
  },
  /** Free-text role name shown in the UI (e.g. "Site Operations"). */
  role: {
    type: String,
    required: [true, 'Role name is required'],
    trim: true
  },
  /**
   * Access role — what the API actually enforces. `permissions` below is the
   * per-user override list layered on top of the role's default set.
   */
  accessRole: {
    type: String,
    enum: ['B2B_ADMIN', 'B2B_OPERATIONS', 'B2B_FINANCE', 'DISPATCHER'],
    default: 'B2B_OPERATIONS',
    index: true
  },
  permissions: [{
    type: String
  }],
  status: {
    type: String,
    enum: ['invited', 'active', 'inactive', 'blocked'],
    default: 'invited',
    index: true
  },
  inviteTokenHash: {
    type: String,
    default: null,
    index: true
  },
  inviteExpiresAt: {
    type: Date,
    default: null
  },
  passwordHash: {
    type: String,
    default: null
  },
  lastLoginAt: {
    type: Date,
    default: null
  },
  fcmTokens: {
    type: [String],
    default: []
  },
  fcmTokenMobile: {
    type: [String],
    default: []
  },
  notificationPreferences: {
    jobs: { type: Boolean, default: true },
    payments: { type: Boolean, default: true },
    account: { type: Boolean, default: true },
    push: { type: Boolean, default: true },
    email: { type: Boolean, default: true }
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'B2BUser',
    default: null
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'B2BUser',
    default: null
  }
}, {
  timestamps: true
});

// Compare password helper
b2bUserSchema.methods.comparePassword = async function (candidatePassword) {
  if (!this.passwordHash) return false;
  return await bcrypt.compare(candidatePassword, this.passwordHash);
};

module.exports = mongoose.model('B2BUser', b2bUserSchema);
