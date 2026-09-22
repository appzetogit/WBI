/**
 * B2B Engineer Eligibility
 * ------------------------
 * Skill-aware candidate resolution for B2B job dispatch.
 *
 * Before this module, `b2bMatchingService.findEngineersInRadius()` selected
 * candidates purely on geo proximity + ONLINE + approved. That allowed an
 * Electrical engineer 1 km away to be offered an HVAC job while a qualified
 * HVAC engineer 2.5 km away was skipped.
 *
 * Matching rules applied here, in order:
 *   1. Hard filters  — role, approval, active, online (Mongo query)
 *   2. Geo filter    — $nearSphere within the wave radius (Mongo query)
 *   3. Skill match   — MANDATORY overlap with the job's service (in memory)
 *   4. Offer cap     — engineer holds at most ONE unanswered offer at a time
 *   5. Workload cap  — engineer not already saturated with live jobs
 *   6. Schedule      — engineer works today, unless emergency-capable
 *
 * Skill matching is STRICT. An offer is only sent when the engineer's registered
 * skills overlap the requested service. Two consequences:
 *   - A job whose service cannot be identified at all is sent to NOBODY; it is
 *     left unmatched so it escalates and the service data gets corrected,
 *     rather than being broadcast to engineers who cannot do the work.
 *   - When the service string does not resolve against the catalog, matching
 *     falls back to name-token overlap against the engineer's own skills —
 *     still a real skill check, never an "everyone is eligible" shortcut.
 *
 * Reuses the existing catalog + alias infrastructure
 * (ServiceCategory / SubService / ServiceConfig / LEGACY_ALIAS_MAP) instead of
 * introducing a second taxonomy.
 */

const mongoose = require('mongoose');
const Engineer = require('../models/Engineer');
const ServiceCategory = require('../models/ServiceCategory');
const SubService = require('../models/SubService');
const Skill = require('../models/Skill');
const B2BJob = require('../models/B2BJob');
const { LEGACY_ALIAS_MAP } = require('../utils/serviceCategoryAliases');

/** Max concurrent live jobs before an engineer is considered saturated. */
const MAX_ACTIVE_JOBS_PER_ENGINEER = Math.max(
  1,
  parseInt(process.env.B2B_MAX_ACTIVE_JOBS_PER_ENGINEER || '3', 10)
);

/**
 * Max simultaneous UNANSWERED offers an engineer may hold. Default 1 — an
 * engineer holds exactly ONE open offer at a time, so a bulk batch spreads
 * across the pool instead of stacking on one person.
 *
 * Without this, a bulk batch fans every job out to the same nearest engineer at
 * once (observed: 15 outstanding offers to one engineer while only 3 were
 * actually assigned), because assigned-job load only rises once someone
 * accepts. Capping open offers spreads a batch across the available pool and
 * lets jobs escalate to other engineers or the vendor marketplace instead of
 * queueing behind one person.
 */
const MAX_PENDING_OFFERS_PER_ENGINEER = Math.max(
  1,
  parseInt(process.env.B2B_MAX_PENDING_OFFERS_PER_ENGINEER || '1', 10)
);

/** Statuses that count against an engineer's live workload (engineer holding the job). */
const ACTIVE_JOB_STATUSES = ['assigned', 'accepted', 'travelling', 'arrived', 'in_progress', 'revision_required', 'on_hold'];

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const normalize = (value) => String(value || '').toLowerCase().trim().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');

const escapeRegex = (value = '') => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const toId = (value) => {
  if (!value) return null;
  if (typeof value === 'object' && value._id) return value._id.toString();
  return value.toString();
};

/** Tokens too generic to carry meaning — never match on these alone. */
const STOPWORDS = new Set([
  'service', 'services', 'repair', 'repairs', 'maintenance', 'installation',
  'install', 'job', 'work', 'general', 'other', 'others', 'na', 'n a', 'category'
]);

const isMeaningful = (name) => {
  const n = normalize(name);
  return Boolean(n) && n.length > 1 && !STOPWORDS.has(n);
};

/**
 * Two service names overlap when one contains the other, compared on
 * meaningful tokens only. "HVAC" matches "HVAC Service"; "Electrical" does not
 * match "HVAC".
 */
const namesOverlap = (engineerNames, jobNames) => {
  for (const eName of engineerNames) {
    if (!isMeaningful(eName)) continue;
    for (const jName of jobNames) {
      if (!isMeaningful(jName)) continue;
      if (eName === jName) return true;
      // Guard against trivial substring hits ("ac" inside "backup").
      if (eName.length >= 3 && jName.includes(eName)) return true;
      if (jName.length >= 3 && eName.includes(jName)) return true;
    }
  }
  return false;
};

/**
 * Resolve a B2B job's free-text `service` / `subService` into every catalog id
 * and name an engineer could plausibly be registered against.
 *
 * @returns {{ categoryIds:Set, subServiceIds:Set, names:Set, skillNames:Set, resolved:boolean, hasService:boolean }}
 */
const buildB2BJobSkillContext = async (b2bJob) => {
  const names = new Set();
  const skillNames = new Set();
  const categoryIds = new Set();
  const subServiceIds = new Set();

  const serviceName = normalize(b2bJob?.service);
  const subServiceName = normalize(b2bJob?.subService);

  const hasService = Boolean(serviceName || subServiceName);
  if (serviceName) names.add(serviceName);
  if (subServiceName) names.add(subServiceName);

  if (!hasService) {
    return { categoryIds, subServiceIds, names, skillNames, resolved: false, hasService: false };
  }

  const searchTerms = [serviceName, subServiceName].filter(Boolean);

  // ── Catalog categories ────────────────────────────────────────────────
  const categories = await ServiceCategory.find({
    $or: searchTerms.flatMap((term) => [
      { name: new RegExp(`^${escapeRegex(term)}$`, 'i') },
      { slug: term.replace(/\s+/g, '-') }
    ])
  })
    .select('_id name slug categoryCode')
    .lean();

  categories.forEach((cat) => {
    categoryIds.add(toId(cat._id));
    if (cat.name) names.add(normalize(cat.name));
    if (cat.slug) names.add(normalize(cat.slug.replace(/-/g, ' ')));
    // Pull in the legacy aliases for this category code (HVAC → C14, etc.)
    if (cat.categoryCode && LEGACY_ALIAS_MAP[cat.categoryCode]) {
      LEGACY_ALIAS_MAP[cat.categoryCode].forEach((alias) => names.add(normalize(alias)));
    }
  });

  // ── Reverse alias lookup: "HVAC" → C14 → that category's real name ────
  for (const [code, aliases] of Object.entries(LEGACY_ALIAS_MAP)) {
    const aliasHit = aliases.some((alias) =>
      searchTerms.some((term) => normalize(alias) === term)
    );
    if (!aliasHit) continue;
    aliases.forEach((alias) => names.add(normalize(alias)));
    const aliasCats = await ServiceCategory.find({ categoryCode: code })
      .select('_id name slug')
      .lean();
    aliasCats.forEach((cat) => {
      categoryIds.add(toId(cat._id));
      if (cat.name) names.add(normalize(cat.name));
    });
  }

  // ── Sub-services carry the authoritative requiredSkills list ──────────
  const subServiceFilter = [
    ...searchTerms.map((term) => ({ name: new RegExp(`^${escapeRegex(term)}$`, 'i') })),
    ...(categoryIds.size ? [{ categoryId: { $in: [...categoryIds] } }] : [])
  ];

  if (subServiceFilter.length) {
    const subServices = await SubService.find({ $or: subServiceFilter, isActive: true })
      .select('_id name slug categoryId requiredSkills')
      .lean();

    subServices.forEach((sub) => {
      subServiceIds.add(toId(sub._id));
      if (sub.name) names.add(normalize(sub.name));
      if (sub.categoryId) categoryIds.add(toId(sub.categoryId));
      (sub.requiredSkills || []).forEach((skill) => {
        if (isMeaningful(skill)) skillNames.add(normalize(skill));
      });
    });
  }

  // ── Named skills in the Skill catalog ─────────────────────────────────
  const skills = await Skill.find({
    isActive: true,
    $or: [
      ...searchTerms.map((term) => ({ name: new RegExp(`^${escapeRegex(term)}$`, 'i') })),
      ...(categoryIds.size ? [{ categoryId: { $in: [...categoryIds] } }] : [])
    ]
  })
    .select('name')
    .lean();

  skills.forEach((s) => {
    if (isMeaningful(s.name)) skillNames.add(normalize(s.name));
  });

  const resolved = categoryIds.size > 0 || subServiceIds.size > 0 || skillNames.size > 0;

  return { categoryIds, subServiceIds, names, skillNames, resolved, hasService: true };
};

/** Every service/skill identifier an engineer is registered against. */
const collectEngineerNames = (engineer) => {
  const out = new Set();

  (engineer.serviceCategories || []).forEach((c) => out.add(normalize(c)));
  (engineer.secondarySkills || []).forEach((s) => out.add(normalize(s)));
  if (engineer.primaryCategory) out.add(normalize(engineer.primaryCategory));
  if (engineer.primarySkill) out.add(normalize(engineer.primarySkill));

  (engineer.subServices || []).forEach((sub) => {
    if (sub?.name) out.add(normalize(sub.name));
    (sub?.skills || []).forEach((s) => out.add(normalize(s)));
    (sub?.customSkills || []).forEach((cs) => {
      // Only approved custom skills count toward eligibility.
      if (cs?.status === 'approved' && cs?.name) out.add(normalize(cs.name));
    });
  });

  out.delete('');
  return out;
};

const collectEngineerSubServiceIds = (engineer) => {
  const out = new Set();
  (engineer.subServices || []).forEach((sub) => {
    const id = toId(sub?.subServiceId);
    if (id) out.add(id);
  });
  return out;
};

const collectEngineerSkillIds = (engineer) => {
  const out = new Set();
  (engineer.skills || []).forEach((s) => {
    const id = toId(s);
    if (id) out.add(id);
  });
  return out;
};

const hasAnyRegisteredSkill = (engineer) =>
  (engineer.serviceCategories || []).length > 0 ||
  (engineer.subServices || []).length > 0 ||
  (engineer.secondarySkills || []).length > 0 ||
  (engineer.skills || []).length > 0 ||
  Boolean(engineer.primarySkill) ||
  Boolean(engineer.primaryCategory);

/**
 * MANDATORY skill gate.
 *
 * @returns {{ eligible:boolean, reason:string }}
 */
const engineerMatchesJob = (engineer, context) => {
  // STRICT: an offer only goes out when the engineer's skills match the service
  // being requested. A job with no identifiable service is NOT broadcast to
  // everyone — that previously let an unskilled/unrelated engineer receive work
  // they cannot do. Such a job is left unmatched so it escalates and the service
  // data gets corrected, rather than being mis-assigned.
  if (!context || !context.hasService) {
    return { eligible: false, reason: 'job_has_no_service' };
  }

  if (!hasAnyRegisteredSkill(engineer)) {
    return { eligible: false, reason: 'engineer_has_no_skills' };
  }

  // 1. Sub-service id match — strongest signal.
  const engineerSubIds = collectEngineerSubServiceIds(engineer);
  for (const id of engineerSubIds) {
    if (context.subServiceIds.has(id)) {
      return { eligible: true, reason: 'sub_service_match' };
    }
  }

  // 2. Skill catalog id match.
  const engineerSkillIds = collectEngineerSkillIds(engineer);
  for (const id of engineerSkillIds) {
    if (context.categoryIds.has(id)) {
      return { eligible: true, reason: 'skill_category_match' };
    }
  }

  // 3. Name / alias overlap against the job's service and required skills.
  const engineerNames = collectEngineerNames(engineer);
  if (namesOverlap(engineerNames, context.skillNames)) {
    return { eligible: true, reason: 'required_skill_match' };
  }
  if (namesOverlap(engineerNames, context.names)) {
    return { eligible: true, reason: 'service_name_match' };
  }

  return { eligible: false, reason: 'skill_mismatch' };
};

/** Engineer works today (or is emergency-capable, which overrides schedule). */
const isOnScheduleToday = (engineer, now = new Date()) => {
  if (engineer.emergencyService) return true;
  const days = engineer.workingDays || [];
  if (!days.length) return true; // no schedule configured → always available
  const today = DAY_NAMES[now.getDay()];
  return days.some((d) => normalize(d).startsWith(today.slice(0, 3)));
};

/**
 * Live workload per engineer, in one aggregate rather than N queries.
 * @returns {Map<string, number>}
 */
const getActiveJobCounts = async (engineerIds = []) => {
  const counts = new Map();
  if (!engineerIds.length) return counts;

  const rows = await B2BJob.aggregate([
    { $match: { assignedTo: { $in: engineerIds }, status: { $in: ACTIVE_JOB_STATUSES } } },
    { $group: { _id: '$assignedTo', n: { $sum: 1 } } }
  ]);

  rows.forEach((r) => counts.set(r._id.toString(), r.n));
  return counts;
};

/**
 * Open offers per engineer — jobs they have been notified about that nobody has
 * accepted yet. Counted separately from assigned work because an unanswered
 * offer still occupies the engineer's attention and must not be stacked.
 *
 * @returns {Map<string, number>}
 */
const getPendingOfferCounts = async (engineerIds = []) => {
  const counts = new Map();
  if (!engineerIds.length) return counts;

  const rows = await B2BJob.aggregate([
    {
      $match: {
        notifiedEngineers: { $in: engineerIds },
        assignedTo: null,
        status: { $in: ['pending', 'searching_engineer'] },
        // Only jobs still in the ENGINEER phase are live offers. Once a job has
        // moved on to the vendor marketplace or admin escalation the engineer
        // can no longer act on it, so it must not keep occupying their quota —
        // otherwise stale rows permanently lock an engineer out of new work.
        allocationStage: { $in: ['not_started', 'engineer_waves'] }
      }
    },
    { $unwind: '$notifiedEngineers' },
    { $match: { notifiedEngineers: { $in: engineerIds } } },
    // A declined offer no longer occupies the engineer.
    {
      $match: {
        $expr: { $not: { $in: ['$notifiedEngineers', { $ifNull: ['$declinedEngineers', []] }] } }
      }
    },
    { $group: { _id: '$notifiedEngineers', n: { $sum: 1 } } }
  ]);

  rows.forEach((r) => counts.set(r._id.toString(), r.n));
  return counts;
};

/**
 * Resolve the eligible engineer pool for one dispatch wave.
 *
 * Over-fetches from Mongo (geo + hard filters), then applies skill, workload
 * and schedule gates in memory, because skill data is nested and not indexable
 * alongside $nearSphere.
 *
 * @returns {{ engineers:Array, stats:{ scanned:number, skillRejected:number, workloadRejected:number, scheduleRejected:number } }}
 */
const findEligibleEngineersInRadius = async ({
  lng,
  lat,
  radiusKm,
  context,
  excludeIds = [],
  limit = 10,
  vendorId = null
}) => {
  const stats = { scanned: 0, skillRejected: 0, workloadRejected: 0, offerSaturated: 0, scheduleRejected: 0 };

  const query = {
    roleType: { $in: ['Engineer', 'Both'] },
    status: 'ONLINE',
    approvalStatus: 'approved',
    isActive: true,
    geoLocation: {
      $nearSphere: {
        $geometry: { type: 'Point', coordinates: [lng, lat] },
        $maxDistance: radiusKm * 1000
      }
    }
  };

  if (excludeIds.length > 0) {
    query._id = { $nin: excludeIds };
  }

  // A vendor-scoped wave only considers that vendor's approved engineers.
  if (vendorId) {
    query.vendorId = vendorId;
    query.vendorApprovalStatus = { $in: ['approved', 'not_required'] };
  } else {
    // General (non-vendor-scoped) waves are the direct-offer / self-accept
    // pool. A vendor-employed engineer must never receive a direct offer
    // here — their vendor is supposed to receive the request, decide, and
    // assign the job internally. Without this, vendor-employed engineers
    // were indistinguishable from freelancers and could self-accept work
    // their vendor never saw or approved, bypassing the vendor entirely.
    query.$or = [{ engineerType: { $exists: false } }, { engineerType: { $ne: 'vendor_engineer' } }];
  }

  // Over-fetch so skill rejections don't starve the wave.
  const candidates = await Engineer.find(query)
    .select(
      'name phone profilePhoto status isActive approvalStatus vendorId vendorApprovalStatus ' +
        'serviceCategories subServices secondarySkills skills primaryCategory primarySkill ' +
        'workingDays workingHours emergencyService availability geoLocation location'
    )
    .limit(limit * 6)
    .lean();

  stats.scanned = candidates.length;
  if (!candidates.length) return { engineers: [], stats };

  const skilled = [];
  for (const eng of candidates) {
    const match = engineerMatchesJob(eng, context);
    if (!match.eligible) {
      stats.skillRejected += 1;
      continue;
    }
    if (!isOnScheduleToday(eng)) {
      stats.scheduleRejected += 1;
      continue;
    }
    eng.__matchReason = match.reason;
    skilled.push(eng);
  }

  if (!skilled.length) return { engineers: [], stats };

  const ids = skilled.map((e) => e._id);
  const [activeCounts, offerCounts] = await Promise.all([
    getActiveJobCounts(ids),
    getPendingOfferCounts(ids)
  ]);

  const available = skilled.filter((eng) => {
    const key = eng._id.toString();
    const active = activeCounts.get(key) || 0;
    const openOffers = offerCounts.get(key) || 0;

    // Saturated on either axis: real work in hand, or offers already waiting.
    if (active >= MAX_ACTIVE_JOBS_PER_ENGINEER) {
      stats.workloadRejected += 1;
      return false;
    }
    if (openOffers >= MAX_PENDING_OFFERS_PER_ENGINEER) {
      stats.offerSaturated += 1;
      return false;
    }

    eng.__activeJobs = active;
    eng.__openOffers = openOffers;
    return true;
  });

  // $nearSphere already returns nearest-first; prefer the least-loaded among
  // them (assigned work + open offers) so a bulk batch spreads across the pool
  // instead of stacking on whoever happens to be closest.
  available.sort(
    (a, b) =>
      (a.__activeJobs + a.__openOffers) - (b.__activeJobs + b.__openOffers)
  );

  return { engineers: available.slice(0, limit), stats };
};

/**
 * Find vendors with at least one skilled, online engineer within radius —
 * used to route a job to the VENDOR (who then chooses which of its own
 * engineers to assign) instead of offering it to that engineer directly.
 *
 * Deliberately reuses the exact same skill-matching logic as the freelancer
 * wave (engineerMatchesJob) rather than the separate ServiceConfig-based
 * category resolver used for generic marketplace opportunities elsewhere —
 * that resolver can route a job to unrelated vendors when a service name
 * isn't registered in its own catalog. Vendor eligibility here can never
 * disagree with which engineers are actually being matched.
 *
 * @returns {{ vendorIds: ObjectId[], byVendor: Map<string, Array>, stats: Object }}
 */
const findEligibleVendorsInRadius = async ({
  lng,
  lat,
  radiusKm,
  context,
  excludeVendorIds = [],
  limit = 20
}) => {
  const stats = { scanned: 0, skillRejected: 0, scheduleRejected: 0 };

  const query = {
    roleType: { $in: ['Engineer', 'Both'] },
    status: 'ONLINE',
    approvalStatus: 'approved',
    isActive: true,
    engineerType: 'vendor_engineer',
    vendorId: { $ne: null },
    vendorApprovalStatus: { $in: ['approved', 'not_required'] },
    geoLocation: {
      $nearSphere: {
        $geometry: { type: 'Point', coordinates: [lng, lat] },
        $maxDistance: radiusKm * 1000
      }
    }
  };

  const validExcludeIds = (excludeVendorIds || []).filter((id) => mongoose.Types.ObjectId.isValid(id));
  if (validExcludeIds.length) {
    query.vendorId = { $nin: validExcludeIds };
  }

  const candidates = await Engineer.find(query)
    .select(
      'name phone vendorId status isActive approvalStatus vendorApprovalStatus ' +
        'serviceCategories subServices secondarySkills skills primaryCategory primarySkill ' +
        'workingDays workingHours emergencyService geoLocation'
    )
    .limit(limit * 8)
    .lean();

  stats.scanned = candidates.length;

  const byVendor = new Map();
  for (const eng of candidates) {
    const match = engineerMatchesJob(eng, context);
    if (!match.eligible) {
      stats.skillRejected += 1;
      continue;
    }
    if (!isOnScheduleToday(eng)) {
      stats.scheduleRejected += 1;
      continue;
    }

    const vId = eng.vendorId ? eng.vendorId.toString() : null;
    if (!vId) continue;
    if (!byVendor.has(vId)) byVendor.set(vId, []);
    byVendor.get(vId).push({ engineerId: eng._id, name: eng.name, matchReason: match.reason });
  }

  const vendorIds = [...byVendor.keys()].slice(0, limit).map((id) => new mongoose.Types.ObjectId(id));
  return { vendorIds, byVendor, stats };
};

module.exports = {
  buildB2BJobSkillContext,
  engineerMatchesJob,
  findEligibleEngineersInRadius,
  findEligibleVendorsInRadius,
  isOnScheduleToday,
  getActiveJobCounts,
  getPendingOfferCounts,
  collectEngineerNames,
  namesOverlap,
  MAX_ACTIVE_JOBS_PER_ENGINEER,
  MAX_PENDING_OFFERS_PER_ENGINEER,
  ACTIVE_JOB_STATUSES
};
