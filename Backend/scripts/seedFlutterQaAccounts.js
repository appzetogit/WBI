/**
 * Flutter QA login accounts (engineer + worker) for production/staging DB.
 * Phones: worker 2222222222, engineer 2222222223 — same password.
 *
 * Usage: node scripts/seedFlutterQaAccounts.js
 * Requires MONGODB_URI in Backend/.env
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Engineer = require('../models/Engineer');
const Worker = require('../models/Worker');
const { ENGINEER_STATUS, WORKER_STATUS } = require('../utils/constants');

const PASSWORD = 'WbiDemo@26';
const TAG = 'flutter-qa-2222';

const ACCOUNTS = {
  worker: {
    phone: '2222222222',
    name: 'Flutter QA Worker',
    email: 'flutter.qa.worker.2222@mailinator.com',
  },
  engineer: {
    phone: '2222222223',
    name: 'Flutter QA Engineer',
    email: 'flutter.qa.engineer.2223@mailinator.com',
  },
};

async function upsertEngineer() {
  const { phone, name, email } = ACCOUNTS.engineer;
  let doc = await Engineer.findOne({ phone });
  const payload = {
    name,
    phone,
    email,
    password: PASSWORD,
    role: 'engineer',
    roleType: 'Engineer',
    engineerType: 'freelancer',
    approvalStatus: 'approved',
    joiningFeePaid: true,
    joiningFeeAmount: 0,
    joiningFeeFinalAmount: 0,
    status: ENGINEER_STATUS.OFFLINE,
    isActive: true,
    customFields: { demoTag: TAG },
  };
  if (doc) {
    Object.assign(doc, payload);
    doc.markModified('customFields');
    await doc.save();
    return { action: 'updated', phone, id: doc._id };
  }
  doc = await Engineer.create(payload);
  return { action: 'created', phone, id: doc._id };
}

async function upsertWorker() {
  const { phone, name, email } = ACCOUNTS.worker;
  let doc = await Worker.findOne({ phone });
  const payload = {
    name,
    phone,
    email,
    password: PASSWORD,
    role: 'worker',
    roleType: 'Worker',
    approvalStatus: 'approved',
    status: WORKER_STATUS.OFFLINE,
    isActive: true,
    customFields: { demoTag: TAG },
  };
  if (doc) {
    Object.assign(doc, payload);
    doc.markModified('customFields');
    await doc.save();
    return { action: 'updated', phone, id: doc._id };
  }
  doc = await Worker.create(payload);
  return { action: 'created', phone, id: doc._id };
}

async function verifyLogin(model, phone, label) {
  const doc = await model.findOne({ phone }).select('+password');
  if (!doc) return { ok: false, reason: 'not found' };
  const match = await doc.comparePassword(PASSWORD);
  return {
    ok: match && doc.isActive !== false && (doc.approvalStatus === 'approved' || !doc.approvalStatus),
    role: doc.role,
    approvalStatus: doc.approvalStatus,
    isActive: doc.isActive,
    passwordMatch: match,
    id: String(doc._id),
  };
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set in Backend/.env');
  mongoose.set('bufferCommands', false);
  await mongoose.connect(uri, { family: 4, serverSelectionTimeoutMS: 30000 });
  console.log(`MongoDB: ${mongoose.connection.host}`);

  const results = {
    engineer: await upsertEngineer(),
    worker: await upsertWorker(),
  };

  const checks = {
    engineer: await verifyLogin(Engineer, ACCOUNTS.engineer.phone, 'engineer'),
    worker: await verifyLogin(Worker, ACCOUNTS.worker.phone, 'worker'),
  };

  console.log('\n--- Flutter QA accounts (same DB as MONGODB_URI) ---\n');
  console.log('WORKER APP (mobile + password)');
  console.log(`  Mobile  : ${ACCOUNTS.worker.phone}`);
  console.log(`  Password: ${PASSWORD}`);
  console.log(`  (${results.worker.action}) verify=${JSON.stringify(checks.worker)}\n`);

  console.log('ENGINEER APP (mobile + password)');
  console.log(`  Mobile  : ${ACCOUNTS.engineer.phone}`);
  console.log(`  Password: ${PASSWORD}`);
  console.log(`  (${results.engineer.action}) verify=${JSON.stringify(checks.engineer)}\n`);

  if (!checks.engineer.ok || !checks.worker.ok) {
    throw new Error('Seeded accounts failed password/active verification');
  }

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
