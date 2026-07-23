const mongoose = require('mongoose');

const razorpayWebhookEventSchema = new mongoose.Schema(
  {
    eventId: { type: String, required: true, unique: true },
    event: { type: String, required: true, index: true },
    payload: { type: mongoose.Schema.Types.Mixed, default: {} },
    status: {
      type: String,
      enum: ['processed', 'ignored', 'failed'],
      default: 'processed'
    },
    error: { type: String, default: null }
  },
  { timestamps: true }
);

module.exports = mongoose.model('RazorpayWebhookEvent', razorpayWebhookEventSchema);
