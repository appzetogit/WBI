/**
 * Channel adapters for the notification worker / inline fallback.
 */
const mongoose = require('mongoose');
const NotificationDeliveryLog = require('../../models/NotificationDeliveryLog');

async function markLog(logId, patch) {
  if (!logId) return;
  try {
    await NotificationDeliveryLog.findByIdAndUpdate(logId, {
      $set: patch,
      $inc: { attempts: 1 }
    });
  } catch (e) {
    console.warn('[notif.adapter] markLog failed:', e.message);
  }
}

async function deliverInApp(job) {
  const { recipientRole, recipientId, title, message, eventKey, actionUrl, data, category, priority } =
    job;
  const type = eventKey || data?.type || 'general';

  if (recipientRole === 'vendor') {
    const { publishVendorNotification } = require('../vendorNotificationCenter.service');
    await publishVendorNotification({
      vendorId: recipientId,
      type,
      title,
      message,
      relatedId: data?.relatedId || data?.projectId || data?.ticketId || null,
      relatedType: data?.relatedType || null,
      metadata: { ...data, notifyCategory: category },
      priority: priority === 'high' ? 'high' : priority === 'low' ? 'low' : 'normal',
      module: data?.module || null,
      actionUrl,
      category: category || 'account',
      skipPush: true,
      dedupeKey: job.logId ? `orch-inapp:${job.logId}` : null
    });
    return { ok: true };
  }

  const { createNotification } = require('../../controllers/notificationControllers/notificationController');
  const payload = {
    type,
    title,
    message,
    relatedId: data?.relatedId || data?.projectId || data?.ticketId || null,
    relatedType: data?.relatedType || null,
    data: { ...data, actionUrl, notifyCategory: category, eventKey },
    skipPush: true,
    priority
  };

  if (recipientRole === 'user') payload.userId = recipientId;
  else if (recipientRole === 'admin') payload.adminId = recipientId;
  else if (recipientRole === 'engineer' || recipientRole === 'worker') payload.workerId = recipientId;
  else if (recipientRole === 'b2b') {
    payload.b2bUserId = recipientId;
    if (data?.b2bCompanyId) payload.b2bCompanyId = data.b2bCompanyId;
  } else if (recipientRole === 'vendor') payload.vendorId = recipientId;

  await createNotification(payload);
  return { ok: true };
}

async function deliverPush(job) {
  const {
    recipientRole,
    recipientId,
    title,
    message,
    actionUrl,
    data,
    eventKey,
    priority
  } = job;
  const fa = require('../firebaseAdmin');
  const payload = {
    title,
    body: message,
    data: {
      type: eventKey,
      link: actionUrl || '',
      ...(data || {})
    },
    priority: priority === 'high' ? 'high' : 'normal'
  };

  let result;
  if (recipientRole === 'vendor') result = await fa.sendNotificationToVendor(recipientId, payload);
  else if (recipientRole === 'user') result = await fa.sendNotificationToUser(recipientId, payload);
  else if (recipientRole === 'worker') result = await fa.sendNotificationToWorker(recipientId, payload);
  else if (recipientRole === 'engineer') result = await fa.sendNotificationToEngineer(recipientId, payload);
  else if (recipientRole === 'admin') result = await fa.sendNotificationToAdmin(recipientId, payload);
  else if (recipientRole === 'b2b') result = await fa.sendNotificationToB2B(recipientId, payload);
  else return { ok: false, error: 'unsupported_role' };

  const successCount = result?.successCount ?? (result ? 1 : 0);
  if (!result || successCount === 0) {
    return { ok: false, error: 'no_tokens_or_failed', result };
  }
  return { ok: true, result };
}

async function deliverEmail(job) {
  const { recipientRole, recipientId, title, message, emailTemplate, data, actionUrl } = job;
  const emailService = require('../emailService');

  let to = data?.email || null;
  if (!to && recipientId) {
    to = await resolveEmail(recipientRole, recipientId);
  }
  if (!to) return { ok: false, error: 'no_email', skipped: true };

  if (emailTemplate && typeof emailService.sendTemplatedNotification === 'function') {
    await emailService.sendTemplatedNotification({
      to,
      template: emailTemplate,
      title,
      message,
      data: { ...data, actionUrl }
    });
    return { ok: true };
  }

  if (typeof emailService.sendMailSafe === 'function') {
    await emailService.sendMailSafe({
      to,
      subject: title,
      html: `<p>${message}</p>${actionUrl ? `<p><a href="${actionUrl}">Open</a></p>` : ''}`
    });
    return { ok: true };
  }

  return { ok: false, error: 'email_unavailable', skipped: true };
}

async function resolveEmail(role, id) {
  try {
    if (role === 'vendor') {
      const v = await require('../../models/Vendor').findById(id).select('email').lean();
      return v?.email || null;
    }
    if (role === 'user') {
      const u = await require('../../models/User').findById(id).select('email').lean();
      return u?.email || null;
    }
    if (role === 'admin') {
      const a = await require('../../models/Admin').findById(id).select('email').lean();
      return a?.email || null;
    }
    if (role === 'engineer') {
      const e = await require('../../models/Engineer').findById(id).select('email').lean();
      return e?.email || null;
    }
    if (role === 'b2b') {
      const b = await require('../../models/B2BUser').findById(id).select('email').lean();
      return b?.email || null;
    }
  } catch {
    return null;
  }
  return null;
}

async function deliverSms(job) {
  const { recipientRole, recipientId, message, smsTemplate, data } = job;
  const templateEnvKey = smsTemplate || null;
  const dltId = templateEnvKey ? process.env[templateEnvKey] : null;

  if (!dltId) {
    return { ok: false, skipped: true, error: 'skipped_no_dlt' };
  }

  let phone = data?.phone || null;
  if (!phone && recipientId) {
    phone = await resolvePhone(recipientRole, recipientId);
  }
  if (!phone) return { ok: false, skipped: true, error: 'no_phone' };

  const { sendSMS } = require('../smsService');
  // Only send if smsService supports templated DLT; otherwise skip free-text transactional
  if (typeof sendSMS !== 'function') {
    return { ok: false, skipped: true, error: 'sms_unavailable' };
  }

  // Prefer dedicated templated sender when present
  const smsService = require('../smsService');
  if (typeof smsService.sendTemplatedSMS === 'function') {
    await smsService.sendTemplatedSMS(phone, dltId, data?.smsVars || {});
    return { ok: true };
  }

  // Without DLT variable API, do not send free-text for transactional product alerts
  return { ok: false, skipped: true, error: 'skipped_no_dlt_api' };
}

async function resolvePhone(role, id) {
  try {
    if (role === 'vendor') {
      const v = await require('../../models/Vendor').findById(id).select('phone').lean();
      return v?.phone || null;
    }
    if (role === 'user') {
      const u = await require('../../models/User').findById(id).select('phone').lean();
      return u?.phone || null;
    }
    if (role === 'engineer') {
      const e = await require('../../models/Engineer').findById(id).select('phone').lean();
      return e?.phone || null;
    }
    if (role === 'b2b') {
      const b = await require('../../models/B2BUser').findById(id).select('mobile').lean();
      return b?.mobile || null;
    }
  } catch {
    return null;
  }
  return null;
}

async function deliverWhatsapp(job) {
  // Future-ready stub
  return { ok: false, skipped: true, error: 'whatsapp_future', provider: 'future' };
}

async function maybeFallback(job, pushResult) {
  if (!job.fallbackOnPushFail || job.priority !== 'high') return;
  if (pushResult?.ok) return;

  const { emit } = require('./notificationOrchestrator.service');
  // Enqueue email/sms as separate channel jobs via direct deliver to avoid recursion storms
  const base = { ...job, fallbackOnPushFail: false };
  if (!job._didEmailFallback) {
    await deliverChannel({ ...base, channel: 'email', type: 'deliver_channel', _didEmailFallback: true });
  }
  if (!job._didSmsFallback) {
    await deliverChannel({ ...base, channel: 'sms', type: 'deliver_channel', _didSmsFallback: true });
  }
}

/**
 * Deliver a single channel job payload.
 */
async function deliverChannel(job) {
  const channel = job.channel;
  let result = { ok: false };

  try {
    if (channel === 'in_app') result = await deliverInApp(job);
    else if (channel === 'push') {
      result = await deliverPush(job);
      await maybeFallback(job, result);
    } else if (channel === 'email') result = await deliverEmail(job);
    else if (channel === 'sms') result = await deliverSms(job);
    else if (channel === 'whatsapp') result = await deliverWhatsapp(job);
    else result = { ok: false, error: 'unknown_channel' };

    if (result.skipped) {
      await markLog(job.logId, {
        status: 'skipped',
        skipReason: result.error || 'skipped',
        providerRef: result.provider || null
      });
      console.log(`[notif.skipped] ${JSON.stringify({ channel, eventKey: job.eventKey, reason: result.error })}`);
      return result;
    }

    if (result.ok) {
      await markLog(job.logId, { status: 'sent', sentAt: new Date(), lastError: null });
      console.log(`[notif.sent] ${JSON.stringify({ channel, eventKey: job.eventKey, role: job.recipientRole })}`);
    } else {
      await markLog(job.logId, { status: 'failed', lastError: result.error || 'failed' });
      console.log(`[notif.failed] ${JSON.stringify({ channel, eventKey: job.eventKey, error: result.error })}`);
      if (!result.skipped) {
        const err = new Error(result.error || 'delivery_failed');
        err.retryable = channel === 'push' || channel === 'email' || channel === 'sms';
        throw err;
      }
    }
    return result;
  } catch (err) {
    await markLog(job.logId, { status: 'failed', lastError: err.message });
    throw err;
  }
}

async function processBroadcastChunk(job) {
  const { eventKey, role, channels, data, priority, actorId } = job;
  const limit = 200;
  let ids = [];

  if (role === 'vendor') {
    ids = await require('../../models/Vendor').find({ isActive: true, approvalStatus: 'approved' }).select('_id').limit(limit).lean();
  } else if (role === 'user') {
    ids = await require('../../models/User').find({ isActive: { $ne: false } }).select('_id').limit(limit).lean();
  } else if (role === 'engineer') {
    ids = await require('../../models/Engineer').find({ approvalStatus: 'approved' }).select('_id').limit(limit).lean();
  } else if (role === 'admin') {
    ids = await require('../../models/Admin').find({ isActive: true }).select('_id').lean();
  } else if (role === 'b2b') {
    ids = await require('../../models/B2BUser').find({ status: 'active' }).select('_id').limit(limit).lean();
  }

  const { emit } = require('./notificationOrchestrator.service');
  const targetKey = `${role}Ids`;
  await emit(eventKey === 'system_announcement' ? 'system_announcement' : eventKey, {
    targets: { [targetKey]: ids.map((x) => x._id) },
    data: {
      ...data,
      announcementId: data?.announcementId || `ann-${Date.now()}`,
      dedupeSeed: data?.dedupeSeed || `${Date.now()}`
    },
    actorId,
    channels
  });
  return { ok: true, count: ids.length };
}

module.exports = {
  deliverChannel,
  processBroadcastChunk,
  deliverInApp,
  deliverPush,
  deliverEmail,
  deliverSms,
  deliverWhatsapp
};
