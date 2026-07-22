const Vendor = require('../models/Vendor');
const VendorGlobalSetting = require('../models/VendorGlobalSetting');
const VendorSettingsModuleConfig = require('../models/VendorSettingsModuleConfig');
const Settings = require('../models/Settings');
const { setCache, getCache, delCache } = require('./redisService');

const CONFIG_CACHE_KEY = 'vendor:settings:module:cfg';
const CONFIG_TTL = 60;

const DEFAULT_SEED = () => ({
  scope: 'global',
  name: 'Vendor Settings',
  isActive: true,
  version: 1,
  sections: [
    { key: 'registered', label: 'Your Services', icon: 'briefcase', description: 'Registered and approved service categories', sortOrder: 1, isActive: true, vendorCanEdit: false },
    { key: 'company', label: 'Company Profile', icon: 'building', description: 'Legal identity synced with vendor KYC profile', sortOrder: 2, isActive: true, vendorCanEdit: true },
    { key: 'team', label: 'Team Settings', icon: 'users', description: 'Departments, roles and invitation policy', sortOrder: 3, isActive: true, vendorCanEdit: true },
    { key: 'services', label: 'Service Settings', icon: 'settings', description: 'Per-service coverage, pricing and hours', sortOrder: 4, isActive: true, vendorCanEdit: true },
    { key: 'finance', label: 'Finance Settings', icon: 'credit-card', description: 'Bank, payout and invoice preferences', sortOrder: 5, isActive: true, vendorCanEdit: true },
    { key: 'notifications', label: 'Notifications', icon: 'bell', description: 'Channel preferences', sortOrder: 6, isActive: true, vendorCanEdit: true },
    { key: 'security', label: 'Security', icon: 'lock', description: '2FA, sessions and device access', sortOrder: 7, isActive: true, vendorCanEdit: true },
    { key: 'integrations', label: 'Integrations', icon: 'plug', description: 'Connected providers (admin-managed)', sortOrder: 8, isActive: true, vendorCanEdit: false }
  ],
  companyFields: [
    { key: 'companyName', label: 'Company Name', path: 'companyProfile.companyName', vendorSource: 'businessName', vendorEditable: true, sortOrder: 1, isActive: true, required: true },
    { key: 'gst', label: 'GSTIN', path: 'companyProfile.gst', vendorSource: 'gstin', vendorEditable: false, adminLocked: true, sortOrder: 2, isActive: true },
    { key: 'pan', label: 'PAN', path: 'companyProfile.pan', vendorSource: 'pan.number', vendorEditable: false, adminLocked: true, sortOrder: 3, isActive: true },
    { key: 'address', label: 'Address', path: 'companyProfile.address', vendorSource: 'address', vendorEditable: true, sortOrder: 4, isActive: true },
    { key: 'website', label: 'Website', path: 'companyProfile.website', vendorSource: 'website', vendorEditable: true, sortOrder: 5, isActive: true }
  ],
  notificationChannels: [
    { key: 'email', label: 'Email', defaultEnabled: true, vendorEditable: true, sortOrder: 1, isActive: true },
    { key: 'sms', label: 'SMS', defaultEnabled: true, vendorEditable: true, sortOrder: 2, isActive: true },
    { key: 'push', label: 'Push', defaultEnabled: true, vendorEditable: true, sortOrder: 3, isActive: true },
    { key: 'whatsapp', label: 'WhatsApp', defaultEnabled: false, vendorEditable: true, sortOrder: 4, isActive: true },
    { key: 'marketing', label: 'Marketing', defaultEnabled: false, vendorEditable: true, sortOrder: 5, isActive: true },
    { key: 'systemAlerts', label: 'System Alerts', defaultEnabled: true, vendorEditable: true, sortOrder: 6, isActive: true }
  ],
  integrationProviders: [
    { key: 'googleMaps', label: 'Google Maps', defaultEnabled: true, adminManaged: true, vendorEditable: false, sortOrder: 1, isActive: true },
    { key: 'paymentGateway', label: 'Payment Gateway', defaultEnabled: true, adminManaged: true, vendorEditable: false, sortOrder: 2, isActive: true },
    { key: 'smsProvider', label: 'SMS Provider', defaultEnabled: true, adminManaged: true, vendorEditable: false, sortOrder: 3, isActive: true },
    { key: 'cloudStorage', label: 'Cloud Storage', defaultEnabled: true, adminManaged: true, vendorEditable: false, sortOrder: 4, isActive: true },
    { key: 'email', label: 'Email Provider', defaultEnabled: true, adminManaged: true, vendorEditable: false, sortOrder: 5, isActive: true }
  ],
  financeFields: [
    { key: 'invoicePrefix', label: 'Invoice Prefix', path: 'financeSettings.invoicePrefix', type: 'text', vendorEditable: true, adminLocked: false, sortOrder: 1, isActive: true },
    { key: 'withdrawalPreference', label: 'Withdrawal Preference', path: 'financeSettings.withdrawalPreference', type: 'text', vendorEditable: true, adminLocked: false, sortOrder: 2, isActive: true },
    { key: 'commissionPercent', label: 'Platform Commission %', path: 'financeSettings.commissionPercent', type: 'number', vendorEditable: false, adminLocked: true, sortOrder: 3, isActive: true },
    { key: 'taxesEnabled', label: 'Taxes Enabled', path: 'financeSettings.taxesEnabled', type: 'boolean', vendorEditable: false, adminLocked: true, sortOrder: 4, isActive: true }
  ],
  teamCatalog: {
    departments: ['Operations', 'Finance', 'Quality', 'Field'],
    roles: ['Owner', 'Manager', 'Supervisor', 'Viewer'],
    permissions: ['view', 'edit', 'approve', 'finance', 'invite'],
    invitationsEnabledDefault: true
  },
  securityPolicy: {
    allowVendorToggle2fa: true,
    showDevices: true,
    showApiTokens: true,
    allowSignOut: true
  },
  serviceSettingFields: [
    { key: 'coverageAreas', label: 'Coverage Areas', type: 'tags', vendorEditable: true, sortOrder: 1, isActive: true },
    { key: 'pricingModel', label: 'Pricing Model', type: 'text', vendorEditable: true, sortOrder: 2, isActive: true },
    { key: 'workingHours', label: 'Working Hours', type: 'text', vendorEditable: true, sortOrder: 3, isActive: true },
    { key: 'emergencyAvailable', label: 'Emergency Available', type: 'boolean', vendorEditable: true, sortOrder: 4, isActive: true }
  ]
});

function activeSorted(list = []) {
  return (list || []).filter((i) => i && i.isActive !== false).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
}

function formatAddress(address = {}) {
  if (!address || typeof address !== 'object') return '';
  if (address.fullAddress) return String(address.fullAddress);
  return [address.addressLine1, address.addressLine2, address.city, address.state, address.pincode]
    .filter(Boolean)
    .join(', ');
}

function getByPath(obj, path) {
  if (!obj || !path) return undefined;
  return String(path).split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

function setByPath(obj, path, value) {
  const keys = String(path).split('.');
  let ref = obj;
  keys.slice(0, -1).forEach((key) => {
    if (!ref[key] || typeof ref[key] !== 'object') ref[key] = {};
    ref = ref[key];
  });
  ref[keys[keys.length - 1]] = value;
}

function maskAccount(accountNumber) {
  const s = String(accountNumber || '');
  if (s.length < 4) return s ? `****${s}` : '';
  return `****${s.slice(-4)}`;
}

async function ensureDefaultSettingsConfig() {
  let cfg = await VendorSettingsModuleConfig.findOne({ scope: 'global' });
  if (!cfg) {
    cfg = await VendorSettingsModuleConfig.create(DEFAULT_SEED());
  }
  return cfg;
}

async function resolveSettingsModuleConfig() {
  const cached = await getCache(CONFIG_CACHE_KEY);
  if (cached) return cached;
  await ensureDefaultSettingsConfig();
  const doc = await VendorSettingsModuleConfig.findOne({ scope: 'global', isActive: true }).lean();
  const resolved = doc || DEFAULT_SEED();
  await setCache(CONFIG_CACHE_KEY, resolved, CONFIG_TTL);
  return resolved;
}

async function invalidateSettingsModuleConfigCache() {
  try {
    await delCache(CONFIG_CACHE_KEY);
  } catch {
    /* ignore */
  }
}

function publicConfigView(cfg) {
  return {
    name: cfg.name,
    version: cfg.version,
    sections: activeSorted(cfg.sections),
    companyFields: activeSorted(cfg.companyFields),
    notificationChannels: activeSorted(cfg.notificationChannels),
    integrationProviders: activeSorted(cfg.integrationProviders),
    financeFields: activeSorted(cfg.financeFields),
    teamCatalog: cfg.teamCatalog || {},
    securityPolicy: cfg.securityPolicy || {},
    serviceSettingFields: activeSorted(cfg.serviceSettingFields)
  };
}

async function computeCommissionPercent(globalSettings) {
  const payout = Number(globalSettings?.servicePayoutPercentage);
  if (Number.isFinite(payout)) return Math.max(0, Math.min(100, 100 - payout));
  return 5;
}

async function hydrateVendorSettings(vendorId) {
  const [vendor, cfg, globalSettings] = await Promise.all([
    Vendor.findById(vendorId)
      .select(
        'businessName gstin pan website address bankDetails bankStatus kycStatus verification approvedServices uniqueCompanyCode profilePhoto companyDescription settings businessHours'
      )
      .lean(),
    resolveSettingsModuleConfig(),
    Settings.findOne({ type: 'global' }).lean()
  ]);

  if (!vendor) {
    return { ok: false, status: 404, message: 'Vendor not found' };
  }

  let settings = await VendorGlobalSetting.findOneAndUpdate(
    { vendorId },
    { $setOnInsert: { vendorId } },
    { upsert: true, new: true }
  );

  const patch = {};
  const company = { ...(settings.companyProfile?.toObject?.() || settings.companyProfile || {}) };

  for (const field of activeSorted(cfg.companyFields)) {
    const current = getByPath({ companyProfile: company }, field.path);
    if (current) continue;
    let sourceVal;
    if (field.vendorSource === 'address') sourceVal = formatAddress(vendor.address);
    else if (field.vendorSource === 'pan.number') sourceVal = vendor.pan?.number;
    else sourceVal = getByPath(vendor, field.vendorSource);
    if (sourceVal != null && sourceVal !== '') {
      setByPath({ companyProfile: company }, field.path, sourceVal);
    }
  }
  if (JSON.stringify(company) !== JSON.stringify(settings.companyProfile || {})) {
    patch.companyProfile = company;
  }

  const team = { ...(settings.teamSettings?.toObject?.() || settings.teamSettings || {}) };
  const catalog = cfg.teamCatalog || {};
  if (!Array.isArray(team.departments) || !team.departments.length) team.departments = catalog.departments || [];
  if (!Array.isArray(team.roles) || !team.roles.length) team.roles = catalog.roles || [];
  if (!Array.isArray(team.permissions) || !team.permissions.length) team.permissions = catalog.permissions || [];
  if (team.invitationsEnabled == null) team.invitationsEnabled = catalog.invitationsEnabledDefault !== false;
  patch.teamSettings = team;

  const finance = { ...(settings.financeSettings?.toObject?.() || settings.financeSettings || {}) };
  const commission = await computeCommissionPercent(globalSettings);
  finance.commissionPercent = commission;
  if ((!finance.bankAccounts || !finance.bankAccounts.length) && vendor.bankDetails?.bankName) {
    finance.bankAccounts = [
      {
        bank: vendor.bankDetails.bankName,
        accountMasked: maskAccount(vendor.bankDetails.accountNumber),
        primary: true
      }
    ];
  }
  if (!finance.paymentMethods?.length) {
    finance.paymentMethods = ['bank_transfer', ...(vendor.bankDetails?.upiId ? ['upi'] : [])];
  }
  patch.financeSettings = finance;

  const notif = { ...(settings.notificationSettings?.toObject?.() || settings.notificationSettings || {}) };
  for (const ch of activeSorted(cfg.notificationChannels)) {
    if (notif[ch.key] === undefined) notif[ch.key] = Boolean(ch.defaultEnabled);
  }
  patch.notificationSettings = notif;

  const integrations = { ...(settings.integrations?.toObject?.() || settings.integrations || {}) };
  for (const provider of activeSorted(cfg.integrationProviders)) {
    if (integrations[provider.key] === undefined) integrations[provider.key] = Boolean(provider.defaultEnabled);
  }
  patch.integrations = integrations;

  const approved = (vendor.approvedServices || []).filter((s) => s.status !== 'suspended');
  const existingServices = Array.isArray(settings.serviceSettings) ? [...settings.serviceSettings] : [];
  const byCode = new Map(existingServices.map((s) => [String(s.serviceCategoryCode || ''), s]));
  const mergedServices = approved.map((svc) => {
    const prev = byCode.get(String(svc.categoryCode || '')) || {};
    return {
      serviceCategoryCode: svc.categoryCode,
      serviceCategoryName: svc.categoryName,
      coverageAreas: prev.coverageAreas || vendor.workingCities || [],
      pricingModel: prev.pricingModel || 'project',
      workingHours: prev.workingHours || '09:00-18:00',
      emergencyAvailable: prev.emergencyAvailable ?? false
    };
  });
  patch.serviceSettings = mergedServices;

  settings = await VendorGlobalSetting.findOneAndUpdate(
    { vendorId },
    { $set: patch },
    { new: true }
  ).lean();

  const meta = {
    kycStatus: vendor.kycStatus || vendor.verification?.kycStatus || 'pending',
    bankStatus: vendor.bankStatus || 'pending',
    panVerified: Boolean(vendor.verification?.panVerified),
    gstVerified: Boolean(vendor.verification?.gstVerified),
    uniqueCompanyCode: vendor.uniqueCompanyCode || '',
    profilePhoto: vendor.profilePhoto || '',
    approvedServices: approved,
    globalFinance: {
      serviceGstPercentage: globalSettings?.serviceGstPercentage ?? 18,
      partsGstPercentage: globalSettings?.partsGstPercentage ?? 18,
      servicePayoutPercentage: globalSettings?.servicePayoutPercentage ?? 90,
      partsPayoutPercentage: globalSettings?.partsPayoutPercentage ?? 100,
      tdsPercentage: globalSettings?.tdsPercentage ?? 1
    }
  };

  return {
    ok: true,
    data: {
      ...settings,
      meta,
      moduleConfig: publicConfigView(cfg)
    }
  };
}

function pickAllowedVendorUpdate(body = {}, cfg) {
  const out = {};
  const editableCompany = activeSorted(cfg.companyFields).filter((f) => f.vendorEditable && !f.adminLocked);
  if (body.companyProfile && typeof body.companyProfile === 'object') {
    out.companyProfile = {};
    for (const field of editableCompany) {
      const key = field.key;
      if (body.companyProfile[key] !== undefined) out.companyProfile[key] = body.companyProfile[key];
    }
  }

  if (body.teamSettings && typeof body.teamSettings === 'object') {
    out.teamSettings = {};
    if (Array.isArray(body.teamSettings.departments)) out.teamSettings.departments = body.teamSettings.departments.map(String);
    if (Array.isArray(body.teamSettings.roles)) out.teamSettings.roles = body.teamSettings.roles.map(String);
    if (Array.isArray(body.teamSettings.permissions)) out.teamSettings.permissions = body.teamSettings.permissions.map(String);
    if (typeof body.teamSettings.invitationsEnabled === 'boolean') {
      out.teamSettings.invitationsEnabled = body.teamSettings.invitationsEnabled;
    }
  }

  const editableFinance = activeSorted(cfg.financeFields).filter((f) => f.vendorEditable && !f.adminLocked);
  if (body.financeSettings && typeof body.financeSettings === 'object') {
    out.financeSettings = {};
    for (const field of editableFinance) {
      const key = field.key;
      if (body.financeSettings[key] !== undefined) out.financeSettings[key] = body.financeSettings[key];
    }
  }

  if (body.notificationSettings && typeof body.notificationSettings === 'object') {
    out.notificationSettings = {};
    for (const ch of activeSorted(cfg.notificationChannels).filter((c) => c.vendorEditable !== false)) {
      if (typeof body.notificationSettings[ch.key] === 'boolean') {
        out.notificationSettings[ch.key] = body.notificationSettings[ch.key];
      }
    }
  }

  if (body.security && typeof body.security === 'object') {
    out.security = {};
    if (cfg.securityPolicy?.allowVendorToggle2fa !== false && typeof body.security.twoFactorEnabled === 'boolean') {
      out.security.twoFactorEnabled = body.security.twoFactorEnabled;
    }
  }

  const editableIntegrations = activeSorted(cfg.integrationProviders).filter((p) => p.vendorEditable);
  if (body.integrations && typeof body.integrations === 'object' && editableIntegrations.length) {
    out.integrations = {};
    for (const p of editableIntegrations) {
      if (typeof body.integrations[p.key] === 'boolean') out.integrations[p.key] = body.integrations[p.key];
    }
  }

  if (Array.isArray(body.serviceSettings)) {
    const editableKeys = activeSorted(cfg.serviceSettingFields)
      .filter((f) => f.vendorEditable !== false)
      .map((f) => f.key);
    out.serviceSettings = body.serviceSettings.map((row) => {
      const next = {
        serviceCategoryCode: row.serviceCategoryCode,
        serviceCategoryName: row.serviceCategoryName
      };
      for (const key of editableKeys) {
        if (row[key] !== undefined) next[key] = row[key];
      }
      return next;
    });
  }

  return out;
}

async function syncVendorProfileFromSettings(vendorId, allowed) {
  if (!allowed.companyProfile) return;
  const vendor = await Vendor.findById(vendorId);
  if (!vendor) return;
  const cp = allowed.companyProfile;
  if (cp.companyName != null) vendor.businessName = String(cp.companyName).trim();
  if (cp.website != null) vendor.website = String(cp.website).trim();
  if (cp.address != null) {
    vendor.address = vendor.address || {};
    vendor.address.fullAddress = String(cp.address).trim();
  }
  await vendor.save();
}

async function updateVendorSettings(vendorId, body = {}) {
  const cfg = await resolveSettingsModuleConfig();
  const allowed = pickAllowedVendorUpdate(body, cfg);
  if (!Object.keys(allowed).length) {
    return { ok: false, status: 400, message: 'No editable settings provided' };
  }

  const $set = {};
  Object.entries(allowed).forEach(([section, value]) => {
    if (section === 'serviceSettings') {
      $set.serviceSettings = value;
      return;
    }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      Object.entries(value).forEach(([k, v]) => {
        $set[`${section}.${k}`] = v;
      });
    } else {
      $set[section] = value;
    }
  });

  await VendorGlobalSetting.findOneAndUpdate(
    { vendorId },
    { $set },
    { upsert: true, new: true, runValidators: true }
  );

  await syncVendorProfileFromSettings(vendorId, allowed);
  return hydrateVendorSettings(vendorId);
}

async function upsertSettingsModuleConfig(payload = {}) {
  const existing = await ensureDefaultSettingsConfig();
  const allowedKeys = [
    'name',
    'isActive',
    'version',
    'sections',
    'companyFields',
    'notificationChannels',
    'integrationProviders',
    'financeFields',
    'teamCatalog',
    'securityPolicy',
    'serviceSettingFields'
  ];
  for (const key of allowedKeys) {
    if (payload[key] !== undefined) existing[key] = payload[key];
  }
  if (typeof payload.version === 'number') existing.version = payload.version;
  else existing.version = (existing.version || 1) + 1;
  await existing.save();
  await invalidateSettingsModuleConfigCache();
  return existing.toObject();
}

module.exports = {
  DEFAULT_SEED,
  ensureDefaultSettingsConfig,
  resolveSettingsModuleConfig,
  invalidateSettingsModuleConfigCache,
  publicConfigView,
  hydrateVendorSettings,
  updateVendorSettings,
  upsertSettingsModuleConfig
};
