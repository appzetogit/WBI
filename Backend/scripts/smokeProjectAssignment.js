/**
 * Smoke checklist for project assignment (run with API + Redis + Mongo up).
 *
 * 1. node scripts/seedProjectAssignmentConfig.js
 * 2. Set FREELANCER_POOL_VENDOR_ID or admin PUT /api/admin/assignment-configs/DEFAULT
 * 3. Submit dynamic service request OR legacy enquiry → confirm Opportunity + vendor queue
 * 4. Vendor decline chain → freelancer_pool phase + engineer GET /api/engineers/freelancer-pool/pool
 * 5. Freelancer accept with team size → projectId in response, ServiceRequest Assigned
 * 6. User GET /api/public/service-requests/:requestCode/assignment timeline updates
 *
 * Usage: node scripts/smokeProjectAssignment.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const ProjectAssignmentConfig = require('../models/ProjectAssignmentConfig');

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI required');
    process.exit(1);
  }
  await mongoose.connect(uri);
  const cfg = await ProjectAssignmentConfig.findOne({ categoryCode: 'DEFAULT' }).lean();
  const envPool = process.env.FREELANCER_POOL_VENDOR_ID || '(not set)';
  console.log('DEFAULT config:', cfg ? 'found' : 'MISSING — run seedProjectAssignmentConfig.js');
  console.log('FREELANCER_POOL_VENDOR_ID:', envPool);
  console.log('REDIS_ENABLED:', process.env.REDIS_ENABLED || 'false');
  if (!cfg) process.exitCode = 1;
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
