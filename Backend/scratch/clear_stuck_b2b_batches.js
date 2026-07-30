/**
 * Clear stuck B2B bulk batches left in `processing` / `validating` after a crash.
 *
 * Dry-run (default):
 *   node scratch/clear_stuck_b2b_batches.js
 *
 * Apply:
 *   node scratch/clear_stuck_b2b_batches.js --apply
 *
 * Optional filters:
 *   --company=<mongoId>   only that company
 *   --older-than-min=30   only batches stuck longer than N minutes (default 15)
 */
require('dotenv').config();
const mongoose = require('mongoose');

(async () => {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const companyArg = args.find((a) => a.startsWith('--company='));
  const olderArg = args.find((a) => a.startsWith('--older-than-min='));
  const companyId = companyArg ? companyArg.split('=')[1] : null;
  const olderMin = olderArg ? parseInt(olderArg.split('=')[1], 10) : 15;

  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI missing in env');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  const B2BBatch = require('../models/B2BBatch');

  const cutoff = new Date(Date.now() - olderMin * 60 * 1000);
  const filter = {
    status: { $in: ['processing', 'validating'] },
    updatedAt: { $lte: cutoff }
  };
  if (companyId) filter.companyId = companyId;

  const stuck = await B2BBatch.find(filter)
    .select('batchId fileName status companyId validRows invalidRows createdJobsCount updatedAt failureReason')
    .lean();

  console.log(`Found ${stuck.length} stuck batch(es) older than ${olderMin} min:`);
  for (const b of stuck) {
    console.log({
      _id: String(b._id),
      batchId: b.batchId,
      fileName: b.fileName,
      status: b.status,
      companyId: String(b.companyId),
      validRows: b.validRows,
      invalidRows: b.invalidRows,
      createdJobsCount: b.createdJobsCount,
      updatedAt: b.updatedAt
    });
  }

  if (!apply) {
    console.log('\nDry-run only. Re-run with --apply to mark these as failed.');
    await mongoose.disconnect();
    process.exit(0);
  }

  if (stuck.length === 0) {
    console.log('Nothing to update.');
    await mongoose.disconnect();
    process.exit(0);
  }

  const result = await B2BBatch.updateMany(filter, {
    $set: {
      status: 'failed',
      failedAt: new Date(),
      failureReason: 'Marked failed by clear_stuck_b2b_batches.js (batch was stuck in processing/validating).'
    }
  });

  console.log(`Updated ${result.modifiedCount} batch(es) to status=failed.`);
  await mongoose.disconnect();
  process.exit(0);
})().catch(async (err) => {
  console.error(err);
  try { await mongoose.disconnect(); } catch (_) { /* ignore */ }
  process.exit(1);
});
