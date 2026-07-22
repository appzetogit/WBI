const mongoose = require('mongoose');

/**
 * Admin-driven Vendor Settings module layout & field policy.
 * Vendor portal sections/fields/channels are rendered from this config — not hardcoded UI lists.
 */
const vendorSettingsModuleConfigSchema = new mongoose.Schema(
  {
    scope: { type: String, default: 'global', unique: true },
    name: { type: String, default: 'Vendor Settings' },
    isActive: { type: Boolean, default: true },
    version: { type: Number, default: 1 },

    sections: [
      {
        key: { type: String, required: true },
        label: { type: String, required: true },
        icon: { type: String, default: 'settings' },
        description: { type: String, default: '' },
        sortOrder: { type: Number, default: 0 },
        isActive: { type: Boolean, default: true },
        vendorCanEdit: { type: Boolean, default: true },
        adminOnly: { type: Boolean, default: false }
      }
    ],

    companyFields: [
      {
        key: { type: String, required: true },
        label: { type: String, required: true },
        path: { type: String, required: true },
        type: { type: String, default: 'text' },
        vendorSource: { type: String, default: '' },
        vendorEditable: { type: Boolean, default: true },
        adminLocked: { type: Boolean, default: false },
        required: { type: Boolean, default: false },
        sortOrder: { type: Number, default: 0 },
        isActive: { type: Boolean, default: true }
      }
    ],

    notificationChannels: [
      {
        key: { type: String, required: true },
        label: { type: String, required: true },
        defaultEnabled: { type: Boolean, default: true },
        vendorEditable: { type: Boolean, default: true },
        sortOrder: { type: Number, default: 0 },
        isActive: { type: Boolean, default: true }
      }
    ],

    integrationProviders: [
      {
        key: { type: String, required: true },
        label: { type: String, required: true },
        defaultEnabled: { type: Boolean, default: true },
        adminManaged: { type: Boolean, default: true },
        vendorEditable: { type: Boolean, default: false },
        sortOrder: { type: Number, default: 0 },
        isActive: { type: Boolean, default: true }
      }
    ],

    financeFields: [
      {
        key: { type: String, required: true },
        label: { type: String, required: true },
        path: { type: String, required: true },
        type: { type: String, default: 'text' },
        vendorEditable: { type: Boolean, default: false },
        adminLocked: { type: Boolean, default: true },
        sortOrder: { type: Number, default: 0 },
        isActive: { type: Boolean, default: true }
      }
    ],

    teamCatalog: {
      departments: { type: [String], default: [] },
      roles: { type: [String], default: [] },
      permissions: { type: [String], default: [] },
      invitationsEnabledDefault: { type: Boolean, default: true }
    },

    securityPolicy: {
      allowVendorToggle2fa: { type: Boolean, default: true },
      showDevices: { type: Boolean, default: true },
      showApiTokens: { type: Boolean, default: true },
      allowSignOut: { type: Boolean, default: true }
    },

    serviceSettingFields: [
      {
        key: { type: String, required: true },
        label: { type: String, required: true },
        type: { type: String, default: 'text' },
        vendorEditable: { type: Boolean, default: true },
        sortOrder: { type: Number, default: 0 },
        isActive: { type: Boolean, default: true }
      }
    ]
  },
  { timestamps: true }
);

module.exports = mongoose.model('VendorSettingsModuleConfig', vendorSettingsModuleConfigSchema);
