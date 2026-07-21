/**
 * Demo accounts for User app (OTP), Engineer app & Worker app (phone + password).
 * Usage: node scripts/seedDemoAppUsers.js
 * Requires MONGODB_URI in Backend/.env
 */
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Engineer = require('../models/Engineer');
const Worker = require('../models/Worker');
const { ENGINEER_STATUS, WORKER_STATUS } = require('../utils/constants');

const PASSWORD = 'WbiDemo@26';
const TAG = 'wbi-demo-app-2026';

const ACCOUNTS = {
  user: {
    phone: '9888810001',
    name: 'WBI Demo User',
    email: 'demo.user.wbi@mailinator.com',
  },
  engineer: {
    phone: '9888810002',
    name: 'WBI Demo Engineer',
    email: 'demo.engineer.wbi@mailinator.com',
  },
  worker: {
    phone: '9888810003',
    name: 'WBI Demo Worker',
    email: 'demo.worker.wbi@mailinator.com',
  },
};

async function upsertUser() {
  const { phone, name, email } = ACCOUNTS.user;
  let doc = await User.findOne({ phone });
  if (doc) {
    doc.name = name;
    doc.email = email;
    doc.isPhoneVerified = true;
    doc.isActive = true;
    doc.customFields = { ...(doc.customFields || {}), demoTag: TAG };
    await doc.save();
    return { action: 'updated', phone };
  }
  doc = await User.create({
    name,
    phone,
    email,
    password: PASSWORD,
    isPhoneVerified: true,
    isEmailVerified: false,
    isActive: true,
    customFields: { demoTag: TAG },
  });
  return { action: 'created', phone, id: doc._id };
}

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
    return { action: 'updated', phone };
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
    return { action: 'updated', phone };
  }
  doc = await Worker.create(payload);
  return { action: 'created', phone, id: doc._id };
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set in Backend/.env');
  mongoose.set('bufferCommands', false);
  await mongoose.connect(uri, { family: 4, serverSelectionTimeoutMS: 30000 });
  console.log(`MongoDB: ${mongoose.connection.host}`);

  const results = {
    user: await upsertUser(),
    engineer: await upsertEngineer(),
    worker: await upsertWorker(),
  };

  console.log('\n--- Demo accounts (same DB as MONGODB_URI) ---\n');
  console.log('USER APP (login: mobile + OTP)');
  console.log(`  Mobile: ${ACCOUNTS.user.phone}`);
  console.log(`  OTP: 123456 if server USE_DEFAULT_OTP=true, else real SMS OTP`);
  console.log(`  Name: ${ACCOUNTS.user.name}`);
  console.log(`  (${results.user.action})\n`);

  console.log('ENGINEER APP (login: mobile + password)');
  console.log(`  Mobile: ${ACCOUNTS.engineer.phone}`);
  console.log(`  Password: ${PASSWORD}`);
  console.log(`  (${results.engineer.action})\n`);

  console.log('WORKER APP (login: mobile + password)');
  console.log(`  Mobile: ${ACCOUNTS.worker.phone}`);
  console.log(`  Password: ${PASSWORD}`);
  console.log(`  (${results.worker.action})\n`);

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
