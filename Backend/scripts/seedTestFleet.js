/**
 * Seeds a minimal end-to-end test fleet into a fresh DB:
 *   1 admin, 3 vendors, 1 B2B company (+wallet), 2 standalone workers,
 *   3 vendor-linked engineers (1 per vendor), 2 freelance engineers.
 *
 * Idempotent — safe to re-run; it deletes docs with these exact seed emails
 * first, then recreates them.
 *
 * Usage: node scripts/seedTestFleet.js
 */
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const Admin = require('../models/Admin');
const Vendor = require('../models/Vendor');
const Engineer = require('../models/Engineer');
const Worker = require('../models/Worker');
const B2BCompany = require('../models/B2BCompany');
const B2BWallet = require('../models/B2BWallet');
const B2BUser = require('../models/B2BUser');

dotenv.config();

// Indore-area coordinates with small jitter so entities aren't all stacked on one point
const BASE = { lat: 22.7196, lng: 75.8577 };
const jitter = (n) => Number((n + (Math.random() - 0.5) * 0.02).toFixed(6));
const geo = () => ({ type: 'Point', coordinates: [jitter(BASE.lng), jitter(BASE.lat)] });

const PASSWORDS = {
  vendor: 'Vendor@123',
  worker: 'Worker@123',
  engineer: 'Engineer@123',
  b2b: 'B2b@12345'
};

async function seedAdmin() {
  await Admin.deleteOne({ email: 'admin@gmail.com' });
  const admin = await Admin.create({
    name: 'Super Admin',
    email: 'admin@gmail.com',
    password: 'admin123',
    role: 'super_admin',
    isActive: true
  });
  return admin;
}

async function seedVendors() {
  const specs = [
    {
      name: 'Rajesh Kumar',
      businessName: 'Kumar Electrical Services',
      email: 'vendor1@wbi.test',
      phone: '9000000001',
      // C01 = the real legacy category code this platform resolves CCTV/installation
      // enquiries to (see utils/createOpportunityFromEnquiry.js) when no ServiceConfig
      // catalog exists yet — using a made-up code here would never get matched.
      categories: ['C01']
    },
    {
      name: 'Amit Sharma',
      businessName: 'Sharma CCTV & Security Solutions',
      email: 'vendor2@wbi.test',
      phone: '9000000002',
      categories: ['C01']
    },
    {
      name: 'Vikram Singh',
      businessName: 'Singh Multiservice Pvt Ltd',
      email: 'vendor3@wbi.test',
      phone: '9000000003',
      categories: ['C01']
    }
  ];

  await Vendor.deleteMany({ email: { $in: specs.map((s) => s.email) } });

  const vendors = [];
  for (const spec of specs) {
    const vendor = await Vendor.create({
      name: spec.name,
      businessName: spec.businessName,
      email: spec.email,
      phone: spec.phone,
      password: PASSWORDS.vendor,
      categories: spec.categories,
      service: spec.categories,
      approvedServices: spec.categories.map((code) => ({
        categoryCode: code,
        categoryName: code,
        status: 'active',
        approvedAt: new Date()
      })),
      businessType: 'project_partner',
      vendorType: 'project_partner',
      vendorModels: ['ONE_TIME', 'PROJECT'],
      partnerMode: 'company',
      approvalStatus: 'approved',
      isActive: true,
      isPhoneVerified: true,
      isEmailVerified: true,
      teamSize: 5,
      maxCapacity: 10,
      operatingCities: ['Indore'],
      operationalCities: ['Indore'],
      address: {
        addressLine1: 'MG Road',
        city: 'Indore',
        state: 'Madhya Pradesh',
        pincode: '452001'
      },
      location: { lat: BASE.lat, lng: BASE.lng, updatedAt: new Date() },
      geoLocation: geo(),
      settings: { serviceRange: 50 },
      wallet: { earnings: 10000 }
    });
    vendors.push(vendor);
  }
  return vendors;
}

async function seedB2B() {
  await B2BCompany.deleteMany({ email: 'b2b1@wbi.test' });
  await B2BWallet.deleteMany({}); // will recreate for the single seeded company below
  // The B2B login endpoint auto-creates a "Company Admin" B2BUser on first login,
  // copying the company's passwordHash at that moment. If we only delete/recreate
  // the B2BCompany on a re-run, that old B2BUser row still matches by email/mobile
  // but points at a companyId that no longer exists — login then 401s with
  // "Invalid credentials" even though the new company/password are correct.
  await B2BUser.deleteMany({ $or: [{ email: 'b2b1@wbi.test' }, { mobile: '9000000010' }] });

  const passwordHash = await bcrypt.hash(PASSWORDS.b2b, 10);
  const company = await B2BCompany.create({
    companyName: 'TechNova Enterprises Pvt Ltd',
    gstNumber: '23AAAAA0000A1Z5',
    panNumber: 'AAAAA0000A',
    tanNumber: 'BLRT12345A',
    companyAddress: '12 Corporate Park, Indore, MP - 452010',
    billingAddress: '12 Corporate Park, Indore, MP - 452010',
    authorizedPerson: {
      name: 'Neha Kapoor',
      designation: 'Operations Head',
      email: 'b2b1@wbi.test',
      phone: '9000000010'
    },
    email: 'b2b1@wbi.test',
    phone: '9000000010',
    passwordHash,
    verificationStatus: 'approved',
    isActive: true,
    walletBalance: 50000
  });

  const wallet = await B2BWallet.create({
    companyId: company._id,
    balance: 50000
  });

  return { company, wallet };
}

async function seedWorkers() {
  const specs = [
    { name: 'Suresh Patel', email: 'worker1@wbi.test', phone: '9000000021' },
    { name: 'Mohan Das', email: 'worker2@wbi.test', phone: '9000000022' }
  ];

  await Worker.deleteMany({ email: { $in: specs.map((s) => s.email) } });

  const workers = [];
  for (const spec of specs) {
    const worker = await Worker.create({
      name: spec.name,
      email: spec.email,
      phone: spec.phone,
      password: PASSWORDS.worker,
      vendorId: null,
      approvalStatus: 'approved',
      verificationStatus: 'verified',
      isActive: true,
      isPhoneVerified: true,
      isEmailVerified: true,
      status: 'ONLINE',
      secondarySkills: ['AC Repair', 'Electrical Wiring'],
      address: {
        city: 'Indore',
        state: 'Madhya Pradesh',
        pincode: '452001',
        lat: BASE.lat,
        lng: BASE.lng
      },
      location: { lat: BASE.lat, lng: BASE.lng, updatedAt: new Date() },
      geoLocation: geo()
    });
    workers.push(worker);
  }
  return workers;
}

async function seedEngineers(vendors) {
  const vendorLinked = [
    {
      name: 'Anil Mehta',
      email: 'engineer1@wbi.test',
      phone: '9000000031',
      vendor: vendors[0],
      serviceCategories: ['C01']
    },
    {
      name: 'Rohit Bansal',
      email: 'engineer2@wbi.test',
      phone: '9000000032',
      vendor: vendors[1],
      serviceCategories: ['C01']
    },
    {
      name: 'Karan Malhotra',
      email: 'engineer3@wbi.test',
      phone: '9000000033',
      vendor: vendors[2],
      serviceCategories: ['C01']
    }
  ];

  const freelancers = [
    {
      name: 'Sanjay Rathi',
      email: 'freelancer1@wbi.test',
      phone: '9000000034',
      serviceCategories: ['C01']
    },
    {
      name: 'Priya Nair',
      email: 'freelancer2@wbi.test',
      phone: '9000000035',
      serviceCategories: ['C01']
    }
  ];

  const allEmails = [...vendorLinked, ...freelancers].map((s) => s.email);
  await Engineer.deleteMany({ email: { $in: allEmails } });

  const created = [];

  for (const spec of vendorLinked) {
    const engineer = await Engineer.create({
      name: spec.name,
      email: spec.email,
      phone: spec.phone,
      password: PASSWORDS.engineer,
      roleType: 'Engineer',
      engineerType: 'vendor_engineer',
      vendorId: spec.vendor._id,
      vendorApprovalStatus: 'approved',
      approvalStatus: 'approved',
      isActive: true,
      isPhoneVerified: true,
      isEmailVerified: true,
      status: 'ONLINE',
      serviceCategories: spec.serviceCategories,
      secondarySkills: spec.serviceCategories,
      address: { city: 'Indore', state: 'Madhya Pradesh', pincode: '452001' },
      location: { lat: BASE.lat, lng: BASE.lng, updatedAt: new Date() },
      geoLocation: geo()
    });
    created.push({ ...spec, engineer, vendorName: spec.vendor.businessName });
  }

  for (const spec of freelancers) {
    const engineer = await Engineer.create({
      name: spec.name,
      email: spec.email,
      phone: spec.phone,
      password: PASSWORDS.engineer,
      roleType: 'Engineer',
      engineerType: 'freelancer',
      vendorId: null,
      vendorApprovalStatus: 'not_required',
      approvalStatus: 'approved',
      isActive: true,
      isPhoneVerified: true,
      isEmailVerified: true,
      status: 'ONLINE',
      serviceCategories: spec.serviceCategories,
      secondarySkills: spec.serviceCategories,
      address: { city: 'Indore', state: 'Madhya Pradesh', pincode: '452001' },
      location: { lat: BASE.lat, lng: BASE.lng, updatedAt: new Date() },
      geoLocation: geo()
    });
    created.push({ ...spec, engineer, vendorName: null });
  }

  return created;
}

async function run() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) throw new Error('MONGODB_URI is not set in .env');

  await mongoose.connect(mongoUri, { family: 4, serverSelectionTimeoutMS: 8000 });
  console.log('Connected to MongoDB\n');

  const admin = await seedAdmin();
  const vendors = await seedVendors();
  const { company, wallet } = await seedB2B();
  const workers = await seedWorkers();
  const engineers = await seedEngineers(vendors);

  console.log('================ SEED CREDENTIALS ================\n');

  console.log('ADMIN  (POST /api/admin/auth/login  {email, password})');
  console.log(`  ${admin.email} / admin123\n`);

  console.log('VENDORS  (POST /api/vendors/auth/login  {identifier, password})');
  vendors.forEach((v, i) => {
    console.log(`  ${i + 1}. ${v.businessName}`);
    console.log(`     identifier: ${v.email}  (or phone: ${v.phone})`);
    console.log(`     password:   ${PASSWORDS.vendor}`);
  });
  console.log('');

  console.log('B2B COMPANY  (POST /api/b2b/login  {emailOrMobile, password})');
  console.log(`  ${company.companyName}`);
  console.log(`  emailOrMobile: ${company.email}  (or phone: ${company.phone})`);
  console.log(`  password:      ${PASSWORDS.b2b}`);
  console.log(`  wallet balance: ${wallet.balance}\n`);

  console.log('WORKERS — standalone, one-time-service  (POST /api/workers/auth/login  {phone, password})');
  workers.forEach((w, i) => {
    console.log(`  ${i + 1}. ${w.name}  phone: ${w.phone}  password: ${PASSWORDS.worker}`);
  });
  console.log('');

  console.log('ENGINEERS  (POST /api/engineers/auth/login  {phone, password})');
  engineers.forEach((e, i) => {
    const tag = e.vendorName ? `vendor engineer @ ${e.vendorName}` : 'freelancer (no vendor)';
    console.log(`  ${i + 1}. ${e.name}  [${tag}]`);
    console.log(`     phone: ${e.phone}  password: ${PASSWORDS.engineer}`);
  });

  console.log('\n====================================================');
}

run()
  .then(() => {
    console.log('\nSeed complete.');
    return mongoose.connection.close();
  })
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Seed failed:', err);
    mongoose.connection.close().finally(() => process.exit(1));
  });
