const mongoose = require('mongoose');

const counterSchema = new mongoose.Schema({ _id: String, seq: { type: Number, default: 0 } });
const Counter = mongoose.models.Counter || mongoose.model('Counter', counterSchema);

const vendorQualityDamageSchema = new mongoose.Schema({
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true, index: true },
  incidentCode: { type: String, unique: true, index: true },
  projectName: { type: String, default: '' },
  projectCode: { type: String, default: '' },
  clientName: { type: String, default: '' },
  engineerName: { type: String, default: '' },
  serviceCategoryCode: { type: String, default: '', index: true },
  serviceCategoryName: { type: String, default: '' },
  description: { type: String, default: '' },
  estimatedCost: { type: Number, default: 0 },
  responsibleParty: { type: String, enum: ['engineer', 'client', 'third_party', 'material', 'unknown'], default: 'unknown' },
  insuranceCase: { type: Boolean, default: false },
  photosCount: { type: Number, default: 0 },
  status: {
    type: String,
    enum: ['reported', 'investigation', 'approval', 'settlement', 'closed'],
    default: 'reported',
    index: true
  },
  resolution: { type: String, default: '' },
  demoTag: { type: String, default: null, index: true }
}, { timestamps: true });

vendorQualityDamageSchema.pre('save', async function (next) {
  if (!this.incidentCode) {
    try {
      const year = new Date().getFullYear();
      const c = await Counter.findByIdAndUpdate(`qc_dmg_${year}`, { $inc: { seq: 1 } }, { new: true, upsert: true });
      this.incidentCode = `DMG-${year}-${String(c.seq).padStart(4, '0')}`;
    } catch (err) { console.error('incidentCode error:', err); }
  }
  next();
});

vendorQualityDamageSchema.index({ vendorId: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('VendorQualityDamage', vendorQualityDamageSchema);
