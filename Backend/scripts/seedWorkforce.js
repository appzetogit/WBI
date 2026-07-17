/**
 * Seed: Workforce demo data
 * npm run seed:workforce
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Vendor = require('../models/Vendor');
const VendorWorkforceEngineer = require('../models/VendorWorkforceEngineer');
const VendorWorkforceTeam = require('../models/VendorWorkforceTeam');
const VendorWorkforceAssignment = require('../models/VendorWorkforceAssignment');
const VendorWorkforceAttendance = require('../models/VendorWorkforceAttendance');
const VendorWorkforceLeave = require('../models/VendorWorkforceLeave');
const VendorWorkforceCertification = require('../models/VendorWorkforceCertification');

const VENDOR_ID_ARG = process.argv[2];
const DEMO_TAG = 'wbi-wf-demo';

const connectForScript = async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set');
  mongoose.set('bufferCommands', false);
  await mongoose.connect(uri, { family: 4, serverSelectionTimeoutMS: 30000, connectTimeoutMS: 30000 });
  console.log(`✅ MongoDB Connected: ${mongoose.connection.host}`);
};

const daysAgo = (d) => new Date(Date.now() - d * 86400000);
const daysFromNow = (d) => new Date(Date.now() + d * 86400000);

/** Dynamic role/skill templates by service — no hardcoded UI coupling */
const SERVICE_TEMPLATES = {
  SOLAR: {
    name: 'Solar Energy',
    roles: ['Survey Engineer', 'Installation Engineer', 'QA Inspector', 'Site Supervisor'],
    skills: ['Solar Installation', 'Electrical Wiring', 'Panel Mounting', 'Commissioning', 'Safety'],
    certs: ['MNRE Solar Installer', 'Electrical License', 'Work at Height']
  },
  CCTV: {
    name: 'CCTV & Surveillance',
    roles: ['CCTV Technician', 'Network Engineer', 'Site Supervisor'],
    skills: ['Camera Install', 'NVR Config', 'Cabling', 'Networking'],
    certs: ['CCTV Technician Cert', 'Network Cabling']
  },
  WEB: {
    name: 'Web Development',
    roles: ['Full Stack Developer', 'QA Engineer', 'UI/UX Designer', 'DevOps'],
    skills: ['React', 'Node.js', 'MongoDB', 'QA Automation', 'CI/CD'],
    certs: ['AWS Cloud Practitioner', 'Scrum Foundation']
  },
  AC: {
    name: 'HVAC',
    roles: ['AC Technician', 'Installation Engineer', 'Supervisor'],
    skills: ['AC Installation', 'Gas Charging', 'Troubleshooting', 'AMC'],
    certs: ['HVAC Technician License', 'Refrigerant Handling']
  },
  NET: {
    name: 'Networking',
    roles: ['Network Engineer', 'Fiber Engineer', 'Site Supervisor'],
    skills: ['Fiber Splicing', 'Switch Config', 'SD-WAN', 'Structured Cabling'],
    certs: ['CCNA', 'Fiber Optics Cert']
  },
  EV: {
    name: 'EV Charging',
    roles: ['EV Technician', 'Electrical Engineer', 'Commissioning Lead'],
    skills: ['EV Charger Install', 'Electrical Safety', 'Load Testing'],
    certs: ['EVSE Installer', 'Electrical License']
  },
  ATM: {
    name: 'ATM Maintenance',
    roles: ['Field Engineer', 'Spare Parts Tech', 'Supervisor'],
    skills: ['ATM PMC', 'Cash Module', 'SLA Field Service'],
    certs: ['OEM ATM Certified', 'Background Verified']
  },
  DEFAULT: {
    name: 'General Services',
    roles: ['Field Engineer', 'Technician', 'Supervisor'],
    skills: ['Field Service', 'Safety', 'Customer Handling'],
    certs: ['Safety Induction', 'ID Verification']
  }
};

const ENGINEER_POOL = [
  { name: 'Rahul Verma', city: 'Pune', avail: 'available', att: 'checked_in', score: 92, rating: 4.8 },
  { name: 'Sneha Iyer', city: 'Mumbai', avail: 'on_project', att: 'checked_in', score: 88, rating: 4.6 },
  { name: 'Amit Khan', city: 'Mumbai', avail: 'available', att: 'checked_in', score: 85, rating: 4.4 },
  { name: 'Priya Nair', city: 'Bengaluru', avail: 'busy', att: 'checked_in', score: 94, rating: 4.9 },
  { name: 'Vikas Patel', city: 'Ahmedabad', avail: 'available', att: 'checked_out', score: 80, rating: 4.2 },
  { name: 'Neha Gupta', city: 'Delhi', avail: 'leave', att: 'absent', score: 78, rating: 4.1 },
  { name: 'Arjun Mehta', city: 'Pune', avail: 'traveling', att: 'checked_in', score: 86, rating: 4.5 },
  { name: 'Kavita Rao', city: 'Jaipur', avail: 'offline', att: 'checked_out', score: 75, rating: 4.0 },
  { name: 'Rohan Desai', city: 'Pune', avail: 'available', att: 'late', score: 83, rating: 4.3 },
  { name: 'Meera Joshi', city: 'Hyderabad', avail: 'on_project', att: 'checked_in', score: 90, rating: 4.7 }
];

const PROJECTS = [
  { name: 'Rooftop Solar 50kW', code: 'PRJ-SOLAR-01', task: 'Panel mounting bay A' },
  { name: 'CCTV Retail Rollout', code: 'PRJ-CCTV-01', task: 'NVR configuration' },
  { name: 'Corporate Web Portal', code: 'PRJ-WEB-01', task: 'Sprint 3 development' },
  { name: 'ATM PMC Western', code: 'PRJ-ATM-01', task: 'Preventive visit cluster 2' },
  { name: 'SD-WAN Upgrade', code: 'PRJ-NET-01', task: 'Branch switch config' }
];

function pickTemplate(code) {
  return SERVICE_TEMPLATES[code] || SERVICE_TEMPLATES.DEFAULT;
}

async function seedVendor(vendorId) {
  const vid = new mongoose.Types.ObjectId(vendorId);
  const serviceCodes = Object.keys(SERVICE_TEMPLATES).filter((k) => k !== 'DEFAULT');
  const engineers = [];

  for (let i = 0; i < ENGINEER_POOL.length; i++) {
    const p = ENGINEER_POOL[i];
    const code = serviceCodes[i % serviceCodes.length];
    const tpl = pickTemplate(code);
    const role = tpl.roles[i % tpl.roles.length];
    const skills = tpl.skills.map((name, si) => ({
      name,
      proficiency: 70 + ((i + si) % 30),
      years: 1 + ((i + si) % 8),
      certified: si < 2
    }));

    const eng = new VendorWorkforceEngineer({
      vendorId: vid,
      name: p.name,
      email: `${p.name.toLowerCase().replace(/\s/g, '.')}@vendor.demo`,
      phone: `98${String(10000000 + i).slice(0, 8)}`,
      role,
      department: i % 4 === 0 ? 'Management' : 'Operations',
      reportingManager: i % 4 === 0 ? 'Vendor Owner' : 'Ops Manager',
      serviceCategoryCode: code,
      serviceCategoryName: tpl.name,
      primarySkill: skills[0]?.name || '',
      skills,
      experienceYears: 2 + (i % 10),
      certificationLevel: ['junior', 'mid', 'senior', 'lead'][i % 4],
      assignedProjects: [{ name: PROJECTS[i % PROJECTS.length].name, projectCode: PROJECTS[i % PROJECTS.length].code }],
      todayTask: PROJECTS[i % PROJECTS.length].task,
      availability: p.avail,
      currentLocation: `${p.city} Site`,
      city: p.city,
      gps: {
        lat: 18.5 + i * 0.1,
        lng: 73.8 + i * 0.05,
        lastSeen: new Date(),
        battery: 40 + (i * 7) % 60,
        internet: p.avail === 'offline' ? 'offline' : 'online'
      },
      attendanceStatus: p.att === 'absent' ? 'absent' : p.att === 'late' ? 'late' : p.att,
      kycStatus: i % 5 === 0 ? 'pending' : 'verified',
      performanceScore: p.score,
      rating: p.rating,
      walletBalance: 5000 + i * 1200,
      status: 'active',
      capacity: 100,
      utilization: p.avail === 'available' ? 20 + i * 5 : 60 + i * 3,
      nextAvailableAt: p.avail === 'leave' ? daysFromNow(3) : daysFromNow(0),
      demoTag: DEMO_TAG
    });
    await eng.save();
    engineers.push(eng);
  }

  // Teams — one per service template used
  for (let t = 0; t < 5; t++) {
    const code = serviceCodes[t % serviceCodes.length];
    const tpl = pickTemplate(code);
    const members = engineers.filter((e) => e.serviceCategoryCode === code).slice(0, 3);
    const leader = members[0] || engineers[t];
    const team = new VendorWorkforceTeam({
      vendorId: vid,
      name: `${tpl.roles[0].split(' ')[0]} ${tpl.name.split(' ')[0]} Team`,
      teamType: 'execution',
      serviceCategoryCode: code,
      serviceCategoryName: tpl.name,
      leaderName: leader.name,
      leaderId: leader._id,
      members: members.map((m) => ({
        engineerId: m._id,
        name: m.name,
        role: m.role,
        employeeId: m.employeeId
      })),
      currentProjects: [{ name: PROJECTS[t % PROJECTS.length].name, projectCode: PROJECTS[t % PROJECTS.length].code }],
      location: leader.city,
      city: leader.city,
      capacity: 8,
      utilization: 40 + t * 10,
      status: t % 2 === 0 ? 'deployed' : 'active',
      demoTag: DEMO_TAG
    });
    await team.save();
  }

  // Assignments
  for (let a = 0; a < 8; a++) {
    const eng = engineers[a % engineers.length];
    const pr = PROJECTS[a % PROJECTS.length];
    const asg = new VendorWorkforceAssignment({
      vendorId: vid,
      projectName: pr.name,
      projectCode: pr.code,
      engineerId: eng._id,
      engineerName: eng.name,
      employeeId: eng.employeeId,
      task: pr.task,
      serviceCategoryCode: eng.serviceCategoryCode,
      serviceCategoryName: eng.serviceCategoryName,
      startDate: daysAgo(5 + a),
      deadline: daysFromNow(10 - a),
      priority: a % 3 === 0 ? 'urgent' : a % 2 === 0 ? 'high' : 'normal',
      status: ['assigned', 'in_progress', 'completed', 'escalated'][a % 4],
      progress: [10, 45, 100, 60][a % 4],
      hoursLogged: 4 + a * 2,
      location: eng.currentLocation,
      city: eng.city,
      demoTag: DEMO_TAG
    });
    await asg.save();
  }

  // Attendance (last 3 days × subset)
  for (let d = 0; d < 3; d++) {
    for (let i = 0; i < Math.min(8, engineers.length); i++) {
      const eng = engineers[i];
      const checkInHour = 8 + (i % 3);
      const att = new VendorWorkforceAttendance({
        vendorId: vid,
        engineerId: eng._id,
        engineerName: eng.name,
        employeeId: eng.employeeId,
        date: daysAgo(d),
        checkIn: new Date(daysAgo(d).setHours(checkInHour, 15, 0, 0)),
        checkOut: d === 0 && eng.attendanceStatus === 'checked_in' ? null : new Date(daysAgo(d).setHours(18, 0, 0, 0)),
        checkInGps: { lat: eng.gps.lat, lng: eng.gps.lng, address: eng.city },
        faceVerified: true,
        otpVerified: i % 2 === 0,
        workingHours: d === 0 ? checkInHour : 8.5,
        overtimeHours: i % 4 === 0 ? 1.5 : 0,
        breakMinutes: 45,
        status: eng.availability === 'leave' ? 'on_leave' : i === 5 ? 'late' : 'present',
        demoTag: DEMO_TAG
      });
      await att.save();
    }
  }

  // Leaves
  const leaveTypes = ['casual', 'sick', 'emergency', 'paid'];
  for (let l = 0; l < 5; l++) {
    const eng = engineers[l + 2];
    const leave = new VendorWorkforceLeave({
      vendorId: vid,
      engineerId: eng._id,
      engineerName: eng.name,
      employeeId: eng.employeeId,
      leaveType: leaveTypes[l % leaveTypes.length],
      startDate: daysFromNow(l),
      endDate: daysFromNow(l + 1 + (l % 2)),
      days: 1 + (l % 2),
      reason: ['Family function', 'Medical', 'Emergency travel', 'Personal', 'Festival'][l],
      status: ['pending', 'approved', 'pending', 'manager_approved', 'rejected'][l],
      approvedBy: l === 1 ? 'Ops Manager' : '',
      rejectionReason: l === 4 ? 'Peak project week' : '',
      demoTag: DEMO_TAG
    });
    await leave.save();
  }

  // Certifications
  for (let i = 0; i < engineers.length; i++) {
    const eng = engineers[i];
    const tpl = pickTemplate(eng.serviceCategoryCode);
    for (let c = 0; c < tpl.certs.length; c++) {
      const expDays = c === 0 ? 20 : 120 + c * 60;
      const cert = new VendorWorkforceCertification({
        vendorId: vid,
        engineerId: eng._id,
        engineerName: eng.name,
        employeeId: eng.employeeId,
        name: tpl.certs[c],
        category: c === 0 ? 'license' : 'technical',
        serviceCategoryCode: eng.serviceCategoryCode,
        issuingAuthority: 'WBI Compliance Board',
        certificateNumber: `CERT-${eng.serviceCategoryCode}-${1000 + i * 10 + c}`,
        issueDate: daysAgo(200 + c * 30),
        expiryDate: daysFromNow(expDays),
        mandatory: c === 0,
        verificationStatus: expDays < 30 ? 'renewal_due' : 'verified',
        demoTag: DEMO_TAG
      });
      await cert.save();
    }
  }

  return engineers.length;
}

async function main() {
  await connectForScript();
  let vendorIds = [];
  if (VENDOR_ID_ARG) {
    vendorIds = [VENDOR_ID_ARG];
  } else {
    const vendors = await Vendor.find().sort({ createdAt: -1 }).limit(20).select('_id').lean();
    vendorIds = vendors.map((v) => v._id.toString());
  }
  if (!vendorIds.length) {
    console.log('No vendors found');
    process.exit(1);
  }

  console.log(`🧹 Clearing demo tag ${DEMO_TAG}...`);
  await Promise.all([
    VendorWorkforceEngineer.deleteMany({ demoTag: DEMO_TAG }),
    VendorWorkforceTeam.deleteMany({ demoTag: DEMO_TAG }),
    VendorWorkforceAssignment.deleteMany({ demoTag: DEMO_TAG }),
    VendorWorkforceAttendance.deleteMany({ demoTag: DEMO_TAG }),
    VendorWorkforceLeave.deleteMany({ demoTag: DEMO_TAG }),
    VendorWorkforceCertification.deleteMany({ demoTag: DEMO_TAG })
  ]);

  let totalEng = 0;
  for (const id of vendorIds) {
    const n = await seedVendor(id);
    totalEng += n;
    console.log(`  ✓ Vendor ${id}: ${n} engineers`);
  }

  console.log(`\n✅ Seeded Workforce: ${totalEng} engineers across ${vendorIds.length} vendors`);
  console.log('👉 Open /vendor/dynamic/workforce/engineers');
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
