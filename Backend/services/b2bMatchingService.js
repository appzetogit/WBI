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

const B2B_WAVE_TIMEOUT_MS = parseInt(process.env.B2B_MATCH_WAVE_TIMEOUT_MS || '30000', 10);
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
  if (process.env.USE_DEFAULT_OTP === 'true') return '123456';
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
 * Find eligible online engineers within radiusKm using Engineer.geoLocation
 */
const findEngineersInRadius = async (lng, lat, radiusKm, excludeIds = []) => {
  const radiusMeters = radiusKm * 1000;
  const query = {
    roleType: { $in: ['Engineer', 'Both'] },
    status: 'ONLINE',
    approvalStatus: 'approved',
    isActive: true,
    geoLocation: {
      $nearSphere: {
        $geometry: { type: 'Point', coordinates: [lng, lat] },
        $maxDistance: radiusMeters
      }
    }
  };

  if (excludeIds.length > 0) {
    query._id = { $nin: excludeIds };
  }

  return Engineer.find(query).limit(B2B_MATCH_PER_WAVE_LIMIT);
};

/**
 * Dispatch one matching wave; schedule next wave on timeout if still searching
 */
const dispatchWave = async (jobId, waveIndex = 0) => {
  const radii = B2B_WAVE_RADII_KM.length ? B2B_WAVE_RADII_KM : [5, 10, 20, 50, 100];
  console.log(`[Matching] Dispatching Wave ${waveIndex + 1} for Job ${jobId}`);

  const b2bJob = await B2BJob.findById(jobId);
  if (!b2bJob) {
    console.error(`[Matching] Job ${jobId} not found`);
    return;
  }

  if (!['pending', 'searching_engineer'].includes(b2bJob.status)) {
    console.log(`[Matching] Job ${b2bJob.jobId} status=${b2bJob.status}. Halting waves.`);
    return;
  }

  if (waveIndex >= radii.length) {
    await handleMatchingFailure(b2bJob, `No engineers accepted across all waves (${radii.join('→')} km)`);
    return;
  }

  const coords = b2bJob.coordinates?.coordinates;
  if (!coords || coords.length !== 2 || (coords[0] === 0 && coords[1] === 0)) {
    await handleMatchingFailure(b2bJob, 'Invalid job coordinates');
    return;
  }

  const [lng, lat] = coords;
  const radiusKm = radii[waveIndex];

  if (b2bJob.status !== 'searching_engineer') {
    b2bJob.status = 'searching_engineer';
  }
  b2bJob.currentWave = waveIndex + 1;
  b2bJob.waveStartedAt = new Date();
  b2bJob.allocationStage = 'engineer_waves';
  b2bJob.allocationReason = `Searching engineers within ${radiusKm} km (wave ${waveIndex + 1}/${radii.length})`;
  b2bJob.allocationUpdatedAt = new Date();
  await b2bJob.save();

  if (waveIndex === 0) {
    await JobHistory.create({
      jobId: b2bJob._id,
      status: 'searching_engineer',
      remark: `Auto-allocation started (waves ${radii.join('→')} km).`,
      role: 'system'
    });
  }

  const previouslyNotified = (b2bJob.notifiedEngineers || []).map((id) => id.toString());
  const excludeIds = previouslyNotified;

  const matchingEngineers = await findEngineersInRadius(lng, lat, radiusKm, excludeIds);

  console.log(
    `[Matching] Wave ${waveIndex + 1} (${radiusKm}km): found ${matchingEngineers.length} new online engineers for ${b2bJob.jobId}`
  );

  emitSocket(`b2b:${b2bJob.companyId.toString()}`, 'b2b:matchingWave', {
    jobId: b2bJob.jobId,
    waveNumber: waveIndex + 1,
    radiusKm,
    engineersFound: matchingEngineers.length
  });

  // No new engineers this wave → expand immediately
  if (matchingEngineers.length === 0) {
    console.log(`[Matching] No new engineers in wave ${waveIndex + 1}. Expanding...`);
    return dispatchWave(jobId, waveIndex + 1);
  }

  const target = matchingEngineers[0];
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

  try {
    await assignJobToEngineer(b2bJob, target, radiusKm, waveIndex + 1);
  } catch (assignErr) {
    console.error(`[Matching] Assign failed for ${b2bJob.jobId}:`, assignErr.message);
    // Keep searching: schedule next wave after timeout
    await b2bMatchingQueue.add(
      'processWaveTimeout',
      { jobId: b2bJob._id.toString(), waveIndex },
      {
        delay: B2B_WAVE_TIMEOUT_MS,
        jobId: `b2b-timeout-${b2bJob._id}-${waveIndex}`
      }
    );
  }
};

/**
 * Assign a B2B job to a specific engineer and issue start OTP to customer
 */
const assignJobToEngineer = async (b2bJob, engineer, radiusKm = null, waveNumber = null) => {
  const fresh = await B2BJob.findById(b2bJob._id);
  if (!fresh || !['pending', 'searching_engineer'].includes(fresh.status)) {
    console.log(`[Matching] Job ${b2bJob.jobId} no longer assignable (status=${fresh?.status})`);
    return;
  }

  const startOtp = generateStartOtp();

  fresh.status = 'assigned';
  fresh.trackingStatus = 'assigned';
  fresh.assignedTo = engineer._id;
  fresh.assignedToName = engineer.name;
  fresh.assignedAt = new Date();
  fresh.startOtp = startOtp;
  fresh.startOtpSentAt = new Date();
  fresh.allocationStage = 'allocated';
  fresh.allocationReason = `Assigned to ${engineer.name}`;
  fresh.allocationUpdatedAt = new Date();
  await fresh.save();

  await JobHistory.create({
    jobId: fresh._id,
    status: 'assigned',
    remark: `Allocated to ${engineer.name}${radiusKm ? ` @ wave ${waveNumber} (${radiusKm}km)` : ''}. Start OTP issued.`,
    role: 'system'
  });

  if (fresh.phone) {
    try {
      const msg = `WBIPVTLTD: Your service start OTP for job ${fresh.jobId} is ${startOtp}. Share only with the engineer on site.`;
      await sendSMS(fresh.phone, msg);
    } catch (smsErr) {
      console.warn(`[Matching] Start OTP SMS failed for ${fresh.jobId}:`, smsErr.message);
      if (process.env.NODE_ENV !== 'production' || process.env.USE_DEFAULT_OTP === 'true') {
        console.log(`[DEV] B2B Start OTP for ${fresh.jobId}: ${startOtp}`);
      }
    }
  }

  emitSocket(`b2b:${fresh.companyId.toString()}`, 'b2b:jobAssigned', {
    jobId: fresh.jobId,
    engineerName: engineer.name,
    engineerPhone: engineer.phone,
    waveNumber,
    radiusKm
  });

  emitSocket(`worker:${engineer._id.toString()}`, 'engineer:jobAssigned', {
    jobId: fresh.jobId,
    mongoId: fresh._id.toString(),
    customerName: fresh.customerName,
    address: fresh.address,
    preferredDate: fresh.preferredDate,
    service: fresh.service
  });

  emitSocket(`engineer:${engineer._id.toString()}`, 'engineer:jobAssigned', {
    jobId: fresh.jobId,
    mongoId: fresh._id.toString(),
    customerName: fresh.customerName,
    address: fresh.address,
    preferredDate: fresh.preferredDate,
    service: fresh.service
  });

  try {
    const { notifyEngineer } = require('./engineerNotify.service');
    await notifyEngineer(engineer._id, {
      type: 'worker_assigned',
      pushType: 'b2b_job_assigned',
      category: 'jobs',
      title: 'B2B job assigned',
      message: `${fresh.service || 'Job'} ${fresh.jobId} — head to site`,
      relatedId: fresh._id,
      relatedType: 'b2b_job',
      priority: 'high',
      data: { jobId: fresh.jobId }
    });
  } catch (_) {
    /* non-blocking */
  }

  console.log(`[Matching] Assigned Job ${fresh.jobId} → ${engineer.name} (OTP issued)`);
};

const handleMatchingFailure = async (b2bJob, reason) => {
  // Fallback: vendor marketplace → freelancer pool (via assignment engine) before admin escalation
  let escalationReason = reason;
  try {
    const { createOpportunityFromB2BJob } = require('../utils/createOpportunityFromEnquiry');
    const EnterpriseProjectFlow = require('../models/EnterpriseProjectFlow');
    const result = await createOpportunityFromB2BJob(b2bJob);

    // Admin must add the missing catalog category — routing it anywhere else
    // would send the job to an unrelated vendor pool.
    if (result?.unmatchedCategory) {
      escalationReason = `No service category configured for "${b2bJob.service}". Add it in the service catalog, then retry matching.`;
    }
    if (result?.opportunity) {
      b2bJob.status = 'pending';
      b2bJob.allocationStage = 'vendor_marketplace';
      b2bJob.allocationReason = `No engineer accepted (${reason}). Offered to ${result.eligibleCount || 0} vendor(s).`;
      b2bJob.allocationUpdatedAt = new Date();
      await b2bJob.save();

      await JobHistory.create({
        jobId: b2bJob._id,
        status: 'pending',
        remark: `Engineer matching failed (${reason}). Escalated to vendor marketplace (${result.eligibleCount || 0} eligible).`,
        role: 'system'
      });

      const flow = await EnterpriseProjectFlow.findOne({ b2bJobId: b2bJob._id });
      if (flow) {
        flow.opportunityId = result.opportunity._id;
        flow.status = 'assignment_active';
        flow.timeline = flow.timeline || [];
        flow.timeline.push({
          key: 'vendor_fallback',
          label: 'Engineer waves exhausted — routed to vendor marketplace',
          at: new Date(),
          meta: { reason, eligibleCount: result.eligibleCount || 0 }
        });
        await flow.save();
      }

      emitSocket(`b2b:${b2bJob.companyId.toString()}`, 'b2b:jobVendorFallback', {
        jobId: b2bJob.jobId,
        reason,
        eligibleCount: result.eligibleCount || 0
      });
      emitSocket('admin', 'admin:matchingVendorFallback', {
        jobId: b2bJob.jobId,
        companyId: b2bJob.companyId,
        reason,
        eligibleCount: result.eligibleCount || 0
      });

      console.warn(`[Matching] ${b2bJob.jobId} engineer fail → vendor marketplace (${result.eligibleCount || 0})`);
      return;
    }
  } catch (fallbackErr) {
    console.warn(`[Matching] Vendor fallback failed for ${b2bJob.jobId}:`, fallbackErr.message);
  }

  b2bJob.status = 'escalated';
  b2bJob.allocationStage = 'admin_escalation';
  b2bJob.allocationReason = String(escalationReason || 'Allocation failed').slice(0, 300);
  b2bJob.allocationUpdatedAt = new Date();
  await b2bJob.save();

  try {
    const { refundB2BJobEscrow } = require('./escrowReleaseEngine.service');
    await refundB2BJobEscrow({
      jobId: b2bJob._id,
      reason: `matching_escalated:${escalationReason}`
    });
  } catch (refundErr) {
    console.warn(`[Matching] Escrow refund on escalate failed for ${b2bJob.jobId}:`, refundErr.message);
  }

  await JobHistory.create({
    jobId: b2bJob._id,
    status: 'escalated',
    remark: `Allocation failed: ${escalationReason}. Admin escalation required. Escrow returned to wallet.`,
    role: 'system'
  });

  try {
    const EnterpriseProjectFlow = require('../models/EnterpriseProjectFlow');
    await EnterpriseProjectFlow.updateOne(
      { b2bJobId: b2bJob._id },
      {
        $set: { status: 'admin_escalation' },
        $push: {
          timeline: {
            key: 'admin_escalation',
            label: `Matching failed: ${escalationReason}`,
            at: new Date(),
            meta: { reason: escalationReason }
          }
        }
      }
    );
  } catch (_) { /* non-blocking */ }

  emitSocket('admin', 'admin:matchingFailed', {
    jobId: b2bJob.jobId,
    companyId: b2bJob.companyId,
    reason: escalationReason
  });
  emitSocket('admin-room', 'admin:b2bJobEscalated', {
    jobId: b2bJob.jobId,
    mongoId: String(b2bJob._id),
    companyId: String(b2bJob.companyId),
    service: b2bJob.service,
    city: b2bJob.city,
    reason: escalationReason
  });

  emitSocket(`b2b:${b2bJob.companyId.toString()}`, 'b2b:jobEscalated', {
    jobId: b2bJob.jobId,
    reason: escalationReason
  });

  console.warn(`[Matching] Escalated ${b2bJob.jobId}: ${escalationReason}`);
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
  B2B_WAVE_RADII_KM,
  B2B_WAVE_TIMEOUT_MS
};
