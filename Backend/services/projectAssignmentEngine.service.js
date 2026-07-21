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
const { expandCategoryMatchCodes } = require('../utils/serviceCategoryAliases');
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
      priorityMode: 'vendor_then_freelancer',
      releaseToFreelancerOnVendorExhausted: true,
      scoringWeights: { location: 30, service: 25, capacity: 20, rating: 15, responseScore: 10 }
    };
  }
  if (!cfg.freelancerPoolVendorId && process.env.FREELANCER_POOL_VENDOR_ID) {
    cfg = { ...cfg, freelancerPoolVendorId: process.env.FREELANCER_POOL_VENDOR_ID };
  }
  return cfg;
};

const normalizeCity = (c) => String(c || '').trim().toLowerCase();

const vendorCoversCity = (vendor, city) => {
  const target = normalizeCity(city);
  if (!target) return true;
  const lists = [
    ...(vendor.operatingCities || []),
    ...(vendor.operationalCities || []),
    vendor.address?.city,
    vendor.location?.city
  ].filter(Boolean);
  return lists.some((c) => normalizeCity(c) === target || normalizeCity(c).includes(target) || target.includes(normalizeCity(c)));
};

const normSubToken = (s) => String(s || '').trim().toUpperCase();

const vendorSubMatches = (token, subCatCode) => {
  const want = normSubToken(subCatCode);
  const got = normSubToken(token);
  if (!want || !got) return false;
  return got === want || got.includes(want) || want.includes(got);
};

const vendorHasService = (vendor, matchCodes, subCatCode) => {
  const codes = (matchCodes || []).map((c) => String(c).toUpperCase());
  const approvedRows = (vendor.approvedServices || []).filter(
    (s) => codes.includes(String(s.categoryCode || '').toUpperCase()) && ['active', 'pending'].includes(s.status)
  );
  const legacy = (vendor.categories || []).some((c) => codes.includes(String(c).toUpperCase()));
  if (!approvedRows.length && !legacy) return false;
  if (!subCatCode) return true;

  const fromApproved = approvedRows.flatMap((s) => s.subServices || []);
  const flatSubs = [
    ...fromApproved,
    ...(vendor.subServices || []),
    ...(vendor.approvedSubServices || [])
  ];
  if (!flatSubs.length) return legacy || approvedRows.length > 0;

  return flatSubs.some((s) => {
    if (s && typeof s === 'object') {
      return vendorSubMatches(s.subCatCode || s.code || s.name, subCatCode);
    }
    return vendorSubMatches(s, subCatCode);
  });
};

const scoreVendor = (vendor, ctx, weights) => {
  let score = 0;
  const w = weights || {};

  if (ctx.city && vendorCoversCity(vendor, ctx.city)) score += w.location || 30;
  else if (ctx.coords && vendor.geoLocation?.coordinates?.length === 2) {
    const dist = calculateDistance(ctx.coords, {
      lat: vendor.geoLocation.coordinates[1],
      lng: vendor.geoLocation.coordinates[0]
    });
    const range = vendor.settings?.serviceRange || 250;
    if (dist <= range) score += Math.max(0, (w.location || 30) * (1 - dist / (range * 2)));
  }

  if (vendorHasService(vendor, ctx.matchCodes, ctx.subCatCode)) score += w.service || 25;

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
 */
const buildVendorQueue = async (opportunity, config) => {
  const categoryCode = opportunity.categoryCode;
  const city = opportunity.requirements?.cities?.[0] || opportunity.clientInfo?.city || '';
  const coords =
    opportunity.assignment?.siteLocation?.coordinates?.coordinates?.length === 2
      ? {
          lat: opportunity.assignment.siteLocation.coordinates.coordinates[1],
          lng: opportunity.assignment.siteLocation.coordinates.coordinates[0]
        }
      : null;

  const codes = await expandCategoryMatchCodes([categoryCode]);
  const vendors = await Vendor.find({
    approvalStatus: 'approved',
    isActive: { $ne: false },
    $or: [
      { approvedServices: { $elemMatch: { categoryCode: { $in: codes }, status: { $in: ['active', 'pending'] } } } },
      { categories: { $in: codes } }
    ]
  })
    .select(
      'businessName operatingCities operationalCities address location geoLocation settings teamSize maxCapacity teamEngineers approvedServices categories subServices rating responseScore'
    )
    .lean();

  const ctx = {
    categoryCode,
    matchCodes: codes,
    subCatCode: opportunity.assignment?.subCatCode || '',
    city,
    coords,
    requiredEngineers: opportunity.assignment?.requiredEngineers || 1
  };

  const scoredAll = vendors.map((v) => ({
    vendorId: v._id,
    score: scoreVendor(v, ctx, config.scoringWeights),
    coversCity: vendorCoversCity(v, city),
    hasService: vendorHasService(v, codes, ctx.subCatCode),
    businessName: v.businessName || v.name || '',
    vendor: v
  }));

  const notifyCap = Math.min(
    config.maxVendorsToNotify || 10,
    config.vendorRetryCount != null ? Math.max(1, config.vendorRetryCount) : config.maxVendorsToNotify || 10
  );
  const scored = scoredAll
    .filter((row) => row.score > 0)
    .filter((row) => !city || vendorCoversCity(row.vendor, city) || (coords && row.vendor.geoLocation))
    .sort((a, b) => b.score - a.score)
    .slice(0, notifyCap);

  // #region agent log
  try {
    const { agentDebugLog } = require('../utils/agentDebugLog');
    agentDebugLog({
      hypothesisId: 'C',
      location: 'projectAssignmentEngine.service.js:buildVendorQueue',
      message: 'Vendor queue build',
      data: {
        categoryCode,
        city,
        matchCodes: codes,
        candidateCount: vendors.length,
        scoredCount: scored.length,
        top: scoredAll.slice(0, 8).map((r) => ({
          id: String(r.vendorId),
          name: r.businessName,
          score: r.score,
          coversCity: r.coversCity,
          hasService: r.hasService
        }))
      }
    });
  } catch (_) { /* ignore */ }
  // #endregion

  return scored.map((row, idx) => ({
    vendorId: row.vendorId,
    rank: idx + 1,
    score: row.score,
    status: 'pending'
  }));
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
  const categoryQuery = {
    ...baseQuery,
    $or: [
      { serviceCategories: { $in: codes } },
      { categories: { $in: codes } },
      { skills: { $in: codes } }
    ]
  };

  let list = await Engineer.find(categoryQuery)
    .select('_id fullName phone engineerType subServices serviceCategories skills')
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

const notifyNextVendor = async (opportunityId) => {
  const opportunity = await Opportunity.findById(opportunityId);
  if (!opportunity || opportunity.status !== 'open') return null;
  const queue = opportunity.assignment?.vendorQueue || [];
  const config = opportunity.assignment?.configSnapshot || (await getAssignmentConfig(opportunity.categoryCode));

  let nextIndex = opportunity.assignment.currentVendorIndex + 1;
  while (nextIndex < queue.length && !['pending', 'timeout', 'rejected'].includes(queue[nextIndex].status)) {
    nextIndex += 1;
  }
  if (nextIndex >= queue.length) {
    if (config.releaseToFreelancerOnVendorExhausted !== false) {
      return releaseToFreelancerPool(opportunityId, 'vendor_queue_exhausted');
    }
    await handleAssignmentFailure(opportunity, 'vendor_queue_exhausted');
    return opportunity;
  }

  queue.forEach((q, i) => {
    if (i < nextIndex && q.status === 'active') {
      q.status = 'skipped';
      q.respondedAt = q.respondedAt || new Date();
    }
  });

  queue[nextIndex].status = 'active';
  queue[nextIndex].notifiedAt = new Date();
  opportunity.assignment.currentVendorIndex = nextIndex;
  opportunity.assignment.phase = 'waiting_vendor_acceptance';
  opportunity.assignment.activeVendorUntil = new Date(
    Date.now() + (config.vendorResponseTimeoutMinutes || 120) * 60 * 1000
  );

  pushTimeline(opportunity, 'vendor_notified', 'Vendor Notified', {
    vendorId: queue[nextIndex].vendorId
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

  emitVendorOpportunity(queue[nextIndex].vendorId, payload);
  await scheduleVendorTimeout(
    opportunity._id,
    queue[nextIndex].vendorId,
    config.vendorResponseTimeoutMinutes
  );
  emitUserTimeline(opportunity, 'Vendors have been notified about your project');
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

  const wasActive = queue[idx].status === 'active';
  await cancelVendorTimeout(opportunityId, vendorId);
  queue[idx].status = 'rejected';
  queue[idx].respondedAt = new Date();
  queue[idx].rejectionReason = reason || 'Vendor declined';
  await opportunity.save();

  if (wasActive || opportunity.assignment.currentVendorIndex === idx) {
    await notifyNextVendor(opportunityId);
  }
  return { ok: true, opportunity };
};

const onVendorAccepted = async (opportunityId, vendorId) => {
  const opportunity = await Opportunity.findById(opportunityId);
  if (!opportunity?.assignment?.vendorQueue) return;
  const queue = opportunity.assignment.vendorQueue;
  const idx = queue.findIndex((q) => String(q.vendorId) === String(vendorId));
  if (idx >= 0) {
    await cancelVendorTimeout(opportunityId, vendorId);
    queue[idx].status = 'accepted';
    queue[idx].respondedAt = new Date();
    queue.forEach((q, i) => {
      if (i !== idx && ['pending', 'active'].includes(q.status)) {
        q.status = 'skipped';
      }
    });
  }
  opportunity.assignment.phase = 'awaiting_engineer';
  pushTimeline(opportunity, 'vendor_accepted', 'Vendor Accepted', { vendorId });
  await opportunity.save();
  emitUserTimeline(opportunity, 'A vendor accepted your project');

  if (opportunity.assignment.serviceRequestId) {
    await ServiceRequest.updateOne(
      { _id: opportunity.assignment.serviceRequestId },
      { status: 'Assigned', assignedVendorId: vendorId }
    );
  }
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
  return freelancers;
};

/**
 * Freelancer accepts with team size gate (per product flow).
 */
const freelancerAcceptProject = async (opportunityId, engineerId, availableTeamSize) => {
  const opportunity = await Opportunity.findOne({
    _id: opportunityId,
    status: 'open',
    'assignment.phase': 'freelancer_pool'
  });
  if (!opportunity) {
    return { ok: false, status: 404, message: 'Project is not available in the freelancer pool' };
  }

  const required = opportunity.assignment?.requiredEngineers || 1;
  const team = parseInt(availableTeamSize, 10);
  if (!team || team < required) {
    return {
      ok: false,
      status: 400,
      message: `You need at least ${required} engineers available to accept this project`
    };
  }

  const engineer = await Engineer.findById(engineerId).lean();
  if (!engineer || engineer.engineerType !== 'freelancer') {
    return { ok: false, status: 403, message: 'Only freelancer engineers can accept from the pool' };
  }

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
    availableTeamSize: team
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
  return { ok: true, opportunity: opp, projectId, opsWarning };
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
  findMatchingFreelancers,
  freelancerAcceptProject,
  getPublicTimeline,
  pushTimeline
};
