/**
 * Sync Banking Solutions user-facing SubServices from C05 Excel master list.
 * Run: node scripts/syncBankingUserSubServices.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const ServiceCategory = require('../models/ServiceCategory');
const SubService = require('../models/SubService');
const MASTER_CATALOG = require('../data/masterServiceCatalog');

const ICONS = {
  'C05-01': 'FiServer',
  'C05-02': 'FiCreditCard',
  'C05-03': 'FiUserCheck',
  'C05-04': 'FiDollarSign',
  'C05-05': 'FiPrinter',
  'C05-06': 'FiCpu'
};

const PRICES = {
  'C05-01': 4999,
  'C05-02': 1999,
  'C05-03': 2499,
  'C05-04': 5999,
  'C05-05': 3499,
  'C05-06': 2999
};

const slugify = (text) =>
  String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/(^-|-$)/g, '');

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set');
  await mongoose.connect(uri, { family: 4, serverSelectionTimeoutMS: 30000 });

  const c05 = MASTER_CATALOG.find((c) => c.categoryCode === 'C05');
  if (!c05) throw new Error('C05 missing from master catalog');

  let category =
    (await ServiceCategory.findOne({ slug: 'banking-solutions' })) ||
    (await ServiceCategory.findOne({ categoryCode: 'C05' })) ||
    (await ServiceCategory.findOne({ name: /banking/i }));

  if (!category) {
    category = await ServiceCategory.create({
      name: 'Banking Solutions',
      slug: 'banking-solutions',
      description: 'ATM, POS, cash handling & banking device services',
      icon: 'FiBriefcase',
      trustPoints: ['Certified Experts', '24/7 Support', 'PAN India Service'],
      displayOrder: 3,
      roles: ['engineer'],
      categoryCode: 'C05',
      isActive: true,
      showOnApp: true,
      serviceType: 'enterprise',
      audience: 'b2b'
    });
  } else {
    category.name = 'Banking Solutions';
    category.slug = 'banking-solutions';
    category.categoryCode = 'C05';
    category.isActive = true;
    category.showOnApp = true;
    category.description = category.description || 'ATM, POS, cash handling & banking device services';
    category.subCategories = c05.subCategories.map((s) => ({
      subCatCode: s.subCatCode,
      subCatName: s.subCatName,
      defaultMilestones: ['Dispatch', 'Site Reach', 'Diagnosis', 'Repair / Service', 'Testing', 'Sign-off'],
      estimatedDays: 1,
      defaultChecklist: ['Work completed', 'Client sign-off']
    }));
    await category.save();
  }

  // Hide duplicate banking category shells that have no user catalog purpose
  await ServiceCategory.updateMany(
    {
      _id: { $ne: category._id },
      $or: [{ slug: 'banking-devices' }, { slug: 'banking-financial-devices' }, { name: 'Banking Devices' }, { name: 'Banking & Financial Devices' }]
    },
    { $set: { showOnApp: false, isActive: false } }
  );

  // Replace SubServices under Banking Solutions with Excel C05 list
  await SubService.deleteMany({ categoryId: category._id });

  let created = 0;
  for (let i = 0; i < c05.subCategories.length; i++) {
    const sub = c05.subCategories[i];
    const baseSlug = slugify(sub.subCatName);
    await SubService.create({
      categoryId: category._id,
      name: sub.subCatName,
      slug: `${baseSlug}-${sub.subCatCode.toLowerCase()}`,
      description: `${sub.subCatName} — book a verified banking device engineer`,
      icon: ICONS[sub.subCatCode] || 'FiBriefcase',
      startingPrice: PRICES[sub.subCatCode] || 2999,
      rating: 4.8,
      reviewCount: 64 + i * 7,
      displayOrder: i + 1,
      isActive: true
    });
    created += 1;
    console.log(`Created ${sub.subCatCode} — ${sub.subCatName}`);
  }

  console.log(`Banking user SubServices sync complete: ${created} under ${category.slug}`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
