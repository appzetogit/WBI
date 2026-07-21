const ServiceConfig = require('../../models/ServiceConfig');
const FormSchema = require('../../models/FormSchema');
const ServiceConfigAudit = require('../../models/ServiceConfigAudit');
const RegistrationTemplate = require('../../models/RegistrationTemplate');
const DashboardConfiguration = require('../../models/DashboardConfiguration');
const PermissionConfiguration = require('../../models/PermissionConfiguration');
const ProjectTemplate = require('../../models/projectOS/ProjectTemplate');
const {
  publishServiceCatalog,
  allocateNextCategoryCode,
  writeAudit,
  ensureRegistrationAndDashboardDefaults,
  DEFAULT_FORM_FIELDS
} = require('../../services/publishServiceCatalog.service');
const { invalidateAllCatalogCaches } = require('../../services/catalogCache.service');

const actorFromReq = (req) => ({
  _id: req.user?._id || req.user?.id,
  email: req.user?.email || ''
});

const escapeRegex = (str = '') => String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * GET /api/admin/service-management
 * List with search, status filter, pagination, sort.
 */
exports.listServices = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);
    const sort = String(req.query.sort || 'categoryCode');
    const order = String(req.query.order || 'asc').toLowerCase() === 'desc' ? -1 : 1;
    const status = req.query.status;
    const q = String(req.query.q || '').trim();

    const filter = {};
    if (status && status !== 'all') filter.status = status;
    if (req.query.isActive != null) filter.isActive = req.query.isActive === 'true';
    if (q) {
      const regex = new RegExp(escapeRegex(q), 'i');
      filter.$or = [
        { categoryCode: regex },
        { categoryName: regex },
        { description: regex },
        { tags: regex }
      ];
    }

    const [total, data] = await Promise.all([
      ServiceConfig.countDocuments(filter),
      ServiceConfig.find(filter)
        .sort({ [sort]: order })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
    ]);

    res.json({
      success: true,
      total,
      page,
      limit,
      data
    });
  } catch (error) {
    console.error('listServices error:', error);
    res.status(500).json({ success: false, message: 'Failed to list services' });
  }
};

/**
 * GET /api/admin/service-management/:categoryCode
 */
exports.getService = async (req, res) => {
  try {
    const code = String(req.params.categoryCode || '').toUpperCase();
    const config = await ServiceConfig.findOne({ categoryCode: code }).lean();
    if (!config) return res.status(404).json({ success: false, message: 'Service not found' });

    const [forms, registration, dashboard, permissions, audits, projectTemplates] = await Promise.all([
      FormSchema.find({ categoryCode: code }).sort({ subCatCode: 1 }).lean(),
      RegistrationTemplate.findOne({ categoryCode: code }).lean(),
      DashboardConfiguration.findOne({ categoryCode: code }).lean(),
      PermissionConfiguration.find({ categoryCode: code }).lean(),
      ServiceConfigAudit.find({ categoryCode: code }).sort({ createdAt: -1 }).limit(30).lean(),
      ProjectTemplate.find({ categoryCode: code, isDeleted: { $ne: true } })
        .select('templateKey name status version categoryCode')
        .lean()
        .catch(() => [])
    ]);

    res.json({
      success: true,
      data: {
        config,
        forms,
        registration,
        dashboard,
        permissions,
        audits,
        projectTemplates
      }
    });
  } catch (error) {
    console.error('getService error:', error);
    res.status(500).json({ success: false, message: 'Failed to load service' });
  }
};

/**
 * POST /api/admin/service-management
 */
exports.createService = async (req, res) => {
  try {
    const body = req.body || {};
    const categoryCode = await allocateNextCategoryCode(body.categoryCode);
    if (!body.categoryName?.trim()) {
      return res.status(400).json({ success: false, message: 'categoryName is required' });
    }

    const doc = await ServiceConfig.create({
      categoryCode,
      categoryName: body.categoryName.trim(),
      description: body.description || '',
      tags: body.tags || [],
      displayOrder: body.displayOrder || 0,
      type: body.type || 'project_based',
      serviceType: body.serviceType || 'hybrid',
      icon: body.icon || 'FiGrid',
      image: body.image || null,
      color: body.color || '#3B82F6',
      requiredVendorType: body.requiredVendorType || 'enterprise',
      requiredSkills: body.requiredSkills || [],
      requiredDocuments: body.requiredDocuments || [],
      subCategories: (body.subCategories || []).map((s, i) => ({
        subCatCode: (s.subCatCode || `${categoryCode}-${String(i + 1).padStart(2, '0')}`).toUpperCase(),
        subCatName: s.subCatName || s.name,
        description: s.description || '',
        icon: s.icon || body.icon || 'FiCheckCircle',
        basePrice: s.basePrice != null ? s.basePrice : 999,
        displayOrder: s.displayOrder != null ? s.displayOrder : i + 1,
        isActive: s.isActive !== false
      })),
      extraKPIs: body.extraKPIs || [],
      inventoryCategories: body.inventoryCategories || [],
      toolCategories: body.toolCategories || [],
      projectMilestones: body.projectMilestones || [
        { order: 1, title: 'Dispatch', defaultDays: 0, paymentPercent: 0, proofRequired: false },
        { order: 2, title: 'Site Reach', defaultDays: 1, paymentPercent: 0, proofRequired: true },
        { order: 3, title: 'Work Complete', defaultDays: 1, paymentPercent: 70, proofRequired: true },
        { order: 4, title: 'Sign-off', defaultDays: 1, paymentPercent: 30, proofRequired: true }
      ],
      siteChecklist: body.siteChecklist || [],
      complianceDocs: body.complianceDocs || [],
      assetFields: body.assetFields || [],
      matchAliases: body.matchAliases || [],
      pricingRules: body.pricingRules || [],
      paymentRules: body.paymentRules || {},
      commissionRules: body.commissionRules || {},
      slaRules: body.slaRules || [],
      approvalFlow: body.approvalFlow || {},
      status: body.status || 'active',
      isActive: body.isActive !== false,
      version: 1
    });

    await ensureRegistrationAndDashboardDefaults(doc);
    await invalidateAllCatalogCaches();
    await writeAudit({
      categoryCode,
      action: 'create',
      actor: actorFromReq(req),
      versionBefore: null,
      versionAfter: 1,
      summary: `Created ${categoryCode} ${doc.categoryName}`,
      snapshot: doc.toObject()
    });

    if (body.publish) {
      const published = await publishServiceCatalog(categoryCode, { actor: actorFromReq(req) });
      return res.status(201).json({ success: true, data: doc, published });
    }

    res.status(201).json({ success: true, data: doc });
  } catch (error) {
    console.error('createService error:', error);
    res.status(error.status || 500).json({
      success: false,
      message: error.message || 'Failed to create service'
    });
  }
};

/**
 * PUT /api/admin/service-management/:categoryCode
 */
exports.updateService = async (req, res) => {
  try {
    const code = String(req.params.categoryCode || '').toUpperCase();
    const existing = await ServiceConfig.findOne({ categoryCode: code });
    if (!existing) return res.status(404).json({ success: false, message: 'Service not found' });

    const versionBefore = existing.version || 1;
    const allowed = [
      'categoryName', 'description', 'tags', 'displayOrder', 'type', 'serviceType',
      'icon', 'image', 'color', 'requiredVendorType', 'requiredSkills', 'requiredDocuments',
      'subCategories', 'extraKPIs', 'inventoryCategories', 'toolCategories',
      'projectMilestones', 'siteChecklist', 'complianceDocs', 'assetFields',
      'opportunityMatchFields', 'matchAliases', 'pricingRules', 'paymentRules',
      'commissionRules', 'slaRules', 'approvalFlow', 'isActive'
    ];

    const diff = {};
    allowed.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(req.body || {}, key)) {
        diff[key] = { from: existing[key], to: req.body[key] };
        existing[key] = req.body[key];
      }
    });

    // Never allow changing categoryCode via update
    existing.version = versionBefore + 1;
    await existing.save();
    await invalidateAllCatalogCaches();
    await writeAudit({
      categoryCode: code,
      action: 'update',
      actor: actorFromReq(req),
      versionBefore,
      versionAfter: existing.version,
      summary: `Updated ${code}`,
      diff,
      snapshot: existing.toObject()
    });

    res.json({ success: true, data: existing });
  } catch (error) {
    console.error('updateService error:', error);
    res.status(500).json({ success: false, message: 'Failed to update service' });
  }
};

/**
 * PATCH /api/admin/service-management/:categoryCode/status
 * body: { status: 'active'|'inactive'|'archived' }
 */
exports.setStatus = async (req, res) => {
  try {
    const code = String(req.params.categoryCode || '').toUpperCase();
    const status = String(req.body?.status || '').toLowerCase();
    if (!['active', 'inactive', 'archived'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    const existing = await ServiceConfig.findOne({ categoryCode: code });
    if (!existing) return res.status(404).json({ success: false, message: 'Service not found' });

    const versionBefore = existing.version || 1;
    const prev = existing.status;
    existing.status = status;
    existing.isActive = status === 'active';
    existing.archivedAt = status === 'archived' ? new Date() : existing.archivedAt;
    existing.version = versionBefore + 1;
    await existing.save();

    // Soft-hide from user app without destroying rows
    const ServiceCategory = require('../../models/ServiceCategory');
    await ServiceCategory.updateMany(
      { categoryCode: code },
      {
        $set: {
          isActive: status === 'active',
          showOnApp: status === 'active'
        }
      }
    );
    await FormSchema.updateMany(
      { categoryCode: code },
      { $set: { isActive: status === 'active' } }
    );

    await invalidateAllCatalogCaches();
    await writeAudit({
      categoryCode: code,
      action: status === 'archived' ? 'archive' : 'status_change',
      actor: actorFromReq(req),
      versionBefore,
      versionAfter: existing.version,
      summary: `Status ${prev} → ${status}`,
      diff: { status: { from: prev, to: status } }
    });

    res.json({ success: true, data: existing });
  } catch (error) {
    console.error('setStatus error:', error);
    res.status(500).json({ success: false, message: 'Failed to update status' });
  }
};

/**
 * DELETE /api/admin/service-management/:categoryCode
 * Soft archive only.
 */
exports.archiveService = async (req, res) => {
  req.body = { ...(req.body || {}), status: 'archived' };
  return exports.setStatus(req, res);
};

/**
 * POST /api/admin/service-management/:categoryCode/publish
 */
exports.publishService = async (req, res) => {
  try {
    const code = String(req.params.categoryCode || '').toUpperCase();
    const result = await publishServiceCatalog(code, {
      actor: actorFromReq(req),
      ensureForms: req.body?.ensureForms !== false
    });
    res.json({ success: true, message: 'Service published to all panels', data: result });
  } catch (error) {
    console.error('publishService error:', error);
    res.status(error.status || 500).json({
      success: false,
      message: error.message || 'Failed to publish service'
    });
  }
};

/**
 * PUT /api/admin/service-management/:categoryCode/subcategories
 * Replace / upsert subCategories array on ServiceConfig.
 */
exports.upsertSubcategories = async (req, res) => {
  try {
    const code = String(req.params.categoryCode || '').toUpperCase();
    const subs = Array.isArray(req.body?.subCategories) ? req.body.subCategories : null;
    if (!subs) {
      return res.status(400).json({ success: false, message: 'subCategories array required' });
    }

    const existing = await ServiceConfig.findOne({ categoryCode: code });
    if (!existing) return res.status(404).json({ success: false, message: 'Service not found' });

    const versionBefore = existing.version || 1;
    existing.subCategories = subs.map((s, i) => ({
      subCatCode: String(s.subCatCode || `${code}-${String(i + 1).padStart(2, '0')}`).toUpperCase(),
      subCatName: s.subCatName || s.name,
      description: s.description || '',
      icon: s.icon || '',
      basePrice: s.basePrice != null ? s.basePrice : 999,
      displayOrder: s.displayOrder != null ? s.displayOrder : i + 1,
      isActive: s.isActive !== false
    }));
    existing.version = versionBefore + 1;
    await existing.save();
    await invalidateAllCatalogCaches();
    await writeAudit({
      categoryCode: code,
      action: 'subcategory_upsert',
      actor: actorFromReq(req),
      versionBefore,
      versionAfter: existing.version,
      summary: `Upserted ${existing.subCategories.length} subcategories`,
      diff: { subCategories: existing.subCategories }
    });

    res.json({ success: true, data: existing });
  } catch (error) {
    console.error('upsertSubcategories error:', error);
    res.status(500).json({ success: false, message: 'Failed to upsert subcategories' });
  }
};

/**
 * PUT /api/admin/service-management/forms/:subCatCode
 */
exports.upsertFormSchema = async (req, res) => {
  try {
    const subCatCode = String(req.params.subCatCode || '').toUpperCase();
    const body = req.body || {};
    if (!body.categoryCode || !body.subCategoryName) {
      return res.status(400).json({
        success: false,
        message: 'categoryCode and subCategoryName are required'
      });
    }

    const doc = await FormSchema.findOneAndUpdate(
      { subCatCode },
      {
        $set: {
          categoryCode: String(body.categoryCode).toUpperCase(),
          categoryName: body.categoryName || body.categoryCode,
          subCatCode,
          subCategoryName: body.subCategoryName,
          description: body.description || '',
          iconName: body.iconName || 'FiCheckCircle',
          basePrice: body.basePrice != null ? body.basePrice : 999,
          fields: Array.isArray(body.fields) && body.fields.length ? body.fields : DEFAULT_FORM_FIELDS,
          isActive: body.isActive !== false
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    await invalidateAllCatalogCaches();
    await writeAudit({
      categoryCode: String(body.categoryCode).toUpperCase(),
      action: 'form_upsert',
      actor: actorFromReq(req),
      summary: `Upserted form ${subCatCode}`,
      diff: { subCatCode }
    });

    res.json({ success: true, data: doc });
  } catch (error) {
    console.error('upsertFormSchema error:', error);
    res.status(500).json({ success: false, message: 'Failed to save form schema' });
  }
};

/**
 * PATCH /api/admin/service-management/forms/:subCatCode/status
 */
exports.setFormStatus = async (req, res) => {
  try {
    const subCatCode = String(req.params.subCatCode || '').toUpperCase();
    const isActive = req.body?.isActive !== false;
    const doc = await FormSchema.findOneAndUpdate(
      { subCatCode },
      { $set: { isActive } },
      { new: true }
    );
    if (!doc) return res.status(404).json({ success: false, message: 'Form not found' });
    await invalidateAllCatalogCaches();
    res.json({ success: true, data: doc });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update form status' });
  }
};

/** Registration / Dashboard / Permissions upserts */
exports.upsertRegistrationTemplate = async (req, res) => {
  try {
    const code = String(req.params.categoryCode || '').toUpperCase();
    const body = req.body || {};
    const doc = await RegistrationTemplate.findOneAndUpdate(
      { categoryCode: code },
      {
        $set: {
          categoryCode: code,
          categoryName: body.categoryName || code,
          requiredDocuments: body.requiredDocuments || [],
          requiredCertifications: body.requiredCertifications || [],
          requiredSkills: body.requiredSkills || [],
          teamFields: body.teamFields || [],
          extraFields: body.extraFields || [],
          notes: body.notes || '',
          isActive: body.isActive !== false
        },
        $inc: { version: 1 }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    await invalidateAllCatalogCaches();
    res.json({ success: true, data: doc });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to save registration template' });
  }
};

exports.upsertDashboardConfiguration = async (req, res) => {
  try {
    const code = String(req.params.categoryCode || '').toUpperCase();
    const body = req.body || {};
    const doc = await DashboardConfiguration.findOneAndUpdate(
      { categoryCode: code },
      {
        $set: {
          categoryCode: code,
          categoryName: body.categoryName || code,
          sidebarModules: body.sidebarModules,
          widgets: body.widgets,
          reportKeys: body.reportKeys || [],
          filterKeys: body.filterKeys || [],
          isActive: body.isActive !== false
        },
        $inc: { version: 1 }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    await invalidateAllCatalogCaches();
    res.json({ success: true, data: doc });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to save dashboard configuration' });
  }
};

exports.upsertPermissionConfiguration = async (req, res) => {
  try {
    const code = String(req.params.categoryCode || '').toUpperCase();
    const role = String(req.body?.role || '').toLowerCase();
    if (!role) return res.status(400).json({ success: false, message: 'role is required' });

    const doc = await PermissionConfiguration.findOneAndUpdate(
      { categoryCode: code, role },
      {
        $set: {
          categoryCode: code,
          role,
          allowedModules: req.body.allowedModules || [],
          deniedModules: req.body.deniedModules || [],
          notes: req.body.notes || '',
          isActive: req.body.isActive !== false
        },
        $inc: { version: 1 }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.json({ success: true, data: doc });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to save permissions' });
  }
};

/**
 * GET /api/admin/service-management/:categoryCode/audits
 */
exports.listAudits = async (req, res) => {
  try {
    const code = String(req.params.categoryCode || '').toUpperCase();
    const data = await ServiceConfigAudit.find({ categoryCode: code })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load audits' });
  }
};

/**
 * POST /api/admin/service-management/:categoryCode/rollback
 * Restores last publish/update snapshot fields (best-effort).
 */
exports.rollbackService = async (req, res) => {
  try {
    const code = String(req.params.categoryCode || '').toUpperCase();
    const auditId = req.body?.auditId;
    let audit;
    if (auditId) {
      audit = await ServiceConfigAudit.findById(auditId).lean();
    } else {
      audit = await ServiceConfigAudit.findOne({
        categoryCode: code,
        snapshot: { $ne: null },
        action: { $in: ['publish', 'update', 'create'] }
      })
        .sort({ createdAt: -1 })
        .skip(1)
        .lean();
    }
    if (!audit?.snapshot) {
      return res.status(404).json({ success: false, message: 'No snapshot available to rollback' });
    }

    const existing = await ServiceConfig.findOne({ categoryCode: code });
    if (!existing) return res.status(404).json({ success: false, message: 'Service not found' });

    const versionBefore = existing.version || 1;
    const snap = audit.snapshot;
    const restoreKeys = [
      'categoryName', 'description', 'tags', 'displayOrder', 'type', 'serviceType',
      'icon', 'image', 'color', 'subCategories', 'extraKPIs', 'inventoryCategories',
      'toolCategories', 'projectMilestones', 'siteChecklist', 'complianceDocs',
      'assetFields', 'matchAliases', 'pricingRules', 'status', 'isActive'
    ];
    restoreKeys.forEach((k) => {
      if (snap[k] !== undefined) existing[k] = snap[k];
    });
    existing.version = versionBefore + 1;
    await existing.save();
    await invalidateAllCatalogCaches();
    await writeAudit({
      categoryCode: code,
      action: 'rollback',
      actor: actorFromReq(req),
      versionBefore,
      versionAfter: existing.version,
      summary: `Rolled back to audit ${audit._id}`,
      diff: { auditId: String(audit._id) },
      snapshot: existing.toObject()
    });

    res.json({ success: true, data: existing, rolledBackFrom: audit._id });
  } catch (error) {
    console.error('rollbackService error:', error);
    res.status(500).json({ success: false, message: 'Failed to rollback' });
  }
};
