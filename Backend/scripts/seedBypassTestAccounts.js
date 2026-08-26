/**
 * Seed test accounts for 6261745842 (+ worker on 6261745843 — eng/worker cannot share one mobile).
 * OTP bypass requires non-production AND:
 *   ALLOW_OTP_BYPASS=true
 *   OTP_BYPASS_PHONES=6261745842,6261745843
 *   OTP_BYPASS_CODE=123456 (optional; default 123456)
 * Bypass is always disabled when NODE_ENV=production.
 *
 * Usage: node scripts/seedBypassTestAccounts.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Engineer = require('../models/Engineer');
const Worker = require('../models/Worker');
const { ENGINEER_STATUS, WORKER_STATUS } = require('../utils/constants');
const { getBypassPhones, getBypassOtp } = require('../utils/otpBypass.util');

const PASSWORD = 'WbiDemo@26';
const TAG = 'otp-bypass-seed';

const PHONE_USER_ENGINEER = '6261745842';
const PHONE_WORKER = '6261745843';

const ACCOUNTS = {
  user: {
    phone: PHONE_USER_ENGINEER,
    name: 'WBI Test User',
    email: 'test.user.6261745842@mailinator.com',
  },
  engineer: {
    phone: PHONE_USER_ENGINEER,
    name: 'WBI Test Engineer',
    email: 'test.engineer.6261745842@mailinator.com',
  },
  worker: {
    phone: PHONE_WORKER,
    name: 'WBI Test Worker',
    email: 'test.worker.6261745843@mailinator.com',
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
  console.log(`OTP bypass phones: ${getBypassPhones().join(', ')}`);
  console.log(`Bypass OTP code: ${getBypassOtp()}\n`);

  const results = {
    user: await upsertUser(),
    engineer: await upsertEngineer(),
    worker: await upsertWorker(),
  };

  console.log('--- Seeded accounts ---\n');
  console.log('USER APP');
  console.log(`  Mobile: ${ACCOUNTS.user.phone}`);
  console.log(`  OTP: ${getBypassOtp()} (no SMS)`);
  console.log(`  (${results.user.action})\n`);

  console.log('ENGINEER APP');
  console.log(`  Mobile: ${ACCOUNTS.engineer.phone}`);
  console.log(`  Password: ${PASSWORD}`);
  console.log(`  OTP (signup): ${getBypassOtp()} (no SMS)`);
  console.log(`  (${results.engineer.action})\n`);

  console.log('WORKER APP (separate mobile — engineer/worker cannot share one number)');
  console.log(`  Mobile: ${ACCOUNTS.worker.phone}`);
  console.log(`  Password: ${PASSWORD}`);
  console.log(`  (${results.worker.action})\n`);

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
