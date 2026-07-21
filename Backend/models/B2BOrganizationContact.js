const mongoose = require('mongoose');

const b2bOrganizationContactSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'B2BCompany',
      required: true,
      index: true
    },
    contactType: {
      type: String,
      enum: ['primary', 'finance', 'procurement', 'operations', 'compliance', 'other'],
      default: 'other',
      index: true
    },
    name: { type: String, required: true, trim: true },
    designation: { type: String, default: null, trim: true },
    email: { type: String, default: null, lowercase: true, trim: true },
    mobile: { type: String, default: null, trim: true },
    altPhone: { type: String, default: null, trim: true },
    isPrimary: { type: Boolean, default: false },
    emailVerified: { type: Boolean, default: false },
    mobileVerified: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

b2bOrganizationContactSchema.index({ companyId: 1, contactType: 1 });

module.exports = mongoose.model('B2BOrganizationContact', b2bOrganizationContactSchema);
