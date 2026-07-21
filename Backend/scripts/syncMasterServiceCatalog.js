/**
 * Sync Excel master catalog (C01–C24) into ServiceConfig + enterprise ServiceCategory.
 * Keeps existing rich ServiceConfig fields; replaces subCategories with master list.
 * Run: node scripts/syncMasterServiceCatalog.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const ServiceConfig = require('../models/ServiceConfig');
const ServiceCategory = require('../models/ServiceCategory');
const MASTER_CATALOG = require('../data/masterServiceCatalog');

const DEFAULT_COLORS = {
  C01: '#3B82F6', C02: '#6366F1', C03: '#0EA5E9', C04: '#F59E0B', C05: '#10B981',
  C06: '#0EA5E9', C07: '#EF4444', C08: '#8B5CF6', C09: '#F97316', C10: '#EC4899',
  C11: '#84CC16', C12: '#EAB308', C13: '#06B6D4', C14: '#38BDF8', C15: '#64748B',
  C16: '#78716C', C17: '#A855F7', C18: '#0F766E', C19: '#DC2626', C20: '#2563EB',
  C21: '#D946EF', C22: '#059669', C23: '#7C3AED', C24: '#14B8A6'
};

const defaultMilestones = (subName) => [
  'Dispatch',
  'Site Reach',
  'Diagnosis',
  subName.includes('Install') ? 'Installation' : 'Repair / Service',
  'Testing',
  'Sign-off'
];

async function upsertServiceConfig(cat) {
  const subCategories = (cat.subCategories || []).map((s) => ({
    subCatCode: s.subCatCode,
    subCatName: s.subCatName,
    isActive: true
  }));

  const existing = await ServiceConfig.findOne({ categoryCode: cat.categoryCode }).lean();
  if (existing) {
    await ServiceConfig.updateOne(
      { categoryCode: cat.categoryCode },
      {
        $set: {
          categoryName: cat.categoryName,
          subCategories,
          matchAliases: cat.matchAliases || existing.matchAliases || [],
          isActive: true,
          type: existing.type || 'project_based'
        }
      }
    );
    return 'updated';
  }

  await ServiceConfig.create({
    categoryCode: cat.categoryCode,
    categoryName: cat.categoryName,
    type: 'project_based',
    icon: 'briefcase',
    color: DEFAULT_COLORS[cat.categoryCode] || '#64748B',
    subCategories,
    matchAliases: cat.matchAliases || [],
    extraKPIs: [
      {
        key: 'jobsCompleted',
        label: 'Jobs Completed',
        unit: 'jobs',
        icon: 'check',
        color: 'green',
        dataSource: 'projects',
        countField: 'status',
        countValue: 'completed'
      }
    ],
    inventoryCategories: [
      { name: 'Spare Parts', unit: 'piece', lowStockThreshold: 5, icon: 'box' },
      { name: 'Consumables', unit: 'piece', lowStockThreshold: 10, icon: 'box' }
    ],
    toolCategories: [
      { name: 'Screwdriver Set', type: 'hand_tool' },
      { name: 'Multimeter', type: 'testing_equipment' }
    ],
    projectMilestones: [
      { order: 1, title: 'Dispatch', description: 'Dispatch phase', defaultDays: 1, paymentPercent: 0, proofRequired: true, proofTypes: ['photos'] },
      { order: 2, title: 'Site Reach', description: 'Site Reach phase', defaultDays: 1, paymentPercent: 20, proofRequired: true, proofTypes: ['photos'] },
      { order: 3, title: 'Diagnosis', description: 'Diagnosis phase', defaultDays: 1, paymentPercent: 20, proofRequired: true, proofTypes: ['photos', 'checklist'] },
      { order: 4, title: 'Repair / Install', description: 'Work phase', defaultDays: 1, paymentPercent: 30, proofRequired: true, proofTypes: ['photos'] },
      { order: 5, title: 'Testing', description: 'Testing phase', defaultDays: 1, paymentPercent: 20, proofRequired: true, proofTypes: ['checklist'] },
      { order: 6, title: 'Sign-off', description: 'Sign-off phase', defaultDays: 1, paymentPercent: 10, proofRequired: true, proofTypes: ['photos'] }
    ],
    siteChecklist: [
      { item: 'Work completed', required: true },
      { item: 'Client sign-off', required: true }
    ],
    complianceDocs: [{ name: 'Company Registration', required: true, expiryTracked: false, renewalDays: 365 }],
    assetFields: [
      { field: 'serialNumber', label: 'Serial Number', required: false },
      { field: 'brand', label: 'Brand', required: false },
      { field: 'model', label: 'Model', required: false }
    ],
    opportunityMatchFields: ['city', 'urgency'],
    isActive: true
  });
  return 'created';
}

async function upsertEnterpriseCategory(cat, displayOrder) {
  const slug = cat.categoryName
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/(^-|-$)/g, '');

  const subCategories = (cat.subCategories || []).map((s) => ({
    subCatCode: s.subCatCode,
    subCatName: s.subCatName,
    defaultMilestones: defaultMilestones(s.subCatName),
    requiredTools: [],
    estimatedDays: 1,
    defaultChecklist: ['Work completed', 'Client sign-off']
  }));

  const payload = {
    name: cat.categoryName,
    slug,
    description: `${cat.categoryName} services`,
    categoryCode: cat.categoryCode,
    serviceType: 'enterprise',
    audience: 'b2b',
    color: DEFAULT_COLORS[cat.categoryCode] || '#3b82f6',
    subCategories,
    isActive: true,
    showOnApp: true,
    displayOrder,
    roles: ['engineer']
  };

  // Prefer categoryCode; fall back to name (legacy docs may lack categoryCode)
  let existing = await ServiceCategory.findOne({ categoryCode: cat.categoryCode });
  if (!existing) {
    existing = await ServiceCategory.findOne({ name: cat.categoryName });
  }
  if (existing) {
    Object.assign(existing, payload);
    await existing.save();
    return;
  }
  await ServiceCategory.create(payload);
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set');
  await mongoose.connect(uri, { family: 4, serverSelectionTimeoutMS: 30000 });
  console.log(`MongoDB Connected: ${mongoose.connection.host}`);

  const masterCodes = MASTER_CATALOG.map((c) => c.categoryCode);
  let created = 0;
  let updated = 0;

  for (let i = 0; i < MASTER_CATALOG.length; i++) {
    const cat = MASTER_CATALOG[i];
    const result = await upsertServiceConfig(cat);
    if (result === 'created') created += 1;
    else updated += 1;
    await upsertEnterpriseCategory(cat, i + 1);
    console.log(`${result.toUpperCase()} ${cat.categoryCode} — ${cat.categoryName} (${cat.subCategories.length} subs)`);
  }

  const deactivated = await ServiceConfig.updateMany(
    { categoryCode: { $nin: masterCodes } },
    { $set: { isActive: false } }
  );

  console.log(
    `Master catalog sync complete: ${created} created, ${updated} updated, deactivated ${deactivated.modifiedCount || 0} extras`
  );
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
