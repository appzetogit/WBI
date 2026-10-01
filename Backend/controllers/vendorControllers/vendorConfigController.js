const mongoose = require('mongoose');
const Vendor = require('../../models/Vendor');
const ServiceConfig = require('../../models/ServiceConfig');
const VendorOpsProject = require('../../models/VendorOpsProject');
const VendorOpsJob = require('../../models/VendorOpsJob');
const B2BJob = require('../../models/B2BJob');
const Booking = require('../../models/Booking');
const ServiceRequest = require('../../models/ServiceRequest');
const Opportunity = require('../../models/Opportunity');
const VendorWorkforceEngineer = require('../../models/VendorWorkforceEngineer');
const VendorResourceInstalledAsset = require('../../models/VendorResourceInstalledAsset');
const VendorResourceInventory = require('../../models/VendorResourceInventory');
const VendorGlobalCompliance = require('../../models/VendorGlobalCompliance');
const VendorQualityIssue = require('../../models/VendorQualityIssue');
const VendorQualityProof = require('../../models/VendorQualityProof');
const VendorFinanceWallet = require('../../models/VendorFinanceWallet');
const VendorFinanceTransaction = require('../../models/VendorFinanceTransaction');
const VendorFinanceReceivable = require('../../models/VendorFinanceReceivable');
const { getCache, setCache, delCache, isRedisConnected } = require('../../services/redisService');
const { expandCategoryMatchCodes } = require('../../utils/serviceCategoryAliases');
const { vendorOpportunityScope, withVendorStatus } = require('../../services/vendorOpportunityInbox.service');
const { buildServiceRoutes, getPrimaryServiceSlug } = require('../../utils/serviceSlug');

const SIDEBAR_SECTIONS = [
  'Dashboard',
  'Requests',
  'My Jobs',
  'Engineers',
  'Business Intake',
  'Clients & Contracts',
  'Project Operations',
  'Workforce',
  'Resources',
  'Quality & Control',
  'Finance',
  'Performance',
  'Compliance',
  'Notifications',
  'Support',
  'Settings'
];

const mergeSidebarFromDashboards = async (codes) => {
  try {
    const DashboardConfiguration = require('../../models/DashboardConfiguration');
    const dashboards = await DashboardConfiguration.find({
      categoryCode: { $in: codes },
      isActive: true
    }).lean();
    if (!dashboards.length) return SIDEBAR_SECTIONS;

    const byKey = new Map();
    dashboards.forEach((d) => {
      (d.sidebarModules || []).forEach((m) => {
        if (m.enabled === false) return;
        const label = m.label || m.key;
        if (!byKey.has(label)) byKey.set(label, m.order ?? 99);
      });
    });
    if (!byKey.size) return SIDEBAR_SECTIONS;

    if (!byKey.has('Dashboard')) byKey.set('Dashboard', 0);
    if (!byKey.has('Requests')) byKey.set('Requests', 1);
    if (!byKey.has('My Jobs')) byKey.set('My Jobs', 2);
    if (!byKey.has('Engineers')) byKey.set('Engineers', 3);

    return Array.from(byKey.entries())
      .sort((a, b) => a[1] - b[1])
      .map(([label]) => label);
  } catch {
    return SIDEBAR_SECTIONS;
  }
};

const mergeWidgetsFromDashboards = async (codes, fallback) => {
  try {
    const DashboardConfiguration = require('../../models/DashboardConfiguration');
    const dashboards = await DashboardConfiguration.find({
      categoryCode: { $in: codes },
      isActive: true
    }).lean();
    if (!dashboards.length) return fallback;
    const keys = new Set();
    dashboards.forEach((d) => {
      (d.widgets || []).forEach((w) => {
        if (w.enabled !== false) keys.add(w.key);
      });
    });
    return keys.size ? Array.from(keys) : fallback;
  } catch {
    return fallback;
  }
};

const CONFIG_TTL = 30 * 60; // 30 minutes
const MASTER_TTL = 24 * 60 * 60; // 24 hours

const vendorObjectId = (req) => new mongoose.Types.ObjectId(req.user._id || req.user.id);

const dedupeByKey = (items, keyFn) => {
  const map = new Map();
  items.forEach((item) => {
    const key = keyFn(item);
    if (!map.has(key)) map.set(key, item);
  });
  return Array.from(map.values());
};

const mergeServiceConfigs = (serviceDocs) => {
  const extraKPIs = [];
  const inventoryCategories = [];
  const toolCategories = [];
  const complianceDocs = [];
  const projectMilestones = {};
  const siteChecklist = {};
  const assetFields = {};

  serviceDocs.forEach((doc) => {
    const code = doc.categoryCode;
    (doc.extraKPIs || []).forEach((kpi) => extraKPIs.push(kpi));
    (doc.inventoryCategories || []).forEach((item) => inventoryCategories.push(item));
    (doc.toolCategories || []).forEach((item) => toolCategories.push(item));
    (doc.complianceDocs || []).forEach((item) => complianceDocs.push(item));
    projectMilestones[code] = doc.projectMilestones || [];
    siteChecklist[code] = doc.siteChecklist || [];
    assetFields[code] = doc.assetFields || [];
  });

  return {
    extraKPIs: dedupeByKey(extraKPIs, (k) => k.key),
    inventoryCategories: dedupeByKey(inventoryCategories, (i) => i.name.toLowerCase()),
    toolCategories: dedupeByKey(toolCategories, (t) => t.name.toLowerCase()),
    complianceDocs: dedupeByKey(complianceDocs, (c) => c.name.toLowerCase()),
    projectMilestones,
    siteChecklist,
    assetFields
  };
};

const loadMasterConfigs = async (codes) => {
  const cacheKey = 'service:config:all';
  let all = null;

  if (isRedisConnected()) {
    all = await getCache(cacheKey);
  }

  if (!all) {
    all = await ServiceConfig.find({ isActive: true, status: { $ne: 'archived' } }).lean();
    if (isRedisConnected() && all.length) {
      await setCache(cacheKey, all, MASTER_TTL);
    }
  }

  if (!codes?.length) return [];
  const codeSet = new Set(codes);
  return all.filter((s) => codeSet.has(s.categoryCode));
};

const buildVendorConfigPayload = async (vendorId) => {
  const vendor = await Vendor.findById(vendorId)
    .select('businessName companyName name email phone approvedServices operationalCities operatingCities vendorTier overallRating masterWallet compliance maxCapacity maxCapacityPerMonth')
    .lean();

  if (!vendor) return null;

  // Include pending + active; only exclude suspended
  const approvedServices = (vendor.approvedServices || []).filter((s) => s.status !== 'suspended');
  const codes = approvedServices.map((s) => s.categoryCode).filter(Boolean);
  const serviceDocs = await loadMasterConfigs(codes);
  const merged = mergeServiceConfigs(serviceDocs);

  console.log('[vendor:config]', {
    vendorId: String(vendorId),
    company: vendor.businessName || vendor.companyName,
    approvedCodes: codes,
    matchedConfigs: serviceDocs.map((d) => d.categoryCode),
    extraKpis: merged.extraKPIs.length
  });

  // Backward-compatible kpiDefinitions for older dashboard UI
  const kpiDefinitions = merged.extraKPIs.map((kpi) => ({
    key: kpi.key,
    label: kpi.label,
    type: 'number',
    unit: kpi.unit,
    icon: kpi.icon,
    color: kpi.color
  }));

  const projectTemplates = {};
  Object.entries(merged.projectMilestones).forEach(([code, milestones]) => {
    projectTemplates[code] = {
      phases: (milestones || []).map((m) => m.title),
      milestones
    };
  });

  let activeProjectsCount = 0;
  let pendingOpportunitiesCount = 0;
  try {
    const matchCodes = await expandCategoryMatchCodes(codes);
    const oppFilter = {
      status: 'open',
      eligibleVendors: vendorId
    };
    if (matchCodes.length) oppFilter.categoryCode = { $in: matchCodes };

    [activeProjectsCount, pendingOpportunitiesCount] = await Promise.all([
      VendorOpsProject.countDocuments({
        vendorId,
        status: { $in: ['active', 'in_progress', 'planned', 'on_hold', 'quality_check', 'planning'] }
      }).catch(() => 0),
      Opportunity.countDocuments(oppFilter).catch(() => 0)
    ]);
  } catch {
    // ignore count failures
  }

  const displayName = vendor.businessName || vendor.companyName || vendor.name || '';
  const serviceRoutes = buildServiceRoutes(approvedServices);
  const primaryServiceSlug = getPrimaryServiceSlug(serviceRoutes);

  const defaultWidgets = ['wallet', 'active_projects', 'available_engineers', 'sla_adherence', ...codes.map((c) => `${c.toLowerCase()}_kpis`)];
  const [sidebarSections, dashboardWidgets] = await Promise.all([
    mergeSidebarFromDashboards(codes),
    mergeWidgetsFromDashboards(codes, defaultWidgets)
  ]);

  return {
    vendorId: String(vendor._id),
    companyName: displayName,
    vendorTier: vendor.vendorTier || 'bronze',
    approvedServices,
    serviceRoutes,
    primaryServiceSlug,
    primaryService: serviceRoutes[0] || null,
    operationalCities: vendor.operationalCities || vendor.operatingCities || [],
    maxCapacityPerMonth: vendor.maxCapacityPerMonth || vendor.maxCapacity || 10,
    vendorProfile: {
      walletBalance: vendor.masterWallet?.balance || 0,
      vendorTier: vendor.vendorTier || 'bronze',
      overallRating: vendor.overallRating || 0,
      complianceStatus: vendor.compliance || null,
      companyName: displayName,
      businessName: displayName,
      email: vendor.email || '',
      phone: vendor.phone || '',
      name: vendor.name || '',
      primaryServiceSlug
    },
    dashboardWidgets,
    sidebarSections,
    kpiDefinitions,
    extraKPIs: merged.extraKPIs,
    inventoryCategories: merged.inventoryCategories,
    toolCategories: merged.toolCategories,
    projectMilestones: merged.projectMilestones,
    projectTemplates,
    siteChecklist: merged.siteChecklist,
    complianceDocs: merged.complianceDocs,
    assetFields: merged.assetFields,
    activeProjectsCount,
    pendingOpportunitiesCount,
    alerts: []
  };
};

exports.invalidateVendorConfigCache = async (vendorId) => {
  if (!vendorId) return;
  await delCache(`vendor:config:${vendorId}`);
};

exports.invalidateServiceConfigMasterCache = async () => {
  const { invalidateAllCatalogCaches } = require('../../services/catalogCache.service');
  await invalidateAllCatalogCaches();
};

/**
 * GET /api/vendor/config
 */
exports.getDynamicConfig = async (req, res) => {
  try {
    const vendorId = String(req.user._id || req.user.id);
    const cacheKey = `vendor:config:${vendorId}`;

    if (isRedisConnected()) {
      const cached = await getCache(cacheKey);
      // Stale caches from before service-slug routing lack serviceRoutes — rebuild
      if (cached?.serviceRoutes?.length && cached?.primaryServiceSlug) {
        return res.status(200).json({ success: true, data: cached, cached: true });
      }
      if (cached) {
        await delCache(cacheKey);
      }
    }

    const payload = await buildVendorConfigPayload(vendorId);
    if (!payload) {
      return res.status(404).json({ success: false, message: 'Vendor not found' });
    }

    if (isRedisConnected()) {
      await setCache(cacheKey, payload, CONFIG_TTL);
    }

    return res.status(200).json({ success: true, data: payload, cached: false });
  } catch (error) {
    console.error('Config API Error:', error);
    return res.status(500).json({ success: false, message: 'Server Error fetching config' });
  }
};

const resolveExtraKpiValue = async (vendorId, kpi) => {
  const source = kpi.dataSource || 'installed_assets';
  const vid = new mongoose.Types.ObjectId(vendorId);
  try {
    if (source === 'installed_assets') {
      const filter = { vendorId: vid, status: { $ne: 'retired' } };
      if (kpi.countValue) {
        const val = String(kpi.countValue);
        filter.$or = [
          { assetType: new RegExp(val, 'i') },
          { name: new RegExp(val, 'i') },
          { serviceCategoryCode: val.toUpperCase().startsWith('C') ? val.toUpperCase() : undefined }
        ].filter((clause) => {
          const v = Object.values(clause)[0];
          return v !== undefined;
        });
        if (!filter.$or.length) delete filter.$or;
      }
      return VendorResourceInstalledAsset.countDocuments(filter);
    }

    if (source === 'projects') {
      const status = kpi.countValue || 'completed';
      return VendorOpsProject.countDocuments({
        vendorId: vid,
        status: new RegExp(status, 'i')
      });
    }

    if (source === 'quality_issues') {
      return VendorQualityIssue.countDocuments({
        vendorId: vid,
        status: new RegExp(kpi.countValue || 'resolved', 'i')
      });
    }

    if (source === 'quality_proofs') {
      return VendorQualityProof.countDocuments({
        vendorId: vid,
        status: new RegExp(kpi.countValue || 'approved', 'i')
      });
    }
  } catch (err) {
    console.warn(`[KPI] ${kpi.key} failed:`, err.message);
  }
  return 0;
};

/**
 * GET /api/vendor/dashboard/kpis
 */
exports.getDashboardKpis = async (req, res) => {
  try {
    const vendorId = vendorObjectId(req);
    const vid = String(req.user._id || req.user.id);

    const payload = await buildVendorConfigPayload(vid);
    if (!payload) {
      return res.status(404).json({ success: false, message: 'Vendor not found' });
    }

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [activeProjects, availableEngineers, wallet, completedProjects, totalProjects] = await Promise.all([
      VendorOpsProject.countDocuments({
        vendorId,
        status: { $in: ['active', 'in_progress', 'planned', 'quality_check'] }
      }).catch(() => 0),
      VendorWorkforceEngineer.countDocuments({
        vendorId,
        status: 'active',
        availability: 'available'
      }).catch(() => 0),
      VendorFinanceWallet.findOne({ vendorId }).select('availableBalance balance escrowBalance').lean().catch(() => null),
      VendorOpsProject.countDocuments({ vendorId, status: /completed|closed/i }).catch(() => 0),
      VendorOpsProject.countDocuments({ vendorId }).catch(() => 1)
    ]);

    const walletBalance = wallet?.availableBalance ?? wallet?.balance ?? payload.vendorProfile.walletBalance ?? 0;
    const slaAdherence = totalProjects > 0
      ? Math.min(100, Math.round((completedProjects / Math.max(totalProjects, 1)) * 100))
      : 0;

    const extraResults = await Promise.allSettled(
      (payload.extraKPIs || []).map(async (kpi) => ({
        key: kpi.key,
        label: kpi.label,
        unit: kpi.unit,
        icon: kpi.icon,
        color: kpi.color,
        value: await resolveExtraKpiValue(vid, kpi)
      }))
    );

    const extra = extraResults
      .filter((r) => r.status === 'fulfilled')
      .map((r) => r.value);

    return res.status(200).json({
      success: true,
      data: {
        base: {
          activeProjects,
          availableEngineers,
          walletBalance,
          slaAdherence
        },
        extra
      }
    });
  } catch (error) {
    console.error('Dashboard KPIs error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch dashboard KPIs' });
  }
};

/**
 * GET /api/vendor/dashboard/operational-summary
 * Operational single-screen overview covering:
 * 1. New User Requests
 * 2. New B2B Jobs
 * 3. Active Jobs (User vs B2B)
 * 4. In Progress (Live execution)
 * 5. Completed Jobs
 * 6. Available Engineers
 * 7. Earnings & Financial Summary
 */
exports.getOperationalSummary = async (req, res) => {
  try {
    const vid = vendorObjectId(req);
    const vendorIdStr = String(req.user._id || req.user.id);

    const vendorDoc = await Vendor.findById(vid)
      .select('approvedServices categories service walletBalance businessName companyName vendorTier overallRating')
      .lean();
    if (!vendorDoc) {
      return res.status(404).json({ success: false, message: 'Vendor not found' });
    }

    const approvedCodes = (vendorDoc.approvedServices || [])
      .filter((s) => s.status !== 'suspended')
      .map((s) => s.categoryCode)
      .filter(Boolean);
    const legacyCats = Array.isArray(vendorDoc.categories) ? vendorDoc.categories : [];
    const matchCodes = await expandCategoryMatchCodes([...approvedCodes, ...legacyCats]);

    // Same rule as the Requests list: "new" = this vendor can accept it right now.
    const scope = vendorOpportunityScope(vid, matchCodes);
    const newForVendor = async (opps) =>
      (await withVendorStatus(opps, vid)).filter((row) => row.status === 'new').map((row) => row.opp);

    // ── 1. NEW USER REQUESTS ──
    const [userOpps, pendingBookings, pendingServiceRequests] = await Promise.all([
      Opportunity.find({ status: 'open', type: 'client_request', ...scope })
        .sort({ createdAt: -1 })
        .lean()
        .then(newForVendor)
        .catch(() => []),
      Booking.find({
        $or: [
          { vendorId: vid, status: 'requested' },
          { vendorId: null, status: { $in: ['requested', 'searching'] }, 'potentialVendors.vendorId': vid }
        ]
      }).sort({ createdAt: -1 }).limit(10).lean().catch(() => []),
      ServiceRequest.find({
        assignedVendorId: vid,
        status: 'Pending'
      }).sort({ createdAt: -1 }).limit(10).lean().catch(() => [])
    ]);

    const newUserRequestsList = [
      ...userOpps.map((opp) => ({
        id: opp._id,
        oppCode: opp.opportunityCode,
        title: opp.title,
        source: 'USER JOB',
        categoryName: opp.categoryName,
        categoryCode: opp.categoryCode,
        clientName: opp.clientInfo?.name || 'Customer',
        clientPhone: opp.clientInfo?.phone || '',
        city: opp.clientInfo?.city || opp.requirements?.cities?.[0] || 'Local',
        address: opp.clientInfo?.address || '',
        budget: opp.budget?.max || opp.budget?.min || 0,
        priority: opp.priority || 'normal',
        createdAt: opp.createdAt,
        status: 'Action Required',
        type: 'opportunity'
      })),
      ...pendingBookings.map((b) => ({
        id: b._id,
        oppCode: b.bookingId || `BK-${String(b._id).slice(-6)}`,
        title: b.serviceName || b.categoryName || 'Direct Booking Request',
        source: 'USER JOB',
        categoryName: b.categoryName || 'Home Service',
        categoryCode: b.categoryCode || '',
        clientName: b.userName || b.contactName || 'Customer',
        clientPhone: b.userPhone || b.contactPhone || '',
        city: b.city || b.address?.city || 'Local',
        address: b.address?.addressLine || b.address?.fullAddress || '',
        budget: b.totalAmount || b.estimatedAmount || 0,
        priority: 'high',
        createdAt: b.createdAt,
        status: b.status || 'Requested',
        type: 'booking'
      })),
      ...pendingServiceRequests.map((sr) => ({
        id: sr._id,
        oppCode: sr.requestCode,
        title: `${sr.categoryName} - ${sr.subCategoryName}`,
        source: 'USER JOB',
        categoryName: sr.categoryName,
        categoryCode: sr.categoryCode,
        clientName: sr.contact?.name || 'Customer',
        clientPhone: sr.contact?.phone || '',
        city: sr.contact?.city || 'Local',
        address: sr.contact?.address || '',
        budget: sr.payment?.amount || 0,
        priority: 'normal',
        createdAt: sr.createdAt,
        status: 'Pending',
        type: 'service_request'
      }))
    ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const newUserRequestsCount = newUserRequestsList.length;

    // ── 2. NEW B2B JOBS ──
    const [b2bOpps, directB2BJobs] = await Promise.all([
      Opportunity.find({
        status: 'open',
        type: { $in: ['b2b_opportunity', 'bulk_requirement', 'bid_quote_request', 'direct_invitation'] },
        ...scope
      })
        .sort({ createdAt: -1 })
        .lean()
        .then(newForVendor)
        .catch(() => []),
      B2BJob.find({
        assignedVendorId: vid,
        status: { $in: ['pending', 'searching_engineer', 'assigned'] }
      }).populate('companyId', 'companyName name').sort({ createdAt: -1 }).limit(10).lean().catch(() => [])
    ]);

    const newB2BJobsList = [
      ...b2bOpps.map((opp) => ({
        id: opp._id,
        jobCode: opp.opportunityCode,
        title: opp.title,
        source: 'B2B JOB',
        categoryName: opp.categoryName,
        categoryCode: opp.categoryCode,
        companyName: opp.clientInfo?.company || opp.clientInfo?.name || 'Enterprise Client',
        city: opp.clientInfo?.city || opp.requirements?.cities?.[0] || 'Multi-site',
        totalSites: opp.requirements?.totalSites || 1,
        budget: opp.budget?.max || opp.budget?.min || 0,
        priority: opp.priority || 'high',
        createdAt: opp.createdAt,
        status: 'Action Required',
        type: 'opportunity'
      })),
      ...directB2BJobs.map((job) => ({
        id: job._id,
        jobCode: job.jobId,
        title: `${job.service} - ${job.subService || 'Site Maintenance'}`,
        source: 'B2B JOB',
        categoryName: job.service,
        categoryCode: job.service,
        companyName: job.companyId?.companyName || job.customerName || 'B2B Enterprise',
        city: job.city,
        totalSites: 1,
        budget: job.charge || 0,
        priority: job.priority || 'Medium',
        createdAt: job.createdAt,
        status: job.status,
        type: 'b2b_job'
      }))
    ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const newB2BJobsCount = newB2BJobsList.length;

    // ── 3. ACTIVE JOBS (with User vs B2B breakdown) ──
    const [activeProjects, activeOpsJobs, activeB2BDirect, activeBookings] = await Promise.all([
      VendorOpsProject.find({
        vendorId: vid,
        status: { $in: ['planning', 'in_progress', 'draft', 'at_risk'] }
      }).sort({ updatedAt: -1 }).lean().catch(() => []),
      VendorOpsJob.find({
        vendorId: vid,
        status: { $in: ['pending_acceptance', 'accepted', 'en_route', 'on_site', 'in_progress'] }
      }).populate('engineerId', 'name phone').sort({ updatedAt: -1 }).lean().catch(() => []),
      B2BJob.find({
        assignedVendorId: vid,
        status: { $in: ['assigned', 'accepted', 'travelling', 'arrived', 'in_progress', 'completion_submitted'] }
      }).populate('assignedTo', 'name phone').sort({ updatedAt: -1 }).lean().catch(() => []),
      Booking.find({
        vendorId: vid,
        status: { $in: ['accepted', 'assigned', 'in_progress', 'journey_started', 'visited', 'started', 'reached', 'on_the_way'] }
      }).sort({ updatedAt: -1 }).lean().catch(() => [])
    ]);

    const userActiveProjectsCount = activeProjects.filter((p) => p.clientType === 'individual').length + activeBookings.length;
    const b2bActiveProjectsCount = activeProjects.filter((p) => p.clientType !== 'individual').length + activeB2BDirect.length;
    const totalActiveJobsCount = userActiveProjectsCount + b2bActiveProjectsCount;

    const activeJobsList = [
      ...activeProjects.map((p) => ({
        id: p._id,
        code: p.projectCode,
        title: p.title,
        source: p.clientType === 'individual' ? 'USER JOB' : 'B2B JOB',
        sourceType: p.clientType === 'individual' ? 'user' : 'b2b',
        clientName: p.clientName || (p.clientType === 'individual' ? 'Individual Customer' : 'B2B Corporate'),
        categoryName: p.serviceCategoryName,
        categoryCode: p.serviceCategoryCode,
        status: p.status,
        progress: p.progress || 0,
        currentStage: p.currentStage || 'Active Operations',
        city: p.city || 'Standard',
        engineersAssigned: p.assignedEngineers || [],
        updatedAt: p.updatedAt
      })),
      ...activeB2BDirect.map((b) => ({
        id: b._id,
        code: b.jobId,
        title: `${b.service} (${b.subService || 'Work'})`,
        source: 'B2B JOB',
        sourceType: 'b2b',
        clientName: b.customerName || 'B2B Enterprise',
        categoryName: b.service,
        categoryCode: b.service,
        status: b.status,
        progress: b.status === 'in_progress' ? 65 : b.status === 'completion_submitted' ? 90 : 35,
        currentStage: b.trackingStatus || b.status,
        city: b.city,
        engineersAssigned: b.assignedTo ? [{ name: b.assignedTo.name, engineerId: b.assignedTo._id }] : [],
        updatedAt: b.updatedAt
      })),
      ...activeBookings.map((bk) => ({
        id: bk._id,
        code: bk.bookingId || `BK-${String(bk._id).slice(-6)}`,
        title: bk.serviceName || 'Direct Service Booking',
        source: 'USER JOB',
        sourceType: 'user',
        clientName: bk.userName || 'Customer',
        categoryName: bk.categoryName || 'Service',
        categoryCode: bk.categoryCode,
        status: bk.status,
        progress: bk.status === 'in_progress' ? 70 : 40,
        currentStage: bk.status,
        city: bk.city || 'Local',
        engineersAssigned: bk.workerName ? [{ name: bk.workerName }] : [],
        updatedAt: bk.updatedAt
      }))
    ].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)).slice(0, 10);

    // ── 4. IN PROGRESS (Live Field Execution) ──
    const inProgressOps = activeOpsJobs.filter((j) => ['in_progress', 'on_site', 'en_route'].includes(j.status));
    const inProgressB2B = activeB2BDirect.filter((j) => ['in_progress', 'travelling', 'arrived'].includes(j.status));
    const inProgressBookings = activeBookings.filter((b) => ['in_progress', 'started', 'reached', 'on_the_way'].includes(b.status));

    const inProgressList = [
      ...inProgressOps.map((j) => ({
        id: j._id,
        code: j.jobCode,
        title: j.title,
        source: 'B2B JOB',
        sourceType: 'b2b',
        engineerName: j.engineerName || j.engineerId?.name || 'Field Engineer',
        engineerPhone: j.engineerId?.phone || '',
        status: j.status,
        startTime: j.startedAt || j.assignedAt,
        city: j.city || '',
        budget: j.budget || 0,
        progress: j.status === 'in_progress' ? 75 : 40
      })),
      ...inProgressB2B.map((j) => ({
        id: j._id,
        code: j.jobId,
        title: `${j.service} - ${j.subService || 'Field Work'}`,
        source: 'B2B JOB',
        sourceType: 'b2b',
        engineerName: j.assignedToName || j.assignedTo?.name || 'Engineer',
        engineerPhone: j.assignedTo?.phone || '',
        status: j.status,
        startTime: j.startedAt || j.travelStartedAt || j.assignedAt,
        city: j.city,
        budget: j.charge || 0,
        progress: j.status === 'in_progress' ? 70 : 35
      })),
      ...inProgressBookings.map((b) => ({
        id: b._id,
        code: b.bookingId || `BK-${String(b._id).slice(-6)}`,
        title: b.serviceName || 'Direct Booking Execution',
        source: 'USER JOB',
        sourceType: 'user',
        engineerName: b.workerName || 'Technician',
        engineerPhone: b.workerPhone || '',
        status: b.status,
        startTime: b.startedAt || b.createdAt,
        city: b.city || '',
        budget: b.totalAmount || 0,
        progress: b.status === 'in_progress' ? 65 : 30
      }))
    ];
    const inProgressCount = inProgressList.length;

    // ── 5. COMPLETED JOBS & EARNINGS ──
    const [completedProjects, completedOpsJobs, completedB2B, completedBookings] = await Promise.all([
      VendorOpsProject.find({ vendorId: vid, status: /completed|closed/i }).sort({ updatedAt: -1 }).limit(10).lean().catch(() => []),
      VendorOpsJob.find({ vendorId: vid, status: 'completed' }).sort({ completedAt: -1 }).limit(10).lean().catch(() => []),
      B2BJob.find({ assignedVendorId: vid, status: 'completed' }).sort({ completedAt: -1 }).limit(10).lean().catch(() => []),
      Booking.find({ vendorId: vid, status: 'completed' }).sort({ completedAt: -1 }).limit(10).lean().catch(() => [])
    ]);

    const totalCompletedCount = completedProjects.length + completedOpsJobs.length + completedB2B.length + completedBookings.length;

    const completedList = [
      ...completedProjects.map((p) => ({
        id: p._id,
        code: p.projectCode,
        title: p.title,
        source: p.clientType === 'individual' ? 'USER JOB' : 'B2B JOB',
        sourceType: p.clientType === 'individual' ? 'user' : 'b2b',
        engineerName: p.assignedEngineers?.[0]?.name || p.assignedManager || 'Field Team',
        completionDate: p.endDate || p.updatedAt,
        amount: p.budget || 0,
        finalStatus: 'Completed'
      })),
      ...completedOpsJobs.map((j) => ({
        id: j._id,
        code: j.jobCode,
        title: j.title,
        source: 'B2B JOB',
        sourceType: 'b2b',
        engineerName: j.engineerName || 'Engineer',
        completionDate: j.completedAt || j.updatedAt,
        amount: j.budget || 0,
        finalStatus: 'Completed'
      })),
      ...completedB2B.map((j) => ({
        id: j._id,
        code: j.jobId,
        title: j.service,
        source: 'B2B JOB',
        sourceType: 'b2b',
        engineerName: j.assignedToName || 'Engineer',
        completionDate: j.completedAt || j.updatedAt,
        amount: j.charge || 0,
        finalStatus: 'Completed'
      })),
      ...completedBookings.map((b) => ({
        id: b._id,
        code: b.bookingId || `BK-${String(b._id).slice(-6)}`,
        title: b.serviceName || 'Direct Booking',
        source: 'USER JOB',
        sourceType: 'user',
        engineerName: b.workerName || 'Worker',
        completionDate: b.completedAt || b.updatedAt,
        amount: b.totalAmount || 0,
        finalStatus: 'Completed'
      }))
    ].sort((a, b) => new Date(b.completionDate) - new Date(a.completionDate)).slice(0, 10);

    // ── 6. AVAILABLE ENGINEERS ──
    const [availableEngineersList, totalEngineersCount] = await Promise.all([
      VendorWorkforceEngineer.find({
        vendorId: vid,
        status: 'active',
        availability: 'available'
      }).sort({ rating: -1, name: 1 }).limit(10).lean().catch(() => []),
      VendorWorkforceEngineer.countDocuments({
        vendorId: vid,
        status: 'active'
      }).catch(() => 0)
    ]);

    const availableEngineersCount = availableEngineersList.length;

    // ── 7. EARNINGS & WALLET DATA ──
    const [walletDoc, txns, receivables] = await Promise.all([
      VendorFinanceWallet.findOne({ vendorId: vid }).lean().catch(() => null),
      VendorFinanceTransaction.find({
        vendorId: vid,
        status: 'completed',
        type: { $in: ['credit', 'escrow_release', 'payment', 'payout'] }
      }).lean().catch(() => []),
      VendorFinanceReceivable.find({
        vendorId: vid,
        status: { $in: ['pending', 'partial', 'overdue'] }
      }).lean().catch(() => [])
    ]);

    const walletBalance = walletDoc?.availableBalance ?? walletDoc?.balance ?? vendorDoc.walletBalance ?? 0;
    const escrowBalance = walletDoc?.escrowBalance ?? 0;

    let totalEarnings = 0;
    let b2bEarnings = 0;
    let userEarnings = 0;

    txns.forEach((t) => {
      const amt = Number(t.amount || 0);
      totalEarnings += amt;
      if (t.source === 'b2b' || t.clientType === 'b2b' || t.notes?.toLowerCase().includes('b2b')) {
        b2bEarnings += amt;
      } else {
        userEarnings += amt;
      }
    });

    if (totalEarnings === 0 && (walletBalance > 0 || completedList.length > 0)) {
      totalEarnings = completedList.reduce((sum, item) => sum + (Number(item.amount) || 0), 0) || walletBalance;
      b2bEarnings = completedList.filter((i) => i.sourceType === 'b2b').reduce((s, i) => s + (Number(i.amount) || 0), 0);
      userEarnings = completedList.filter((i) => i.sourceType === 'user').reduce((s, i) => s + (Number(i.amount) || 0), 0);
    }

    const pendingAmount = receivables.reduce((sum, r) => sum + ((Number(r.amount) || 0) - (Number(r.paidAmount) || 0)), 0);

    return res.status(200).json({
      success: true,
      data: {
        vendorProfile: {
          companyName: vendorDoc.companyName || vendorDoc.businessName || 'Vendor Partner',
          vendorTier: vendorDoc.vendorTier || 'bronze',
          overallRating: vendorDoc.overallRating || 0,
          approvedServices: vendorDoc.approvedServices || []
        },
        counts: {
          newUserRequests: newUserRequestsCount,
          newB2BJobs: newB2BJobsCount,
          activeJobs: totalActiveJobsCount,
          userActiveJobs: userActiveProjectsCount,
          b2bActiveJobs: b2bActiveProjectsCount,
          inProgress: inProgressCount,
          completed: totalCompletedCount,
          availableEngineers: availableEngineersCount,
          totalEngineers: totalEngineersCount,
          walletBalance,
          escrowBalance,
          totalEarnings,
          userEarnings,
          b2bEarnings,
          pendingAmount
        },
        lists: {
          newUserRequests: newUserRequestsList.slice(0, 5),
          newB2BJobs: newB2BJobsList.slice(0, 5),
          activeJobs: activeJobsList,
          inProgress: inProgressList.slice(0, 8),
          completed: completedList.slice(0, 8),
          availableEngineers: availableEngineersList.map((e) => ({
            id: e._id,
            name: e.name,
            phone: e.phone,
            email: e.email,
            rating: e.rating || 4.8,
            primarySkill: e.primarySkill || e.skills?.[0] || 'Technician',
            city: e.city || 'Standard',
            availability: e.availability || 'available',
            status: e.status
          }))
        }
      }
    });
  } catch (error) {
    console.error('getOperationalSummary error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch operational summary' });
  }
};

/**
 * GET /api/vendor/dashboard/alerts
 */
exports.getDashboardAlerts = async (req, res) => {
  try {
    const vendorId = vendorObjectId(req);
    const soon = new Date(Date.now() + 30 * 86400000);
    const alerts = [];

    const [lowStock, complianceAlerts, pendingInvites] = await Promise.all([
      VendorResourceInventory.countDocuments({
        vendorId,
        $or: [{ stockStatus: /low|out/i }, { quantity: { $lte: 5 } }]
      }).catch(() => 0),
      VendorGlobalCompliance.countDocuments({
        vendorId,
        $or: [
          { status: { $in: ['pending', 'expired', 'renewal_required'] } },
          { expiresAt: { $lte: soon } }
        ]
      }).catch(() => 0),
      Opportunity.countDocuments({
        status: 'open',
        eligibleVendors: vendorId,
        invitationType: /direct/i
      }).catch(() => 0)
    ]);

    if (complianceAlerts > 0) {
      alerts.push({
        type: 'compliance',
        severity: 'warning',
        title: 'Compliance action needed',
        message: `${complianceAlerts} document(s) pending, expired, or renewing soon.`
      });
    }
    if (lowStock > 0) {
      alerts.push({
        type: 'inventory',
        severity: 'warning',
        title: 'Low stock alert',
        message: `${lowStock} inventory item(s) are low or out of stock.`
      });
    }
    if (pendingInvites > 0) {
      alerts.push({
        type: 'invitation',
        severity: 'info',
        title: 'New direct invitations',
        message: `${pendingInvites} invitation(s) waiting for your response.`
      });
    }

    return res.status(200).json({ success: true, data: alerts });
  } catch (error) {
    console.error('Dashboard alerts error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch alerts' });
  }
};

/**
 * GET /api/admin/service-configs
 */
exports.listServiceConfigs = async (req, res) => {
  try {
    const filter = {};
    if (req.query.includeArchived !== 'true') {
      filter.status = { $ne: 'archived' };
    }
    const data = await ServiceConfig.find(filter).sort({ displayOrder: 1, categoryCode: 1 }).lean();
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('List service configs error:', error);
    return res.status(500).json({ success: false, message: 'Failed to list service configs' });
  }
};

/**
 * PUT /api/admin/service-configs/:categoryCode
 */
exports.updateServiceConfig = async (req, res) => {
  try {
    const { categoryCode } = req.params;
    const existing = await ServiceConfig.findOne({ categoryCode: categoryCode.toUpperCase() });
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Service config not found' });
    }
    const versionBefore = existing.version || 1;
    Object.assign(existing, req.body || {});
    existing.categoryCode = categoryCode.toUpperCase();
    existing.version = versionBefore + 1;
    await existing.save();
    await exports.invalidateServiceConfigMasterCache();
    return res.status(200).json({ success: true, data: existing });
  } catch (error) {
    console.error('Update service config error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update service config' });
  }
};

/**
 * POST /api/admin/vendors/:id/approve-service
 */
exports.approveVendorService = async (req, res) => {
  try {
    const { categoryCode, subServices = [], categoryName } = req.body;
    if (!categoryCode) {
      return res.status(400).json({ success: false, message: 'categoryCode is required' });
    }

    const serviceDoc = await ServiceConfig.findOne({ categoryCode: categoryCode.toUpperCase() }).lean();
    const vendor = await Vendor.findById(req.params.id);
    if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found' });

    const code = categoryCode.toUpperCase();
    const existing = (vendor.approvedServices || []).find((s) => s.categoryCode === code);
    if (existing) {
      existing.status = 'active';
      existing.subServices = subServices.length ? subServices : existing.subServices;
      existing.approvedAt = new Date();
      if (categoryName || serviceDoc?.categoryName) {
        existing.categoryName = categoryName || serviceDoc.categoryName;
      }
    } else {
      vendor.approvedServices.push({
        categoryCode: code,
        categoryName: categoryName || serviceDoc?.categoryName || code,
        subServices,
        approvedAt: new Date(),
        status: 'active'
      });
    }

    await vendor.save();

    // Sync legacy arrays
    vendor.service = (vendor.approvedServices || [])
      .filter((s) => s.status !== 'suspended')
      .map((s) => s.categoryName);
    vendor.categories = (vendor.approvedServices || [])
      .filter((s) => s.status !== 'suspended')
      .map((s) => s.categoryCode);
    await vendor.save();

    await exports.invalidateVendorConfigCache(vendor._id);

    try {
      const io = req.app.get('io');
      if (io) {
        io.to(`vendor:${vendor._id}`).emit('service-approved', {
          categoryCode: code,
          categoryName: categoryName || serviceDoc?.categoryName || code
        });
      }
    } catch {
      // ignore
    }

    return res.status(200).json({
      success: true,
      message: 'Service approved',
      data: vendor.approvedServices
    });
  } catch (error) {
    console.error('Approve vendor service error:', error);
    return res.status(500).json({ success: false, message: 'Failed to approve service' });
  }
};

/**
 * DELETE /api/admin/vendors/:id/services/:code
 */
exports.suspendVendorService = async (req, res) => {
  try {
    const code = String(req.params.code || '').toUpperCase();
    const vendor = await Vendor.findById(req.params.id);
    if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found' });

    const service = (vendor.approvedServices || []).find((s) => s.categoryCode === code);
    if (!service) {
      return res.status(404).json({ success: false, message: 'Service not found on vendor' });
    }

    service.status = 'suspended';
    await vendor.save();
    await exports.invalidateVendorConfigCache(vendor._id);

    try {
      const io = req.app.get('io');
      if (io) {
        io.to(`vendor:${vendor._id}`).emit('service-suspended', {
          categoryCode: code,
          reason: req.body?.reason || 'Service suspended by admin'
        });
      }
    } catch {
      // ignore
    }

    return res.status(200).json({ success: true, message: 'Service suspended', data: vendor.approvedServices });
  } catch (error) {
    console.error('Suspend vendor service error:', error);
    return res.status(500).json({ success: false, message: 'Failed to suspend service' });
  }
};
