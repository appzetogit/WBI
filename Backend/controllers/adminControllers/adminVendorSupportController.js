const SupportModuleConfig = require('../../models/SupportModuleConfig');
const VendorGlobalSupportTicket = require('../../models/VendorGlobalSupportTicket');
const SupportTicketAudit = require('../../models/SupportTicketAudit');
const {
  ensureDefaultSupportConfig,
  resolveSupportConfig,
  invalidateSupportConfigCache,
  transitionTicket,
  addComment,
  getPermission,
  processSlaEscalations
} = require('../../services/vendorSupportService');

const actorFromReq = (req) => ({
  role: req.user?.role || 'admin',
  id: req.user?._id || req.user?.id,
  name: req.user?.name || req.user?.email || 'Admin'
});

exports.getConfig = async (req, res) => {
  try {
    const serviceCode = req.query.serviceCategoryCode || '';
    await ensureDefaultSupportConfig();
    const cfg = serviceCode
      ? (await SupportModuleConfig.findOne({ scope: 'service', serviceCategoryCode: serviceCode })) ||
        (await SupportModuleConfig.findOne({ scope: 'global', serviceCategoryCode: '' }))
      : await SupportModuleConfig.findOne({ scope: 'global', serviceCategoryCode: '' });
    res.json({ success: true, data: cfg });
  } catch (error) {
    console.error('[AdminSupport] getConfig', error);
    res.status(500).json({ success: false, message: 'Failed to load support config' });
  }
};

exports.upsertConfig = async (req, res) => {
  try {
    const serviceCode = req.body.serviceCategoryCode || '';
    const scope = serviceCode ? 'service' : 'global';
    const payload = { ...req.body, scope, serviceCategoryCode: serviceCode, updatedBy: req.user?._id };
    delete payload._id;
    const cfg = await SupportModuleConfig.findOneAndUpdate(
      { scope, serviceCategoryCode: serviceCode },
      { $set: payload, $inc: { version: 1 } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    await invalidateSupportConfigCache(serviceCode);
    res.json({ success: true, data: cfg });
  } catch (error) {
    console.error('[AdminSupport] upsertConfig', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to save support config' });
  }
};

exports.listTickets = async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const filter = {};
    if (req.query.vendorId) filter.vendorId = req.query.vendorId;
    if (req.query.status) filter.status = req.query.status;
    if (req.query.priority) filter.priority = req.query.priority;
    if (req.query.category) filter.category = req.query.category;
    if (req.query.serviceCategoryCode) filter.serviceCategoryCode = req.query.serviceCategoryCode;
    if (req.query.assignedTo) filter.assignedTo = req.query.assignedTo;
    if (req.query.slaBreached === 'true') filter.slaBreached = true;
    if (req.query.search) {
      const term = new RegExp(String(req.query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ subject: term }, { ticketCode: term }, { description: term }];
    }
    const [data, total, stats] = await Promise.all([
      VendorGlobalSupportTicket.find(filter)
        .sort({ updatedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('vendorId', 'businessName name email phone')
        .lean(),
      VendorGlobalSupportTicket.countDocuments(filter),
      VendorGlobalSupportTicket.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }])
    ]);
    res.json({
      success: true,
      data,
      stats,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 }
    });
  } catch (error) {
    console.error('[AdminSupport] listTickets', error);
    res.status(500).json({ success: false, message: 'Failed to list tickets' });
  }
};

exports.getTicket = async (req, res) => {
  try {
    const ticket = await VendorGlobalSupportTicket.findById(req.params.id)
      .populate('vendorId', 'businessName name email phone')
      .lean();
    if (!ticket) return res.status(404).json({ success: false, message: 'Ticket not found' });
    const audit = await SupportTicketAudit.find({ ticketId: ticket._id }).sort({ createdAt: -1 }).limit(100).lean();
    res.json({ success: true, data: { ...ticket, audit } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load ticket' });
  }
};

exports.transitionTicket = async (req, res) => {
  try {
    const ticket = await VendorGlobalSupportTicket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ success: false, message: 'Ticket not found' });
    const result = await transitionTicket({
      ticket,
      action: req.body.action,
      message: req.body.message,
      internal: !!req.body.internal,
      actor: actorFromReq(req),
      req,
      extra: {
        assignedTo: req.body.assignedTo,
        assignedToName: req.body.assignedToName,
        assignedDepartmentCode: req.body.assignedDepartmentCode,
        assignedTeam: req.body.assignedTeam,
        priority: req.body.priority
      }
    });
    if (!result.ok) return res.status(result.status || 400).json({ success: false, message: result.message });
    res.json({ success: true, data: result.data });
  } catch (error) {
    console.error('[AdminSupport] transition', error);
    res.status(500).json({ success: false, message: 'Failed to update ticket' });
  }
};

exports.commentTicket = async (req, res) => {
  try {
    const ticket = await VendorGlobalSupportTicket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ success: false, message: 'Ticket not found' });
    const result = await addComment({
      ticket,
      message: req.body.message,
      internal: !!req.body.internal,
      attachments: req.body.attachments,
      actor: actorFromReq(req),
      req
    });
    if (!result.ok) return res.status(result.status || 400).json({ success: false, message: result.message });
    res.json({ success: true, data: result.data });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to add comment' });
  }
};

exports.getAnalytics = async (req, res) => {
  try {
    const match = {};
    if (req.query.vendorId) match.vendorId = req.query.vendorId;
    if (req.query.serviceCategoryCode) match.serviceCategoryCode = req.query.serviceCategoryCode;
    const [byStatus, byPriority, byCategory, sla] = await Promise.all([
      VendorGlobalSupportTicket.aggregate([{ $match: match }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
      VendorGlobalSupportTicket.aggregate([{ $match: match }, { $group: { _id: '$priority', count: { $sum: 1 } } }]),
      VendorGlobalSupportTicket.aggregate([{ $match: match }, { $group: { _id: '$category', count: { $sum: 1 } } }]),
      VendorGlobalSupportTicket.aggregate([
        { $match: match },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            breached: { $sum: { $cond: ['$slaBreached', 1, 0] } },
            avgResponse: { $avg: '$averageResponseMinutes' }
          }
        }
      ])
    ]);
    res.json({
      success: true,
      data: {
        byStatus,
        byPriority,
        byCategory,
        sla: sla[0] || { total: 0, breached: 0, avgResponse: 0 }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load analytics' });
  }
};

exports.exportTickets = async (req, res) => {
  try {
    const perm = getPermission(await resolveSupportConfig(''), 'admin');
    if (!perm.canExport) return res.status(403).json({ success: false, message: 'Export not allowed' });
    const rows = await VendorGlobalSupportTicket.find({})
      .sort({ createdAt: -1 })
      .limit(5000)
      .lean();
    const header =
      'ticketCode,subject,category,priority,status,vendorId,service,createdAt,slaBreached\n';
    const csv =
      header +
      rows
        .map((r) =>
          [
            r.ticketCode,
            JSON.stringify(r.subject || ''),
            r.category,
            r.priority,
            r.status,
            r.vendorId,
            r.serviceCategoryCode,
            r.createdAt?.toISOString?.() || '',
            r.slaBreached
          ].join(',')
        )
        .join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=vendor-support-tickets.csv');
    res.send(csv);
  } catch (error) {
    res.status(500).json({ success: false, message: 'Export failed' });
  }
};

exports.runSlaJob = async (req, res) => {
  try {
    const n = await processSlaEscalations(200);
    res.json({ success: true, processed: n });
  } catch (error) {
    res.status(500).json({ success: false, message: 'SLA job failed' });
  }
};
