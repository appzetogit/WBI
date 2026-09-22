/**
 * Vendor Panel "Services": what the vendor is approved to do, where it
 * covers it, the service keys routing and bulk uploads use, and an
 * area-first view of its coverage.
 */
const mongoose = require('mongoose');
const B2BJob = require('../models/B2BJob');
const Vendor = require('../models/Vendor');
const ServiceConfig = require('../models/ServiceConfig');
const VendorServiceCoverage = require('../models/VendorServiceCoverage');
const { LIFECYCLE: S } = require('./jobStateMachine');

const oid = (v) => new mongoose.Types.ObjectId(String(v._id || v));
const DAY = 86400000;
const ACTIVE = [S.ASSIGNED, S.REASSIGNED, S.ACCEPTED, S.EN_ROUTE, S.ARRIVED, S.IN_PROGRESS, S.ON_HOLD];

class ServicesError extends Error {
  constructor(message, status = 400, code = 'SERVICES_REFUSED') {
    super(message);
    this.name = 'ServicesError';
    this.status = status;
    this.code = code;
  }
}

const vendorServiceList = async (vid) => {
  const vendor = await Vendor.findById(vid).select('approvedServices').lean();
  if (!vendor) throw new ServicesError('Vendor not found', 404, 'NOT_FOUND');
  const seen = new Set();
  return (vendor.approvedServices || [])
    .filter((s) => s.categoryCode)
    .map((s) => ({
      serviceKey: String(s.categoryCode).toUpperCase(),
      serviceName: s.categoryName || s.categoryCode,
      status: s.status || 'pending',
      approvedAt: s.approvedAt || null,
      subServices: s.subServices || []
    }))
    .filter((s) => !seen.has(s.serviceKey) && seen.add(s.serviceKey));
};

/** My Services: status, coverage, engineers, work and SLA per approved service. */
const myServices = async (vid) => {
  const services = await vendorServiceList(vid);
  const keys = services.map((s) => s.serviceKey);
  const since = new Date(Date.now() - 30 * DAY);
  const { skillsMatrix } = require('./vendorEngineers.service');
  const { openVendorOfferFilter } = require('./jobScope.service');
  const [configs, coverage, matrix, held, offers] = await Promise.all([
    ServiceConfig.find({ categoryCode: { $in: keys } }).select('categoryCode categoryName slaRules isActive status').lean(),
    VendorServiceCoverage.find({ vendorId: oid(vid) }).lean(),
    skillsMatrix(vid),
    B2BJob.aggregate([
      { $match: { assignedVendorId: oid(vid), serviceKey: { $in: keys } } },
      {
        $group: {
          _id: '$serviceKey',
          active: { $sum: { $cond: [{ $in: ['$lifecycleStatus', ACTIVE] }, 1, 0] } },
          waiting: { $sum: { $cond: [{ $in: ['$lifecycleStatus', [S.PENDING_ASSIGNMENT, S.REJECTED]] }, 1, 0] } },
          completed30d: { $sum: { $cond: [{ $gte: ['$completionSubmittedAt', since] }, 1, 0] } },
          slaTracked: { $sum: { $cond: [{ $and: [{ $gte: ['$completionSubmittedAt', since] }, { $gt: ['$slaDueAt', null] }] }, 1, 0] } },
          slaMet: { $sum: { $cond: [{ $and: [{ $gte: ['$completionSubmittedAt', since] }, { $gt: ['$slaDueAt', null] }, { $lte: ['$completionSubmittedAt', '$slaDueAt'] }] }, 1, 0] } }
        }
      }
    ]),
    B2BJob.aggregate([
      { $match: { ...openVendorOfferFilter(oid(vid)), serviceKey: { $in: keys } } },
      { $group: { _id: '$serviceKey', n: { $sum: 1 } } }
    ])
  ]);
  const cfgBy = new Map(configs.map((c) => [c.categoryCode, c]));
  const covBy = new Map(coverage.map((c) => [c.serviceKey, c]));
  const skillBy = new Map(matrix.services.map((s) => [s.serviceKey, s]));
  const heldBy = new Map(held.map((h) => [h._id, h]));
  const offerBy = new Map(offers.map((o) => [o._id, o.n]));

  const data = services.map((s) => {
    const cfg = cfgBy.get(s.serviceKey);
    const cov = covBy.get(s.serviceKey);
    const sk = skillBy.get(s.serviceKey);
    const h = heldBy.get(s.serviceKey) || {};
    const areas = cov ? (cov.coverageCities || []).length + (cov.coveragePincodes || []).length : 0;
    const catalogActive = Boolean(cfg && cfg.isActive !== false);
    let readiness = 'ready';
    const issues = [];
    if (s.status === 'suspended') { readiness = 'blocked'; issues.push('Suspended by WBI — you receive no jobs for it'); }
    if (s.status === 'pending') issues.push('Waiting for WBI approval');
    if (!catalogActive) { readiness = 'blocked'; issues.push('Not active in the WBI service catalog'); }
    if (!cov || !cov.active || !areas) { readiness = readiness === 'blocked' ? 'blocked' : 'incomplete'; issues.push('No service area set'); }
    if (sk && sk.gap === 'no_active_engineer') { readiness = readiness === 'blocked' ? 'blocked' : 'incomplete'; issues.push('No active engineer with the skill'); }
    return {
      ...s,
      serviceName: cfg?.categoryName || s.serviceName,
      catalogActive,
      readiness,
      issues,
      coverage: { active: Boolean(cov?.active), cities: cov?.coverageCities || [], pincodes: cov?.coveragePincodes || [], areas, updatedAt: cov?.updatedAt || null },
      engineers: sk ? sk.engineers : { active: 0, available: 0, pending: 0, inactive: 0 },
      jobs: {
        newRequests: offerBy.get(s.serviceKey) || 0,
        waitingForEngineer: h.waiting || 0,
        active: h.active || 0,
        completed30d: h.completed30d || 0,
        slaCompliance30d: h.slaTracked ? Math.round((h.slaMet / h.slaTracked) * 1000) / 10 : null
      },
      slaRules: (cfg?.slaRules || []).map((r) => ({ key: r.key, label: r.label, responseMinutes: r.responseMinutes, resolutionHours: r.resolutionHours }))
    };
  });
  return {
    data,
    summary: {
      services: data.length,
      ready: data.filter((d) => d.readiness === 'ready').length,
      incomplete: data.filter((d) => d.readiness === 'incomplete').length,
      blocked: data.filter((d) => d.readiness === 'blocked').length
    }
  };
};

/** Service keys: the codes routing and bulk uploads match, with aliases, sub-services and SLAs. */
const serviceKeys = async (vid) => {
  const services = await vendorServiceList(vid);
  const configs = await ServiceConfig.find({ categoryCode: { $in: services.map((s) => s.serviceKey) } })
    .select('categoryCode categoryName matchAliases subCategories requiredSkills slaRules isActive')
    .lean();
  const cfgBy = new Map(configs.map((c) => [c.categoryCode, c]));
  return services.map((s) => {
    const cfg = cfgBy.get(s.serviceKey) || {};
    return {
      serviceKey: s.serviceKey,
      serviceName: cfg.categoryName || s.serviceName,
      status: s.status,
      catalogActive: cfg.isActive !== false && Boolean(cfg.categoryCode),
      aliases: (cfg.matchAliases || []).filter(Boolean),
      subServices: (cfg.subCategories || []).filter((x) => x.isActive !== false).map((x) => ({
        key: x.subCatCode,
        name: x.subCatName,
        approved: !s.subServices.length || s.subServices.some((n) => [x.subCatCode, x.subCatName].map((v) => String(v).toLowerCase()).includes(String(n).toLowerCase()))
      })),
      requiredSkills: cfg.requiredSkills || [],
      slaRules: (cfg.slaRules || []).map((r) => ({ key: r.key, label: r.label, responseMinutes: r.responseMinutes, resolutionHours: r.resolutionHours }))
    };
  });
};

/** What routing would make of a service name (as typed in a bulk upload). */
const resolveServiceName = async (vid, { service, subService }) => {
  const text = String(service || '').trim();
  if (text.length < 2) throw new ServicesError('Type a service name to check', 400, 'NAME_REQUIRED');
  const { resolveServiceKey } = require('./jobRouting.service');
  const { serviceKey, subServiceKey, serviceConfig } = await resolveServiceKey({ service: text.slice(0, 100), subService: String(subService || '').slice(0, 100) });
  const services = await vendorServiceList(vid);
  const mine = services.find((s) => s.serviceKey === serviceKey);
  return {
    input: text,
    serviceKey: serviceKey || null,
    serviceName: serviceConfig?.categoryName || null,
    subServiceKey: subServiceKey || null,
    yours: Boolean(mine),
    yourStatus: mine?.status || null
  };
};

/** Service areas: every city / pincode covered, with services, engineers and recent jobs. */
const serviceAreas = async (vid) => {
  const [services, coverage] = await Promise.all([vendorServiceList(vid), VendorServiceCoverage.find({ vendorId: oid(vid) }).lean()]);
  const nameOf = new Map(services.map((s) => [s.serviceKey, s.serviceName]));
  const areas = new Map();
  const touch = (type, value, cov) => {
    const key = `${type}:${value}`;
    if (!areas.has(key)) areas.set(key, { type, value, services: [] });
    areas.get(key).services.push({ serviceKey: cov.serviceKey, serviceName: cov.serviceName || nameOf.get(cov.serviceKey) || cov.serviceKey, active: Boolean(cov.active) });
  };
  coverage.forEach((cov) => {
    (cov.coverageCities || []).forEach((c) => touch('city', c, cov));
    (cov.coveragePincodes || []).forEach((p) => touch('pincode', p, cov));
  });

  const { vendorTeam } = require('./vendorEngineers.service');
  const since = new Date(Date.now() - 30 * DAY);
  const [team, byCity, byPin] = await Promise.all([
    vendorTeam(vid),
    B2BJob.aggregate([
      { $match: { assignedVendorId: oid(vid), createdAt: { $gte: since } } },
      { $group: { _id: { $toLower: { $trim: { input: { $ifNull: ['$city', ''] } } } }, n: { $sum: 1 } } }
    ]),
    B2BJob.aggregate([
      { $match: { assignedVendorId: oid(vid), createdAt: { $gte: since }, pincode: { $nin: [null, ''] } } },
      { $group: { _id: '$pincode', n: { $sum: 1 } } }
    ])
  ]);
  const cityJobs = new Map(byCity.map((r) => [VendorServiceCoverage.normalizeCity(r._id), r.n]));
  const pinJobs = new Map(byPin.map((r) => [String(r._id), r.n]));
  const active = team.filter((e) => e.status === 'ACTIVE');
  const engineersIn = (city) => active.filter((e) => [e.coverage.city, ...e.coverage.cities].map(VendorServiceCoverage.normalizeCity).includes(city));

  const data = [...areas.values()]
    .map((a) => {
      const engs = a.type === 'city' ? engineersIn(a.value) : [];
      return {
        ...a,
        engineers: a.type === 'city' ? engs.length : null,
        engineerNames: engs.slice(0, 5).map((e) => e.name),
        jobs30d: a.type === 'city' ? cityJobs.get(a.value) || 0 : pinJobs.get(a.value) || 0,
        warning: a.type === 'city' && !engs.length ? 'No active engineer is based in or covers this city' : null
      };
    })
    .sort((x, y) => (x.type === y.type ? x.value.localeCompare(y.value) : x.type === 'city' ? -1 : 1));

  return {
    data,
    services: services.filter((s) => s.status !== 'suspended').map((s) => ({ serviceKey: s.serviceKey, serviceName: s.serviceName })),
    summary: {
      cities: data.filter((a) => a.type === 'city').length,
      pincodes: data.filter((a) => a.type === 'pincode').length,
      withoutEngineers: data.filter((a) => a.warning).length
    }
  };
};

/**
 * Add or remove areas across several services in one go.
 * @param {{ action: 'add'|'remove', cities?: string[], pincodes?: string[], serviceKeys: string[] }} body
 */
const updateServiceAreas = async (vid, body = {}, actor) => {
  const action = String(body.action || '');
  if (!['add', 'remove'].includes(action)) throw new ServicesError('action must be add or remove', 400, 'BAD_ACTION');
  const cities = [...new Set((Array.isArray(body.cities) ? body.cities : []).map(VendorServiceCoverage.normalizeCity).filter(Boolean))];
  const rawPins = Array.isArray(body.pincodes) ? body.pincodes.map((p) => String(p).trim()).filter(Boolean) : [];
  const badPins = rawPins.filter((p) => !/^[1-9][0-9]{5}$/.test(p));
  if (badPins.length) throw new ServicesError(`Invalid pincode(s): ${badPins.slice(0, 5).join(', ')}`, 400, 'BAD_PINCODE');
  const pincodes = [...new Set(rawPins)];
  if (!cities.length && !pincodes.length) throw new ServicesError('Add at least one city or pincode', 400, 'NO_AREAS');
  if (cities.length + pincodes.length > 500) throw new ServicesError('At most 500 areas per change', 400, 'TOO_MANY');

  const services = await vendorServiceList(vid);
  const usable = new Map(services.filter((s) => s.status !== 'suspended').map((s) => [s.serviceKey, s]));
  const keys = [...new Set((Array.isArray(body.serviceKeys) ? body.serviceKeys : []).map((k) => String(k).toUpperCase()))];
  if (!keys.length) throw new ServicesError('Pick at least one service', 400, 'NO_SERVICES');
  const notYours = keys.filter((k) => !usable.has(k));
  if (notYours.length) throw new ServicesError(`You are not approved for: ${notYours.join(', ')}`, 403, 'NOT_APPROVED');
  const configs = await ServiceConfig.find({ categoryCode: { $in: keys }, isActive: true }).select('_id categoryCode categoryName').lean();
  const cfgBy = new Map(configs.map((c) => [c.categoryCode, c]));
  const inactive = keys.filter((k) => !cfgBy.has(k));
  if (inactive.length && action === 'add') throw new ServicesError(`Not active in the WBI catalog: ${inactive.join(', ')}`, 404, 'NOT_IN_CATALOG');

  const who = { actorId: actor?.id ? oid(actor.id) : null, role: actor?.role || 'vendor' };
  const results = [];
  for (const key of keys) {
    if (action === 'add') {
      const cfg = cfgBy.get(key);
      const doc = await VendorServiceCoverage.findOneAndUpdate(
        { vendorId: oid(vid), serviceKey: key },
        {
          $addToSet: { coverageCities: { $each: cities }, coveragePincodes: { $each: pincodes } },
          $set: { active: true, serviceName: cfg.categoryName, serviceConfigId: cfg._id, updatedBy: who }
        },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      ).lean();
      results.push({ serviceKey: key, cities: doc.coverageCities.length, pincodes: doc.coveragePincodes.length, active: doc.active });
    } else {
      const doc = await VendorServiceCoverage.findOneAndUpdate(
        { vendorId: oid(vid), serviceKey: key },
        { $pull: { coverageCities: { $in: cities }, coveragePincodes: { $in: pincodes } }, $set: { updatedBy: who } },
        { new: true }
      ).lean();
      if (!doc) continue;
      // Coverage with no areas left cannot route anything: switch it off.
      if (!doc.coverageCities.length && !doc.coveragePincodes.length && doc.active) {
        await VendorServiceCoverage.updateOne({ _id: doc._id }, { $set: { active: false } });
        doc.active = false;
      }
      results.push({ serviceKey: key, cities: doc.coverageCities.length, pincodes: doc.coveragePincodes.length, active: doc.active });
    }
  }
  const { logAudit } = require('../utils/auditLogger');
  await logAudit({
    actionType: 'VENDOR_SERVICE_AREAS_UPDATED',
    eventMessage: `Vendor ${vid} ${action === 'add' ? 'added' : 'removed'} ${cities.length} city/${pincodes.length} pincode area(s) for ${keys.join(', ')}`,
    actorId: who.actorId || oid(vid),
    actorRole: who.role,
    targetId: oid(vid),
    targetType: 'Vendor',
    changes: { action, cities, pincodes, serviceKeys: keys }
  }).catch(() => {});
  return results;
};

module.exports = { ServicesError, myServices, serviceKeys, resolveServiceName, serviceAreas, updateServiceAreas };
