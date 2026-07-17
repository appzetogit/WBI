/**
 * Seed: Project Operations demo data
 * npm run seed:project-ops
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Vendor = require('../models/Vendor');
const VendorOpsProject = require('../models/VendorOpsProject');
const VendorOpsSite = require('../models/VendorOpsSite');
const VendorOpsMilestone = require('../models/VendorOpsMilestone');
const VendorDispatch = require('../models/VendorDispatch');
const VendorCalendarEvent = require('../models/VendorCalendarEvent');

const VENDOR_ID_ARG = process.argv[2];
const DEMO_TAG = 'wbi-po-demo';

const connectForScript = async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set');
  mongoose.set('bufferCommands', false);
  await mongoose.connect(uri, { family: 4, serverSelectionTimeoutMS: 30000, connectTimeoutMS: 30000 });
  console.log(`✅ MongoDB Connected: ${mongoose.connection.host}`);
};

const daysAgo = (d) => new Date(Date.now() - d * 86400000);
const daysFromNow = (d) => new Date(Date.now() + d * 86400000);

const MILESTONE_TEMPLATES = {
  SOLAR: ['Site Survey', 'Material Delivery', 'Installation', 'Commissioning', 'Handover'],
  CCTV: ['Site Survey', 'Cabling', 'Camera Install', 'NVR Config', 'Handover'],
  WEB: ['Requirements', 'Development', 'QA', 'Deployment', 'Warranty'],
  ATM: ['Mobilization', 'Preventive Visit', 'Spare Replace', 'SLA Review'],
  NET: ['Assessment', 'Structured Cabling', 'Switch Config', 'UAT', 'Go-Live'],
  DEFAULT: ['Kickoff', 'Execution', 'Inspection', 'Completion']
};

const PROJECTS = [
  { title: 'Rooftop Solar 50kW — Industrial Unit', client: 'Bharat Auto Components', code: 'SOLAR', name: 'Solar Energy', type: 'installation', city: 'Pune', budget: 2800000, progress: 45, status: 'in_progress', stage: 'Installation', risk: 'low', pay: 'partial', sla: 'on_track' },
  { title: 'CCTV Rollout — 12 Retail Stores', client: 'StyleMart Retail', code: 'CCTV', name: 'CCTV & Surveillance', type: 'project', city: 'Mumbai', budget: 1850000, progress: 72, status: 'in_progress', stage: 'NVR Config', risk: 'medium', pay: 'partial', sla: 'at_risk' },
  { title: 'Corporate Web Portal Rebuild', client: 'NovaTech Solutions', code: 'WEB', name: 'Web Development', type: 'project', city: 'Bengaluru', budget: 480000, progress: 30, status: 'planning', stage: 'Requirements', risk: 'low', pay: 'pending', sla: 'on_track' },
  { title: 'ATM PMC — Western Cluster', client: 'HDFC Bank', code: 'ATM', name: 'ATM Maintenance', type: 'amc', city: 'Mumbai', budget: 5959000, progress: 58, status: 'in_progress', stage: 'Preventive Visit', risk: 'high', pay: 'overdue', sla: 'breached' },
  { title: 'SD-WAN Branch Upgrade', client: 'CapitalFirst Bank', code: 'NET', name: 'Networking', type: 'project', city: 'Delhi', budget: 4200000, progress: 15, status: 'planning', stage: 'Assessment', risk: 'low', pay: 'pending', sla: 'on_track' },
  { title: 'Break-fix — EV Charger Fault', client: 'MetroSquare Mall', code: 'EV', name: 'EV Charging', type: 'break_fix', city: 'Pune', budget: 45000, progress: 90, status: 'at_risk', stage: 'Repair', risk: 'high', pay: 'pending', sla: 'at_risk' },
  { title: 'Office HVAC AMC — FY26', client: 'Techno Park Developers', code: 'AC', name: 'HVAC', type: 'amc', city: 'Hyderabad', budget: 960000, progress: 100, status: 'completed', stage: 'Handover', risk: 'low', pay: 'paid', sla: 'on_track' },
  { title: 'Support Retainer — Cloud Ops', client: 'Precision Tools India', code: 'CLOUD', name: 'Cloud Services', type: 'support', city: 'Chennai', budget: 720000, progress: 40, status: 'in_progress', stage: 'Monitoring', risk: 'low', pay: 'partial', sla: 'on_track' }
];

const ENGINEERS = [
  { name: 'Rahul Verma', skills: ['Solar', 'Electrical'], dist: 3.2, load: 1, avail: 'available', city: 'Pune', vehicle: 'Bike' },
  { name: 'Sneha Iyer', skills: ['CCTV', 'Networking'], dist: 5.8, load: 2, avail: 'on_job', city: 'Mumbai', vehicle: 'Van' },
  { name: 'Amit Khan', skills: ['ATM', 'Field Service'], dist: 12.4, load: 1, avail: 'available', city: 'Mumbai', vehicle: 'Car' },
  { name: 'Priya Nair', skills: ['Web', 'Cloud'], dist: 0, load: 3, avail: 'on_job', city: 'Bengaluru', vehicle: '' },
  { name: 'Vikas Patel', skills: ['HVAC', 'Electrical'], dist: 8.1, load: 0, avail: 'available', city: 'Ahmedabad', vehicle: 'Van' },
  { name: 'Neha Gupta', skills: ['Networking', 'CCTV'], dist: 15.0, load: 0, avail: 'on_leave', city: 'Delhi', vehicle: 'Bike' },
  { name: 'Arjun Mehta', skills: ['EV', 'Electrical'], dist: 4.5, load: 1, avail: 'available', city: 'Pune', vehicle: 'Bike' },
  { name: 'Kavita Rao', skills: ['Solar', 'Inspection'], dist: 22.0, load: 2, avail: 'offline', city: 'Jaipur', vehicle: 'Car' }
];

async function seedVendor(vendorId) {
  const vid = new mongoose.Types.ObjectId(vendorId);
  const projects = [];

  for (let i = 0; i < PROJECTS.length; i++) {
    const p = PROJECTS[i];
    const project = new VendorOpsProject({
      vendorId: vid,
      title: p.title,
      clientName: p.client,
      clientType: 'b2b',
      serviceCategoryCode: p.code,
      serviceCategoryName: p.name,
      projectType: p.type,
      priority: p.risk === 'high' ? 'urgent' : p.risk === 'medium' ? 'high' : 'normal',
      budget: p.budget,
      progress: p.progress,
      currentStage: p.stage,
      status: p.status,
      assignedManager: 'Ops Manager',
      assignedEngineers: [
        { name: ENGINEERS[i % ENGINEERS.length].name, role: 'Lead Engineer', status: 'on_job' },
        { name: ENGINEERS[(i + 1) % ENGINEERS.length].name, role: 'Field Engineer', status: 'available' }
      ],
      startDate: daysAgo(30 + i),
      endDate: daysFromNow(60 - i * 5),
      city: p.city,
      siteCount: p.type === 'amc' ? 50 : p.type === 'project' ? 8 : 1,
      riskLevel: p.risk,
      paymentStatus: p.pay,
      slaStatus: p.sla,
      upcomingMilestone: (MILESTONE_TEMPLATES[p.code] || MILESTONE_TEMPLATES.DEFAULT)[1],
      demoTag: DEMO_TAG
    });
    await project.save();
    projects.push(project);

    // Sites (2–3 per project)
    const siteCount = Math.min(3, Math.max(1, Math.floor(project.siteCount / 20) || 2));
    for (let s = 0; s < siteCount; s++) {
      const site = new VendorOpsSite({
        vendorId: vid,
        projectId: project._id,
        name: `${p.city} Site ${s + 1}`,
        clientName: p.client,
        address: `${100 + s * 10}, Industrial Area, ${p.city}`,
        city: p.city,
        state: p.city === 'Bengaluru' ? 'Karnataka' : 'Maharashtra',
        region: 'West',
        lat: 18.5 + Math.random() * 10,
        lng: 72.8 + Math.random() * 5,
        status: s === 0 ? 'in_progress' : s === 1 ? 'active' : 'pending',
        assignedTeam: [{ name: ENGINEERS[i % ENGINEERS.length].name, role: 'Lead' }],
        gpsStatus: s === 0 ? 'online' : 'unknown',
        otpVerified: s === 0,
        checkInAt: s === 0 ? daysAgo(0) : null,
        photoCount: s === 0 ? 4 : 0,
        demoTag: DEMO_TAG
      });
      await site.save();
    }

    // Milestones from service template
    const stages = MILESTONE_TEMPLATES[p.code] || MILESTONE_TEMPLATES.DEFAULT;
    for (let m = 0; m < stages.length; m++) {
      const done = m < Math.floor((p.progress / 100) * stages.length);
      const ms = new VendorOpsMilestone({
        vendorId: vid,
        projectId: project._id,
        title: stages[m],
        serviceCategoryCode: p.code,
        sequence: m + 1,
        dueDate: daysFromNow(7 * (m + 1)),
        status: done ? 'completed' : m === Math.floor((p.progress / 100) * stages.length) ? 'in_progress' : 'pending',
        progress: done ? 100 : m === Math.floor((p.progress / 100) * stages.length) ? 40 : 0,
        tasks: [
          { title: `${stages[m]} — Preparation`, priority: 'normal', assignedEngineer: ENGINEERS[i % ENGINEERS.length].name, dueDate: daysFromNow(7 * (m + 1) - 3), status: done ? 'done' : 'todo', checklist: [{ label: 'Tools ready', done: done }, { label: 'Client informed', done: done }] },
          { title: `${stages[m]} — Execution`, priority: 'high', assignedEngineer: ENGINEERS[(i + 1) % ENGINEERS.length].name, dueDate: daysFromNow(7 * (m + 1)), status: done ? 'done' : 'in_progress', checklist: [{ label: 'Evidence uploaded', done: false }] }
        ],
        demoTag: DEMO_TAG
      });
      await ms.save();
    }

    // Calendar events
    await VendorCalendarEvent.create({
      vendorId: vid,
      projectId: project._id,
      title: `${project.projectCode}: ${p.stage}`,
      type: 'project',
      start: daysFromNow(i),
      end: daysFromNow(i + 1),
      engineerName: ENGINEERS[i % ENGINEERS.length].name,
      location: p.city,
      status: 'scheduled',
      color: p.risk === 'high' ? 'red' : 'blue',
      demoTag: DEMO_TAG
    });
  }

  for (let e = 0; e < ENGINEERS.length; e++) {
    const eng = ENGINEERS[e];
    await VendorDispatch.create({
      vendorId: vid,
      projectId: eng.avail === 'on_job' ? projects[e % projects.length]._id : null,
      engineerName: eng.name,
      skills: eng.skills,
      distanceKm: eng.dist,
      workload: eng.load,
      availability: eng.avail,
      vehicle: eng.vehicle,
      tools: ['Multimeter', 'Toolkit'],
      certificates: ['Safety', 'Trade'],
      lat: 19 + Math.random(),
      lng: 72 + Math.random(),
      city: eng.city,
      assignmentStatus: eng.avail === 'on_job' ? 'on_site' : eng.avail === 'available' ? 'recommended' : 'unassigned',
      assignedJob: eng.avail === 'on_job' ? projects[e % projects.length].title : '',
      searchRadiusKm: 20,
      demoTag: DEMO_TAG
    });
  }

  // Extra calendar: leave + meeting
  await VendorCalendarEvent.create({
    vendorId: vid,
    title: 'Team standup',
    type: 'meeting',
    start: daysFromNow(0),
    end: new Date(Date.now() + 3600000),
    status: 'scheduled',
    color: 'violet',
    demoTag: DEMO_TAG
  });
  await VendorCalendarEvent.create({
    vendorId: vid,
    title: 'Neha Gupta — Leave',
    type: 'leave',
    start: daysFromNow(2),
    end: daysFromNow(4),
    allDay: true,
    engineerName: 'Neha Gupta',
    status: 'scheduled',
    color: 'amber',
    demoTag: DEMO_TAG
  });

  return { projects: projects.length };
}

async function seed() {
  await connectForScript();
  let vendorIds = [];
  if (VENDOR_ID_ARG) vendorIds = [VENDOR_ID_ARG];
  else {
    const vendors = await Vendor.find({}).select('_id businessName').sort({ updatedAt: -1 }).limit(20).lean();
    if (!vendors.length) { console.error('No vendors'); process.exit(1); }
    vendorIds = vendors.map((v) => v._id.toString());
    console.log(`📌 Seeding Project Ops for ${vendorIds.length} vendors`);
  }

  await VendorOpsProject.deleteMany({ demoTag: DEMO_TAG });
  await VendorOpsSite.deleteMany({ demoTag: DEMO_TAG });
  await VendorOpsMilestone.deleteMany({ demoTag: DEMO_TAG });
  await VendorDispatch.deleteMany({ demoTag: DEMO_TAG });
  await VendorCalendarEvent.deleteMany({ demoTag: DEMO_TAG });

  let total = 0;
  for (const id of vendorIds) {
    const r = await seedVendor(id);
    total += r.projects;
  }
  console.log(`✅ Seeded ${total} projects (+ sites, milestones, dispatch, calendar)`);
  console.log('📊 Open: /vendor/dynamic/projects/os');
  await mongoose.connection.close();
  process.exit(0);
}

seed().catch((e) => { console.error(e); process.exit(1); });
