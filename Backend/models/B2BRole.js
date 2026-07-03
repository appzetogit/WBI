const mongoose = require('mongoose');

const b2bRoleSchema = new mongoose.Schema({
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'B2BCompany',
    required: [true, 'Company reference is required'],
    index: true
  },
  roleName: {
    type: String,
    required: [true, 'Role name is required'],
    trim: true
  },
  permissions: [{
    type: String
  }],
  isDefault: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('B2BRole', b2bRoleSchema);
