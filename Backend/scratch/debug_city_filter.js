require('dotenv').config();
const mongoose = require('mongoose');

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const Vendor = require('../models/Vendor');
  const Opportunity = require('../models/Opportunity');

  const all = await Vendor.find({ approvalStatus: 'approved' })
    .select(
      'businessName isActive approvedServices categories operatingCities operationalCities address.city location.city geoLocation teamSize maxCapacity rating responseScore settings'
    )
    .lean();

  const { vendorCoversCity, vendorHasService, scoreVendor, buildVendorQueue, getAssignmentConfig } =
    require('../services/projectAssignmentEngine.service');

  // Inspect exports
  console.log('exports', Object.keys(require('../services/projectAssignmentEngine.service')));

  const opp = await Opportunity.findOne({ opportunityCode: 'OPP-2026-0506' }).lean();
  const codes = ['C10', 'MEDICAL', 'HEALTHCARE'];
  const city = opp.clientInfo?.city || '';
  const subCatCode = opp.assignment?.subCatCode || '';
  console.log({ city, subCatCode, categoryCode: opp.categoryCode });

  const rahul = all.find((v) => /Rahul/i.test(v.businessName || ''));
  console.log('Rahul raw:', {
    cities: [
      ...(rahul.operatingCities || []),
      ...(rahul.operationalCities || []),
      rahul.address?.city,
      rahul.location?.city
    ],
    subs: rahul.approvedServices,
    geo: rahul.geoLocation
  });

  // Manual score path (inline copies)
  const normalizeCity = (c) => String(c || '').trim().toLowerCase();
  const covers = (vendor, cty) => {
    const target = normalizeCity(cty);
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

  console.log('covers Indore?', covers(rahul, 'Indore'));
  console.log('covers Inodre?', covers(rahul, 'Inodre'));
  console.log('covers Palakkad?', covers(rahul, 'Palakkad'));
  console.log('covers empty?', covers(rahul, ''));

  // Check vendors with approved Cxx but empty cities
  let emptyCityWithService = 0;
  let withService = 0;
  for (const v of all) {
    const has =
      (v.approvedServices || []).some((s) => ['active', 'pending'].includes(s.status)) ||
      (v.categories || []).some((c) => /^C\d{2}$/i.test(c));
    if (!has) continue;
    withService++;
    const lists = [
      ...(v.operatingCities || []),
      ...(v.operationalCities || []),
      v.address?.city,
      v.location?.city
    ].filter(Boolean);
    if (!lists.length) {
      emptyCityWithService++;
      console.log('NO CITIES:', v.businessName, v.approvedServices?.map((s) => s.categoryCode), v.categories);
    }
  }
  console.log({ withService, emptyCityWithService });

  // What if we relax city for OPP-2026-0506?
  const config = await getAssignmentConfig('C10');
  // Patch opportunity city to Indore and retest
  const oppDoc = await Opportunity.findOne({ opportunityCode: 'OPP-2026-0506' });
  const originalCity = oppDoc.clientInfo.city;
  oppDoc.clientInfo.city = 'Indore';
  if (oppDoc.requirements?.cities) oppDoc.requirements.cities = ['Indore'];
  let queue = await buildVendorQueue(oppDoc, config);
  console.log('Queue with Indore city:', queue.length, queue);

  oppDoc.clientInfo.city = originalCity;
  if (oppDoc.requirements?.cities) oppDoc.requirements.cities = [originalCity];
  queue = await buildVendorQueue(oppDoc, config);
  console.log('Queue with Inodre city:', queue.length, queue);

  // Empty city
  oppDoc.clientInfo.city = '';
  if (oppDoc.requirements?.cities) oppDoc.requirements.cities = [];
  queue = await buildVendorQueue(oppDoc, config);
  console.log('Queue with empty city:', queue.length, queue);

  // Check subservice mismatch
  console.log('Rahul subs:', JSON.stringify(rahul.approvedServices?.[0]?.subServices));

  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
