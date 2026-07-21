/**
 * Expand approved ServiceConfig category codes (C01…) into all codes
 * that may appear on Opportunity documents (legacy seeds used CCTV, SOLAR…).
 */
const ServiceConfig = require('../models/ServiceConfig');

// Fallback when ServiceConfig.matchAliases is not seeded yet
const LEGACY_ALIAS_MAP = {
  C01: ['CCTV', 'SURVEILLANCE', 'CAMERA'],
  C02: ['IT', 'COMPUTER', 'PC'],
  C03: ['NET', 'NETWORK', 'LAN', 'WIFI'],
  C04: ['SOLAR', 'UPS', 'DG', 'POWER', 'ENERGY', 'BATTERY'],
  C05: ['ATM', 'CDM', 'POS', 'BANKING'],
  C07: ['SEC', 'SECURITY', 'ACS', 'ACCESS'],
  C08: ['TELECOM', 'VSAT', 'COMM'],
  C10: ['MEDICAL', 'HEALTHCARE'],
  C11: ['AGRI', 'FARM'],
  C15: ['OFFICE', 'COMMERCIAL'],
  C16: ['INDUSTRIAL', 'AUTOMATION', 'IOT'],
  C18: ['ELEVATOR', 'LIFT'],
  C19: ['FIRE', 'SAFETY', 'FAS'],
  C20: ['EDU', 'SCHOOL'],
  C21: ['RETAIL', 'POS_RETAIL'],
  C22: ['EV', 'AUTO', 'VEHICLE'],
  C23: ['SMART_HOME', 'HOME_AUTO'],
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

module.exports = {
  LEGACY_ALIAS_MAP,
  expandCategoryMatchCodes
};
