/**
 * Check that free-text service names resolve to the right catalog category,
 * and that names with no matching category stay unmatched instead of being
 * routed to an unrelated vendor pool.
 *
 *   node scripts/verifyCategoryResolution.js
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');

(async () => {
  await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);

  const ServiceConfig = require('../models/ServiceConfig');
  const { resolveCategoryMatch } = require('../utils/createOpportunityFromEnquiry');

  const configs = await ServiceConfig.find({ isActive: true }).select('categoryCode categoryName').lean();
  const nameOf = (code) => configs.find((c) => c.categoryCode === code)?.categoryName || '?';

  // [input, expected code or null when the catalog genuinely has no fit]
  const cases = [
    ['AC Service & Repair', 'C06'],
    ['Washing Machine Repair', 'C06'],
    ['Electrician Service', 'C12'],
    ['Plumbing Service', 'C13'],
    ['Geyser Repair', 'C06'],
    ['CCTV Installation', 'C01'],
    ['Refrigerator Repair', 'C06'],
    ['Laptop Repair', 'C02'],
    ['Solar Panel Installation', 'C04'],
    ['ATM Maintenance', 'C05'],
    ['RO Installation', 'C24'],
    ['Lift AMC', 'C18'],
    ['Fire Extinguisher Refill', 'C19'],
    ['Networking & Internet', 'C03'],
    ['Wheelchair Repair', 'C10'],
    // no such category in the catalog -> must NOT be silently routed to C01
    ['Carpenter Service', null],
    ['Painting Service', null],
    ['Pest Control', null],
    ['Deep Cleaning Service', null]
  ];

  let pass = 0;
  let fail = 0;
  for (const [input, expected] of cases) {
    const r = await resolveCategoryMatch({ enquiryType: 'b2b', equipmentType: [input], hints: [] });
    const actual = r.matched ? r.code : null;
    const ok = actual === expected;
    if (ok) pass += 1;
    else fail += 1;
    console.log(
      `${ok ? 'PASS' : 'FAIL'}  ${input.padEnd(26)} -> ${
        actual ? `${actual} (${nameOf(actual)})` : 'UNMATCHED (escalate)'
      }${ok ? '' : `   expected ${expected || 'UNMATCHED'}`}  [src=${r.source}]`
    );
  }
  console.log(`\n${pass} passed, ${fail} failed`);

  await mongoose.disconnect();
  process.exit(fail ? 1 : 0);
})().catch(async (e) => {
  console.error('ERROR:', e);
  try {
    await mongoose.disconnect();
  } catch (_) {
    /* ignore */
  }
  process.exit(1);
});
