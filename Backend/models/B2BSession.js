const mongoose = require('mongoose');

const b2bSessionSchema = new mongoose.Schema({
  companyId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'B2BCompany', 
    required: true 
  },
  deviceInfo: { 
    type: String, 
    required: true 
  },
  ipAddress: { 
    type: String, 
    required: true 
  },
  lastActiveAt: { 
    type: Date, 
    default: Date.now 
  },
  isActive: { 
    type: Boolean, 
    default: true 
  }
}, { 
  timestamps: true 
});

b2bSessionSchema.index({ companyId: 1 });

module.exports = mongoose.model('B2BSession', b2bSessionSchema);
