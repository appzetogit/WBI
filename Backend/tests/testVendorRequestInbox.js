/**
 * Vendor request inbox: the Requests list, the dashboard "New" cards and the
 * sidebar badge must agree on what is new for THIS vendor, through the whole
 * lifecycle. In-memory MongoDB only (never the .env database).
 *
 *   node tests/testVendorRequestInbox.js
 */
const assert = require('assert');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const call = (handler, { user, params = {}, body = {}, query = {} }) =>
  new Promise((resolve, reject) => {
    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(payload) { resolve({ status: this.statusCode, body: payload }); return this; }
    };
    Promise.resolve(handler({ user, params, body, query, app: { get: () => null } }, res)).catch(reject);
  });

async function run() {
  const mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  await mongoose.connect(process.env.MONGODB_URI);

  const Settings = require('../models/Settings');
  const Vendor = require('../models/Vendor');
  const Engineer = require('../models/Engineer');
  const Opportunity = require('../models/Opportunity');
  const VendorOpsJob = require('../models/VendorOpsJob');
  const requests = require('../controllers/vendorControllers/vendorRequestsController');
  const { getOperationalSummary } = require('../controllers/vendorControllers/vendorConfigController');
  const { getCounts } = require('../controllers/vendorControllers/businessIntakeController');
  const engineerOps = require('../controllers/engineerControllers/engineerOpsJobController');

  await Settings.create({ platformFeePercentage: 1, servicePayoutPercentage: 60 });

  const makeVendor = (n) =>
    Vendor.create({
      name: `Vendor ${n}`, businessName: `Vendor ${n}`, email: `v${n}@inbox.test`, phone: `90000003${n}0`,
      password: 'Test@12345', approvalStatus: 'approved', isActive: true,
      approvedServices: [{ categoryCode: 'WEB', categoryName: 'Web & Digital Solutions', status: 'active' }],
      categories: ['WEB']
    });
  const me = await makeVendor(1);
  const rival = await makeVendor(2);
  const engineer = await Engineer.create({
    name: 'Inbox Engineer', email: 'eng@inbox.test', phone: '9000000399', password: 'Test@12345',
    role: 'engineer', roleType: 'Engineer', engineerType: 'vendor_engineer',
    approvalStatus: 'approved', isActive: true, vendorId: me._id, vendorApprovalStatus: 'approved'
  });

  const offer = (title, queue, extra = {}) =>
    Opportunity.create({
      type: 'client_request', title, categoryCode: extra.categoryCode || 'WEB', categoryName: 'Web',
      clientInfo: { name: 'Customer', city: 'Indore' }, budget: { min: 25000, max: 50000 },
      status: extra.status || 'open',
      eligibleVendors: queue.map((q) => q.vendorId),
      assignment: {
        phase: extra.phase || 'waiting_vendor_acceptance', requiredEngineers: 1,
        vendorQueue: queue.map((q, i) => ({ ...q, rank: i + 1, score: 50 })),
        // As the engine leaves it: the end of the last notified batch.
        currentVendorIndex: queue.map((q) => q.status !== 'pending').lastIndexOf(true)
      }
    });

  /** What each screen reports for `me`. */
  const snapshot = async () => {
    const user = { _id: me._id };
    const [list, summary, badge] = await Promise.all([
      call(requests.getRequests, { user, query: { source: 'user', limit: 100 } }),
      call(getOperationalSummary, { user }),
      call(getCounts, { user })
    ]);
    const byTitle = Object.fromEntries(list.body.data.map((r) => [r.title, r.status]));
    return {
      byTitle,
      listNew: list.body.counts.userNew,
      dashboardNew: summary.body.data?.counts?.newUserRequests ?? summary.body.counts?.newUserRequests,
      badgeNew: badge.body.data.clientRequests
    };
  };
  const expectNew = (s, n, label) => {
    assert.strictEqual(s.listNew, n, `${label}: Requests list new`);
    assert.strictEqual(s.dashboardNew, n, `${label}: dashboard new`);
    assert.strictEqual(s.badgeNew, n, `${label}: sidebar badge`);
  };

  // Offers in every state the engine can leave them in.
  const live = await offer('Live offer', [{ vendorId: me._id, status: 'active' }]);
  await offer('Later batch', [{ vendorId: rival._id, status: 'active' }, { vendorId: me._id, status: 'pending' }]);
  await offer('Timed out', [{ vendorId: me._id, status: 'timeout' }, { vendorId: rival._id, status: 'active' }]);
  await offer('Won by rival', [{ vendorId: rival._id, status: 'accepted' }, { vendorId: me._id, status: 'skipped' }], { phase: 'awaiting_engineer' });
  await offer('Expired', [{ vendorId: me._id, status: 'timeout' }], { status: 'cancelled', phase: 'expired' });
  await offer('Other category', [], { categoryCode: 'C99' });
  const declined = await offer('To decline', [{ vendorId: me._id, status: 'active' }, { vendorId: rival._id, status: 'pending' }]);

  let s = await snapshot();
  assert.deepStrictEqual(s.byTitle, { 'Live offer': 'new', 'To decline': 'new' }, 'only live offers are listed');
  expectNew(s, 2, 'initial');
  console.log('PASS  only live offers count as new (later batch / timed out / rival / expired / other category hidden)');

  const rej = await call(requests.rejectRequest, { user: { _id: me._id }, params: { id: String(declined._id) }, body: { reason: 'busy' } });
  assert.strictEqual(rej.status, 200);
  s = await snapshot();
  assert.strictEqual(s.byTitle['To decline'], 'rejected');
  expectNew(s, 1, 'after decline');
  console.log('PASS  declined offer moves to Rejected and leaves every count');

  const acc = await call(requests.acceptRequest, { user: { _id: me._id }, params: { id: String(live._id) } });
  assert.strictEqual(acc.status, 200, JSON.stringify(acc.body));
  s = await snapshot();
  assert.strictEqual(s.byTitle['Live offer'], 'accepted', 'accepted, awaiting engineer → Assign Engineer button');
  expectNew(s, 0, 'after accept');

  await call(requests.assignEngineerToRequest, { user: { _id: me._id }, params: { id: String(live._id) }, body: { engineerId: String(engineer._id) } });
  assert.strictEqual((await snapshot()).byTitle['Live offer'], 'assigned');

  const job = await VendorOpsJob.findOne({ engineerId: engineer._id });
  const eng = { _id: engineer._id };
  await call(engineerOps.acceptOpsJob, { user: eng, params: { id: String(job._id) }, body: { canComplete: true, canMeetTimeline: true, hasResources: true, availableTeamSize: 1 } });
  assert.strictEqual((await snapshot()).byTitle['Live offer'], 'in_progress');
  await call(engineerOps.startOpsJob, { user: eng, params: { id: String(job._id) } });
  await call(engineerOps.completeOpsJob, { user: eng, params: { id: String(job._id) } });
  assert.strictEqual((await snapshot()).byTitle['Live offer'], 'completed');
  console.log('PASS  accepted → assigned → in_progress → completed as the work moves');

  await mongoose.disconnect();
  await mongod.stop();
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('FAIL', err.message);
    process.exit(1);
  });
