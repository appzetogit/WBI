const mongoose = require('mongoose');
const Vendor = require('../../models/Vendor');
const VendorGlobalPerformance = require('../../models/VendorGlobalPerformance');
const VendorGlobalCompliance = require('../../models/VendorGlobalCompliance');
const VendorGlobalNotification = require('../../models/VendorGlobalNotification');
const VendorGlobalSupportTicket = require('../../models/VendorGlobalSupportTicket');
const SupportTicketAudit = require('../../models/SupportTicketAudit');
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
      VendorGlobalNotification.countDocuments({ vendorId: vid, read: false, archived: false }),
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
    const filter = { vendorId: vid };
    await applyService(filter, vid, req.query.category);
    const rows = await VendorGlobalPerformance.find(filter).sort({ updatedAt: -1 }).lean();
    const current = rows[0] || {};
    res.json({ success: true, data: { summary: current, services: rows } });
  } catch (error) {
    console.error('performance:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch performance' });
  }
};

exports.getCompliance = async (req, res) => {
  try {
    const vid = vendorId(req);
    const { page, limit, skip } = pageParams(req);
    const filter = { vendorId: vid };
    if (req.query.status) filter.status = req.query.status;
    if (req.query.categoryType) filter.category = req.query.categoryType;
    await applyService(filter, vid, req.query.category);
    if (req.query.search) {
      const term = esc(req.query.search);
      filter.$or = [{ name: term }, { requirementCode: term }, { serviceCategoryName: term }, { documentNumber: term }];
    }
    const [data, total, stats] = await Promise.all([
      VendorGlobalCompliance.find(filter).sort({ status: 1, expiresAt: 1 }).skip(skip).limit(limit).lean(),
      VendorGlobalCompliance.countDocuments(filter),
      VendorGlobalCompliance.aggregate([
        { $match: { vendorId: vid } },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ])
    ]);
    res.json({ success: true, data, stats, pagination: meta(page, limit, total) });
  } catch (error) {
    console.error('compliance:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch compliance' });
  }
};

exports.updateCompliance = async (req, res) => {
  try {
    const doc = await VendorGlobalCompliance.findOne({ _id: req.params.id, vendorId: vendorId(req) });
    if (!doc) return res.status(404).json({ success: false, message: 'Compliance record not found' });
    const { action } = req.body;
    if (action === 'verify') doc.status = 'verified';
    else if (action === 'reject') doc.status = 'rejected';
    else if (action === 'renew') { doc.status = 'verified'; doc.expiresAt = new Date(Date.now() + 365 * 86400000); }
    else if (action === 'remind') doc.lastReminderAt = new Date();
    await doc.save();
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
    const filter = { vendorId: vid, archived: false };
    if (req.query.read === 'true') filter.read = true;
    if (req.query.read === 'false') filter.read = false;
    if (req.query.module) filter.module = req.query.module;
    if (req.query.priority) filter.priority = req.query.priority;
    if (req.query.search) {
      const term = esc(req.query.search);
      filter.$or = [{ title: term }, { message: term }, { type: term }, { module: term }];
    }
    const [data, total] = await Promise.all([
      VendorGlobalNotification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      VendorGlobalNotification.countDocuments(filter)
    ]);
    res.json({ success: true, data, pagination: meta(page, limit, total) });
  } catch (error) {
    console.error('notifications:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch notifications' });
  }
};

exports.updateNotification = async (req, res) => {
  try {
    const doc = await VendorGlobalNotification.findOne({ _id: req.params.id, vendorId: vendorId(req) });
    if (!doc) return res.status(404).json({ success: false, message: 'Notification not found' });
    const { action } = req.body;
    if (action === 'read') doc.read = true;
    else if (action === 'unread') doc.read = false;
    else if (action === 'archive') doc.archived = true;
    await doc.save();
    res.json({ success: true, data: doc });
  } catch (error) {
    console.error('update notification:', error);
    res.status(500).json({ success: false, message: 'Failed to update notification' });
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
