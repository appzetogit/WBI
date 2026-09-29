const Worker = require('../models/Worker');
const ActiveWorkerSession = require('../models/ActiveWorkerSession');
const OneTimeService = require('../models/OneTimeService');
const Service = require('../models/Service');
const ServiceCategory = require('../models/ServiceCategory');
const { calculateDistance } = require('./locationService');

const ONLINE_STATUSES = new Set(['online', 'available', 'active', 'on-duty', 'approved', '']);
const BUSY_STATUSES = new Set(['busy', 'on_job', 'offline', 'inactive', 'suspended']);

const escapeRegex = (value = '') => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const toId = (value) => {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (value._id) return value._id.toString();
  return value.toString();
};

const normalizeName = (value) => String(value || '').toLowerCase().trim();

const isValidCoord = (lat, lng) => {
  const nLat = Number(lat);
  const nLng = Number(lng);
  if (!Number.isFinite(nLat) || !Number.isFinite(nLng)) return false;
  if (nLat === 0 && nLng === 0) return false;
  return Math.abs(nLat) <= 90 && Math.abs(nLng) <= 180;
};

const getWorkerCoords = (worker) => {
  const geoLng = worker.location?.coordinates?.[0];
  const geoLat = worker.location?.coordinates?.[1];
  if (isValidCoord(geoLat, geoLng)) {
    return { lat: Number(geoLat), lng: Number(geoLng), source: 'geo' };
  }

  const addrLat = worker.address?.lat ?? worker.address?.latitude;
  const addrLng = worker.address?.lng ?? worker.address?.longitude;
  if (isValidCoord(addrLat, addrLng)) {
    return { lat: Number(addrLat), lng: Number(addrLng), source: 'address' };
  }

  return null;
};

const isWorkerOnline = (worker, onlineSessionIds = new Set()) => {
  const status = String(worker.status || '').toLowerCase().trim();
  if (status === 'offline' || status === 'inactive' || status === 'suspended' || worker.isActive === false) return false;
  return true;
};

const collectWorkerCategoryIds = (worker) => {
  const ids = new Set();
  (worker.serviceCategoryRefs || []).forEach((id) => {
    const value = toId(id);
    if (value) ids.add(value);
  });
  (worker.workerServices || []).forEach((ws) => {
    const value = toId(ws.categoryId);
    if (value) ids.add(value);
  });
  (worker.serviceCategories || []).forEach((cat) => {
    const value = toId(cat);
    if (value && /^[a-fA-F0-9]{24}$/.test(value)) ids.add(value);
  });
  return ids;
};

const collectWorkerServiceIds = (worker) => {
  const ids = new Set();
  (worker.approvedOneTimeServices || []).forEach((id) => {
    const value = toId(id);
    if (value) ids.add(value);
  });
  (worker.workerServices || []).forEach((ws) => {
    const value = toId(ws.serviceId);
    if (value) ids.add(value);
  });
  (worker.subServices || []).forEach((sub) => {
    const value = toId(sub.subServiceId);
    if (value) ids.add(value);
  });
  return ids;
};

const collectWorkerNames = (worker) => {
  const names = new Set();
  (worker.serviceCategories || []).forEach((cat) => {
    const name = normalizeName(cat);
    if (name && !/^[a-fA-F0-9]{24}$/.test(name)) names.add(name);
    if (name && name.includes('/')) {
      name.split('/').forEach(part => {
        const p = normalizeName(part);
        if (p) names.add(p);
      });
    }
  });
  (worker.subServices || []).forEach((sub) => {
    const name = normalizeName(sub.name);
    if (name) names.add(name);
  });
  (worker.secondarySkills || []).forEach((skill) => {
    const name = normalizeName(skill);
    if (name) names.add(name);
  });
  (worker.skills || []).forEach((skill) => {
    const name = normalizeName(skill);
    if (name) names.add(name);
  });
  (worker.workerServices || []).forEach((ws) => {
    const name = normalizeName(ws.name || ws.title);
    if (name) names.add(name);
  });
  return names;
};

const namesOverlap = (workerNames, bookingNames) => {
  for (const workerName of workerNames) {
    if (!workerName) continue;
    for (const bookingName of bookingNames) {
      if (!bookingName) continue;
      if (workerName === bookingName) return true;
      if (workerName.includes(bookingName) || bookingName.includes(workerName)) return true;
    }
  }
  return false;
};

/**
 * Resolve all IDs/names that should match a one-time booking's service.
 * Workers register against Service (ONE_TIME); users book OneTimeService.
 */
const buildServiceMatchContext = async (booking) => {
  const serviceId = toId(booking.serviceId);
  const relatedServiceIds = new Set();
  const categoryIds = new Set();
  const names = new Set();

  if (booking.serviceName) names.add(normalizeName(booking.serviceName));
  if (booking.serviceCategory && booking.serviceCategory !== 'Category') {
    names.add(normalizeName(booking.serviceCategory));
  }

  if (serviceId) relatedServiceIds.add(serviceId);

  let oneTimeService = null;
  if (serviceId) {
    oneTimeService = await OneTimeService.findById(serviceId).select('name slug categoryId').lean();
  }

  if (oneTimeService) {
    if (oneTimeService.name) names.add(normalizeName(oneTimeService.name));
    if (oneTimeService.slug) names.add(normalizeName(oneTimeService.slug.replace(/-/g, ' ')));
    if (oneTimeService.categoryId) categoryIds.add(toId(oneTimeService.categoryId));

    const relatedServices = await Service.find({
      type: 'ONE_TIME',
      $or: [
        ...(oneTimeService.categoryId ? [{ categoryId: oneTimeService.categoryId }] : []),
        ...(oneTimeService.name ? [{ title: new RegExp(`^${escapeRegex(oneTimeService.name)}$`, 'i') }] : []),
        ...(oneTimeService.slug ? [{ slug: oneTimeService.slug }] : [])
      ]
    }).select('_id title slug categoryId').lean();

    relatedServices.forEach((svc) => {
      relatedServiceIds.add(toId(svc._id));
      if (svc.categoryId) categoryIds.add(toId(svc.categoryId));
      if (svc.title) names.add(normalizeName(svc.title));
    });
  } else if (serviceId) {
    const catalogService = await Service.findById(serviceId).select('title slug categoryId').lean();
    if (catalogService) {
      if (catalogService.title) names.add(normalizeName(catalogService.title));
      if (catalogService.categoryId) categoryIds.add(toId(catalogService.categoryId));

      const relatedOts = await OneTimeService.find({
        $or: [
          ...(catalogService.categoryId ? [{ categoryId: catalogService.categoryId }] : []),
          ...(catalogService.title ? [{ name: new RegExp(`^${escapeRegex(catalogService.title)}$`, 'i') }] : []),
          ...(catalogService.slug ? [{ slug: catalogService.slug }] : [])
        ]
      }).select('_id name categoryId').lean();

      relatedOts.forEach((ots) => {
        relatedServiceIds.add(toId(ots._id));
        if (ots.categoryId) categoryIds.add(toId(ots.categoryId));
        if (ots.name) names.add(normalizeName(ots.name));
      });
    }
  }

  if (categoryIds.size > 0) {
    const categories = await ServiceCategory.find({ _id: { $in: [...categoryIds] } }).select('name').lean();
    categories.forEach((cat) => {
      if (cat.name) names.add(normalizeName(cat.name));
    });
  }

  return { relatedServiceIds, categoryIds, names };
};

const workerMatchesService = (worker, context) => {
  if (!context) return true;
  const { relatedServiceIds, categoryIds, names } = context;

  const hasAnyServiceSkill =
    (worker.workerServices && worker.workerServices.length > 0) ||
    (worker.approvedOneTimeServices && worker.approvedOneTimeServices.length > 0) ||
    (worker.serviceCategories && worker.serviceCategories.length > 0) ||
    (worker.serviceCategoryRefs && worker.serviceCategoryRefs.length > 0) ||
    (worker.subServices && worker.subServices.length > 0);

  // If the booking has no identifiable service, any skilled worker can take it.
  if (relatedServiceIds.size === 0 && categoryIds.size === 0 && names.size === 0) {
    return hasAnyServiceSkill;
  }

  const workerServiceIds = collectWorkerServiceIds(worker);
  for (const id of workerServiceIds) {
    if (relatedServiceIds.has(id)) return true;
  }

  const workerCategoryIds = collectWorkerCategoryIds(worker);
  for (const id of workerCategoryIds) {
    if (categoryIds.has(id)) return true;
  }

  if (namesOverlap(collectWorkerNames(worker), names)) return true;

  return false;
};

const getBookingCoords = (booking) => {
  const address = booking.address || {};
  const lat = address.lat ?? address.latitude ?? address.location?.lat ?? address.location?.coordinates?.[1];
  const lng = address.lng ?? address.longitude ?? address.location?.lng ?? address.location?.coordinates?.[0];
  if (!isValidCoord(lat, lng)) return null;
  return { lat: Number(lat), lng: Number(lng) };
};

const getWorkerRangeKm = (worker, fallbackKm) => {
  const radius = Number(worker.workLocations?.serviceRadius);
  if (Number.isFinite(radius) && radius > 0) return Math.max(radius, 100);
  return Math.max(fallbackKm || 100, 100);
};

/**
 * Find nearby eligible workers for a one-time booking.
 * Uses GeoJSON when present, otherwise Haversine / same-city fallback.
 */
const findEligibleWorkers = async (booking, radiusKm = 100) => {
  const center = getBookingCoords(booking);
  const serviceContext = await buildServiceMatchContext(booking);

  const sessions = await ActiveWorkerSession.find({ isOnline: true }).select('workerId').lean();
  const onlineSessionIds = new Set(sessions.map((s) => toId(s.workerId)));

  const candidates = await Worker.find({
    isActive: { $ne: false },
    approvalStatus: 'approved'
  }).select(
    'name firstName lastName profilePhoto rating completedJobs status isActive approvalStatus location address workLocations serviceCategories serviceCategoryRefs workerServices approvedOneTimeServices subServices secondarySkills skills vendorId'
  ).lean();

  const city = normalizeName(booking.address?.city);
  const eligible = [];

  for (const worker of candidates) {
    if (!isWorkerOnline(worker, onlineSessionIds)) continue;
    if (!workerMatchesService(worker, serviceContext)) continue;

    if (booking.vendorId && worker.vendorId && toId(worker.vendorId) !== toId(booking.vendorId)) {
      continue;
    }

    const coords = getWorkerCoords(worker);
    const maxRange = getWorkerRangeKm(worker, radiusKm);
    let distance = null;
    let withinRange = false;

    if (center && coords) {
      distance = calculateDistance(center, coords);
      withinRange = distance <= radiusKm && distance <= maxRange;
    } else if (city && city !== 'unknown' && normalizeName(worker.address?.city) === city) {
      distance = radiusKm;
      withinRange = true;
    } else if (!center) {
      // Booking has no coordinates at all: fall back to a wave broadcast
      distance = radiusKm;
      withinRange = true;
    }
    // A worker without coordinates (and not in the booking's city) is never
    // matched to a located booking — otherwise they would get jobs anywhere.

    if (!withinRange) continue;

    eligible.push({
      ...worker,
      distance: distance != null ? Number(distance.toFixed(2)) : radiusKm,
      location: worker.location
    });
  }

  eligible.sort((a, b) => (a.distance || 0) - (b.distance || 0));
  console.log(`[WorkerEligibility] booking=${booking._id || 'n/a'} candidates=${candidates.length} eligible=${eligible.length} radius=${radiusKm}km city=${city || '-'}`);
  return eligible.slice(0, 25);
};

module.exports = {
  findEligibleWorkers,
  buildServiceMatchContext,
  workerMatchesService,
  getWorkerCoords,
  getBookingCoords,
  isValidCoord,
  isWorkerOnline
};
