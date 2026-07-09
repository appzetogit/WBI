const mongoose = require('mongoose');

const engineerRatingSchema = new mongoose.Schema({
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'B2BCompany',
    required: true,
    index: true
  },
  engineerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Engineer',
    required: true,
    index: true
  },
  jobId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'B2BJob',
    required: true,
    index: true
  },
  metrics: {
    behavior: { type: Number, min: 1, max: 5, required: true },
    slaAdherence: { type: Number, min: 1, max: 5, required: true },
    toolsCarried: { type: Number, min: 1, max: 5, required: true },
    ethics: { type: Number, min: 1, max: 5, required: true }
  },
  averageRating: {
    type: Number,
    required: true
  },
  reviewText: {
    type: String,
    default: ''
  }
}, { timestamps: true });

module.exports = mongoose.model('EngineerRating', engineerRatingSchema);
