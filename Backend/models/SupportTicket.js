const mongoose = require('mongoose');

const supportTicketSchema = new mongoose.Schema({
  companyId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'B2BCompany', 
    required: true,
    index: true
  },
  ticketNumber: { 
    type: String, 
    required: true, 
    unique: true,
    index: true
  },
  subject: { 
    type: String, 
    required: true,
    trim: true
  },
  description: { 
    type: String, 
    required: true 
  },
  category: { 
    type: String, 
    enum: ['Job Related', 'Engineer', 'Payment', 'Wallet', 'Invoice', 'Bulk Upload', 'Reports', 'Account', 'Other'], 
    required: true,
    index: true
  },
  priority: { 
    type: String, 
    enum: ['Low', 'Medium', 'High', 'Urgent'], 
    default: 'Medium',
    index: true
  },
  status: { 
    type: String, 
    enum: ['Open', 'In Progress', 'Resolved', 'Closed'], 
    default: 'Open',
    index: true
  },
  relatedJobId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'B2BJob', 
    default: null 
  },
  relatedInvoiceId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'B2BInvoice', 
    default: null 
  },
  relatedPaymentId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Payment', // Matches core Payment model
    default: null 
  },
  relatedBatchId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'B2BBatch', 
    default: null 
  },
  createdBy: { 
    type: String, 
    required: true 
  },
  assignedTo: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Admin', 
    default: null 
  },
  contactEmail: { 
    type: String, 
    required: true,
    trim: true,
    lowercase: true
  },
  contactNumber: { 
    type: String, 
    required: true,
    trim: true
  },
  attachments: [{
    fileUrl: { type: String, required: true },
    fileName: { type: String, required: true },
    fileType: { type: String },
    fileSize: { type: Number }
  }],
  lastMessageAt: { 
    type: Date, 
    default: Date.now,
    index: true
  },
  resolvedAt: { 
    type: Date, 
    default: null 
  },
  closedAt: { 
    type: Date, 
    default: null 
  }
}, { 
  timestamps: true 
});

supportTicketSchema.index({ companyId: 1, status: 1 });
supportTicketSchema.index({ companyId: 1, createdAt: -1 });

module.exports = mongoose.model('SupportTicket', supportTicketSchema);
