/**
 * Backfill RegistrationTemplate + DashboardConfiguration for all ServiceConfigs.
 * Run: node scripts/seedSmsDefaults.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const ServiceConfig = require('../models/ServiceConfig');
const { ensureRegistrationAndDashboardDefaults } = require('../services/publishServiceCatalog.service');

(async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set');
  await mongoose.connect(uri, { family: 4, serverSelectionTimeoutMS: 30000 });

  const configs = await ServiceConfig.find({}).lean();
  let n = 0;
  for (const cfg of configs) {
    // Normalize status for older docs
    if (!cfg.status) {
      await ServiceConfig.updateOne(
        { _id: cfg._id },
        {
          $set: {
            status: cfg.isActive === false ? 'inactive' : 'active',
            version: cfg.version || 1,
            serviceType: cfg.serviceType || 'hybrid'
          }
        }
      );
    }
    await ensureRegistrationAndDashboardDefaults(cfg);
    n += 1;
    console.log('OK', cfg.categoryCode);
  }
  console.log(`Seeded SMS defaults for ${n} services`);
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
