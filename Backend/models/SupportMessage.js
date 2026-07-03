const mongoose = require('mongoose');

const supportMessageSchema = new mongoose.Schema({
  ticketId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'SupportTicket', 
    required: true,
    index: true
  },
  senderId: { 
    type: mongoose.Schema.Types.ObjectId, 
    required: true 
  },
  senderRole: { 
    type: String, 
    enum: ['b2b', 'admin', 'support'], 
    required: true 
  },
  senderName: {
    type: String,
    required: true
  },
  message: { 
    type: String, 
    required: true 
  },
  attachments: [{
    fileUrl: { type: String, required: true },
    fileName: { type: String, required: true },
    fileType: { type: String },
    fileSize: { type: Number }
  }],
  isInternalNote: { 
    type: Boolean, 
    default: false 
  }
}, { 
  timestamps: true 
});

supportMessageSchema.index({ ticketId: 1, createdAt: 1 });

module.exports = mongoose.model('SupportMessage', supportMessageSchema);
