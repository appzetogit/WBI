const mongoose = require('mongoose');

const digiLockerSessionSchema = new mongoose.Schema({
  role: { 
    type: String, 
    required: true 
  },
  entityId: { 
    type: mongoose.Schema.Types.ObjectId 
  }, // If logged in
  draftId: { 
    type: String 
  }, // If registering
  mobileNumber: { 
    type: String, 
    required: true 
  },
  transactionId: { 
    type: String, 
    required: true, 
    unique: true 
  }, // Use as recordId for complete hook
  status: { 
    type: String, 
    enum: ['initiated', 'completed', 'failed', 'expired'], 
    default: 'initiated' 
  },
  authorizationUrl: { 
    type: String 
  },
  documentsFetched: [{ 
    type: String 
  }],
  consentPurpose: { 
    type: String 
  },
  expiresAt: { 
    type: Date, 
    required: true, 
    index: { expires: '1h' } 
  } // TTL index (auto delete after 1 hr)
}, { 
  timestamps: true 
});

module.exports = mongoose.model('DigiLockerSession', digiLockerSessionSchema);
