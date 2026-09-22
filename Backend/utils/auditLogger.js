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
 * @param {Object} [params.oldValue] - State before the action
 * @param {Object} [params.newValue] - State after the action
 * @param {string} [params.reason] - Why the actor did it, when they had to state one
 * @param {string} [params.ipAddress] - IP of the request
 * @param {string} [params.userAgent] - Browser/Device info
 * @param {string} [params.deviceId] - Device identifier, when the client sends one
 * @param {Object} [params.req] - Express request; IP, user agent and device are read from it
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
  oldValue = undefined,
  newValue = undefined,
  reason = '',
  ipAddress = '',
  userAgent = '',
  deviceId = '',
  req = null,
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
      oldValue,
      newValue,
      reason,
      // Taking these from the request means a caller cannot forget them.
      ipAddress: ipAddress || req?.ip || req?.headers?.['x-forwarded-for'] || '',
      userAgent: userAgent || req?.headers?.['user-agent'] || '',
      deviceId: deviceId || req?.headers?.['x-device-id'] || '',
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
