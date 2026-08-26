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
  role: {
    type: String,
    required: [true, 'Role name is required'],
    trim: true
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
