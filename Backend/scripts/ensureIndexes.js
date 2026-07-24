/**
 * Ensure critical MongoDB indexes for User App hot paths.
 * Run: node scripts/ensureIndexes.js
 */
require('dotenv').config();
const mongoose = require('mongoose');

const INDEXES = [
  { model: 'User', spec: { phone: 1 }, opts: { unique: true, sparse: true } },
  { model: 'User', spec: { email: 1 }, opts: { sparse: true } },
  { model: 'Booking', spec: { userId: 1, createdAt: -1 } },
  { model: 'Booking', spec: { status: 1, scheduledStartAt: 1 } },
  { model: 'Booking', spec: { workerId: 1, status: 1 } },
  { model: 'Cart', spec: { userId: 1 }, opts: { unique: true } },
  { model: 'Notification', spec: { userId: 1, isRead: 1, createdAt: -1 } },
  { model: 'RegistrationDraft', spec: { role: 1, draftKey: 1 }, opts: { unique: true } },
  { model: 'BookingDraft', spec: { userId: 1, status: 1, updatedAt: -1 } }
];

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI required');
    process.exit(1);
  }
  await mongoose.connect(uri);
  console.log('Connected — applying indexes...');

  for (const { model, spec, opts = {} } of INDEXES) {
    try {
      const M = require(`../models/${model}`);
      const name = await M.collection.createIndex(spec, opts);
      console.log(`✓ ${model} ${JSON.stringify(spec)} → ${name}`);
    } catch (err) {
      console.warn(`⚠ ${model} ${JSON.stringify(spec)}: ${err.message}`);
    }
  }

  await mongoose.disconnect();
  console.log('Done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
