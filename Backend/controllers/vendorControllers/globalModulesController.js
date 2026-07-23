const mongoose = require('mongoose');
const Vendor = require('../../models/Vendor');
const VendorGlobalPerformance = require('../../models/VendorGlobalPerformance');
const VendorGlobalCompliance = require('../../models/VendorGlobalCompliance');
const VendorGlobalNotification = require('../../models/VendorGlobalNotification');
const VendorGlobalSupportTicket = require('../../models/VendorGlobalSupportTicket');
const SupportTicketAudit = require('../../models/SupportTicketAudit');
const VendorGlobalSetting = require('../../models/VendorGlobalSetting');
const {
  resolveSupportConfig,
  publicConfigView,
  createTicket,
  transitionTicket,
  addComment
} = require('../../services/vendorSupportService');

const vendorId = (req) => new mongoose.Types.ObjectId(req.user._id || req.user.id);
const vendorActor = (req) => ({
  role: 'vendor',
  id: req.user._id || req.user.id,
  name: req.user.businessName || req.user.name || req.user.email || 'Vendor'
});
const esc = (value) => new RegExp(String(value).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
const pageParams = (req) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 12));
  return { page, limit, skip: (page - 1) * limit };
};
const meta = (page, limit, total) => ({ page, limit, total, pages: Math.ceil(total / limit) || 1 });

const applyService = async (filter, vid, category) => {
  if (category) {
    filter.serviceCategoryCode = category;
    return;
  }
  const vendor = await Vendor.findById(vid).select('approvedServices').lean();
  const codes = (vendor?.approvedServices || []).filter((s) => s.status === 'active').map((s) => s.categoryCode).filter(Boolean);
  if (codes.length) filter.serviceCategoryCode = { $in: codes };
};

exports.getGlobalCounts = async (req, res) => {
  try {
    const vid = vendorId(req);
    const soon = new Date(Date.now() + 30 * 86400000);
    const [unreadNotifications, openTickets, complianceAlerts] = await Promise.all([
      VendorGlobalNotification.countDocuments({
        vendorId: vid,
        read: false,
        archived: { $ne: true },
        deleted: { $ne: true }
      }),
      VendorGlobalSupportTicket.countDocuments({ vendorId: vid, status: { $in: ['open', 'assigned', 'investigation'] } }),
      VendorGlobalCompliance.countDocuments({
        vendorId: vid,
        $or: [{ status: { $in: ['pending', 'expired', 'rejected', 'renewal_required'] } }, { expiresAt: { $lte: soon } }]
      })
    ]);
    res.json({ success: true, data: { unreadNotifications, openTickets, complianceAlerts } });
  } catch (error) {
    console.error('global counts:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch global counts' });
  }
};

exports.getPerformance = async (req, res) => {
  try {
    const vid = vendorId(req);
    const { computeVendorPerformance } = require('../../services/vendorPerformance.service');
    const data = await computeVendorPerformance(vid, {
      categoryCode: req.query.category || ''
    });
    res.json({ success: true, data });
  } catch (error) {
    console.error('performance:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to fetch performance' });
  }
};

exports.getCompliance = async (req, res) => {
  try {
    const vid = vendorId(req);
    const { syncVendorCompliance } = require('../../services/vendorCompliance.service');
    // Ensure templates exist from service config + vault docs
    await syncVendorCompliance(vid).catch((err) => console.warn('[compliance sync]', err.message));

    const { page, limit, skip } = pageParams(req);
    const filter = { vendorId: vid, demoTag: null };
    if (req.query.status) filter.status = req.query.status;
    if (req.query.categoryType) filter.category = req.query.categoryType;
    if (req.query.category) {
      filter.serviceCategoryCode = String(req.query.category).toUpperCase();
    } else {
      const vendor = await Vendor.findById(vid).select('approvedServices').lean();
      const codes = (vendor?.approvedServices || [])
        .filter((s) => s.status === 'active' || s.status === 'approved' || !s.status)
        .map((s) => s.categoryCode)
        .filter(Boolean);
      if (codes.length) {
        filter.$or = [
          { serviceCategoryCode: { $in: codes } },
          { serviceCategoryCode: '' },
          { serviceCategoryCode: { $exists: false } }
        ];
      }
    }
    if (req.query.search) {
      const term = esc(req.query.search);
      filter.$and = (filter.$and || []).concat([
        { $or: [{ name: term }, { requirementCode: term }, { serviceCategoryName: term }, { documentNumber: term }] }
      ]);
    }
    const [data, total, stats] = await Promise.all([
      VendorGlobalCompliance.find(filter).sort({ status: 1, expiresAt: 1 }).skip(skip).limit(limit).lean(),
      VendorGlobalCompliance.countDocuments(filter),
      VendorGlobalCompliance.aggregate([
        { $match: { vendorId: vid, demoTag: null } },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ])
    ]);
    res.json({ success: true, data, stats, pagination: meta(page, limit, total) });
  } catch (error) {
    console.error('compliance:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch compliance' });
  }
};

exports.syncCompliance = async (req, res) => {
  try {
    const { syncVendorCompliance } = require('../../services/vendorCompliance.service');
    const result = await syncVendorCompliance(vendorId(req));
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Sync failed' });
  }
};

exports.uploadComplianceDocument = async (req, res) => {
  try {
    const { attachComplianceDocument } = require('../../services/vendorCompliance.service');
    const documentUrl = req.file?.path || req.file?.secure_url || req.body.documentUrl;
    const doc = await attachComplianceDocument(vendorId(req), req.params.id, {
      documentUrl,
      documentNumber: req.body.documentNumber,
      expiresAt: req.body.expiresAt,
      notes: req.body.notes
    });
    res.json({ success: true, data: doc });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, message: error.message || 'Upload failed' });
  }
};

exports.updateCompliance = async (req, res) => {
  try {
    const doc = await VendorGlobalCompliance.findOne({ _id: req.params.id, vendorId: vendorId(req) });
    if (!doc) return res.status(404).json({ success: false, message: 'Compliance record not found' });
    const { action, notes, expiresAt, documentNumber } = req.body;
    const before = doc.status;

    if (action === 'verify') {
      if (!doc.documentUrl && !doc.documentNumber) {
        return res.status(400).json({
          success: false,
          message: 'Upload a document before verifying'
        });
      }
      doc.status = 'verified';
      doc.verifiedAt = new Date();
      doc.verifiedBy = vendorId(req);
    } else if (action === 'reject') {
      doc.status = 'rejected';
      if (notes) doc.notes = notes;
    } else if (action === 'renew') {
      doc.status = 'pending';
      if (expiresAt) doc.expiresAt = new Date(expiresAt);
      else doc.expiresAt = new Date(Date.now() + 365 * 86400000);
      if (documentNumber) doc.documentNumber = documentNumber;
    } else if (action === 'remind') {
      doc.lastReminderAt = new Date();
    } else {
      return res.status(400).json({ success: false, message: 'Invalid action' });
    }

    doc.auditHistory = doc.auditHistory || [];
    doc.auditHistory.push({
      action: action || 'update',
      actorType: 'vendor',
      actorId: vendorId(req),
      notes: notes || `Status ${before} → ${doc.status}`,
      at: new Date()
    });
    await doc.save();

    try {
      const { publishVendorNotification } = require('../../services/vendorNotificationCenter.service');
      if (action === 'remind' || action === 'reject' || action === 'verify') {
        await publishVendorNotification({
          vendorId: doc.vendorId,
          type: action === 'reject' ? 'document_verification' : action === 'verify' ? 'document_verification' : 'compliance_alert',
          title:
            action === 'verify'
              ? 'Compliance document verified'
              : action === 'reject'
                ? 'Compliance document rejected'
                : 'Compliance reminder sent',
          message: `${doc.name} — status: ${doc.status}`,
          module: 'compliance',
          priority: action === 'reject' ? 'urgent' : 'normal',
          relatedId: doc._id,
          relatedType: 'compliance',
          actionUrl: 'compliance',
          metadata: { status: doc.status, action },
          category: 'account'
        });
      }
    } catch (_) { /* non-blocking */ }

    res.json({ success: true, data: doc });
  } catch (error) {
    console.error('update compliance:', error);
    res.status(500).json({ success: false, message: 'Failed to update compliance' });
  }
};

exports.getNotifications = async (req, res) => {
  try {
    const vid = vendorId(req);
    const { page, limit, skip } = pageParams(req);
    const filter = { vendorId: vid, deleted: { $ne: true } };
    if (req.query.archived === 'true') filter.archived = true;
    else if (req.query.archived !== 'all') filter.archived = { $ne: true };
    if (req.query.read === 'true') filter.read = true;
    if (req.query.read === 'false') filter.read = false;
    if (req.query.module) filter.module = req.query.module;
    if (req.query.priority) {
      filter.priority = req.query.priority === 'critical'
        ? { $in: ['critical', 'urgent'] }
        : req.query.priority;
    }
    if (req.query.type) filter.type = req.query.type;
    if (req.query.search) {
      const term = esc(req.query.search);
      filter.$or = [{ title: term }, { message: term }, { type: term }, { module: term }, { eventType: term }];
    }
    const [data, total, unreadCount] = await Promise.all([
      VendorGlobalNotification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      VendorGlobalNotification.countDocuments(filter),
      VendorGlobalNotification.countDocuments({ vendorId: vid, read: false, archived: { $ne: true }, deleted: { $ne: true } })
    ]);
    res.json({
      success: true,
      data,
      pagination: meta(page, limit, total),
      meta: { unreadCount }
    });
  } catch (error) {
    console.error('notifications:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch notifications' });
  }
};

exports.updateNotification = async (req, res) => {
  try {
    const doc = await VendorGlobalNotification.findOne({
      _id: req.params.id,
      vendorId: vendorId(req),
      deleted: { $ne: true }
    });
    if (!doc) return res.status(404).json({ success: false, message: 'Notification not found' });
    const { action } = req.body;
    if (action === 'read') {
      doc.read = true;
      doc.readAt = new Date();
      doc.auditLog.push({ action: 'read', actorType: 'vendor', actorId: vendorId(req), at: new Date() });
    } else if (action === 'unread') {
      doc.read = false;
      doc.readAt = null;
      doc.auditLog.push({ action: 'unread', actorType: 'vendor', actorId: vendorId(req), at: new Date() });
    } else if (action === 'archive') {
      doc.archived = true;
      doc.auditLog.push({ action: 'archive', actorType: 'vendor', actorId: vendorId(req), at: new Date() });
    } else if (action === 'unarchive') {
      doc.archived = false;
      doc.auditLog.push({ action: 'unarchive', actorType: 'vendor', actorId: vendorId(req), at: new Date() });
    } else if (action === 'delete') {
      doc.deleted = true;
      doc.deletedAt = new Date();
      doc.auditLog.push({ action: 'delete', actorType: 'vendor', actorId: vendorId(req), at: new Date() });
    } else {
      return res.status(400).json({ success: false, message: 'Invalid action' });
    }
    await doc.save();
    res.json({ success: true, data: doc });
  } catch (error) {
    console.error('update notification:', error);
    res.status(500).json({ success: false, message: 'Failed to update notification' });
  }
};

exports.bulkUpdateNotifications = async (req, res) => {
  try {
    const vid = vendorId(req);
    const { ids = [], action } = req.body || {};
    if (!Array.isArray(ids) || !ids.length) {
      return res.status(400).json({ success: false, message: 'ids required' });
    }
    if (!['read', 'unread', 'archive', 'unarchive', 'delete'].includes(action)) {
      return res.status(400).json({ success: false, message: 'Invalid action' });
    }

    const filter = { _id: { $in: ids }, vendorId: vid, deleted: { $ne: true } };
    const update = { $push: { auditLog: { action: `bulk_${action}`, actorType: 'vendor', actorId: vid, at: new Date() } } };
    if (action === 'read') update.$set = { read: true, readAt: new Date() };
    else if (action === 'unread') update.$set = { read: false, readAt: null };
    else if (action === 'archive') update.$set = { archived: true };
    else if (action === 'unarchive') update.$set = { archived: false };
    else if (action === 'delete') update.$set = { deleted: true, deletedAt: new Date() };

    const result = await VendorGlobalNotification.updateMany(filter, update);
    res.json({ success: true, data: { matched: result.matchedCount, modified: result.modifiedCount } });
  } catch (error) {
    console.error('bulk notifications:', error);
    res.status(500).json({ success: false, message: 'Bulk update failed' });
  }
};

exports.markAllNotificationsRead = async (req, res) => {
  try {
    const vid = vendorId(req);
    const result = await VendorGlobalNotification.updateMany(
      { vendorId: vid, read: false, deleted: { $ne: true }, archived: { $ne: true } },
      {
        $set: { read: true, readAt: new Date() },
        $push: { auditLog: { action: 'mark_all_read', actorType: 'vendor', actorId: vid, at: new Date() } }
      }
    );
    res.json({ success: true, data: { modified: result.modifiedCount } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to mark all read' });
  }
};

exports.getNotificationPreferences = async (req, res) => {
  try {
    const vid = vendorId(req);
    const Vendor = require('../../models/Vendor');
    const [settingsDoc, vendor] = await Promise.all([
      VendorGlobalSetting.findOne({ vendorId: vid }).lean(),
      Vendor.findById(vid).select('settings').lean()
    ]);
    res.json({
      success: true,
      data: {
        channels: settingsDoc?.notificationSettings || {
          email: true, sms: false, push: true, whatsapp: false, marketing: false, systemAlerts: true
        },
        categories: vendor?.settings?.notificationPreferences || {
          leads: true, jobs: true, payments: true, account: true
        },
        master: vendor?.settings?.notifications !== false,
        soundAlerts: vendor?.settings?.soundAlerts !== false
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load preferences' });
  }
};

exports.updateNotificationPreferences = async (req, res) => {
  try {
    const vid = vendorId(req);
    const Vendor = require('../../models/Vendor');
    const { channels, categories, master, soundAlerts } = req.body || {};

    if (channels && typeof channels === 'object') {
      await VendorGlobalSetting.findOneAndUpdate(
        { vendorId: vid },
        { $set: Object.fromEntries(Object.entries(channels).map(([k, v]) => [`notificationSettings.${k}`, Boolean(v)])) },
        { upsert: true, new: true }
      );
    }

    const vendorUpdate = {};
    if (typeof master === 'boolean') vendorUpdate['settings.notifications'] = master;
    if (typeof soundAlerts === 'boolean') vendorUpdate['settings.soundAlerts'] = soundAlerts;
    if (categories && typeof categories === 'object') {
      Object.entries(categories).forEach(([k, v]) => {
        vendorUpdate[`settings.notificationPreferences.${k}`] = Boolean(v);
      });
    }
    if (Object.keys(vendorUpdate).length) {
      await Vendor.findByIdAndUpdate(vid, { $set: vendorUpdate });
    }

    return exports.getNotificationPreferences(req, res);
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update preferences' });
  }
};

exports.getSupportConfig = async (req, res) => {
  try {
    const cfg = await resolveSupportConfig(req.query.serviceCategoryCode || '');
    res.json({ success: true, data: publicConfigView(cfg) });
  } catch (error) {
    console.error('support config:', error);
    res.status(500).json({ success: false, message: 'Failed to load support configuration' });
  }
};

exports.getSupport = async (req, res) => {
  try {
    const vid = vendorId(req);
    const { page, limit, skip } = pageParams(req);
    const filter = { vendorId: vid };
    if (req.query.status) filter.status = req.query.status;
    if (req.query.priority) filter.priority = req.query.priority;
    if (req.query.categoryType || req.query.category) filter.category = req.query.categoryType || req.query.category;
    if (req.query.tag) filter.tags = req.query.tag;
    await applyService(filter, vid, req.query.categoryCode || req.query.serviceCategoryCode);
    if (req.query.search) {
      const term = esc(req.query.search);
      filter.$or = [{ subject: term }, { ticketCode: term }, { description: term }, { assignedTeam: term }];
    }
    const sort = {};
    const sortBy = req.query.sortBy || 'updatedAt';
    const sortDir = req.query.sortDir === 'asc' ? 1 : -1;
    sort[sortBy] = sortDir;

    const [data, total, stats] = await Promise.all([
      VendorGlobalSupportTicket.find(filter).sort(sort).skip(skip).limit(limit).lean(),
      VendorGlobalSupportTicket.countDocuments(filter),
      VendorGlobalSupportTicket.aggregate([
        { $match: { vendorId: vid } },
        { $group: { _id: '$status', count: { $sum: 1 }, avgResponse: { $avg: '$averageResponseMinutes' } } }
      ])
    ]);
    const cfg = await resolveSupportConfig(req.query.serviceCategoryCode || '');
    res.json({
      success: true,
      data,
      stats,
      pagination: meta(page, limit, total),
      config: publicConfigView(cfg)
    });
  } catch (error) {
    console.error('support:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch support tickets' });
  }
};

exports.getSupportTicket = async (req, res) => {
  try {
    const ticket = await VendorGlobalSupportTicket.findOne({
      _id: req.params.id,
      vendorId: vendorId(req)
    }).lean();
    if (!ticket) return res.status(404).json({ success: false, message: 'Ticket not found' });
    const replies = (ticket.replies || []).filter((r) => !r.internal);
    const audit = await SupportTicketAudit.find({ ticketId: ticket._id })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    res.json({ success: true, data: { ...ticket, replies, audit } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load ticket' });
  }
};

exports.createSupportTicket = async (req, res) => {
  try {
    const result = await createTicket({
      vendorId: vendorId(req),
      body: req.body,
      actor: vendorActor(req),
      req
    });
    if (!result.ok) return res.status(result.status || 400).json({ success: false, message: result.message });
    res.status(201).json({ success: true, data: result.data });
  } catch (error) {
    console.error('create ticket:', error);
    res.status(500).json({ success: false, message: 'Failed to create support ticket' });
  }
};

exports.updateSupportTicket = async (req, res) => {
  try {
    const doc = await VendorGlobalSupportTicket.findOne({ _id: req.params.id, vendorId: vendorId(req) });
    if (!doc) return res.status(404).json({ success: false, message: 'Ticket not found' });

    if (req.body.action === 'comment' || (!req.body.action && req.body.message)) {
      const result = await addComment({
        ticket: doc,
        message: req.body.message,
        internal: false,
        attachments: req.body.attachments,
        actor: vendorActor(req),
        req
      });
      if (!result.ok) return res.status(result.status || 400).json({ success: false, message: result.message });
      return res.json({ success: true, data: result.data });
    }

    const result = await transitionTicket({
      ticket: doc,
      action: req.body.action,
      message: req.body.message,
      actor: vendorActor(req),
      req
    });
    if (!result.ok) return res.status(result.status || 400).json({ success: false, message: result.message });
    res.json({ success: true, data: result.data });
  } catch (error) {
    console.error('update ticket:', error);
    res.status(500).json({ success: false, message: 'Failed to update support ticket' });
  }
};

exports.getSettings = async (req, res) => {
  try {
    const { hydrateVendorSettings } = require('../../services/vendorSettingsService');
    const result = await hydrateVendorSettings(vendorId(req));
    if (!result.ok) return res.status(result.status || 400).json({ success: false, message: result.message });
    res.json({ success: true, data: result.data });
  } catch (error) {
    console.error('settings:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch settings' });
  }
};

exports.updateSettings = async (req, res) => {
  try {
    const { updateVendorSettings } = require('../../services/vendorSettingsService');
    const result = await updateVendorSettings(vendorId(req), req.body || {});
    if (!result.ok) return res.status(result.status || 400).json({ success: false, message: result.message });
    res.json({ success: true, data: result.data });
  } catch (error) {
    console.error('update settings:', error);
    res.status(500).json({ success: false, message: 'Failed to update settings' });
  }
};
