const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  actionType: { 
    type: String, 
    required: true,
    enum: [
      'BANK_DETAILS_UPDATE',
      'WITHDRAWAL_REQUEST',
      'WITHDRAWAL_APPROVED',
      'WITHDRAWAL_REJECTED',
      'PAYMENT_RELEASED',
      'B2B_PROFILE_UPDATE',
      'B2B_CONTACT_UPDATE',
      'B2B_ADDRESS_UPDATE',
      'B2B_LOGO_UPDATE',
      'B2B_BRANCH_CREATE',
      'B2B_BRANCH_UPDATE',
      'B2B_BRANCH_DELETE',
      'B2B_DOCUMENT_UPLOAD',
      'B2B_DOCUMENT_REUPLOAD',
      'B2B_BANK_VERIFY',
      'B2B_PASSWORD_CHANGE',
      'B2B_SESSIONS_LOGOUT',
      'B2B_NOTIF_PREFS_UPDATE'
    ]
  },
  actorId: { type: mongoose.Schema.Types.ObjectId, required: true }, // Who did it
  actorRole: { type: String, required: true }, // 'engineer', 'vendor', 'admin', 'worker'
  
  targetId: { type: mongoose.Schema.Types.ObjectId }, // E.g., BankAccount ID, Withdrawal ID
  targetType: { type: String }, // E.g., 'BankAccount', 'Withdrawal'
  
  changes: { type: mongoose.Schema.Types.Mixed }, // What was changed (e.g., amount, old vs new values)
  
  ipAddress: { type: String },
  userAgent: { type: String },
  
  status: { type: String, enum: ['success', 'failed'], default: 'success' },
  errorMessage: { type: String }
}, { timestamps: true });

// Indexing for faster queries when admins review logs
auditLogSchema.index({ actionType: 1, createdAt: -1 });
auditLogSchema.index({ actorId: 1, createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
