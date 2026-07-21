/**
 * Seed default assignment rules (idempotent).
 * Run: node Backend/scripts/seedProjectAssignmentConfig.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const ProjectAssignmentConfig = require('../models/ProjectAssignmentConfig');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
  await ProjectAssignmentConfig.findOneAndUpdate(
    { categoryCode: 'DEFAULT' },
    {
      categoryCode: 'DEFAULT',
      label: 'Global default — vendor first, freelancer after exhaustion',
      isActive: true,
      vendorResponseTimeoutMinutes: 120,
      maxVendorsToNotify: 10,
      vendorRetryCount: 3,
      priorityMode: 'vendor_then_freelancer',
      releaseToFreelancerOnVendorExhausted: true,
      scoringWeights: {
        location: 30,
        service: 25,
        capacity: 20,
        rating: 15,
        responseScore: 10
      }
    },
    { upsert: true, new: true }
  );
  console.log('DEFAULT ProjectAssignmentConfig ready');
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
