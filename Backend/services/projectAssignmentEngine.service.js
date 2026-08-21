/**
 * TazkY Enterprise — Project Assignment Engine
 * Vendor queue (location + service + capacity) → notify → accept/reject/timeout → freelancer pool
 */
const mongoose = require('mongoose');
const Opportunity = require('../models/Opportunity');
const Vendor = require('../models/Vendor');
const Engineer = require('../models/Engineer');
const ServiceRequest = require('../models/ServiceRequest');
const ProjectAssignmentConfig = require('../models/ProjectAssignmentConfig');
const VendorOpsJob = require('../models/VendorOpsJob');
const VendorOpsProject = require('../models/VendorOpsProject');
const { createOpsProjectFromOpportunity } = require('../utils/createOpsProjectFromOpportunity');
const {
  expandCategoryMatchCodes,
  buildLegacyCategoryMatchers
} = require('../utils/serviceCategoryAliases');
const { calculateDistance } = require('./locationService');
const { projectAssignmentQueue } = require('../jobs/queueSetup');
const { sendNotificationToEngineer, sendNotificationToUser } = require('./firebaseAdmin');

const DEFAULT_TIMELINE = [
  { key: 'project_created', label: 'Project Created' },
  { key: 'vendor_notified', label: 'Vendor Notified' },
  { key: 'vendor_reviewing', label: 'Vendor Reviewing' },
  { key: 'vendor_accepted', label: 'Vendor Accepted' },
  { key: 'engineer_assigned', label: 'Engineer Assigned' },
  { key: 'completed', label: 'Completed' }
];

const pushTimeline = (opportunity, key, label, meta = {}) => {
  if (!opportunity.assignment) opportunity.assignment = {};
  if (!Array.isArray(opportunity.assignment.timeline)) opportunity.assignment.timeline = [];
  const exists = opportunity.assignment.timeline.some((t) => t.key === key);
  if (exists) return;
  opportunity.assignment.timeline.push({ key, label, at: new Date(), meta });
};

/**
 * Flowchart gate: Team Size / Can Complete / Timeline / Resources before award.
 * Accepts body from freelancer-pool or ops-job accept.
 */
const parseEngineerConfirmation = (body = {}, requiredEngineers = 1) => {
  const availableTeamSize = parseInt(
    body.availableTeamSize ?? body.teamSize ?? body.availableTeam,
    10
  );
  const truthy = (v) => v === true || v === 'true' || v === 1 || v === '1' || v === 'yes';
  const canComplete = truthy(body.canComplete);
  const canMeetTimeline = truthy(body.canMeetTimeline);
  const hasResources = truthy(body.hasResources);
  const estimatedRaw = body.estimatedDays ?? body.timelineDays;
  const estimatedDays =
    estimatedRaw != null && estimatedRaw !== '' ? Number(estimatedRaw) : null;
  const notes = String(body.confirmationNotes || body.notes || '').slice(0, 500);

  if (!canComplete || !canMeetTimeline || !hasResources) {
    return {
      ok: false,
      status: 400,
      message:
        'Confirm you can complete the work, meet the timeline, and have the required resources/team'
    };
  }
  if (!availableTeamSize || availableTeamSize < requiredEngineers) {
    return {
      ok: false,
      status: 400,
      message: `You need at least ${requiredEngineers} engineer(s) available to accept this project`
    };
  }

  return {
    ok: true,
    confirmation: {
      availableTeamSize,
      canComplete: true,
      canMeetTimeline: true,
      hasResources: true,
      estimatedDays: Number.isFinite(estimatedDays) && estimatedDays > 0 ? estimatedDays : null,
      notes,
      confirmedAt: new Date()
    }
  };
};

const getAssignmentConfig = async (categoryCode) => {
  const code = String(categoryCode || 'DEFAULT').toUpperCase();
  let cfg = await ProjectAssignmentConfig.findOne({ categoryCode: code, isActive: true }).lean();
  if (!cfg) {
    cfg = await ProjectAssignmentConfig.findOne({ categoryCode: 'DEFAULT', isActive: true }).lean();
  }
  if (!cfg) {
    cfg = {
      categoryCode: 'DEFAULT',
      vendorResponseTimeoutMinutes: 120,
      maxVendorsToNotify: 10,
      vendorRetryCount: 3,
      vendorBatchSize: 3,
      priorityMode: 'vendor_then_freelancer',
      releaseToFreelancerOnVendorExhausted: true,
      freelancerPoolTimeoutMinutes: 120,
      scoringWeights: { location: 30, service: 25, capacity: 20, rating: 15, responseScore: 10 }
    };
  }
  if (cfg.vendorBatchSize == null) cfg.vendorBatchSize = 3;
  if (!cfg.freelancerPoolVendorId && process.env.FREELANCER_POOL_VENDOR_ID) {
    cfg = { ...cfg, freelancerPoolVendorId: process.env.FREELANCER_POOL_VENDOR_ID };
  }
  return cfg;
};

const normalizeCity = (c) => String(c || '').trim().toLowerCase();

/** Small Levenshtein for city typos (e.g. Inodre ↔ Indore). */
const editDistance = (a, b) => {
  const s = String(a || '');
  const t = String(b || '');
  if (s === t) return 0;
  if (!s.length) return t.length;
  if (!t.length) return s.length;
  const rows = Array.from({ length: s.length + 1 }, (_, i) => i);
  for (let j = 1; j <= t.length; j += 1) {
    let prev = rows[0];
    rows[0] = j;
    for (let i = 1; i <= s.length; i += 1) {
      const cur = rows[i];
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      rows[i] = Math.min(rows[i] + 1, rows[i - 1] + 1, prev + cost);
      prev = cur;
    }
  }
  return rows[s.length];
};

const citiesFuzzyMatch = (a, b) => {
  const left = normalizeCity(a);
  const right = normalizeCity(b);
  if (!left || !right) return false;
  if (left === right || left.includes(right) || right.includes(left)) return true;
  const maxLen = Math.max(left.length, right.length);
  if (maxLen < 4) return false;
  const allowed = maxLen >= 6 ? 2 : 1;
  return editDistance(left, right) <= allowed;
};

const vendorCoverageCities = (vendor) =>
  [
    ...(vendor.operatingCities || []),
    ...(vendor.operationalCities || []),
    vendor.address?.city,
    vendor.location?.city
  ].filter(Boolean);

const hasValidGeo = (vendor) => {
  const coords = vendor?.geoLocation?.coordinates;
  if (!Array.isArray(coords) || coords.length !== 2) return false;
  const [lng, lat] = coords.map(Number);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return false;
  // Reject null-island / unset placeholders
  if (lng === 0 && lat === 0) return false;
  return true;
};

const vendorCoversCity = (vendor, city) => {
  const target = normalizeCity(city);
  if (!target) return true;
  const lists = vendorCoverageCities(vendor);
  // Coverage not configured → do not hard-exclude (match by service; rank by other scores)
  if (!lists.length) return true;
  return lists.some((c) => citiesFuzzyMatch(c, target));
};

/** True only when vendor has an explicit city list that fuzzy-matches the site. */
const vendorExplicitlyCoversCity = (vendor, city) => {
  const target = normalizeCity(city);
  if (!target) return false;
  const lists = vendorCoverageCities(vendor);
  if (!lists.length) return false;
  return lists.some((c) => citiesFuzzyMatch(c, target));
};

const vendorInGeoRange = (vendor, coords) => {
  if (!coords || !hasValidGeo(vendor)) return false;
  const dist = calculateDistance(coords, {
    lat: vendor.geoLocation.coordinates[1],
    lng: vendor.geoLocation.coordinates[0]
  });
  const range = vendor.settings?.serviceRange || 250;
  return dist <= range;
};

const normSubToken = (s) => String(s || '').trim().toUpperCase();

const vendorSubMatches = (token, subCatCode) => {
  const want = normSubToken(subCatCode);
  const got = normSubToken(token);
  if (!want || !got) return false;
  return got === want || got.includes(want) || want.includes(got);
};

/**
 * Category match required. Sub-service match accepts code OR display name
 * (vendors often store names like "Wheelchair & Mobility Aid Repair", not C10-02).
 */
const vendorHasService = (vendor, matchCodes, subCatCode, subNames = []) => {
  const codes = (matchCodes || []).map((c) => String(c).toUpperCase());
  const approvedRows = (vendor.approvedServices || []).filter(
    (s) => codes.includes(String(s.categoryCode || '').toUpperCase()) && ['active', 'pending'].includes(s.status)
  );
  const legacy = (vendor.categories || []).some((c) => codes.includes(String(c).toUpperCase()));
  if (!approvedRows.length && !legacy) return false;

  const names = (Array.isArray(subNames) ? subNames : [subNames]).map(normSubToken).filter(Boolean);
  if (!subCatCode && !names.length) return true;

  const fromApproved = approvedRows.flatMap((s) => s.subServices || []);
  const flatSubs = [
    ...fromApproved,
    ...(vendor.subServices || []),
    ...(vendor.approvedSubServices || [])
  ];
  if (!flatSubs.length) return legacy || approvedRows.length > 0;

  return flatSubs.some((s) => {
    const token =
      s && typeof s === 'object' ? s.subCatCode || s.code || s.name || s.subCatName : s;
    if (subCatCode && vendorSubMatches(token, subCatCode)) return true;
    const got = normSubToken(token);
    if (!got) return false;
    return names.some((n) => got === n || got.includes(n) || n.includes(got));
  });
};

const scoreVendor = (vendor, ctx, weights) => {
  let score = 0;
  const w = weights || {};

  if (ctx.city && vendorExplicitlyCoversCity(vendor, ctx.city)) score += w.location || 30;
  else if (ctx.coords && vendorInGeoRange(vendor, ctx.coords)) {
    const dist = calculateDistance(ctx.coords, {
      lat: vendor.geoLocation.coordinates[1],
      lng: vendor.geoLocation.coordinates[0]
    });
    const range = vendor.settings?.serviceRange || 250;
    score += Math.max(0, (w.location || 30) * (1 - dist / (range * 2)));
  }

  if (vendorHasService(vendor, ctx.matchCodes, ctx.subCatCode, ctx.subNames)) {
    score += w.service || 25;
  }

  const team = Number(vendor.teamSize) || (vendor.teamEngineers?.length || 0) || 1;
  const cap = Number(vendor.maxCapacity) || 99;
  const required = ctx.requiredEngineers || 1;
  if (team >= required && cap > 0) score += w.capacity || 20;

  const rating = Number(vendor.rating) || 0;
  score += Math.min(w.rating || 15, (rating / 5) * (w.rating || 15));

  const responseScore = Number(vendor.responseScore) || 0;
  score += Math.min(w.responseScore || 10, responseScore);

  return Math.round(score * 100) / 100;
};

/**
 * Rank eligible vendors for an opportunity.
 * Prefer coverage match; if coverage would empty the queue, fall back to category/sub-service vendors.
 */
const buildVendorQueue = async (opportunity, config) => {
  const categoryCode = opportunity.categoryCode;
  const city =
    opportunity.assignment?.siteLocation?.city ||
    opportunity.requirements?.cities?.[0] ||
    opportunity.clientInfo?.city ||
    '';
  const rawCoords = opportunity.assignment?.siteLocation?.coordinates?.coordinates;
  const coords =
    Array.isArray(rawCoords) &&
    rawCoords.length === 2 &&
    !(Number(rawCoords[0]) === 0 && Number(rawCoords[1]) === 0)
      ? { lat: Number(rawCoords[1]), lng: Number(rawCoords[0]) }
      : null;

  const codes = await expandCategoryMatchCodes([categoryCode]);
  const vendors = await Vendor.find({
    approvalStatus: 'approved',
    $and: [
      { $or: [{ isActive: true }, { isActive: { $exists: false } }, { isActive: null }] },
      {
        $or: [
          {
            approvedServices: {
              $elemMatch: { categoryCode: { $in: codes }, status: { $in: ['active', 'pending'] } }
            }
          },
          { categories: { $in: buildLegacyCategoryMatchers(codes) } }
        ]
      }
    ]
  })
    .select(
      'businessName operatingCities operationalCities address location geoLocation settings teamSize maxCapacity teamEngineers approvedServices categories subServices rating responseScore'
    )
    .lean();

  const subNames = Array.isArray(opportunity.subServices) ? opportunity.subServices : [];
  const ctx = {
    categoryCode,
    matchCodes: codes,
    subCatCode: opportunity.assignment?.subCatCode || '',
    subNames,
    city,
    coords,
    requiredEngineers: opportunity.assignment?.requiredEngineers || 1
  };

  const scoredAll = vendors.map((v) => ({
    vendorId: v._id,
    score: scoreVendor(v, ctx, config.scoringWeights),
    coversCity: vendorCoversCity(v, city),
    inGeoRange: vendorInGeoRange(v, coords),
    hasService: vendorHasService(v, codes, ctx.subCatCode, subNames),
    hasCategory: vendorHasService(v, codes, '', []),
    businessName: v.businessName || v.name || '',
    vendor: v
  }));

  const notifyCap = Math.min(
    config.maxVendorsToNotify || 10,
    config.vendorRetryCount != null ? Math.max(1, config.vendorRetryCount) : config.maxVendorsToNotify || 10
  );

  const byScore = (a, b) => b.score - a.score;
  const toQueue = (rows) =>
    rows.slice(0, notifyCap).map((row, idx) => ({
      vendorId: row.vendorId,
      rank: idx + 1,
      score: row.score,
      status: 'pending'
    }));

  const coverageMatched = scoredAll
    .filter((row) => row.score > 0)
    .filter((row) => !city || row.coversCity || row.inGeoRange)
    .sort(byScore);

  if (coverageMatched.length) {
    console.info('[buildVendorQueue]', {
      opportunityId: String(opportunity._id),
      categoryCode,
      subCatCode: ctx.subCatCode,
      city: city || null,
      candidates: vendors.length,
      coverageMatched: coverageMatched.length,
      mode: 'coverage'
    });
    return toQueue(coverageMatched);
  }

  // Coverage empty but category vendors exist → still notify (coverage soft when data incomplete/typo)
  const categoryFallback = scoredAll
    .filter((row) => row.hasCategory && row.score > 0)
    .sort((a, b) => {
      if (a.hasService !== b.hasService) return a.hasService ? -1 : 1;
      return b.score - a.score;
    });

  if (categoryFallback.length) {
    console.warn('[buildVendorQueue] coverage empty — falling back to category/sub-service vendors', {
      opportunityId: String(opportunity._id),
      categoryCode,
      subCatCode: ctx.subCatCode,
      city: city || null,
      candidates: vendors.length,
      fallbackCount: categoryFallback.length,
      sample: categoryFallback.slice(0, 5).map((r) => ({
        name: r.businessName,
        coversCity: r.coversCity,
        hasService: r.hasService,
        score: r.score
      }))
    });
    return toQueue(categoryFallback);
  }

  console.warn('[buildVendorQueue] no vendors matched', {
    opportunityId: String(opportunity._id),
    categoryCode,
    matchCodes: codes,
    subCatCode: ctx.subCatCode,
    city: city || null,
    candidates: vendors.length,
    hint:
      vendors.length === 0
        ? 'No approved vendors with this categoryCode/aliases in approvedServices or categories'
        : 'Vendors found but score was 0 (check capacity/status)'
  });

  return [];
};

const emitVendorOpportunity = async (vendorId, payload) => {
  try {
    if (global.io) {
      global.io.to(`vendor:${vendorId}`).emit('opportunity:new', payload);
      global.io.to(`vendor:${vendorId}`).emit('assignment:vendor_turn', payload);
      global.io.to(`vendor_${vendorId}`).emit('opportunity:new', payload);
      global.io.to(`vendor_${vendorId}`).emit('assignment:vendor_turn', payload);
    }
  } catch (e) {
    console.warn('[assignmentEngine] socket emit failed', e.message);
  }
  try {
    const { dispatchVendorOpportunity } = require('./marketplaceNotify.service');
    await dispatchVendorOpportunity(vendorId, payload);
  } catch (e) {
    console.warn('[assignmentEngine] vendor notify failed', e.message);
  }
};

/**
 * Mirror the opportunity's allocation phase onto the source B2B job so the
 * company panel can distinguish "waiting on vendors" from "nothing happening".
 */
const markB2BAllocationStage = async (opportunity, stage, reason = null, meta = {}) => {
  const b2bJobId = opportunity?.assignment?.b2bJobId;
  if (!b2bJobId) return;
  try {
    const B2BJob = require('../models/B2BJob');
    await B2BJob.updateOne(
      { _id: b2bJobId },
      {
        $set: {
          allocationStage: stage,
          allocationReason: reason ? String(reason).slice(0, 300) : null,
          allocationUpdatedAt: new Date()
        }
      }
    );

    if (global.io) {
      global.io.to(`b2b:${String(opportunity.assignment.b2bCompanyId || '')}`).emit('b2b:jobAllocationStage', {
        jobId: String(b2bJobId),
        stage,
        reason,
        ...meta
      });
    }
  } catch (err) {
    console.warn('[assignment] B2B allocation stage update failed:', err.message);
  }
};

/** Internal failure keys are useless to a company reading its job list. */
const ESCALATION_MESSAGES = {
  no_vendors_matched: 'No approved vendor covers this service in this city yet',
  vendor_queue_exhausted: 'Every matched vendor declined or did not respond in time',
  freelancer_pool_timeout: 'No vendor or freelance engineer accepted the job within the SLA',
  freelancer_only_mode: 'No freelance engineer accepted the job within the SLA',
  stalled_allocation_repair: 'Allocation stalled and was closed out — retry matching or contact support',
  assignment_failed: 'Allocation could not be completed'
};

const describeEscalation = (reason) =>
  ESCALATION_MESSAGES[reason] || String(reason || 'Allocation could not be completed');

/**
 * Terminal escalation for a B2B-sourced opportunity: park the job for admin,
 * return the held escrow and leave an auditable trail on both sides.
 */
const escalateB2BJobForOpportunity = async (opportunity, reason) => {
  const b2bJobId = opportunity?.assignment?.b2bJobId;
  if (!b2bJobId) return;

  const B2BJob = require('../models/B2BJob');
  const job = await B2BJob.findById(b2bJobId);
  if (!job) return;
  if (['completed', 'closed', 'cancelled', 'escalated'].includes(job.status)) return;

  const message = describeEscalation(reason);
  job.status = 'escalated';
  job.allocationStage = 'admin_escalation';
  job.allocationReason = message.slice(0, 300);
  job.allocationUpdatedAt = new Date();
  await job.save();

  try {
    const { refundB2BJobEscrow } = require('./escrowReleaseEngine.service');
    await refundB2BJobEscrow({ jobId: job._id, reason: `assignment_escalated:${reason}` });
  } catch (err) {
    console.warn('[assignment] B2B escrow refund on escalation failed:', err.message);
  }

  try {
    const JobHistory = require('../models/JobHistory');
    await JobHistory.create({
      jobId: job._id,
      status: 'escalated',
      remark: `${message} (${reason}). Escalated to admin; escrow returned to wallet.`,
      role: 'system'
    });
  } catch (_) {
    /* non-blocking */
  }

  try {
    const EnterpriseProjectFlow = require('../models/EnterpriseProjectFlow');
    await EnterpriseProjectFlow.updateOne(
      { b2bJobId: job._id },
      {
        $set: { status: 'admin_escalation' },
        $push: {
          timeline: {
            key: 'admin_escalation',
            label: `Assignment failed: ${reason}`,
            at: new Date(),
            meta: { reason, opportunityId: opportunity._id }
          }
        }
      }
    );
  } catch (_) {
    /* non-blocking */
  }

  try {
    if (global.io) {
      global.io.to(`b2b:${String(job.companyId)}`).emit('b2b:jobEscalated', {
        jobId: job.jobId,
        mongoId: String(job._id),
        reason: message
      });
      global.io.to('admin-room').emit('admin:b2bJobEscalated', {
        jobId: job.jobId,
        mongoId: String(job._id),
        companyId: String(job.companyId),
        service: job.service,
        city: job.city,
        reason,
        message
      });
    }
  } catch (_) {
    /* non-blocking */
  }

  console.warn('[assignment] B2B job escalated to admin', { jobId: job.jobId, reason });
};

const handleAssignmentFailure = async (opportunity, reason = 'assignment_failed') => {
  if (!opportunity) return;
  if (opportunity.status === 'awarded' || opportunity.status === 'cancelled') return;

  try {
    const { onAssignmentEscalation } = require('./enterpriseB2BOrchestrator.service');
    const config = opportunity.assignment?.configSnapshot || {};
    if (config.releaseToFreelancerOnVendorExhausted === false && reason !== 'no_vendors_matched') {
      await onAssignmentEscalation(opportunity._id, reason);
    }
  } catch (_) {}

  opportunity.status = 'cancelled';
  opportunity.assignment.phase = 'expired';
  pushTimeline(opportunity, 'expired', 'Assignment could not be completed', { reason });
  await opportunity.save();
  emitUserTimeline(opportunity, 'We could not match a provider — a refund will be processed if payment was held');

  const srId = opportunity.assignment?.serviceRequestId;
  if (srId) {
    try {
      const { refundEscrowOnAssignmentFailure } = require('./serviceRequestPayment.service');
      await refundEscrowOnAssignmentFailure(srId, { reason, opportunityId: opportunity._id });
    } catch (err) {
      console.error('[assignment] escrow refund failed:', err.message);
    }
  }

  try {
    await escalateB2BJobForOpportunity(opportunity, reason);
  } catch (err) {
    console.error('[assignment] B2B escalation failed:', err.message);
  }
};

const emitUserTimeline = async (opportunity, pushLabel) => {
  try {
    if (global.io && opportunity.assignment?.serviceRequestId) {
      global.io.emit(`service-request:${opportunity.assignment.serviceRequestId}`, {
        opportunityId: opportunity._id,
        phase: opportunity.assignment.phase,
        timeline: opportunity.assignment.timeline
      });
    }
    if (pushLabel && opportunity.assignment?.serviceRequestId) {
      const sr = await ServiceRequest.findById(opportunity.assignment.serviceRequestId)
        .select('userId requestCode')
        .lean();
      if (sr?.userId) {
        await sendNotificationToUser(sr.userId, {
          title: 'Project update',
          body: pushLabel,
          data: {
            type: 'project_assignment',
            requestCode: sr.requestCode || '',
            opportunityId: String(opportunity._id)
          }
        });
        try {
          const { dispatchUserProjectTimeline } = require('./marketplaceNotify.service');
          await dispatchUserProjectTimeline({
            userId: sr.userId,
            serviceRequestId: sr._id,
            opportunityId: opportunity._id,
            message: pushLabel
          });
        } catch (_) {}
      }
    }
  } catch (e) {
    /* non-blocking */
  }
};

const resolveFreelancerPoolVendorId = async (configSnapshot) => {
  if (configSnapshot?.freelancerPoolVendorId) return configSnapshot.freelancerPoolVendorId;
  if (process.env.FREELANCER_POOL_VENDOR_ID) return process.env.FREELANCER_POOL_VENDOR_ID;
  const cfg = await ProjectAssignmentConfig.findOne({ categoryCode: 'DEFAULT', isActive: true })
    .select('freelancerPoolVendorId')
    .lean();
  return cfg?.freelancerPoolVendorId || null;
};

const createFreelancerOpsProjectAndJob = async (opportunity, engineer, teamSize) => {
  const config = opportunity.assignment?.configSnapshot || (await getAssignmentConfig(opportunity.categoryCode));
  const poolVendorId = await resolveFreelancerPoolVendorId(config);
  if (!poolVendorId) {
    return { project: null, job: null, warning: 'FREELANCER_POOL_VENDOR_ID not configured' };
  }

  const amount = opportunity.budget?.max || opportunity.budget?.min || 0;
  const project = await createOpsProjectFromOpportunity(opportunity, poolVendorId, amount);

  const job = await VendorOpsJob.create({
    vendorId: project.vendorId,
    projectId: project._id,
    opportunityId: opportunity._id,
    engineerId: engineer._id,
    engineerName: engineer.name || engineer.fullName || '',
    title: project.title,
    clientName: project.clientName,
    clientPhone: opportunity.clientInfo?.phone || '',
    city: project.city,
    address: opportunity.requirements?.description || '',
    serviceCategoryCode: project.serviceCategoryCode,
    serviceCategoryName: project.serviceCategoryName,
    budget: project.budget,
    priority: project.priority,
    notes: `Freelancer pool accept — team size ${teamSize}`,
    scheduledAt: project.startDate || null,
    status: 'accepted',
    assignedAt: new Date(),
    respondedAt: new Date()
  });

  await VendorOpsProject.updateOne(
    { _id: project._id },
    {
      $set: {
        status: 'in_progress',
        currentStage: 'Engineer Assigned',
        assignedEngineers: [{
          name: job.engineerName,
          role: 'Freelancer Lead',
          status: 'accepted',
          engineerId: engineer._id
        }]
      }
    }
  );

  return { project, job, warning: null };
};

const findMatchingFreelancers = async (opportunity) => {
  const codes = await expandCategoryMatchCodes([opportunity.categoryCode]);
  const subCatCode = opportunity.assignment?.subCatCode || '';
  const subName = (opportunity.subServices && opportunity.subServices[0]) || '';
  const baseQuery = {
    engineerType: 'freelancer',
    approvalStatus: 'approved',
    status: { $in: ['active', 'available', 'online'] }
  };
  // `skills` holds Skill ObjectIds — matching category codes against it throws
  // a CastError and used to abort the whole freelancer fallback.
  const categoryQuery = {
    ...baseQuery,
    $or: [
      { serviceCategories: { $in: codes } },
      { categories: { $in: codes } },
      { secondarySkills: { $in: codes } }
    ]
  };

  let list = await Engineer.find(categoryQuery)
    .select('_id fullName phone engineerType subServices serviceCategories secondarySkills')
    .limit(80)
    .lean();

  if (subCatCode || subName) {
    const filtered = list.filter((eng) => {
      const subs = eng.subServices || [];
      if (!subs.length) return true;
      return subs.some((s) => {
        const name = String(s.name || '').toUpperCase();
        const code = String(s.subCatCode || '').toUpperCase();
        const want = String(subCatCode).toUpperCase();
        if (want && (code === want || name.includes(want))) return true;
        if (subName && name && name.includes(String(subName).toUpperCase())) return true;
        return false;
      });
    });
    if (filtered.length) list = filtered;
  }

  if (!list.length) {
    list = await Engineer.find(baseQuery).select('_id fullName phone engineerType').limit(50).lean();
  }
  return list;
};

const scheduleVendorTimeout = async (opportunityId, vendorId, timeoutMinutes) => {
  const delayMs = Math.max(60000, (timeoutMinutes || 120) * 60 * 1000);
  const jobId = `vendor-timeout-${opportunityId}-${vendorId}`;
  try {
    const existing = await projectAssignmentQueue.getJob(jobId);
    if (existing) await existing.remove();
  } catch {
    /* ignore */
  }
  await projectAssignmentQueue.add(
    'vendor-response-timeout',
    { opportunityId: String(opportunityId), vendorId: String(vendorId) },
    { delay: delayMs, jobId, removeOnComplete: true, removeOnFail: 50 }
  );
};

const cancelVendorTimeout = async (opportunityId, vendorId) => {
  const jobId = `vendor-timeout-${opportunityId}-${vendorId}`;
  try {
    const job = await projectAssignmentQueue.getJob(jobId);
    if (job) await job.remove();
  } catch {
    /* ignore */
  }
};

const scheduleFreelancerPoolTimeout = async (opportunityId, timeoutMinutes, { immediate = false } = {}) => {
  const delayMs = immediate ? 0 : Math.max(60000, (timeoutMinutes || 120) * 60 * 1000);
  const jobId = `freelancer-pool-timeout-${opportunityId}`;
  try {
    const existing = await projectAssignmentQueue.getJob(jobId);
    if (existing) await existing.remove();
  } catch {
    /* ignore */
  }
  await projectAssignmentQueue.add(
    'freelancer-pool-timeout',
    { opportunityId: String(opportunityId) },
    { delay: delayMs, jobId, removeOnComplete: true, removeOnFail: 50 }
  );
};

const cancelFreelancerPoolTimeout = async (opportunityId) => {
  const jobId = `freelancer-pool-timeout-${opportunityId}`;
  try {
    const job = await projectAssignmentQueue.getJob(jobId);
    if (job) await job.remove();
  } catch {
    /* ignore */
  }
};

/**
 * The freelancer pool is the last automatic hop. If nobody claims the project
 * within the SLA it must become an admin escalation, otherwise the opportunity
 * stays `open` forever and the source job never leaves "pending".
 */
const handleFreelancerPoolTimeout = async (opportunityId) => {
  const opportunity = await Opportunity.findById(opportunityId);
  if (!opportunity) return null;
  if (opportunity.status !== 'open') return opportunity;
  if (opportunity.assignment?.phase !== 'freelancer_pool') return opportunity;
  if (opportunity.assignment?.freelancerLeadEngineerId) return opportunity;

  await handleAssignmentFailure(opportunity, 'freelancer_pool_timeout');
  return opportunity;
};

/**
 * Start assignment after opportunity is created.
 */
const startAssignmentForOpportunity = async (opportunityId, opts = {}) => {
  const opportunity = await Opportunity.findById(opportunityId);
  if (!opportunity || opportunity.status !== 'open') return null;

  const config = await getAssignmentConfig(opportunity.categoryCode);
  if (!opportunity.assignment) opportunity.assignment = {};

  opportunity.assignment.configSnapshot = config;
  opportunity.assignment.phase = 'project_created';
  opportunity.assignment.requiredEngineers =
    opts.requiredEngineers ||
    Number(opportunity.assignment.requiredEngineers) ||
    Number(opts.formData?.requiredEngineers) ||
    Number(opts.formData?.engineerCount) ||
    1;

  if (opts.serviceRequestId) opportunity.assignment.serviceRequestId = opts.serviceRequestId;
  if (opts.subCatCode) opportunity.assignment.subCatCode = opts.subCatCode;
  if (opts.city || opts.address) {
    opportunity.assignment.siteLocation = opportunity.assignment.siteLocation || {};
    if (opts.city) opportunity.assignment.siteLocation.city = opts.city;
    if (opts.address) opportunity.assignment.siteLocation.address = opts.address;
  }
  if (opts.coordinates?.lat != null && opts.coordinates?.lng != null) {
    opportunity.assignment.siteLocation = opportunity.assignment.siteLocation || {};
    opportunity.assignment.siteLocation.coordinates = {
      type: 'Point',
      coordinates: [opts.coordinates.lng, opts.coordinates.lat]
    };
  }

  pushTimeline(opportunity, 'project_created', 'Project Created');
  opportunity.assignment.vendorQueue = await buildVendorQueue(opportunity, config);
  opportunity.eligibleVendors = opportunity.assignment.vendorQueue.map((q) => q.vendorId);
  opportunity.assignment.currentVendorIndex = -1;
  // Re-match can recover from an earlier empty-queue → freelancer_pool jump
  if (opportunity.assignment.vendorQueue.length) {
    opportunity.assignment.freelancerPoolReleasedAt = null;
    opportunity.assignment.freelancerLeadEngineerId = null;
    await cancelFreelancerPoolTimeout(opportunity._id);
  }

  console.info('[startAssignmentForOpportunity]', {
    opportunityId: String(opportunity._id),
    categoryCode: opportunity.categoryCode,
    subCatCode: opportunity.assignment.subCatCode || null,
    city: opportunity.assignment?.siteLocation?.city || opportunity.clientInfo?.city || null,
    queueSize: opportunity.assignment.vendorQueue.length,
    eligibleCount: opportunity.eligibleVendors.length
  });

  if (config.priorityMode === 'freelancer_only') {
    await opportunity.save();
    return releaseToFreelancerPool(opportunity._id, 'freelancer_only_mode');
  }

  if (!opportunity.assignment.vendorQueue.length) {
    if (config.releaseToFreelancerOnVendorExhausted !== false) {
      await opportunity.save();
      return releaseToFreelancerPool(opportunity._id, 'no_vendors_matched');
    }
    await handleAssignmentFailure(opportunity, 'no_vendors_matched');
    return opportunity;
  }

  await opportunity.save();
  return notifyNextVendor(opportunity._id);
};

/**
 * Broadcast the next batch of ranked vendors (config.vendorBatchSize at a time)
 * simultaneously, instead of a single vendor one-at-a-time. First to accept wins
 * (see onVendorAccepted); the rest of the batch is cancelled once someone does.
 */
const notifyNextVendor = async (opportunityId) => {
  const opportunity = await Opportunity.findById(opportunityId);
  if (!opportunity || opportunity.status !== 'open') return null;
  const queue = opportunity.assignment?.vendorQueue || [];
  const config = opportunity.assignment?.configSnapshot || (await getAssignmentConfig(opportunity.categoryCode));
  const batchSize = Math.max(1, Number(config.vendorBatchSize) || 3);

  const batchIndexes = [];
  for (
    let i = opportunity.assignment.currentVendorIndex + 1;
    i < queue.length && batchIndexes.length < batchSize;
    i += 1
  ) {
    if (['pending', 'timeout', 'rejected'].includes(queue[i].status)) batchIndexes.push(i);
  }

  if (!batchIndexes.length) {
    if (config.releaseToFreelancerOnVendorExhausted !== false) {
      return releaseToFreelancerPool(opportunityId, 'vendor_queue_exhausted');
    }
    await handleAssignmentFailure(opportunity, 'vendor_queue_exhausted');
    return opportunity;
  }

  queue.forEach((q, i) => {
    if (i < batchIndexes[0] && q.status === 'active') {
      q.status = 'skipped';
      q.respondedAt = q.respondedAt || new Date();
    }
  });

  const now = new Date();
  batchIndexes.forEach((i) => {
    queue[i].status = 'active';
    queue[i].notifiedAt = now;
  });
  opportunity.assignment.currentVendorIndex = batchIndexes[batchIndexes.length - 1];
  opportunity.assignment.phase = 'waiting_vendor_acceptance';
  opportunity.assignment.activeVendorUntil = new Date(
    Date.now() + (config.vendorResponseTimeoutMinutes || 120) * 60 * 1000
  );

  pushTimeline(opportunity, 'vendor_notified', 'Vendor Notified', {
    vendorIds: batchIndexes.map((i) => queue[i].vendorId)
  });
  pushTimeline(opportunity, 'vendor_reviewing', 'Vendor Reviewing');

  await opportunity.save();

  const payload = {
    type: 'client_request',
    opportunityId: opportunity._id,
    opportunityCode: opportunity.opportunityCode,
    categoryCode: opportunity.categoryCode,
    categoryName: opportunity.categoryName,
    title: opportunity.title,
    city: opportunity.assignment?.siteLocation?.city || opportunity.clientInfo?.city || '',
    budget: opportunity.budget,
    requiredEngineers: opportunity.assignment?.requiredEngineers || 1,
    timeline: opportunity.requirements?.startDate,
    message: 'New project available — review and accept or reject',
    assignmentPhase: opportunity.assignment.phase
  };

  for (const i of batchIndexes) {
    emitVendorOpportunity(queue[i].vendorId, payload);
    await scheduleVendorTimeout(opportunity._id, queue[i].vendorId, config.vendorResponseTimeoutMinutes);
  }

  emitUserTimeline(opportunity, 'Vendors have been notified about your project');
  await markB2BAllocationStage(
    opportunity,
    'vendor_marketplace',
    `${batchIndexes.length} vendor(s) notified (batch ending at ${batchIndexes[batchIndexes.length - 1] + 1} of ${queue.length})`,
    { batchIndexes, queueSize: queue.length }
  );
  return opportunity;
};

const handleVendorTimeout = async (opportunityId, vendorId) => {
  const opportunity = await Opportunity.findById(opportunityId);
  if (!opportunity || opportunity.status !== 'open') return null;
  const queue = opportunity.assignment?.vendorQueue || [];
  const idx = queue.findIndex((q) => String(q.vendorId) === String(vendorId) && q.status === 'active');
  if (idx < 0) return opportunity;

  queue[idx].status = 'timeout';
  queue[idx].respondedAt = new Date();
  queue[idx].rejectionReason = 'Response timeout';
  await opportunity.save();

  try {
    if (global.io) {
      global.io.to('admin-room').emit('assignment:vendor_timeout', {
        opportunityId,
        vendorId,
        opportunityCode: opportunity.opportunityCode
      });
    }
  } catch {
    /* ignore */
  }

  // Other vendors in this batch may still be reviewing — only advance once the
  // whole batch is resolved and nobody has already accepted elsewhere.
  const stillWaiting = queue.some((q) => q.status === 'active');
  if (stillWaiting || opportunity.assignment.phase !== 'waiting_vendor_acceptance') return opportunity;

  return notifyNextVendor(opportunityId);
};

const recordVendorReject = async (opportunityId, vendorId, reason = '') => {
  const opportunity = await Opportunity.findById(opportunityId);
  if (!opportunity || opportunity.status !== 'open') {
    return { ok: false, message: 'Opportunity not available' };
  }
  const queue = opportunity.assignment?.vendorQueue || [];
  const idx = queue.findIndex((q) => String(q.vendorId) === String(vendorId));
  if (idx < 0) {
    return { ok: false, message: 'You are not in the assignment queue for this project' };
  }
  if (queue[idx].status !== 'active' && queue[idx].status !== 'pending') {
    return { ok: false, message: 'Cannot reject at this stage' };
  }

  await cancelVendorTimeout(opportunityId, vendorId);
  queue[idx].status = 'rejected';
  queue[idx].respondedAt = new Date();
  queue[idx].rejectionReason = reason || 'Vendor declined';
  await opportunity.save();

  const stillWaiting = queue.some((q) => q.status === 'active');
  if (!stillWaiting && opportunity.assignment.phase === 'waiting_vendor_acceptance') {
    await notifyNextVendor(opportunityId);
  }
  return { ok: true, opportunity };
};

/**
 * First vendor in the current broadcast batch to accept wins the opportunity.
 * The lock is an atomic single-document update guarded on the opportunity still
 * being open and this vendor's queue entry still being 'active', so two vendors
 * accepting within milliseconds of each other cannot both win.
 */
const onVendorAccepted = async (opportunityId, vendorId) => {
  const vId = new mongoose.Types.ObjectId(vendorId);
  const existing = await Opportunity.findById(opportunityId).select('assignment.vendorQueue');
  if (!existing) return { ok: false, message: 'Project not found' };

  const hasQueue = (existing.assignment?.vendorQueue || []).length > 0;

  if (hasQueue) {
    const claimed = await Opportunity.findOneAndUpdate(
      {
        _id: opportunityId,
        status: 'open',
        'assignment.phase': { $nin: ['awaiting_engineer', 'awarded'] },
        'assignment.vendorQueue': { $elemMatch: { vendorId: vId, status: 'active' } }
      },
      { $set: { 'assignment.phase': 'awaiting_engineer' } }
    );
    if (!claimed) {
      return { ok: false, message: 'Another vendor already accepted this project' };
    }
  }

  const opportunity = await Opportunity.findById(opportunityId);
  if (!opportunity) return { ok: false, message: 'Project not found' };

  const queue = opportunity.assignment.vendorQueue || [];
  const idx = queue.findIndex((q) => String(q.vendorId) === String(vendorId));
  if (idx >= 0) {
    await cancelVendorTimeout(opportunityId, vendorId);
    queue[idx].status = 'accepted';
    queue[idx].respondedAt = new Date();
  }
  await Promise.all(
    queue
      .map((q, i) => (i !== idx && q.status === 'active' ? cancelVendorTimeout(opportunityId, q.vendorId) : null))
      .filter(Boolean)
  );
  queue.forEach((q, i) => {
    if (i !== idx && ['pending', 'active'].includes(q.status)) {
      q.status = 'skipped';
    }
  });

  opportunity.assignment.phase = 'awaiting_engineer';
  pushTimeline(opportunity, 'vendor_accepted', 'Vendor Accepted', { vendorId });
  await opportunity.save();
  emitUserTimeline(opportunity, 'A vendor accepted your project');
  await cancelFreelancerPoolTimeout(opportunityId);
  await markB2BAllocationStage(opportunity, 'allocated', 'Vendor accepted the job', { vendorId: String(vendorId) });

  if (opportunity.assignment.serviceRequestId) {
    await ServiceRequest.updateOne(
      { _id: opportunity.assignment.serviceRequestId },
      { status: 'Assigned', assignedVendorId: vendorId }
    );
  }
  return { ok: true, opportunity };
};

const releaseToFreelancerPool = async (opportunityId, reason = 'vendor_exhausted') => {
  const opportunity = await Opportunity.findById(opportunityId);
  if (!opportunity) return null;
  if (opportunity.status === 'awarded') return opportunity;

  opportunity.assignment.phase = 'freelancer_pool';
  opportunity.assignment.freelancerPoolReleasedAt = new Date();
  pushTimeline(opportunity, 'freelancer_pool', 'Released To Freelancer Pool', { reason });
  await opportunity.save();

  const freelancers = await findMatchingFreelancers(opportunity);
  const payload = {
    type: 'freelancer_pool_project',
    opportunityId: opportunity._id,
    opportunityCode: opportunity.opportunityCode,
    title: opportunity.title,
    city: opportunity.clientInfo?.city,
    requiredEngineers: opportunity.assignment?.requiredEngineers || 1,
    budget: opportunity.budget
  };

  for (const eng of freelancers) {
    try {
      if (global.io) {
        global.io.to(`engineer:${eng._id}`).emit('freelancer:project_available', payload);
      }
      const { notifyEngineer } = require('./engineerNotify.service');
      await notifyEngineer(eng._id, {
        type: 'worker_assigned',
        pushType: 'freelancer_pool',
        category: 'jobs',
        title: 'New freelancer project',
        message: `${opportunity.title} — team of ${opportunity.assignment?.requiredEngineers || 1} required`,
        relatedId: opportunity._id,
        relatedType: 'opportunity',
        data: {
          opportunityId: String(opportunity._id),
          opportunityCode: opportunity.opportunityCode || ''
        }
      });
    } catch {
      /* non-blocking */
    }
  }

  try {
    if (global.io) {
      global.io.to('admin-room').emit('assignment:freelancer_pool', {
        opportunityId: opportunity._id,
        reason,
        freelancerCount: freelancers.length
      });
    }
  } catch {
    /* ignore */
  }

  emitUserTimeline(opportunity, 'Finding freelancer engineers for your project');

  await markB2BAllocationStage(opportunity, 'freelancer_pool', reason, {
    freelancerCount: freelancers.length
  });

  // Nobody to notify → there is nothing to wait for; escalate on the next tick.
  const config = opportunity.assignment?.configSnapshot || (await getAssignmentConfig(opportunity.categoryCode));
  await scheduleFreelancerPoolTimeout(opportunity._id, config.freelancerPoolTimeoutMinutes, {
    immediate: freelancers.length === 0
  });

  return freelancers;
};

/**
 * Freelancer accepts with confirmation checklist (team / complete / timeline / resources).
 * @param {object|number} confirmationOrTeamSize — full checklist body, or legacy team size number
 */
const freelancerAcceptProject = async (opportunityId, engineerId, confirmationOrTeamSize) => {
  const opportunity = await Opportunity.findOne({
    _id: opportunityId,
    status: 'open',
    'assignment.phase': 'freelancer_pool'
  });
  if (!opportunity) {
    return { ok: false, status: 404, message: 'Project is not available in the freelancer pool' };
  }

  const required = opportunity.assignment?.requiredEngineers || 1;
  const body =
    confirmationOrTeamSize != null && typeof confirmationOrTeamSize === 'object'
      ? confirmationOrTeamSize
      : { availableTeamSize: confirmationOrTeamSize, canComplete: true, canMeetTimeline: true, hasResources: true };

  const parsed = parseEngineerConfirmation(body, required);
  if (!parsed.ok) return parsed;

  const engineer = await Engineer.findById(engineerId).lean();
  if (!engineer || engineer.engineerType !== 'freelancer') {
    return { ok: false, status: 403, message: 'Only freelancer engineers can accept from the pool' };
  }

  const team = parsed.confirmation.availableTeamSize;

  // First accept wins
  const updated = await Opportunity.findOneAndUpdate(
    {
      _id: opportunityId,
      status: 'open',
      'assignment.phase': 'freelancer_pool',
      'assignment.freelancerLeadEngineerId': null
    },
    {
      $set: {
        status: 'awarded',
        'assignment.phase': 'awarded',
        'assignment.freelancerLeadEngineerId': engineerId,
        'assignment.engineerConfirmation': {
          ...parsed.confirmation,
          engineerId
        },
        awardedTo: {
          vendorId: engineer.vendorId || null,
          awardedAt: new Date()
        }
      }
    },
    { new: true }
  );

  if (!updated) {
    return { ok: false, status: 409, message: 'Another engineer already accepted this project' };
  }

  const opp = await Opportunity.findById(updated._id);
  pushTimeline(opp, 'freelancer_accepted', 'Freelancer Accepted Project', {
    engineerId,
    availableTeamSize: team,
    canComplete: true,
    canMeetTimeline: true,
    hasResources: true
  });
  pushTimeline(opp, 'engineer_assigned', 'Engineer Assigned', { engineerId });

  const poolVendorId = await resolveFreelancerPoolVendorId(opp.assignment?.configSnapshot);
  let projectId = null;
  let opsWarning = null;

  try {
    const { project, job, warning } = await createFreelancerOpsProjectAndJob(opp, engineer, team);
    if (project) {
      projectId = project._id;
      opp.awardedTo = {
        vendorId: poolVendorId || project.vendorId,
        projectId: project._id,
        awardedAt: new Date()
      };
    }
    if (job) {
      await VendorOpsJob.updateOne(
        { _id: job._id },
        { $set: { acceptConfirmation: parsed.confirmation } }
      ).catch(() => {});
    }
    opsWarning = warning;
  } catch (err) {
    console.error('[freelancerAcceptProject] ops create failed:', err.message);
    opsWarning = 'Project awarded but ops project creation failed';
  }

  await opp.save();

  if (opp.assignment?.serviceRequestId) {
    await ServiceRequest.updateOne({ _id: opp.assignment.serviceRequestId }, { status: 'Assigned' });
  }

  emitUserTimeline(opp, 'An engineer has been assigned to your project');
  await cancelFreelancerPoolTimeout(opp._id);
  await markB2BAllocationStage(opp, 'allocated', 'Freelancer engineer accepted the job', {
    engineerId: String(engineerId)
  });
  return { ok: true, opportunity: opp, projectId, opsWarning, confirmation: parsed.confirmation };
};

const getPublicTimeline = (opportunity) => {
  const phase = opportunity.assignment?.phase || 'project_created';
  const doneKeys = new Set((opportunity.assignment?.timeline || []).map((t) => t.key));
  return DEFAULT_TIMELINE.map((step) => ({
    ...step,
    done: doneKeys.has(step.key) || (step.key === 'project_created' && !!opportunity._id),
    current: step.key === phase || (phase === 'waiting_vendor_acceptance' && step.key === 'vendor_reviewing'),
    at: (opportunity.assignment?.timeline || []).find((t) => t.key === step.key)?.at || null
  }));
};

module.exports = {
  getAssignmentConfig,
  buildVendorQueue,
  startAssignmentForOpportunity,
  notifyNextVendor,
  handleVendorTimeout,
  recordVendorReject,
  onVendorAccepted,
  releaseToFreelancerPool,
  handleFreelancerPoolTimeout,
  cancelFreelancerPoolTimeout,
  handleAssignmentFailure,
  markB2BAllocationStage,
  findMatchingFreelancers,
  freelancerAcceptProject,
  parseEngineerConfirmation,
  getPublicTimeline,
  pushTimeline
};
