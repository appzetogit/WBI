const mongoose = require('mongoose');

/**
 * Where a vendor delivers a given service. Routing only offers a job to a
 * vendor whose active coverage for the job's serviceKey includes the job's
 * pincode or city.
 */

const normalizeCity = (city) => String(city || '').trim().toLowerCase().replace(/\s+/g, ' ');
const normalizePincode = (pin) => String(pin || '').replace(/[^0-9]/g, '');

const vendorServiceCoverageSchema = new mongoose.Schema({
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true, index: true },
  /** ServiceConfig.categoryCode */
  serviceKey: { type: String, required: true, uppercase: true, trim: true },
  serviceName: { type: String, default: '' },
  serviceConfigId: { type: mongoose.Schema.Types.ObjectId, ref: 'ServiceConfig', default: null },
  coverageCities: {
    type: [String],
    default: [],
    set: (cities) => [...new Set((cities || []).map(normalizeCity).filter(Boolean))]
  },
  coveragePincodes: {
    type: [String],
    default: [],
    set: (pins) => [...new Set((pins || []).map(normalizePincode).filter((p) => p.length === 6))]
  },
  active: { type: Boolean, default: true },
  updatedBy: {
    actorId: { type: mongoose.Schema.Types.ObjectId, default: null },
    role: { type: String, default: null }
  }
}, { timestamps: true });

vendorServiceCoverageSchema.index({ vendorId: 1, serviceKey: 1 }, { unique: true });
vendorServiceCoverageSchema.index({ serviceKey: 1, active: 1, coveragePincodes: 1 });
vendorServiceCoverageSchema.index({ serviceKey: 1, active: 1, coverageCities: 1 });

vendorServiceCoverageSchema.statics.normalizeCity = normalizeCity;
vendorServiceCoverageSchema.statics.normalizePincode = normalizePincode;

module.exports = mongoose.model('VendorServiceCoverage', vendorServiceCoverageSchema);
