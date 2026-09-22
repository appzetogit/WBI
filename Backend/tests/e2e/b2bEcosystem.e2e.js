/**
 * End-to-end test — B2B operational ecosystem (5 acceptance scenarios).
 *
 * Runs against a RUNNING backend and seeds its database directly. It refuses
 * to run against anything that is not on localhost: it wipes the database it
 * is pointed at.
 *
 *   E2E_BASE_URL     backend base URL          (default http://127.0.0.1:5055)
 *   E2E_MONGODB_URI  the backend's database    (required, localhost only)
 *   E2E_JWT_SECRET   the backend's JWT_SECRET  (required; used to mint test tokens)
 *
 * Scenarios:
 *   1. Bulk upload end to end — validation counts, error report, pricing
 *      preview, wallet reservation, job creation, routing split, one lifecycle
 *      to CLOSED seen identically by B2B / Vendor / Admin, charge + audit.
 *   2. Insufficient wallet — dispatch is blocked with required / available /
 *      shortfall and top-up methods; after a top-up the same upload runs.
 *   3. Routing eligibility — only vendors whose coverage and skills match are
 *      offered the job; the rest never see it.
 *   4. Freelancer path — only eligible freelancers are asked, acceptance is
 *      visible to the company, and an unanswered request expires and moves on.
 *   5. Security — cross-tenant reads/writes between two B2B companies, two
 *      vendors and two engineers, plus B2B role permissions.
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const FormData = require('form-data');

const BASE = process.env.E2E_BASE_URL || 'http://127.0.0.1:5055';
const MONGO = process.env.E2E_MONGODB_URI;
const SECRET = process.env.E2E_JWT_SECRET;

const isLocal = (u) => /^(mongodb:\/\/|https?:\/\/)(127\.0\.0\.1|localhost)[:/]/.test(String(u || ''));
if (!MONGO || !SECRET) {
  console.error('E2E_MONGODB_URI and E2E_JWT_SECRET are required');
  process.exit(2);
}
if (!isLocal(MONGO) || !isLocal(BASE)) {
  console.error(`Refusing to run: E2E targets must be localhost (got ${BASE} / ${MONGO.split('@').pop()})`);
  process.exit(2);
}

const M = (name) => require(path.join(__dirname, '../../models', name));

// ── tiny test harness ──────────────────────────────────────────────────────
const results = [];
let currentScenario = '';
const check = (name, cond, detail = '') => {
  results.push({ scenario: currentScenario, name, ok: Boolean(cond), detail: cond ? '' : detail });
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : `  ← ${detail}`}`);
};
const scenario = (title) => {
  currentScenario = title;
  console.log(`\n=== ${title} ===`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (fn, { timeout = 30000, interval = 400, label = 'condition' } = {}) => {
  const start = Date.now();
  let last;
  while (Date.now() - start < timeout) {
    last = await fn();
    if (last) return last;
    await sleep(interval);
  }
  throw new Error(`Timed out waiting for ${label}`);
};

const tokenFor = (role, id) => jwt.sign({ userId: String(id), role }, SECRET, { expiresIn: '2h' });
const client = (token) => {
  const instance = axios.create({
    baseURL: `${BASE}/api`,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    validateStatus: () => true,
    timeout: 60000
  });
  instance.interceptors.response.use(async (response) => {
    const cfg = response.config;
    if (response.status === 429 && (cfg.__retries || 0) < 15) {
      cfg.__retries = (cfg.__retries || 0) + 1;
      await sleep(5000);
      return instance.request(cfg);
    }
    return response;
  });
  return instance;
};

// ── fixtures ───────────────────────────────────────────────────────────────
const INDORE = { lat: 22.7196, lng: 75.8577 };
const BHOPAL = { lat: 23.2599, lng: 77.4126 };
const GWALIOR = { lat: 26.2183, lng: 78.1828 };

const HEADER = [
  'Customer Name', 'Contact Number', 'Service Address', 'City', 'State', 'Pincode',
  'Service Type', 'Service Key', 'Required Skill', 'Customer ID', 'Asset ID',
  'Asset Model', 'Serial Number', 'Priority', 'Preferred Date', 'Preferred Time',
  'Description', 'Special Instructions', 'Latitude', 'Longitude'
].join(',');

const jobRow = (i, over = {}) => ([
  over.name !== undefined ? over.name : `Store ${i} Manager`,
  over.phone || `9876${String(500000 + i).padStart(6, '0')}`,
  over.address || `Shop ${i}, Vijay Nagar`,
  over.city || 'Indore',
  'Madhya Pradesh',
  over.pincode || '452001',
  'AC Repair',
  over.serviceKey || 'AC_REPAIR',
  'AC Repair',
  `CUST-${i}`,
  `AST-${i}`,
  'LG-1.5T',
  `SN-${i}`,
  over.priority || 'Medium',
  '25/10/2026',
  '10:00-12:00',
  'Unit not cooling',
  'Report to the security desk',
  over.lat ?? (INDORE.lat + i * 0.0005),
  over.lng ?? (INDORE.lng + i * 0.0005)
]);

const writeCsv = (name, rows) => {
  const file = path.join(os.tmpdir(), name);
  fs.writeFileSync(
    file,
    [HEADER, ...rows.map((r) => r.map((c) => (String(c).includes(',') ? `"${c}"` : c)).join(','))].join('\n')
  );
  return file;
};

const seed = async () => {
  const db = mongoose.connection.db;
  await db.dropDatabase();
  await Promise.all(
    ['B2BJob', 'JobAssignment', 'VendorServiceCoverage', 'Engineer', 'VendorWorkforceEngineer', 'B2BWalletTransaction', 'B2BBulkUploadRow']
      .map((m) => M(m).syncIndexes())
  );

  const admin = await M('Admin').create({
    name: 'B2B E2E Admin', email: 'b2b.e2e.admin@example.test',
    password: 'Passw0rd!e2e', role: 'super_admin', isActive: true
  });

  const ServiceConfig = M('ServiceConfig');
  await ServiceConfig.create({
    categoryCode: 'AC_REPAIR',
    categoryName: 'AC Repair',
    matchAliases: ['AC', 'Air Conditioner'],
    subCategories: [{ subCatCode: 'AC_GAS', subCatName: 'Gas Refill' }],
    slaRules: [{ key: 'medium', label: 'Standard', responseMinutes: 60, resolutionHours: 24 }],
    requiredSkills: ['AC Repair'],
    isActive: true,
    status: 'active'
  });
  await ServiceConfig.create({ categoryCode: 'PLUMBING', categoryName: 'Plumbing', isActive: true, status: 'active' });

  const B2BCompany = M('B2BCompany');
  const mkCompany = (n, over = {}) => B2BCompany.create({
    companyName: `E2E Company ${n}`,
    gstNumber: `23ABCDE123${n}F1Z5`,
    panNumber: `ABCDE123${n}F`,
    tanNumber: `BPLE1234${n}A`,
    companyAddress: 'MG Road, Indore',
    billingAddress: 'MG Road, Indore',
    authorizedPerson: { name: `Owner ${n}`, designation: 'Facilities', email: `owner${n}@example.test`, phone: `90000000${n}1` },
    email: `e2e.company${n}@example.test`,
    phone: `900000${n}002`,
    passwordHash: 'not-used-in-e2e',
    verificationStatus: 'approved',
    accountStatus: 'ACTIVE',
    isActive: true,
    ...over
  });
  const companyA = await mkCompany(1);
  const companyB = await mkCompany(2);

  await M('B2BWallet').create({ companyId: companyA._id, balance: 500000, escrowBalance: 0 });
  // Deliberately short of what a 40-job upload costs, for scenario 2.
  await M('B2BWallet').create({ companyId: companyB._id, balance: 20000, escrowBalance: 0 });

  // A default matrix price keyed on the service key, as the spec requires.
  await M('B2BPricingRule').create({
    name: 'AC Repair — default matrix',
    level: 'DEFAULT',
    serviceKey: 'AC_REPAIR',
    baseAmount: 1000,
    priorityCharges: { Low: 0, Medium: 0, High: 250 },
    taxPercent: 18,
    isActive: true
  });

  const Vendor = M('Vendor');
  const vendorA = await Vendor.create({
    name: 'Arjun Mehta', businessName: 'Indore Cooling Services', email: 'b2b.vendor.a@example.test', phone: '9100000001',
    approvalStatus: 'approved', isActive: true, workingCities: ['Indore'],
    approvedServices: [{ categoryCode: 'AC_REPAIR', categoryName: 'AC Repair', status: 'active' }]
  });
  const vendorB = await Vendor.create({
    name: 'Bhavna Rao', businessName: 'Bhopal AC Experts', email: 'b2b.vendor.b@example.test', phone: '9100000002',
    approvalStatus: 'approved', isActive: true, workingCities: ['Bhopal'],
    approvedServices: [{ categoryCode: 'AC_REPAIR', categoryName: 'AC Repair', status: 'active' }]
  });

  const Engineer = M('Engineer');
  const at = ({ lat, lng }, d = 0) => ({ type: 'Point', coordinates: [lng + d, lat + d] });
  const mkEng = (o) => Engineer.create({
    roleType: 'Engineer', approvalStatus: 'approved', verificationStatus: 'approved',
    isActive: true, status: 'ONLINE', ...o
  });
  const rahul = await mkEng({ name: 'Rahul Verma', phone: '9200000001', engineerType: 'vendor_engineer', vendorId: vendorA._id, vendorApprovalStatus: 'approved', serviceCategories: ['AC Repair'], primarySkill: 'AC Repair', address: { city: 'Indore' }, geoLocation: at(INDORE, 0.01) });
  const amit = await mkEng({ name: 'Amit Joshi', phone: '9200000002', engineerType: 'vendor_engineer', vendorId: vendorA._id, vendorApprovalStatus: 'approved', serviceCategories: ['AC Repair'], primarySkill: 'AC Repair', address: { city: 'Indore' }, geoLocation: at(INDORE, 0.02) });
  const vikram = await mkEng({ name: 'Vikram Singh', phone: '9200000004', engineerType: 'vendor_engineer', vendorId: vendorB._id, vendorApprovalStatus: 'approved', serviceCategories: ['AC Repair'], primarySkill: 'AC Repair', address: { city: 'Bhopal' }, geoLocation: at(BHOPAL) });
  // Freelancers: one near Indore (eligible), one in Gwalior with the wrong skill.
  const farah = await mkEng({ name: 'Farah Khan', phone: '9200000006', engineerType: 'freelancer', serviceCategories: ['AC Repair'], primarySkill: 'AC Repair', address: { city: 'Indore' }, geoLocation: at(INDORE, 0.02) });
  const gopal = await mkEng({ name: 'Gopal Rao', phone: '9200000007', engineerType: 'freelancer', serviceCategories: ['Plumbing'], primarySkill: 'Plumbing', address: { city: 'Gwalior' }, geoLocation: at(GWALIOR) });

  return { admin, companyA, companyB, vendorA, vendorB, rahul, amit, vikram, farah, gopal };
};

// ── shared helpers ─────────────────────────────────────────────────────────
const upload = async (api, file) => {
  const form = new FormData();
  form.append('file', fs.createReadStream(file), { filename: path.basename(file), contentType: 'text/csv' });
  const res = await api.post('/b2b/bulk-jobs/upload', form, { headers: form.getHeaders() });
  if (res.status !== 201) throw new Error(`upload failed ${res.status}: ${JSON.stringify(res.data)}`);
  const id = res.data.batch.id;
  const done = await waitFor(async () => {
    const r = await api.get(`/b2b/bulk-jobs/${id}`);
    return ['validated', 'failed'].includes(r.data?.batch?.status) ? r.data : null;
  }, { timeout: 120000, label: 'validation' });
  return { id, batch: done.batch, preview: done.preview };
};

const confirmAndWait = async (api, id) => {
  const res = await api.post(`/b2b/bulk-jobs/confirm/${id}`);
  if (res.status !== 200) return { res, batch: null };
  const batch = await waitFor(async () => {
    const r = await api.get(`/b2b/bulk-jobs/${id}`);
    return ['completed', 'failed', 'paused'].includes(r.data?.batch?.status) ? r.data.batch : null;
  }, { timeout: 120000, label: 'job creation' });
  return { res, batch };
};

const run = async () => {
  await mongoose.connect(MONGO);
  const fx = await seed();

  const adminApi = client(tokenFor('ADMIN', fx.admin._id));
  const a = client(tokenFor('B2B', fx.companyA._id));
  const b = client(tokenFor('B2B', fx.companyB._id));
  const vendorAApi = client(tokenFor('VENDOR', fx.vendorA._id));
  const vendorBApi = client(tokenFor('VENDOR', fx.vendorB._id));
  const rahulApi = client(tokenFor('ENGINEER', fx.rahul._id));
  const vikramApi = client(tokenFor('ENGINEER', fx.vikram._id));
  const farahApi = client(tokenFor('ENGINEER', fx.farah._id));

  const B2BJob = M('B2BJob');
  const Txn = M('B2BWalletTransaction');

  // Vendor A covers Indore; vendor B covers Bhopal only.
  const coverageA = await vendorAApi.post(`/vendors/${fx.vendorA._id}/service-areas`, {
    action: 'add', serviceKeys: ['AC_REPAIR'], cities: ['Indore'], pincodes: ['452001', '452010']
  });
  const coverageB = await vendorBApi.post(`/vendors/${fx.vendorB._id}/service-areas`, {
    action: 'add', serviceKeys: ['AC_REPAIR'], cities: ['Bhopal'], pincodes: ['462001']
  });
  if (coverageA.status !== 200 || coverageB.status !== 200) {
    throw new Error(`vendor coverage setup failed: ${coverageA.status}/${coverageB.status} ${JSON.stringify(coverageA.data)}`);
  }

  // ════════════════════════════════════════════════════════════════════════
  scenario('Scenario 1 — bulk upload → validate → price → reserve → create → route → close');

  const rows = [];
  for (let i = 1; i <= 20; i++) rows.push(jobRow(i));
  // Four rows that must be rejected, and one that duplicates row 1.
  rows.push(jobRow(21, { phone: '12345' }));
  rows.push(jobRow(22, { pincode: '45200' }));
  rows.push(jobRow(23, { serviceKey: 'NOT_A_KEY' }));
  rows.push(jobRow(24, { name: '' }));
  rows.push(jobRow(1));

  const file1 = writeCsv(`b2b-e2e-main-${Date.now()}.csv`, rows);
  const up1 = await upload(a, file1);

  check('every row of the file is parsed', up1.batch.totalRows === 25, `totalRows=${up1.batch.totalRows}`);
  check('valid / invalid / duplicate rows are counted separately',
    up1.batch.validRows === 20 && up1.batch.invalidRows === 5 && up1.batch.duplicates >= 1,
    JSON.stringify({ valid: up1.batch.validRows, invalid: up1.batch.invalidRows, dup: up1.batch.duplicates }));
  check('the preview states what the upload will cost',
    up1.preview.totalCost > 0 && up1.preview.totalCost === up1.batch.estimatedCost,
    JSON.stringify({ preview: up1.preview.totalCost, batch: up1.batch.estimatedCost }));
  check('the preview states the wallet position',
    up1.preview.wallet.available > 0 && up1.preview.wallet.shortfall === 0,
    JSON.stringify(up1.preview.wallet));

  const rowsRes = await a.get(`/b2b/bulk-jobs/${up1.id}/rows`, { params: { limit: 200 } });
  const rowData = rowsRes.data.data || [];
  check('every row is persisted with its outcome', rowsRes.data.pagination.total === 25, JSON.stringify(rowsRes.data.pagination));
  check('a rejected row names field, value, error and a fix',
    rowData.some((r) => (r.errors || []).some((e) => e.field && e.value && e.error && e.suggestedFix)),
    JSON.stringify(rowData.find((r) => (r.errors || []).length)?.errors));
  check('the duplicate row points at the row it duplicates',
    rowData.some((r) => r.status === 'DUPLICATE' && /row 1/.test(r.duplicateOf || '')),
    JSON.stringify(rowData.filter((r) => r.status === 'DUPLICATE').map((r) => r.duplicateOf)));
  check('valid rows are priced per row',
    rowData.filter((r) => r.price > 0).length === 20,
    String(rowData.filter((r) => r.price > 0).length));
  check('pricing comes from the matrix, not the frontend',
    rowData.filter((r) => r.pricingSource === 'DEFAULT').length === 20,
    JSON.stringify([...new Set(rowData.map((r) => r.pricingSource))]));

  const report = await a.get(`/b2b/bulk-jobs/errors/${up1.id}/download`, { responseType: 'arraybuffer' });
  check('the error report downloads', report.status === 200 && report.data.length > 0, String(report.status));

  const walletBefore = (await a.get('/b2b/wallet/summary')).data.data;
  const created = await confirmAndWait(a, up1.id);
  check('confirming a funded upload starts creation', created.res.status === 200, JSON.stringify(created.res.data).slice(0, 200));
  check('exactly the valid rows became jobs', created.batch?.createdJobsCount === 20, JSON.stringify({
    created: created.batch?.createdJobsCount, failed: created.batch?.failedJobs
  }));

  const walletAfter = (await a.get('/b2b/wallet/summary')).data.data;
  check('the upload total moved from available to reserved',
    Math.round(walletBefore.balance - walletAfter.balance) === Math.round(up1.batch.estimatedCost)
    && Math.round(walletAfter.escrowBalance - walletBefore.escrowBalance) === Math.round(up1.batch.estimatedCost),
    JSON.stringify({ before: walletBefore.balance, after: walletAfter.balance, reserved: walletAfter.escrowBalance }));

  const reservation = await Txn.findOne({
    companyId: fx.companyA._id, ledgerType: 'JOB_RESERVATION', reservationId: `BATCH-${created.batch.batchId}`
  }).lean();
  check('the reservation is one ledger row with balance snapshots',
    reservation && reservation.availableDelta === -Math.round(up1.batch.estimatedCost * 100) / 100
    && reservation.reservedDelta === Math.round(up1.batch.estimatedCost * 100) / 100
    && reservation.balanceAfter?.available === walletAfter.balance,
    JSON.stringify({ a: reservation?.availableDelta, r: reservation?.reservedDelta, snap: reservation?.balanceAfter }));

  const jobs = await B2BJob.find({ batchId: created.batch._id }).read('primary').sort({ jobId: 1 }).lean();
  check('every job records what paid for it',
    jobs.length === 20 && jobs.every((j) => j.walletReservationId && j.paymentReference && j.walletStatus === 'reserved'),
    JSON.stringify(jobs.slice(0, 2).map((j) => ({ w: j.walletReservationId, s: j.walletStatus }))));
  check('every job carries its price snapshot and SLA targets',
    jobs.every((j) => j.pricing?.totalAmount > 0 && j.sla?.resolutionDueAt),
    JSON.stringify(jobs.slice(0, 2).map((j) => ({ p: j.pricing?.totalAmount, sla: j.sla?.resolutionDueAt }))));
  check('every job carries the asset and instruction detail from the file',
    jobs.every((j) => j.asset?.assetId && j.customerRef && j.specialInstructions),
    JSON.stringify(jobs.slice(0, 1).map((j) => j.asset)));

  // Routing: vendor A covers Indore, so its queue fills.
  const vendorQueue = await waitFor(async () => {
    const r = await vendorAApi.get(`/vendors/${fx.vendorA._id}/jobs`, { params: { tab: 'new', limit: 50 } });
    return (r.data?.data || []).length >= 20 ? r.data.data : null;
  }, { timeout: 90000, label: 'vendor A offers' });
  check('the covering vendor is offered every job', vendorQueue.length === 20, String(vendorQueue.length));

  const vendorBQueue = await vendorBApi.get(`/vendors/${fx.vendorB._id}/jobs`, { params: { tab: 'new', limit: 50 } });
  check('a vendor that does not cover the area is offered nothing',
    (vendorBQueue.data?.data || []).length === 0,
    String((vendorBQueue.data?.data || []).length));

  const job1 = jobs[0];
  const accept = await vendorAApi.post(`/jobs/${job1._id}/accept`);
  check('vendor accepts → PENDING_ASSIGNMENT', accept.status === 200, JSON.stringify(accept.data).slice(0, 200));

  const assign = await vendorAApi.post(`/jobs/${job1._id}/assign`, { engineerId: fx.rahul._id });
  check('vendor assigns its engineer → ASSIGNED', assign.status === 200, JSON.stringify(assign.data).slice(0, 200));

  const assigned = await B2BJob.findById(job1._id).read('primary').lean();
  check('an assignment carries an acceptance deadline',
    Boolean(assigned.assignmentExpiresAt) && Boolean(assigned.sla?.acceptanceDueAt),
    JSON.stringify({ exp: assigned.assignmentExpiresAt, due: assigned.sla?.acceptanceDueAt }));

  const steps = [
    ['accept', () => rahulApi.post(`/engineers/b2b-jobs/${job1._id}/accept`, {}), 'ACCEPTED'],
    ['start travel', () => rahulApi.post(`/engineers/b2b-jobs/${job1._id}/start-travel`, {}), 'EN_ROUTE'],
    ['arrive', () => rahulApi.post(`/engineers/b2b-jobs/${job1._id}/arrive`, {}), 'ARRIVED'],
    ['start work', () => rahulApi.post(`/engineers/b2b-jobs/${job1._id}/start`, { startOtp: '123456', beforePhotos: ['https://example.test/b.jpg'] }), 'IN_PROGRESS'],
    ['complete', () => rahulApi.post(`/engineers/b2b-jobs/${job1._id}/complete`, { status: 'completed', afterPhotos: ['https://example.test/a.jpg'] }), 'VERIFICATION']
  ];
  for (const [label, call, expected] of steps) {
    const r = await call();
    const state = (await B2BJob.findById(job1._id).read('primary').lean()).lifecycleStatus;
    check(`engineer ${label} → ${expected}`, r.status === 200 && state === expected, `status=${r.status} state=${state}`);
  }

  // The same job, as each panel sees it.
  const [asB2B, asVendor, asAdmin] = await Promise.all([
    a.get(`/jobs/${job1._id}`),
    vendorAApi.get(`/jobs/${job1._id}`),
    adminApi.get(`/jobs/${job1._id}`)
  ]);
  const seen = [asB2B, asVendor, asAdmin].map((r) => r.data?.data?.overview?.status);
  check('B2B, Vendor and Admin see the same state',
    seen.every((v) => v === 'VERIFICATION'),
    JSON.stringify(seen));

  const close = await adminApi.post(`/admin/b2b/jobs/submissions/${job1._id}/approve`, { remarks: 'Photos verified' });
  const closed = await B2BJob.findById(job1._id).read('primary').lean();
  check('admin verification closes the job', close.status === 200 && closed.lifecycleStatus === 'CLOSED',
    `status=${close.status} state=${closed.lifecycleStatus}`);

  const charge = await waitFor(async () =>
    Txn.findOne({ companyId: fx.companyA._id, ledgerType: 'JOB_CHARGE', jobId: job1._id }).lean(),
    { timeout: 20000, label: 'job charge' }).catch(() => null);
  check('closing the job books the charge against the reservation',
    charge && charge.reservedDelta < 0 && charge.availableDelta === 0,
    JSON.stringify({ r: charge?.reservedDelta, a: charge?.availableDelta }));

  const reconcile = await adminApi.get(`/admin/b2b-wallets/${fx.companyA._id}/reconcile`);
  check('the wallet reconciles against its ledger',
    reconcile.data?.data?.balanced === true,
    JSON.stringify(reconcile.data?.data));

  const timeline = await adminApi.get(`/jobs/${job1._id}/timeline`);
  const events = (timeline.data?.data?.events || []).map((e) => e.to);
  check('the job keeps a complete, ordered history',
    ['ASSIGNED', 'ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS', 'COMPLETED', 'CLOSED'].every((s) => events.includes(s)),
    JSON.stringify(events));

  // ════════════════════════════════════════════════════════════════════════
  scenario('Scenario 2 — a wallet that cannot cover the upload blocks dispatch');

  const bigRows = [];
  for (let i = 100; i < 140; i++) bigRows.push(jobRow(i));
  const file2 = writeCsv(`b2b-e2e-short-${Date.now()}.csv`, bigRows);
  const up2 = await upload(b, file2);
  check('the upload is priced before payment', up2.preview.totalCost > 0, String(up2.preview.totalCost));

  const balanceB = (await b.get('/b2b/wallet/summary')).data.data;
  check('the company is short for this upload',
    up2.preview.totalCost > balanceB.balance && up2.preview.wallet.shortfall > 0,
    JSON.stringify({ cost: up2.preview.totalCost, balance: balanceB.balance, shortfall: up2.preview.wallet.shortfall }));

  const blocked = await b.post(`/b2b/bulk-jobs/confirm/${up2.id}`);
  check('dispatch is refused with 402', blocked.status === 402, String(blocked.status));
  check('the refusal states required, available and shortfall',
    blocked.data?.walletGate?.required === up2.preview.totalCost
    && blocked.data?.walletGate?.available === balanceB.balance
    && blocked.data?.walletGate?.shortfall > 0,
    JSON.stringify(blocked.data?.walletGate));
  check('the refusal offers configured top-up methods',
    (blocked.data?.topUpMethods || []).length > 0
    && blocked.data.topUpMethods.every((m) => m.key && m.label),
    JSON.stringify(blocked.data?.topUpMethods?.map((m) => m.key)));

  const noJobs = await B2BJob.countDocuments({ batchId: new mongoose.Types.ObjectId(up2.id) });
  check('no job was created for the unpaid upload', noJobs === 0, String(noJobs));

  const walletLedger = require(path.join(__dirname, '../../services/b2bWalletLedger.service'));
  await walletLedger.topUp({
    companyId: fx.companyB._id,
    amount: 200000,
    paymentMethod: 'BANK_TRANSFER',
    idempotencyKey: `e2e-topup-${Date.now()}`
  });

  const afterTopUp = await confirmAndWait(b, up2.id);
  check('the same upload runs once the wallet is topped up',
    afterTopUp.res.status === 200 && afterTopUp.batch?.createdJobsCount === bigRows.length,
    JSON.stringify({ status: afterTopUp.res.status, body: afterTopUp.res.data, created: afterTopUp.batch?.createdJobsCount }));

  const topUpRow = await Txn.findOne({ companyId: fx.companyB._id, ledgerType: 'TOP_UP' }).lean();
  check('the top-up is a ledger row with its own balance snapshot',
    topUpRow && topUpRow.availableDelta === 200000 && topUpRow.balanceAfter?.available > 0,
    JSON.stringify({ d: topUpRow?.availableDelta, s: topUpRow?.balanceAfter }));

  const reconcileB = await adminApi.get(`/admin/b2b-wallets/${fx.companyB._id}/reconcile`);
  check('company B also reconciles', reconcileB.data?.data?.balanced === true, JSON.stringify(reconcileB.data?.data));

  // ════════════════════════════════════════════════════════════════════════
  scenario('Scenario 3 — only eligible providers are offered a job');

  const gwalior = writeCsv(`b2b-e2e-gwalior-${Date.now()}.csv`, [
    jobRow(200, { city: 'Gwalior', pincode: '474001', address: 'City Centre, Gwalior', lat: GWALIOR.lat, lng: GWALIOR.lng })
  ]);
  const up3 = await upload(a, gwalior);
  check('the preview warns that no vendor covers the row',
    up3.batch.routingPreview?.uncoveredRows === 1,
    JSON.stringify(up3.batch.routingPreview));

  const created3 = await confirmAndWait(a, up3.id);
  const gwJob = await waitFor(async () => {
    const j = await B2BJob.findOne({ batchId: created3.batch._id }).read('primary').lean();
    return j && j.lifecycleStatus === 'UNASSIGNED' ? j : null;
  }, { timeout: 90000, label: 'unassigned' });
  check('a job nobody can take lands UNASSIGNED with a reason',
    Boolean(gwJob.unassignedReason) && Boolean(gwJob.unassignedAt),
    gwJob.unassignedReason);
  check('the reservation is kept while it waits', gwJob.paymentStatus === 'escrow_locked', gwJob.paymentStatus);

  const queue = await adminApi.get('/routing/unassigned');
  check('admin sees it in the unassigned queue with the reason',
    (queue.data.data || []).some((r) => r.id === String(gwJob._id) && r.reason),
    JSON.stringify((queue.data.data || []).map((r) => r.id)).slice(0, 200));

  const candidates = await adminApi.get(`/routing/jobs/${gwJob._id}/candidates`);
  check('no vendor is offered as a candidate',
    (candidates.data.data || []).length === 0 && Boolean(candidates.data.reason),
    JSON.stringify(candidates.data).slice(0, 200));

  const eligible = await adminApi.get(`/jobs/${gwJob._id}/eligible-engineers`);
  const names = (eligible.data.data || []).map((e) => e.name);
  check('an engineer without the skill is not eligible', !names.includes('Gopal Rao'), JSON.stringify(names));

  // ════════════════════════════════════════════════════════════════════════
  scenario('Scenario 4 — the freelancer path: offer, accept, and expiry');

  // A job still on offer — no vendor has taken it, so admin may place a
  // freelancer on it directly.
  const indoreJob = jobs[1];
  const toFarah = await adminApi.post(`/jobs/${indoreJob._id}/assign`, { engineerId: fx.farah._id, notes: 'Nearest freelancer' });
  check('admin can place a job with an eligible freelancer', toFarah.status === 200, JSON.stringify(toFarah.data).slice(0, 200));

  const farahJobs = await farahApi.get('/engineers/b2b-jobs', { params: { status: 'assigned' } });
  const farahSees = JSON.stringify(farahJobs.data).includes(String(indoreJob._id));
  check('the freelancer sees the request', farahSees, `status=${farahJobs.status}`);

  const vikramJobs = await vikramApi.get('/engineers/b2b-jobs', { params: { status: 'assigned' } });
  check('an engineer who was not asked sees nothing of it',
    !JSON.stringify(vikramJobs.data).includes(String(indoreJob._id)),
    `status=${vikramJobs.status}`);

  const farahAccept = await farahApi.post(`/engineers/b2b-jobs/${indoreJob._id}/accept`, {});
  const afterAccept = await B2BJob.findById(indoreJob._id).read('primary').lean();
  check('acceptance moves the job and clears the deadline',
    farahAccept.status === 200 && afterAccept.lifecycleStatus === 'ACCEPTED' && !afterAccept.assignmentExpiresAt,
    `status=${farahAccept.status} state=${afterAccept.lifecycleStatus}`);

  const companyView = await a.get(`/jobs/${indoreJob._id}`);
  check('the company sees the acceptance immediately',
    companyView.data?.data?.overview?.status === 'ACCEPTED',
    JSON.stringify(companyView.data?.data?.overview?.status));

  // Expiry: assign another job, backdate its deadline and run the sweeper.
  const expiryJob = jobs[2];
  await vendorAApi.post(`/jobs/${expiryJob._id}/accept`);
  await vendorAApi.post(`/jobs/${expiryJob._id}/assign`, { engineerId: fx.amit._id });
  await B2BJob.updateOne({ _id: expiryJob._id }, { $set: { assignmentExpiresAt: new Date(Date.now() - 60000) } });

  const timeouts = require(path.join(__dirname, '../../services/b2bJobTimeouts.service'));
  const sweep = await timeouts.expireStaleAssignments();
  const afterExpiry = await B2BJob.findById(expiryJob._id).read('primary').lean();
  check('an unanswered request expires', sweep.expired.includes(String(expiryJob._id)), JSON.stringify(sweep));
  check('the expired job goes back to the queue, not to the same engineer',
    ['PENDING_ASSIGNMENT', 'ROUTED'].includes(afterExpiry.lifecycleStatus)
    && !afterExpiry.assignedTo
    && (afterExpiry.declinedEngineers || []).map(String).includes(String(fx.amit._id)),
    JSON.stringify({ state: afterExpiry.lifecycleStatus, declined: afterExpiry.declinedEngineers }));

  const assignmentRows = await M('JobAssignment').find({ jobId: expiryJob._id }).lean();
  check('the expired assignment is kept as history, closed as expired',
    assignmentRows.some((r) => r.status === 'expired' && r.isOpen === false && r.expiredAt),
    JSON.stringify(assignmentRows.map((r) => r.status)));

  // ════════════════════════════════════════════════════════════════════════
  scenario('Scenario 5 — isolation between companies, vendors and engineers');

  const aJob = jobs[5];
  const crossReads = [
    ['B2B company B cannot read company A\'s job', () => b.get(`/jobs/${aJob._id}`)],
    ['B2B company B cannot cancel company A\'s job', () => b.delete(`/b2b/jobs/${aJob._id}`)],
    ['B2B company B cannot read company A\'s upload rows', () => b.get(`/b2b/bulk-jobs/${up1.id}/rows`)],
    ['vendor B cannot read vendor A\'s job', () => vendorBApi.get(`/jobs/${aJob._id}`)],
    ['vendor B cannot assign on vendor A\'s job', () => vendorBApi.post(`/jobs/${aJob._id}/assign`, { engineerId: fx.vikram._id })],
    ['an engineer cannot act on a job that is not theirs', () => vikramApi.post(`/engineers/b2b-jobs/${aJob._id}/accept`, {})]
  ];
  for (const [label, call] of crossReads) {
    const r = await call();
    check(label, [403, 404].includes(r.status), `status=${r.status} ${JSON.stringify(r.data).slice(0, 120)}`);
  }

  const bWallet = await b.get(`/b2b/wallet/summary`);
  check('each company only ever sees its own wallet',
    bWallet.status === 200 && bWallet.data.data.balance !== walletAfter.balance,
    JSON.stringify({ b: bWallet.data?.data?.balance, a: walletAfter.balance }));

  // Role permissions: a finance user and an operations user of company A.
  const B2BUser = M('B2BUser');
  const finance = await B2BUser.create({
    companyId: fx.companyA._id, fullName: 'Finance User', email: 'fin@example.test',
    mobile: '9500000001', role: 'Finance', accessRole: 'B2B_FINANCE', status: 'active'
  });
  const ops = await B2BUser.create({
    companyId: fx.companyA._id, fullName: 'Ops User', email: 'ops@example.test',
    mobile: '9500000002', role: 'Operations', accessRole: 'B2B_OPERATIONS', status: 'active'
  });
  const financeApi = client(tokenFor('B2B', finance._id));
  const opsApi = client(tokenFor('B2B', ops._id));

  const finWallet = await financeApi.get('/b2b/wallet/summary');
  check('finance may read the wallet', finWallet.status === 200, String(finWallet.status));
  const finCancel = await financeApi.delete(`/b2b/jobs/${aJob._id}`);
  check('finance may not cancel a job', finCancel.status === 403, `status=${finCancel.status}`);
  const opsWallet = await opsApi.post('/b2b/wallet/create-topup-order', { amount: 1000 });
  check('operations may not top up the wallet', opsWallet.status === 403, `status=${opsWallet.status}`);
  const opsJobs = await opsApi.get('/b2b/jobs');
  check('operations may read its company jobs', opsJobs.status === 200, String(opsJobs.status));
  const opsUsers = await opsApi.get('/b2b/users');
  check('operations may not manage users', opsUsers.status === 403, `status=${opsUsers.status}`);

  // A suspended company loses access entirely.
  const suspend = await adminApi.patch(`/admin/b2b-companies/${fx.companyB._id}/status`, {
    status: 'SUSPENDED', reason: 'Payment dispute'
  });
  check('admin can suspend a company with a reason', suspend.status === 200, JSON.stringify(suspend.data).slice(0, 150));
  const suspendedRead = await b.get('/b2b/jobs');
  check('a suspended company is locked out of the API', suspendedRead.status === 403, `status=${suspendedRead.status}`);
  const noReason = await adminApi.patch(`/admin/b2b-companies/${fx.companyB._id}/status`, { status: 'SUSPENDED' });
  check('suspending without a reason is refused', noReason.status === 400, `status=${noReason.status}`);

  const activity = await adminApi.get(`/admin/b2b-companies/${fx.companyB._id}/activity`);
  check('the status change is in the audit log with actor and reason',
    (activity.data?.data || []).some((r) => r.action === 'B2B_COMPANY_STATUS_CHANGED' && r.reason === 'Payment dispute' && r.actorRole === 'admin'),
    JSON.stringify(activity.data?.data?.[0]));

  await adminApi.patch(`/admin/b2b-companies/${fx.companyB._id}/status`, { status: 'ACTIVE' });

  // ── summary ──────────────────────────────────────────────────────────────
  console.log('\n=== Summary ===');
  const byScenario = new Map();
  for (const r of results) {
    if (!byScenario.has(r.scenario)) byScenario.set(r.scenario, { pass: 0, fail: 0 });
    byScenario.get(r.scenario)[r.ok ? 'pass' : 'fail'] += 1;
  }
  for (const [name, s] of byScenario) {
    console.log(`${s.fail ? 'FAIL' : 'PASS'}  ${name}  (${s.pass} passed, ${s.fail} failed)`);
  }
  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} checks passed`);
  await mongoose.disconnect();
  process.exit(passed === results.length ? 0 : 1);
};

run().catch(async (err) => {
  console.error('\nE2E aborted:', err);
  try { await mongoose.disconnect(); } catch (_) { /* ignore */ }
  process.exit(2);
});
