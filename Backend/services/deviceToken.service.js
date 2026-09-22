const DeviceToken = require('../models/DeviceToken');

/**
 * Device registry for push.
 *
 * One row per user per device. Registering a device replaces whatever token
 * that device held before, so a refreshed FCM token never leaves a stale
 * duplicate behind, and a token FCM rejects is deactivated rather than kept
 * and retried forever.
 *
 * The per-role `fcmTokens[]` arrays are still written by the existing
 * endpoints; this registry is what push should read.
 */

const STALE_AFTER_DAYS = 60;

/** Register or refresh one device. */
async function registerDevice({
  userId,
  role,
  deviceId,
  token,
  platform = 'unknown',
  appVersion = '',
  deviceModel = '',
  companyId = null
}) {
  if (!userId || !role || !token) {
    throw new Error('userId, role and token are required to register a device');
  }
  // Web clients often have no stable device id; the token itself identifies them.
  const device = String(deviceId || token).slice(0, 128);

  // The same token on another account belongs to whoever logged in last.
  await DeviceToken.updateMany(
    { token, userId: { $ne: userId } },
    { $set: { active: false, invalidatedAt: new Date(), invalidReason: 'claimed by another account' } }
  );

  return DeviceToken.findOneAndUpdate(
    { userId, deviceId: device },
    {
      $set: {
        userId,
        role,
        companyId,
        deviceId: device,
        token,
        platform,
        appVersion,
        deviceModel,
        active: true,
        lastSeenAt: new Date(),
        invalidatedAt: null,
        invalidReason: null
      }
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
}

/** Drop a device on sign-out. */
async function removeDevice({ userId, deviceId = null, token = null }) {
  const filter = { userId };
  if (deviceId) filter.deviceId = String(deviceId);
  else if (token) filter.token = token;
  else return { removed: 0 };
  const res = await DeviceToken.deleteMany(filter);
  return { removed: res.deletedCount || 0 };
}

/** Active tokens for a user, newest device first. */
async function tokensFor(userId, { role = null } = {}) {
  const filter = { userId, active: true };
  if (role) filter.role = role;
  const rows = await DeviceToken.find(filter).sort({ lastSeenAt: -1 }).select('token').lean();
  return rows.map((r) => r.token);
}

/** Active tokens for every user of a company (B2B fan-out). */
async function tokensForCompany(companyId) {
  const rows = await DeviceToken.find({ companyId, active: true }).select('token').lean();
  return rows.map((r) => r.token);
}

/**
 * Deactivate tokens FCM reported as invalid. Called from the send path, so a
 * dead token is retired the first time it fails.
 */
async function invalidateTokens(tokens = [], reason = 'rejected by FCM') {
  if (!tokens.length) return { deactivated: 0 };
  const res = await DeviceToken.updateMany(
    { token: { $in: tokens } },
    { $set: { active: false, invalidatedAt: new Date(), invalidReason: reason } }
  );
  return { deactivated: res.modifiedCount || 0 };
}

/** Retire devices that have not checked in for a long time. */
async function pruneStaleDevices({ days = STALE_AFTER_DAYS } = {}) {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const res = await DeviceToken.deleteMany({
    $or: [
      { active: false, invalidatedAt: { $lte: cutoff } },
      { lastSeenAt: { $lte: cutoff } }
    ]
  });
  return { removed: res.deletedCount || 0 };
}

module.exports = {
  registerDevice,
  removeDevice,
  tokensFor,
  tokensForCompany,
  invalidateTokens,
  pruneStaleDevices,
  STALE_AFTER_DAYS
};
