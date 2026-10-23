/**
 * Email coverage: every email-enabled event renders cleanly for every
 * recipient role it supports, and the central hooks (enquiries, bookings)
 * plus the admin / roster / legacy-company flows really send mail.
 * In-memory MongoDB and a captured SMTP transport; nothing leaves the machine.
 *
 *   node tests/testEmailCoverage.js
 */
const assert = require('assert');
const path = require('path');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

Object.assign(process.env, {
  NODE_ENV: 'test',
  EMAIL_HOST: 'smtp.test.local',
  EMAIL_USER: 'mailer@test.local',
  EMAIL_PASS: 'secret',
  EMAIL_FROM: 'WBI <noreply@test.local>',
  APP_PUBLIC_URL: 'https://app.test.local',
  REDIS_ENABLED: 'false',
  JWT_REFRESH_SECRET: 'test-refresh',
  JWT_SECRET: process.env.JWT_SECRET || 'test-secret'
});
delete process.env.ADMIN_NOTIFICATION_EMAILS;
delete process.env.EMAIL_DISABLED;

const sent = [];
require('nodemailer').createTransport = () => ({
  sendMail: async (msg) => { sent.push(msg); return { messageId: `<${sent.length}@test>` }; },
  verify: async () => true
});
const queueSetupPath = path.join(__dirname, '..', 'jobs', 'queueSetup.js');
require.cache[queueSetupPath] = {
  id: queueSetupPath, filename: queueSetupPath, loaded: true,
  exports: { notificationQueue: { add: async () => { throw new Error('queue disabled in tests'); } } }
};

// Same order as server.js: plugins before any model compiles.
require('../services/notification/enquiryMail').register();
require('../services/notification/bookingMail').register();

const call = (handler, { user, params = {}, body = {}, extra = {} }) =>
  new Promise((resolve, reject) => {
    const res = {
      statusCode: 200,
      status(c) { this.statusCode = c; return this; },
      json(p) { resolve({ status: this.statusCode, body: p }); return this; }
    };
    const req = { user, params, body, query: {}, ip: '127.0.0.1', headers: { 'user-agent': 'test' }, connection: {}, app: { get: () => null }, ...extra };
    Promise.resolve(handler(req, res)).catch(reject);
  });

const to = (m) => [].concat(m.to).join(',');
const sentTo = (a) => sent.filter((m) => to(m).split(',').includes(a));
async function waitFor(pred, label, ms = 5000) {
  const t = Date.now();
  while (Date.now() - t < ms) { if (pred()) return; await new Promise((r) => setTimeout(r, 25)); }
  throw new Error(`Timed out: ${label}\n${sent.map((m) => `  ${to(m)} | ${m.subject}`).join('\n')}`);
}
const quiet = () => new Promise((r) => setTimeout(r, 250));

async function run() {
  const mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  const Admin = require('../models/Admin');
  const Vendor = require('../models/Vendor');
  const User = require('../models/User');
  const Engineer = require('../models/Engineer');
  const Worker = require('../models/Worker');
  const B2BCompany = require('../models/B2BCompany');
  const B2BUser = require('../models/B2BUser');
  const NotificationDeliveryLog = require('../models/NotificationDeliveryLog');
  await NotificationDeliveryLog.syncIndexes();
  const { emit } = require('../services/notification/notificationOrchestrator.service');
  const { EVENT_CATALOG } = require('../services/notification/eventCatalog');

  const admin = await Admin.create({ name: 'Ops', email: 'ops@wbi.test', password: 'Test@12345', isActive: true, role: 'super_admin' });
  const vendor = await Vendor.create({ name: 'Asha', businessName: 'Asha Co', email: 'asha@v.test', phone: '9100000001', password: 'Test@12345' });
  const user = await User.create({ name: 'Cust', email: 'cust@u.test', phone: '9100000002' });
  const engineer = await Engineer.create({ name: 'Eng', email: 'eng@e.test', phone: '9100000003', password: 'Test@12345', roleType: 'Engineer' });
  const worker = await Worker.create({ name: 'Wrk', email: 'wrk@w.test', phone: '9100000004', password: 'Test@12345', roleType: 'Worker' });
  const company = await B2BCompany.create({
    companyName: 'Acme', gstNumber: '27AAACA1234A1Z5', panNumber: 'AAACA1234A', companyAddress: 'Mumbai',
    billingAddress: 'Mumbai', tanNumber: 'MUMA12345B',
    authorizedPerson: { name: 'Ravi', designation: 'CTO', email: 'ravi@acme.test', phone: '9100000005' },
    email: 'accounts@acme.test', phone: '9100000006', passwordHash: 'x'
  });
  const b2bUser = await B2BUser.create({ companyId: company._id, fullName: 'Ravi', email: 'ravi@acme.test', mobile: '9100000005', role: 'Company Admin', status: 'active', passwordHash: 'x' });

  const ids = {
    admin: { adminId: admin._id }, vendor: { vendorId: vendor._id }, user: { userId: user._id },
    engineer: { engineerId: engineer._id }, worker: { workerId: worker._id },
    b2b: { b2bUserId: b2bUser._id, b2bCompanyId: company._id }
  };
  const addr = { admin: 'ops@wbi.test', vendor: 'asha@v.test', user: 'cust@u.test', engineer: 'eng@e.test', worker: 'wrk@w.test', b2b: 'accounts@acme.test' };

  // Rich sample payload: every field any template reads.
  const sample = {
    name: 'Sam', businessName: 'Biz', companyName: 'Acme', email: 'x@y.test', phone: '9000000000',
    reason: 'Sample reason', status: 'verified', subject: 'Item', amount: 1500, netAmount: 1400, fee: 100,
    approved: true, change: 'role', role: 'Viewer', roleLabel: 'Admin', previousRoleLabel: 'Support',
    enquiryLabel: 'Website development', reference: 'AB12CD', enquiryId: 'e1', bookingId: 'b1', bookingNumber: 'BK1',
    serviceName: 'AC repair', scheduledDate: new Date(), scheduledTime: '10:00', title: 'Sample title', message: 'Sample message',
    code: 'WBI123', engineerType: 'freelancer', vendorName: 'Vendor Co', city: 'Pune', skills: ['A', 'B'],
    jobId: 'j1', jobCode: 'JOB-1', companyId: String(company._id), documentId: 'd1', paymentId: 'pay_1', orderId: 'ord_1',
    transactionId: 't1', withdrawalId: 'w1', statusLabel: 'completed', accountMasked: 'XXXX1234', utr: 'UTR1',
    changes: ['Name', 'Email address'], changedBy: 'Admin', method: 'change', at: new Date().toISOString(),
    memberId: 'm1', memberName: 'Mem', memberEmail: 'm@x.test', createdJobs: 3, failedJobs: 1, invalidRows: 2, validRows: 5,
    totalRows: 8, batchCode: 'B-1', fileName: 'jobs.xlsx', adminPath: '/admin/web-enquiries', variant: 'vendor',
    decisionLabel: 'approved', action: 'admin_approve', remarks: 'ok', rejectedDocuments: ['pan'], simulated: false,
    balance: 5000, submittedAt: new Date().toISOString(), documentName: 'GST', expiryDate: '2026-12-01', cancelledBy: 'user',
    refundedAmount: 200, adminId: String(admin._id), vendorId: String(vendor._id), engineerId: String(engineer._id),
    userId: String(user._id), stamp: Date.now(), type: 'engineer_team_deactivated', service: 'AC', earnings: 100
  };

  // ---- 1. Sweep: every email event x every recipient role ----
  let checked = 0;
  const problems = [];
  for (const [key, def] of Object.entries(EVENT_CATALOG)) {
    if (!(def.channels || []).includes('email')) continue;
    for (const role of def.recipients.filter((r) => ids[r] && (!def.emailRoles || def.emailRoles.includes(r)))) {
      sent.length = 0;
      const data = { ...sample, entityId: `${key}-${role}`, dedupeSeed: `${key}-${role}` };
      const res = await emit(key, { targets: { ...ids[role], notifyAllAdmins: role === 'admin' }, data, channels: ['email'] });
      if (res.reason === 'no_recipients') { problems.push(`${key}/${role}: no recipients`); continue; }
      if (!sent.length) { problems.push(`${key}/${role}: no email sent`); continue; }
      const m = sent[0];
      const okTo = role === 'b2b' ? ['accounts@acme.test', 'ravi@acme.test'] : [addr[role]];
      if (!okTo.some((a) => to(m).includes(a))) problems.push(`${key}/${role}: sent to ${to(m)}, expected ${addr[role]}`);
      if (/undefined|NaN|\[object|null</.test(m.html)) problems.push(`${key}/${role}: broken value in html`);
      if (/>\s*<\/h2>/.test(m.html)) problems.push(`${key}/${role}: empty heading`);
      if (!m.subject || /undefined/.test(m.subject)) problems.push(`${key}/${role}: bad subject "${m.subject}"`);
      const links = [...m.html.matchAll(/href="([^"]+)"/g)].map((x) => x[1]).filter((h) => !h.startsWith('mailto'));
      for (const l of links) {
        if (!/^https:\/\/app\.test\.local\//.test(l)) problems.push(`${key}/${role}: link ${l}`);
        if (/undefined|null/.test(l)) problems.push(`${key}/${role}: broken link ${l}`);
      }
      checked++;
    }
  }
  assert.deepStrictEqual(problems, [], `\n${problems.join('\n')}`);
  console.log(`✓ ${checked} event/recipient emails render cleanly (no undefined, valid recipient and links)`);

  // ---- 2. Enquiries: confirmation to submitter + alert to admins ----
  sent.length = 0;
  const WebEnquiry = require('../models/WebEnquiry');
  const enq = await WebEnquiry.create({
    fullName: 'Lead Person', email: 'lead@client.com', phone: '9200000001', city: 'Delhi',
    websiteType: 'Business Website', description: 'Need a site', companyName: 'Client Co'
  });
  await waitFor(() => sentTo('lead@client.com').length && sentTo('ops@wbi.test').length, 'enquiry emails');
  const conf = sentTo('lead@client.com')[0];
  assert.match(conf.subject, /Website development enquiry/);
  assert.ok(conf.html.includes(String(enq._id).slice(-6).toUpperCase()), 'reference shown');
  assert.match(sentTo('ops@wbi.test')[0].html, /admin\/web-enquiries/);
  enq.description = 'Edited'; await enq.save(); await quiet();
  assert.strictEqual(sentTo('lead@client.com').length, 1, 'editing an enquiry does not re-send');
  console.log('✓ enquiry form emails the submitter and the admins once');

  // Service-style forms (many required fields): build a valid document from each schema.
  const fillRequired = (Model, overrides) => {
    const doc = {};
    for (const [k, p] of Object.entries(Model.schema.paths)) {
      if (!p.isRequired || k.includes('.')) continue;
      doc[k] = p.enumValues && p.enumValues.length ? p.enumValues[0]
        : p.instance === 'Number' ? 1
        : p.instance === 'ObjectId' ? new mongoose.Types.ObjectId()
        : p.instance === 'Boolean' ? true
        : p.instance === 'Date' ? new Date()
        : p.instance === 'Array' ? ['x']
        : 'x';
    }
    return Model.create({ ...doc, ...overrides });
  };
  for (const [name, mail] of [['PosService', 'shop@client.com'], ['HcAmc', 'hospital@client.com'], ['DgService', 'dg@client.com'], ['InstallationEnquiry', 'install@client.com']]) {
    sent.length = 0;
    await fillRequired(require('../models/' + name), { fullName: 'Form Person', email: mail, phone: '9200000002' });
    await waitFor(() => sentTo(mail).length && sentTo('ops@wbi.test').length, name + ' enquiry emails');
  }
  console.log('✓ banking / healthcare / energy / security forms email submitter and admins');

  // ---- 3. Admin accounts ----
  const adminMgmt = require('../controllers/adminControllers/adminManagementController');
  sent.length = 0;
  const created = await call(adminMgmt.createAdmin, { user: { id: String(admin._id), name: 'Ops' }, body: { name: 'New Admin', email: 'newadmin@wbi.test', password: 'Test@12345', role: 'admin' } });
  assert.strictEqual(created.status, 201, JSON.stringify(created.body));
  await waitFor(() => sentTo('newadmin@wbi.test').length, 'admin welcome');
  assert.ok(!sentTo('newadmin@wbi.test')[0].html.includes('Test@12345'), 'password never emailed');
  assert.match(sentTo('newadmin@wbi.test')[0].html, /admin\/login/);
  const roleKeys = require('../config/adminPermissions').ADMIN_ROLE_KEYS;
  const otherRole = roleKeys.find((r) => r !== 'admin');
  sent.length = 0;
  const upd = await call(adminMgmt.updateAdminRole, { user: { id: String(admin._id) }, params: { id: String(created.body.data.id) }, body: { role: otherRole } });
  assert.strictEqual(upd.status, 200, JSON.stringify(upd.body));
  await waitFor(() => sentTo('newadmin@wbi.test').length, 'admin role change');
  sent.length = 0;
  const del = await call(adminMgmt.deleteAdmin, { user: { id: String(admin._id) }, params: { id: String(created.body.data.id) } });
  assert.strictEqual(del.status, 200);
  await waitFor(() => sentTo('newadmin@wbi.test').length, 'admin removed');
  assert.match(sentTo('newadmin@wbi.test')[0].subject, /removed/i);
  console.log('✓ admin created / role changed / removed emails (no password in mail)');

  // ---- 4. Vendor roster member ----
  const team = require('../controllers/vendorControllers/vendorTeamController');
  sent.length = 0;
  const added = await call(team.addMember, { user: { id: String(vendor._id) }, body: { name: 'Roster Guy', email: 'roster@x.test', phone: '9300000001', designation: 'Technician' } });
  assert.strictEqual(added.status, 201, JSON.stringify(added.body));
  await waitFor(() => sentTo('roster@x.test').length, 'roster welcome');
  sent.length = 0;
  const removed = await call(team.deleteMember, { user: { id: String(vendor._id) }, params: { id: String(added.body.data._id) } });
  assert.strictEqual(removed.status, 200);
  await waitFor(() => sentTo('roster@x.test').length, 'roster deactivated');
  console.log('✓ vendor roster member added / deactivated emails');

  // ---- 5. Legacy company signup ----
  const legacy = require('../controllers/b2bControllers/companyAuthController');
  sent.length = 0;
  const reg = await call(legacy.registerCompany, {
    body: {
      companyName: 'Legacy Co', companyType: 'Pvt Ltd',
      primaryContact: { name: 'Lee', phone: '9400000001', email: 'lee@legacy.test' },
      admin: { fullName: 'Lee Admin', phone: '9400000002', email: 'leeadmin@legacy.test', password: 'Test@12345', role: 'Company Owner' }
    }
  });
  assert.strictEqual(reg.status, 201, JSON.stringify(reg.body));
  await waitFor(() => sentTo('lee@legacy.test').length && sentTo('ops@wbi.test').length, 'legacy company emails');
  console.log('✓ legacy company signup emails the company and the admins');

  // ---- 6. Bookings: status steps, cancel, reschedule ----
  const Booking = require('../models/Booking');
  let seq = 0;
  const mkBooking = (o) => fillRequired(Booking, {
    bookingNumber: `BK-TEST-${++seq}`,
    userId: user._id, vendorId: vendor._id, serviceId: new mongoose.Types.ObjectId(), serviceName: 'AC repair', status: 'pending',
    timeSlot: { start: '10:00', end: '11:00' }, address: { addressLine1: '1 Main St', city: 'Pune', state: 'MH', pincode: '411001' },
    scheduledDate: new Date(Date.now() + 86400000), scheduledTime: '10:00 AM', finalAmount: 999, ...o
  });
  const booking = await mkBooking({});
  sent.length = 0;
  booking.status = 'confirmed'; await booking.save();
  await waitFor(() => sentTo('cust@u.test').length, 'booking confirmed');
  assert.match(sentTo('cust@u.test')[0].subject, /Booking confirmed/);
  booking.status = 'completed'; await booking.save(); await quiet();
  assert.strictEqual(sentTo('cust@u.test').length, 1, 'completed keeps its own email; the hook adds none');
  const b2 = await mkBooking({ serviceName: 'Plumbing' });
  sent.length = 0;
  b2.scheduledDate = new Date(Date.now() + 3 * 86400000); await b2.save();
  await waitFor(() => sentTo('cust@u.test').length && sentTo('asha@v.test').length, 'reschedule emails');
  sent.length = 0;
  b2.status = 'cancelled'; b2.cancelledBy = 'user'; b2.cancellationReason = 'Changed my mind'; b2.cancelledAt = new Date(); await b2.save();
  await waitFor(() => sentTo('cust@u.test').length && sentTo('asha@v.test').length, 'cancel emails');
  assert.match(sentTo('asha@v.test')[0].html, /customer cancelled/i);
  console.log('✓ booking confirmed / rescheduled / cancelled emails (customer and vendor)');

  await mongoose.disconnect();
  await mongod.stop();
  console.log('\nAll email coverage tests passed.');
}

run().then(() => process.exit(0)).catch((e) => { console.error('\n✗', e.stack || e); process.exit(1); });
