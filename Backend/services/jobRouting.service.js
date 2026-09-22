/**
 * Job routing — which vendors may receive a job.
 *
 * A vendor is eligible only when BOTH hold (required):
 *   - coverage: an active VendorServiceCoverage row for the job's serviceKey
 *     that lists the job's pincode or city, and the service is not suspended
 *     on the vendor;
 *   - skill: the vendor has at least one approved engineer whose registered
 *     skills match the job (same gate as freelancer matching).
 * Eligible vendors are then ranked by available engineers, current workload
 * and past SLA performance. When nobody qualifies the result carries a
 * human-readable reason ("No vendor covers AC_REPAIR in pincode 452001") so
 * the job lands in the unassigned queue with that reason, never silently.
 */
const mongoose = require('mongoose');
const B2BJob = require('../models/B2BJob');
const Vendor = require('../models/Vendor');
const Engineer = require('../models/Engineer');
const ServiceConfig = require('../models/ServiceConfig');
const VendorServiceCoverage = require('../models/VendorServiceCoverage');
const {
  buildB2BJobSkillContext,
  engineerMatchesJob,
  isOnScheduleToday,
  MAX_ACTIVE_JOBS_PER_ENGINEER
} = require('./b2bEngineerEligibility');

const VENDOR_OFFER_LIMIT = Math.max(1, parseInt(process.env.JOB_VENDOR_OFFER_LIMIT || '5', 10));

const oid = (v) => new mongoose.Types.ObjectId(String(v._id || v));

/**
 * Resolve a job's free-text service into the catalog key (ServiceConfig.categoryCode).
 * @returns {{ serviceKey: string|null, subServiceKey: string|null, serviceConfig: object|null }}
 */
const resolveServiceKey = async ({ service, subService }) => {
  const { pickCategoryFromConfigs, loadActiveServiceConfigs } = require('../utils/createOpportunityFromEnquiry');
  const configs = await loadActiveServiceConfigs();
  const text = [service, subService].filter(Boolean).join(' ');
  const serviceKey = text ? pickCategoryFromConfigs(text, configs) : null;
  if (!serviceKey) return { serviceKey: null, subServiceKey: null, serviceConfig: null };

  const serviceConfig = await ServiceConfig.findOne({ categoryCode: serviceKey })
    .select('_id categoryCode categoryName subCategories slaRules requiredSkills')
    .lean();
  const sub = subService
    ? (serviceConfig?.subCategories || []).find(
      (s) => String(s.subCatName || '').toLowerCase() === String(subService).toLowerCase() ||
        String(s.subCatCode || '').toUpperCase() === String(subService).toUpperCase()
    )
    : null;
  return { serviceKey, subServiceKey: sub?.subCatCode || null, serviceConfig };
};

/** SLA due date from the service's SLA rules (priority-specific when present). */
const computeSlaDueAt = (serviceConfig, { priority, createdAt = new Date(), fallbackHours = 24 } = {}) => {
  const rules = serviceConfig?.slaRules || [];
  const wanted = String(priority || '').toLowerCase();
  const rule = rules.find((r) => String(r.key || '').toLowerCase() === wanted) ||
    rules.find((r) => ['default', 'standard', 'resolution'].includes(String(r.key || '').toLowerCase())) ||
    rules[0];
  const hours = Number(rule?.resolutionHours) || fallbackHours;
  return new Date(new Date(createdAt).getTime() + hours * 3600 * 1000);
};

/** Share of a vendor's closed jobs finished before their SLA, per vendor. */
const slaCompliance = async (vendorIds) => {
  const out = new Map();
  if (!vendorIds.length) return out;
  const rows = await B2BJob.aggregate([
    { $match: { assignedVendorId: { $in: vendorIds.map(oid) }, completedAt: { $ne: null }, slaDueAt: { $ne: null } } },
    {
      $group: {
        _id: '$assignedVendorId',
        total: { $sum: 1 },
        met: { $sum: { $cond: [{ $lte: ['$completedAt', '$slaDueAt'] }, 1, 0] } }
      }
    }
  ]);
  rows.forEach((r) => out.set(String(r._id), r.total ? Math.round((r.met / r.total) * 100) : null));
  return out;
};

const locationLabel = (job) => {
  const pin = VendorServiceCoverage.normalizePincode(job.pincode);
  return pin.length === 6 ? `pincode ${pin}` : job.city ? `${job.city}` : 'this location';
};

/**
 * Rank vendors eligible for a job.
 * @returns {Promise<{ serviceKey, vendors: Array, rejected: Array, reason: string|null }>}
 */
const findEligibleVendors = async (job, { excludeVendorIds = [] } = {}) => {
  let serviceKey = job.serviceKey;
  if (!serviceKey) serviceKey = (await resolveServiceKey(job)).serviceKey;
  if (!serviceKey) {
    return {
      serviceKey: null,
      vendors: [],
      rejected: [],
      reason: `"${job.service}" is not an offered service in the catalog — add it, then retry routing`
    };
  }

  const pin = VendorServiceCoverage.normalizePincode(job.pincode);
  const city = VendorServiceCoverage.normalizeCity(job.city);
  const locationOr = [];
  if (pin.length === 6) locationOr.push({ coveragePincodes: pin });
  if (city) locationOr.push({ coverageCities: city });
  if (!locationOr.length) {
    return { serviceKey, vendors: [], rejected: [], reason: 'The job has no city or pincode to route on' };
  }

  const exclude = new Set(excludeVendorIds.map(String));
  const coverage = (await VendorServiceCoverage.find({ serviceKey, active: true, $or: locationOr }).lean())
    .filter((c) => !exclude.has(String(c.vendorId)));

  if (!coverage.length) {
    return {
      serviceKey,
      vendors: [],
      rejected: [],
      reason: `No vendor covers ${serviceKey} in ${locationLabel(job)}`
    };
  }

  const vendorIds = [...new Set(coverage.map((c) => String(c.vendorId)))];
  const vendors = await Vendor.find({ _id: { $in: vendorIds.map(oid) } })
    .select('businessName name approvalStatus isActive approvedServices')
    .lean();
  const vendorById = new Map(vendors.map((v) => [String(v._id), v]));

  const engineers = await Engineer.find({
    vendorId: { $in: vendorIds.map(oid) },
    approvalStatus: 'approved',
    isActive: true,
    $or: [{ vendorApprovalStatus: { $in: ['approved', 'not_required'] } }, { vendorApprovalStatus: { $exists: false } }]
  })
    .select('name vendorId status serviceCategories subServices secondarySkills skills primaryCategory primarySkill workingDays emergencyService')
    .lean();

  const skillContext = await buildB2BJobSkillContext(job);
  const { activeJobCounts } = require('./jobAssignment.service');
  const { teamBlocks } = require('./vendorEngineers.service');
  const [counts, sla, blocks] = await Promise.all([
    activeJobCounts(engineers.map((e) => e._id)),
    slaCompliance(vendorIds),
    teamBlocks(engineers.map((e) => String(e._id)), null, { vendorOf: new Map(engineers.map((e) => [String(e._id), String(e.vendorId)])) })
  ]);

  const ranked = [];
  const rejected = [];
  for (const cov of coverage) {
    const vid = String(cov.vendorId);
    const vendor = vendorById.get(vid);
    const name = vendor?.businessName || vendor?.name || 'Vendor';
    const reasons = [];
    if (!vendor) reasons.push('Vendor account not found');
    else {
      if (vendor.approvalStatus !== 'approved') reasons.push('Vendor is not approved');
      if (vendor.isActive === false) reasons.push('Vendor account is inactive');
      const svc = (vendor.approvedServices || []).find((s) => String(s.categoryCode || '').toUpperCase() === serviceKey);
      if (svc && svc.status === 'suspended') reasons.push(`${serviceKey} is suspended for this vendor`);
    }

    const locationMatch = pin.length === 6 && (cov.coveragePincodes || []).includes(pin) ? 'pincode' : 'city';
    // Engineers the vendor deactivated/suspended can never take the job; those
    // on leave today count as skilled but not available.
    const own = engineers.filter((e) => String(e.vendorId) === vid && !blocks.inactive.has(String(e._id)));
    const skilled = own.filter((e) => engineerMatchesJob(e, skillContext).eligible);
    const available = skilled.filter((e) =>
      !blocks.onLeave.has(String(e._id)) &&
      String(e.status || '').toUpperCase() === 'ONLINE' &&
      isOnScheduleToday(e) &&
      (counts.get(String(e._id)) || 0) < MAX_ACTIVE_JOBS_PER_ENGINEER
    );
    const activeJobs = own.reduce((sum, e) => sum + (counts.get(String(e._id)) || 0), 0);
    if (!skilled.length) reasons.push(`No engineer skilled in "${job.service}"`);

    const row = {
      vendorId: vid,
      name,
      locationMatch,
      skillMatch: skilled.length > 0,
      skilledEngineers: skilled.length,
      availableEngineers: available.length,
      activeJobs,
      slaCompliance: sla.has(vid) ? sla.get(vid) : null,
      busy: skilled.length > 0 && available.length === 0,
      reasons
    };
    if (reasons.length) {
      rejected.push(row);
      continue;
    }
    row.score = Number((
      (locationMatch === 'pincode' ? 20 : 10) +
      available.length * 10 +
      skilled.length * 2 -
      activeJobs * 2 +
      (row.slaCompliance === null ? 5 : row.slaCompliance * 0.2)
    ).toFixed(1));
    ranked.push(row);
  }
  ranked.sort((a, b) => b.score - a.score);

  let reason = null;
  if (!ranked.length) {
    reason = `${coverage.length} vendor(s) cover ${serviceKey} in ${locationLabel(job)} but none is eligible: ` +
      [...new Set(rejected.flatMap((r) => r.reasons))].join('; ');
  }
  return { serviceKey, vendors: ranked, rejected, reason };
};

/**
 * Offer a job to the best-ranked eligible vendors (automatic / hybrid
 * routing). Adds them to notifiedVendors and tells each vendor's panel.
 * @returns {Promise<{ notified: string[], ranking: object }>}
 */
const offerToEligibleVendors = async (jobId, { limit = VENDOR_OFFER_LIMIT, actor = { role: 'system' } } = {}) => {
  const job = await B2BJob.findById(jobId).read('primary').lean();
  if (!job) return { notified: [], ranking: null };
  const already = (job.notifiedVendors || []).map(String);
  const declined = (job.vendorRejections || []).map((r) => String(r.vendorId));
  const ranking = await findEligibleVendors(job, { excludeVendorIds: [...already, ...declined] });

  if (ranking.serviceKey && !job.serviceKey) {
    await B2BJob.updateOne({ _id: job._id }, { $set: { serviceKey: ranking.serviceKey } });
  }
  const chosen = ranking.vendors.slice(0, limit).map((v) => v.vendorId);
  if (!chosen.length) return { notified: [], ranking };

  await B2BJob.updateOne({ _id: job._id }, { $addToSet: { notifiedVendors: { $each: chosen.map(oid) } } });

  const { recordJobEvent } = require('./jobLifecycle.service');
  await recordJobEvent({
    jobId: job._id,
    event: 'VENDORS_NOTIFIED',
    actor,
    remark: `Offered to ${chosen.length} vendor(s): ${ranking.vendors.slice(0, limit).map((v) => v.name).join(', ')}`,
    meta: { vendors: ranking.vendors.slice(0, limit) }
  });

  let io = null;
  try { io = require('../sockets').getIO(); } catch (_) { io = null; }
  const { createNotification } = require('../controllers/notificationControllers/notificationController');
  for (const v of ranking.vendors.slice(0, limit)) {
    if (io) {
      io.to(`vendor:${v.vendorId}`).emit('b2b:jobRequestReceived', {
        jobId: job.jobId,
        mongoId: String(job._id),
        service: job.service,
        serviceKey: ranking.serviceKey,
        customerName: job.customerName,
        city: job.city,
        pincode: job.pincode,
        charge: job.charge,
        locationMatch: v.locationMatch
      });
    }
    try {
      await createNotification({
        vendorId: v.vendorId,
        type: 'b2b_job_request',
        title: 'New job request',
        message: `${job.service || 'Service'} — ${job.city || ''} ${job.pincode || ''}`.trim(),
        relatedId: job._id,
        relatedType: 'b2b_job',
        priority: 'high'
      });
    } catch (_) { /* non-blocking */ }
  }
  return { notified: chosen, ranking };
};

module.exports = {
  VENDOR_OFFER_LIMIT,
  resolveServiceKey,
  computeSlaDueAt,
  findEligibleVendors,
  offerToEligibleVendors,
  slaCompliance
};
