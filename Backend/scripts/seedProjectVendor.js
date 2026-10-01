/**
 * Seed one approved project-partner vendor plus one of its own engineers,
 * ready for the customer project flow:
 *
 *   customer request → vendor Requests → vendor accepts + assigns engineer →
 *   engineer accepts / starts / completes (/engineer/ops-jobs)
 *
 * Profiles:
 *   it       IT & Computer Services (C02) — /user/service-request/C02-xx,
 *            paid up front through Razorpay escrow
 *   digital  Web & App (WEB + APP) — Digital Solutions enquiry pages
 *            (web development, web design, digital marketing, app development)
 *
 *   npm run seed:project-vendor                          it profile (default)
 *   npm run seed:project-vendor -- --profile=digital     digital profile
 *   npm run seed:project-vendor -- --profile=digital --remove
 *
 * Re-running a profile rotates its password. PROJECT_VENDOR_PASSWORD sets the
 * password instead of generating one. Records go through the real Mongoose
 * models so hashing and hooks run, and the engineer is put on the vendor's
 * workforce roster with the app's own sync (the assign-engineer picker reads it).
 */

require('dotenv').config();
const crypto = require('crypto');
const mongoose = require('mongoose');

const Admin = require('../models/Admin');
const User = require('../models/User');
const Worker = require('../models/Worker');
const Vendor = require('../models/Vendor');
const Engineer = require('../models/Engineer');
const VendorModelApproval = require('../models/VendorModelApproval');
const VendorWorkforceEngineer = require('../models/VendorWorkforceEngineer');
const FormSchema = require('../models/FormSchema');
const { ensureVendorCompanyCode } = require('../utils/vendorCompanyCode');
const { syncLinkedEngineers } = require('../services/vendorWorkforceSync.service');

const CITY = { city: 'Indore', state: 'Madhya Pradesh', pincode: '452010', lat: 22.7533, lng: 75.8937 };

/** Sub-service names of a form-schema category, as the customer sees them. */
const formSchemaSubServices = async (categoryCode) => {
  const names = (
    await FormSchema.find({ categoryCode, isActive: true })
      .sort({ subCatCode: 1 })
      .select('subCategoryName')
      .lean()
  ).map((s) => s.subCategoryName);
  if (!names.length) {
    throw new Error(`No active ${categoryCode} form schemas — the customer side has nothing to request`);
  }
  return names;
};

const PROFILES = {
  it: {
    passwordPrefix: 'Nexus',
    vendor: {
      name: 'Rohit Sharma',
      businessName: 'Nexus IT Solutions',
      email: 'nexus.it@wbi.test',
      phone: '9000000021',
      companyDescription: 'Desktop, laptop and server support for homes and offices — repairs, upgrades, OS/software setup and office AMC.'
    },
    services: async () => [
      { categoryCode: 'C02', categoryName: 'IT & Computer Services', subServices: await formSchemaSubServices('C02') }
    ],
    engineer: {
      name: 'Amit Verma',
      email: 'amit.nexus@wbi.test',
      phone: '9000000022',
      primarySkill: 'Desktop & Laptop Repair',
      secondarySkills: ['Server Setup', 'OS Installation', 'Data Recovery']
    }
  },
  digital: {
    passwordPrefix: 'Pixel',
    vendor: {
      name: 'Neha Kapoor',
      businessName: 'PixelCraft Digital Studio',
      email: 'pixelcraft.digital@wbi.test',
      phone: '9000000023',
      companyDescription: 'Websites, web apps, Android/iOS apps, UI/UX design and digital marketing for small and mid-size businesses.'
    },
    // Category codes the Digital Solutions enquiry controllers route to.
    services: async () => [
      {
        categoryCode: 'WEB',
        categoryName: 'Web & Digital Solutions',
        subServices: ['Web Development', 'Web Design', 'Digital Marketing']
      },
      { categoryCode: 'APP', categoryName: 'App Development', subServices: ['App Development'] }
    ],
    engineer: {
      name: 'Karan Mehta',
      email: 'karan.pixelcraft@wbi.test',
      phone: '9000000024',
      primarySkill: 'Full-Stack Web & App Development',
      secondarySkills: ['React', 'Node.js', 'Flutter', 'UI/UX Design']
    }
  }
};

const profileName = (process.argv.find((a) => a.startsWith('--profile=')) || '--profile=it').split('=')[1];
const PROFILE = PROFILES[profileName];
const REMOVE = process.argv.includes('--remove');

const generatePassword = () =>
  `${PROFILE.passwordPrefix}@${crypto.randomBytes(4).toString('hex')}`;

/** Email / phone must not already belong to a different login account. */
async function assertIdentityFree({ email, phone }, ownModel) {
  const models = [Admin, User, Worker, Vendor, Engineer].filter((m) => m !== ownModel);
  for (const Model of models) {
    const clash = await Model.findOne({ $or: [{ email }, { phone }] }).select('_id').lean();
    if (clash) {
      throw new Error(`${email} / ${phone} is already used by a ${Model.modelName} account`);
    }
  }
}

/** Upsert through the model so pre('save') hooks (bcrypt) run on create AND update. */
async function upsert(Model, query, data) {
  let doc = await Model.findOne(query);
  const created = !doc;
  if (doc) Object.assign(doc, data);
  else doc = new Model(data);
  await doc.save();
  return { doc, created };
}

async function remove() {
  const vendor = await Vendor.findOne({ email: PROFILE.vendor.email }).select('_id').lean();
  const engineer = await Engineer.deleteOne({ email: PROFILE.engineer.email });
  if (vendor) {
    await VendorModelApproval.deleteMany({ vendorId: vendor._id });
    await VendorWorkforceEngineer.deleteMany({ vendorId: vendor._id });
    await Vendor.deleteOne({ _id: vendor._id });
  }
  console.log(`removed vendor: ${vendor ? 'yes' : 'not found'} · engineer: ${engineer.deletedCount ? 'yes' : 'not found'}`);
  console.log('Projects, jobs and payments created while testing are kept as history.');
}

async function seed() {
  const { vendor: V, engineer: E } = PROFILE;
  const password = process.env.PROJECT_VENDOR_PASSWORD || generatePassword();
  await assertIdentityFree(V, Vendor);
  await assertIdentityFree(E, Engineer);

  const services = await PROFILE.services();
  const primary = services[0];

  const now = new Date();
  const geo = { type: 'Point', coordinates: [CITY.lng, CITY.lat] };
  const address = {
    fullAddress: `Plot 14, Scheme 54, Vijay Nagar, ${CITY.city}, ${CITY.state} ${CITY.pincode}`,
    addressLine1: 'Plot 14, Scheme 54',
    addressLine2: 'Vijay Nagar',
    city: CITY.city,
    state: CITY.state,
    pincode: CITY.pincode,
    lat: CITY.lat,
    lng: CITY.lng
  };

  const { doc: vendor, created: vendorCreated } = await upsert(Vendor, { email: V.email }, {
    name: V.name,
    businessName: V.businessName,
    email: V.email,
    phone: V.phone,
    password,
    role: 'vendor',
    businessType: 'project_partner',
    vendorType: 'project_partner',
    vendorModels: ['PROJECT'],
    partnerMode: 'company',
    incorporationType: 'Proprietorship',
    companyDescription: V.companyDescription,

    approvalStatus: 'approved',
    approvalDate: now,
    isActive: true,
    isEmailVerified: true,
    isPhoneVerified: true,
    onboarding: { currentStep: 6, completedSteps: [1, 2, 3, 4, 5, 6], progressPercentage: 100, status: 'APPROVED' },
    inductionStatus: 'completed',
    operationalAuditStatus: 'approved',
    operationalAuditAt: now,
    digitalSLAAccepted: true,
    compliance: { slaSignedAt: now, agreementVersion: 'v1' },

    // What routing matches on: category, sub-services, coverage, capacity
    approvedServices: services.map((s) => ({ ...s, approvedAt: now, status: 'active' })),
    categories: services.map((s) => s.categoryCode),
    service: services.map((s) => s.categoryName),
    operatingCities: [CITY.city],
    operationalCities: [CITY.city],
    workingCities: [CITY.city],
    serviceRadiusKm: 50,
    settings: { serviceRange: 50 },
    address,
    geoLocation: geo,
    location: { lat: CITY.lat, lng: CITY.lng, updatedAt: now },
    teamSize: 1,
    totalEngineers: 1,
    maxCapacity: 20,
    maxCapacityPerMonth: 60,
    workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    workingHours: '09:00 AM - 07:00 PM'
  });

  // Login derives the sidebar modules from model approvals (PROJECT → Projects).
  await VendorModelApproval.updateOne(
    { vendorId: vendor._id, model: 'PROJECT' },
    { $set: { status: 'approved', approvedAt: now, rejectionReason: null } },
    { upsert: true }
  );

  const companyCode = (await ensureVendorCompanyCode(vendor)) || vendor.uniqueCompanyCode || null;

  const { doc: engineer, created: engineerCreated } = await upsert(Engineer, { email: E.email }, {
    name: E.name,
    email: E.email,
    phone: E.phone,
    password,
    role: 'engineer',
    roleType: 'Engineer',
    engineerType: 'vendor_engineer',
    registrationType: 'Company / Firm Employee',
    approvalStatus: 'approved',
    status: 'ONLINE',
    isActive: true,
    isPhoneVerified: true,
    primaryCategory: primary.categoryCode,
    primarySkill: E.primarySkill,
    serviceCategories: services.flatMap((s) => [s.categoryCode, s.categoryName]),
    secondarySkills: E.secondarySkills,
    availability: 'Full Time',
    geoLocation: geo,
    location: { lat: CITY.lat, lng: CITY.lng, updatedAt: now },
    address: { city: CITY.city, state: CITY.state, pincode: CITY.pincode },
    vendorId: vendor._id,
    vendorApprovalStatus: 'approved',
    linkedViaCode: companyCode
  });

  await Vendor.updateOne({ _id: vendor._id }, { $addToSet: { teamEngineers: engineer._id } });
  const roster = await syncLinkedEngineers(vendor._id);

  // Cached /vendor/config from an earlier run would hide the refreshed services.
  try {
    const { invalidateVendorConfigCache } = require('../controllers/vendorControllers/vendorConfigController');
    await invalidateVendorConfigCache(String(vendor._id));
  } catch (_) {
    /* cache is optional */
  }

  return { password, vendor, engineer, companyCode, services, roster, vendorCreated, engineerCreated };
}

async function run() {
  if (!PROFILE) {
    console.error(`Unknown profile "${profileName}". Use one of: ${Object.keys(PROFILES).join(', ')}`);
    process.exit(1);
  }
  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI is not set.');
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 40000 });
  console.log(`[seed:${profileName}] ${mongoose.connection.host} / ${mongoose.connection.db.databaseName}\n`);

  if (REMOVE) {
    await remove();
    return;
  }

  const r = await seed();
  const codes = r.services.map((s) => s.categoryCode).join(' + ');
  console.log(`${r.vendorCreated ? 'created' : 'updated'}  VENDOR    ${r.vendor.businessName}  (${codes} · ${CITY.city} · code ${r.companyCode || '-'})`);
  console.log(`${r.engineerCreated ? 'created' : 'updated'}  ENGINEER  ${r.engineer.name}  (on roster: ${r.roster?.created || r.roster?.updated ? 'yes' : 'check'})`);
  r.services.forEach((s) => console.log(`          ${s.categoryCode}: ${s.subServices.join(' · ')}`));
  console.log('\n================ LOGINS ================');
  console.log(`Vendor    /vendor/login     ${PROFILE.vendor.email}   /  ${r.password}`);
  console.log(`Engineer  /engineer/login   ${PROFILE.engineer.phone}          /  ${r.password}`);
}

run()
  .catch((err) => {
    console.error('[seed] failed:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
    process.exit();
  });
