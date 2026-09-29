/**
 * One source of truth for one-time service charges, used by the service page,
 * the review screen and booking confirmation. Order of precedence:
 *   service pricing rule (admin: One-Time Services) → global Settings → defaults.
 */
const Settings = require('../models/Settings');
const ServicePricingRule = require('../models/ServicePricingRule');

const resolveOneTimePricing = async (serviceId) => {
  const [settings, rule] = await Promise.all([
    Settings.findOne({ type: 'global' }).select('visitedCharges serviceGstPercentage oneTimePlatformFee').lean(),
    serviceId ? ServicePricingRule.findOne({ serviceId, isActive: { $ne: false } }).lean() : null
  ]);
  return {
    visitCharge: Number(settings?.visitedCharges ?? 199),
    platformFee: Number(rule?.platformFee ?? settings?.oneTimePlatformFee ?? 30),
    gstPercent: Number(rule?.gstPercent ?? settings?.serviceGstPercentage ?? 18),
    discount: Number(rule?.discount ?? 0),
    source: rule ? 'service_rule' : 'settings'
  };
};

module.exports = { resolveOneTimePricing };
