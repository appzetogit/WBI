/**
 * Central notification orchestrator — sole public API for product events.
 * emit(eventKey, payload) → delivery logs → queue (or inline fallback)
 */
const crypto = require('crypto');
const mongoose = require('mongoose');
const NotificationDeliveryLog = require('../../models/NotificationDeliveryLog');
const { getEventDef } = require('./eventCatalog');
const { getRedis, isRedisConnected } = require('../redisService');

const INLINE_FALLBACK =
  process.env.NOTIF_INLINE_FALLBACK !== 'false'; // default true

function logMetric(event, fields = {}) {
  console.log(`[notif.${event}]`, JSON.stringify(fields));
}

async function shortDedupe(key, ttlSec = 30) {
  if (!key) return false;
  try {
    if (!isRedisConnected()) return false;
    const set = await getRedis().set(`notif:orch:dedup:${key}`, '1', 'EX', ttlSec, 'NX');
    return set !== 'OK';
  } catch {
    return false;
  }
}

function hasSpecificRecipientTargets(targets = {}) {
  const keys = [
    'vendorId', 'vendorIds', 'engineerId', 'engineerIds', 'userId', 'userIds',
    'workerId', 'workerIds', 'b2bId', 'b2bIds', 'b2bUserId', 'b2bUserIds',
    'b2bCompanyId', 'adminId', 'adminIds'
  ];
  return keys.some((k) => {
    const v = targets[k];
    return Array.isArray(v) ? v.length > 0 : !!v;
  });
}

function resolveTargets(eventDef, targets = {}) {
  /** @type {{ role: string, id: string|null }[]} */
  const out = [];
  const roles = eventDef.recipients || [];

  for (const role of roles) {
    if (role === 'broadcast') {
      const audiences = targets.broadcastRoles || ['vendor', 'user', 'engineer', 'b2b', 'admin'];
      const idsByRole = targets.broadcastIds || {};
      for (const r of audiences) {
        const ids = idsByRole[r] || [];
        if (!ids.length && targets.broadcastAll) {
          out.push({ role: r, id: null, broadcast: true });
        } else {
          ids.forEach((id) => out.push({ role: r, id: String(id) }));
        }
      }
      continue;
    }

    const key = `${role}Id`;
    const plural = `${role}Ids`;
    // Aliases: b2bUserId / b2bUserIds → b2b
    const aliasKey = role === 'b2b' ? 'b2bUserId' : null;
    const aliasPlural = role === 'b2b' ? 'b2bUserIds' : null;

    if (targets[plural]?.length) {
      targets[plural].forEach((id) => out.push({ role, id: String(id) }));
    } else if (aliasPlural && targets[aliasPlural]?.length) {
      targets[aliasPlural].forEach((id) => out.push({ role, id: String(id) }));
    } else if (targets[key]) {
      out.push({ role, id: String(targets[key]) });
    } else if (aliasKey && targets[aliasKey]) {
      out.push({ role, id: String(targets[aliasKey]) });
    } else if (role === 'b2b' && targets.b2bCompanyId) {
      out.push({ role: 'b2b', id: null, allCompanyUsers: true, companyId: String(targets.b2bCompanyId) });
    } else if (role === 'admin') {
      // Fan-out to all admins only for admin-centric events (or explicit flag)
      if (targets.notifyAllAdmins || !hasSpecificRecipientTargets(targets)) {
        out.push({ role: 'admin', id: null, allAdmins: true });
      }
    }
  }

  // Explicit overrides from caller
  if (Array.isArray(targets.extra)) {
    targets.extra.forEach((t) => {
      if (t?.role && (t.id || t.allAdmins || t.broadcast)) out.push(t);
    });
  }

  return out;
}

async function expandRecipients(resolved) {
  const expanded = [];
  for (const t of resolved) {
    if (t.role === 'admin' && (t.allAdmins || !t.id)) {
      try {
        const Admin = require('../../models/Admin');
        const admins = await Admin.find({ isActive: true }).select('_id').lean();
        admins.forEach((a) => expanded.push({ role: 'admin', id: String(a._id) }));
      } catch (e) {
        console.warn('[orchestrator] admin expand failed:', e.message);
      }
      continue;
    }
    if (t.role === 'b2b' && t.allCompanyUsers && t.companyId) {
      try {
        const B2BUser = require('../../models/B2BUser');
        const users = await B2BUser.find({ companyId: t.companyId, isActive: { $ne: false } })
          .select('_id')
          .lean();
        users.forEach((u) => expanded.push({ role: 'b2b', id: String(u._id) }));
      } catch (e) {
        console.warn('[orchestrator] b2b company expand failed:', e.message);
      }
      continue;
    }
    if (t.broadcast && !t.id) {
      // Chunked broadcast handled by worker job — keep as marker
      expanded.push(t);
      continue;
    }
    if (t.id) expanded.push(t);
  }
  return expanded;
}

/** BullMQ rejects custom job ids containing ':'. */
const toQueueJobId = (value) =>
  value ? String(value).replace(/:/g, '_').slice(0, 120) : undefined;

async function enqueueOrInline(jobName, data, opts = {}) {
  try {
    const { notificationQueue } = require('../../jobs/queueSetup');
    const job = await notificationQueue.add(jobName, data, {
      attempts: opts.attempts || 5,
      backoff: { type: 'exponential', delay: opts.delay || 2000 },
      removeOnComplete: 1000,
      removeOnFail: 5000,
      delay: opts.scheduleDelay || 0,
      jobId: toQueueJobId(opts.jobId)
    });
    return { queued: true, jobId: job.id };
  } catch (err) {
    console.warn('[orchestrator] queue unavailable:', err.message);
    if (!INLINE_FALLBACK) throw err;
    const { deliverChannel } = require('./channelAdapters');
    await deliverChannel(data);
    return { queued: false, inline: true };
  }
}

/**
 * Emit a catalogued notification event.
 * @param {string} eventKey
 * @param {object} opts
 * @param {object} [opts.targets] - { vendorId, engineerId, userId, adminId, b2bUserId, b2bCompanyId, ...Ids, broadcastRoles, broadcastIds }
 * @param {object} [opts.data] - template data
 * @param {string} [opts.actorId]
 * @param {Date|string|number} [opts.scheduleAt]
 * @param {string[]} [opts.channels] - override catalog channels
 * @param {string} [opts.dedupeKey] - override
 */
async function emit(eventKey, opts = {}) {
  const eventDef = getEventDef(eventKey);
  if (!eventDef) {
    console.warn(`[orchestrator] unknown eventKey: ${eventKey}`);
    return { success: false, error: 'unknown_event' };
  }

  const data = opts.data || {};
  const channels = opts.channels || eventDef.channels || ['in_app'];
  const scheduleAt = opts.scheduleAt ? new Date(opts.scheduleAt) : null;
  const scheduleDelay =
    scheduleAt && scheduleAt.getTime() > Date.now()
      ? scheduleAt.getTime() - Date.now()
      : 0;

  const resolved = resolveTargets(eventDef, opts.targets || {});
  const recipients = await expandRecipients(resolved);

  if (!recipients.length) {
    logMetric('skipped', { eventKey, reason: 'no_recipients' });
    return { success: true, delivered: 0, reason: 'no_recipients' };
  }

  const logs = [];
  const jobs = [];

  for (const recipient of recipients) {
    if (recipient.broadcast && !recipient.id) {
      const jobData = {
        type: 'broadcast_chunk',
        eventKey,
        role: recipient.role,
        channels,
        data,
        priority: eventDef.priority,
        actorId: opts.actorId || null
      };
      const enq = await enqueueOrInline('broadcast_chunk', jobData, {
        scheduleDelay,
        jobId: `bcast:${eventKey}:${recipient.role}:${crypto.randomBytes(4).toString('hex')}`
      });
      jobs.push(enq);
      continue;
    }

    for (const channel of channels) {
      const dedupeKey =
        opts.dedupeKey ||
        eventDef.dedupe(data, recipient.role, recipient.id) + `:${channel}`;

      if (await shortDedupe(dedupeKey)) {
        logMetric('skipped', { eventKey, channel, reason: 'redis_dedupe', dedupeKey });
        continue;
      }

      const title = typeof eventDef.title === 'function' ? eventDef.title(data) : eventDef.title;
      const message = typeof eventDef.message === 'function' ? eventDef.message(data) : eventDef.message;
      const actionUrl =
        typeof eventDef.actionUrl === 'function'
          ? eventDef.actionUrl(data, recipient.role)
          : eventDef.actionUrl;

      let logDoc;
      try {
        logDoc = await NotificationDeliveryLog.create({
          eventKey,
          dedupeKey,
          recipientRole: recipient.role,
          recipientId: recipient.id ? new mongoose.Types.ObjectId(recipient.id) : null,
          channel,
          status: 'queued',
          priority: eventDef.priority,
          title,
          message,
          actionUrl,
          payloadSnapshot: { ...data, category: eventDef.category },
          scheduledAt: scheduleAt
        });
      } catch (err) {
        if (err?.code === 11000) {
          logMetric('skipped', { eventKey, channel, reason: 'dedupe_log', dedupeKey });
          continue;
        }
        throw err;
      }

      const jobPayload = {
        type: 'deliver_channel',
        logId: String(logDoc._id),
        eventKey,
        channel,
        recipientRole: recipient.role,
        recipientId: recipient.id,
        title,
        message,
        actionUrl,
        priority: eventDef.priority,
        category: eventDef.category,
        data,
        emailTemplate: eventDef.emailTemplate || null,
        smsTemplate: eventDef.smsTemplate || null,
        fallbackOnPushFail: !!eventDef.fallbackOnPushFail
      };

      const enq = await enqueueOrInline('deliver_channel', jobPayload, {
        scheduleDelay,
        jobId: dedupeKey
      });
      logs.push(logDoc._id);
      jobs.push(enq);
    }
  }

  logMetric('emitted', {
    eventKey,
    recipients: recipients.length,
    jobs: jobs.length,
    logs: logs.length
  });

  return {
    success: true,
    eventKey,
    recipientCount: recipients.length,
    logIds: logs,
    jobs
  };
}

/** Fire-and-forget wrapper for domain controllers */
function emitAsync(eventKey, opts = {}) {
  setImmediate(() => {
    emit(eventKey, opts).catch((err) => {
      console.error(`[orchestrator] emitAsync ${eventKey}:`, err.message);
    });
  });
}

module.exports = {
  emit,
  emitAsync,
  resolveTargets,
  expandRecipients
};
