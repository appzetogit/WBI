require('dotenv').config();
const mongoose = require('mongoose');

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const Vendor = require('../models/Vendor');
  const Opportunity = require('../models/Opportunity');
  const { expandCategoryMatchCodes } = require('../utils/serviceCategoryAliases');

  const all = await Vendor.find({ approvalStatus: 'approved' })
    .select(
      'businessName isActive approvedServices categories operatingCities operationalCities address.city location.city geoLocation service'
    )
    .lean();
  console.log('Approved vendors total:', all.length);
  const badActive = all.filter((v) => typeof v.isActive !== 'boolean' && v.isActive != null);
  console.log(
    'Non-boolean isActive:',
    badActive.length,
    badActive.slice(0, 3).map((v) => ({ id: v._id, isActive: v.isActive }))
  );

  const codes = await expandCategoryMatchCodes(['C10']);
  console.log('C10 match codes:', codes);

  const c10 = all.filter((v) => {
    const as = (v.approvedServices || []).some(
      (s) =>
        codes.includes(String(s.categoryCode || '').toUpperCase()) &&
        ['active', 'pending'].includes(s.status)
    );
    const leg = (v.categories || []).some((c) => codes.includes(String(c).toUpperCase()));
    const svc = (v.service || []).some((c) => codes.includes(String(c).toUpperCase()));
    return as || leg || svc;
  });
  console.log('Vendors with C10-ish:', c10.length);
  for (const v of c10.slice(0, 10)) {
    console.log({
      name: (v.businessName || '').slice(0, 40),
      isActive: v.isActive,
      approved: (v.approvedServices || []).map((s) => ({
        c: s.categoryCode,
        st: s.status,
        subs: s.subServices
      })),
      categories: v.categories,
      service: v.service,
      cities: [
        ...(v.operatingCities || []),
        ...(v.operationalCities || []),
        v.address?.city,
        v.location?.city
      ].filter(Boolean)
    });
  }

  try {
    const q1 = await Vendor.find({
      approvalStatus: 'approved',
      isActive: { $ne: false },
      $or: [
        {
          approvedServices: {
            $elemMatch: { categoryCode: { $in: codes }, status: { $in: ['active', 'pending'] } }
          }
        },
        { categories: { $in: codes } }
      ]
    })
      .select('businessName')
      .lean();
    console.log(
      'Exact match query count:',
      q1.length,
      q1.map((v) => v.businessName)
    );
  } catch (e) {
    console.log('Exact match query FAILED:', e.message);
  }

  const q2 = await Vendor.find({
    approvalStatus: 'approved',
    $or: [
      {
        approvedServices: {
          $elemMatch: { categoryCode: { $in: codes }, status: { $in: ['active', 'pending'] } }
        }
      },
      { categories: { $in: codes } }
    ]
  })
    .select('businessName isActive approvedServices categories')
    .lean();
  console.log('Without isActive count:', q2.length);
  for (const v of q2) {
    console.log({ name: v.businessName, isActive: v.isActive, as: v.approvedServices, cat: v.categories });
  }

  // Category distribution
  const catFreq = {};
  for (const v of all) {
    for (const s of v.approvedServices || []) {
      const k = `${s.categoryCode}:${s.status}`;
      catFreq[k] = (catFreq[k] || 0) + 1;
    }
    for (const c of v.categories || []) {
      const k = `legacy:${c}`;
      catFreq[k] = (catFreq[k] || 0) + 1;
    }
  }
  console.log('Category frequency (top):', Object.entries(catFreq).sort((a, b) => b[1] - a[1]).slice(0, 40));

  const opp = await Opportunity.findOne({ opportunityCode: 'OPP-2026-0506' });
  const { buildVendorQueue, getAssignmentConfig } = require('../services/projectAssignmentEngine.service');
  const config = await getAssignmentConfig(opp.categoryCode);
  try {
    const queue = await buildVendorQueue(opp, config);
    console.log('buildVendorQueue result:', queue.length, queue);
  } catch (e) {
    console.log('buildVendorQueue FAILED:', e.message);
  }

  // Simulate without city filter for C10 vendors among all approved
  const withAnyService = all.filter((v) => (v.approvedServices || []).length || (v.categories || []).length);
  console.log('Vendors with any services:', withAnyService.length);

  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
