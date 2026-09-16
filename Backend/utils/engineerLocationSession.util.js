/**
 * Engineer live-tracking session sync.
 *
 * The B2B/Admin live-tracking dashboard (b2bLiveTrackingController.js) reads
 * engineer position/status from EngineerLocationSession. Nothing wrote to
 * that collection, so the map always showed every engineer offline on load.
 * This helper is called from every B2B job lifecycle transition and from the
 * GPS ping endpoint so that collection reflects real, current state.
 *
 * Never throws — a tracking-sync failure must not block the actual job
 * action (accept/start/complete etc).
 */
const EngineerLocationSession = require('../models/EngineerLocationSession');

/** Accepts either {lat, lng} or GeoJSON {type:'Point', coordinates:[lng,lat]}. */
function extractLatLng(location) {
  if (!location) return null;
  const lat = Number(location.lat);
  const lng = Number(location.lng);
  if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };

  if (Array.isArray(location.coordinates) && location.coordinates.length === 2) {
    const clat = Number(location.coordinates[1]);
    const clng = Number(location.coordinates[0]);
    if (Number.isFinite(clat) && Number.isFinite(clng)) return { lat: clat, lng: clng };
  }
  return null;
}

/**
 * Upsert an engineer's live-tracking row.
 * @param {String} engineerId
 * @param {Object} opts
 * @param {Object} [opts.location]  {lat,lng} or GeoJSON Point
 * @param {String} [opts.status]    available|assigned|en_route|at_location|working|on_break|offline
 * @param {Boolean} [opts.isOnline]
 * @param {Number} [opts.battery]
 * @param {Number} [opts.heading]
 * @param {Number} [opts.speed]
 * @param {String} [opts.socketId]
 */
async function syncEngineerLocationSession(engineerId, opts = {}) {
  if (!engineerId) return null;
  try {
    const { status, isOnline, battery, heading, speed, socketId } = opts;
    const latLng = extractLatLng(opts.location);

    const set = { lastUpdatedAt: new Date() };
    if (latLng) set.currentLocation = { type: 'Point', coordinates: [latLng.lng, latLng.lat] };
    if (status) set.status = status;
    if (typeof isOnline === 'boolean') set.isOnline = isOnline;
    if (Number.isFinite(Number(battery))) set.battery = Number(battery);
    if (Number.isFinite(Number(heading))) set.heading = Number(heading);
    if (Number.isFinite(Number(speed))) set.speed = Number(speed);
    if (typeof socketId === 'string') set.socketId = socketId;

    const setOnInsert = { engineerId };
    if (!set.currentLocation) {
      setOnInsert.currentLocation = { type: 'Point', coordinates: [0, 0] };
    }

    return await EngineerLocationSession.findOneAndUpdate(
      { engineerId },
      { $set: set, $setOnInsert: setOnInsert },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  } catch (err) {
    console.warn('[engineerLocationSession] sync failed (non-blocking):', err.message);
    return null;
  }
}

/** Mark an engineer fully offline (logout / long inactivity). */
async function markEngineerOffline(engineerId) {
  return syncEngineerLocationSession(engineerId, { status: 'offline', isOnline: false });
}

module.exports = { syncEngineerLocationSession, markEngineerOffline, extractLatLng };
