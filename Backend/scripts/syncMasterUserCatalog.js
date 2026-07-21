/**
 * Sync FULL Excel master catalog (C01–C24) to user-facing ServiceCategory + SubService + FormSchema.
 * Run: node scripts/syncMasterUserCatalog.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const ServiceCategory = require('../models/ServiceCategory');
const SubService = require('../models/SubService');
const FormSchema = require('../models/FormSchema');
const MASTER_CATALOG = require('../data/masterServiceCatalog');

const COLORS = {
  C01: '#3B82F6', C02: '#6366F1', C03: '#0EA5E9', C04: '#F59E0B', C05: '#10B981',
  C06: '#0EA5E9', C07: '#EF4444', C08: '#8B5CF6', C09: '#F97316', C10: '#EC4899',
  C11: '#84CC16', C12: '#EAB308', C13: '#06B6D4', C14: '#38BDF8', C15: '#64748B',
  C16: '#78716C', C17: '#A855F7', C18: '#0F766E', C19: '#DC2626', C20: '#2563EB',
  C21: '#D946EF', C22: '#059669', C23: '#7C3AED', C24: '#14B8A6'
};

const ICONS = {
  C01: 'FiVideo', C02: 'FiMonitor', C03: 'FiWifi', C04: 'FiZap', C05: 'FiBriefcase',
  C06: 'FiHome', C07: 'FiShield', C08: 'FiPhone', C09: 'FiSmartphone', C10: 'FiHeart',
  C11: 'FiTool', C12: 'FiZap', C13: 'FiDroplet', C14: 'FiWind', C15: 'FiPrinter',
  C16: 'FiSettings', C17: 'FiSpeaker', C18: 'FiHome', C19: 'FiAlertCircle', C20: 'FiBook',
  C21: 'FiCreditCard', C22: 'FiTruck', C23: 'FiCpu', C24: 'FiDroplet'
};

const DEFAULT_PRICES = {
  C01: 2499, C02: 999, C03: 799, C04: 1999, C05: 2999, C06: 599, C07: 1999, C08: 999,
  C09: 499, C10: 1499, C11: 1999, C12: 699, C13: 599, C14: 799, C15: 999, C16: 2999,
  C17: 999, C18: 4999, C19: 799, C20: 1499, C21: 999, C22: 1999, C23: 1499, C24: 699
};

const commonContactFields = [
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

async function upsertCategory(cat, displayOrder) {
  const slug = slugify(cat.categoryName);
  let category =
    (await ServiceCategory.findOne({ categoryCode: cat.categoryCode })) ||
    (await ServiceCategory.findOne({ name: cat.categoryName })) ||
    (await ServiceCategory.findOne({ slug }));

  // Keep user-facing banking-solutions as the C05 entry point
  if (!category && cat.categoryCode === 'C05') {
    category = await ServiceCategory.findOne({ slug: 'banking-solutions' });
  }

  let finalName = cat.categoryName;
  let finalSlug = slug;
  if (cat.categoryCode === 'C05' && category?.slug === 'banking-solutions') {
    finalName = 'Banking Solutions';
    finalSlug = 'banking-solutions';
  }

  // Avoid unique name collisions with a different document
  const nameOwner = await ServiceCategory.findOne({ name: finalName });
  if (nameOwner && category && String(nameOwner._id) !== String(category._id)) {
    finalName = category.name;
    finalSlug = category.slug;
  } else if (nameOwner && !category) {
    category = nameOwner;
  }

  const payload = {
    name: finalName,
    slug: finalSlug,
    description: `${cat.categoryName} — installation, repair & AMC`,
    shortDescription: cat.categoryName,
    icon: ICONS[cat.categoryCode] || 'FiGrid',
    categoryCode: cat.categoryCode,
    color: COLORS[cat.categoryCode] || '#3b82f6',
    trustPoints: ['Verified Pros', 'Same-day Visit', 'PAN India'],
    displayOrder,
    roles: ['engineer'],
    serviceType: 'enterprise',
    audience: 'b2b',
    isActive: true,
    showOnApp: true,
    subCategories: (cat.subCategories || []).map((s) => ({
      subCatCode: s.subCatCode,
      subCatName: s.subCatName,
      defaultMilestones: ['Dispatch', 'Site Reach', 'Work', 'Testing', 'Sign-off'],
      estimatedDays: 1,
      defaultChecklist: ['Work completed', 'Client sign-off']
    }))
  };

  if (category) {
    Object.assign(category, payload);
    await category.save();
  } else {
    category = await ServiceCategory.create(payload);
  }
  return category;
}

async function syncSubServices(category, cat) {
  await SubService.deleteMany({ categoryId: category._id });
  const basePrice = DEFAULT_PRICES[cat.categoryCode] || 999;
  let count = 0;
  for (let i = 0; i < (cat.subCategories || []).length; i++) {
    const sub = cat.subCategories[i];
    const uniqueSlug = `${sub.subCatCode.toLowerCase()}-${slugify(sub.subCatName)}`.slice(0, 100);
    // Remove any leftover doc with same global slug (legacy collisions e.g. Battery Replacement)
    await SubService.deleteMany({ slug: uniqueSlug });
    await SubService.findOneAndUpdate(
      { slug: uniqueSlug },
      {
        $set: {
          categoryId: category._id,
          name: sub.subCatName,
          slug: uniqueSlug,
          description: `${sub.subCatName} — book a verified engineer`,
          icon: ICONS[cat.categoryCode] || 'FiCheckCircle',
          startingPrice: basePrice + i * 100,
          rating: 4.8,
          reviewCount: 40 + i * 5,
          displayOrder: i + 1,
          isActive: true
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    count += 1;
  }
  return count;
}

async function syncFormSchemas(cat) {
  const basePrice = DEFAULT_PRICES[cat.categoryCode] || 999;
  let count = 0;
  for (let i = 0; i < (cat.subCategories || []).length; i++) {
    const sub = cat.subCategories[i];
    await FormSchema.findOneAndUpdate(
      { subCatCode: sub.subCatCode },
      {
        $set: {
          categoryCode: cat.categoryCode,
          categoryName: cat.categoryName,
          subCatCode: sub.subCatCode,
          subCategoryName: sub.subCatName,
          description: `${sub.subCatName} request`,
          iconName: ICONS[cat.categoryCode] || 'FiCheckCircle',
          basePrice: basePrice + i * 100,
          fields: commonContactFields,
          isActive: true
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    count += 1;
  }
  return count;
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set');
  await mongoose.connect(uri, { family: 4, serverSelectionTimeoutMS: 30000 });
  console.log(`MongoDB Connected: ${mongoose.connection.host}`);

  const masterCodes = MASTER_CATALOG.map((c) => c.categoryCode);
  let totalSubs = 0;
  let totalForms = 0;

  for (let i = 0; i < MASTER_CATALOG.length; i++) {
    const cat = MASTER_CATALOG[i];
    const category = await upsertCategory(cat, i + 1);
    const subs = await syncSubServices(category, cat);
    const forms = await syncFormSchemas(cat);
    totalSubs += subs;
    totalForms += forms;
    console.log(`OK ${cat.categoryCode} — ${cat.categoryName}: ${subs} services, ${forms} forms`);
  }

  // Keep Digital Solutions visible; hide other non-Excel legacy shells that collide
  const keepSlugs = new Set([
    'digital-solutions',
    ...MASTER_CATALOG.map((c) => slugify(c.categoryName))
  ]);
  // Also keep banking-solutions alias pointing to C05 content (already synced under Banking & Financial Devices)
  // Map banking-solutions → same as C05 by ensuring it has categoryCode C05 and same subs
  const bankingAlias = await ServiceCategory.findOne({ slug: 'banking-solutions' });
  const bankingMaster = await ServiceCategory.findOne({ categoryCode: 'C05' });
  if (bankingAlias && bankingMaster && String(bankingAlias._id) !== String(bankingMaster._id)) {
    // Copy C05 subservices onto banking-solutions for old home links
    await SubService.deleteMany({ categoryId: bankingAlias._id });
    const c05Subs = await SubService.find({ categoryId: bankingMaster._id }).lean();
    for (const s of c05Subs) {
      const { _id, __v, createdAt, updatedAt, ...rest } = s;
      await SubService.create({
        ...rest,
        categoryId: bankingAlias._id,
        slug: `${rest.slug}-alias`.slice(0, 80)
      });
    }
    bankingAlias.categoryCode = 'C05';
    bankingAlias.isActive = true;
    bankingAlias.showOnApp = true;
    bankingAlias.name = 'Banking Solutions';
    await bankingAlias.save();
    keepSlugs.add('banking-solutions');
    console.log('Linked banking-solutions alias to C05 services');
  }

  const hidden = await ServiceCategory.updateMany(
    {
      categoryCode: { $nin: masterCodes },
      slug: { $nin: [...keepSlugs] },
      name: { $nin: ['Digital Solutions'] }
    },
    { $set: { showOnApp: false } }
  );

  console.log(
    `\nMaster USER catalog sync complete: ${MASTER_CATALOG.length} categories, ${totalSubs} sub-services, ${totalForms} forms; hid ${hidden.modifiedCount || 0} legacy categories from app`
  );
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
