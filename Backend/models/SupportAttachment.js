const mongoose = require('mongoose');

const supportAttachmentSchema = new mongoose.Schema({
  ticketId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'SupportTicket', 
    required: true,
    index: true
  },
  messageId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'SupportMessage', 
    default: null 
  },
  fileUrl: { 
    type: String, 
    required: true 
  },
  fileName: { 
    type: String, 
    required: true 
  },
  fileType: { 
    type: String 
  },
  fileSize: { 
    type: Number 
  },
  uploadedBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    required: true 
  }
}, { 
  timestamps: true 
});

module.exports = mongoose.model('SupportAttachment', supportAttachmentSchema);
