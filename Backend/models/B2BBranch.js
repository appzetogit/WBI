const mongoose = require('mongoose');

const b2bBranchSchema = new mongoose.Schema({
  companyId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'B2BCompany', 
    required: true 
  },
  branchName: { 
    type: String, 
    required: true, 
    trim: true 
  },
  address: { 
    type: String, 
    required: true, 
    trim: true 
  },
  city: { 
    type: String, 
    required: true, 
    trim: true 
  },
  state: { 
    type: String, 
    required: true, 
    trim: true 
  },
  pincode: { 
    type: String, 
    required: true, 
    trim: true 
  },
  contactPerson: { 
    type: String, 
    required: true, 
    trim: true 
  },
  contactPhone: { 
    type: String, 
    required: true, 
    trim: true 
  },
  isActive: { 
    type: Boolean, 
    default: true 
  }
}, { 
  timestamps: true 
});


module.exports = mongoose.model('B2BBranch', b2bBranchSchema);
