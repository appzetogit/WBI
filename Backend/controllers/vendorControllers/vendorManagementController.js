/**
 * Vendor Management API — vendor-scoped views of the central job entity.
 *
 *   GET  /api/vendors/:vendorId/jobs
 *   GET  /api/vendors/:vendorId/engineers            ?tab=all|pending|active|inactive
 *   GET  /api/vendors/:vendorId/engineers/skills
 *   GET  /api/vendors/:vendorId/engineers/performance
 *   GET  /api/vendors/:vendorId/engineers/:engineerId
 *   POST /api/vendors/:vendorId/engineers/:engineerId/(activate|deactivate|approve|reject)
 *   GET  /api/vendors/:vendorId/dashboard
 *   GET  /api/vendors/:vendorId/analytics
 *   GET  /api/vendors/:vendorId/assignments
 *   GET  /api/vendors/:vendorId/payments
 *   GET  /api/vendors/:vendorId/settlements
 *   GET  /api/vendors/:vendorId/settlements/:settlementId/download   (CSV)
 *   GET  /api/vendors/:vendorId/service-coverage
 *   PUT  /api/vendors/:vendorId/service-coverage/:serviceKey
 *
 * A vendor may only use its own :vendorId (403 otherwise); admins may use any.
 */
const mongoose = require('mongoose');
const B2BJob = require('../../models/B2BJob');
const Vendor = require('../../models/Vendor');
const ServiceConfig = require('../../models/ServiceConfig');
const VendorServiceCoverage = require('../../models/VendorServiceCoverage');
const { resolveVendorScope, sendJobError, roleOf, actorFromReq } = require('../../services/jobScope.service');
const vendorJobs = require('../../services/vendorJobs.service');
const { paymentsForJobs, settlementsForVendor } = require('../../services/jobPayments.service');

const scope = (req) => resolveVendorScope(req, req.params.vendorId);

exports.listJobs = async (req, res) => {
  try {
    const vid = scope(req);
    const result = await vendorJobs.listVendorJobs(vid, req.query);
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    return sendJobError(res, error, 'Failed to load jobs');
  }
};

// ── Engineers section (team status, availability, skills, performance) ────
const team = () => require('../../services/vendorEngineers.service');
const TEAM_TABS = ['all', 'pending', 'active', 'inactive'];
const AVAILABILITY = ['available', 'busy', 'at_capacity', 'on_leave', 'off_today', 'offline'];
const publicRow = ({ raw, ...row }) => row;

/**
 * GET /api/vendors/:vendorId/engineers
 *   ?tab=all|pending|active|inactive  &pendingOn=vendor|wbi  &availability=  &skill=  &search=  &page  &limit
 */
exports.listEngineers = async (req, res) => {
  try {
    const vid = scope(req);
    let tab = String(req.query.tab || 'all').toLowerCase();
    if (['suspended', 'rejected'].includes(tab)) tab = 'inactive'; // older links
    if (['available', 'busy', 'offline'].includes(tab)) tab = 'active';
    if (!TEAM_TABS.includes(tab)) tab = 'all';
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));

    const members = await team().vendorTeam(vid);
    const counts = team().teamCounts(members);
    let rows = tab === 'all' ? members : members.filter((e) => e.status === tab.toUpperCase());
    if (['vendor', 'wbi'].includes(req.query.pendingOn)) rows = rows.filter((e) => e.pendingOn === req.query.pendingOn);
    const availability = String(req.query.availability || '');
    if (AVAILABILITY.includes(availability)) {
      rows = rows.filter((e) => e.availability.status === availability || (availability === 'busy' && e.availability.status === 'at_capacity'));
    }
    if (req.query.skill) {
      const needle = String(req.query.skill).toLowerCase();
      rows = rows.filter((e) => e.skills.some((s) => s.toLowerCase().includes(needle)));
    }
    if (req.query.search) {
      const needle = String(req.query.search).toLowerCase();
      rows = rows.filter((e) => [e.name, e.phone, e.email, e.coverage.city, ...e.coverage.cities].some((v) => String(v || '').toLowerCase().includes(needle)));
    }
    const total = rows.length;
    return res.status(200).json({
      success: true,
      tab,
      counts,
      data: rows.slice((page - 1) * limit, page * limit).map(publicRow),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 }
    });
  } catch (error) {
    return sendJobError(res, error, 'Failed to load engineers');
  }
};

/** GET /api/vendors/:vendorId/engineers/skills — skills matrix against the vendor's services. */
exports.engineerSkills = async (req, res) => {
  try {
    const data = await team().skillsMatrix(scope(req));
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return sendJobError(res, error, 'Failed to load engineer skills');
  }
};

/** GET /api/vendors/:vendorId/engineers/performance?from&to */
exports.engineerPerformance = async (req, res) => {
  try {
    const { from, to } = req.query;
    if ((from && Number.isNaN(Date.parse(from))) || (to && Number.isNaN(Date.parse(to)))) {
      return res.status(400).json({ success: false, message: 'from/to must be dates (YYYY-MM-DD)' });
    }
    const data = await team().teamPerformance(scope(req), { from, to });
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return sendJobError(res, error, 'Failed to load engineer performance');
  }
};

/** GET /api/vendors/:vendorId/engineers/:engineerId — full profile. */
exports.engineerDetail = async (req, res) => {
  try {
    const data = await team().engineerDetail(scope(req), req.params.engineerId);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return sendJobError(res, error, 'Failed to load engineer');
  }
};

const teamAction = (fn, done) => async (req, res) => {
  try {
    const data = await fn(scope(req), req);
    return res.status(200).json({ success: true, message: done(data), data: data && data.raw ? publicRow(data) : data });
  } catch (error) {
    return sendJobError(res, error, 'Could not update the engineer');
  }
};

/** POST /api/vendors/:vendorId/engineers/:engineerId/deactivate  { reason } */
exports.deactivateEngineer = teamAction(
  (vid, req) => team().setTeamActive({ vid, engineerId: req.params.engineerId, active: false, reason: req.body?.reason, actor: actorFromReq(req) }),
  (d) => `${d.name} deactivated. They will not receive new jobs.`
);

/** POST /api/vendors/:vendorId/engineers/:engineerId/activate */
exports.activateEngineer = teamAction(
  (vid, req) => team().setTeamActive({ vid, engineerId: req.params.engineerId, active: true, actor: actorFromReq(req) }),
  (d) => `${d.name} is active again`
);

/** POST /api/vendors/:vendorId/engineers/:engineerId/approve — accept a join request. */
exports.approveEngineerJoin = teamAction(
  (vid, req) => team().decideJoinRequest({ vid, engineerId: req.params.engineerId, approve: true, actor: actorFromReq(req) }),
  (d) => (d.status === 'ACTIVE' ? `${d.name} joined your team` : `${d.name} joined your team. They can take jobs once WBI verifies their documents.`)
);

/** POST /api/vendors/:vendorId/engineers/:engineerId/reject  { reason } — decline a join request. */
exports.rejectEngineerJoin = teamAction(
  (vid, req) => team().decideJoinRequest({ vid, engineerId: req.params.engineerId, approve: false, reason: req.body?.reason, actor: actorFromReq(req) }),
  (d) => `Join request from ${d.name} declined`
);

exports.dashboard = async (req, res) => {
  try {
    const vid = scope(req);
    const granularity = ['day', 'week', 'month'].includes(req.query.granularity) ? req.query.granularity : 'day';
    const data = await vendorJobs.vendorDashboard(vid, { granularity, days: req.query.days });
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return sendJobError(res, error, 'Failed to load dashboard');
  }
};

exports.analytics = async (req, res) => {
  try {
    const vid = scope(req);
    const data = await vendorJobs.vendorAnalytics(vid, { from: req.query.from, to: req.query.to });
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return sendJobError(res, error, 'Failed to load analytics');
  }
};

// ── Assignments ────────────────────────────────────────────────────────────
const asg = () => require('../../services/vendorAssignments.service');

/** GET /api/vendors/:vendorId/assignments — history (filters: status, engineerId, from, to, search). */
exports.assignments = async (req, res) => {
  try {
    const result = await asg().assignmentHistory(scope(req), req.query);
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    return sendJobError(res, error, 'Failed to load assignment history');
  }
};

/** GET /api/vendors/:vendorId/assignments/queue — jobs needing an engineer, with best candidates. */
exports.assignmentQueue = async (req, res) => {
  try {
    const result = await asg().assignmentQueue(scope(req), req.query);
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    return sendJobError(res, error, 'Failed to load jobs to assign');
  }
};

/** POST /api/vendors/:vendorId/assignments/auto  { jobIds } — best eligible engineer per job. */
exports.autoAssign = async (req, res) => {
  try {
    const data = await asg().autoAssign(scope(req), { jobIds: Array.isArray(req.body?.jobIds) ? req.body.jobIds : [], actor: actorFromReq(req) });
    const ok = data.filter((r) => r.ok).length;
    return res.status(ok ? 200 : 422).json({ success: ok > 0, message: `${ok} of ${data.length} assigned`, data });
  } catch (error) {
    return sendJobError(res, error, 'Auto-assign failed');
  }
};

/** GET /api/vendors/:vendorId/assignments/reassignable */
exports.reassignable = async (req, res) => {
  try {
    const result = await asg().reassignmentBoard(scope(req));
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    return sendJobError(res, error, 'Failed to load reassignable jobs');
  }
};

// ── Services ───────────────────────────────────────────────────────────────
const svc = () => require('../../services/vendorServicesView.service');

exports.myServices = async (req, res) => {
  try {
    const result = await svc().myServices(scope(req));
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    return sendJobError(res, error, 'Failed to load services');
  }
};

exports.serviceKeys = async (req, res) => {
  try {
    const data = await svc().serviceKeys(scope(req));
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return sendJobError(res, error, 'Failed to load service keys');
  }
};

exports.resolveServiceKey = async (req, res) => {
  try {
    const data = await svc().resolveServiceName(scope(req), req.query);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return sendJobError(res, error, 'Failed to check the service name');
  }
};

exports.serviceAreas = async (req, res) => {
  try {
    const result = await svc().serviceAreas(scope(req));
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    return sendJobError(res, error, 'Failed to load service areas');
  }
};

exports.updateServiceAreas = async (req, res) => {
  try {
    const data = await svc().updateServiceAreas(scope(req), req.body, actorFromReq(req));
    return res.status(200).json({ success: true, message: req.body?.action === 'remove' ? 'Areas removed' : 'Areas added', data });
  } catch (error) {
    return sendJobError(res, error, 'Failed to update service areas');
  }
};

// ── Parts ──────────────────────────────────────────────────────────────────
const parts = () => require('../../services/jobParts.service');
const ok = (res, data, message) => res.status(200).json({ success: true, ...(message ? { message } : {}), data });

exports.partsCatalog = async (req, res) => {
  try {
    const result = await parts().listCatalog(scope(req), req.query);
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    return sendJobError(res, error, 'Failed to load the parts catalog');
  }
};

exports.inventory = async (req, res) => {
  try {
    const result = await parts().listInventory(scope(req), req.query);
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    return sendJobError(res, error, 'Failed to load inventory');
  }
};

exports.createInventoryItem = async (req, res) => {
  try {
    const data = await parts().createInventoryItem(scope(req), req.body, actorFromReq(req));
    return res.status(201).json({ success: true, message: `${data.name} added to inventory`, data });
  } catch (error) {
    return sendJobError(res, error, 'Failed to add inventory item');
  }
};

exports.adjustInventory = async (req, res) => {
  try {
    return ok(res, await parts().adjustInventory(scope(req), req.params.itemId, req.body, actorFromReq(req)), 'Stock updated');
  } catch (error) {
    return sendJobError(res, error, 'Failed to update stock');
  }
};

exports.inventoryMovements = async (req, res) => {
  try {
    return ok(res, await parts().itemMovements(scope(req), req.params.itemId));
  } catch (error) {
    return sendJobError(res, error, 'Failed to load stock movements');
  }
};

exports.jobParts = async (req, res) => {
  try {
    const result = await parts().listJobParts(scope(req), req.query);
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    return sendJobError(res, error, 'Failed to load job parts');
  }
};

exports.addRequiredPart = async (req, res) => {
  try {
    const { part, reserveError } = await parts().addRequiredPart(scope(req), req.body, actorFromReq(req));
    return res.status(201).json({
      success: true,
      message: part.status === 'reserved' ? `${part.name} reserved for ${part.jobCode}` : `${part.name} added to ${part.jobCode}${reserveError ? ` — not reserved: ${reserveError}` : ''}`,
      data: part
    });
  } catch (error) {
    return sendJobError(res, error, 'Failed to add the part');
  }
};

exports.recordUsedPart = async (req, res) => {
  try {
    const data = await parts().recordUsedPart(scope(req), req.body, actorFromReq(req));
    return res.status(201).json({ success: true, message: `${data.name} recorded as used on ${data.jobCode}`, data });
  } catch (error) {
    return sendJobError(res, error, 'Failed to record the part');
  }
};

exports.reservePart = async (req, res) => {
  try {
    return ok(res, await parts().reservePart(scope(req), req.params.partId, actorFromReq(req)), 'Part reserved from stock');
  } catch (error) {
    return sendJobError(res, error, 'Failed to reserve the part');
  }
};

exports.usePart = async (req, res) => {
  try {
    return ok(res, await parts().markPartUsed(scope(req), req.params.partId, { fromStock: req.body?.fromStock !== false }, actorFromReq(req)), 'Part marked as used');
  } catch (error) {
    return sendJobError(res, error, 'Failed to mark the part used');
  }
};

exports.cancelPart = async (req, res) => {
  try {
    return ok(res, await parts().cancelPart(scope(req), req.params.partId, req.body?.reason, actorFromReq(req)), 'Part cancelled');
  } catch (error) {
    return sendJobError(res, error, 'Failed to cancel the part');
  }
};

exports.payments = async (req, res) => {
  try {
    const vid = scope(req);
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));
    const match = { assignedVendorId: new mongoose.Types.ObjectId(String(vid)), charge: { $gt: 0 } };
    if (req.query.from || req.query.to) {
      match.createdAt = {};
      if (req.query.from) match.createdAt.$gte = new Date(req.query.from);
      if (req.query.to) match.createdAt.$lte = new Date(req.query.to);
    }
    const jobs = await B2BJob.find(match)
      .select('jobId companyId source service serviceKey city charge paymentStatus payoutStatus quoteAdjustmentAmount assignedVendorId assignedToName lifecycleStatus status completedAt createdAt')
      .sort({ createdAt: -1 })
      .lean();
    let rows = await paymentsForJobs(jobs, { perspective: 'vendor' });
    if (req.query.status) {
      const wanted = String(req.query.status).toUpperCase().split(',');
      rows = rows.filter((r) => wanted.includes(r.status));
    }
    const summary = ['PENDING', 'PROCESSING', 'PAID', 'FAILED', 'REFUNDED', 'ADJUSTED'].reduce((acc, st) => {
      const subset = rows.filter((r) => r.status === st);
      acc[st] = { count: subset.length, earnings: Math.round(subset.reduce((s, r) => s + r.vendorEarnings, 0) * 100) / 100 };
      return acc;
    }, {});
    return res.status(200).json({
      success: true,
      summary,
      data: rows.slice((page - 1) * limit, page * limit),
      pagination: { page, limit, total: rows.length, totalPages: Math.ceil(rows.length / limit) || 1 }
    });
  } catch (error) {
    return sendJobError(res, error, 'Failed to load payments');
  }
};

exports.settlements = async (req, res) => {
  try {
    const vid = scope(req);
    const period = req.query.period === 'week' ? 'week' : 'month';
    const rows = await settlementsForVendor(vid, { period, from: req.query.from, to: req.query.to });
    return res.status(200).json({
      success: true,
      data: rows.map(({ jobs, ...s }) => ({ ...s, jobCount: jobs.length }))
    });
  } catch (error) {
    return sendJobError(res, error, 'Failed to load settlements');
  }
};

const csvCell = (v) => {
  const s = v === null || v === undefined ? '' : String(v instanceof Date ? v.toISOString() : v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

exports.downloadSettlement = async (req, res) => {
  try {
    const vid = scope(req);
    const period = String(req.params.settlementId || '').length > 18 ? 'week' : 'month';
    let rows = await settlementsForVendor(vid, { period });
    let settlement = rows.find((s) => s.settlementId === req.params.settlementId);
    if (!settlement && period === 'month') {
      rows = await settlementsForVendor(vid, { period: 'week' });
      settlement = rows.find((s) => s.settlementId === req.params.settlementId);
    }
    if (!settlement) return res.status(404).json({ success: false, message: 'Settlement not found' });

    const header = ['Settlement ID', 'Period', 'Job ID', 'Service', 'City', 'Job Amount', 'Commission', 'GST', 'Adjustment', 'Vendor Earnings', 'Status', 'Paid At', 'Reference'];
    const lines = [header.join(',')];
    for (const j of settlement.jobs) {
      lines.push([
        settlement.settlementId, settlement.period.key, j.jobCode, j.service, j.city, j.jobAmount, j.commission, j.gst,
        j.adjustment, j.vendorEarnings, j.status, j.paidAt, j.reference
      ].map(csvCell).join(','));
    }
    lines.push('');
    lines.push(['Totals', '', `${settlement.totalJobs} jobs`, '', '', settlement.grossAmount, settlement.commission, '', settlement.adjustments, settlement.netAmount, settlement.status, settlement.paymentDate, ''].map(csvCell).join(','));

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${settlement.settlementId}.csv"`);
    return res.status(200).send(lines.join('\n'));
  } catch (error) {
    return sendJobError(res, error, 'Failed to download settlement');
  }
};

exports.listCoverage = async (req, res) => {
  try {
    const vid = scope(req);
    const [vendor, coverage] = await Promise.all([
      Vendor.findById(vid).select('approvedServices businessName').lean(),
      VendorServiceCoverage.find({ vendorId: vid }).sort({ serviceKey: 1 }).lean()
    ]);
    if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found' });
    const keys = (vendor.approvedServices || []).map((s) => String(s.categoryCode || '').toUpperCase()).filter(Boolean);
    const configs = await ServiceConfig.find({ categoryCode: { $in: [...new Set([...keys, ...coverage.map((c) => c.serviceKey)])] } })
      .select('categoryCode categoryName isActive').lean();
    const nameOf = new Map(configs.map((c) => [c.categoryCode, c.categoryName]));
    return res.status(200).json({
      success: true,
      data: {
        services: (vendor.approvedServices || []).map((s) => ({
          serviceKey: String(s.categoryCode || '').toUpperCase(),
          serviceName: nameOf.get(String(s.categoryCode || '').toUpperCase()) || s.categoryName,
          approvalStatus: s.status
        })),
        coverage: coverage.map((c) => ({
          id: String(c._id),
          serviceKey: c.serviceKey,
          serviceName: c.serviceName || nameOf.get(c.serviceKey) || c.serviceKey,
          coverageCities: c.coverageCities,
          coveragePincodes: c.coveragePincodes,
          active: c.active,
          updatedAt: c.updatedAt
        }))
      }
    });
  } catch (error) {
    return sendJobError(res, error, 'Failed to load service coverage');
  }
};

exports.upsertCoverage = async (req, res) => {
  try {
    const vid = scope(req);
    const serviceKey = String(req.params.serviceKey || '').toUpperCase().trim();
    const { coverageCities = [], coveragePincodes = [], active = true } = req.body || {};
    if (!Array.isArray(coverageCities) || !Array.isArray(coveragePincodes)) {
      return res.status(400).json({ success: false, message: 'coverageCities and coveragePincodes must be arrays' });
    }
    const badPins = coveragePincodes.filter((p) => !/^[1-9][0-9]{5}$/.test(String(p).trim()));
    if (badPins.length) {
      return res.status(400).json({ success: false, message: `Invalid pincode(s): ${badPins.slice(0, 5).join(', ')}` });
    }
    if (active && !coverageCities.length && !coveragePincodes.length) {
      return res.status(400).json({ success: false, message: 'Add at least one city or pincode, or set active=false' });
    }

    const config = await ServiceConfig.findOne({ categoryCode: serviceKey, isActive: true }).select('_id categoryName').lean();
    if (!config) return res.status(404).json({ success: false, message: `Service ${serviceKey} is not in the active catalog` });

    if (roleOf(req) === 'VENDOR') {
      const vendor = await Vendor.findById(vid).select('approvedServices').lean();
      const svc = (vendor?.approvedServices || []).find((s) => String(s.categoryCode || '').toUpperCase() === serviceKey);
      if (!svc || svc.status === 'suspended') {
        return res.status(403).json({ success: false, message: `You are not approved to provide ${serviceKey}` });
      }
    }

    const actor = actorFromReq(req);
    const doc = await VendorServiceCoverage.findOneAndUpdate(
      { vendorId: vid, serviceKey },
      {
        $set: {
          serviceName: config.categoryName,
          serviceConfigId: config._id,
          coverageCities,
          coveragePincodes: coveragePincodes.map((p) => String(p).trim()),
          active: Boolean(active),
          updatedBy: { actorId: actor.id, role: actor.role }
        }
      },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );

    const { logAudit } = require('../../utils/auditLogger');
    await logAudit({
      actionType: 'VENDOR_COVERAGE_UPDATED',
      eventMessage: `${serviceKey} coverage updated for vendor ${vid}`,
      actorId: actor.id,
      actorRole: actor.role,
      targetId: doc._id,
      targetType: 'VendorServiceCoverage',
      changes: { serviceKey, coverageCities: doc.coverageCities, coveragePincodes: doc.coveragePincodes, active: doc.active }
    });

    return res.status(200).json({ success: true, message: 'Coverage saved', data: doc });
  } catch (error) {
    return sendJobError(res, error, 'Failed to save service coverage');
  }
};
