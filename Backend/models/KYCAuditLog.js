const mongoose = require('mongoose');

const kycAuditLogSchema = new mongoose.Schema({
  role: { 
    type: String 
  },
  entityId: { 
    type: mongoose.Schema.Types.ObjectId 
  },
  action: { 
    type: String, 
    required: true 
  }, // e.g., 'VERIFICATION_INITIATED', 'VERIFICATION_SUCCESS'
  documentType: { 
    type: String 
  },
  provider: { 
    type: String 
  },
  status: { 
    type: String 
  },
  message: { 
    type: String 
  },
  ipAddress: { 
    type: String 
  },
  userAgent: { 
    type: String 
  }
}, { 
  timestamps: true 
});

module.exports = mongoose.model('KYCAuditLog', kycAuditLogSchema);
