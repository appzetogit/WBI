/**
 * Expand approved ServiceConfig category codes (C01…) into all codes
 * that may appear on Opportunity documents (legacy seeds used CCTV, SOLAR…).
 */
const ServiceConfig = require('../models/ServiceConfig');

// Fallback when ServiceConfig.matchAliases is not seeded yet.
// Also carries the human-readable service names older vendor records store in
// `Vendor.categories` (e.g. "Washing machine"), so those vendors stay matchable.
const LEGACY_ALIAS_MAP = {
  C01: ['CCTV', 'SURVEILLANCE', 'CAMERA'],
  C02: ['IT', 'COMPUTER', 'PC'],
  C03: ['NET', 'NETWORK', 'LAN', 'WIFI'],
  C04: ['SOLAR', 'UPS', 'DG', 'POWER', 'ENERGY', 'BATTERY', 'INVERTER'],
  C05: ['ATM', 'CDM', 'POS', 'BANKING'],
  C06: [
    'AC', 'AIR CONDITIONER', 'FRIDGE', 'REFRIGERATOR', 'WASHING MACHINE',
    'MICROWAVE', 'GEYSER', 'WATER HEATER', 'CHIMNEY', 'KITCHEN CHIMNEY',
    'COOLER', 'AIR COOLER', 'DISH WASHER', 'DISHWASHER', 'HOME APPLIANCE',
    'HOME APPLIANCES', 'APPLIANCE'
  ],
  C07: ['SEC', 'SECURITY', 'ACS', 'ACCESS'],
  C08: ['TELECOM', 'VSAT', 'COMM'],
  C09: ['MOBILE PHONE', 'GADGET', 'TABLET'],
  C10: ['MEDICAL', 'HEALTHCARE'],
  C11: ['AGRI', 'FARM'],
  C12: ['ELECTRICITY', 'ELECTRICAL', 'ELECTRICIAN', 'WIRING'],
  C13: ['PLUMBING', 'PLUMBER'],
  C14: ['HVAC', 'COLD STORAGE', 'CHILLER'],
  C15: ['OFFICE', 'COMMERCIAL'],
  C16: ['INDUSTRIAL', 'AUTOMATION', 'IOT'],
  C17: ['LED', 'TV', 'TELEVISION', 'HOME THEATRE', 'AUDIO', 'VIDEO'],
  C18: ['ELEVATOR', 'LIFT'],
  C19: ['FIRE', 'SAFETY', 'FAS'],
  C20: ['EDU', 'SCHOOL'],
  C21: ['RETAIL', 'POS_RETAIL'],
  C22: ['EV', 'AUTO', 'VEHICLE'],
  C23: ['SMART_HOME', 'HOME_AUTO'],
  C24: ['RO', 'R.O.', 'R.O. PRUFIER', 'PURIFIER', 'WATER PURIFIER'],
  // digital leftovers from old seed
  WEB: ['WEB', 'WEBSITE'],
  APP: ['APP', 'MOBILE']
};

const expandCategoryMatchCodes = async (approvedCodes = []) => {
  const codes = (approvedCodes || []).map((c) => String(c).toUpperCase()).filter(Boolean);
  if (!codes.length) return [];

  const set = new Set(codes);

  Object.entries(LEGACY_ALIAS_MAP).forEach(([canonical, aliases]) => {
    const hit = codes.includes(canonical) || aliases.some((a) => codes.includes(a));
    if (hit) {
      set.add(canonical);
      aliases.forEach((a) => set.add(a));
    }
  });

  try {
    const docs = await ServiceConfig.find({
      $or: [
        { categoryCode: { $in: Array.from(set) } },
        { matchAliases: { $in: Array.from(set) } }
      ],
      isActive: true
    })
      .select('categoryCode matchAliases')
      .lean();

    docs.forEach((doc) => {
      if (doc.categoryCode) set.add(String(doc.categoryCode).toUpperCase());
      (doc.matchAliases || []).forEach((a) => set.add(String(a).toUpperCase()));
    });
  } catch {
    // ignore — fallback map is enough
  }

  return Array.from(set);
};

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * `Vendor.categories` holds human-typed labels ("Washing machine", "R.O. Prufier"),
 * so an uppercase `$in` never matches them. Build case-insensitive matchers instead.
 */
const buildLegacyCategoryMatchers = (codes = []) =>
  (codes || [])
    .filter(Boolean)
    .map((code) => new RegExp(`^\\s*${escapeRegex(String(code).trim())}\\s*$`, 'i'));

module.exports = {
  LEGACY_ALIAS_MAP,
  expandCategoryMatchCodes,
  buildLegacyCategoryMatchers
};
