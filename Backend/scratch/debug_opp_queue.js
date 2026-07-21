require('dotenv').config();
const mongoose = require('mongoose');
const Opp = require('../models/Opportunity');
const Vendor = require('../models/Vendor');
const { expandCategoryMatchCodes } = require('../utils/serviceCategoryAliases');

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const opp = await Opp.findOne({ opportunityCode: 'OPP-2026-0503' }).lean();
  const codes = await expandCategoryMatchCodes([opp.categoryCode]);
  const vendors = await Vendor.find({
    approvalStatus: 'approved',
    isActive: { $ne: false },
    $or: [
      { approvedServices: { $elemMatch: { categoryCode: { $in: codes }, status: { $in: ['active', 'pending'] } } } },
      { categories: { $in: codes } }
    ]
  })
    .select('businessName approvalStatus isActive operatingCities address geoLocation approvedServices subServices')
    .lean();
  console.log('matched vendors count', vendors.length);
  const city = opp.requirements?.cities?.[0] || opp.clientInfo?.city || '';
  console.log('opp city', city, 'subCat', opp.assignment?.subCatCode);
  const normalizeCity = (c) => String(c || '').trim().toLowerCase();
  const vendorCoversCity = (vendor, city) => {
    const target = normalizeCity(city);
    if (!target) return true;
    const lists = [
      ...(vendor.operatingCities || []),
      ...(vendor.operationalCities || []),
      vendor.address?.city,
      vendor.location?.city
    ].filter(Boolean);
    return lists.some(
      (c) =>
        normalizeCity(c) === target ||
        normalizeCity(c).includes(target) ||
        target.includes(normalizeCity(c))
    );
  };
  const matchCodes = await expandCategoryMatchCodes([opp.categoryCode]);
  const vendorHasService = (vendor, subCatCode) => {
    const approved = (vendor.approvedServices || []).some(
      (s) =>
        matchCodes.includes(String(s.categoryCode || '').toUpperCase()) &&
        ['active', 'pending'].includes(s.status)
    );
    if (!approved) return false;
    if (!subCatCode) return true;
    const subs = vendor.subServices || vendor.approvedSubServices || [];
    if (!subs.length) return true;
    return subs.some((s) => String(s).toUpperCase() === String(subCatCode).toUpperCase());
  };
  for (const v of vendors) {
    const sub = opp.assignment?.subCatCode || '';
    console.log(v.businessName, {
      covers: vendorCoversCity(v, city),
      hasService: vendorHasService(v, sub),
      subServices: v.subServices
    });
  }
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
