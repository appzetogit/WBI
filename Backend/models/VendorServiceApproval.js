const mongoose = require('mongoose');
const { VENDOR_STATUS } = require('../utils/constants');

const vendorServiceApprovalSchema = new mongoose.Schema({
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    required: true,
    index: true
  },
  serviceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category', // Assuming 'Category' model handles main services
    required: true
  },
  subCategoryId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SubService',
    required: true
  },
  model: {
    type: String,
    enum: ['ONE_TIME', 'PROJECT'],
    required: true
  },
  status: {
    type: String,
    enum: Object.values(VENDOR_STATUS),
    default: VENDOR_STATUS.PENDING
  },
  approvedAt: {
    type: Date,
    default: null
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    default: null
  },
  rejectionReason: {
    type: String,
    default: null
  }
}, {
  timestamps: true
});

vendorServiceApprovalSchema.index({ vendorId: 1, subCategoryId: 1, model: 1 }, { unique: true });

module.exports = mongoose.model('VendorServiceApproval', vendorServiceApprovalSchema);
