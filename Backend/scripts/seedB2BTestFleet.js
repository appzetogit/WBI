/**
 * Seed a B2B test fleet: 2 vendors, 4 vendor engineers (2 per vendor) and
 * 4 freelance engineers.
 *
 *   npm run seed:b2b-fleet
 *
 * Everything is created through the real Mongoose models so password hashing,
 * schema validation and hooks all run exactly as they do in the app.
 *
 * Each engineer is seeded in a state the B2B dispatch engine can actually
 * match — the fields below are the ones b2bEngineerEligibility filters on:
 *   roleType 'Engineer' · approvalStatus 'approved' · status 'ONLINE'
 *   isActive true · a REAL geoLocation (never the [0,0] default)
 *   serviceCategories that overlap the services B2B jobs actually carry
 *
 * Vendor engineers additionally carry vendorId + vendorApprovalStatus 'approved'
 * so the vendor owns them and can assign work.
 *
 * Idempotent: re-running updates the existing records instead of duplicating.
 * All records are tagged with the qa.wbi.test email domain so they are easy to
 * find and remove later.
 */

require('dotenv').config();
const mongoose = require('mongoose');

const Engineer = require('../models/Engineer');
const Vendor = require('../models/Vendor');
const { ensureVendorCompanyCode } = require('../utils/vendorCompanyCode');

const PASSWORD = process.env.QA_FLEET_PASSWORD;
if (!PASSWORD) {
  console.error('QA_FLEET_PASSWORD env var is required (no default password is baked in).');
  process.exit(1);
}
if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to seed QA fleet accounts when NODE_ENV=production.');
  process.exit(1);
}
const DOMAIN = 'qa.wbi.test';

/** Indore. Small offsets so proximity ordering is meaningful, all within ~6 km. */
const BASE = { lat: 22.7196, lng: 75.8577 };
const at = (dLat, dLng) => ({ lat: BASE.lat + dLat, lng: BASE.lng + dLng });

const VENDORS = [
  {
    key: 'coolcare',
    businessName: 'WBIQA Cool Care Services',
    ownerName: 'QA Vendor Cool Care',
    email: `vendor.coolcare@${DOMAIN}`,
    phone: '9000000010',
    pos: at(0.010, 0.012),
    services: [
      { categoryCode: 'C06', categoryName: 'Home Appliances', status: 'active' }
    ],
    engineers: [
      {
        name: 'QA Eng Ravi (Cool Care)',
        email: `eng.ravi@${DOMAIN}`,
        phone: '9000000011',
        pos: at(0.012, 0.010),
        primarySkill: 'AC Service & Repair',
        serviceCategories: ['AC Service & Repair', 'Home Appliances'],
        secondarySkills: ['Washing Machine Repair', 'Geyser Repair']
      },
      {
        name: 'QA Eng Suresh (Cool Care)',
        email: `eng.suresh@${DOMAIN}`,
        phone: '9000000012',
        pos: at(-0.008, 0.014),
        primarySkill: 'Washing Machine Repair',
        serviceCategories: ['Washing Machine Repair', 'Home Appliances'],
        secondarySkills: ['Geyser Repair']
      }
    ]
  },
  {
    key: 'powerline',
    businessName: 'WBIQA PowerLine Electricals',
    ownerName: 'QA Vendor PowerLine',
    email: `vendor.powerline@${DOMAIN}`,
    phone: '9000000013',
    pos: at(-0.014, -0.010),
    services: [
      { categoryCode: 'C12', categoryName: 'Electrician', status: 'active' }
    ],
    engineers: [
      {
        name: 'QA Eng Imran (PowerLine)',
        email: `eng.imran@${DOMAIN}`,
        phone: '9000000014',
        pos: at(-0.012, -0.008),
        primarySkill: 'Electrician Service',
        serviceCategories: ['Electrician Service'],
        secondarySkills: ['Wiring']
      },
      {
        name: 'QA Eng Deepak (PowerLine)',
        email: `eng.deepak@${DOMAIN}`,
        phone: '9000000015',
        pos: at(-0.016, -0.013),
        primarySkill: 'Electrician Service',
        serviceCategories: ['Electrician Service'],
        secondarySkills: ['Electrical']
      }
    ]
  }
];

const FREELANCERS = [
  {
    name: 'QA Freelancer Anil (AC)',
    email: `free.anil@${DOMAIN}`,
    phone: '9000000016',
    pos: at(0.004, 0.003),
    primarySkill: 'AC Service & Repair',
    serviceCategories: ['AC Service & Repair', 'Home Appliances'],
    secondarySkills: ['Geyser Repair']
  },
  {
    name: 'QA Freelancer Vikas (Electrician)',
    email: `free.vikas@${DOMAIN}`,
    phone: '9000000017',
    pos: at(-0.005, 0.006),
    primarySkill: 'Electrician Service',
    serviceCategories: ['Electrician Service'],
    secondarySkills: ['Wiring']
  },
  {
    name: 'QA Freelancer Manoj (Plumbing)',
    email: `free.manoj@${DOMAIN}`,
    phone: '9000000018',
    pos: at(0.007, -0.005),
    primarySkill: 'Plumbing Service',
    serviceCategories: ['Plumbing Service'],
    secondarySkills: ['Plumbing']
  },
  {
    name: 'QA Freelancer Sohail (CCTV)',
    email: `free.sohail@${DOMAIN}`,
    phone: '9000000019',
    pos: at(-0.003, -0.007),
    primarySkill: 'CCTV Installation',
    serviceCategories: ['CCTV Installation', 'CCTV & Surveillance'],
    secondarySkills: ['Surveillance']
  }
];

/** Fields every seeded engineer needs to be visible to the dispatch engine. */
const engineerDoc = (spec, vendor = null) => ({
  name: spec.name,
  email: spec.email,
  phone: spec.phone,
  password: PASSWORD, // hashed by the model's pre('save') hook
  role: 'engineer',
  roleType: 'Engineer',
  engineerType: vendor ? 'vendor_engineer' : 'freelancer',
  registrationType: vendor ? 'Company / Firm Employee' : 'Freelancer',

  // Dispatch-critical state
  approvalStatus: 'approved',
  status: 'ONLINE',
  isActive: true,
  isPhoneVerified: true,

  // Skills the matcher compares against the job's service
  primaryCategory: spec.serviceCategories[0],
  primarySkill: spec.primarySkill,
  serviceCategories: spec.serviceCategories,
  secondarySkills: spec.secondarySkills || [],

  // Real coordinates — [0,0] makes an engineer permanently unmatchable
  geoLocation: { type: 'Point', coordinates: [spec.pos.lng, spec.pos.lat] },
  location: { lat: spec.pos.lat, lng: spec.pos.lng, updatedAt: new Date() },
  address: { city: 'Indore', state: 'Madhya Pradesh', pincode: '452001' },

  availability: 'Full Time',
  emergencyService: true,

  // Vendor ownership (null for freelancers)
  vendorId: vendor ? vendor._id : null,
  vendorApprovalStatus: vendor ? 'approved' : 'not_required',
  linkedViaCode: vendor ? vendor.companyCode || null : null
});

const vendorDoc = (spec) => ({
  name: spec.ownerName,
  ownerName: spec.ownerName,
  businessName: spec.businessName,
  email: spec.email,
  phone: spec.phone,
  password: PASSWORD,
  role: 'vendor',
  approvalStatus: 'approved',
  isActive: true,
  isOnline: true,
  approvedServices: spec.services,
  categories: spec.services.map((s) => s.categoryCode),
  geoLocation: { type: 'Point', coordinates: [spec.pos.lng, spec.pos.lat] },
  location: { lat: spec.pos.lat, lng: spec.pos.lng, updatedAt: new Date() },
  address: { city: 'Indore', state: 'Madhya Pradesh', pincode: '452001' },
  operatingCities: ['Indore'],
  operationalCities: ['Indore'],
  teamSize: 2,
  maxCapacity: 20
});

/** Upsert through the model so hooks (bcrypt) run on create AND on update. */
async function upsert(Model, query, data) {
  let doc = await Model.findOne(query);
  if (doc) {
    Object.assign(doc, data);
    await doc.save();
    return { doc, created: false };
  }
  doc = new Model(data);
  await doc.save();
  return { doc, created: true };
}

async function run() {
  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI is not set.');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 40000 });
  console.log(`[seed] connected to ${mongoose.connection.db.databaseName}\n`);

  const summary = { vendors: [], vendorEngineers: [], freelancers: [] };

  // ── Vendors + their engineers ───────────────────────────────────────
  for (const spec of VENDORS) {
    const { doc: vendor, created } = await upsert(
      Vendor,
      { email: spec.email },
      vendorDoc(spec)
    );

    // Company code is what an engineer uses to join this vendor.
    let companyCode = vendor.uniqueCompanyCode || null;
    try {
      companyCode = (await ensureVendorCompanyCode(vendor)) || vendor.uniqueCompanyCode || null;
    } catch (err) {
      console.warn(`[seed] company code for ${spec.businessName}: ${err.message}`);
    }

    summary.vendors.push({
      businessName: vendor.businessName,
      email: vendor.email,
      phone: vendor.phone,
      companyCode,
      services: spec.services.map((s) => s.categoryCode).join(','),
      created
    });
    console.log(`${created ? 'created' : 'updated'}  VENDOR   ${vendor.businessName}  (${companyCode || 'no code'})`);

    for (const eSpec of spec.engineers) {
      const { doc: eng, created: eCreated } = await upsert(
        Engineer,
        { email: eSpec.email },
        engineerDoc(eSpec, { _id: vendor._id, companyCode })
      );
      summary.vendorEngineers.push({
        name: eng.name,
        email: eng.email,
        phone: eng.phone,
        vendor: vendor.businessName,
        skill: eSpec.primarySkill,
        created: eCreated
      });
      console.log(`${eCreated ? 'created' : 'updated'}    ENGINEER ${eng.name}  [${eSpec.primarySkill}]`);
    }
  }

  // ── Freelancers ─────────────────────────────────────────────────────
  console.log('');
  for (const fSpec of FREELANCERS) {
    const { doc: eng, created } = await upsert(
      Engineer,
      { email: fSpec.email },
      engineerDoc(fSpec, null)
    );
    summary.freelancers.push({
      name: eng.name,
      email: eng.email,
      phone: eng.phone,
      skill: fSpec.primarySkill,
      created
    });
    console.log(`${created ? 'created' : 'updated'}  FREELANCER ${eng.name}  [${fSpec.primarySkill}]`);
  }

  // ── Report ──────────────────────────────────────────────────────────
  console.log('\n================ TEST FLEET ================');
  console.log(`password for every account below: ${PASSWORD}\n`);

  console.log('VENDORS  (login: /vendor/login — email + password)');
  summary.vendors.forEach((v) =>
    console.log(`  ${v.businessName.padEnd(30)} ${v.email.padEnd(34)} code=${v.companyCode || '-'}  services=${v.services}`)
  );

  console.log('\nVENDOR ENGINEERS  (login: /engineer/login — PHONE + password)');
  summary.vendorEngineers.forEach((e) =>
    console.log(`  ${e.name.padEnd(30)} ${e.phone.padEnd(12)} ${e.skill.padEnd(24)} under ${e.vendor}`)
  );

  console.log('\nFREELANCE ENGINEERS  (login: /engineer/login — PHONE + password)');
  summary.freelancers.forEach((e) =>
    console.log(`  ${e.name.padEnd(30)} ${e.phone.padEnd(12)} ${e.skill}`)
  );

  console.log('\nAll accounts: approved · ONLINE · Indore coordinates · dispatch-ready.');
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('[seed] failed:', err.message);
  process.exit(1);
});
