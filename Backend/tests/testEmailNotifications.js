/**
 * Transactional email: who receives each notification email, what it links
 * to, and that controller flows actually send it. In-memory MongoDB and a
 * captured SMTP transport — nothing is sent and the .env database is never
 * touched.
 *
 *   node tests/testEmailNotifications.js
 */
const assert = require('assert');
const path = require('path');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

// ---- environment: SMTP "configured", no Redis, fixed public URL ----
Object.assign(process.env, {
  NODE_ENV: 'test',
  EMAIL_HOST: 'smtp.test.local',
  EMAIL_USER: 'mailer@test.local',
  EMAIL_PASS: 'secret',
  EMAIL_FROM: 'WBI <noreply@test.local>',
  APP_PUBLIC_URL: 'https://app.test.local',
  REDIS_ENABLED: 'false',
  JWT_SECRET: process.env.JWT_SECRET || 'test-secret'
});
delete process.env.ADMIN_NOTIFICATION_EMAILS;
delete process.env.EMAIL_DISABLED;

// Capture every message instead of opening an SMTP connection.
const sent = [];
const nodemailer = require('nodemailer');
nodemailer.createTransport = () => ({
  sendMail: async (msg) => { sent.push(msg); return { messageId: `<${sent.length}@test>` }; },
  verify: async () => true
});

// No Redis in tests: the queue refuses jobs, so the orchestrator delivers inline.
const queueSetupPath = path.join(__dirname, '..', 'jobs', 'queueSetup.js');
require.cache[queueSetupPath] = {
  id: queueSetupPath,
  filename: queueSetupPath,
  loaded: true,
  exports: { notificationQueue: { add: async () => { throw new Error('queue disabled in tests'); } } }
};

const call = (handler, { user, params = {}, body = {}, query = {}, extra = {} }) =>
  new Promise((resolve, reject) => {
    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(payload) { resolve({ status: this.statusCode, body: payload }); return this; }
    };
    const req = { user, params, body, query, ip: '127.0.0.1', headers: { 'user-agent': 'test-agent' }, connection: {}, app: { get: () => null }, ...extra };
    Promise.resolve(handler(req, res)).catch(reject);
  });

const to = (m) => [].concat(m.to).join(',');
const sentTo = (addr) => sent.filter((m) => to(m).split(',').includes(addr));

/** emitAsync runs on setImmediate; wait until the expected mail shows up. */
async function waitFor(predicate, label, ms = 4000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (predicate()) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(`Timed out waiting for: ${label}\nSent so far:\n${sent.map((m) => `  ${to(m)} | ${m.subject}`).join('\n')}`);
}

async function run() {
  const mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  const Admin = require('../models/Admin');
  const Vendor = require('../models/Vendor');
  const B2BCompany = require('../models/B2BCompany');
  const B2BUser = require('../models/B2BUser');
  const NotificationDeliveryLog = require('../models/NotificationDeliveryLog');
  await NotificationDeliveryLog.syncIndexes();
  const { emit } = require('../services/notification/notificationOrchestrator.service');

  const admin1 = await Admin.create({ name: 'Ops One', email: 'ops1@wbi.test', password: 'Test@12345', isActive: true });
  await Admin.create({ name: 'Ops Two', email: 'ops2@wbi.test', password: 'Test@12345', isActive: true });
  const vendor = await Vendor.create({
    name: 'Asha Rao', businessName: 'Rao Electricals', email: 'asha@vendor.test', phone: '9000001001',
    password: 'Test@12345', approvalStatus: 'pending', isActive: true
  });

  // 1. Admin alert goes to the admins, never to the vendor who registered.
  sent.length = 0;
  await emit('vendor_registered', {
    targets: { notifyAllAdmins: true },
    data: { vendorId: vendor._id, name: vendor.name, businessName: vendor.businessName, email: vendor.email, phone: vendor.phone }
  });
  assert.strictEqual(sentTo('asha@vendor.test').length, 0, 'registrant must not receive the admin alert');
  assert.strictEqual(sentTo('ops1@wbi.test').length, 1, 'admin 1 gets the alert');
  assert.strictEqual(sentTo('ops2@wbi.test').length, 1, 'admin 2 gets the alert');
  assert.match(sentTo('ops1@wbi.test')[0].html, /Rao Electricals/);
  assert.match(sentTo('ops1@wbi.test')[0].html, /https:\/\/app\.test\.local\/admin\/vendors\/all/);
  console.log('✓ admin registration alert goes to admins only');

  // 2. With an ops inbox configured, admin alerts are one message to it.
  sent.length = 0;
  process.env.ADMIN_NOTIFICATION_EMAILS = 'ops-inbox@wbi.test, lead@wbi.test';
  await emit('vendor_registered', {
    targets: { notifyAllAdmins: true },
    data: { vendorId: new mongoose.Types.ObjectId(), businessName: 'Second Vendor' }
  });
  assert.strictEqual(sent.length, 1, 'one message to the ops list');
  assert.deepStrictEqual([].concat(sent[0].to).sort(), ['lead@wbi.test', 'ops-inbox@wbi.test']);
  delete process.env.ADMIN_NOTIFICATION_EMAILS;
  console.log('✓ ADMIN_NOTIFICATION_EMAILS collapses admin alerts into one message');

  // 3. Welcome email: right address, panel link, escaped content, plain-text part.
  sent.length = 0;
  await emit('account_welcome', {
    targets: { vendorId: vendor._id },
    data: { variant: 'vendor', name: '<script>alert(1)</script>', email: vendor.email }
  });
  assert.strictEqual(sent.length, 1);
  const welcome = sent[0];
  assert.strictEqual(to(welcome), 'asha@vendor.test');
  assert.strictEqual(welcome.from, 'WBI <noreply@test.local>');
  assert.match(welcome.subject, /Welcome to WBI/);
  assert.match(welcome.html, /https:\/\/app\.test\.local\/vendor\/dashboard/);
  assert.ok(!welcome.html.includes('<script>alert(1)</script>'), 'user text is escaped');
  assert.ok(welcome.text && welcome.text.length > 20, 'plain-text alternative present');
  assert.ok(!/Ã|â€|ðŸ/.test(welcome.html), 'no mojibake in the layout');
  console.log('✓ welcome email: recipient, sender, link, escaping, text part');

  // 4. Explicit email recipients do not fan out to every admin.
  sent.length = 0;
  await emit('password_changed', {
    targets: { emails: [{ role: 'admin', email: 'ops1@wbi.test' }] },
    data: { method: 'change', at: new Date().toISOString(), name: 'Ops One' }
  });
  assert.strictEqual(sent.length, 1, 'only the addressed admin');
  assert.strictEqual(to(sent[0]), 'ops1@wbi.test');
  console.log('✓ targeted security email reaches only its recipient');

  // 5. Company-level B2B events: one email to the company contact.
  const company = await B2BCompany.create({
    companyName: 'Acme Infra Pvt Ltd', gstNumber: '27AAACA1234A1Z5', panNumber: 'AAACA1234A',
    companyAddress: 'Mumbai', billingAddress: 'Mumbai', tanNumber: 'MUMA12345B', authorizedPerson: { name: 'Ravi', designation: 'CTO', email: 'ravi@acme.test', phone: '9000002001' },
    email: 'accounts@acme.test', phone: '9000002002', passwordHash: 'x', verificationStatus: 'pending'
  });
  const owner = await B2BUser.create({ companyId: company._id, fullName: 'Ravi', email: 'accounts@acme.test', mobile: '9000002002', role: 'Company Admin', status: 'active', passwordHash: 'x' });
  await B2BUser.create({ companyId: company._id, fullName: 'Meera', email: 'meera@acme.test', mobile: '9000002003', role: 'Viewer', status: 'active', passwordHash: 'x' });
  sent.length = 0;
  await emit('b2b_company_reviewed', {
    targets: { b2bCompanyId: company._id },
    data: { companyId: String(company._id), companyName: company.companyName, approved: true }
  });
  assert.strictEqual(sent.length, 1, 'one company email, not one per member');
  assert.strictEqual(to(sent[0]), 'accounts@acme.test');
  assert.match(sent[0].subject, /approved/i);
  console.log('✓ B2B company events send one email to the company contact');

  // 6. A fixed dedupeKey still reaches every recipient (was: first one only).
  sent.length = 0;
  await emit('b2b_member_joined', {
    targets: { b2bUserIds: [owner._id] },
    data: { memberId: 'm1', memberName: 'Meera', role: 'Viewer' },
    dedupeKey: 'fixed-key-1'
  });
  await emit('vendor_registered', {
    targets: { notifyAllAdmins: true },
    data: { vendorId: new mongoose.Types.ObjectId(), businessName: 'Third Vendor' },
    dedupeKey: 'fixed-key-2'
  });
  assert.strictEqual(sentTo('accounts@acme.test').length, 1);
  assert.strictEqual(sentTo('ops1@wbi.test').length + sentTo('ops2@wbi.test').length, 2, 'both admins with a shared dedupeKey');
  console.log('✓ caller dedupeKey no longer drops later recipients');

  // 7. Re-emitting the same event is de-duplicated.
  sent.length = 0;
  const welcomeAgain = { targets: { vendorId: vendor._id }, data: { variant: 'vendor', name: 'Asha' } };
  await emit('account_welcome', welcomeAgain);
  assert.strictEqual(sent.length, 0, 'welcome is sent once per account');
  console.log('✓ duplicate events are not re-sent');

  // 8. Controller: B2B invite is emailed with a working link.
  sent.length = 0;
  const b2bUsers = require('../controllers/b2bControllers/b2bUserController');
  const inviteRes = await call(b2bUsers.inviteUser, {
    user: { id: owner._id },
    body: { fullName: 'Kiran', email: 'kiran@acme.test', mobile: '9000002004', role: 'Viewer', permissions: ['jobs.read'] },
    extra: { companyId: company._id }
  });
  assert.strictEqual(inviteRes.status, 201, JSON.stringify(inviteRes.body));
  assert.strictEqual(inviteRes.body.emailSent, true);
  const invite = sentTo('kiran@acme.test')[0];
  assert.ok(invite, 'invite email sent');
  assert.match(invite.subject, /Acme Infra Pvt Ltd/);
  assert.ok(invite.html.includes(`https://app.test.local/b2b/accept-invite?token=${inviteRes.body.token}`), 'invite link carries the token');
  const logged = await NotificationDeliveryLog.countDocuments({ 'payloadSnapshot.token': { $exists: true } });
  assert.strictEqual(logged, 0, 'invite token is not stored in the delivery log');
  console.log('✓ B2B invitation emailed with accept link (token kept out of logs)');

  // 9. Controller: admin suspends a vendor → vendor gets the reason.
  sent.length = 0;
  const adminVendors = require('../controllers/adminControllers/adminVendorController');
  const suspendRes = await call(adminVendors.suspendVendor, {
    user: { _id: admin1._id, id: admin1._id, role: 'admin' },
    params: { id: String(vendor._id) },
    body: { reason: 'Expired trade licence' }
  });
  assert.strictEqual(suspendRes.status, 200, JSON.stringify(suspendRes.body));
  await waitFor(() => sentTo('asha@vendor.test').length > 0, 'vendor suspension email');
  const suspension = sentTo('asha@vendor.test')[0];
  assert.match(suspension.subject, /suspended/i);
  assert.match(suspension.html, /Expired trade licence/);
  console.log('✓ admin suspension emails the vendor with the reason');

  // 10. Controller: admin deletes a vendor → email still reaches them.
  sent.length = 0;
  const gone = await Vendor.create({ name: 'Temp', businessName: 'Temp Co', email: 'temp@vendor.test', phone: '9000001009', password: 'Test@12345' });
  const delRes = await call(adminVendors.deleteVendor, {
    user: { _id: admin1._id, id: admin1._id, role: 'admin' },
    params: { id: String(gone._id) },
    body: { reason: 'Duplicate account' }
  });
  assert.strictEqual(delRes.status, 200, JSON.stringify(delRes.body));
  await waitFor(() => sentTo('temp@vendor.test').length > 0, 'vendor deletion email');
  assert.match(sentTo('temp@vendor.test')[0].subject, /deleted/i);
  console.log('✓ deleted accounts are still told by email');

  // 11. Profile notice only fires for watched fields.
  const { profileChanges } = require('../services/notification/profileChangeNotice');
  const v = await Vendor.findById(vendor._id);
  v.set('settings.serviceRange', 25);
  assert.deepStrictEqual(profileChanges(v), [], 'settings changes are not security events');
  v.businessName = 'Rao Electricals & Sons';
  assert.deepStrictEqual(profileChanges(v), ['Business name']);
  console.log('✓ profile notices ignore non-identity changes');

  // 12. With SMTP missing in production, nothing pretends to be sent.
  const mailer = require('../services/mail/mailer');
  const saved = { pass: process.env.EMAIL_PASS, env: process.env.NODE_ENV };
  delete process.env.EMAIL_PASS;
  process.env.NODE_ENV = 'production';
  const res = await mailer.sendMail({ to: 'x@test.local', subject: 'x', html: '<p>x</p>' });
  assert.strictEqual(res.skipped, true);
  assert.strictEqual(res.reason, 'smtp_not_configured');
  await assert.rejects(require('../utils/emailService').sendOtpEmail('x@test.local', '123456', 'vendor'), /not configured/);
  process.env.EMAIL_PASS = saved.pass;
  process.env.NODE_ENV = saved.env;
  console.log('✓ production without SMTP reports failure instead of silent success');

  // 13. Panel URLs.
  assert.strictEqual(mailer.panelUrl('vendor', 'finance/wallet'), 'https://app.test.local/vendor/finance/wallet');
  assert.strictEqual(mailer.panelUrl('b2b', '/b2b/jobs?job=1'), 'https://app.test.local/b2b/jobs?job=1');
  assert.strictEqual(mailer.panelUrl('engineer', '/jobs/42'), 'https://app.test.local/engineer/jobs/42');
  console.log('✓ panel-relative links resolve to the right panel');

  await mongoose.disconnect();
  await mongod.stop();
  console.log('\nAll email notification tests passed.');
}

run().then(() => process.exit(0)).catch((err) => {
  console.error('\n✗', err && err.stack ? err.stack : err);
  process.exit(1);
});
