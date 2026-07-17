const AuditLog = require('../models/AuditLog');

/**
 * Log an audit event
 * @param {Object} params 
 * @param {string} params.actionType - Action code (e.g. ENGINEER_REGISTERED, ADMIN_APPROVED_VENDOR)
 * @param {string} params.eventMessage - Human readable message (e.g. "Engineer Rahul registered from IP 103...")
 * @param {ObjectId} params.actorId - ID of the user performing the action
 * @param {string} params.actorRole - Role of the user ('engineer', 'admin', 'system')
 * @param {ObjectId} [params.targetId] - ID of the affected resource
 * @param {string} [params.targetType] - Type of the affected resource ('Engineer', 'Vendor')
 * @param {Object} [params.changes] - Old/New values or metadata
 * @param {string} [params.ipAddress] - IP of the request
 * @param {string} [params.userAgent] - Browser/Device info
 * @param {string} [params.status] - 'success' or 'failed'
 * @param {Object} [params.session] - Mongoose session for transaction support
 */
const logAudit = async ({
  actionType,
  eventMessage,
  actorId,
  actorRole,
  targetId = null,
  targetType = null,
  changes = {},
  ipAddress = '',
  userAgent = '',
  status = 'success',
  session = null
}) => {
  try {
    const logEntry = new AuditLog({
      actionType,
      eventMessage,
      actorId,
      actorRole,
      targetId,
      targetType,
      changes,
      ipAddress,
      userAgent,
      status
    });

    if (session) {
      await logEntry.save({ session });
    } else {
      await logEntry.save();
    }
  } catch (error) {
    console.error('[AuditLogger] Failed to save audit log:', error.message);
  }
};

module.exports = { logAudit };
