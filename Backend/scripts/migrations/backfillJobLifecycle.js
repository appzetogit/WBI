/**
 * Backfill for the vendor-management upgrade. Safe to re-run (idempotent).
 *
 *   node scripts/migrations/backfillJobLifecycle.js            # dry run (default): reports only
 *   node scripts/migrations/backfillJobLifecycle.js --apply    # writes
 *
 * What it does:
 *   1. B2BJob: persist `source` (every pre-existing B2BJob came from the B2B
 *      portal / bulk upload → 'B2B'), canonical `lifecycleStatus` derived from
 *      the legacy status, `serviceKey` resolved from the catalog, normalised
 *      `assignmentType`, and `slaDueAt` (createdAt + slaTarget hours).
 *   2. JobAssignment: open one history row for every job an engineer currently
 *      holds, so reassign/reject history is complete from now on.
 *   3. VendorServiceCoverage: seed coverage for approved vendors from their
 *      approved services × declared working cities (+ address city/pincode),
 *      only where no coverage row exists yet. Without this, coverage-based
 *      routing would offer no job to any existing vendor.
 *
 * Prints the target database host first. Point MONGODB_URI at the database
 * you intend to migrate.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const mongoose = require('mongoose');

const APPLY = process.argv.includes('--apply');

const B2BJob = require('../../models/B2BJob');
const Vendor = require('../../models/Vendor');
const ServiceConfig = require('../../models/ServiceConfig');
const JobAssignment = require('../../models/JobAssignment');
const VendorServiceCoverage = require('../../models/VendorServiceCoverage');
const { deriveLifecycleFromLegacy, LIFECYCLE: S } = require('../../services/jobStateMachine');
const { pickCategoryFromConfigs } = require('../../utils/createOpportunityFromEnquiry');

const HOLDING_STATES = [S.ASSIGNED, S.ACCEPTED, S.EN_ROUTE, S.ARRIVED, S.IN_PROGRESS, S.COMPLETED, S.VERIFICATION, S.ON_HOLD];

const run = async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set');
  const host = (uri.split('@')[1] || uri.replace(/^mongodb(\+srv)?:\/\//, '')).split('/')[0];
  console.log(`[backfill] target: ${host} | mode: ${APPLY ? 'APPLY (writes)' : 'DRY RUN (no writes)'}`);
  await mongoose.connect(uri, { readPreference: 'primary' });

  const catalog = await ServiceConfig.find({ isActive: true, status: { $ne: 'archived' } })
    .select('_id categoryCode categoryName matchAliases subCategories')
    .lean();

  // ── 1. Jobs ──────────────────────────────────────────────────────────────
  const stats = { jobsScanned: 0, jobsUpdated: 0, byState: {}, unresolvedService: 0, assignmentsOpened: 0, coverageSeeded: 0 };
  const cursor = B2BJob.find({
    $or: [
      { source: { $exists: false } },
      { lifecycleStatus: { $exists: false } },
      { serviceKey: { $in: [null, undefined] } },
      { slaDueAt: null }
    ]
  }).lean().cursor();

  for await (const job of cursor) {
    stats.jobsScanned += 1;
    const set = {};
    if (!job.source) set.source = 'B2B';
    if (!job.lifecycleStatus) {
      set.lifecycleStatus = deriveLifecycleFromLegacy(job);
      set.lifecycleUpdatedAt = job.updatedAt || new Date();
    }
    const state = set.lifecycleStatus || job.lifecycleStatus;
    stats.byState[state] = (stats.byState[state] || 0) + 1;
    if (!job.serviceKey) {
      const key = pickCategoryFromConfigs([job.service, job.subService].filter(Boolean).join(' '), catalog);
      if (key) {
        set.serviceKey = key;
        const cfg = catalog.find((c) => c.categoryCode === key);
        if (cfg) set.serviceConfigId = cfg._id;
      } else {
        stats.unresolvedService += 1;
      }
    }
    if (!job.slaDueAt && job.createdAt) {
      set.slaDueAt = new Date(new Date(job.createdAt).getTime() + (Number(job.slaTarget) || 24) * 3600 * 1000);
    }
    const normalizedType = job.assignedTo ? (job.assignedVendorId ? 'vendor_engineer' : 'freelancer') : 'unassigned';
    if (job.assignmentType !== normalizedType) set.assignmentType = normalizedType;

    if (Object.keys(set).length) {
      stats.jobsUpdated += 1;
      if (APPLY) {
        await B2BJob.updateOne({ _id: job._id }, { $set: set }, { lifecycleManaged: true });
      }
    }

    // ── 2. Open assignment history row for jobs an engineer holds ──────────
    if (job.assignedTo && HOLDING_STATES.includes(state)) {
      const open = await JobAssignment.exists({ jobId: job._id, isOpen: true });
      if (!open) {
        stats.assignmentsOpened += 1;
        if (APPLY) {
          await JobAssignment.create({
            jobId: job._id,
            jobCode: job.jobId,
            assignmentType: job.assignedVendorId ? 'vendor_engineer' : 'freelancer',
            vendorId: job.assignedVendorId || null,
            engineerId: job.assignedTo,
            engineerName: job.assignedToName || '',
            assignedBy: { actorId: null, role: 'system' },
            routingMode: 'auto',
            reason: 'Backfilled from pre-existing assignment',
            status: state === S.ASSIGNED ? 'assigned' : 'accepted',
            assignedAt: job.assignedAt || job.updatedAt || new Date(),
            acceptedAt: job.acceptedAt || null
          }).catch((err) => {
            if (err.code !== 11000) throw err;
          });
        }
      }
    }
  }

  // ── 3. Vendor coverage seed ────────────────────────────────────────────
  const vendors = await Vendor.find({ approvalStatus: 'approved' })
    .select('businessName approvedServices workingCities operatingCities operationalCities address')
    .lean();
  const catalogKeys = new Map(catalog.map((c) => [c.categoryCode, c]));
  for (const v of vendors) {
    const cities = [...new Set([
      ...(v.workingCities || []), ...(v.operatingCities || []), ...(v.operationalCities || []), v.address?.city
    ].map((c) => String(c || '').trim().toLowerCase()).filter(Boolean))];
    const pins = [v.address?.pincode].map((p) => String(p || '').replace(/[^0-9]/g, '')).filter((p) => p.length === 6);
    if (!cities.length && !pins.length) continue;
    for (const svc of v.approvedServices || []) {
      const key = String(svc.categoryCode || '').toUpperCase();
      if (!key || svc.status === 'suspended' || !catalogKeys.has(key)) continue;
      const exists = await VendorServiceCoverage.exists({ vendorId: v._id, serviceKey: key });
      if (exists) continue;
      stats.coverageSeeded += 1;
      if (APPLY) {
        await VendorServiceCoverage.create({
          vendorId: v._id,
          serviceKey: key,
          serviceName: catalogKeys.get(key).categoryName,
          serviceConfigId: catalogKeys.get(key)._id,
          coverageCities: cities,
          coveragePincodes: pins,
          active: true,
          updatedBy: { actorId: null, role: 'system' }
        }).catch((err) => {
          if (err.code !== 11000) throw err;
        });
      }
    }
  }

  console.log('[backfill] result:', JSON.stringify(stats, null, 2));
  if (!APPLY) console.log('[backfill] dry run only — re-run with --apply to write these changes.');
  await mongoose.disconnect();
};

// The catalog helpers pull in modules that open queue connections; exit
// explicitly so the script never lingers after finishing.
run()
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error('[backfill] failed:', err);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  });
