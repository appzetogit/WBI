const mongoose = require('mongoose');
const Vendor = require('../../models/Vendor');
const VendorGlobalPerformance = require('../../models/VendorGlobalPerformance');
const VendorGlobalCompliance = require('../../models/VendorGlobalCompliance');
const VendorGlobalNotification = require('../../models/VendorGlobalNotification');
const VendorGlobalSupportTicket = require('../../models/VendorGlobalSupportTicket');
const VendorGlobalSetting = require('../../models/VendorGlobalSetting');

const vendorId = (req) => new mongoose.Types.ObjectId(req.user._id || req.user.id);
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

exports.getSupport = async (req, res) => {
  try {
    const vid = vendorId(req);
    const { page, limit, skip } = pageParams(req);
    const filter = { vendorId: vid };
    if (req.query.status) filter.status = req.query.status;
    if (req.query.priority) filter.priority = req.query.priority;
    if (req.query.categoryType) filter.category = req.query.categoryType;
    await applyService(filter, vid, req.query.category);
    if (req.query.search) {
      const term = esc(req.query.search);
      filter.$or = [{ subject: term }, { ticketCode: term }, { description: term }, { assignedTeam: term }];
    }
    const [data, total, stats] = await Promise.all([
      VendorGlobalSupportTicket.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(limit).lean(),
      VendorGlobalSupportTicket.countDocuments(filter),
      VendorGlobalSupportTicket.aggregate([{ $match: { vendorId: vid } }, { $group: { _id: '$status', count: { $sum: 1 }, avgResponse: { $avg: '$averageResponseMinutes' } } }])
    ]);
    res.json({ success: true, data, stats, pagination: meta(page, limit, total) });
  } catch (error) {
    console.error('support:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch support tickets' });
  }
};

exports.createSupportTicket = async (req, res) => {
  try {
    const ticket = await new VendorGlobalSupportTicket({
      vendorId: vendorId(req),
      subject: req.body.subject || 'New support request',
      description: req.body.description || '',
      category: req.body.category || 'general',
      priority: req.body.priority || 'medium',
      serviceCategoryCode: req.body.serviceCategoryCode || '',
      serviceCategoryName: req.body.serviceCategoryName || ''
    }).save();
    res.status(201).json({ success: true, data: ticket });
  } catch (error) {
    console.error('create ticket:', error);
    res.status(500).json({ success: false, message: 'Failed to create support ticket' });
  }
};

exports.updateSupportTicket = async (req, res) => {
  try {
    const doc = await VendorGlobalSupportTicket.findOne({ _id: req.params.id, vendorId: vendorId(req) });
    if (!doc) return res.status(404).json({ success: false, message: 'Ticket not found' });
    const { action, message } = req.body;
    if (action === 'assign') doc.status = 'assigned';
    else if (action === 'investigate') doc.status = 'investigation';
    else if (action === 'resolve') doc.status = 'resolved';
    else if (action === 'close') doc.status = 'closed';
    if (message) doc.replies.push({ author: req.user.name || 'Vendor', role: 'vendor', message });
    await doc.save();
    res.json({ success: true, data: doc });
  } catch (error) {
    console.error('update ticket:', error);
    res.status(500).json({ success: false, message: 'Failed to update support ticket' });
  }
};

exports.getSettings = async (req, res) => {
  try {
    const vid = vendorId(req);
    const settings = await VendorGlobalSetting.findOneAndUpdate(
      { vendorId: vid },
      { $setOnInsert: { vendorId: vid } },
      { upsert: true, new: true }
    ).lean();
    res.json({ success: true, data: settings });
  } catch (error) {
    console.error('settings:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch settings' });
  }
};

exports.updateSettings = async (req, res) => {
  try {
    const settings = await VendorGlobalSetting.findOneAndUpdate(
      { vendorId: vendorId(req) },
      { $set: req.body },
      { upsert: true, new: true, runValidators: true }
    );
    res.json({ success: true, data: settings });
  } catch (error) {
    console.error('update settings:', error);
    res.status(500).json({ success: false, message: 'Failed to update settings' });
  }
};
