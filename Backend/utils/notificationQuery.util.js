/**
 * Build ownership-scoped notification queries (case-insensitive roles).
 */
function normalizeRole(role) {
  return String(role || '').toUpperCase();
}

function buildNotificationOwnerQuery(userId, userRole, extra = {}) {
  const role = normalizeRole(userRole);
  const query = { ...extra };

  switch (role) {
    case 'USER':
      query.userId = userId;
      break;
    case 'VENDOR':
      query.vendorId = userId;
      break;
    case 'WORKER':
    case 'ENGINEER':
      query.workerId = userId;
      break;
    case 'ADMIN':
      query.adminId = userId;
      break;
    case 'B2B':
      query.b2bUserId = userId;
      break;
    default:
      // Fail closed: unknown role gets impossible match
      query._id = null;
  }

  return query;
}

module.exports = { normalizeRole, buildNotificationOwnerQuery };
