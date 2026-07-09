const mongoose = require('mongoose');

const documentRuleSchema = new mongoose.Schema({
  role: { 
    type: String, 
    required: true,
    enum: ['worker', 'engineer', 'vendor', 'b2b']
  },
  documentType: { 
    type: String, 
    required: true 
  },
  label: { 
    type: String, 
    required: true 
  },
  required: { 
    type: Boolean, 
    default: true 
  },
  verificationMode: { 
    type: String, 
    enum: ['digilocker', 'api', 'ocr', 'manual', 'upload_only'], 
    default: 'upload_only' 
  },
  allowedMimeTypes: [{ 
    type: String, 
    default: ['image/jpeg', 'image/png', 'application/pdf'] 
  }],
  maxFileSize: { 
    type: Number, 
    default: 5 * 1024 * 1024 // 5MB
  }, 
  sortOrder: { 
    type: Number, 
    default: 0 
  },
  isActive: { 
    type: Boolean, 
    default: true 
  }
}, { 
  timestamps: true 
});

documentRuleSchema.index({ role: 1, documentType: 1 }, { unique: true });

module.exports = mongoose.model('DocumentRule', documentRuleSchema);
