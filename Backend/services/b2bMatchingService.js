const { Queue, Worker: BullWorker } = require('bullmq');
const IORedis = require('ioredis');

const B2BJob = require('../models/B2BJob');
const Engineer = require('../models/Engineer');
const JobHistory = require('../models/JobHistory');
const { getIO } = require('../sockets');
const { sendSMS } = require('./smsService');

// Progressive radius waves (km) — mirrors WaveManager pattern, B2B-tuned
const B2B_WAVE_RADII_KM = (process.env.B2B_MATCH_WAVE_RADII || '5,10,20,50,100')
  .split(',')
  .map((n) => parseInt(n.trim(), 10))
  .filter((n) => !Number.isNaN(n) && n > 0);

// 30s was fine as a dead-man's-switch around the old silent auto-assign; now that
// this is the real window for an engineer to see the offer and tap accept, floor
// it well above push-notification latency (mirrors Flow 1's worker-response floor).
const B2B_WAVE_TIMEOUT_MS = Math.max(45000, parseInt(process.env.B2B_MATCH_WAVE_TIMEOUT_MS || '45000', 10));
const B2B_MATCH_PER_WAVE_LIMIT = parseInt(process.env.B2B_MATCH_PER_WAVE_LIMIT || '10', 10);

const redisOptions = {
  maxRetriesPerRequest: null,
  retryStrategy: (times) => Math.min(times * 200, 5000)
};
const connection = new IORedis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', redisOptions);

const b2bMatchingQueue = new Queue('b2b-matching-queue', { connection });

connection.on('error', (err) => {
  console.error('[Redis Error in b2bMatchingService]', err.message);
});

b2bMatchingQueue.on('error', (err) => {
  console.error('[Queue Error in b2bMatchingQueue]', err.message);
});

let matchingWorker;

const emitSocket = (room, event, data) => {
  try {
    const io = getIO();
    if (io) {
      io.to(room).emit(event, data);
    }
  } catch (err) {
    console.warn('[Socket Warning] Could not emit matching event:', err.message);
  }
};

const generateStartOtp = () => {
  if (process.env.NODE_ENV !== 'production' && process.env.USE_DEFAULT_OTP === 'true') return '123456';
  return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * Queue initial matching (wave 0) for a B2B job
 */
const queueJobMatching = async (jobId, app, waveIndex = 0) => {
  await b2bMatchingQueue.add(
    'dispatchWave',
    { jobId: jobId.toString(), waveIndex },
    {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
      jobId: `b2b-wave-${jobId}-${waveIndex}-${Date.now()}`
    }
  );
  console.log(`[Matching] Queued wave ${waveIndex} for B2B Job: ${jobId}`);
};

/**
 * Explain *why* every wave failed, so the escalation reason is actionable.
 *
 * Runs one diagnostic scan at the widest radius with the skill gate off. If
 * engineers were present but none qualified, the bottleneck is skill coverage
 * (or catalog seeding) — not engineer supply. Only runs on the failure path.
 */
const describeExhaustion = async (b2bJob, radii) => {
  const span = radii.join('→');
  try {
    const coords = b2bJob.coordinates?.coordinates;
    if (!coords || coords.length !== 2) return `No engineers accepted across all waves (${span} km)`;

    const { buildB2BJobSkillContext, findEligibleEngineersInRadius } = require('./b2bEngineerEligibility');
    const [lng, lat] = coords;
    const widest = radii[radii.length - 1];

    // Skill gate off: how many engineers exist in range at all?
    const { stats: openStats } = await findEligibleEngineersInRadius({
      lng,
      lat,
      radiusKm: widest,
      context: null,
      limit: 1
    });

    if (openStats.scanned === 0) {
      return `No online engineers within ${widest} km (waves ${span} km)`;
    }

    // Skill gate on: how many of those actually qualify?
    const context = await buildB2BJobSkillContext(b2bJob);
    const { engineers: qualified } = await findEligibleEngineersInRadius({
      lng,
      lat,
      radiusKm: widest,
      context,
      limit: 1
    });

    if (qualified.length === 0) {
      const svc = b2bJob.service || 'the requested service';
      return context.resolved
        ? `${openStats.scanned} engineer(s) online within ${widest} km, none skilled in "${svc}" (waves ${span} km)`
        : `"${svc}" is not in the service catalog and no engineer skill matched it — add the category, then retry matching`;
    }

    return `${qualified.length}+ skilled engineer(s) available but none accepted in time (waves ${span} km)`;
  } catch (err) {
    console.warn('[Matching] describeExhaustion failed:', err.message);
    return `No engineers accepted across all waves (${span} km)`;
  }
};

/**
 * Skill-aware candidate resolution for one wave.
 *
 * Delegates to b2bEngineerEligibility, which applies MANDATORY skill matching
 * on top of the geo filter, plus workload and schedule gates. Proximity alone
 * is never sufficient — an Electrical engineer is not offered an HVAC job.
 *
 * @returns {{ engineers:Array, stats:Object }}
 */
const findEngineersInRadius = async (lng, lat, radiusKm, excludeIds = [], context = null) => {
  const { findEligibleEngineersInRadius } = require('./b2bEngineerEligibility');

  return findEligibleEngineersInRadius({
    lng,
    lat,
    radiusKm,
    context,
    excludeIds,
    limit: B2B_MATCH_PER_WAVE_LIMIT
  });
};

/**
 * Dispatch one matching wave; schedule next wave on timeout if still searching
 */
const dispatchWave = async (jobId, waveIndex = 0) => {
  const radii = [...(B2B_WAVE_RADII_KM.length ? B2B_WAVE_RADII_KM : [5, 10, 20, 50, 100])];
  console.log(`[Matching] Dispatching Wave ${waveIndex + 1} for Job ${jobId}`);

  let b2bJob = await B2BJob.findById(jobId);
  if (!b2bJob) {
    console.error(`[Matching] Job ${jobId} not found`);
    return;
  }

  const { lifecycleOf, transitionJob } = require('./jobLifecycle.service');
  const { LIFECYCLE } = require('./jobStateMachine');
  const state = lifecycleOf(b2bJob);
  // Only unowned, funded jobs are routed. A job a vendor or engineer already
  // holds, or one parked for a human, must never be re-offered by a stale wave.
  if (![LIFECYCLE.VALIDATED, LIFECYCLE.ROUTED].includes(state) || b2bJob.assignedTo || b2bJob.assignedVendorId || b2bJob.status === 'pending_wallet') {
    console.log(`[Matching] Job ${b2bJob.jobId} is ${state}/${b2bJob.status}. Halting waves.`);
    return;
  }

  if (b2bJob.routingMaxRadiusKm && b2bJob.routingMaxRadiusKm > radii[radii.length - 1]) {
    radii.push(Number(b2bJob.routingMaxRadiusKm));
  }

  if (waveIndex >= radii.length) {
    await handleMatchingFailure(b2bJob, await describeExhaustion(b2bJob, radii));
    return;
  }

  const coords = b2bJob.coordinates?.coordinates;
  if (!coords || coords.length !== 2 || (coords[0] === 0 && coords[1] === 0)) {
    await handleMatchingFailure(b2bJob, 'Invalid job coordinates');
    return;
  }

  const [lng, lat] = coords;
  const radiusKm = radii[waveIndex];

  if (state !== LIFECYCLE.ROUTED) {
    await transitionJob({
      jobId: b2bJob._id,
      to: LIFECYCLE.ROUTED,
      actor: { role: 'system' },
      reason: `Automatic routing started (waves ${radii.join('→')} km)`,
      event: 'ROUTING_STARTED'
    });
    b2bJob = await B2BJob.findById(jobId).read('primary');
  } else if (b2bJob.status !== 'searching_engineer') {
    // Same canonical state (ROUTED); only the legacy label changes.
    b2bJob.status = 'searching_engineer';
  }
  b2bJob.currentWave = waveIndex + 1;
  b2bJob.waveStartedAt = new Date();
  b2bJob.allocationStage = 'engineer_waves';
  b2bJob.allocationReason = `Searching engineers within ${radiusKm} km (wave ${waveIndex + 1}/${radii.length})`;
  b2bJob.allocationUpdatedAt = new Date();
  await b2bJob.save();

  const previouslyNotified = (b2bJob.notifiedEngineers || []).map((id) => id.toString());
  const excludeIds = [...new Set([...previouslyNotified, ...(b2bJob.declinedEngineers || []).map(String)])];

  // Resolve the job's service into catalog ids / skill names once per wave.
  const { buildB2BJobSkillContext } = require('./b2bEngineerEligibility');
  const skillContext = await buildB2BJobSkillContext(b2bJob);

  if (skillContext.hasService && !skillContext.resolved) {
    console.warn(
      `[Matching] "${b2bJob.service}" did not resolve against the service catalog for ${b2bJob.jobId}. ` +
        'Falling back to name-token skill matching — seed the catalog for precise routing.'
    );
  }

  const { engineers: matchingEngineers, stats } = await findEngineersInRadius(
    lng,
    lat,
    radiusKm,
    excludeIds,
    skillContext
  );

  // Vendor routing runs alongside the freelancer waves: vendors whose declared
  // coverage (service + pincode/city) includes this job and who have a skilled
  // engineer receive the request in their "New Requests" queue, then pick their
  // own engineer. Coverage is required — proximity alone never routes to a vendor.
  if (waveIndex === 0) {
    try {
      const { offerToEligibleVendors } = require('./jobRouting.service');
      const { notified, ranking } = await offerToEligibleVendors(b2bJob._id);
      console.log(
        `[Matching] ${b2bJob.jobId}: offered to ${notified.length} vendor(s)` +
          (notified.length ? '' : ` — ${ranking?.reason || 'none eligible'}`)
      );
    } catch (vendorErr) {
      console.warn('[Matching] Vendor routing failed (non-blocking):', vendorErr.message);
    }
  }

  console.log(
    `[Matching] Wave ${waveIndex + 1} (${radiusKm}km) ${b2bJob.jobId}: ` +
      `scanned=${stats.scanned} eligible=${matchingEngineers.length} ` +
      `skillRejected=${stats.skillRejected} workloadRejected=${stats.workloadRejected} ` +
      `scheduleRejected=${stats.scheduleRejected}`
  );

  emitSocket(`b2b:${b2bJob.companyId.toString()}`, 'b2b:matchingWave', {
    jobId: b2bJob.jobId,
    waveNumber: waveIndex + 1,
    radiusKm,
    engineersFound: matchingEngineers.length,
    scanned: stats.scanned,
    skillRejected: stats.skillRejected
  });

  // No new engineers this wave → expand immediately
  if (matchingEngineers.length === 0) {
    console.log(`[Matching] No new engineers in wave ${waveIndex + 1}. Expanding...`);
    return dispatchWave(jobId, waveIndex + 1);
  }

  const priorIds = (b2bJob.notifiedEngineers || []).map((id) => id.toString());
  const mergedIds = [...new Set([...priorIds, ...matchingEngineers.map((e) => e._id.toString())])];
  b2bJob.notifiedEngineers = mergedIds;
  await b2bJob.save();

  for (const eng of matchingEngineers) {
    const offerPayload = {
      jobId: b2bJob.jobId,
      mongoId: b2bJob._id.toString(),
      customerName: b2bJob.customerName,
      address: b2bJob.address,
      city: b2bJob.city,
      service: b2bJob.service,
      preferredDate: b2bJob.preferredDate,
      waveNumber: waveIndex + 1,
      radiusKm,
      timeoutSec: Math.round(B2B_WAVE_TIMEOUT_MS / 1000)
    };
    emitSocket(`worker:${eng._id.toString()}`, 'engineer:b2bJobOffer', offerPayload);
    emitSocket(`engineer:${eng._id.toString()}`, 'engineer:b2bJobOffer', offerPayload);
    try {
      const { notifyEngineer } = require('./engineerNotify.service');
      await notifyEngineer(eng._id, {
        type: 'booking_request',
        pushType: 'b2b_job_offer',
        category: 'jobs',
        title: 'New B2B job offer',
        message: `${b2bJob.service || 'Service'} — ${b2bJob.city || b2bJob.customerName || 'Respond quickly'}`,
        relatedId: b2bJob._id,
        relatedType: 'b2b_job',
        priority: 'high',
        data: { jobId: b2bJob.jobId, mongoId: String(b2bJob._id) }
      });
    } catch (_) {
      /* non-blocking */
    }
  }

  // Broadcast, don't auto-assign: every matched engineer got the offer above.
  // Whoever accepts first via acceptB2BJobOffer() wins; if nobody does within
  // the wave window, processWaveTimeout expands the radius.
  await b2bMatchingQueue.add(
    'processWaveTimeout',
    { jobId: b2bJob._id.toString(), waveIndex },
    {
      delay: B2B_WAVE_TIMEOUT_MS,
      jobId: `b2b-timeout-${b2bJob._id}-${waveIndex}`
    }
  );
};

/**
 * Hand a job to a specific engineer. Kept for callers of the old matcher API;
 * the work — eligibility, append-only JobAssignment, validated transition,
 * notifications — is done by services/jobAssignment.service.js.
 */
const assignJobToEngineer = async (b2bJob, engineer, _radiusKm = null, _waveNumber = null, actor = { role: 'system' }) => {
  const { assignEngineer } = require('./jobAssignment.service');
  try {
    const { job } = await assignEngineer({
      jobId: b2bJob._id,
      engineerId: engineer._id,
      actor,
      reason: actor.role === 'admin' ? 'Manually assigned by admin' : 'Assigned by routing',
      routingMode: actor.role === 'system' ? 'auto' : 'manual'
    });
    return { ok: true, job };
  } catch (err) {
    console.log(`[Matching] Job ${b2bJob.jobId} not assignable to ${engineer.name}: ${err.message}`);
    return { ok: false, reason: err.code || 'unavailable', message: err.message, status: err.status };
  }
};

/** Engineer accepts a broadcast offer — first acceptance wins (atomic). */
const acceptB2BJobOffer = async (jobId, engineerId) => {
  const { acceptAssignment } = require('./jobAssignment.service');
  try {
    const job = await acceptAssignment({ jobId, engineerId });
    return { ok: true, job };
  } catch (err) {
    return { ok: false, status: err.status || 409, message: err.message };
  }
};

const VENDOR_OFFER_TIMEOUT_MS = Math.max(
  60000,
  parseInt(process.env.JOB_VENDOR_OFFER_TIMEOUT_MS || String(30 * 60 * 1000), 10)
);

/** Escalate to the unassigned queue if no offered vendor claims the job in time. */
const scheduleVendorOfferTimeout = (jobId, delayMs = VENDOR_OFFER_TIMEOUT_MS) =>
  b2bMatchingQueue.add(
    'vendorOfferTimeout',
    { jobId: String(jobId) },
    { delay: delayMs, jobId: `b2b-vendor-timeout-${jobId}-${Date.now()}` }
  );

/** Vendors that were offered the job and have not declined it. */
const pendingVendorOffers = (job) => {
  const declined = new Set((job.vendorRejections || []).map((r) => String(r.vendorId)));
  return (job.notifiedVendors || []).map(String).filter((v) => !declined.has(v));
};

/**
 * Park an unroutable job in the unassigned queue (UNASSIGNED) with a stated
 * reason, return its escrow and alert admin + the company. Never silent.
 */
const escalateToUnassignedQueue = async (jobId, reason) => {
  const { transitionJob, lifecycleOf } = require('./jobLifecycle.service');
  const { LIFECYCLE } = require('./jobStateMachine');
  const job = await B2BJob.findById(jobId).read('primary').lean();
  if (!job || job.assignedTo || job.assignedVendorId) return null;
  if (lifecycleOf(job) === LIFECYCLE.UNASSIGNED) return job;

  const message = String(reason || 'No vendor or engineer accepted this job').slice(0, 300);
  const updated = await transitionJob({
    jobId: job._id,
    to: LIFECYCLE.UNASSIGNED,
    actor: { role: 'system' },
    reason: `Unassigned: ${message}`,
    event: 'ROUTING_EXHAUSTED',
    filter: { assignedTo: null, assignedVendorId: null },
    patch: {
      assignmentType: 'unassigned',
      allocationStage: 'admin_escalation',
      allocationReason: message,
      allocationUpdatedAt: new Date(),
      unassignedReason: message,
      unassignedAt: new Date()
    },
    meta: { reason: message }
  });

  // The reservation is NOT released here: the job is still live and will be
  // retried, re-routed or assigned by hand. Cancelling it releases the money.

  try {
    const EnterpriseProjectFlow = require('../models/EnterpriseProjectFlow');
    await EnterpriseProjectFlow.updateOne(
      { b2bJobId: job._id },
      {
        $set: { status: 'admin_escalation' },
        $push: { timeline: { key: 'admin_escalation', label: `Unassigned: ${message}`, at: new Date(), meta: { reason: message } } }
      }
    );
  } catch (_) { /* non-blocking */ }

  const alert = {
    jobId: job.jobId,
    mongoId: String(job._id),
    companyId: String(job.companyId),
    service: job.service,
    serviceKey: job.serviceKey,
    city: job.city,
    pincode: job.pincode,
    reason: message
  };
  emitSocket('admin', 'admin:matchingFailed', alert);
  emitSocket('admin', 'admin:b2bJobEscalated', alert);
  emitSocket(`b2b:${String(job.companyId)}`, 'b2b:jobEscalated', { jobId: job.jobId, reason: message });
  console.warn(`[Matching] Unassigned ${job.jobId}: ${message}`);
  return updated;
};

/**
 * Freelancer waves are exhausted. If vendors still hold an open offer, keep
 * the job routed and wait (bounded by VENDOR_OFFER_TIMEOUT_MS); otherwise try
 * any remaining eligible vendors; otherwise park it in the unassigned queue.
 */
const handleMatchingFailure = async (b2bJob, reason) => {
  const job = await B2BJob.findById(b2bJob._id).read('primary').lean();
  if (!job || job.assignedTo || job.assignedVendorId) return;

  let pending = pendingVendorOffers(job);
  let vendorReason = null;
  if (!pending.length) {
    const { offerToEligibleVendors } = require('./jobRouting.service');
    const { notified, ranking } = await offerToEligibleVendors(job._id);
    pending = notified;
    vendorReason = ranking?.reason || null;
  }

  if (pending.length) {
    await B2BJob.updateOne(
      { _id: job._id },
      {
        $set: {
          allocationStage: 'vendor_marketplace',
          allocationReason: `No freelancer accepted (${reason}). Waiting for ${pending.length} vendor(s) to accept.`,
          allocationUpdatedAt: new Date(),
          vendorOfferExpiresAt: new Date(Date.now() + VENDOR_OFFER_TIMEOUT_MS)
        }
      }
    );
    await scheduleVendorOfferTimeout(job._id);
    emitSocket(`b2b:${String(job.companyId)}`, 'b2b:jobVendorFallback', {
      jobId: job.jobId,
      reason,
      eligibleCount: pending.length
    });
    return;
  }

  await escalateToUnassignedQueue(job._id, [vendorReason, reason].filter(Boolean).join('. '));
};

/** Vendors were offered the job but none claimed it in time. */
const handleVendorOfferTimeout = async (jobId) => {
  const { lifecycleOf } = require('./jobLifecycle.service');
  const { LIFECYCLE } = require('./jobStateMachine');
  const job = await B2BJob.findById(jobId).read('primary').lean();
  if (!job || job.assignedTo || job.assignedVendorId || lifecycleOf(job) !== LIFECYCLE.ROUTED) return;
  // A newer deadline was set (e.g. the job was handed back and re-offered):
  // this timer belongs to an earlier offer round.
  if (job.vendorOfferExpiresAt && job.vendorOfferExpiresAt.getTime() > Date.now() + 5000) return;
  const offered = (job.notifiedVendors || []).length;
  await escalateToUnassignedQueue(
    job._id,
    `${offered} vendor(s) were offered this job and none accepted within ${Math.round(VENDOR_OFFER_TIMEOUT_MS / 60000)} minutes`
  );
};

/**
 * A vendor declined an offer. If every offered vendor has now declined and
 * the freelancer waves are already done, the job goes to the unassigned queue.
 */
const onVendorOfferDeclined = async (jobId) => {
  const job = await B2BJob.findById(jobId).read('primary').lean();
  if (!job || job.assignedTo || job.assignedVendorId) return;
  if (pendingVendorOffers(job).length) return;
  if (job.allocationStage !== 'vendor_marketplace') return; // waves still running
  await handleMatchingFailure(job, 'every offered vendor declined');
};

/**
 * A vendor handed back a job it had accepted. Vendors whose offer is still
 * open see it again (and are told live) with a fresh deadline; if none is
 * left, routing offers it to other eligible vendors or escalates it.
 */
const reopenVendorOffers = async (jobId, reason) => {
  const job = await B2BJob.findById(jobId).read('primary').lean();
  if (!job || job.assignedTo || job.assignedVendorId) return { reopenedFor: [] };
  const pending = pendingVendorOffers(job);
  if (!pending.length) {
    await handleMatchingFailure(job, reason);
    return { reopenedFor: [] };
  }
  await B2BJob.updateOne(
    { _id: job._id },
    {
      $set: {
        allocationStage: 'vendor_marketplace',
        allocationReason: `${reason}. Re-offered to ${pending.length} vendor(s).`,
        allocationUpdatedAt: new Date(),
        vendorOfferExpiresAt: new Date(Date.now() + VENDOR_OFFER_TIMEOUT_MS)
      }
    }
  );
  await scheduleVendorOfferTimeout(job._id);
  pending.forEach((vid) => emitSocket(`vendor:${vid}`, 'b2b:jobRequestReceived', {
    jobId: job.jobId,
    mongoId: String(job._id),
    service: job.service,
    serviceKey: job.serviceKey,
    city: job.city,
    pincode: job.pincode,
    charge: job.charge,
    reopened: true
  }));
  return { reopenedFor: pending };
};

/**
 * Initialize BullMQ worker for wave dispatch + timeouts
 */
const initMatchingWorker = (app) => {
  if (matchingWorker) return matchingWorker;

  matchingWorker = new BullWorker(
    'b2b-matching-queue',
    async (job) => {
      const { jobId, waveIndex = 0 } = job.data;

      if (job.name === 'vendorOfferTimeout') {
        await handleVendorOfferTimeout(jobId);
        return;
      }

      if (job.name === 'processWaveTimeout') {
        const b2bJob = await B2BJob.findById(jobId);
        if (!b2bJob) return;
        if (b2bJob.status !== 'searching_engineer') {
          console.log(`[Matching Timeout] Job ${jobId} no longer searching (${b2bJob.status})`);
          return;
        }
        if (b2bJob.currentWave === waveIndex + 1) {
          console.log(`[Matching Timeout] Advancing Job ${b2bJob.jobId} to wave ${waveIndex + 2}`);
          await dispatchWave(jobId, waveIndex + 1);
        }
        return;
      }

      // Legacy 'findEngineer' + 'dispatchWave'
      await dispatchWave(jobId, waveIndex);
    },
    { connection }
  );

  matchingWorker.on('completed', (job) => {
    console.log(`[Matching Worker] Job ${job.id} completed`);
  });

  matchingWorker.on('failed', (job, err) => {
    console.error(`[Matching Worker] Job ${job?.id} failed:`, err.message);
  });

  matchingWorker.on('error', (err) => {
    console.error('[Matching Worker] Critical Error:', err.message);
  });

  return matchingWorker;
};

module.exports = {
  queueJobMatching,
  initMatchingWorker,
  dispatchWave,
  assignJobToEngineer,
  acceptB2BJobOffer,
  handleMatchingFailure,
  escalateToUnassignedQueue,
  onVendorOfferDeclined,
  reopenVendorOffers,
  pendingVendorOffers,
  scheduleVendorOfferTimeout,
  VENDOR_OFFER_TIMEOUT_MS,
  B2B_WAVE_RADII_KM,
  B2B_WAVE_TIMEOUT_MS
};
