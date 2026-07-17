const mongoose = require('mongoose');

const engineerMetricSchema = new mongoose.Schema({
  name: String,
  role: String,
  completedJobs: { type: Number, default: 0 },
  averageTimeHours: { type: Number, default: 0 },
  qualityScore: { type: Number, default: 0 },
  attendancePercent: { type: Number, default: 0 },
  customerRating: { type: Number, default: 0 },
  reworkPercent: { type: Number, default: 0 },
  lateArrivals: { type: Number, default: 0 },
  safetyScore: { type: Number, default: 0 }
}, { _id: false });

const chartPointSchema = new mongoose.Schema({
  label: String,
  revenue: Number,
  projects: Number,
  sla: Number,
  rating: Number,
  productivity: Number,
  profitMargin: Number
}, { _id: false });

const vendorGlobalPerformanceSchema = new mongoose.Schema({
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true, index: true },
  period: { type: String, default: 'current', index: true },
  serviceCategoryCode: { type: String, default: '', index: true },
  serviceCategoryName: { type: String, default: '' },
  performanceScore: { type: Number, default: 0 },
  vendorRating: { type: Number, default: 0 },
  slaCompliance: { type: Number, default: 0 },
  projectSuccessRate: { type: Number, default: 0 },
  activeProjects: { type: Number, default: 0 },
  revenue: { type: Number, default: 0 },
  profit: { type: Number, default: 0 },
  teamProductivity: { type: Number, default: 0 },
  customerSatisfaction: { type: Number, default: 0 },
  repeatClients: { type: Number, default: 0 },
  bidWinRate: { type: Number, default: 0 },
  quoteAcceptance: { type: Number, default: 0 },
  averageResponseTimeMinutes: { type: Number, default: 0 },
  complaintRate: { type: Number, default: 0 },
  completionPercent: { type: Number, default: 0 },
  dynamicKpis: [{ label: String, value: String, target: String, status: String }],
  charts: [chartPointSchema],
  engineers: [engineerMetricSchema],
  leaderboardRank: { type: Number, default: 0 },
  demoTag: { type: String, default: null, index: true }
}, { timestamps: true });

vendorGlobalPerformanceSchema.index({ vendorId: 1, serviceCategoryCode: 1 });

module.exports = mongoose.model('VendorGlobalPerformance', vendorGlobalPerformanceSchema);
