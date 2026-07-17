/**
 * Seed Script: Clients & Contracts
 * Usage:
 *   node scripts/seedClientsContracts.js
 *   node scripts/seedClientsContracts.js <vendorId>
 *   npm run seed:clients-contracts
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Vendor = require('../models/Vendor');
const VendorClient = require('../models/VendorClient');
const VendorContract = require('../models/VendorContract');
const ScopeChange = require('../models/ScopeChange');
const ClientConversation = require('../models/ClientConversation');
const VendorProposal = require('../models/VendorProposal');

const VENDOR_ID_ARG = process.argv[2];
const DEMO_TAG = 'wbi-cc-demo';

const connectForScript = async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set');
  mongoose.set('bufferCommands', false);
  await mongoose.connect(uri, {
    family: 4,
    serverSelectionTimeoutMS: 30000,
    socketTimeoutMS: 45000,
    connectTimeoutMS: 30000
  });
  console.log(`✅ MongoDB Connected: ${mongoose.connection.host}`);
};

const daysAgo = (d) => new Date(Date.now() - d * 24 * 60 * 60 * 1000);
const daysFromNow = (d) => new Date(Date.now() + d * 24 * 60 * 60 * 1000);

const INDIVIDUAL_CLIENTS = [
  { name: 'Rajesh Mehta', city: 'Pune', state: 'Maharashtra', phone: '9812345678', email: 'rajesh.mehta@email.com', codes: ['CCTV', 'SEC'], names: ['CCTV & Surveillance'], spend: 85000, pending: 12000, projects: 1, rating: 4.5 },
  { name: 'Priya Sharma', city: 'Jaipur', state: 'Rajasthan', phone: '9988776655', email: 'priya.s@email.com', codes: ['SOLAR'], names: ['Solar Energy'], spend: 245000, pending: 0, projects: 1, rating: 4.8 },
  { name: 'Aarav Patel', city: 'Bengaluru', state: 'Karnataka', phone: '9123456789', email: 'aarav.p@email.com', codes: ['NET', 'WEB'], names: ['Networking', 'Web Development'], spend: 120000, pending: 35000, projects: 2, rating: 4.2 },
  { name: 'Sunita Rao', city: 'Hyderabad', state: 'Telangana', phone: '9900112233', email: 'sunita.rao@email.com', codes: ['FIRE', 'ELEC'], names: ['Fire Safety', 'Electrical'], spend: 180000, pending: 0, projects: 1, rating: 4.6 },
  { name: 'Kiran Joshi', city: 'Ahmedabad', state: 'Gujarat', phone: '9765432109', email: 'kiran.j@email.com', codes: ['AC', 'HVAC'], names: ['HVAC'], spend: 95000, pending: 18000, projects: 1, rating: 4.0 },
  { name: 'Meera Kapoor', city: 'Mumbai', state: 'Maharashtra', phone: '9811122233', email: 'meera.k@email.com', codes: ['APP', 'WEB'], names: ['App Development', 'Web Development'], spend: 320000, pending: 50000, projects: 2, rating: 4.7 },
  { name: 'Vikram Singh', city: 'Delhi', state: 'Delhi', phone: '9876501234', email: 'vikram.s@email.com', codes: ['EV', 'ELEC'], names: ['EV Charging', 'Electrical'], spend: 450000, pending: 0, projects: 1, rating: 4.9 },
  { name: 'Ananya Desai', city: 'Chennai', state: 'Tamil Nadu', phone: '9445566778', email: 'ananya.d@email.com', codes: ['CLOUD', 'NET'], names: ['Cloud Services', 'Networking'], spend: 210000, pending: 25000, projects: 1, rating: 4.3 }
];

const B2B_CLIENTS = [
  { name: 'Vendor Relations', company: 'Reliance Retail Ltd', city: 'Mumbai', industry: 'Retail', gst: '27AABCR1234A1Z5', size: '10000+', codes: ['CCTV', 'NET'], names: ['CCTV', 'Networking'], spend: 45000000, pending: 2500000, projects: 12, sites: 85, cities: ['Mumbai', 'Delhi', 'Pune', 'Hyderabad'], sla: 'enterprise', priority: 'high' },
  { name: 'Facilities Head', company: 'Axis Bank Ltd', city: 'Mumbai', industry: 'Banking', gst: '27AAACA1234B1Z2', size: '10000+', codes: ['ATM', 'CCTV', 'ELEC'], names: ['ATM Maintenance', 'CCTV', 'Electrical'], spend: 28000000, pending: 1200000, projects: 8, sites: 320, cities: ['Mumbai', 'Pune', 'Ahmedabad'], sla: 'enterprise', priority: 'urgent' },
  { name: 'Procurement', company: 'Amazon India', city: 'Bengaluru', industry: 'E-Commerce', gst: '29AABCA5678C1Z9', size: '10000+', codes: ['CLOUD', 'NET', 'SEC'], names: ['Cloud', 'Networking', 'Security'], spend: 62000000, pending: 0, projects: 5, sites: 24, cities: ['Bengaluru', 'Hyderabad', 'Chennai'], sla: 'premium', priority: 'high' },
  { name: 'IT Ops', company: 'Flipkart Internet Pvt Ltd', city: 'Bengaluru', industry: 'E-Commerce', gst: '29AABCF9012D1Z3', size: '5000+', codes: ['WEB', 'APP', 'CLOUD'], names: ['Web', 'App', 'Cloud'], spend: 18000000, pending: 800000, projects: 4, sites: 12, cities: ['Bengaluru', 'Delhi'], sla: 'premium', priority: 'normal' },
  { name: 'Vendor Ops', company: 'HDFC Bank', city: 'Mumbai', industry: 'Banking', gst: '27AAACH3456E1Z7', size: '10000+', codes: ['ATM', 'CCTV'], names: ['ATM Maintenance', 'CCTV'], spend: 35000000, pending: 1500000, projects: 10, sites: 500, cities: ['Mumbai', 'Pune', 'Surat', 'Ahmedabad'], sla: 'enterprise', priority: 'urgent' },
  { name: 'Infra Lead', company: 'Tata Consultancy Services', city: 'Mumbai', industry: 'IT Services', gst: '27AAACT7890F1Z1', size: '10000+', codes: ['CLOUD', 'NET', 'WEB'], names: ['Cloud', 'Networking', 'Web'], spend: 22000000, pending: 450000, projects: 6, sites: 18, cities: ['Mumbai', 'Chennai', 'Pune'], sla: 'premium', priority: 'high' }
];

async function seedVendor(vendorId) {
  const vid = new mongoose.Types.ObjectId(vendorId);
  const createdClients = [];

  for (let i = 0; i < INDIVIDUAL_CLIENTS.length; i++) {
    const c = INDIVIDUAL_CLIENTS[i];
    const client = await VendorClient.create({
      vendorId: vid,
      type: 'individual',
      name: c.name,
      company: '',
      email: c.email,
      phone: c.phone,
      city: c.city,
      state: c.state,
      serviceCategoryCodes: c.codes,
      serviceCategoryNames: c.names,
      status: i % 5 === 0 ? 'prospect' : 'active',
      rating: c.rating,
      totalSpend: c.spend,
      pendingPayments: c.pending,
      activeProjects: c.projects,
      totalSites: 1,
      cities: [c.city],
      lastActivityAt: daysAgo(i + 1),
      priority: i === 2 ? 'urgent' : 'normal',
      tags: c.names.slice(0, 2),
      notes: `[${DEMO_TAG}] Individual client demo`,
      demoTag: DEMO_TAG
    });
    createdClients.push(client);
  }

  for (let i = 0; i < B2B_CLIENTS.length; i++) {
    const c = B2B_CLIENTS[i];
    const client = await VendorClient.create({
      vendorId: vid,
      type: 'b2b',
      name: c.name,
      company: c.company,
      email: `ops@${c.company.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`.slice(0, 60),
      phone: `98${10000000 + i}`,
      city: c.city,
      state: c.city === 'Bengaluru' ? 'Karnataka' : 'Maharashtra',
      gstNumber: c.gst,
      industry: c.industry,
      companySize: c.size,
      serviceCategoryCodes: c.codes,
      serviceCategoryNames: c.names,
      status: 'active',
      rating: 4.5 + (i % 5) * 0.1,
      totalSpend: c.spend,
      pendingPayments: c.pending,
      activeProjects: c.projects,
      totalSites: c.sites,
      cities: c.cities,
      lastActivityAt: daysAgo(i),
      assignedTeam: [
        { name: 'Site Lead', role: 'Project Manager' },
        { name: 'Field Team', role: 'Engineers' }
      ],
      slaTier: c.sla,
      priority: c.priority,
      tags: c.names,
      notes: `[${DEMO_TAG}] B2B enterprise client`,
      demoTag: DEMO_TAG
    });
    createdClients.push(client);
  }

  const contracts = [];
  const contractSpecs = [
    { idx: 8, title: 'Annual CCTV + Network AMC — Reliance Retail', value: 8500000, status: 'active', amc: true },
    { idx: 9, title: 'ATM Maintenance Master Agreement — Axis Bank', value: 12000000, status: 'active', amc: true },
    { idx: 12, title: 'ATM Field Service Contract — HDFC Bank', value: 15000000, status: 'pending_signature', amc: true },
    { idx: 1, title: 'Residential Solar Installation & Warranty', value: 245000, status: 'active', amc: false },
    { idx: 5, title: 'Food Delivery MVP Development Agreement', value: 377600, status: 'active', amc: false },
    { idx: 10, title: 'Cloud Infra Support — Amazon India', value: 4200000, status: 'draft', amc: false },
    { idx: 13, title: 'Enterprise Network SLA — TCS', value: 2800000, status: 'expired', amc: true }
  ];

  for (const spec of contractSpecs) {
    const client = createdClients[spec.idx];
    if (!client) continue;
    const contract = new VendorContract({
      vendorId: vid,
      clientId: client._id,
      title: spec.title,
      value: spec.value,
      startDate: daysAgo(90),
      endDate: daysFromNow(spec.status === 'expired' ? -10 : 275),
      renewalDate: daysFromNow(280),
      warrantyMonths: 12,
      amc: spec.amc
        ? { enabled: true, annualValue: Math.round(spec.value * 0.12), nextDue: daysFromNow(60) }
        : { enabled: false },
      status: spec.status,
      signatures: spec.status === 'active'
        ? [
            { party: 'vendor', name: 'Vendor Authorized Signatory', signedAt: daysAgo(85) },
            { party: 'client', name: client.company || client.name, signedAt: daysAgo(80) }
          ]
        : [],
      serviceCategoryCode: client.serviceCategoryCodes[0] || '',
      serviceCategoryName: client.serviceCategoryNames[0] || '',
      notes: `[${DEMO_TAG}]`,
      demoTag: DEMO_TAG
    });
    await contract.save();
    contracts.push(contract);
  }

  const scopeSpecs = [
    { cIdx: 8, contractIdx: 0, title: 'Add 15 new store cameras', prev: '70 IP cameras across 70 stores', next: '85 IP cameras across 85 stores', cost: 450000, days: 21, status: 'pending' },
    { cIdx: 9, contractIdx: 1, title: 'Extend SLA to 2-hour response', prev: '4-hour breakdown SLA', next: '2-hour breakdown SLA for metro ATMs', cost: 800000, days: 0, status: 'approved' },
    { cIdx: 5, contractIdx: 4, title: 'Add rider tracking module', prev: 'Customer + restaurant apps only', next: 'Customer + restaurant + rider apps with live tracking', cost: 85000, days: 14, status: 'pending' },
    { cIdx: 1, contractIdx: 3, title: 'Upgrade to hybrid inverter', prev: 'String inverter 5kW', next: 'Hybrid inverter with battery-ready wiring', cost: 45000, days: 5, status: 'rejected' }
  ];

  for (const s of scopeSpecs) {
    const client = createdClients[s.cIdx];
    const contract = contracts[s.contractIdx];
    if (!client) continue;
    const change = new ScopeChange({
      vendorId: vid,
      clientId: client._id,
      contractId: contract?._id || null,
      title: s.title,
      previousScope: s.prev,
      updatedScope: s.next,
      costDelta: s.cost,
      timelineDeltaDays: s.days,
      requestedBy: client.company || client.name,
      approvedBy: s.status === 'approved' ? 'Vendor Ops' : null,
      reason: 'Business requirement change',
      status: s.status,
      decidedAt: s.status !== 'pending' ? daysAgo(2) : null,
      demoTag: DEMO_TAG
    });
    await change.save();
  }

  const convoSpecs = [
    { cIdx: 8, channel: 'project', subject: 'Reliance store rollout — Phase 2 schedule', unread: 2 },
    { cIdx: 9, channel: 'contract', subject: 'Axis Bank AMC renewal discussion', unread: 1 },
    { cIdx: 12, channel: 'payment', subject: 'HDFC invoice #INV-2041 pending', unread: 0 },
    { cIdx: 5, channel: 'project', subject: 'SpiceRoute MVP sprint demo feedback', unread: 3 },
    { cIdx: 1, channel: 'support', subject: 'Solar inverter monitoring alert', unread: 0 },
    { cIdx: 10, channel: 'all', subject: 'Amazon warehouse network upgrade', unread: 1 }
  ];

  for (const c of convoSpecs) {
    const client = createdClients[c.cIdx];
    if (!client) continue;
    await ClientConversation.create({
      vendorId: vid,
      clientId: client._id,
      channel: c.channel,
      subject: c.subject,
      unreadCount: c.unread,
      pinned: c.unread > 1,
      lastMessageAt: daysAgo(c.unread ? 0 : 2),
      messages: [
        { sender: 'client', text: `Hi, regarding ${c.subject.toLowerCase()}. Can we discuss timelines?`, createdAt: daysAgo(3) },
        { sender: 'vendor', text: 'Thanks for reaching out. Sharing the updated plan shortly.', createdAt: daysAgo(2) },
        { sender: 'client', text: 'Please also attach the latest quotation PDF.', createdAt: daysAgo(c.unread ? 0 : 1) }
      ],
      demoTag: DEMO_TAG
    });
  }

  // Link a few existing proposals to clients if any exist
  const proposals = await VendorProposal.find({ vendorId: vid }).limit(5).lean();
  for (let i = 0; i < proposals.length && i < createdClients.length; i++) {
    await VendorProposal.updateOne(
      { _id: proposals[i]._id },
      { $set: { clientId: createdClients[i]._id } }
    );
  }

  return {
    clients: createdClients.length,
    contracts: contracts.length
  };
}

async function seed() {
  await connectForScript();

  let vendorIds = [];
  if (VENDOR_ID_ARG) {
    vendorIds = [VENDOR_ID_ARG];
  } else {
    const vendors = await Vendor.find({})
      .select('_id businessName name')
      .sort({ updatedAt: -1 })
      .limit(20)
      .lean();
    if (!vendors.length) {
      console.error('❌ No vendor found');
      process.exit(1);
    }
    vendorIds = vendors.map((v) => v._id.toString());
    console.log(`📌 Seeding Clients & Contracts for ${vendorIds.length} vendor(s)`);
  }

  await VendorClient.deleteMany({ demoTag: DEMO_TAG });
  await VendorContract.deleteMany({ demoTag: DEMO_TAG });
  await ScopeChange.deleteMany({ demoTag: DEMO_TAG });
  await ClientConversation.deleteMany({ demoTag: DEMO_TAG });

  let totalClients = 0;
  let totalContracts = 0;

  for (const id of vendorIds) {
    const result = await seedVendor(id);
    totalClients += result.clients;
    totalContracts += result.contracts;
  }

  console.log(`✅ Seeded ${totalClients} clients, ${totalContracts}+ contracts/scope/conversations`);
  console.log('📊 Open: /vendor/dynamic/clients/individual');

  await mongoose.connection.close();
  process.exit(0);
}

seed().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
