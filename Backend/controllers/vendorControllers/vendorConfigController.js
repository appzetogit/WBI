const mongoose = require('mongoose');
const Vendor = require('../../models/Vendor');
const ServiceConfig = require('../../models/ServiceConfig');
const VendorOpsProject = require('../../models/VendorOpsProject');
const Opportunity = require('../../models/Opportunity');
const VendorWorkforceEngineer = require('../../models/VendorWorkforceEngineer');
const VendorResourceInstalledAsset = require('../../models/VendorResourceInstalledAsset');
const VendorResourceInventory = require('../../models/VendorResourceInventory');
const VendorGlobalCompliance = require('../../models/VendorGlobalCompliance');
const VendorQualityIssue = require('../../models/VendorQualityIssue');
const VendorQualityProof = require('../../models/VendorQualityProof');
const VendorFinanceWallet = require('../../models/VendorFinanceWallet');
const { getCache, setCache, delCache, isRedisConnected } = require('../../services/redisService');
const { expandCategoryMatchCodes } = require('../../utils/serviceCategoryAliases');
const { buildServiceRoutes, getPrimaryServiceSlug } = require('../../utils/serviceSlug');

const SIDEBAR_SECTIONS = [
  'Dashboard',
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
      VendorFinanceWallet.findOne({ vendorId }).select('availableBalance balance').lean().catch(() => null),
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
