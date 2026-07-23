const mongoose = require('mongoose');

const methodItemSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      enum: ['upi', 'card', 'netbanking', 'wallet', 'cod', 'emi', 'international'],
      required: true
    },
    enabled: { type: Boolean, default: true },
    label: { type: String, required: true },
    sortOrder: { type: Number, default: 0 },
    minAmount: { type: Number, default: 0 },
    maxAmount: { type: Number, default: null },
    allowedCategories: [{ type: String }],
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { _id: false }
);

const paymentMethodConfigSchema = new mongoose.Schema(
  {
    singletonKey: { type: String, default: 'default', unique: true },
    gateway: {
      provider: { type: String, default: 'razorpay', enum: ['razorpay'] },
      webhookConfigured: { type: Boolean, default: false },
      publicKeyId: { type: String, default: null },
      verificationAmount: { type: Number, default: 1 }
    },
    methods: [methodItemSchema],
    cod: {
      enabled: { type: Boolean, default: true },
      minOrderAmount: { type: Number, default: 0 },
      maxOrderAmount: { type: Number, default: null },
      allowedCities: [{ type: String }],
      allowedCategories: [{ type: String }],
      verificationNote: {
        type: String,
        default: 'We will debit ₹1 to verify a new payment method. This will be refunded after verification.'
      }
    },
    fraud: {
      maxFailedAttempts: { type: Number, default: 5 },
      velocityLimitPerHour: { type: Number, default: 20 },
      blockOnHighRisk: { type: Boolean, default: true }
    }
  },
  { timestamps: true }
);

const DEFAULT_METHODS = [
  { key: 'upi', enabled: true, label: 'UPI', sortOrder: 1 },
  { key: 'card', enabled: true, label: 'Credit / Debit Cards', sortOrder: 2 },
  { key: 'wallet', enabled: true, label: 'Wallets', sortOrder: 3 },
  { key: 'netbanking', enabled: true, label: 'Net Banking', sortOrder: 4 },
  { key: 'cod', enabled: true, label: 'Cash on Delivery', sortOrder: 5 },
  { key: 'emi', enabled: false, label: 'EMI / BNPL', sortOrder: 6 },
  { key: 'international', enabled: false, label: 'International Cards', sortOrder: 7 }
];

paymentMethodConfigSchema.statics.getOrCreate = async function getOrCreate() {
  let doc = await this.findOne({ singletonKey: 'default' });
  if (!doc) {
    doc = await this.create({
      singletonKey: 'default',
      methods: DEFAULT_METHODS,
      gateway: {
        provider: 'razorpay',
        publicKeyId: process.env.RAZORPAY_KEY_ID || null,
        verificationAmount: 1,
        webhookConfigured: !!process.env.RAZORPAY_WEBHOOK_SECRET
      }
    });
  }
  return doc;
};

module.exports = mongoose.model('PaymentMethodConfig', paymentMethodConfigSchema);
module.exports.DEFAULT_METHODS = DEFAULT_METHODS;
