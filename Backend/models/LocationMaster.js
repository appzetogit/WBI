const mongoose = require('mongoose');

/**
 * Location masters beside City: countries, states, pincodes and service areas
 * (a named set of pincodes inside a city that the platform serves).
 */
const locationMasterSchema = new mongoose.Schema({
  type: { type: String, enum: ['country', 'state', 'pincode', 'service_area'], required: true, index: true },
  name: { type: String, required: true, trim: true },
  code: { type: String, trim: true, uppercase: true }, // ISO / state code / pincode
  parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'LocationMaster', default: null }, // state → country, pincode → state
  cityId: { type: mongoose.Schema.Types.ObjectId, ref: 'City', default: null }, // pincode / service area → city
  pincodes: [{ type: String, match: /^[1-9][0-9]{5}$/ }], // service areas
  serviceKeys: [{ type: String, uppercase: true, trim: true }], // service area: services offered (empty = all)
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

locationMasterSchema.index({ type: 1, code: 1 }, { unique: true, partialFilterExpression: { code: { $type: 'string' } } });
locationMasterSchema.index({ type: 1, pincodes: 1 });

module.exports = mongoose.model('LocationMaster', locationMasterSchema);
