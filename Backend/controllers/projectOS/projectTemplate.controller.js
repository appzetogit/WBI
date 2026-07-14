/**
 * WBI Project OS — Project Template Controller (Admin Only)
 */

const ProjectTemplate = require('../../models/projectOS/ProjectTemplate');
const MilestoneTemplate = require('../../models/projectOS/MilestoneTemplate');
const FormTemplate = require('../../models/projectOS/FormTemplate');
const { APPROVED_METRIC_KEYS } = require('../../engines/metricResolver');

// ─── GET all templates ────────────────────────────────────────────────────────
exports.listTemplates = async (req, res) => {
  try {
    const { status, category, executionType, page = 1, limit = 20 } = req.query;
    const query = { isDeleted: false, isSnapshot: false };

    if (status) query.status = status;
    if (category) query.category = category.toUpperCase();
    if (executionType) query.executionType = executionType;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [templates, total] = await Promise.all([
      ProjectTemplate.find(query)
        .select('templateKey name category executionType status version createdAt publishedAt createdBy')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      ProjectTemplate.countDocuments(query)
    ]);

    res.json({ success: true, data: templates, total, page: parseInt(page), totalPages: Math.ceil(total / parseInt(limit)) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── GET single template ──────────────────────────────────────────────────────
exports.getTemplate = async (req, res) => {
  try {
    const template = await ProjectTemplate.findById(req.params.id)
      .populate('milestoneTemplateId formTemplateIds approvalTemplateId slaTemplateId')
      .lean();

    if (!template || template.isDeleted) {
      return res.status(404).json({ success: false, message: 'Template not found' });
    }
    res.json({ success: true, data: template });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── POST create template ─────────────────────────────────────────────────────
exports.createTemplate = async (req, res) => {
  try {
    const body = req.body;

    // Validate widget metricKeys against approved registry
    if (body.widgets) {
      const invalidKeys = body.widgets
        .filter(w => w.metricKey && !APPROVED_METRIC_KEYS.includes(w.metricKey))
        .map(w => w.metricKey);
      if (invalidKeys.length > 0) {
        return res.status(400).json({ success: false, message: `Unknown metric keys: ${invalidKeys.join(', ')}` });
      }
    }

    const template = await ProjectTemplate.create({
      ...body,
      createdBy: req.user._id,
      status: 'DRAFT'
    });

    res.status(201).json({ success: true, message: 'Template created as DRAFT', data: template });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ success: false, message: 'Template key already exists' });
    }
    res.status(400).json({ success: false, message: err.message });
  }
};

// ─── PATCH update template (DRAFT only) ──────────────────────────────────────
exports.updateTemplate = async (req, res) => {
  try {
    const template = await ProjectTemplate.findById(req.params.id);
    if (!template || template.isDeleted) {
      return res.status(404).json({ success: false, message: 'Template not found' });
    }
    if (template.status === 'PUBLISHED') {
      return res.status(400).json({ success: false, message: 'Published templates are immutable. Clone or create a new version.' });
    }

    Object.assign(template, req.body);
    await template.save();

    res.json({ success: true, message: 'Template updated', data: template });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// ─── POST validate template ───────────────────────────────────────────────────
exports.validateTemplate = async (req, res) => {
  try {
    const template = await ProjectTemplate.findById(req.params.id).lean();
    if (!template) return res.status(404).json({ success: false, message: 'Template not found' });

    const errors = [];
    const warnings = [];

    // Required fields
    if (!template.templateKey) errors.push('templateKey is required');
    if (!template.name) errors.push('name is required');
    if (!template.category) errors.push('category is required');
    if (!template.executionType) errors.push('executionType is required');

    // Modules
    const enabledModules = template.modules?.filter(m => m.enabled) || [];
    if (enabledModules.length === 0) errors.push('At least one module must be enabled');
    if (!enabledModules.find(m => m.key === 'OVERVIEW')) errors.push('OVERVIEW module must be enabled');

    // Widget validation
    if (template.widgets?.length > 0) {
      template.widgets.forEach((w, i) => {
        if (!ProjectTemplate.schema.path('widgets')?.schema?.path('widgetType')?.enumValues?.includes(w.widgetType)) {
          errors.push(`Widget ${i + 1}: Unknown widgetType "${w.widgetType}"`);
        }
        if (w.metricKey && !APPROVED_METRIC_KEYS.includes(w.metricKey)) {
          errors.push(`Widget ${i + 1}: Unknown metricKey "${w.metricKey}"`);
        }
      });
    } else {
      warnings.push('No dashboard widgets configured — dashboard will be empty');
    }

    // Milestone check
    if (!template.milestoneTemplateId) warnings.push('No milestone template linked');

    const passed = errors.length === 0;
    await ProjectTemplate.findByIdAndUpdate(req.params.id, {
      validationResult: { passed, errors, warnings, validatedAt: new Date() }
    });

    res.json({ success: true, passed, errors, warnings });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── POST publish template ────────────────────────────────────────────────────
exports.publishTemplate = async (req, res) => {
  try {
    const template = await ProjectTemplate.findById(req.params.id);
    if (!template || template.isDeleted) return res.status(404).json({ success: false, message: 'Template not found' });

    if (template.status === 'PUBLISHED') {
      return res.status(400).json({ success: false, message: 'Template is already published' });
    }

    // Must pass validation first
    if (!template.validationResult?.passed) {
      return res.status(400).json({
        success: false,
        message: 'Template must pass validation before publishing',
        errors: template.validationResult?.errors || []
      });
    }

    template.status = 'PUBLISHED';
    template.publishedBy = req.user._id;
    template.publishedAt = new Date();
    template.changelog.push({
      version: template.version,
      note: req.body.note || 'Initial publish',
      actionBy: req.user._id,
      actionAt: new Date()
    });

    await template.save();
    res.json({ success: true, message: 'Template published successfully', data: template });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── POST clone template ──────────────────────────────────────────────────────
exports.cloneTemplate = async (req, res) => {
  try {
    const source = await ProjectTemplate.findById(req.params.id).lean();
    if (!source) return res.status(404).json({ success: false, message: 'Template not found' });

    const { _id, templateKey, version, status, publishedBy, publishedAt, validationResult, changelog, createdAt, updatedAt, ...rest } = source;

    const cloned = await ProjectTemplate.create({
      ...rest,
      templateKey: req.body.templateKey || `${source.templateKey}_copy_${Date.now()}`,
      name: req.body.name || `${source.name} (Copy)`,
      version: 1,
      status: 'DRAFT',
      baseTemplateId: source._id,
      createdBy: req.user._id,
      validationResult: { passed: false, errors: [], warnings: [] },
      changelog: []
    });

    res.status(201).json({ success: true, message: 'Template cloned as new DRAFT', data: cloned });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// ─── POST deprecate template ──────────────────────────────────────────────────
exports.deprecateTemplate = async (req, res) => {
  try {
    const template = await ProjectTemplate.findById(req.params.id);
    if (!template) return res.status(404).json({ success: false, message: 'Template not found' });
    if (template.status !== 'PUBLISHED') return res.status(400).json({ success: false, message: 'Only PUBLISHED templates can be deprecated' });

    template.status = 'DEPRECATED';
    template.deprecatedBy = req.user._id;
    template.deprecatedAt = new Date();
    await template.save();

    res.json({ success: true, message: 'Template deprecated', data: template });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── GET approved registries (for Admin Template Builder UI) ──────────────────
exports.getRegistries = async (req, res) => {
  const ProjectTemplate = require('../../models/projectOS/ProjectTemplate');
  res.json({
    success: true,
    data: {
      widgetTypes: ProjectTemplate.schema.statics?.WIDGET_TYPES || [],
      moduleKeys: ProjectTemplate.schema.statics?.MODULE_KEYS || [],
      approvedMetricKeys: APPROVED_METRIC_KEYS,
      executionTypes: ProjectTemplate.schema.statics?.EXECUTION_TYPES || [],
      formFieldTypes: FormTemplate.schema.statics?.FIELD_TYPES || []
    }
  });
};
