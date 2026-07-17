const mongoose = require('mongoose');

const vendorGlobalSettingSchema = new mongoose.Schema({
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true, unique: true, index: true },
  companyProfile: {
    companyName: String,
    gst: String,
    pan: String,
    address: String,
    website: String,
    logo: String
  },
  teamSettings: {
    departments: [String],
    roles: [String],
    permissions: [String],
    invitationsEnabled: { type: Boolean, default: true }
  },
  serviceSettings: [{
    serviceCategoryCode: String,
    serviceCategoryName: String,
    coverageAreas: [String],
    pricingModel: String,
    workingHours: String,
    emergencyAvailable: Boolean
  }],
  financeSettings: {
    bankAccounts: [{ bank: String, accountMasked: String, primary: Boolean }],
    taxesEnabled: { type: Boolean, default: true },
    invoicePrefix: { type: String, default: 'INV' },
    withdrawalPreference: { type: String, default: 'manual' },
    paymentMethods: [String],
    commissionPercent: { type: Number, default: 5 }
  },
  notificationSettings: {
    email: { type: Boolean, default: true },
    sms: { type: Boolean, default: true },
    push: { type: Boolean, default: true },
    whatsapp: { type: Boolean, default: false },
    marketing: { type: Boolean, default: false },
    systemAlerts: { type: Boolean, default: true }
  },
  security: {
    twoFactorEnabled: { type: Boolean, default: false },
    activeSessions: { type: Number, default: 1 },
    devices: [{ name: String, lastSeen: Date }],
    apiTokens: [{ label: String, lastUsedAt: Date }]
  },
  integrations: {
    googleMaps: { type: Boolean, default: true },
    paymentGateway: { type: Boolean, default: true },
    smsProvider: { type: Boolean, default: true },
    cloudStorage: { type: Boolean, default: true },
    email: { type: Boolean, default: true },
    webhooks: [{ name: String, url: String, enabled: Boolean }]
  },
  demoTag: { type: String, default: null, index: true }
}, { timestamps: true });

module.exports = mongoose.model('VendorGlobalSetting', vendorGlobalSettingSchema);
