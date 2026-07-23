const SupportModuleConfig = require('../models/SupportModuleConfig');
const VendorGlobalSupportTicket = require('../models/VendorGlobalSupportTicket');
const SupportTicketAudit = require('../models/SupportTicketAudit');
const Vendor = require('../models/Vendor');
const { setCache, getCache, delCache } = require('./redisService');

const CONFIG_CACHE_TTL = 60;
const configCacheKey = (serviceCode = '') => `support:cfg:${serviceCode || 'global'}`;

const DEFAULT_CONFIG_SEED = () => ({
  scope: 'global',
  serviceCategoryCode: '',
  name: 'Vendor Support',
  isActive: true,
  categories: [
    { code: 'technical', label: 'Technical', sortOrder: 1, isActive: true, color: '#2563eb' },
    { code: 'payment', label: 'Payment', sortOrder: 2, isActive: true, color: '#059669' },
    { code: 'project', label: 'Project', sortOrder: 3, isActive: true, color: '#7c3aed' },
    { code: 'quality', label: 'Quality', sortOrder: 4, isActive: true, color: '#d97706' },
    { code: 'inventory', label: 'Inventory', sortOrder: 5, isActive: true, color: '#0891b2' },
    { code: 'billing', label: 'Billing', sortOrder: 6, isActive: true, color: '#db2777' },
    { code: 'general', label: 'General', sortOrder: 99, isActive: true, color: '#64748b' }
  ],
  priorities: [
    { code: 'low', label: 'Low', sortOrder: 1, weight: 1, color: '#94a3b8', isActive: true },
    { code: 'medium', label: 'Medium', sortOrder: 2, weight: 2, color: '#3b82f6', isActive: true },
    { code: 'high', label: 'High', sortOrder: 3, weight: 3, color: '#f59e0b', isActive: true },
    { code: 'urgent', label: 'Urgent', sortOrder: 4, weight: 4, color: '#ef4444', isActive: true }
  ],
  statuses: [
    { code: 'open', label: 'Open', isInitial: true, countsTowardOpen: true, sortOrder: 1, color: '#f59e0b', isActive: true },
    { code: 'assigned', label: 'Assigned', countsTowardOpen: true, sortOrder: 2, color: '#3b82f6', isActive: true },
    { code: 'in_progress', label: 'In Progress', countsTowardOpen: true, sortOrder: 3, color: '#6366f1', isActive: true },
    { code: 'waiting', label: 'Waiting', countsTowardOpen: true, sortOrder: 4, color: '#8b5cf6', isActive: true },
    { code: 'escalation', label: 'Escalation', countsTowardOpen: true, sortOrder: 5, color: '#dc2626', isActive: true },
    { code: 'investigation', label: 'Investigation', countsTowardOpen: true, sortOrder: 6, color: '#4f46e5', isActive: true },
    { code: 'resolved', label: 'Resolved', countsTowardOpen: false, sortOrder: 7, color: '#10b981', isActive: true },
    { code: 'vendor_confirmation', label: 'Vendor Confirmation', countsTowardOpen: false, sortOrder: 8, color: '#14b8a6', isActive: true },
    { code: 'closed', label: 'Closed', isTerminal: true, countsTowardOpen: false, sortOrder: 9, color: '#64748b', isActive: true },
    { code: 'reopened', label: 'Reopened', countsTowardOpen: true, sortOrder: 10, color: '#ea580c', isActive: true }
  ],
  workflow: [
    { from: 'open', to: 'assigned', action: 'assign', label: 'Assign', allowedRoles: ['admin', 'support_executive', 'manager'] },
    { from: 'assigned', to: 'in_progress', action: 'start', label: 'Start Work', allowedRoles: ['admin', 'support_executive', 'manager'] },
    { from: 'assigned', to: 'investigation', action: 'investigate', label: 'Investigate', allowedRoles: ['admin', 'support_executive', 'manager'] },
    { from: 'in_progress', to: 'waiting', action: 'wait', label: 'Waiting', allowedRoles: ['admin', 'support_executive', 'manager', 'vendor'] },
    { from: 'in_progress', to: 'escalation', action: 'escalate', label: 'Escalate', allowedRoles: ['admin', 'support_executive', 'manager'] },
    { from: 'waiting', to: 'in_progress', action: 'resume', label: 'Resume', allowedRoles: ['admin', 'support_executive', 'manager', 'vendor'] },
    { from: 'investigation', to: 'resolved', action: 'resolve', label: 'Resolve', allowedRoles: ['admin', 'support_executive', 'manager'], requiresComment: true },
    { from: 'in_progress', to: 'resolved', action: 'resolve', label: 'Resolve', allowedRoles: ['admin', 'support_executive', 'manager'], requiresComment: true },
    { from: 'escalation', to: 'resolved', action: 'resolve', label: 'Resolve', allowedRoles: ['admin', 'manager'], requiresComment: true },
    { from: 'resolved', to: 'vendor_confirmation', action: 'request_confirmation', label: 'Request Confirmation', allowedRoles: ['admin', 'support_executive', 'manager'] },
    { from: 'resolved', to: 'closed', action: 'close', label: 'Close', allowedRoles: ['admin', 'support_executive', 'manager', 'vendor'] },
    { from: 'vendor_confirmation', to: 'closed', action: 'confirm_close', label: 'Confirm & Close', allowedRoles: ['vendor', 'admin'] },
    { from: 'closed', to: 'reopened', action: 'reopen', label: 'Reopen', allowedRoles: ['vendor', 'admin', 'manager'], requiresComment: true },
    { from: 'reopened', to: 'assigned', action: 'assign', label: 'Re-assign', allowedRoles: ['admin', 'support_executive', 'manager'] },
    { from: 'open', to: 'closed', action: 'close', label: 'Close', allowedRoles: ['admin', 'vendor'] }
  ],
  slaRules: [
    { code: 'sla_urgent', label: 'Urgent SLA', priorityCode: 'urgent', firstResponseMinutes: 15, resolutionMinutes: 240, isActive: true },
    { code: 'sla_high', label: 'High SLA', priorityCode: 'high', firstResponseMinutes: 30, resolutionMinutes: 480, isActive: true },
    { code: 'sla_medium', label: 'Medium SLA', priorityCode: 'medium', firstResponseMinutes: 60, resolutionMinutes: 1440, isActive: true },
    { code: 'sla_low', label: 'Low SLA', priorityCode: 'low', firstResponseMinutes: 240, resolutionMinutes: 4320, isActive: true }
  ],
  assignmentRules: [
    {
      code: 'default_team',
      label: 'Default Support Team',
      priority: 0,
      match: {},
      assignToDepartmentCode: 'vendor_support',
      assignToTeamCode: 'l1',
      strategy: 'least_open',
      isActive: true
    }
  ],
  escalationMatrix: [
    { level: 1, afterMinutes: 60, escalateToRole: 'manager', notifyChannels: ['email', 'push'] },
    { level: 2, afterMinutes: 240, escalateToRole: 'admin', bumpPriorityTo: 'urgent', notifyChannels: ['email', 'sms', 'push'] }
  ],
  departments: [
    { code: 'vendor_support', label: 'Vendor Support', teamCodes: ['l1', 'l2'], isActive: true },
    { code: 'finance_support', label: 'Finance Support', teamCodes: ['billing'], isActive: true }
  ],
  tags: [
    { code: 'urgent_attention', label: 'Urgent Attention', isActive: true, color: '#ef4444' },
    { code: 'billing', label: 'Billing', isActive: true, color: '#059669' },
    { code: 'field_ops', label: 'Field Ops', isActive: true, color: '#2563eb' }
  ],
  knowledgeBase: [
    { code: 'kb_getting_started', title: 'Getting Started', summary: 'Onboarding and portal basics', sortOrder: 1, isActive: true, isPublic: true },
    { code: 'kb_finance', title: 'Finance & Wallet', summary: 'Payouts, wallet and settlements', sortOrder: 2, isActive: true, isPublic: true },
    { code: 'kb_projects', title: 'Project Execution', summary: 'Projects, milestones and SLAs', sortOrder: 3, isActive: true, isPublic: true },
    { code: 'kb_quality', title: 'Quality Approvals', summary: 'QC workflows and checklists', sortOrder: 4, isActive: true, isPublic: true },
    { code: 'kb_api', title: 'API Docs', summary: 'Integration and webhooks', sortOrder: 5, isActive: true, isPublic: true },
    { code: 'kb_release', title: 'Release Notes', summary: 'Latest product updates', sortOrder: 6, isActive: true, isPublic: true }
  ],
  notificationTemplates: [
    { code: 'ticket_created_email', event: 'ticket.created', channel: 'email', subject: 'Ticket {{ticketCode}} created', body: 'Your support ticket {{subject}} was created.', isActive: true },
    { code: 'ticket_updated_push', event: 'ticket.updated', channel: 'push', subject: 'Ticket update', body: 'Ticket {{ticketCode}} is now {{status}}.', isActive: true },
    { code: 'ticket_sla_breach', event: 'ticket.sla_breach', channel: 'email', subject: 'SLA breach {{ticketCode}}', body: 'SLA breached for {{ticketCode}}.', isActive: true }
  ],
  rolePermissions: [
    { role: 'admin', canCreate: true, canViewAll: true, canAssign: true, canComment: true, canInternalNote: true, canResolve: true, canClose: true, canReopen: true, canConfigure: true, canExport: true },
    { role: 'manager', canCreate: true, canViewAll: true, canAssign: true, canComment: true, canInternalNote: true, canResolve: true, canClose: true, canReopen: true, canConfigure: false, canExport: true },
    { role: 'support_executive', canCreate: true, canViewAll: true, canAssign: true, canComment: true, canInternalNote: true, canResolve: true, canClose: true, canReopen: false, canConfigure: false, canExport: false },
    { role: 'vendor', canCreate: true, canViewAll: false, canAssign: false, canComment: true, canInternalNote: false, canResolve: false, canClose: true, canReopen: true, canConfigure: false, canExport: false },
    { role: 'engineer', canCreate: true, canViewAll: false, canAssign: false, canComment: true, canInternalNote: false, canResolve: false, canClose: false, canReopen: false, canConfigure: false, canExport: false },
    { role: 'worker', canCreate: true, canViewAll: false, canAssign: false, canComment: true, canInternalNote: false, canResolve: false, canClose: false, canReopen: false, canConfigure: false, canExport: false }
  ],
  customFields: [
    { key: 'preferred_contact', label: 'Preferred Contact', type: 'select', options: [{ label: 'Phone', value: 'phone' }, { label: 'Email', value: 'email' }], sortOrder: 1, isActive: true }
  ],
  attachmentRules: {
    maxFiles: 5,
    maxSizeMb: 10,
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'text/plain'],
    requiredOnCreate: false
  },
  ticketNumber: { prefix: 'SUP', includeYear: true, includeServiceCode: false, padding: 5, separator: '-' },
  dashboardStatStatusCodes: ['open', 'assigned', 'investigation', 'resolved'],
  linkableEntities: ['vendor', 'service', 'project', 'client', 'engineer', 'worker', 'branch', 'company'],
  version: 1
});

function emitSupport(room, event, data) {
  try {
    if (!global.io) return;
    global.io.to(room).emit(event, data);
    // Compat: some sockets join vendor_<id> instead of vendor:<id>
    if (String(room).startsWith('vendor:')) {
      global.io.to(String(room).replace('vendor:', 'vendor_')).emit(event, data);
    }
  } catch (err) {
    console.warn('[Support] socket emit failed', err.message);
  }
}

async function ensureDefaultSupportConfig() {
  let cfg = await SupportModuleConfig.findOne({ scope: 'global', serviceCategoryCode: '' });
  if (!cfg) {
    cfg = await SupportModuleConfig.create(DEFAULT_CONFIG_SEED());
  }
  return cfg;
}

async function resolveSupportConfig(serviceCategoryCode = '') {
  const code = String(serviceCategoryCode || '').trim();
  const cacheKey = configCacheKey(code);
  const cached = await getCache(cacheKey);
  if (cached) return cached;

  await ensureDefaultSupportConfig();
  let cfg = null;
  if (code) {
    cfg = await SupportModuleConfig.findOne({ scope: 'service', serviceCategoryCode: code, isActive: true }).lean();
  }
  if (!cfg) {
    cfg = await SupportModuleConfig.findOne({ scope: 'global', serviceCategoryCode: '', isActive: true }).lean();
  }
  if (!cfg) cfg = DEFAULT_CONFIG_SEED();

  await setCache(cacheKey, cfg, CONFIG_CACHE_TTL);
  return cfg;
}

async function invalidateSupportConfigCache(serviceCategoryCode = '') {
  try {
    await delCache(configCacheKey(serviceCategoryCode || ''));
    await delCache(configCacheKey(''));
  } catch {
    /* ignore */
  }
}

function activeItems(list = []) {
  return (list || []).filter((i) => i && i.isActive !== false);
}

function findActive(list, code) {
  return activeItems(list).find((i) => String(i.code).toLowerCase() === String(code || '').toLowerCase());
}

function getPermission(cfg, role) {
  const r = String(role || 'vendor').toLowerCase();
  return (cfg.rolePermissions || []).find((p) => String(p.role).toLowerCase() === r) || {
    canCreate: false,
    canViewAll: false,
    canAssign: false,
    canComment: false,
    canInternalNote: false,
    canResolve: false,
    canClose: false,
    canReopen: false,
    canConfigure: false,
    canExport: false
  };
}

function pickSlaRule(cfg, { priority, category, serviceCategoryCode }) {
  const rules = (cfg.slaRules || []).filter((r) => r.isActive !== false);
  const scored = rules
    .map((r) => {
      let score = 0;
      if (r.priorityCode && r.priorityCode === priority) score += 4;
      else if (r.priorityCode) return null;
      if (r.categoryCode && r.categoryCode === category) score += 2;
      else if (r.categoryCode) return null;
      if (r.serviceCategoryCode && r.serviceCategoryCode === serviceCategoryCode) score += 3;
      else if (r.serviceCategoryCode) return null;
      return { r, score };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);
  return scored[0]?.r || rules[0] || { firstResponseMinutes: 60, resolutionMinutes: 1440 };
}

function publicConfigView(cfg) {
  return {
    name: cfg.name,
    categories: activeItems(cfg.categories).sort((a, b) => a.sortOrder - b.sortOrder),
    priorities: activeItems(cfg.priorities).sort((a, b) => a.sortOrder - b.sortOrder),
    statuses: activeItems(cfg.statuses).sort((a, b) => a.sortOrder - b.sortOrder),
    workflow: cfg.workflow || [],
    tags: activeItems(cfg.tags),
    knowledgeBase: activeItems(cfg.knowledgeBase)
      .filter((k) => k.isPublic !== false)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(({ code, title, summary, categoryCode, tags, sortOrder }) => ({
        code,
        title,
        summary,
        categoryCode,
        tags,
        sortOrder
      })),
    customFields: activeItems(cfg.customFields).sort((a, b) => a.sortOrder - b.sortOrder),
    attachmentRules: cfg.attachmentRules || {},
    dashboardStatStatusCodes:
      cfg.dashboardStatStatusCodes?.length > 0
        ? cfg.dashboardStatStatusCodes
        : activeItems(cfg.statuses)
            .filter((s) => s.countsTowardOpen || s.code === 'resolved')
            .slice(0, 4)
            .map((s) => s.code),
    linkableEntities: cfg.linkableEntities || [],
    departments: activeItems(cfg.departments).map(({ code, label }) => ({ code, label })),
    version: cfg.version || 1
  };
}

async function enrichVendorContext(vendorId, body = {}) {
  const vendor = await Vendor.findById(vendorId)
    .select('businessName name email phone approvedServices companyId branchId')
    .lean();
  const activeServices = (vendor?.approvedServices || []).filter((s) => s.status === 'active');
  let serviceCategoryCode = body.serviceCategoryCode || '';
  let serviceCategoryName = body.serviceCategoryName || '';
  if (!serviceCategoryCode && activeServices.length === 1) {
    serviceCategoryCode = activeServices[0].categoryCode;
    serviceCategoryName = activeServices[0].categoryName || serviceCategoryCode;
  } else if (serviceCategoryCode && !serviceCategoryName) {
    const match = activeServices.find((s) => s.categoryCode === serviceCategoryCode);
    serviceCategoryName = match?.categoryName || serviceCategoryCode;
  }
  return {
    vendor,
    serviceCategoryCode,
    serviceCategoryName,
    companyId: body.companyId || vendor?.companyId || null
  };
}

async function writeAudit({ ticket, action, fromStatus, toStatus, actor, message, meta, req }) {
  await SupportTicketAudit.create({
    ticketId: ticket._id,
    vendorId: ticket.vendorId,
    action,
    fromStatus: fromStatus || '',
    toStatus: toStatus || '',
    actorRole: actor?.role || '',
    actorId: actor?.id || null,
    actorName: actor?.name || '',
    message: message || '',
    meta: meta || {},
    ipAddress: req?.ip || '',
    userAgent: req?.get?.('User-Agent') || ''
  });
}

async function createTicket({ vendorId, body, actor, req }) {
  const enriched = await enrichVendorContext(vendorId, body);
  const cfg = await resolveSupportConfig(enriched.serviceCategoryCode);
  const perm = getPermission(cfg, actor?.role || 'vendor');
  if (!perm.canCreate) {
    return { ok: false, status: 403, message: 'You do not have permission to create tickets' };
  }

  const category = findActive(cfg.categories, body.category);
  if (!category) return { ok: false, status: 400, message: 'Invalid or inactive ticket category' };

  const priority = findActive(cfg.priorities, body.priority) || activeItems(cfg.priorities)[0];
  if (!priority) return { ok: false, status: 400, message: 'No active priorities configured' };

  const initialStatus =
    activeItems(cfg.statuses).find((s) => s.isInitial) || activeItems(cfg.statuses)[0];
  if (!initialStatus) return { ok: false, status: 500, message: 'No initial status configured' };

  if (!body.subject || !String(body.subject).trim()) {
    return { ok: false, status: 400, message: 'Subject is required' };
  }

  const attachRules = cfg.attachmentRules || {};
  const attachments = Array.isArray(body.attachments) ? body.attachments.slice(0, attachRules.maxFiles || 5) : [];
  if (attachRules.requiredOnCreate && attachments.length === 0) {
    return { ok: false, status: 400, message: 'At least one attachment is required' };
  }

  const sla = pickSlaRule(cfg, {
    priority: priority.code,
    category: category.code,
    serviceCategoryCode: enriched.serviceCategoryCode
  });
  const now = Date.now();
  const ticketCode = await VendorGlobalSupportTicket.nextTicketCode(
    cfg.ticketNumber,
    enriched.serviceCategoryCode
  );

  const assignRule =
    (cfg.assignmentRules || [])
      .filter((r) => r.isActive !== false)
      .sort((a, b) => (b.priority || 0) - (a.priority || 0))
      .find((r) => {
        const m = r.match || {};
        if (m.categoryCodes?.length && !m.categoryCodes.includes(category.code)) return false;
        if (m.priorityCodes?.length && !m.priorityCodes.includes(priority.code)) return false;
        if (
          m.serviceCategoryCodes?.length &&
          enriched.serviceCategoryCode &&
          !m.serviceCategoryCodes.includes(enriched.serviceCategoryCode)
        ) {
          return false;
        }
        return true;
      }) || null;

  const ticket = await VendorGlobalSupportTicket.create({
    vendorId,
    companyId: enriched.companyId,
    ticketCode,
    subject: String(body.subject).trim(),
    description: body.description || '',
    category: category.code,
    priority: priority.code,
    status: initialStatus.code,
    tags: Array.isArray(body.tags) ? body.tags : [],
    serviceCategoryCode: enriched.serviceCategoryCode,
    serviceCategoryName: enriched.serviceCategoryName,
    projectId: body.projectId || null,
    clientId: body.clientId || null,
    engineerId: body.engineerId || null,
    workerId: body.workerId || null,
    branchId: body.branchId || null,
    bookingId: body.bookingId || null,
    assignedDepartmentCode: assignRule?.assignToDepartmentCode || '',
    assignedTeam: assignRule?.assignToTeamCode || assignRule?.assignToDepartmentCode || '',
    assignedTo: assignRule?.assignToUserId || null,
    customFields: body.customFields || {},
    attachments,
    attachmentsCount: attachments.length,
    slaFirstResponseDueAt: new Date(now + (sla.firstResponseMinutes || 60) * 60000),
    slaResolutionDueAt: new Date(now + (sla.resolutionMinutes || 1440) * 60000),
    createdByRole: actor?.role || 'vendor',
    createdById: actor?.id || null,
    createdByName: actor?.name || enriched.vendor?.businessName || '',
    source: body.source || 'vendor_portal',
    timeline: [
      {
        event: 'created',
        label: 'Ticket created',
        actorRole: actor?.role || 'vendor',
        actorName: actor?.name || '',
        at: new Date()
      }
    ]
  });

  if (assignRule && (assignRule.assignToUserId || assignRule.assignToDepartmentCode)) {
    const assignedStatus = findActive(cfg.statuses, 'assigned');
    if (assignedStatus) {
      ticket.status = assignedStatus.code;
      ticket.timeline.push({
        event: 'auto_assigned',
        label: `Auto-assigned via ${assignRule.label}`,
        actorRole: 'system',
        actorName: 'Auto Assignment',
        at: new Date()
      });
      await ticket.save();
    }
  }

  await writeAudit({
    ticket,
    action: 'created',
    toStatus: ticket.status,
    actor,
    message: 'Ticket created',
    req
  });

  const payload = ticket.toObject();
  emitSupport(`vendor:${vendorId}`, 'support:ticketCreated', payload);
  emitSupport('admin', 'support:ticketCreated', payload);
  emitSupport('support', 'support:ticketCreated', payload);

  try {
    const { emitAsync } = require('./notification/notificationOrchestrator.service');
    emitAsync('support_ticket_updated', {
      targets: { vendorId },
      data: {
        ticketId: ticket._id,
        ticketCode: ticket.ticketCode,
        status: ticket.status,
        title: 'Support ticket created',
        message: `${ticket.ticketCode}: ${ticket.subject}`,
        relatedId: ticket._id,
        relatedType: 'support_ticket',
        actionUrl: `support?ticketId=${ticket._id}`
      }
    });
  } catch (_) { /* non-blocking */ }

  return { ok: true, data: ticket };
}

function findTransition(cfg, from, action) {
  return (cfg.workflow || []).find(
    (t) =>
      String(t.from).toLowerCase() === String(from).toLowerCase() &&
      String(t.action).toLowerCase() === String(action).toLowerCase()
  );
}

async function transitionTicket({ ticket, action, message, internal, actor, req, extra = {} }) {
  const cfg = await resolveSupportConfig(ticket.serviceCategoryCode);
  const transition = findTransition(cfg, ticket.status, action);
  if (!transition) {
    return { ok: false, status: 400, message: `Action "${action}" is not allowed from status "${ticket.status}"` };
  }

  const role = String(actor?.role || 'vendor').toLowerCase();
  const allowed = (transition.allowedRoles || []).map((r) => String(r).toLowerCase());
  if (allowed.length && !allowed.includes(role) && role !== 'admin') {
    return { ok: false, status: 403, message: 'You are not allowed to perform this action' };
  }

  if (transition.requiresComment && !String(message || '').trim()) {
    return { ok: false, status: 400, message: 'A comment is required for this action' };
  }

  const toStatus = findActive(cfg.statuses, transition.to);
  if (!toStatus) return { ok: false, status: 400, message: `Target status "${transition.to}" is not active` };

  const fromStatus = ticket.status;
  ticket.status = toStatus.code;

  if (message) {
    ticket.replies.push({
      author: actor?.name || role,
      authorId: actor?.id || null,
      role,
      message: String(message).trim(),
      internal: !!internal && getPermission(cfg, role).canInternalNote
    });
    if (!ticket.firstRespondedAt && role !== 'vendor') {
      ticket.firstRespondedAt = new Date();
      if (ticket.createdAt) {
        ticket.averageResponseMinutes = Math.max(
          1,
          Math.round((Date.now() - new Date(ticket.createdAt).getTime()) / 60000)
        );
      }
    }
  }

  if (extra.assignedTo) {
    ticket.assignedTo = extra.assignedTo;
    ticket.assignedToName = extra.assignedToName || '';
  }
  if (extra.assignedDepartmentCode) ticket.assignedDepartmentCode = extra.assignedDepartmentCode;
  if (extra.assignedTeam) ticket.assignedTeam = extra.assignedTeam;
  if (extra.priority) {
    const p = findActive(cfg.priorities, extra.priority);
    if (p) ticket.priority = p.code;
  }

  if (toStatus.code === 'resolved') ticket.resolvedAt = new Date();
  if (toStatus.code === 'closed') {
    ticket.closedAt = new Date();
    if (role === 'vendor') ticket.vendorConfirmedAt = new Date();
  }
  if (toStatus.code === 'reopened' || action === 'reopen') ticket.reopenedAt = new Date();
  if (toStatus.code === 'vendor_confirmation') {
    /* waiting on vendor */
  }
  if (action === 'escalate' || toStatus.code === 'escalation') {
    ticket.escalationLevel = (ticket.escalationLevel || 0) + 1;
  }

  ticket.timeline.push({
    event: action,
    label: transition.label || action,
    actorRole: role,
    actorName: actor?.name || '',
    meta: { from: fromStatus, to: ticket.status },
    at: new Date()
  });

  await ticket.save();
  await writeAudit({
    ticket,
    action,
    fromStatus,
    toStatus: ticket.status,
    actor,
    message: message || transition.label || action,
    req
  });

  const payload = ticket.toObject ? ticket.toObject() : ticket;
  emitSupport(`vendor:${ticket.vendorId}`, 'support:ticketUpdated', payload);
  emitSupport('admin', 'support:ticketUpdated', payload);
  emitSupport('support', 'support:ticketUpdated', payload);

  try {
    const { publishVendorNotification } = require('./vendorNotificationCenter.service');
    const isResolved = ['resolved', 'closed'].includes(ticket.status);
    await publishVendorNotification({
      vendorId: ticket.vendorId,
      type: isResolved ? 'support_ticket_resolved' : 'support_ticket_update',
      title: isResolved ? 'Support ticket resolved' : 'Support ticket updated',
      message: `${ticket.ticketCode} is now ${ticket.status}${message ? `: ${message}` : ''}`,
      module: 'support',
      priority: isResolved ? 'normal' : 'high',
      relatedId: ticket._id,
      relatedType: 'support_ticket',
      actionUrl: `support?ticketId=${ticket._id}`,
      metadata: { ticketCode: ticket.ticketCode, status: ticket.status, action },
      actorType: role === 'admin' ? 'admin' : 'system',
      actorId: actor?.id || null,
      category: 'account'
    });
  } catch (_) { /* non-blocking */ }

  return { ok: true, data: ticket };
}

async function addComment({ ticket, message, internal, attachments, actor, req }) {
  const cfg = await resolveSupportConfig(ticket.serviceCategoryCode);
  const role = String(actor?.role || 'vendor').toLowerCase();
  const perm = getPermission(cfg, role);
  if (!perm.canComment) return { ok: false, status: 403, message: 'Comment not permitted' };
  if (internal && !perm.canInternalNote) return { ok: false, status: 403, message: 'Internal notes not permitted' };
  if (!String(message || '').trim()) return { ok: false, status: 400, message: 'Message is required' };

  ticket.replies.push({
    author: actor?.name || role,
    authorId: actor?.id || null,
    role,
    message: String(message).trim(),
    internal: !!internal,
    attachments: Array.isArray(attachments) ? attachments : []
  });
  if (!ticket.firstRespondedAt && role !== 'vendor') {
    ticket.firstRespondedAt = new Date();
  }
  ticket.timeline.push({
    event: internal ? 'internal_note' : 'comment',
    label: internal ? 'Internal note added' : 'Comment added',
    actorRole: role,
    actorName: actor?.name || '',
    at: new Date()
  });
  await ticket.save();
  await writeAudit({ ticket, action: internal ? 'internal_note' : 'comment', actor, message, req });

  const payload = ticket.toObject();
  emitSupport(`vendor:${ticket.vendorId}`, 'support:ticketCommented', payload);
  emitSupport('admin', 'support:ticketCommented', payload);

  if (!internal && role !== 'vendor') {
    try {
      const { publishVendorNotification } = require('./vendorNotificationCenter.service');
      await publishVendorNotification({
        vendorId: ticket.vendorId,
        type: 'support_ticket_update',
        title: 'New reply on support ticket',
        message: `${ticket.ticketCode}: ${String(message).trim().slice(0, 120)}`,
        module: 'support',
        priority: 'high',
        relatedId: ticket._id,
        relatedType: 'support_ticket',
        actionUrl: `support?ticketId=${ticket._id}`,
        metadata: { ticketCode: ticket.ticketCode },
        actorType: role === 'admin' ? 'admin' : 'system',
        actorId: actor?.id || null,
        category: 'account'
      });
    } catch (_) { /* non-blocking */ }
  }

  return { ok: true, data: ticket };
}

async function processSlaEscalations(limit = 100) {
  const now = new Date();
  const due = await VendorGlobalSupportTicket.find({
    slaBreached: false,
    closedAt: null,
    status: { $nin: ['closed', 'resolved'] },
    $or: [
      { slaFirstResponseDueAt: { $lte: now }, firstRespondedAt: null },
      { slaResolutionDueAt: { $lte: now }, resolvedAt: null }
    ]
  })
    .limit(limit)
    .exec();

  let processed = 0;
  for (const ticket of due) {
    const cfg = await resolveSupportConfig(ticket.serviceCategoryCode);
    ticket.slaBreached = true;
    const nextLevel = (ticket.escalationLevel || 0) + 1;
    const step = (cfg.escalationMatrix || []).find((s) => s.level === nextLevel);
    if (step) {
      ticket.escalationLevel = nextLevel;
      if (step.bumpPriorityTo && findActive(cfg.priorities, step.bumpPriorityTo)) {
        ticket.priority = step.bumpPriorityTo;
      }
      const escStatus = findActive(cfg.statuses, 'escalation');
      if (escStatus) ticket.status = escStatus.code;
      ticket.timeline.push({
        event: 'sla_escalation',
        label: `Escalated to level ${nextLevel}`,
        actorRole: 'system',
        actorName: 'SLA Engine',
        at: new Date()
      });
    }
    await ticket.save();
    emitSupport(`vendor:${ticket.vendorId}`, 'support:slaBreach', ticket.toObject());
    emitSupport('admin', 'support:slaBreach', ticket.toObject());
    processed += 1;
  }
  return processed;
}

module.exports = {
  ensureDefaultSupportConfig,
  resolveSupportConfig,
  invalidateSupportConfigCache,
  publicConfigView,
  getPermission,
  createTicket,
  transitionTicket,
  addComment,
  processSlaEscalations,
  writeAudit,
  activeItems,
  findActive,
  DEFAULT_CONFIG_SEED
};
