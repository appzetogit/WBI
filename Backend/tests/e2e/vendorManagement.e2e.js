/**
 * End-to-end test — Vendor Management upgrade (5 acceptance scenarios).
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
 *   1. B2B bulk upload (10 valid + 2 invalid rows) → validation → routing →
 *      vendor "New Requests" → assign Rahul → full lifecycle to CLOSED,
 *      visible to Vendor/B2B/Admin at every step → payment + settlement →
 *      complete timeline & audit.
 *   2. User App booking → freelancer (TazkY worker) → completed; the Vendor
 *      Panel can neither see nor claim it.
 *   3. B2B job no vendor covers → UNASSIGNED with a stated reason → admin
 *      assigns an eligible freelancer → flows to CLOSED.
 *   4. Engineer rejects → job returns to the vendor's queue, vendor notified,
 *      vendor reassigns; original assignment stays in history. Reassign
 *      with reason closes/opens rows.
 *   5. RBAC/isolation: Vendor B gets 403 on Vendor A's jobs/engineers/money;
 *      no arbitrary status writes; forged/anonymous sockets get nothing.
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const FormData = require('form-data');

let ioClient;
try {
  ioClient = require('socket.io-client');
} catch (_) {
  ioClient = require(path.join(__dirname, '../../../Frontend/node_modules/socket.io-client'));
}

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

const tokenFor = (role, id, secret = SECRET) => jwt.sign({ userId: String(id), role }, secret, { expiresIn: '2h' });
const client = (token) => {
  const instance = axios.create({
    baseURL: `${BASE}/api`,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    validateStatus: () => true,
    timeout: 30000
  });
  // All test actors share one IP; per-IP rate limits (e.g. 20 engineer actions
  // per minute) are real product limits, so back off instead of failing.
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

const sockets = [];
const connectSocket = (token) => new Promise((resolve) => {
  const s = ioClient(BASE, { transports: ['websocket'], auth: token ? { token } : {}, reconnection: false, forceNew: true });
  s.events = [];
  s.onAny((event, payload) => s.events.push({ event, payload }));
  sockets.push(s);
  s.on('connect', () => resolve(s));
  s.on('connect_error', () => resolve(s));
});
const sawStatus = (s, jobId, lifecycle) =>
  s.events.some((e) => e.event === 'job:statusChanged' && e.payload?.jobId === String(jobId) && e.payload?.lifecycleStatus === lifecycle);

// ── fixtures ───────────────────────────────────────────────────────────────
const INDORE = { lat: 22.7196, lng: 75.8577 };
const GWALIOR = { lat: 26.2183, lng: 78.1828 };
const BHOPAL = { lat: 23.2599, lng: 77.4126 };

const seed = async () => {
  const db = mongoose.connection.db;
  await db.dropDatabase();
  // Collections with unique/partial indexes the app relies on.
  await Promise.all(['B2BJob', 'JobAssignment', 'VendorServiceCoverage', 'Engineer', 'VendorWorkforceEngineer'].map((m) => M(m).syncIndexes()));

  const Admin = M('Admin');
  const admin = await Admin.create({ name: 'E2E Admin', email: 'e2e.admin@example.test', password: 'Passw0rd!e2e', role: 'super_admin', isActive: true });

  const ServiceConfig = M('ServiceConfig');
  await ServiceConfig.create({
    categoryCode: 'AC_REPAIR',
    categoryName: 'AC Repair',
    matchAliases: ['AC', 'Air Conditioner'],
    subCategories: [{ subCatCode: 'AC_GAS', subCatName: 'Gas Refill' }],
    slaRules: [
      { key: 'high', label: 'High priority', responseMinutes: 30, resolutionHours: 8 },
      { key: 'medium', label: 'Standard', responseMinutes: 60, resolutionHours: 24 }
    ],
    requiredSkills: ['AC Repair'],
    isActive: true,
    status: 'active'
  });
  await ServiceConfig.create({ categoryCode: 'PLUMBING', categoryName: 'Plumbing', isActive: true, status: 'active' });

  const B2BCompany = M('B2BCompany');
  const company = await B2BCompany.create({
    companyName: 'E2E Retail Chain Pvt Ltd',
    gstNumber: '23ABCDE1234F1Z5',
    panNumber: 'ABCDE1234F',
    tanNumber: 'BPLE12345A',
    companyAddress: 'MG Road, Indore',
    billingAddress: 'MG Road, Indore',
    authorizedPerson: { name: 'Priya Sharma', designation: 'Facilities Head', email: 'priya@example.test', phone: '9000000001' },
    email: 'e2e.b2b@example.test',
    phone: '9000000002',
    passwordHash: 'not-used-in-e2e',
    verificationStatus: 'approved',
    isActive: true
  });
  await M('B2BWallet').create({ companyId: company._id, balance: 100000 });
  await M('B2BPricingRule').create({ name: 'AC Repair — standard', service: 'AC Repair', baseAmount: 1200, taxPercent: 18, serviceTier: 'any', isActive: true });

  const Vendor = M('Vendor');
  const vendorA = await Vendor.create({
    name: 'Arjun Mehta', businessName: 'Indore Cooling Services', email: 'vendor.a@example.test', phone: '9100000001',
    approvalStatus: 'approved', isActive: true, workingCities: ['Indore'],
    approvedServices: [{ categoryCode: 'AC_REPAIR', categoryName: 'AC Repair', status: 'active' }]
  });
  const vendorB = await Vendor.create({
    name: 'Bhavna Rao', businessName: 'Bhopal AC Experts', email: 'vendor.b@example.test', phone: '9100000002',
    approvalStatus: 'approved', isActive: true, workingCities: ['Bhopal'],
    approvedServices: [{ categoryCode: 'AC_REPAIR', categoryName: 'AC Repair', status: 'active' }]
  });

  const Engineer = M('Engineer');
  const mkEng = (o) => Engineer.create({
    roleType: 'Engineer',
    approvalStatus: 'approved',
    verificationStatus: 'approved',
    isActive: true,
    status: 'ONLINE',
    ...o
  });
  const at = ({ lat, lng }, d = 0) => ({ type: 'Point', coordinates: [lng + d, lat + d] });
  const rahul = await mkEng({ name: 'Rahul Verma', phone: '9200000001', engineerType: 'vendor_engineer', vendorId: vendorA._id, vendorApprovalStatus: 'approved', serviceCategories: ['AC Repair'], primarySkill: 'AC Repair', address: { city: 'Indore' }, geoLocation: at(INDORE, 0.01) });
  const amit = await mkEng({ name: 'Amit Joshi', phone: '9200000002', engineerType: 'vendor_engineer', vendorId: vendorA._id, vendorApprovalStatus: 'approved', serviceCategories: ['AC Repair'], primarySkill: 'AC Repair', address: { city: 'Indore' }, geoLocation: at(INDORE, 0.02) });
  const sunil = await mkEng({ name: 'Sunil Patel', phone: '9200000003', engineerType: 'vendor_engineer', vendorId: vendorA._id, vendorApprovalStatus: 'approved', serviceCategories: ['Plumbing'], primarySkill: 'Plumbing', address: { city: 'Indore' }, geoLocation: at(INDORE, 0.03) });
  const vikram = await mkEng({ name: 'Vikram Singh', phone: '9200000004', engineerType: 'vendor_engineer', vendorId: vendorB._id, vendorApprovalStatus: 'approved', serviceCategories: ['AC Repair'], primarySkill: 'AC Repair', address: { city: 'Bhopal' }, geoLocation: at(BHOPAL) });
  // Freelancer in Gwalior, offline — never offered automatically; admin can assign.
  const deepak = await mkEng({ name: 'Deepak Kumar', phone: '9200000005', engineerType: 'freelancer', serviceCategories: ['AC Repair'], primarySkill: 'AC Repair', address: { city: 'Gwalior' }, geoLocation: at(GWALIOR, 0.01), status: 'OFFLINE' });

  const User = M('User');
  const user = await User.create({ name: 'Neha Gupta', phone: '9300000001', email: 'neha@example.test', isActive: true });
  const Worker = M('Worker');
  const worker = await Worker.create({ name: 'Karan Yadav', phone: '9400000001', approvalStatus: 'approved', verificationStatus: 'verified', status: 'ONLINE', isActive: true });
  const Service = M('Service');
  const service = await Service.create({ title: 'AC Service', slug: 'ac-service-e2e', basePrice: 499, gstPercentage: 18, status: 'active' });

  return { admin, company, vendorA, vendorB, rahul, amit, sunil, vikram, deepak, user, worker, service };
};

const writeCsv = (name, rows) => {
  const header = 'Customer Name,Phone,Email,Address,City,State,Pincode,Latitude,Longitude,Service,Sub Service,Priority,Preferred Date,Preferred Time';
  const file = path.join(os.tmpdir(), name);
  fs.writeFileSync(file, [header, ...rows.map((r) => r.map((c) => (String(c).includes(',') ? `"${c}"` : c)).join(','))].join('\n'));
  return file;
};

const uploadBatch = async (b2b, file) => {
  const form = new FormData();
  form.append('file', fs.createReadStream(file), { filename: path.basename(file), contentType: 'text/csv' });
  const res = await b2b.post('/b2b/bulk-jobs/upload', form, { headers: form.getHeaders() });
  if (res.status !== 201) throw new Error(`upload failed ${res.status}: ${JSON.stringify(res.data)}`);
  const id = res.data.batch.id;
  const validated = await waitFor(async () => {
    const r = await b2b.get(`/b2b/bulk-jobs/${id}`);
    return ['validated', 'failed'].includes(r.data?.batch?.status) ? r.data.batch : null;
  }, { timeout: 60000, label: 'batch validation' });
  return { id, validated };
};

const confirmBatch = async (b2b, id) => {
  const r = await b2b.post(`/b2b/bulk-jobs/confirm/${id}`);
  if (r.status !== 200) throw new Error(`confirm failed ${r.status}: ${JSON.stringify(r.data)}`);
  return waitFor(async () => {
    const d = await b2b.get(`/b2b/bulk-jobs/${id}`);
    return ['completed', 'failed'].includes(d.data?.batch?.status) ? d.data.batch : null;
  }, { timeout: 60000, label: 'batch creation' });
};

const jobState = async (id) => (await M('B2BJob').findById(id).read('primary').lean())?.lifecycleStatus;

/** Status as each panel sees it: Vendor (holder), B2B (owner), Admin. */
const panelsAgree = async ({ vendorApi, b2bApi, adminApi }, jobId, expected) => {
  const [v, b, a, legacyB2B] = await Promise.all([
    vendorApi.get(`/jobs/${jobId}`),
    b2bApi.get(`/jobs/${jobId}`),
    adminApi.get(`/jobs/${jobId}`),
    b2bApi.get(`/b2b/jobs/${jobId}`)
  ]);
  const seen = [v.data?.data?.overview?.status, b.data?.data?.overview?.status, a.data?.data?.overview?.status];
  const legacy = legacyB2B.data?.data?.status || legacyB2B.data?.job?.status || null;
  return { ok: seen.every((s) => s === expected), seen, legacy };
};

// ── scenarios ──────────────────────────────────────────────────────────────
const run = async () => {
  await mongoose.connect(MONGO);
  console.log(`E2E against ${BASE} (db ${MONGO.split('/').pop()})`);
  const fx = await seed();

  const adminTok = tokenFor('ADMIN', fx.admin._id);
  const b2bTok = tokenFor('B2B', fx.company._id);
  const vATok = tokenFor('VENDOR', fx.vendorA._id);
  const vBTok = tokenFor('VENDOR', fx.vendorB._id);
  const engTok = (e) => tokenFor('ENGINEER', e._id);

  const adminApi = client(adminTok);
  const b2bApi = client(b2bTok);
  const vendorA = client(vATok);
  const vendorB = client(vBTok);
  const rahulApi = client(engTok(fx.rahul));
  const amitApi = client(engTok(fx.amit));
  const deepakApi = client(engTok(fx.deepak));
  const views = { vendorApi: vendorA, b2bApi, adminApi };

  const [adminSock, b2bSock, vendorASock, vendorBSock, rahulSock] = await Promise.all([
    connectSocket(adminTok), connectSocket(b2bTok), connectSocket(vATok), connectSocket(vBTok), connectSocket(engTok(fx.rahul))
  ]);

  // Coverage via the API (vendor A: Indore pincodes + city; vendor B: Bhopal).
  const covA = await vendorA.put(`/vendors/${fx.vendorA._id}/service-coverage/AC_REPAIR`, {
    coverageCities: ['Indore'],
    coveragePincodes: ['452001', '452002', '452003', '452004', '452005', '452006', '452007', '452008', '452009', '452010']
  });
  const covB = await vendorB.put(`/vendors/${fx.vendorB._id}/service-coverage/AC_REPAIR`, { coverageCities: ['Bhopal'], coveragePincodes: ['462001'] });
  const covCross = await vendorB.put(`/vendors/${fx.vendorA._id}/service-coverage/AC_REPAIR`, { coverageCities: ['Gwalior'] });

  // ════════════════════════════════════════════════════════════════════════
  scenario('Scenario 1 — B2B bulk upload → vendor → Rahul → CLOSED → payment');
  check('vendor A saves its service coverage', covA.status === 200, JSON.stringify(covA.data));
  check('vendor B saves its service coverage', covB.status === 200, JSON.stringify(covB.data));

  const rows = [];
  for (let i = 1; i <= 10; i++) {
    rows.push([`Store ${i} Manager`, `98765432${String(i).padStart(2, '0')}`, `store${i}@example.test`, `Shop ${i}, Vijay Nagar`, 'Indore', 'Madhya Pradesh', `4520${String(i).padStart(2, '0')}`, INDORE.lat + i * 0.001, INDORE.lng + i * 0.001, 'AC Repair', 'Gas Refill', i === 1 ? 'High' : 'Medium', '25/09/2026', '10:00-12:00']);
  }
  rows.push(['Bad Phone Row', '12345', '', 'Shop X, Palasia', 'Indore', 'Madhya Pradesh', '452001', INDORE.lat, INDORE.lng, 'AC Repair', '', 'Medium', '25/09/2026', '']);
  rows.push(['Bad Pincode Row', '9876500099', '', 'Shop Y, Palasia', 'Indore', 'Madhya Pradesh', '45200', INDORE.lat, INDORE.lng, 'AC Repair', '', 'Medium', '25/09/2026', '']);
  const csv1 = writeCsv(`e2e-indore-${Date.now()}.csv`, rows);

  const { id: batchId, validated } = await uploadBatch(b2bApi, csv1);
  check('validation: 12 rows parsed', validated.totalRows === 12, `totalRows=${validated.totalRows}`);
  check('validation: 10 valid / 2 invalid', validated.validRows === 10 && validated.invalidRows === 2, `valid=${validated.validRows} invalid=${validated.invalidRows}`);
  check('preview: all 10 valid rows covered by a vendor', validated.routingPreview?.coveredRows === 10, JSON.stringify(validated.routingPreview));
  const errs = await b2bApi.get(`/b2b/bulk-jobs/errors/${batchId}`);
  const errText = JSON.stringify(errs.data);
  check('error report flags the bad phone and the bad pincode', /Contact Number: must be a 10-digit/.test(errText) && /Pincode: must be a valid 6-digit/.test(errText), errText.slice(0, 300));

  const created = await confirmBatch(b2bApi, batchId);
  check('10 jobs created', created.createdJobsCount === 10, `created=${created.createdJobsCount} status=${created.status} ${created.failureReason || ''}`);

  const B2BJob = M('B2BJob');
  const jobs = await B2BJob.find({ batchId }).sort({ jobId: 1 }).lean();
  check('every job persists source=B2B and serviceKey=AC_REPAIR', jobs.length === 10 && jobs.every((j) => j.source === 'B2B' && j.serviceKey === 'AC_REPAIR'), JSON.stringify(jobs.map((j) => [j.source, j.serviceKey])));
  check('every job has an SLA due date', jobs.every((j) => j.slaDueAt), 'missing slaDueAt');

  await waitFor(async () => (await B2BJob.countDocuments({ batchId, lifecycleStatus: 'ROUTED', notifiedVendors: fx.vendorA._id })) === 10, { timeout: 45000, label: 'routing to vendor A' });
  check('routing offered all 10 jobs to vendor A (coverage + skilled engineer)', true);
  const vBOffers = await B2BJob.countDocuments({ batchId, notifiedVendors: fx.vendorB._id });
  check('vendor B (no Indore coverage) was offered nothing', vBOffers === 0, `vendorB offers=${vBOffers}`);

  const newA = await vendorA.get(`/vendors/${fx.vendorA._id}/jobs`, { params: { tab: 'new', limit: 50 } });
  check('vendor A "New Requests" shows 10', newA.status === 200 && newA.data.counts?.new === 10 && newA.data.data.length === 10, `status=${newA.status} counts=${JSON.stringify(newA.data.counts)}`);
  check('offers hide customer contact until accepted', newA.data.data.every((r) => r.customer.phone === null && r.location.address === null), 'contact leaked in offer');
  const newB = await vendorB.get(`/vendors/${fx.vendorB._id}/jobs`, { params: { tab: 'new' } });
  check('vendor B "New Requests" shows 0', newB.data.counts?.new === 0, JSON.stringify(newB.data.counts));

  const summary1 = await b2bApi.get(`/b2b/bulk-jobs/${batchId}/routing-summary`);
  check('routing summary: 10 awaiting vendor acceptance', summary1.data?.data?.routing?.awaitingVendorAcceptance === 10, JSON.stringify(summary1.data?.data?.routing));

  const job1 = jobs[0];
  const acc = await vendorA.post(`/jobs/${job1._id}/accept`);
  check('vendor A accepts job 1 → PENDING_ASSIGNMENT', acc.status === 200 && acc.data.data.status === 'PENDING_ASSIGNMENT', JSON.stringify(acc.data));
  const accB = await vendorB.post(`/jobs/${job1._id}/accept`);
  check('vendor B cannot accept a job it was never offered', accB.status === 403, `status=${accB.status}`);
  for (const j of jobs.slice(1)) await vendorA.post(`/jobs/${j._id}/accept`);

  const elig = await vendorA.get(`/jobs/${job1._id}/eligible-engineers`);
  const eligNames = (elig.data.data || []).map((e) => e.name);
  const inelig = (elig.data.ineligible || []).map((e) => `${e.name}: ${e.reasons.join('; ')}`);
  check('eligible list = Rahul + Amit (skill + location match, computed server-side)', eligNames.includes('Rahul Verma') && eligNames.includes('Amit Joshi') && eligNames.length === 2, JSON.stringify(eligNames));
  check('Sunil (Plumbing) excluded with a skill reason', inelig.some((t) => t.startsWith('Sunil Patel') && /skill/i.test(t)), JSON.stringify(inelig));
  check("vendor B's engineer is not even a candidate", ![...eligNames, ...inelig].some((t) => t.includes('Vikram')), 'Vikram listed');
  const reasoning = (elig.data.data || []).find((e) => e.name === 'Rahul Verma');
  check('candidate carries reasoning (skill, location, availability, job count)', reasoning && reasoning.skillMatch?.matched && reasoning.locationMatch?.matched && reasoning.availability && typeof reasoning.activeJobs === 'number', JSON.stringify(reasoning));

  const asg = await vendorA.post(`/jobs/${job1._id}/assign`, { engineerId: fx.rahul._id, notes: 'Carry gas cylinder' });
  check('vendor assigns Rahul → ASSIGNED', asg.status === 200 && asg.data.data.status === 'ASSIGNED', JSON.stringify(asg.data));
  await sleep(300);
  check('Rahul (TazkY) receives engineer:jobAssigned', rahulSock.events.some((e) => e.event === 'engineer:jobAssigned' && e.payload?.mongoId === String(job1._id)), JSON.stringify(rahulSock.events.map((e) => e.event)));
  let p = await panelsAgree(views, job1._id, 'ASSIGNED');
  check('Vendor / B2B / Admin all see ASSIGNED', p.ok, JSON.stringify(p.seen));

  const tazkyList = await rahulApi.get('/engineers/b2b-jobs');
  check('job appears in Rahul\'s TazkY list', (tazkyList.data.jobs || []).some((j) => String(j._id) === String(job1._id)), `status=${tazkyList.status}`);

  const steps = [
    { name: 'accept', call: () => rahulApi.post(`/engineers/b2b-jobs/${job1._id}/accept`, {}), expect: 'ACCEPTED' },
    { name: 'start travel', call: () => rahulApi.post(`/engineers/b2b-jobs/${job1._id}/start-travel`, { location: { lat: INDORE.lat, lng: INDORE.lng } }), expect: 'EN_ROUTE' },
    { name: 'arrive', call: () => rahulApi.post(`/engineers/b2b-jobs/${job1._id}/arrive`, { location: { lat: INDORE.lat + 0.001, lng: INDORE.lng + 0.001 } }), expect: 'ARRIVED' },
    { name: 'start with OTP + before photo', call: () => rahulApi.post(`/engineers/b2b-jobs/${job1._id}/start`, { startOtp: '123456', beforePhotos: ['https://example.test/before-1.jpg'] }), expect: 'IN_PROGRESS' },
    { name: 'complete with after photo', call: () => rahulApi.post(`/engineers/b2b-jobs/${job1._id}/complete`, { status: 'completed', afterPhotos: ['https://example.test/after-1.jpg'], workNotes: 'Gas refilled, cooling OK' }), expect: 'VERIFICATION' }
  ];
  for (const st of steps) {
    const r = await st.call();
    check(`Rahul ${st.name} → ${st.expect}`, r.status === 200 && (await jobState(job1._id)) === st.expect, `status=${r.status} ${JSON.stringify(r.data).slice(0, 200)}`);
    p = await panelsAgree(views, job1._id, st.expect);
    check(`  Vendor / B2B / Admin all see ${st.expect}`, p.ok, JSON.stringify(p.seen));
  }
  await sleep(300);
  for (const [label, s] of [['vendor', vendorASock], ['B2B', b2bSock], ['admin', adminSock]]) {
    check(`${label} socket received every live status (EN_ROUTE, ARRIVED, IN_PROGRESS, VERIFICATION)`,
      ['EN_ROUTE', 'ARRIVED', 'IN_PROGRESS', 'VERIFICATION'].every((st) => sawStatus(s, job1._id, st)),
      JSON.stringify(s.events.filter((e) => e.event === 'job:statusChanged' && e.payload?.jobId === String(job1._id)).map((e) => e.payload.lifecycleStatus)));
  }
  check('vendor B socket received none of job 1\'s events', !vendorBSock.events.some((e) => e.payload?.jobId === String(job1._id)), 'leak to vendor B');

  const earlyApprove = await adminApi.post(`/admin/b2b/jobs/submissions/${jobs[1]._id}/approve`, {});
  check('admin cannot approve a job whose work was never submitted', earlyApprove.status === 409, `status=${earlyApprove.status}`);

  const approve = await b2bApi.post(`/b2b/jobs/${job1._id}/approve-work`, { approved: true });
  check('B2B approves the work → CLOSED', approve.status === 200 && (await jobState(job1._id)) === 'CLOSED', `status=${approve.status} ${JSON.stringify(approve.data).slice(0, 300)}`);
  p = await panelsAgree(views, job1._id, 'CLOSED');
  check('Vendor / B2B / Admin all see CLOSED', p.ok, JSON.stringify(p.seen));

  const payments = await vendorA.get(`/vendors/${fx.vendorA._id}/payments`);
  const payRow = (payments.data.data || []).find((r) => r.jobId === String(job1._id));
  check('job payment: status PAID, amount 1416, commission > 0, vendor earnings = ledger credit', payRow && payRow.status === 'PAID' && payRow.jobAmount === 1416 && payRow.commission > 0 && payRow.vendorEarnings > 0 && payRow.reference, JSON.stringify(payRow));
  const ledger = await M('VendorFinanceTransaction').findOne({ vendorId: fx.vendorA._id, referenceCode: `b2b_job_release:${job1._id}` }).lean();
  check('escrow released to vendor A\'s finance ledger (not the engineer)', ledger && ledger.type === 'escrow_release' && Math.abs(ledger.amount - payRow?.vendorEarnings) < 0.01, JSON.stringify(ledger));
  const stl = await vendorA.get(`/vendors/${fx.vendorA._id}/settlements`);
  const current = (stl.data.data || [])[0];
  check('settlement for the month includes the job (gross 1416, net = earnings, PAID)', current && current.totalJobs === 1 && current.grossAmount === 1416 && Math.abs(current.netAmount - payRow?.vendorEarnings) < 0.01 && current.status === 'PAID', JSON.stringify(current));
  const csv = await vendorA.get(`/vendors/${fx.vendorA._id}/settlements/${current?.settlementId}/download`);
  check('settlement downloads as CSV', csv.status === 200 && /text\/csv/.test(csv.headers['content-type']) && String(csv.data).includes(job1.jobId), `status=${csv.status}`);

  const detail = await adminApi.get(`/jobs/${job1._id}`);
  const ms = detail.data.data.timeline.milestones;
  const missing = ms.filter((m) => !m.reached).map((m) => m.key);
  check('timeline: Created → Vendor Assigned → … → Verification → Closed all reached', missing.length === 0, `missing=${missing}`);
  check('timeline events are ordered and backend-sourced', detail.data.data.timeline.events.length >= 9, `events=${detail.data.data.timeline.events.length}`);
  const auditTypes = detail.data.data.audit.map((a) => a.actionType);
  check('audit log records the engineer assignment', auditTypes.includes('JOB_ENGINEER_ASSIGNED'), JSON.stringify(auditTypes));
  const assignRows = await vendorA.get(`/jobs/${job1._id}/assignments`);
  check('assignment history: one row, completed', assignRows.data.data.length === 1 && assignRows.data.data[0].status === 'completed', JSON.stringify(assignRows.data.data.map((r) => r.status)));

  const summary2 = await b2bApi.get(`/b2b/bulk-jobs/${batchId}/routing-summary`);
  const vrow = (summary2.data?.data?.routing?.vendors || []).find((v) => v.vendorId === String(fx.vendorA._id));
  check('routing summary: Indore Cooling Services 10, unassigned 0', vrow?.count === 10 && summary2.data.data.routing.unassigned.count === 0, JSON.stringify(summary2.data?.data?.routing));

  const dash = await vendorA.get(`/vendors/${fx.vendorA._id}/dashboard`);
  const c = dash.data.data?.cards || {};
  check('dashboard cards are live (total 10, pending assignment 9, completed today 1)', c.totalJobs === 10 && c.pendingAssignment === 9 && c.completedToday === 1, JSON.stringify(c));

  // ════════════════════════════════════════════════════════════════════════
  scenario('Scenario 4 — engineer rejects → back to vendor → reassigned; history kept');
  const job2 = jobs[1];
  await vendorA.post(`/jobs/${job2._id}/assign`, { engineerId: fx.amit._id });
  vendorASock.events.length = 0;
  const rejAfterNothing = await rahulApi.post(`/engineers/b2b-jobs/${job2._id}/reject`, { rejectionReason: 'Busy' });
  check('another engineer cannot reject a job not theirs', rejAfterNothing.status === 403 || rejAfterNothing.status === 404, `status=${rejAfterNothing.status}`);
  const rej = await amitApi.post(`/engineers/b2b-jobs/${job2._id}/reject`, { rejectionReason: 'Vehicle breakdown', rejectionRemarks: 'Cannot reach site today' });
  check('Amit rejects → job returns to PENDING_ASSIGNMENT with the vendor', rej.status === 200 && (await jobState(job2._id)) === 'PENDING_ASSIGNMENT', `status=${rej.status} state=${await jobState(job2._id)}`);
  const j2 = await B2BJob.findById(job2._id).lean();
  check('vendor still holds the job; no engineer on it', String(j2.assignedVendorId) === String(fx.vendorA._id) && !j2.assignedTo, JSON.stringify({ v: j2.assignedVendorId, e: j2.assignedTo }));
  await sleep(300);
  check('vendor notified in real time (job_rejected)', vendorASock.events.some((e) => e.event === 'vendor:jobNotice' && e.payload?.type === 'job_rejected' && e.payload?.jobId === String(job2._id)), JSON.stringify(vendorASock.events.map((e) => e.event)));
  const pendingTab = await vendorA.get(`/vendors/${fx.vendorA._id}/jobs`, { params: { tab: 'pending_assignment', limit: 50 } });
  const pendingRow = pendingTab.data.data.find((r) => r.id === String(job2._id));
  check('job is back in "Pending Assignment", flagged with who rejected it and why', pendingRow && pendingRow.stage?.engineerRejected?.engineerName === 'Amit Joshi' && /Vehicle breakdown/.test(pendingRow.stage.engineerRejected.reason || ''), JSON.stringify(pendingRow?.stage));
  const again = await vendorA.post(`/jobs/${job2._id}/assign`, { engineerId: fx.rahul._id });
  check('vendor reassigns to Rahul → ASSIGNED', again.status === 200 && (await jobState(job2._id)) === 'ASSIGNED', JSON.stringify(again.data).slice(0, 200));
  const hist2 = (await vendorA.get(`/jobs/${job2._id}/assignments`)).data.data;
  check('history keeps Amit (rejected) and opens Rahul (assigned)', hist2.length === 2 && hist2[0].status === 'rejected' && hist2[0].engineerId?.name === 'Amit Joshi' && hist2[1].status === 'assigned' && hist2[1].isOpen, JSON.stringify(hist2.map((h) => [h.engineerId?.name, h.status])));
  const tamper = await M('JobAssignment').updateOne({ _id: hist2[0]._id }, { $set: { status: 'accepted' } });
  check('closed history row cannot be modified', tamper.matchedCount === 0, JSON.stringify(tamper));

  const job3 = jobs[2];
  await vendorA.post(`/jobs/${job3._id}/assign`, { engineerId: fx.rahul._id });
  const noReason = await vendorA.post(`/jobs/${job3._id}/reassign`, { engineerId: fx.amit._id });
  check('reassign without a reason is refused', noReason.status === 400, `status=${noReason.status}`);
  const reas = await vendorA.post(`/jobs/${job3._id}/reassign`, { engineerId: fx.amit._id, reason: 'Rahul pulled to an emergency' });
  check('reassign with reason → ASSIGNED to Amit', reas.status === 200 && (await B2BJob.findById(job3._id).lean()).assignedToName === 'Amit Joshi', JSON.stringify(reas.data).slice(0, 200));
  const hist3 = (await vendorA.get(`/jobs/${job3._id}/assignments`)).data.data;
  check('old row closed as reassigned (→ Amit), new row open', hist3.length === 2 && hist3[0].status === 'reassigned' && String(hist3[0].newEngineerId?._id || hist3[0].newEngineerId) === String(fx.amit._id) && hist3[1].isOpen, JSON.stringify(hist3.map((h) => h.status)));
  const tl3 = (await vendorA.get(`/jobs/${job3._id}/timeline`)).data.data.events.map((e) => e.to);
  check('timeline records ASSIGNED → REASSIGNED → ASSIGNED', tl3.join(',').includes('ASSIGNED,REASSIGNED,ASSIGNED'), tl3.join(','));
  await amitApi.post(`/engineers/b2b-jobs/${job3._id}/accept`, {});
  const lateReject = await amitApi.post(`/engineers/b2b-jobs/${job3._id}/reject`, { rejectionReason: 'Changed mind' });
  check('an engineer cannot reject after accepting (state machine)', lateReject.status === 409, `status=${lateReject.status}`);

  // ════════════════════════════════════════════════════════════════════════
  scenario('Scenario 3 — no vendor covers the job → UNASSIGNED → admin assigns → CLOSED');
  const csv3 = writeCsv(`e2e-gwalior-${Date.now()}.csv`, [
    ['Gwalior Branch', '9876549999', 'gwl@example.test', 'City Centre, Gwalior', 'Gwalior', 'Madhya Pradesh', '474001', GWALIOR.lat, GWALIOR.lng, 'AC Repair', '', 'Medium', '26/09/2026', '']
  ]);
  const { id: batch3, validated: v3 } = await uploadBatch(b2bApi, csv3);
  check('preview warns the row has no vendor coverage', v3.routingPreview?.uncoveredRows === 1, JSON.stringify(v3.routingPreview));
  await confirmBatch(b2bApi, batch3);
  const gw = await waitFor(async () => {
    const j = await B2BJob.findOne({ batchId: batch3 }).read('primary').lean();
    return j && j.lifecycleStatus === 'UNASSIGNED' ? j : null;
  }, { timeout: 45000, label: 'unassigned queue' });
  check('job lands UNASSIGNED with a stated reason', /No vendor covers AC_REPAIR in pincode 474001/.test(gw.unassignedReason || gw.allocationReason || ''), gw.unassignedReason || gw.allocationReason);
  // The job is still live, so its money stays reserved — only cancelling it
  // hands the reservation back.
  const stillHeld = (await B2BJob.findById(gw._id).read('primary').lean()).paymentStatus;
  check('the reservation is kept while the job waits in the queue', stillHeld === 'escrow_locked', stillHeld);
  const qAdmin = await adminApi.get('/routing/unassigned');
  check('admin unassigned queue lists it with the reason', (qAdmin.data.data || []).some((r) => r.id === String(gw._id) && /No vendor covers/.test(r.reason)), JSON.stringify(qAdmin.data).slice(0, 300));
  const qB2B = await b2bApi.get('/routing/unassigned');
  check('B2B sees its unassigned job and why', (qB2B.data.data || []).some((r) => r.id === String(gw._id)), `status=${qB2B.status}`);
  const qVendor = await vendorA.get('/routing/unassigned');
  check('vendors cannot read the unassigned queue', qVendor.status === 403, `status=${qVendor.status}`);
  const cand = await adminApi.get(`/routing/jobs/${gw._id}/candidates`);
  check('vendor candidates explain there is no coverage', (cand.data.data || []).length === 0 && /No vendor covers/.test(cand.data.reason || ''), JSON.stringify(cand.data));
  const eligGw = await adminApi.get(`/jobs/${gw._id}/eligible-engineers`);
  check('admin sees Deepak (freelancer, Gwalior) as eligible', (eligGw.data.data || []).some((e) => e.name === 'Deepak Kumar'), JSON.stringify((eligGw.data.data || []).map((e) => e.name)));
  const manual = await adminApi.post(`/jobs/${gw._id}/assign`, { engineerId: fx.deepak._id, notes: 'Nearest freelancer' });
  check('admin assigns Deepak → ASSIGNED (money still held)', manual.status === 200 && (await jobState(gw._id)) === 'ASSIGNED' && (await B2BJob.findById(gw._id).lean()).paymentStatus === 'escrow_locked', JSON.stringify(manual.data).slice(0, 300));
  for (const [name, call, expect] of [
    ['accept', () => deepakApi.post(`/engineers/b2b-jobs/${gw._id}/accept`, {}), 'ACCEPTED'],
    ['start travel', () => deepakApi.post(`/engineers/b2b-jobs/${gw._id}/start-travel`, {}), 'EN_ROUTE'],
    ['arrive', () => deepakApi.post(`/engineers/b2b-jobs/${gw._id}/arrive`, {}), 'ARRIVED'],
    ['start', () => deepakApi.post(`/engineers/b2b-jobs/${gw._id}/start`, { startOtp: '123456', beforePhotos: ['https://example.test/b.jpg'] }), 'IN_PROGRESS'],
    ['complete', () => deepakApi.post(`/engineers/b2b-jobs/${gw._id}/complete`, { status: 'completed', afterPhotos: ['https://example.test/a.jpg'] }), 'VERIFICATION']
  ]) {
    const r = await call();
    check(`Deepak ${name} → ${expect}`, r.status === 200 && (await jobState(gw._id)) === expect, `status=${r.status} ${JSON.stringify(r.data).slice(0, 200)}`);
  }
  const adminApprove = await adminApi.post(`/admin/b2b/jobs/submissions/${gw._id}/approve`, { remarks: 'Photos verified' });
  check('admin verifies → CLOSED (the previously crashing endpoint)', adminApprove.status === 200 && (await jobState(gw._id)) === 'CLOSED', `status=${adminApprove.status} ${JSON.stringify(adminApprove.data).slice(0, 200)}`);
  const subDetail = await adminApi.get(`/admin/b2b/jobs/submissions/${gw._id}`);
  check('submission detail loads (was a ReferenceError)', subDetail.status === 200 && Array.isArray(subDetail.data.data?.timeline), `status=${subDetail.status}`);
  const deepakDoc = await M('Engineer').findById(fx.deepak._id).lean();
  check('freelancer paid to own wallet (no vendor involved)', (deepakDoc.wallet?.balance || 0) > 0, JSON.stringify(deepakDoc.wallet));

  // ════════════════════════════════════════════════════════════════════════
  scenario('Scenario 2 — User App booking → freelancer (TazkY) → completed; vendor cannot claim');
  const Booking = M('Booking');
  const tomorrow = new Date(Date.now() + 86400000);
  // State produced by the User App + matching engine (broadcast to nearby workers).
  const booking = await Booking.create({
    userId: fx.user._id,
    serviceId: fx.service._id,
    serviceName: 'AC Service',
    serviceCategory: 'AC Repair',
    basePrice: 499,
    tax: 90,
    finalAmount: 589,
    address: { addressLine1: '12 Scheme 54', city: 'Indore', state: 'Madhya Pradesh', pincode: '452010', lat: INDORE.lat, lng: INDORE.lng },
    scheduledDate: tomorrow,
    scheduledTime: '10:00 AM',
    timeSlot: { start: '10:00', end: '12:00' },
    status: 'searching_worker',
    paymentMethod: 'cash',
    notifiedWorkers: [fx.worker._id],
    potentialWorkers: [{ workerId: fx.worker._id, distance: 2 }]
  });
  const userApi = client(tokenFor('USER', fx.user._id));
  const workerApi = client(tokenFor('WORKER', fx.worker._id));

  const vReqList = await vendorA.get('/vendor/requests', { params: { limit: 100 } });
  check('booking is not in the vendor\'s Requests list', !(vReqList.data.data || []).some((r) => r.id === String(booking._id)), 'vendor sees the booking');
  const vReqDetail = await vendorA.get(`/vendor/requests/${booking._id}`);
  check('vendor cannot open the booking (403, no data)', vReqDetail.status === 403 && !vReqDetail.data.data, `status=${vReqDetail.status}`);
  const vClaim = await vendorA.post(`/vendor/requests/${booking._id}/accept`);
  check('vendor cannot claim the booking via Requests (403)', vClaim.status === 403, `status=${vClaim.status}`);
  const vWorkerClaim = await vendorA.patch(`/worker/bookings/${booking._id}/accept`);
  check('vendor token cannot accept it through the worker endpoint (403)', vWorkerClaim.status === 403, `status=${vWorkerClaim.status}`);
  check('booking still unowned by any vendor', !(await Booking.findById(booking._id).lean()).vendorId, 'vendorId was set');

  const wAccept = await workerApi.patch(`/worker/bookings/${booking._id}/accept`);
  check('freelancer (TazkY worker) accepts', wAccept.status === 200, JSON.stringify(wAccept.data).slice(0, 200));
  for (const [name, call, expect] of [
    ['start journey', () => workerApi.patch(`/worker/bookings/${booking._id}/start-journey`), 'journey_started'],
    ['arrived', () => workerApi.patch(`/worker/bookings/${booking._id}/arrived`), 'arrived'],
    ['verify customer OTP', () => workerApi.post(`/worker/bookings/${booking._id}/verify-otp`, { otp: '1234' }), 'service_started'],
    ['upload proof', () => workerApi.post(`/worker/bookings/${booking._id}/proofs`, { proofUrl: 'https://example.test/proof.jpg', type: 'after' }), 'service_started'],
    ['complete', () => workerApi.patch(`/worker/bookings/${booking._id}/complete`), 'work_done']
  ]) {
    const r = await call();
    const st = (await Booking.findById(booking._id).lean()).status;
    check(`worker ${name} → ${expect}`, r.status === 200 && st === expect, `status=${r.status} booking=${st} ${JSON.stringify(r.data).slice(0, 150)}`);
  }
  const vendorCash = await vendorA.post(`/bookings/cash/${booking._id}/confirm`, { otp: '1234', amount: 1 });
  check('vendor cannot confirm cash on a booking it does not own (403)', vendorCash.status === 403, `status=${vendorCash.status}`);
  const noInit = await workerApi.post(`/bookings/cash/${booking._id}/confirm`, { otp: '1234', amount: 589 });
  check('cash cannot be confirmed before the customer OTP is issued', noInit.status === 409, `status=${noInit.status}`);
  const init = await workerApi.post(`/bookings/cash/${booking._id}/initiate`, {});
  const wrong = await workerApi.post(`/bookings/cash/${booking._id}/confirm`, { otp: '9999', amount: 589 });
  check('wrong customer OTP is refused', wrong.status === 400, `status=${wrong.status}`);
  const conf = await workerApi.post(`/bookings/cash/${booking._id}/confirm`, { otp: '1234', amount: 589 });
  const finalB = await Booking.findById(booking._id).lean();
  check('cash collected with customer OTP → completed', init.status === 200 && conf.status === 200 && finalB.status === 'completed', `init=${init.status} ${JSON.stringify(init.data).slice(0, 120)} confirm=${conf.status} status=${finalB.status}`);
  const userView = await userApi.get(`/users/bookings/${booking._id}`);
  const userStatus = userView.data?.data?.status || userView.data?.booking?.status;
  check('user sees the completed booking', userView.status === 200 && userStatus === 'completed', `status=${userView.status} ${userStatus}`);
  const myJobs = await vendorA.get('/vendor/my-jobs', { params: { limit: 100 } });
  check('vendor My Jobs never listed the booking', !(myJobs.data.data || []).some((r) => r.id === String(booking._id)), 'listed');
  check('vendorId never set on the booking', !finalB.vendorId, String(finalB.vendorId));

  // ════════════════════════════════════════════════════════════════════════
  scenario('Scenario 5 — Vendor A vs Vendor B isolation + no arbitrary status writes');
  const job4 = jobs[3];
  const iso = [
    ['GET job detail', () => vendorB.get(`/jobs/${job1._id}`)],
    ['GET job timeline', () => vendorB.get(`/jobs/${job1._id}/timeline`)],
    ['GET job assignments', () => vendorB.get(`/jobs/${job2._id}/assignments`)],
    ['GET eligible engineers', () => vendorB.get(`/jobs/${job4._id}/eligible-engineers`)],
    ['POST assign own engineer to A\'s job', () => vendorB.post(`/jobs/${job4._id}/assign`, { engineerId: fx.vikram._id })],
    ['POST reassign A\'s job', () => vendorB.post(`/jobs/${job3._id}/reassign`, { engineerId: fx.vikram._id, reason: 'hijack attempt' })],
    ['POST transition A\'s job', () => vendorB.post(`/jobs/${job3._id}/transition`, { to: 'ON_HOLD', reason: 'hijack attempt' })],
    ['GET A\'s job list', () => vendorB.get(`/vendors/${fx.vendorA._id}/jobs`)],
    ['GET A\'s engineers', () => vendorB.get(`/vendors/${fx.vendorA._id}/engineers`)],
    ['GET A\'s dashboard', () => vendorB.get(`/vendors/${fx.vendorA._id}/dashboard`)],
    ['GET A\'s payments', () => vendorB.get(`/vendors/${fx.vendorA._id}/payments`)],
    ['GET A\'s settlements', () => vendorB.get(`/vendors/${fx.vendorA._id}/settlements`)],
    ['GET A\'s assignment history', () => vendorB.get(`/vendors/${fx.vendorA._id}/assignments`)],
    ['PUT A\'s coverage', () => Promise.resolve(covCross)],
    ['legacy GET /vendor/requests/:id', () => vendorB.get(`/vendor/requests/${job4._id}`)],
    ['legacy POST /vendor/requests/:id/assign-engineer', () => vendorB.post(`/vendor/requests/${job4._id}/assign-engineer`, { engineerId: fx.vikram._id })],
    ['legacy POST /vendor/my-jobs/:id/assign-engineer', () => vendorB.post(`/vendor/my-jobs/${job4._id}/assign-engineer`, { engineerId: fx.vikram._id })],
    ['legacy POST /vendor/my-jobs/:id/status', () => vendorB.post(`/vendor/my-jobs/${job4._id}/status`, { status: 'completed' })],
    ['PATCH A\'s engineer profile', () => vendorB.patch(`/vendor/engineers/${fx.rahul._id}`, { skills: ['Plumbing'] })]
  ];
  for (const [name, call] of iso) {
    const r = await call();
    const leaked = r.data && (r.data.data || r.data.job) && r.status !== 403;
    check(`Vendor B → ${name}: 403, no data`, r.status === 403 && !leaked, `status=${r.status} ${JSON.stringify(r.data).slice(0, 160)}`);
  }
  const crossEng = await vendorA.post(`/jobs/${job4._id}/assign`, { engineerId: fx.vikram._id });
  check('Vendor A cannot assign Vendor B\'s engineer to its own job (403)', crossEng.status === 403, `status=${crossEng.status} ${JSON.stringify(crossEng.data).slice(0, 150)}`);
  const vikramApi = client(engTok(fx.vikram));
  const engCross = await vikramApi.post(`/engineers/b2b-jobs/${job3._id}/start`, { startOtp: '123456', beforePhotos: ['x'] });
  check('Vendor B\'s engineer cannot act on Vendor A\'s job', [403, 404].includes(engCross.status), `status=${engCross.status}`);

  const fakeDone = await vendorA.post(`/vendor/my-jobs/${job4._id}/status`, { status: 'completed' });
  check('vendor cannot write status=completed (legacy endpoint)', fakeDone.status === 403, `status=${fakeDone.status}`);
  const fakeClose = await vendorA.post(`/jobs/${job4._id}/transition`, { to: 'CLOSED' });
  check('vendor cannot transition to CLOSED', fakeClose.status === 403, `status=${fakeClose.status}`);
  const b2bPatch = await b2bApi.patch(`/b2b/jobs/${job4._id}`, { status: 'completed', paymentStatus: 'released' });
  check('B2B cannot mass-assign status/payment fields', b2bPatch.status === 400 && (await jobState(job4._id)) === 'PENDING_ASSIGNMENT', `status=${b2bPatch.status} state=${await jobState(job4._id)}`);
  const skip = await rahulApi.post(`/engineers/b2b-jobs/${job2._id}/complete`, { status: 'completed', afterPhotos: ['x'] });
  check('engineer cannot skip from ASSIGNED to completion', skip.status === 409, `status=${skip.status}`);

  // Sockets: forged token, anonymous lifecycle writes, cross-vendor room joins.
  const forged = await connectSocket(tokenFor('ADMIN', fx.admin._id, 'not-the-real-secret'));
  const anon = await connectSocket(null);
  const before4 = await jobState(job3._id);
  anon.emit('engineer:jobCompleted', { engineerId: String(fx.amit._id), jobId: String(job3._id) });
  anon.emit('engineer:workStarted', { engineerId: String(fx.amit._id), jobId: String(job3._id) });
  forged.emit('engineer:jobCompleted', { engineerId: String(fx.amit._id), jobId: String(job3._id) });
  vendorBSock.emit('join_job', String(job1._id));
  await sleep(800);
  check('anonymous/forged socket lifecycle events change nothing', (await jobState(job3._id)) === before4, `state=${await jobState(job3._id)}`);
  check('vendor B cannot join vendor A\'s job room', vendorBSock.events.some((e) => e.event === 'socket:error' && e.payload?.event === 'join_job'), 'no denial');
  const tick = await vendorA.post(`/jobs/${job3._id}/transition`, { to: 'ON_HOLD', reason: 'Waiting for customer' });
  await sleep(500);
  check('control: a legit transition by vendor A is refused for an ACCEPTED job (hold only once en route)', tick.status === 409, `status=${tick.status}`);
  await amitApi.post(`/engineers/b2b-jobs/${job3._id}/start-travel`, {});
  await sleep(500);
  check('forged-admin socket received no admin/job events', !forged.events.some((e) => e.event === 'job:statusChanged' || e.event === 'b2b:jobStatusUpdated'), JSON.stringify(forged.events.map((e) => e.event)));
  check('real admin socket did receive that update', sawStatus(adminSock, job3._id, 'EN_ROUTE'), 'no admin event');

  // ════════════════════════════════════════════════════════════════════════
  scenario('Scenario 6 — Vendor Jobs sections: New → Pending → Assigned → Accepted → In Progress → Completed; Cancelled; Rejected');
  const SECTION_STATES = {
    pending_assignment: ['PENDING_ASSIGNMENT', 'REJECTED'],
    assigned: ['ASSIGNED', 'REASSIGNED'],
    accepted: ['ACCEPTED'],
    in_progress: ['EN_ROUTE', 'ARRIVED', 'IN_PROGRESS', 'ON_HOLD'],
    completed: ['COMPLETED', 'VERIFICATION', 'CLOSED'],
    cancelled: ['CANCELLED', 'FAILED']
  };
  const SECTIONS = ['all', 'new', ...Object.keys(SECTION_STATES), 'rejected'];
  const listA = (params) => vendorA.get(`/vendors/${fx.vendorA._id}/jobs`, { params: { limit: 100, ...params } }).then((r) => r.data);
  const listB = (params) => vendorB.get(`/vendors/${fx.vendorB._id}/jobs`, { params: { limit: 100, ...params } }).then((r) => r.data);
  const rowIn = async (tab, id, list = listA) => (await list({ tab })).data.find((r) => r.id === String(id));

  // Vendor B also covers Indore now, so offers race between two vendors.
  const covB2 = await vendorB.put(`/vendors/${fx.vendorB._id}/service-coverage/AC_REPAIR`, { coverageCities: ['Bhopal', 'Indore'], coveragePincodes: ['462001'] });
  check('vendor B extends its coverage to Indore', covB2.status === 200, JSON.stringify(covB2.data).slice(0, 200));
  const flowRows = ['P', 'Q', 'R', 'S', 'T'].map((k, i) => [`Flow ${k} Store`, `98765411${String(i).padStart(2, '0')}`, `flow${k.toLowerCase()}@example.test`, `Unit ${i + 1}, Palasia`, 'Indore', 'Madhya Pradesh', `45200${i + 1}`, INDORE.lat + i * 0.002, INDORE.lng + i * 0.002, 'AC Repair', '', 'Medium', '27/09/2026', '10:00-12:00']);
  const { id: batch6 } = await uploadBatch(b2bApi, writeCsv(`e2e-flow-${Date.now()}.csv`, flowRows));
  await confirmBatch(b2bApi, batch6);
  await waitFor(async () => (await B2BJob.countDocuments({ batchId: batch6, lifecycleStatus: 'ROUTED', notifiedVendors: { $all: [fx.vendorA._id, fx.vendorB._id] } })) === 5, { timeout: 45000, label: 'flow jobs offered to A and B' });
  const [P, Q, R, S6, T] = await B2BJob.find({ batchId: batch6 }).sort({ jobId: 1 }).lean();

  const first = await listA({ tab: 'all' });
  check('the API exposes exactly the 9 sections (+ overdue/active quick-filter counts)', SECTIONS.every((t) => typeof first.counts[t] === 'number') && typeof first.counts.overdue === 'number' && typeof first.counts.active === 'number' && first.counts.unassigned === undefined, JSON.stringify(first.counts));
  const pNew = await rowIn('new', P._id);
  check('New Requests: offer shows accept/decline only, contact hidden', pNew && pNew.isOffer && pNew.actions.accept && pNew.actions.decline && !pNew.actions.assign && pNew.customer.phone === null && pNew.stage?.kind === 'offer', JSON.stringify(pNew));

  // ── P: the full happy path through every stage section ──
  vendorBSock.events.length = 0;
  const before = (await listA({ tab: 'all' })).counts;
  await vendorA.post(`/jobs/${P._id}/accept`);
  const afterAccept = (await listA({ tab: 'all' })).counts;
  check('accept: New −1, Pending Assignment +1', afterAccept.new === before.new - 1 && afterAccept.pending_assignment === before.pending_assignment + 1, `${JSON.stringify(before)} → ${JSON.stringify(afterAccept)}`);
  const pPending = await rowIn('pending_assignment', P._id);
  check('Pending Assignment: Assign + Hand back offered; contact now visible', pPending && pPending.actions.assign && pPending.actions.release && !pPending.actions.decline && pPending.customer.phone && pPending.stage?.kind === 'awaiting_engineer' && pPending.stage.engineerRejected === null, JSON.stringify(pPending?.actions));
  await sleep(300);
  check('vendor B (lost the race) is told the offer closed', vendorBSock.events.some((e) => e.event === 'vendor:jobOfferClosed' && e.payload?.jobId === String(P._id)), JSON.stringify(vendorBSock.events.map((e) => e.event)));
  check('vendor B no longer sees P anywhere (not New, not Rejected)', !(await rowIn('new', P._id, listB)) && !(await rowIn('rejected', P._id, listB)) && !(await rowIn('all', P._id, listB)), 'P still visible to B');

  await vendorA.post(`/jobs/${P._id}/assign`, { engineerId: fx.rahul._id });
  const pAssigned = await rowIn('assigned', P._id);
  check('assign → Assigned: waiting for engineer acceptance, reassign offered', pAssigned && pAssigned.engineer?.name === 'Rahul Verma' && pAssigned.stage?.kind === 'awaiting_engineer_acceptance' && pAssigned.stage.since && pAssigned.actions.reassign && !pAssigned.actions.release, JSON.stringify(pAssigned?.stage));
  const relBusy = await vendorA.post(`/jobs/${P._id}/release`, { reason: 'Changed our mind' });
  check('cannot hand back a job an engineer is on (409)', relBusy.status === 409 && relBusy.data.code === 'ENGINEER_ON_JOB', `status=${relBusy.status} ${JSON.stringify(relBusy.data)}`);

  await rahulApi.post(`/engineers/b2b-jobs/${P._id}/accept`, {});
  const pAccepted = await rowIn('accepted', P._id);
  check('engineer accepts → Accepted (with acceptance time)', pAccepted && pAccepted.stage?.kind === 'engineer_accepted' && pAccepted.stage.since && pAccepted.actions.reassign, JSON.stringify(pAccepted?.stage));

  await rahulApi.post(`/engineers/b2b-jobs/${P._id}/start-travel`, { location: { lat: INDORE.lat, lng: INDORE.lng } });
  let pProg = await listA({ tab: 'in_progress' });
  check('start travel → In Progress (EN_ROUTE), sub-status count available', pProg.data.some((r) => r.id === String(P._id) && r.status === 'EN_ROUTE') && pProg.statusCounts.EN_ROUTE >= 1, JSON.stringify(pProg.statusCounts));

  const hold = await vendorA.post(`/jobs/${P._id}/transition`, { to: 'ON_HOLD', reason: 'Customer asked to come after lunch' });
  const pHeld = await rowIn('in_progress', P._id);
  check('hold while en route → stays in In Progress as ON_HOLD with the reason and where it resumes', hold.status === 200 && pHeld?.status === 'ON_HOLD' && /after lunch/.test(pHeld.stage?.reason || '') && pHeld.stage.resumeTo === 'EN_ROUTE' && pHeld.actions.resume && pHeld.actions.resumeTo === 'EN_ROUTE', JSON.stringify(pHeld?.stage));
  const wrongResume = await vendorA.post(`/jobs/${P._id}/transition`, { to: 'IN_PROGRESS' });
  check('resume cannot skip ahead to IN_PROGRESS (409)', wrongResume.status === 409, `status=${wrongResume.status}`);
  const resume = await vendorA.post(`/jobs/${P._id}/transition`, { to: 'EN_ROUTE' });
  check('resume → back to EN_ROUTE where it was paused', resume.status === 200 && (await jobState(P._id)) === 'EN_ROUTE', `status=${resume.status} ${JSON.stringify(resume.data)}`);

  await rahulApi.post(`/engineers/b2b-jobs/${P._id}/arrive`, { location: { lat: INDORE.lat + 0.001, lng: INDORE.lng + 0.001 } });
  await rahulApi.post(`/engineers/b2b-jobs/${P._id}/start`, { startOtp: '123456', beforePhotos: ['https://example.test/p-before.jpg'] });
  await rahulApi.post(`/engineers/b2b-jobs/${P._id}/complete`, { status: 'completed', afterPhotos: ['https://example.test/p-after.jpg'], workNotes: 'Done' });
  const pDone = await rowIn('completed', P._id);
  check('work submitted → Completed (awaiting client verification)', pDone && pDone.status === 'VERIFICATION' && pDone.stage?.kind === 'awaiting_verification' && pDone.stage.submittedAt, JSON.stringify(pDone?.stage));
  await b2bApi.post(`/b2b/jobs/${P._id}/approve-work`, { approved: true });
  const pClosed = await rowIn('completed', P._id);
  check('client approves → still in Completed, now CLOSED', pClosed && pClosed.status === 'CLOSED' && pClosed.stage?.kind === 'closed', JSON.stringify(pClosed?.stage));

  // ── Q: declined offer → Rejected (history only) ──
  const decQ = await vendorA.post(`/jobs/${Q._id}/decline`, { reason: 'No capacity this week' });
  const qRej = await rowIn('rejected', Q._id);
  check('decline → leaves New Requests, appears in Rejected as "declined" with the reason', decQ.status === 200 && !(await rowIn('new', Q._id)) && qRej?.rejections?.[0]?.kind === 'offer_declined' && /No capacity/.test(qRej.rejections[0].reason), JSON.stringify(qRej?.rejections));
  check('declined job is history only: no actions, no customer or engineer details', qRej && qRej.actions.view === false && !qRej.actions.accept && qRej.customer.name === null && qRej.engineer === null && qRej.heldByYou === false, JSON.stringify(qRej?.actions));
  check('declined job detail is not readable any more (403)', (await vendorA.get(`/jobs/${Q._id}`)).status === 403, 'readable');
  check('Q is still an open offer for vendor B', Boolean(await rowIn('new', Q._id, listB)), 'missing for B');

  // ── R: accepted, then handed back → re-offered to vendor B, then escalated ──
  await vendorA.post(`/jobs/${R._id}/accept`);
  const relNoReason = await vendorA.post(`/jobs/${R._id}/release`, {});
  check('hand back needs a reason (400)', relNoReason.status === 400, `status=${relNoReason.status}`);
  check('vendor B cannot hand back a job it does not hold (403)', (await vendorB.post(`/jobs/${R._id}/release`, { reason: 'not mine' })).status === 403, 'allowed');
  vendorASock.events.length = 0;
  vendorBSock.events.length = 0;
  const relR = await vendorA.post(`/jobs/${R._id}/release`, { reason: 'Engineer team unavailable' });
  const rDoc = await B2BJob.findById(R._id).read('primary').lean();
  check('hand back → job returns to routing (ROUTED), vendor released', relR.status === 200 && rDoc.lifecycleStatus === 'ROUTED' && !rDoc.assignedVendorId, `status=${relR.status} ${JSON.stringify(relR.data)} state=${rDoc.lifecycleStatus}`);
  check('re-offer carries a fresh deadline', rDoc.vendorOfferExpiresAt && new Date(rDoc.vendorOfferExpiresAt) > new Date(), String(rDoc.vendorOfferExpiresAt));
  const rRej = await rowIn('rejected', R._id);
  check('R appears in vendor A\'s Rejected as "handed back"', rRej?.rejections?.[0]?.kind === 'released' && /Engineer team unavailable/.test(rRej.rejections[0].reason) && !(await rowIn('pending_assignment', R._id)), JSON.stringify(rRej?.rejections));
  await sleep(400);
  check('vendor A panel gets the live status change', vendorASock.events.some((e) => e.event === 'job:statusChanged' && e.payload?.jobId === String(R._id) && e.payload?.lifecycleStatus === 'ROUTED'), JSON.stringify(vendorASock.events.map((e) => e.event)));
  const rForB = await rowIn('new', R._id, listB);
  check('vendor B sees R again in New Requests, with the deadline, and is told live', rForB && rForB.stage?.expiresAt && vendorBSock.events.some((e) => e.event === 'b2b:jobRequestReceived' && e.payload?.mongoId === String(R._id) && e.payload?.reopened), JSON.stringify({ row: rForB?.stage, ev: vendorBSock.events.map((e) => e.event) }));
  await vendorB.post(`/jobs/${R._id}/decline`, { reason: 'Too far' });
  const rEsc = await waitFor(async () => {
    const j = await B2BJob.findById(R._id).read('primary').lean();
    return j.lifecycleStatus === 'UNASSIGNED' ? j : null;
  }, { timeout: 20000, label: 'R escalation' });
  const rEvents = (await adminApi.get(`/jobs/${R._id}/timeline`)).data.data.events;
  check('every vendor said no → unassigned queue; the hand-back stays in the timeline',
    /declined/i.test(rEsc.unassignedReason || rEsc.allocationReason || '') &&
    (await adminApi.get('/routing/unassigned')).data.data.some((r) => r.id === String(R._id)) &&
    rEvents.some((e) => e.event === 'VENDOR_RELEASED' && /Engineer team unavailable/.test(e.remark || '')),
  `${rEsc.allocationReason} | ${JSON.stringify(rEvents.map((e) => e.event))}`);

  // ── T: "decline" on a held job hands it back (older clients) ──
  await vendorA.post(`/jobs/${T._id}/accept`);
  const decT = await vendorA.post(`/jobs/${T._id}/decline`, { reason: 'Double booked' });
  check('decline on a held job = hand back (not a 409)', decT.status === 200 && (await B2BJob.findById(T._id).lean()).assignedVendorId === null, `status=${decT.status} ${JSON.stringify(decT.data)}`);

  // ── S: held job cancelled by the client → Cancelled with reason and who ──
  await vendorA.post(`/jobs/${S6._id}/accept`);
  const cancelS = await b2bApi.delete(`/b2b/jobs/${S6._id}`, { data: { reason: 'Store closed for renovation' } });
  const sRow = await rowIn('cancelled', S6._id);
  check('client cancels → Cancelled section shows reason and that the client cancelled', cancelS.status === 200 && sRow?.stage?.kind === 'cancelled' && /renovation/.test(sRow.stage.reason) && sRow.stage.byRole === 'company' && !sRow.actions.assign, JSON.stringify({ s: cancelS.status, stage: sRow?.stage }));

  // ── Rejected section: every kind, newest first ──
  const rejected = await listA({ tab: 'rejected' });
  const kinds = new Set(rejected.data.flatMap((r) => (r.rejections || []).map((x) => x.kind)));
  const j2row = rejected.data.find((r) => r.id === String(job2._id));
  check('Rejected lists declined offers, hand-backs and engineer rejections', ['offer_declined', 'released', 'engineer_rejected'].every((k) => kinds.has(k)) && j2row?.rejections?.some((x) => x.by === 'engineer' && x.engineerName === 'Amit Joshi') && rejected.counts.rejected === rejected.pagination.total, JSON.stringify([...kinds]));

  // ── Consistency: sections partition held jobs; counts = lists = dashboard ──
  await B2BJob.updateOne({ _id: job2._id }, { $set: { slaDueAt: new Date(Date.now() - 3600000) } });
  const all = await listA({ tab: 'all' });
  for (const tab of Object.keys(SECTION_STATES)) {
    const l = await listA({ tab });
    check(`section "${tab}": count = list total, every row in its states`, l.counts[tab] === l.pagination.total && l.data.every((r) => SECTION_STATES[tab].includes(r.status) && r.heldByYou), `count=${l.counts[tab]} total=${l.pagination.total} statuses=${[...new Set(l.data.map((r) => r.status))]}`);
  }
  const dashF = (await vendorA.get(`/vendors/${fx.vendorA._id}/dashboard`)).data.data.cards;
  const stageSum = Object.keys(SECTION_STATES).reduce((n, t) => n + all.counts[t], 0);
  check('stage sections add up to every job the vendor holds', stageSum === dashF.totalJobs, `sum=${stageSum} held=${dashF.totalJobs}`);
  check('dashboard cards match the sections (new, pending, active, overdue)', dashF.newRequests === all.counts.new && dashF.pendingAssignment === all.counts.pending_assignment && dashF.activeJobs === all.counts.active && dashF.overdueJobs === all.counts.overdue, JSON.stringify({ dash: dashF, counts: all.counts }));
  const od = await listA({ tab: 'all', overdue: 1 });
  check('overdue quick filter: only breached open jobs, includes the late one', od.pagination.total === all.counts.overdue && od.data.some((r) => r.id === String(job2._id)) && od.data.every((r) => r.sla.state === 'breached'), JSON.stringify(od.data.map((r) => [r.jobCode, r.sla.state])));
  const act = await listA({ tab: 'all', active: 1 });
  check('active quick filter matches the Active count', act.pagination.total === all.counts.active && act.data.every((r) => ['ASSIGNED', 'REASSIGNED', 'ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS', 'ON_HOLD'].includes(r.status)), `${act.pagination.total} vs ${all.counts.active}`);
  const aliasOverdue = await listA({ tab: 'overdue' });
  const aliasUnassigned = await listA({ tab: 'unassigned' });
  check('old links ?tab=overdue / ?tab=unassigned still resolve', aliasOverdue.tab === 'all' && aliasOverdue.filters.overdue && aliasOverdue.pagination.total === all.counts.overdue && aliasUnassigned.tab === 'pending_assignment', JSON.stringify({ o: aliasOverdue.tab, u: aliasUnassigned.tab }));

  // ── Jobs created before the lifecycle migration still land in a section ──
  const legacyHeld = await B2BJob.collection.insertOne({
    jobId: `JOB-LEGACY-${Date.now()}`, companyId: fx.company._id, customerName: 'Legacy Store', phone: '9876500001', address: 'Old Palasia',
    city: 'Indore', pincode: '452001', service: 'AC Repair', status: 'accepted', assignedVendorId: fx.vendorB._id, charge: 1000,
    createdAt: new Date(), updatedAt: new Date()
  });
  const legacyRow = await rowIn('pending_assignment', legacyHeld.insertedId, listB);
  check('a pre-migration job (no lifecycleStatus) is healed into Pending Assignment', Boolean(legacyRow), 'legacy job invisible');

  // ════════════════════════════════════════════════════════════════════════
  scenario('Scenario 7 — Vendor Engineers sections: All · Add · Pending · Active · Inactive · Skills · Availability · Performance');
  const EngineerM = M('Engineer');
  const engBase = `/vendors/${fx.vendorA._id}/engineers`;
  const teamA = (params) => vendorA.get(engBase, { params: { limit: 200, ...params } }).then((r) => r.data);
  const member = async (id, params = {}) => (await teamA(params)).data.find((e) => e.id === String(id));

  const t0 = await teamA({ tab: 'all' });
  check('sections: Pending + Active + Inactive = All', t0.counts.pending + t0.counts.active + t0.counts.inactive === t0.counts.all && ['pending', 'active', 'inactive'].every((k) => typeof t0.counts[k] === 'number'), JSON.stringify(t0.counts));
  check('Rahul, Amit and Sunil are Active', ['Rahul Verma', 'Amit Joshi', 'Sunil Patel'].every((n) => t0.data.find((e) => e.name === n)?.status === 'ACTIVE'), JSON.stringify(t0.data.map((e) => [e.name, e.status])));

  // ── Add Engineer ──
  const badDay = await vendorA.post('/vendor/engineers', { name: 'Bad Day', phone: '9200000078', skills: 'AC Repair', city: 'Indore', workingDays: ['Funday'] });
  const noCity = await vendorA.post('/vendor/engineers', { name: 'No City', phone: '9200000079', skills: 'AC Repair' });
  check('add engineer validates working days and base city (400)', badDay.status === 400 && noCity.status === 400, `${badDay.status}/${noCity.status}`);
  const add = await vendorA.post('/vendor/engineers', {
    name: 'Neeraj Soni', phone: '9200000077', skills: ['AC Repair'], city: 'Indore', cities: ['Dewas'], serviceRadiusKm: 15,
    workingDays: ['Mon', 'Tue'], workingHours: { start: '09:00', end: '18:30' }, experienceYears: 4
  });
  const neeraj = await member(add.data?.data?.id, { tab: 'pending' });
  check('added engineer lands in Pending (waiting for WBI), schedule stored', add.status === 201 && neeraj?.pendingOn === 'wbi' && neeraj.schedule.workingDays.join() === 'Monday,Tuesday' && neeraj.schedule.workingHours?.end === '06:30 PM' && neeraj.experienceYears === 4, JSON.stringify(neeraj));

  // ── Join requests (invite link): vendor approval never grants WBI verification ──
  const mkJoin = (name, phone) => EngineerM.create({
    name, phone, roleType: 'Engineer', engineerType: 'vendor_engineer', vendorId: fx.vendorA._id, vendorApprovalStatus: 'pending_approval',
    approvalStatus: 'pending', isActive: true, primarySkill: 'AC Repair', serviceCategories: ['AC Repair'], linkedViaCode: 'E2ECODE',
    address: { city: 'Indore' }, workLocations: { primaryArea: 'Indore', availableCities: ['Indore'], serviceRadius: 20 }
  });
  const kiran = await mkJoin('Kiran Rao', '9200000066');
  const mohan = await mkJoin('Mohan Das', '9200000065');
  const vinod = await mkJoin('Vinod Jain', '9200000064');
  const kRow = await member(kiran._id, { tab: 'pending', pendingOn: 'vendor' });
  check('join request shows in Pending as "waiting for your approval" with approve/reject', kRow?.pendingOn === 'vendor' && kRow.actions.approveJoin && kRow.actions.rejectJoin, JSON.stringify(kRow?.actions));
  check('vendor B cannot decide vendor A\'s join request (403)', (await vendorB.post(`${engBase}/${kiran._id}/approve`)).status === 403, 'allowed');
  const apK = await vendorA.post(`${engBase}/${kiran._id}/approve`);
  const kDoc = await EngineerM.findById(kiran._id).lean();
  check('approve → in the team, still Pending until WBI verifies (no verification bypass)', apK.status === 200 && kDoc.vendorApprovalStatus === 'approved' && kDoc.approvalStatus === 'pending' && apK.data.data.pendingOn === 'wbi', JSON.stringify({ s: apK.status, v: kDoc.vendorApprovalStatus, a: kDoc.approvalStatus }));
  await vendorA.post(`/vendor/engineers/${mohan._id}/approve`);
  check('the older approve endpoint no longer grants WBI verification either', (await EngineerM.findById(mohan._id).lean()).approvalStatus === 'pending', 'bypass');
  const rjV = await vendorA.post(`${engBase}/${vinod._id}/reject`, { reason: 'Not hiring now' });
  const vDoc = await EngineerM.findById(vinod._id).lean();
  check('reject → leaves the team; their WBI status is untouched', rjV.status === 200 && vDoc.vendorId === null && vDoc.vendorApprovalStatus === 'rejected' && vDoc.approvalStatus === 'pending' && !(await member(vinod._id)), JSON.stringify({ v: vDoc.vendorApprovalStatus, a: vDoc.approvalStatus }));
  const wbi = await adminApi.post(`/admin/engineers/${kiran._id}/approve`);
  check('WBI verifies Kiran → Active', wbi.status === 200 && (await member(kiran._id))?.status === 'ACTIVE', `status=${wbi.status}`);

  // ── Deactivate / reactivate (Inactive section) ──
  const rahulRow = await member(fx.rahul._id);
  const deRahul = await vendorA.post(`${engBase}/${fx.rahul._id}/deactivate`, { reason: 'Leaving' });
  check('cannot deactivate an engineer who is on a job (409, lists the jobs)', deRahul.status === 409 && deRahul.data.code === 'ENGINEER_HAS_JOBS' && rahulRow.actions.deactivateBlockedBy.length > 0, `status=${deRahul.status} ${JSON.stringify(deRahul.data)}`);
  check('deactivation needs a reason (400)', (await vendorA.post(`${engBase}/${kiran._id}/deactivate`, {})).status === 400, 'no reason accepted');
  check('vendor B cannot deactivate vendor A\'s engineer (403)', (await vendorB.post(`${engBase}/${kiran._id}/deactivate`, { reason: 'hijack' })).status === 403, 'allowed');
  const deK = await vendorA.post(`${engBase}/${kiran._id}/deactivate`, { reason: 'Contract paused' });
  const kIn = await member(kiran._id, { tab: 'inactive' });
  check('deactivate → Inactive "Deactivated by you", reactivate offered', deK.status === 200 && kIn?.statusReason === 'Deactivated by you' && kIn.actions.reactivate, JSON.stringify(kIn));
  const eligK = await vendorA.get(`/jobs/${jobs[4]._id}/eligible-engineers`);
  const kInelig = (eligK.data.ineligible || []).find((e) => e.name === 'Kiran Rao');
  check('routing: deactivated engineer is not eligible, with the reason', kInelig && kInelig.reasons.some((r) => /deactivated/i.test(r)) && !(eligK.data.data || []).some((e) => e.name === 'Kiran Rao'), JSON.stringify(kInelig));
  await vendorA.get('/vendor/engineers'); // the old roster page syncs on load
  check('the roster sync no longer re-activates a deactivated engineer', (await member(kiran._id))?.status === 'INACTIVE', 'sync reset the status');
  const roster = await M('VendorWorkforceEngineer').findOne({ vendorId: fx.vendorA._id, linkedEngineerId: fx.rahul._id }).lean();
  const legacyBad = await vendorA.patch(`/vendor/engineers/${roster._id}/status`, { action: 'bogus' });
  const legacyBusy = await vendorA.patch(`/vendor/engineers/${roster._id}/status`, { action: 'deactivate' });
  check('old roster status endpoint: unknown action 400, busy engineer 409', legacyBad.status === 400 && legacyBusy.status === 409, `${legacyBad.status}/${legacyBusy.status}`);
  const reK = await vendorA.post(`${engBase}/${kiran._id}/activate`);
  const elig2 = await vendorA.get(`/jobs/${jobs[4]._id}/eligible-engineers`);
  check('reactivate → Active and eligible again', reK.status === 200 && reK.data.data.status === 'ACTIVE' && (elig2.data.data || []).some((e) => e.name === 'Kiran Rao'), JSON.stringify((elig2.data.ineligible || []).find((e) => e.name === 'Kiran Rao')));

  // Routing ranks a vendor by engineers who can actually work.
  const rJob = await B2BJob.findById(R._id).lean();
  await vendorB.post(`/vendors/${fx.vendorB._id}/engineers/${fx.vikram._id}/deactivate`, { reason: 'Training week' });
  const candOff = await adminApi.get(`/routing/jobs/${rJob._id}/candidates`);
  const bOff = (candOff.data.rejected || []).find((v) => v.vendorId === String(fx.vendorB._id));
  await vendorB.post(`/vendors/${fx.vendorB._id}/engineers/${fx.vikram._id}/activate`);
  const candOn = await adminApi.get(`/routing/jobs/${rJob._id}/candidates`);
  check('routing: a vendor whose only skilled engineer is deactivated is not eligible; eligible again after reactivation',
    bOff && bOff.reasons.some((r) => /No engineer skilled/.test(r)) && (candOn.data.data || []).some((v) => v.vendorId === String(fx.vendorB._id)),
  JSON.stringify({ off: bOff, on: (candOn.data.data || []).map((v) => v.name) }));

  // ── Availability ──
  const amitRoster = await M('VendorWorkforceEngineer').findOne({ vendorId: fx.vendorA._id, linkedEngineerId: fx.amit._id }).lean()
    || await M('VendorWorkforceEngineer').create({ vendorId: fx.vendorA._id, linkedEngineerId: fx.amit._id, name: 'Amit Joshi', status: 'active' });
  await M('VendorWorkforceLeave').create({ vendorId: fx.vendorA._id, engineerId: amitRoster._id, engineerName: 'Amit Joshi', leaveType: 'sick', startDate: new Date(Date.now() - 86400000), endDate: new Date(Date.now() + 86400000), status: 'approved', reason: 'Fever' });
  const notToday = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].filter((_, i) => (i + 1) % 7 !== new Date().getDay()).slice(0, 2);
  await vendorA.patch(`/vendor/engineers/${kiran._id}`, { workingDays: notToday });
  const actTeam = await teamA({ tab: 'active' });
  const amitA = actTeam.data.find((e) => e.id === String(fx.amit._id));
  const kiranA = actTeam.data.find((e) => e.id === String(kiran._id));
  const rahulA = actTeam.data.find((e) => e.id === String(fx.rahul._id));
  check('availability: approved leave → on leave (with end date)', amitA?.availability.status === 'on_leave' && amitA.availability.leaveUntil && !amitA.availability.canTakeJobs, JSON.stringify(amitA?.availability));
  check('availability: not a working day → off today', kiranA?.availability.status === 'off_today', JSON.stringify(kiranA?.availability));
  check('availability: holding a job → busy, with job count', ['busy', 'at_capacity'].includes(rahulA?.availability.status) && rahulA.availability.activeJobs >= 1 && rahulA.currentJobs.length >= 1, JSON.stringify(rahulA?.availability));
  const onLeaveList = await teamA({ tab: 'active', availability: 'on_leave' });
  check('availability filter + counts agree', onLeaveList.data.every((e) => e.availability.status === 'on_leave') && onLeaveList.pagination.total === actTeam.counts.availability.on_leave, JSON.stringify(actTeam.counts.availability));
  const eligLeave = await vendorA.get(`/jobs/${jobs[4]._id}/eligible-engineers`);
  check('routing agrees: engineer on leave is not eligible', (eligLeave.data.ineligible || []).some((e) => e.name === 'Amit Joshi' && e.reasons.some((r) => /leave/i.test(r))), JSON.stringify((eligLeave.data.ineligible || []).map((e) => [e.name, e.reasons])));
  const dashE = (await vendorA.get(`/vendors/${fx.vendorA._id}/dashboard`)).data.data.cards;
  check('dashboard engineer cards match the section counts', dashE.availableEngineers === actTeam.counts.availability.available && dashE.busyEngineers === actTeam.counts.availability.busy + actTeam.counts.availability.at_capacity, JSON.stringify({ dash: [dashE.availableEngineers, dashE.busyEngineers], counts: actTeam.counts.availability }));

  // ── Skills ──
  const skills = (await vendorA.get(`${engBase}/skills`)).data.data;
  const ac = skills.services.find((s) => s.serviceKey === 'AC_REPAIR');
  const sunilS = skills.engineers.find((e) => e.name === 'Sunil Patel');
  check('skills: AC_REPAIR lists the skilled active engineers (routing matcher)', ac && ['Rahul Verma', 'Amit Joshi', 'Kiran Rao'].every((n) => ac.activeEngineers.some((e) => e.name === n)) && ac.covered && ac.engineers.pending >= 1, JSON.stringify(ac));
  check('skills: Sunil (Plumbing) matches none of your services and is flagged', sunilS && sunilS.matchesServices.length === 0 && skills.unmatchedSkills.some((u) => u.skill === 'Plumbing'), JSON.stringify({ sunilS, unmatched: skills.unmatchedSkills }));

  // ── Performance ──
  const perf = (await vendorA.get(`${engBase}/performance`)).data.data;
  const pRahul = perf.rows.find((r) => r.name === 'Rahul Verma');
  const pAmit = perf.rows.find((r) => r.name === 'Amit Joshi');
  check('performance: Rahul completed jobs with SLA and turnaround measured', pRahul && pRahul.completed >= 2 && pRahul.accepted >= 2 && pRahul.slaTracked >= 1 && pRahul.avgTurnaroundMinutes !== null, JSON.stringify(pRahul));
  check('performance: Amit\'s rejection lowers his acceptance rate', pAmit && pAmit.rejected >= 1 && pAmit.acceptanceRate < 100, JSON.stringify(pAmit));
  check('performance totals add up', perf.totals.completed === perf.rows.reduce((n, r) => n + r.completed, 0) && perf.totals.assigned === perf.rows.reduce((n, r) => n + r.assigned, 0), JSON.stringify(perf.totals));
  check('performance rejects bad dates (400)', (await vendorA.get(`${engBase}/performance`, { params: { from: 'yesterday' } })).status === 400, 'accepted');

  // ── Detail ──
  const det = await vendorA.get(`${engBase}/${fx.rahul._id}`);
  check('engineer detail: current jobs, assignment history, performance', det.status === 200 && det.data.data.currentJobs.length >= 1 && det.data.data.assignments.length >= 2 && det.data.data.performance?.completed >= 2, `status=${det.status}`);
  check('engineer detail is private to the vendor (B → 403) and validates ids (400)', (await vendorB.get(`${engBase}/${fx.rahul._id}`)).status === 403 && (await vendorA.get(`${engBase}/not-an-id`)).status === 400, 'leak');

  // ════════════════════════════════════════════════════════════════════════
  scenario('Scenario 8 — Assignments · Services · Parts');
  const vA = `/vendors/${fx.vendorA._id}`;
  const jobsTab = async (tab) => (await vendorA.get(`${vA}/jobs`, { params: { tab, limit: 100 } })).data;

  // ── Assign Job (queue) ──
  const q1 = (await vendorA.get(`${vA}/assignments/queue`, { params: { limit: 25 } })).data;
  const pendingCount = (await jobsTab('pending_assignment')).counts.pending_assignment;
  check('Assign Job queue = every job waiting for an engineer', q1.pagination.total === pendingCount && q1.pagination.total > 0, `${q1.pagination.total} vs ${pendingCount}`);
  const qRow = q1.data.find((r) => r.id === String(jobs[5]._id));
  check('each job shows its best eligible engineers (not the one on leave)', qRow && qRow.candidates.length > 0 && qRow.candidates.every((c) => c.name !== 'Amit Joshi') && qRow.eligibleCount >= 1, JSON.stringify(qRow?.candidates));
  const slaSorted = q1.data.every((r, i, a) => i === 0 || !a[i - 1].sla.dueAt || !r.sla.dueAt || new Date(a[i - 1].sla.dueAt) <= new Date(r.sla.dueAt));
  check('queue is ordered by SLA due time', slaSorted, JSON.stringify(q1.data.map((r) => r.sla.dueAt)));

  // ── Bulk Assignment (auto) ──
  const bulkIds = [jobs[5]._id, jobs[6]._id, jobs[7]._id, Q._id].map(String);
  const auto = await vendorA.post(`${vA}/assignments/auto`, { jobIds: bulkIds });
  const autoOk = (auto.data.data || []).filter((r) => r.ok);
  check('auto-assign: the 3 held jobs get an eligible engineer; a job you do not hold is refused', auto.status === 200 && autoOk.length === 3 && autoOk.every((r) => ['Rahul Verma', 'Kiran Rao'].includes(r.engineer)) && auto.data.data.find((r) => r.jobId === String(Q._id))?.ok === false, JSON.stringify(auto.data));
  check('auto-assigned jobs are ASSIGNED and left the queue', (await Promise.all([5, 6, 7].map((i) => jobState(jobs[i]._id)))).every((s) => s === 'ASSIGNED') && !(await vendorA.get(`${vA}/assignments/queue`, { params: { limit: 25 } })).data.data.some((r) => bulkIds.includes(r.id)), 'still queued');
  check('vendor B cannot auto-assign vendor A\'s jobs (403)', (await vendorB.post(`${vA}/assignments/auto`, { jobIds: [String(jobs[8]._id)] })).status === 403, 'allowed');

  // ── Reassignment ──
  await M('JobAssignment').collection.updateOne({ jobId: jobs[5]._id, isOpen: true }, { $set: { assignedAt: new Date(Date.now() - 2 * 3600000) } });
  const board = (await vendorA.get(`${vA}/assignments/reassignable`)).data;
  const staleRow = board.data.find((r) => r.id === String(jobs[5]._id));
  const leaveRow = board.data.find((r) => r.id === String(job3._id));
  check('reassignment board flags a job not accepted in time', staleRow?.flags.some((f) => f.code === 'not_accepted'), JSON.stringify(staleRow?.flags));
  check('reassignment board flags a job whose engineer is on leave', leaveRow?.flags.some((f) => f.code === 'engineer_on_leave'), JSON.stringify(leaveRow?.flags));
  check('flagged jobs come first', board.data[0].severity >= board.data[board.data.length - 1].severity && board.summary.needsAttention >= 2, JSON.stringify(board.summary));
  const cur = (await B2BJob.findById(jobs[5]._id).lean()).assignedToName;
  const other = cur === 'Rahul Verma' ? kiran._id : fx.rahul._id;
  const reas8 = await vendorA.post(`/jobs/${jobs[5]._id}/reassign`, { engineerId: other, reason: 'Not accepted in time' });
  const board2 = (await vendorA.get(`${vA}/assignments/reassignable`)).data;
  check('reassignment is recorded with from, to and reason', reas8.status === 200 && board2.recent.some((r) => r.jobId === String(jobs[5]._id) && r.from === cur && /Not accepted in time/.test(r.reason)), JSON.stringify(board2.recent.slice(0, 2)));

  // ── Assignment History ──
  const hist = (await vendorA.get(`${vA}/assignments`, { params: { status: 'reassigned', limit: 100 } })).data;
  check('history filters by outcome and carries job details', hist.data.length >= 1 && hist.data.every((r) => r.status === 'reassigned') && hist.data[0].service && hist.data[0].city, JSON.stringify(hist.data[0]));
  check('history outcome counts cover every status', ['assigned', 'rejected', 'reassigned', 'completed'].every((k) => (hist.outcomes[k] || 0) >= 1), JSON.stringify(hist.outcomes));
  const byCode = (await vendorA.get(`${vA}/assignments`, { params: { search: jobs[5].jobId } })).data;
  check('history search by job code', byCode.data.length >= 2 && byCode.data.every((r) => r.jobCode === jobs[5].jobId) && byCode.data.some((r) => r.routingMode === 'auto'), JSON.stringify(byCode.data.map((r) => [r.jobCode, r.status, r.routingMode])));
  check('assignment history is private (B → 403)', (await vendorB.get(`${vA}/assignments`)).status === 403, 'leak');

  // ── My Services ──
  const my = (await vendorA.get(`${vA}/services`)).data;
  const acSvc = my.data.find((s) => s.serviceKey === 'AC_REPAIR');
  check('My Services: AC_REPAIR ready, with coverage, engineers, live jobs and SLA rules', acSvc && acSvc.readiness === 'ready' && acSvc.coverage.areas > 0 && acSvc.engineers.active >= 1 && acSvc.jobs.active >= 1 && acSvc.slaRules.length === 2, JSON.stringify(acSvc));

  // ── Service Keys ──
  const keys = (await vendorA.get(`${vA}/service-keys`)).data.data;
  const acKey = keys.find((k) => k.serviceKey === 'AC_REPAIR');
  check('Service Keys: aliases and sub-service keys from the catalog', acKey && acKey.aliases.includes('Air Conditioner') && acKey.subServices.some((x) => x.key === 'AC_GAS' && x.name === 'Gas Refill'), JSON.stringify(acKey));
  const rAir = (await vendorA.get(`${vA}/service-keys/resolve`, { params: { service: 'Air Conditioner' } })).data.data;
  const rPl = (await vendorA.get(`${vA}/service-keys/resolve`, { params: { service: 'Plumbing' } })).data.data;
  const rBad = await vendorA.get(`${vA}/service-keys/resolve`, { params: { service: '' } });
  check('resolver: "Air Conditioner" → AC_REPAIR (yours), "Plumbing" → PLUMBING (not yours), empty → 400', rAir.serviceKey === 'AC_REPAIR' && rAir.yours && rPl.serviceKey === 'PLUMBING' && !rPl.yours && rBad.status === 400, JSON.stringify({ rAir, rPl, bad: rBad.status }));

  // ── Service Areas ──
  const areas1 = (await vendorA.get(`${vA}/service-areas`)).data;
  const indore = areas1.data.find((a) => a.type === 'city' && a.value === 'indore');
  check('Service Areas: Indore with its service, engineers and recent jobs', indore && indore.services.some((s) => s.serviceKey === 'AC_REPAIR') && indore.engineers >= 1 && indore.jobs30d >= 1 && areas1.data.some((a) => a.value === '452001'), JSON.stringify(indore));
  const badPin = await vendorA.post(`${vA}/service-areas`, { action: 'add', pincodes: ['12'], serviceKeys: ['AC_REPAIR'] });
  const notMine = await vendorA.post(`${vA}/service-areas`, { action: 'add', cities: ['Dewas'], serviceKeys: ['PLUMBING'] });
  check('areas: invalid pincode 400, service you are not approved for 403', badPin.status === 400 && notMine.status === 403, `${badPin.status}/${notMine.status}`);
  const addDewas = await vendorA.post(`${vA}/service-areas`, { action: 'add', cities: ['Dewas'], pincodes: ['455001'], serviceKeys: ['AC_REPAIR'] });
  const areas2 = (await vendorA.get(`${vA}/service-areas`)).data;
  const dewas = areas2.data.find((a) => a.value === 'dewas');
  check('add area → routing coverage updated; flagged when no active engineer is there', addDewas.status === 200 && dewas && dewas.warning && areas2.data.some((a) => a.value === '455001') && (await M('VendorServiceCoverage').findOne({ vendorId: fx.vendorA._id, serviceKey: 'AC_REPAIR' }).lean()).coverageCities.includes('dewas'), JSON.stringify(dewas));
  await vendorA.post(`${vA}/service-areas`, { action: 'remove', cities: ['Dewas'], pincodes: ['455001'], serviceKeys: ['AC_REPAIR'] });
  check('remove area → gone from coverage', !(await vendorA.get(`${vA}/service-areas`)).data.data.some((a) => ['dewas', '455001'].includes(a.value)), 'still there');
  check('service areas are private (B → 403)', (await vendorB.post(`${vA}/service-areas`, { action: 'add', cities: ['X'], serviceKeys: ['AC_REPAIR'] })).status === 403, 'allowed');

  // ── Parts catalog & inventory ──
  const cat = await M('Category').create({ title: 'AC Parts', slug: `acSvc-parts-${Date.now()}` });
  const r32 = await M('VendorPartsCatalog').create({ name: 'R32 Refrigerant 1kg', hsnCode: '38247800', price: 650, gstPercentage: 18, categoryId: cat._id });
  const catalog = (await vendorA.get(`${vA}/parts/catalog`, { params: { search: 'R32' } })).data;
  check('Parts: WBI catalog with price, HSN and category', catalog.data.some((p) => p.id === String(r32._id) && p.price === 650 && p.category?.name === 'AC Parts' && p.inStock === null), JSON.stringify(catalog.data));
  const inv1 = await vendorA.post(`${vA}/parts/inventory`, { catalogPartId: String(r32._id), quantity: 5, reorderLevel: 2, serviceKey: 'AC_REPAIR' });
  const dupInv = await vendorA.post(`${vA}/parts/inventory`, { catalogPartId: String(r32._id), quantity: 1, serviceKey: 'AC_REPAIR' });
  const badSvc = await vendorA.post(`${vA}/parts/inventory`, { name: 'Pipe', quantity: 1, serviceKey: 'PLUMBING' });
  const pipe = await vendorA.post(`${vA}/parts/inventory`, { name: 'Copper pipe 1m', quantity: 1, reorderLevel: 2, unitCost: 120, serviceKey: 'AC_REPAIR' });
  check('Inventory: add from catalog (price carried) and free items; duplicates and other services refused', inv1.status === 201 && inv1.data.data.available === 5 && inv1.data.data.unitCost === 650 && dupInv.status === 409 && badSvc.status === 400 && pipe.status === 201 && pipe.data.data.stockStatus === 'low_stock', JSON.stringify({ a: inv1.status, d: dupInv.status, b: badSvc.status, p: pipe.data?.data?.stockStatus }));
  const r32Item = inv1.data.data.id;
  const pipeItem = pipe.data.data.id;
  check('catalog now shows your stock', (await vendorA.get(`${vA}/parts/catalog`, { params: { search: 'R32' } })).data.data[0].inStock === 5, 'no stock shown');

  // ── Required Parts ──
  const rq1 = await vendorA.post(`${vA}/parts/jobs`, { jobId: String(jobs[4]._id), inventoryItemId: r32Item, quantity: 2, reserve: true });
  const rq2 = await vendorA.post(`${vA}/parts/jobs`, { jobId: String(jobs[4]._id), inventoryItemId: pipeItem, quantity: 3, reserve: true });
  const rq3 = await vendorA.post(`${vA}/parts/jobs`, { jobId: String(jobs[4]._id), name: 'Capacitor 45uF', quantity: 1, unitPrice: 180 });
  check('required part reserved from stock; short stock stays required with the shortfall; unstocked part allowed',
    rq1.data.data?.status === 'reserved' && rq2.data.data?.status === 'required' && rq2.data.data.stockState === 'short' && rq2.data.data.shortBy === 2 && /not reserved/.test(rq2.data.message) && rq3.data.data?.stockState === 'not_stocked',
  JSON.stringify([rq1.data.data?.status, rq2.data, rq3.data.data?.stockState]));
  const invAfter = (await vendorA.get(`${vA}/parts/inventory`, { params: { search: 'R32' } })).data.data[0];
  check('reservation moved stock: 3 free, 2 reserved, 1 job', invAfter.available === 3 && invAfter.reserved === 2 && invAfter.reservedForJobs === 1, JSON.stringify(invAfter));
  check('parts only on your open jobs (B → 403, closed job → 409)', (await vendorB.post(`${vA}/parts/jobs`, { jobId: String(jobs[4]._id), name: 'X', quantity: 1 })).status === 403 && (await vendorA.post(`${vA}/parts/jobs`, { jobId: String(P._id), name: 'X', quantity: 1 })).status === 409, 'allowed');
  const reqList = (await vendorA.get(`${vA}/parts/jobs`, { params: { view: 'required' } })).data;
  check('Required Parts summary', reqList.summary.required === 2 && reqList.summary.reserved === 1 && reqList.summary.short === 1 && reqList.summary.notStocked === 1, JSON.stringify(reqList.summary));

  const use1 = await vendorA.post(`${vA}/parts/jobs/${rq1.data.data.id}/use`, {});
  const use3 = await vendorA.post(`${vA}/parts/jobs/${rq3.data.data.id}/use`, {});
  const use2 = await vendorA.post(`${vA}/parts/jobs/${rq2.data.data.id}/use`, {});
  const r32After = (await vendorA.get(`${vA}/parts/inventory`, { params: { search: 'R32' } })).data.data[0];
  const rq2State = (await M('JobPart').findById(rq2.data.data.id).lean()).status;
  check('use: reserved stock consumed; unstocked part used; short stock refused and left as required', use1.status === 200 && use3.status === 200 && use2.status === 409 && rq2State === 'required' && r32After.available === 3 && r32After.reserved === 0, JSON.stringify({ u1: use1.status, u2: use2.status, u3: use3.status, rq2State, r32After }));
  check('cancel needs a reason; cancelled part leaves the list', (await vendorA.post(`${vA}/parts/jobs/${rq2.data.data.id}/cancel`, {})).status === 400 && (await vendorA.post(`${vA}/parts/jobs/${rq2.data.data.id}/cancel`, { reason: 'Customer supplied pipe' })).status === 200, 'cancel');

  // ── Inventory adjustments ──
  const restock = await vendorA.patch(`${vA}/parts/inventory/${pipeItem}`, { action: 'restock', quantity: 5, note: 'PO-1001' });
  const dmgNoNote = await vendorA.patch(`${vA}/parts/inventory/${pipeItem}`, { action: 'damaged', quantity: 1 });
  const correct = await vendorA.patch(`${vA}/parts/inventory/${pipeItem}`, { action: 'correct', quantity: 4, note: 'Physical count' });
  const moves = (await vendorA.get(`${vA}/parts/inventory/${pipeItem}/movements`)).data.data.map((m) => m.type);
  check('restock / correction update stock; damage needs a note; every change is logged', restock.data.data?.available === 6 && dmgNoNote.status === 400 && correct.data.data?.available === 4 && ['create', 'restock', 'correction'].every((t) => moves.includes(t)), JSON.stringify({ r: restock.data.data?.available, d: dmgNoNote.status, c: correct.data.data?.available, moves }));

  // ── Concurrency: the last unit can only be reserved once ──
  const relay = (await vendorA.post(`${vA}/parts/inventory`, { name: 'Relay 12V', quantity: 1, serviceKey: 'AC_REPAIR' })).data.data;
  const [ra, rb] = await Promise.all([jobs[4], jobs[9]].map((j) => vendorA.post(`${vA}/parts/jobs`, { jobId: String(j._id), inventoryItemId: relay.id, quantity: 1 })));
  const [resA, resB] = await Promise.all([ra, rb].map((r) => vendorA.post(`${vA}/parts/jobs/${r.data.data.id}/reserve`)));
  const relayAfter = (await vendorA.get(`${vA}/parts/inventory`, { params: { search: 'Relay' } })).data.data[0];
  check('two simultaneous reservations of the last unit: exactly one wins', [resA.status, resB.status].sort().join() === '200,409' && relayAfter.available === 0 && relayAfter.reserved === 1, JSON.stringify({ a: resA.status, b: resB.status, relayAfter }));

  // ── Cancelled job releases its parts ──
  const rqC = await vendorA.post(`${vA}/parts/jobs`, { jobId: String(jobs[8]._id), inventoryItemId: r32Item, quantity: 1, reserve: true });
  await b2bApi.delete(`/b2b/jobs/${jobs[8]._id}`, { data: { reason: 'Duplicate order' } });
  const released = await waitFor(async () => (await M('JobPart').findById(rqC.data.data.id).lean()).status === 'cancelled', { timeout: 10000, label: 'parts release' }).catch(() => false);
  const r32Final = (await vendorA.get(`${vA}/parts/inventory`, { params: { search: 'R32' } })).data.data[0];
  check('job cancelled → its reserved parts go back to stock', rqC.data.data?.status === 'reserved' && released && r32Final.available === 3 && r32Final.reserved === 0, JSON.stringify({ released, r32Final }));

  // ── Used Parts ──
  const direct = await vendorA.post(`${vA}/parts/jobs/used`, { jobId: String(jobs[4]._id), name: 'Fuse 5A', quantity: 2, unitPrice: 20, fromStock: false });
  const used = (await vendorA.get(`${vA}/parts/jobs`, { params: { view: 'used' } })).data;
  check('Used Parts: consumed parts with value; direct records allowed', direct.status === 201 && used.summary.parts === 3 && used.summary.value === 2 * 650 + 180 + 40 && Array.isArray(used.legacy), JSON.stringify(used.summary));
  const detV = (await vendorA.get(`/jobs/${jobs[4]._id}`)).data.data.parts.items;
  const detB = (await b2bApi.get(`/jobs/${jobs[4]._id}`)).data.data.parts.items;
  check('job detail lists its parts for the vendor, hides vendor costs from the client', detV.length >= 3 && detB.length === 0, `${detV.length}/${detB.length}`);

  // ════════════════════════════════════════════════════════════════════════
  scenario('Regression — existing panel endpoints still work');
  const regressions = [
    ['B2B jobs list', () => b2bApi.get('/b2b/jobs')],
    ['B2B job stats', () => b2bApi.get('/b2b/jobs/stats')],
    ['B2B job details (legacy)', () => b2bApi.get(`/b2b/jobs/${job1._id}`)],
    ['B2B bulk history', () => b2bApi.get('/b2b/bulk-jobs/history')],
    ['Admin escalation queue', () => adminApi.get('/admin/b2b/jobs/escalations')],
    ['Admin submissions queue', () => adminApi.get('/admin/b2b/jobs/submissions')],
    ['Admin engineer suggestions', () => adminApi.get(`/admin/b2b/jobs/escalations/${jobs[4]._id}/engineer-suggestions`)],
    ['Vendor requests (legacy)', () => vendorA.get('/vendor/requests')],
    ['Vendor my-jobs (legacy)', () => vendorA.get('/vendor/my-jobs')],
    ['Vendor my-jobs details (legacy)', () => vendorA.get(`/vendor/my-jobs/${job1._id}`)],
    ['Vendor engineers (legacy)', () => vendorA.get('/vendor/engineers')],
    ['Vendor assignable jobs (legacy)', () => vendorA.get('/vendor/engineers/assignable-jobs')],
    ['Vendor analytics', () => vendorA.get(`/vendors/${fx.vendorA._id}/analytics`)],
    ['Vendor engineers (new)', () => vendorA.get(`/vendors/${fx.vendorA._id}/engineers`)],
    ['Vendor coverage', () => vendorA.get(`/vendors/${fx.vendorA._id}/service-coverage`)],
    ['TazkY B2B summary', () => rahulApi.get('/engineers/b2b-jobs/summary')],
    ['TazkY job detail', () => rahulApi.get(`/engineers/b2b-jobs/${job1._id}`)],
    ['Health', () => axios.get(`${BASE}/health`, { validateStatus: () => true })]
  ];
  for (const [name, call] of regressions) {
    const r = await call();
    check(`${name} → 200`, r.status === 200 && r.data?.success !== false, `status=${r.status} ${JSON.stringify(r.data).slice(0, 160)}`);
  }
  const legacyDetail = await vendorA.get(`/vendor/my-jobs/${job1._id}`);
  check('legacy job details no longer fabricate a 70% engineer payout', legacyDetail.data?.data?.financials?.engineerPayout === undefined && typeof legacyDetail.data?.data?.financials?.vendorEarnings === 'number', JSON.stringify(legacyDetail.data?.data?.financials));
  const newEng = await vendorA.post('/vendor/engineers', { name: 'Ravi Tiwari', phone: '9200000099', skills: ['AC Repair'], city: 'Indore', cities: ['Indore'] });
  check('vendor adds an engineer → PENDING until WBI verification', newEng.status === 201 && newEng.data.data.status === 'PENDING', JSON.stringify(newEng.data));
  const pendingElig = await vendorA.get(`/jobs/${jobs[4]._id}/eligible-engineers`);
  check('unverified engineer is not eligible for jobs', !(pendingElig.data.data || []).some((e) => e.name === 'Ravi Tiwari'), JSON.stringify((pendingElig.data.data || []).map((e) => e.name)));

  // ── report ───────────────────────────────────────────────────────────────
  const byScenario = {};
  for (const r of results) {
    byScenario[r.scenario] = byScenario[r.scenario] || { pass: 0, fail: 0 };
    byScenario[r.scenario][r.ok ? 'pass' : 'fail'] += 1;
  }
  console.log('\n=== Summary ===');
  for (const [s, v] of Object.entries(byScenario)) console.log(`${v.fail ? 'FAIL' : 'PASS'}  ${s}  (${v.pass} passed, ${v.fail} failed)`);
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  sockets.forEach((s) => s.close());
  await mongoose.disconnect();
  process.exit(failed.length ? 1 : 0);
};

run().catch(async (err) => {
  console.error('\nE2E aborted:', err);
  sockets.forEach((s) => s.close());
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
