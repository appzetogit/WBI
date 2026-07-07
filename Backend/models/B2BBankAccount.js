const mongoose = require('mongoose');

const b2bBankAccountSchema = new mongoose.Schema({
  companyId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'B2BCompany', 
    required: true,
    unique: true
  },
  accountHolderName: { 
    type: String, 
    required: true, 
    trim: true 
  },
  accountNumberEncrypted: { 
    type: String, 
    required: true 
  },
  accountNumberMasked: { 
    type: String, 
    required: true 
  },
  ifscCode: { 
    type: String, 
    required: true, 
    trim: true 
  },
  bankName: { 
    type: String, 
    required: true, 
    trim: true 
  },
  branchName: { 
    type: String, 
    required: true, 
    trim: true 
  },
  verificationStatus: { 
    type: String, 
    enum: ['pending', 'verified', 'rejected'], 
    default: 'pending' 
  },
  pennyDropStatus: { 
    type: String, 
    enum: ['none', 'pending', 'success', 'failed'], 
    default: 'none' 
  },
  verifiedAt: { 
    type: Date, 
    default: null 
  }
}, { 
  timestamps: true 
});

module.exports = mongoose.model('B2BBankAccount', b2bBankAccountSchema);
