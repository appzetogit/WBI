const mongoose = require('mongoose');

const DEFAULT_SIDEBAR = [
  'Dashboard',
  'Business Intake',
  'Clients & Contracts',
  'Project Operations',
  'Workforce',
  'Resources',
  'Quality & Control',
  'Finance',
  'Performance',
  'Compliance',
  'Notifications',
  'Support',
  'Settings'
];

const widgetSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    enabled: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
    config: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { _id: false }
);

const sidebarModuleSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    enabled: { type: Boolean, default: true },
    order: { type: Number, default: 0 }
  },
  { _id: false }
);

/**
 * Per-service vendor dashboard / sidebar module configuration.
 */
const dashboardConfigurationSchema = new mongoose.Schema(
  {
    categoryCode: { type: String, required: true, unique: true, uppercase: true, index: true },
    categoryName: { type: String, required: true },
    version: { type: Number, default: 1 },
    isActive: { type: Boolean, default: true, index: true },
    sidebarModules: {
      type: [sidebarModuleSchema],
      default: () =>
        DEFAULT_SIDEBAR.map((label, i) => ({
          key: label.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
          label,
          enabled: true,
          order: i
        }))
    },
    widgets: {
      type: [widgetSchema],
      default: () => [
        { key: 'wallet', label: 'Wallet', enabled: true, order: 0 },
        { key: 'active_projects', label: 'Active Projects', enabled: true, order: 1 },
        { key: 'available_engineers', label: 'Available Engineers', enabled: true, order: 2 },
        { key: 'sla_adherence', label: 'SLA Adherence', enabled: true, order: 3 }
      ]
    },
    reportKeys: [{ type: String }],
    filterKeys: [{ type: String }]
  },
  { timestamps: true }
);

dashboardConfigurationSchema.statics.DEFAULT_SIDEBAR = DEFAULT_SIDEBAR;

module.exports = mongoose.model('DashboardConfiguration', dashboardConfigurationSchema);
