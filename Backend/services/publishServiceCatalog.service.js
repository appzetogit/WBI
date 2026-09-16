/**
 * Dual-write ServiceConfig → ServiceCategory + SubService + FormSchema stubs.
 * Soft lifecycle only — never hard-deletes production catalog rows.
 */
const mongoose = require('mongoose');
const { TXN_OPTS } = require('../utils/txnOptions');
const ServiceConfig = require('../models/ServiceConfig');
const ServiceCategory = require('../models/ServiceCategory');
const SubService = require('../models/SubService');
const FormSchema = require('../models/FormSchema');
const ServiceConfigAudit = require('../models/ServiceConfigAudit');
const RegistrationTemplate = require('../models/RegistrationTemplate');
const DashboardConfiguration = require('../models/DashboardConfiguration');
const { invalidateAllCatalogCaches } = require('./catalogCache.service');

const DEFAULT_FORM_FIELDS = [
  { fieldName: 'fullName', label: 'Full Name', type: 'text', required: true, placeholder: 'Your name', displayOrder: 90 },
  { fieldName: 'phone', label: 'Phone', type: 'phone', required: true, placeholder: '10-digit mobile', displayOrder: 91 },
  { fieldName: 'email', label: 'Email', type: 'email', required: true, placeholder: 'you@email.com', displayOrder: 92 },
  { fieldName: 'city', label: 'City', type: 'text', required: true, placeholder: 'City', displayOrder: 93 },
  { fieldName: 'siteAddress', label: 'Site Address', type: 'textarea', required: true, placeholder: 'Full address', displayOrder: 94 },
  { fieldName: 'preferredDate', label: 'Preferred Date', type: 'date', required: true, displayOrder: 95 },
  { fieldName: 'preferredTime', label: 'Preferred Time Slot', type: 'dropdown', required: true, options: ['Morning (9–12)', 'Afternoon (12–4)', 'Evening (4–8)'], displayOrder: 96 },
  { fieldName: 'urgency', label: 'Urgency', type: 'dropdown', required: true, options: ['Normal', 'Urgent', 'Emergency'], displayOrder: 97 },
  { fieldName: 'issueDescription', label: 'Issue / Requirement', type: 'textarea', required: true, placeholder: 'Describe what you need', displayOrder: 10 }
];

const slugify = (text) =>
  String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/(^-|-$)/g, '');

const writeAudit = async ({ categoryCode, action, actor, versionBefore, versionAfter, summary, diff, snapshot }) => {
  try {
    await ServiceConfigAudit.create({
      categoryCode,
      action,
      versionBefore,
      versionAfter,
      actorId: actor?._id || actor?.id || null,
      actorEmail: actor?.email || '',
      summary: summary || '',
      diff: diff || {},
      snapshot: snapshot || null
    });
  } catch (err) {
    console.warn('[SMS audit]', err.message);
  }
};

/**
 * Allocate next free Cxx code (C01…C99+).
 */
async function allocateNextCategoryCode(preferred) {
  if (preferred) {
    const code = String(preferred).toUpperCase().trim();
    if (!/^C\d{2,}$/.test(code)) {
      throw new Error('categoryCode must look like C01, C25, …');
    }
    const exists = await ServiceConfig.exists({ categoryCode: code });
    if (exists) throw new Error(`categoryCode ${code} already exists`);
    return code;
  }

  const docs = await ServiceConfig.find({}).select('categoryCode').lean();
  let max = 0;
  docs.forEach((d) => {
    const m = String(d.categoryCode || '').match(/^C(\d+)$/i);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  });
  return `C${String(max + 1).padStart(2, '0')}`;
}

async function ensureRegistrationAndDashboardDefaults(config) {
  const code = config.categoryCode;
  await RegistrationTemplate.findOneAndUpdate(
    { categoryCode: code },
    {
      $setOnInsert: {
        categoryCode: code,
        categoryName: config.categoryName,
        requiredDocuments: (config.requiredDocuments || []).map((name, i) => ({
          key: `doc_${i + 1}`,
          label: name,
          required: true
        })),
        requiredCertifications: (config.complianceDocs || []).map((d, i) => ({
          key: `cert_${i + 1}`,
          label: d.name || d,
          required: d.required !== false,
          expiryTracked: !!d.expiryTracked
        })),
        requiredSkills: config.requiredSkills || [],
        teamFields: [],
        extraFields: [],
        isActive: true,
        version: 1
      }
    },
    { upsert: true, new: true }
  );

  await DashboardConfiguration.findOneAndUpdate(
    { categoryCode: code },
    {
      $setOnInsert: {
        categoryCode: code,
        categoryName: config.categoryName,
        isActive: true,
        version: 1
      }
    },
    { upsert: true, new: true }
  );
}

/**
 * Publish one ServiceConfig to user catalog + form stubs.
 */
async function publishServiceCatalog(categoryCode, { actor, ensureForms = true } = {}) {
  const code = String(categoryCode).toUpperCase();
  const session = await mongoose.startSession();
  session.startTransaction(TXN_OPTS);

  try {
    const config = await ServiceConfig.findOne({ categoryCode: code }).session(session);
    if (!config) {
      throw Object.assign(new Error('Service config not found'), { status: 404 });
    }
    if (config.status === 'archived') {
      throw Object.assign(new Error('Cannot publish an archived service — activate it first'), { status: 400 });
    }

    const versionBefore = config.version || 1;
    const slug = slugify(config.categoryName) || code.toLowerCase();
    const activeSubs = (config.subCategories || []).filter((s) => s.isActive !== false);

    let category =
      (await ServiceCategory.findOne({ categoryCode: code }).session(session)) ||
      (await ServiceCategory.findOne({ slug }).session(session));

    const catPayload = {
      name: config.categoryName,
      slug: category?.slug || slug,
      description: config.description || `${config.categoryName} — installation, repair & AMC`,
      shortDescription: config.categoryName,
      icon: config.icon || 'FiGrid',
      image: config.image || category?.image || null,
      categoryCode: code,
      color: config.color || '#3b82f6',
      displayOrder: config.displayOrder || 0,
      trustPoints: ['Verified Pros', 'Same-day Visit', 'PAN India'],
      roles: ['engineer'],
      serviceType: config.serviceType === 'one_time' ? 'one_time' : 'enterprise',
      audience: config.serviceType === 'b2b' ? 'b2b' : 'b2c',
      isActive: config.status === 'active' && config.isActive !== false,
      showOnApp: config.status === 'active' && config.isActive !== false,
      subCategories: activeSubs.map((s) => ({
        subCatCode: s.subCatCode,
        subCatName: s.subCatName,
        defaultMilestones: (config.projectMilestones || []).map((m) => m.title),
        estimatedDays: 1,
        defaultChecklist: (config.siteChecklist || []).map((c) => c.item)
      }))
    };

    // Avoid unique name collisions
    if (!category) {
      const nameOwner = await ServiceCategory.findOne({ name: catPayload.name }).session(session);
      if (nameOwner) {
        category = nameOwner;
        catPayload.name = nameOwner.name;
        catPayload.slug = nameOwner.slug;
      }
    }

    if (category) {
      Object.assign(category, catPayload);
      await category.save({ session });
    } else {
      const created = await ServiceCategory.create([catPayload], { session });
      category = created[0];
    }

    const keepCodes = new Set(activeSubs.map((s) => s.subCatCode));
    const existingSubs = await SubService.find({ categoryId: category._id }).session(session);

    for (const old of existingSubs) {
      if (old.subCatCode && !keepCodes.has(old.subCatCode)) {
        old.isActive = false;
        await old.save({ session });
      }
    }

    let subCount = 0;
    for (let i = 0; i < activeSubs.length; i++) {
      const sub = activeSubs[i];
      const uniqueSlug = `${sub.subCatCode.toLowerCase()}-${slugify(sub.subCatName)}`.slice(0, 100);
      const price = sub.basePrice != null ? sub.basePrice : 999 + i * 100;

      await SubService.findOneAndUpdate(
        { $or: [{ subCatCode: sub.subCatCode }, { slug: uniqueSlug }] },
        {
          $set: {
            categoryId: category._id,
            name: sub.subCatName,
            slug: uniqueSlug,
            subCatCode: sub.subCatCode,
            description: sub.description || `${sub.subCatName} — book a verified engineer`,
            icon: sub.icon || config.icon || 'FiCheckCircle',
            startingPrice: price,
            displayOrder: sub.displayOrder != null ? sub.displayOrder : i + 1,
            isActive: true
          }
        },
        { upsert: true, new: true, setDefaultsOnInsert: true, session }
      );
      subCount += 1;
    }

    let formCount = 0;
    if (ensureForms) {
      for (let i = 0; i < activeSubs.length; i++) {
        const sub = activeSubs[i];
        const price = sub.basePrice != null ? sub.basePrice : 999 + i * 100;
        const existingForm = await FormSchema.findOne({ subCatCode: sub.subCatCode }).session(session);
        if (existingForm) {
          existingForm.categoryCode = code;
          existingForm.categoryName = config.categoryName;
          existingForm.subCategoryName = sub.subCatName;
          existingForm.description = existingForm.description || `${sub.subCatName} request`;
          existingForm.iconName = existingForm.iconName || config.icon || 'FiCheckCircle';
          if (!existingForm.basePrice) existingForm.basePrice = price;
          existingForm.isActive = true;
          await existingForm.save({ session });
        } else {
          await FormSchema.create(
            [
              {
                categoryCode: code,
                categoryName: config.categoryName,
                subCatCode: sub.subCatCode,
                subCategoryName: sub.subCatName,
                description: `${sub.subCatName} request`,
                iconName: config.icon || 'FiCheckCircle',
                basePrice: price,
                fields: DEFAULT_FORM_FIELDS,
                isActive: true
              }
            ],
            { session }
          );
        }
        formCount += 1;
      }
    }

    config.version = versionBefore + 1;
    config.publishedAt = new Date();
    if (config.status === 'inactive') {
      // publishing implies visibility intent — keep status as-is unless admin set active
    }
    await config.save({ session });

    await session.commitTransaction();

    await ensureRegistrationAndDashboardDefaults(config);
    await invalidateAllCatalogCaches();

    await writeAudit({
      categoryCode: code,
      action: 'publish',
      actor,
      versionBefore,
      versionAfter: config.version,
      summary: `Published ${code}: ${subCount} sub-services, ${formCount} forms`,
      diff: { subCount, formCount, categoryId: String(category._id) },
      snapshot: {
        categoryCode: code,
        categoryName: config.categoryName,
        status: config.status,
        version: config.version,
        subCategories: config.subCategories
      }
    });

    return {
      categoryCode: code,
      version: config.version,
      categoryId: category._id,
      subServices: subCount,
      forms: formCount,
      showOnApp: category.showOnApp
    };
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
}

module.exports = {
  publishServiceCatalog,
  allocateNextCategoryCode,
  writeAudit,
  ensureRegistrationAndDashboardDefaults,
  DEFAULT_FORM_FIELDS,
  slugify
};
