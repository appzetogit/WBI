const mongoose = require('mongoose');

const counterSchema = new mongoose.Schema({ _id: String, seq: { type: Number, default: 0 } });
const Counter = mongoose.models.Counter || mongoose.model('Counter', counterSchema);

const serviceHistorySchema = new mongoose.Schema({
  action: String,
  date: Date,
  engineer: String,
  notes: String
}, { _id: false });

const vendorResourceInstalledAssetSchema = new mongoose.Schema({
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true, index: true },
  assetCode: { type: String, unique: true, index: true },
  name: { type: String, required: true, trim: true },
  assetType: { type: String, required: true },
  serviceCategoryCode: { type: String, required: true, index: true },
  serviceCategoryName: { type: String, default: '' },
  clientName: { type: String, default: '' },
  siteName: { type: String, default: '' },
  projectName: { type: String, default: '' },
  projectCode: { type: String, default: '' },
  serialNumber: { type: String, default: '' },
  installationDate: Date,
  warrantyExpiry: Date,
  installedBy: { type: String, default: '' },
  city: { type: String, default: '' },
  status: {
    type: String,
    enum: ['installed', 'inspection', 'maintenance', 'repair', 'replacement', 'retired'],
    default: 'installed',
    index: true
  },
  serviceHistory: [serviceHistorySchema],
  demoTag: { type: String, default: null, index: true }
}, { timestamps: true });

vendorResourceInstalledAssetSchema.pre('save', async function (next) {
  if (!this.assetCode) {
    try {
      const year = new Date().getFullYear();
      const counter = await Counter.findByIdAndUpdate(
        `res_asset_${year}`,
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
      );
      this.assetCode = `AST-${year}-${String(counter.seq).padStart(4, '0')}`;
    } catch (err) {
      console.error('assetCode error:', err);
    }
  }
  next();
});

vendorResourceInstalledAssetSchema.index({ vendorId: 1, status: 1 });
vendorResourceInstalledAssetSchema.index({ vendorId: 1, serviceCategoryCode: 1 });

module.exports = mongoose.model('VendorResourceInstalledAsset', vendorResourceInstalledAssetSchema);
