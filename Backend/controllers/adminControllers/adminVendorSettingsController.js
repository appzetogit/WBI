const {
  resolveSettingsModuleConfig,
  publicConfigView,
  upsertSettingsModuleConfig,
  hydrateVendorSettings,
  updateVendorSettings
} = require('../../services/vendorSettingsService');

exports.getConfig = async (req, res) => {
  try {
    const cfg = await resolveSettingsModuleConfig();
    res.json({ success: true, data: cfg });
  } catch (error) {
    console.error('vendor settings config:', error);
    res.status(500).json({ success: false, message: 'Failed to load settings module config' });
  }
};

exports.saveConfig = async (req, res) => {
  try {
    const data = await upsertSettingsModuleConfig(req.body || {});
    res.json({ success: true, data, public: publicConfigView(data) });
  } catch (error) {
    console.error('save vendor settings config:', error);
    res.status(500).json({ success: false, message: 'Failed to save settings module config' });
  }
};

exports.getVendorSettings = async (req, res) => {
  try {
    const result = await hydrateVendorSettings(req.params.vendorId);
    if (!result.ok) return res.status(result.status || 400).json({ success: false, message: result.message });
    res.json({ success: true, data: result.data });
  } catch (error) {
    console.error('admin get vendor settings:', error);
    res.status(500).json({ success: false, message: 'Failed to load vendor settings' });
  }
};

exports.updateVendorSettingsAdmin = async (req, res) => {
  try {
    // Admin may update broader fields by merging into body with elevated flags via direct model update
    const VendorGlobalSetting = require('../../models/VendorGlobalSetting');
    const allowed = { ...(req.body || {}) };
    delete allowed.vendorId;
    delete allowed._id;
    delete allowed.__v;
    delete allowed.meta;
    delete allowed.moduleConfig;

    await VendorGlobalSetting.findOneAndUpdate(
      { vendorId: req.params.vendorId },
      { $set: allowed },
      { upsert: true, new: true, runValidators: true }
    );

    // Still run vendor-safe path for syncable fields when present
    if (req.body?.companyProfile || req.body?.teamSettings || req.body?.financeSettings) {
      await updateVendorSettings(req.params.vendorId, req.body);
    }

    const result = await hydrateVendorSettings(req.params.vendorId);
    if (!result.ok) return res.status(result.status || 400).json({ success: false, message: result.message });
    res.json({ success: true, data: result.data });
  } catch (error) {
    console.error('admin update vendor settings:', error);
    res.status(500).json({ success: false, message: 'Failed to update vendor settings' });
  }
};
