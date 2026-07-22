#!/usr/bin/env node
/**
 * Idempotent index creation for high-traffic collections.
 * Run on deploy: node scripts/ensureProductionIndexes.js
 */
require('dotenv').config();
const mongoose = require('mongoose');

const specs = [
  { model: 'User', indexes: [{ email: 1 }, { createdAt: -1 }] },
  { model: 'Opportunity', indexes: [{ createdAt: -1 }, { status: 1, 'awardedTo.vendorId': 1 }] },
  { model: 'CrmEnquiry', indexes: [{ status: 1, createdAt: -1 }, { phone: 1 }, { email: 1 }] },
  { model: 'VendorKYC', indexes: [{ vendorId: 1 }], options: { unique: true, sparse: true } },
  { model: 'VendorSession', indexes: [{ vendorId: 1, isActive: 1 }] },
  { model: 'KYCAuditLog', indexes: [{ entityId: 1, createdAt: -1 }] },
  { model: 'DigiLockerSession', indexes: [{ entityId: 1, createdAt: -1 }] },
  { model: 'ServiceRequest', indexes: [{ status: 1, createdAt: -1 }, { assignedVendorId: 1 }] },
  { model: 'VerificationRequest', indexes: [{ overallStatus: 1, updatedAt: -1 }] },
  { model: 'Worker', indexes: [{ vendorId: 1, approvalStatus: 1 }] },
  { model: 'Engineer', indexes: [{ vendorId: 1, approvalStatus: 1 }, { createdAt: -1 }] }
];

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI required');
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGODB_URI, { maxPoolSize: 5 });
  for (const { model, indexes, options } of specs) {
    try {
      const M = require(`../models/${model}`);
      for (const keys of indexes) {
        await M.collection.createIndex(keys, options || {});
        console.log(`OK ${model}`, JSON.stringify(keys));
      }
    } catch (e) {
      console.warn(`SKIP ${model}:`, e.message);
    }
  }
  await mongoose.disconnect();
  console.log('Index ensure complete.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
