/**
 * Seed Script: Business Intake Opportunities
 * Usage:
 *   node scripts/seedBusinessIntake.js                  → auto-picks first vendor
 *   node scripts/seedBusinessIntake.js <vendorId>       → specific vendor
 *   npm run seed:business-intake
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Opportunity = require('../models/Opportunity');
const VendorProposal = require('../models/VendorProposal');
const Vendor = require('../models/Vendor');

const VENDOR_ID_ARG = process.argv[2];
const DEMO_TAG = 'wbi-demo-seed';

const connectForScript = async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set');
  mongoose.set('bufferCommands', false);
  await mongoose.connect(uri, {
    family: 4,
    serverSelectionTimeoutMS: 30000,
    socketTimeoutMS: 45000,
    connectTimeoutMS: 30000,
  });
  console.log(`✅ MongoDB Connected: ${mongoose.connection.host}`);
};

const futureDate = (daysFromNow) => new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000);
const hoursAgo = (hours) => new Date(Date.now() - hours * 60 * 60 * 1000);

const opportunities = [
  // ── CLIENT REQUESTS (design-matching + residential/commercial) ──
  {
    type: 'client_request',
    title: 'Website Development — Corporate Portfolio Site',
    description: 'Modern responsive website for a growing IT services company. React frontend, Node.js backend, CMS integration.',
    categoryCode: 'WEB',
    categoryName: 'Web Development',
    subServices: ['React', 'Node.js', 'Responsive Design', 'CMS'],
    clientInfo: {
      clientType: 'company',
      name: 'Ankit Verma',
      company: 'NovaTech Solutions',
      city: 'Bengaluru',
      state: 'Karnataka',
      phone: '9876543210'
    },
    requirements: {
      totalSites: 1,
      cities: ['Bengaluru'],
      description: 'Corporate portfolio, 12 pages, admin panel, SEO setup',
      contractDuration: '20 Days',
      startDate: futureDate(7)
    },
    budget: { min: 60000, max: 80000, type: 'negotiable' },
    deadline: futureDate(14),
    expiresAt: futureDate(21),
    priority: 'normal',
    createdAt: hoursAgo(2),
    updatedAt: hoursAgo(2),
  },
  {
    type: 'client_request',
    title: 'Mobile App Development — Food Delivery MVP',
    description: 'Cross-platform food delivery app MVP for a local restaurant chain. Android + iOS.',
    categoryCode: 'APP',
    categoryName: 'App Development',
    subServices: ['React Native', 'Firebase', 'Payment Gateway', 'Push Notifications'],
    clientInfo: {
      clientType: 'company',
      name: 'Meera Kapoor',
      company: 'SpiceRoute Foods Pvt Ltd',
      city: 'Mumbai',
      state: 'Maharashtra',
      phone: '9811122233'
    },
    requirements: {
      totalSites: 1,
      cities: ['Mumbai'],
      description: 'Customer app, rider app, restaurant dashboard — 45-day delivery',
      contractDuration: '45 Days',
      startDate: futureDate(10)
    },
    budget: { min: 250000, max: 400000, type: 'negotiable' },
    deadline: futureDate(12),
    expiresAt: futureDate(20),
    priority: 'high',
    createdAt: hoursAgo(5),
    updatedAt: hoursAgo(5),
  },
  {
    type: 'client_request',
    title: 'EV Charging Station Installation — Mall Parking',
    description: 'Install 4 fast-charging EV stations in basement parking of a premium mall.',
    categoryCode: 'EV',
    categoryName: 'EV Charging',
    subServices: ['Fast Charging', 'Electrical Wiring', 'AMC', 'Load Management'],
    clientInfo: {
      clientType: 'company',
      name: 'Rohit Desai',
      company: 'MetroSquare Mall Management',
      city: 'Pune',
      state: 'Maharashtra',
      phone: '9922334455'
    },
    requirements: {
      totalSites: 1,
      cities: ['Pune'],
      description: '4 x 60kW DC fast chargers, cabling, billing integration',
      contractDuration: '15 Days',
      startDate: futureDate(5)
    },
    budget: { min: 450000, max: 650000, type: 'fixed' },
    deadline: futureDate(8),
    expiresAt: futureDate(15),
    priority: 'urgent',
    createdAt: hoursAgo(8),
    updatedAt: hoursAgo(8),
  },
  {
    type: 'client_request',
    title: 'CCTV Installation for Residential Bungalow',
    description: 'Need 8 HD cameras with DVR setup for a 4BHK bungalow. Looking for a reliable vendor with good after-sales support.',
    categoryCode: 'CCTV', // legacy; matched to C01 via expandCategoryMatchCodes
    // Prefer canonical C01 going forward — seed keeps CCTV for old demo data compatibility
    categoryName: 'CCTV & Surveillance',
    subServices: ['HD Camera Installation', 'DVR Setup', 'Remote Monitoring'],
    clientInfo: {
      clientType: 'individual',
      name: 'Rajesh Mehta',
      company: 'Mehta Residence',
      city: 'Pune',
      state: 'Maharashtra',
      phone: '9812345678'
    },
    requirements: {
      totalSites: 1,
      cities: ['Pune'],
      description: '8 HD cameras, 1 DVR 16-channel, cable routing, mobile app setup',
      contractDuration: '7 Days',
      startDate: futureDate(10)
    },
    budget: { min: 25000, max: 45000, type: 'negotiable' },
    deadline: futureDate(7),
    expiresAt: futureDate(14),
    priority: 'normal',
    createdAt: hoursAgo(12),
    updatedAt: hoursAgo(12),
  },
  {
    type: 'client_request',
    title: 'Home Solar Panel Setup – 5kW System',
    description: 'Rooftop solar installation for residential house. Single phase connection. Grid-tie preferred.',
    categoryCode: 'SOLAR',
    categoryName: 'Solar Energy Solutions',
    subServices: ['Rooftop Solar', 'Grid-Tie Inverter', 'Net Metering'],
    clientInfo: {
      clientType: 'individual',
      name: 'Priya Sharma',
      company: 'Sharma Family Home',
      city: 'Jaipur',
      state: 'Rajasthan',
      phone: '9988776655'
    },
    requirements: {
      totalSites: 1,
      cities: ['Jaipur'],
      description: '5kW system, 15 panels, string inverter, AMC for 5 years',
      contractDuration: '10 Days',
      startDate: futureDate(15)
    },
    budget: { min: 180000, max: 280000, type: 'fixed' },
    deadline: futureDate(10),
    expiresAt: futureDate(20),
    priority: 'normal',
    createdAt: hoursAgo(18),
    updatedAt: hoursAgo(18),
  },
  {
    type: 'client_request',
    title: 'Office Network Setup — 30 Workstations',
    description: 'Small IT company needs complete network setup for new office. Structured cabling + WiFi.',
    categoryCode: 'NET',
    categoryName: 'Networking & IT Infrastructure',
    subServices: ['Structured Cabling', 'WiFi Setup', 'Server Room', 'Firewall'],
    clientInfo: {
      clientType: 'individual',
      name: 'Aarav Patel',
      city: 'Bengaluru',
      state: 'Karnataka',
      phone: '9123456789'
    },
    requirements: {
      totalSites: 1,
      cities: ['Bengaluru'],
      description: '30 workstation LAN points, WiFi access points, 1 server room setup',
      startDate: futureDate(7)
    },
    budget: { min: 80000, max: 150000, type: 'negotiable' },
    deadline: futureDate(5),
    expiresAt: futureDate(12),
    priority: 'urgent'
  },
  {
    type: 'client_request',
    title: 'Fire Alarm System for 3-Floor Commercial Building',
    description: 'Addressable fire alarm system needed for a 3-floor commercial complex. Includes smoke detectors.',
    categoryCode: 'FIRE',
    categoryName: 'Fire Safety & Protection',
    subServices: ['Fire Alarm', 'Smoke Detectors', 'Fire Panel', 'Emergency Lighting'],
    clientInfo: {
      clientType: 'individual',
      name: 'Sunita Rao',
      city: 'Hyderabad',
      state: 'Telangana',
      phone: '9900112233'
    },
    requirements: {
      totalSites: 1,
      cities: ['Hyderabad'],
      description: 'Addressable fire alarm, 45 smoke detectors, 3 fire panels, emergency exits',
      startDate: futureDate(20)
    },
    budget: { min: 120000, max: 200000, type: 'fixed' },
    deadline: futureDate(15),
    expiresAt: futureDate(25),
    priority: 'high'
  },
  {
    type: 'client_request',
    title: 'AC Installation for Retail Showroom',
    description: 'Need 6 split ACs and 2 cassette ACs installed in a 3000 sq ft retail showroom.',
    categoryCode: 'AC',
    categoryName: 'Air Conditioning & HVAC',
    subServices: ['Split AC Installation', 'Cassette AC', 'AMC'],
    clientInfo: {
      clientType: 'individual',
      name: 'Kiran Joshi',
      city: 'Ahmedabad',
      state: 'Gujarat',
      phone: '9765432109'
    },
    requirements: {
      totalSites: 1,
      cities: ['Ahmedabad'],
      description: '6 split ACs (1.5 ton), 2 cassette ACs (2 ton), electrical point work',
      startDate: futureDate(5)
    },
    budget: { min: 95000, max: 140000, type: 'negotiable' },
    deadline: futureDate(4),
    expiresAt: futureDate(10),
    priority: 'urgent'
  },

  // ── B2B OPPORTUNITIES (enterprise companies) ─────────
  {
    type: 'b2b_opportunity',
    title: '500 ATM Maintenance — Western India Rollout',
    description: 'Leading private bank requires preventive maintenance engineers for 500 ATM sites across Maharashtra and Gujarat.',
    categoryCode: 'ATM',
    categoryName: 'ATM Maintenance',
    subServices: ['Field Service', 'ATM Repair', 'Cash Dispenser', 'Preventive Maintenance'],
    clientInfo: {
      clientType: 'b2b',
      company: 'HDFC Bank — Vendor Operations',
      city: 'Mumbai',
      state: 'Maharashtra',
      gstNumber: '27HDFCB1234A1Z5',
      companySize: '10000+ employees',
      industry: 'Banking & Financial Services'
    },
    requirements: {
      totalSites: 500,
      cities: ['Mumbai', 'Pune', 'Nashik', 'Surat', 'Ahmedabad', 'Vadodara'],
      description: '500 ATM sites, quarterly PMC, 4-hour breakdown SLA, certified engineers required',
      contractDuration: '24 months',
      specialRequirements: 'Minimum 50 certified ATM engineers required',
      startDate: futureDate(30)
    },
    budget: { min: 15000000, max: 28000000, type: 'per_site' },
    deadline: futureDate(18),
    expiresAt: futureDate(30),
    priority: 'urgent',
    createdAt: hoursAgo(3),
    updatedAt: hoursAgo(3),
  },
  {
    type: 'b2b_opportunity',
    title: 'Cloud Migration — ERP Modernization',
    description: 'Mid-size manufacturing firm migrating on-prem ERP to AWS cloud with zero-downtime cutover.',
    categoryCode: 'CLOUD',
    categoryName: 'Cloud Services',
    subServices: ['AWS', 'Docker', 'Kubernetes', 'DevOps', 'Migration'],
    clientInfo: {
      clientType: 'company',
      company: 'Precision Tools India Ltd',
      city: 'Chennai',
      state: 'Tamil Nadu',
      gstNumber: '33PTIL5678B2Z1',
      companySize: '500-1000 employees',
      industry: 'Manufacturing'
    },
    requirements: {
      totalSites: 1,
      cities: ['Chennai'],
      description: 'AWS migration, containerization, CI/CD pipeline, 3-month project',
      contractDuration: '90 Days',
      startDate: futureDate(20)
    },
    budget: { min: 800000, max: 1500000, type: 'negotiable' },
    deadline: futureDate(15),
    expiresAt: futureDate(25),
    priority: 'high',
    createdAt: hoursAgo(6),
    updatedAt: hoursAgo(6),
  },
  {
    type: 'b2b_opportunity',
    title: 'Enterprise CCTV Rollout — Pan India Retail Chain',
    description: 'Leading retail chain needs CCTV upgrade across 85 stores across 12 cities. Annual maintenance contract included.',
    categoryCode: 'CCTV', // legacy; matched to C01 via expandCategoryMatchCodes
    // Prefer canonical C01 going forward — seed keeps CCTV for old demo data compatibility
    categoryName: 'CCTV & Surveillance',
    subServices: ['IP Camera Installation', 'NVR Setup', 'Video Analytics', 'AMC'],
    clientInfo: {
      clientType: 'company',
      company: 'StyleMart Retail Pvt Ltd',
      city: 'Mumbai',
      state: 'Maharashtra',
      gstNumber: '27AABCS1234A1Z5',
      companySize: '500-1000 employees',
      industry: 'Retail'
    },
    requirements: {
      totalSites: 85,
      cities: ['Mumbai', 'Delhi', 'Pune', 'Chennai', 'Hyderabad', 'Bengaluru', 'Kolkata', 'Ahmedabad', 'Jaipur', 'Surat', 'Lucknow', 'Nagpur'],
      description: 'IP-based CCTV with video analytics, NVR per store, centralized monitoring',
      contractDuration: '24 months',
      startDate: futureDate(30)
    },
    budget: { min: 8500000, max: 15000000, type: 'per_site' },
    deadline: futureDate(20),
    expiresAt: futureDate(35),
    priority: 'high'
  },
  {
    type: 'b2b_opportunity',
    title: 'Solar Rooftop for Industrial Campus — 500kW',
    description: 'Industrial manufacturing company seeking solar energy partner for 500kW rooftop installation across 3 factory units.',
    categoryCode: 'SOLAR',
    categoryName: 'Solar Energy Solutions',
    subServices: ['Industrial Solar', 'Grid-Tie', 'Power Purchase Agreement', 'O&M'],
    clientInfo: {
      clientType: 'company',
      company: 'Bharat Auto Components Ltd',
      city: 'Pune',
      state: 'Maharashtra',
      gstNumber: '27BACTS4321A2Z6',
      companySize: '1000+ employees',
      industry: 'Manufacturing'
    },
    requirements: {
      totalSites: 3,
      cities: ['Pune', 'Nagpur', 'Aurangabad'],
      description: '500kW total capacity, 3 factory units, 5-year O&M contract required',
      contractDuration: '60 months',
      startDate: futureDate(45)
    },
    budget: { min: 18000000, max: 30000000, type: 'fixed' },
    deadline: futureDate(25),
    expiresAt: futureDate(40),
    priority: 'high'
  },
  {
    type: 'b2b_opportunity',
    title: 'Network Infrastructure Overhaul — Bank Branches',
    description: 'Private sector bank requires complete network upgrade across 120 urban branches with SD-WAN implementation.',
    categoryCode: 'NET',
    categoryName: 'Networking & IT Infrastructure',
    subServices: ['SD-WAN', 'Structured Cabling', 'Network Security', 'Monitoring'],
    clientInfo: {
      clientType: 'b2b',
      company: 'CapitalFirst Bank Ltd',
      city: 'Delhi',
      state: 'Delhi',
      gstNumber: '07CAPFS7890B1Z3',
      companySize: '5000+ employees',
      industry: 'Banking & Financial Services'
    },
    requirements: {
      totalSites: 120,
      cities: ['Delhi', 'Mumbai', 'Bengaluru', 'Chennai', 'Hyderabad', 'Kolkata'],
      description: 'SD-WAN enabled branch connectivity, structured cabling, WiFi 6, NOC support',
      contractDuration: '36 months',
      startDate: futureDate(60)
    },
    budget: { min: 25000000, max: 45000000, type: 'fixed' },
    deadline: futureDate(30),
    expiresAt: futureDate(45),
    priority: 'high'
  },
  {
    type: 'b2b_opportunity',
    title: 'Access Control System — IT Park',
    description: 'New IT park development requires biometric access control and visitor management across 4 towers.',
    categoryCode: 'SEC',
    categoryName: 'Security Systems & Access Control',
    subServices: ['Biometric Access', 'Visitor Management', 'Boom Barriers', 'Integration'],
    clientInfo: {
      clientType: 'company',
      company: 'Techno Park Developers',
      city: 'Hyderabad',
      state: 'Telangana',
      gstNumber: '36TPDVL5678C2Z9',
      companySize: '200-500 employees',
      industry: 'Real Estate & Development'
    },
    requirements: {
      totalSites: 4,
      cities: ['Hyderabad'],
      description: '4 towers, 200+ access points, central VMS, boom barriers at entry/exit',
      contractDuration: '12 months',
      startDate: futureDate(40)
    },
    budget: { min: 4500000, max: 8000000, type: 'negotiable' },
    deadline: futureDate(18),
    expiresAt: futureDate(30),
    priority: 'normal'
  },
  {
    type: 'b2b_opportunity',
    title: 'ATM Site Electrical & UPS Maintenance Contract',
    description: 'Leading bank seeks vendor for quarterly preventive maintenance of ATM electrical and UPS systems across Western India.',
    categoryCode: 'ATM',
    categoryName: 'ATM Services & Maintenance',
    subServices: ['ATM Electrical', 'UPS Maintenance', 'Preventive Maintenance', 'Emergency Response'],
    clientInfo: {
      clientType: 'b2b',
      company: 'Western Union Bank NA — India Ops',
      city: 'Mumbai',
      state: 'Maharashtra',
      gstNumber: '27WUBNA1122D1Z2',
      companySize: '10000+ employees',
      industry: 'Banking'
    },
    requirements: {
      totalSites: 320,
      cities: ['Mumbai', 'Pune', 'Nashik', 'Surat', 'Ahmedabad', 'Indore', 'Bhopal'],
      description: 'Quarterly PMC of electrical systems and UPS at 320 ATM sites, 4-hour SLA for breakdowns',
      contractDuration: '24 months',
      startDate: futureDate(20)
    },
    budget: { min: 12000000, max: 20000000, type: 'per_month' },
    deadline: futureDate(15),
    expiresAt: futureDate(25),
    priority: 'urgent'
  },

  // ── BULK REQUIREMENTS (3) ───────────────────────────
  {
    type: 'bulk_requirement',
    title: 'CCTV Installation — 500 Petrol Pump Sites Pan India',
    description: 'Major oil company requires CCTV and IP surveillance at 500 fuel stations across 18 states. Standardized design, phased rollout.',
    categoryCode: 'CCTV', // legacy; matched to C01 via expandCategoryMatchCodes
    // Prefer canonical C01 going forward — seed keeps CCTV for old demo data compatibility
    categoryName: 'CCTV & Surveillance',
    subServices: ['IP Cameras', 'NVR', 'Remote Monitoring', 'Central Management'],
    clientInfo: {
      clientType: 'b2b',
      company: 'IndiaFuel Corporation Ltd',
      city: 'Mumbai',
      state: 'Maharashtra',
      gstNumber: '27IFCRL3344E1Z7',
      companySize: '10000+ employees',
      industry: 'Oil & Gas'
    },
    requirements: {
      totalSites: 500,
      cities: ['Mumbai', 'Delhi', 'Chennai', 'Kolkata', 'Hyderabad', 'Bengaluru', 'Jaipur', 'Lucknow', 'Bhopal', 'Indore', 'Surat', 'Ahmedabad', 'Chandigarh', 'Visakhapatnam', 'Coimbatore', 'Kochi', 'Nagpur', 'Bhubaneswar'],
      description: 'Standardized 8-camera IP system per site, centralized monitoring, phased over 12 months',
      contractDuration: '12 months',
      startDate: futureDate(30)
    },
    budget: { min: 30000000, max: 60000000, type: 'per_site' },
    deadline: futureDate(22),
    expiresAt: futureDate(35),
    priority: 'high'
  },
  {
    type: 'bulk_requirement',
    title: 'Solar Street Lights — 3000 Units for Smart City Project',
    description: 'Smart city mission project for 3000 solar street light installations across 5 districts of Rajasthan.',
    categoryCode: 'SOLAR',
    categoryName: 'Solar Energy Solutions',
    subServices: ['Solar Street Lights', 'Pole Installation', 'Grid Integration', 'GPS Monitoring'],
    clientInfo: {
      clientType: 'b2b',
      company: 'Rajasthan Smart City Ltd (Govt)',
      city: 'Jaipur',
      state: 'Rajasthan',
      gstNumber: '08RSCGL9988F1Z0',
      industry: 'Government'
    },
    requirements: {
      totalSites: 3000,
      cities: ['Jaipur', 'Jodhpur', 'Udaipur', 'Ajmer', 'Kota'],
      description: '3000 solar street lights, 12W LED, 3-day battery backup, GPS monitoring, 5-year warranty',
      contractDuration: '18 months',
      startDate: futureDate(45)
    },
    budget: { min: 75000000, max: 120000000, type: 'per_site' },
    deadline: futureDate(28),
    expiresAt: futureDate(40),
    priority: 'high'
  },
  {
    type: 'bulk_requirement',
    title: 'Fire Safety Audit + Upgrade — 200 Hospital Sites',
    description: 'National hospital chain requires fire safety audit and addressable fire alarm upgrade at 200 hospitals across India.',
    categoryCode: 'FIRE',
    categoryName: 'Fire Safety & Protection',
    subServices: ['Fire Safety Audit', 'Addressable Fire Alarm', 'Suppression Systems', 'NOC Compliance'],
    clientInfo: {
      clientType: 'b2b',
      company: 'HealthFirst Hospital Group',
      city: 'Delhi',
      state: 'Delhi',
      gstNumber: '07HFHGL5544G1Z4',
      companySize: '10000+ employees',
      industry: 'Healthcare'
    },
    requirements: {
      totalSites: 200,
      cities: ['Delhi', 'Mumbai', 'Chennai', 'Hyderabad', 'Bengaluru', 'Kolkata', 'Lucknow', 'Jaipur', 'Chandigarh', 'Ahmedabad'],
      description: 'Fire safety audit, addressable fire alarm installation, suppression system, NOC compliance for 200 hospitals',
      specialRequirements: 'Hospitals remain operational during installation. Night work may be required.',
      contractDuration: '24 months',
      startDate: futureDate(35)
    },
    budget: { min: 40000000, max: 80000000, type: 'per_site' },
    deadline: futureDate(20),
    expiresAt: futureDate(35),
    priority: 'urgent'
  },

  // ── BID / QUOTE REQUESTS (3) ─────────────────────────
  {
    type: 'bid_quote_request',
    title: 'RFQ: CCTV Infrastructure for New Airport Terminal',
    description: 'Airport Authority of India seeks technical and financial bids for comprehensive CCTV infrastructure for T3 terminal expansion.',
    categoryCode: 'CCTV', // legacy; matched to C01 via expandCategoryMatchCodes
    // Prefer canonical C01 going forward — seed keeps CCTV for old demo data compatibility
    categoryName: 'CCTV & Surveillance',
    subServices: ['4K PTZ Cameras', 'Video Analytics AI', 'PSIM Integration', 'LPR Cameras'],
    rfqDocumentUrl: 'https://placehold.co/rfq-document.pdf',
    technicalSpecsUrl: 'https://placehold.co/technical-specs.pdf',
    clientInfo: {
      clientType: 'b2b',
      company: 'Airport Authority of India (AAI)',
      city: 'Delhi',
      state: 'Delhi',
      industry: 'Government / Aviation'
    },
    requirements: {
      totalSites: 1,
      cities: ['Delhi'],
      description: 'World-class IP CCTV with AI video analytics, facial recognition, perimeter intrusion detection for T3 terminal',
      specialRequirements: 'Must meet BIS and BCAS certification standards. L1 bidder policy applies.',
      startDate: futureDate(90)
    },
    budget: { min: 50000000, max: 120000000, type: 'fixed' },
    deadline: futureDate(30),
    expiresAt: futureDate(35),
    priority: 'high'
  },
  {
    type: 'bid_quote_request',
    title: 'RFQ: Electrical Maintenance Contract — Railway Stations',
    description: 'Indian Railways invites sealed bids for 3-year electrical maintenance AMC at 45 A-class railway stations.',
    categoryCode: 'ELEC',
    categoryName: 'Electrical & Power Systems',
    subServices: ['Electrical AMC', 'HT/LT Panel Maintenance', 'DG Sets', 'Emergency Lighting'],
    rfqDocumentUrl: 'https://placehold.co/railways-rfq.pdf',
    technicalSpecsUrl: 'https://placehold.co/railways-specs.pdf',
    clientInfo: {
      clientType: 'b2b',
      company: 'Central Railway Division',
      city: 'Mumbai',
      state: 'Maharashtra',
      industry: 'Government / Railways'
    },
    requirements: {
      totalSites: 45,
      cities: ['Mumbai', 'Pune', 'Nagpur', 'Nashik', 'Solapur'],
      description: '3-year AMC for electrical systems at 45 A-class stations. 24x7 support, 4-hour SLA.',
      contractDuration: '36 months',
      startDate: futureDate(60)
    },
    budget: { min: 35000000, max: 65000000, type: 'per_month' },
    deadline: futureDate(25),
    expiresAt: futureDate(30),
    priority: 'high'
  },
  {
    type: 'bid_quote_request',
    title: 'RFQ: Solar Energy Supply Agreement — Tech Park',
    description: 'IT park development company seeks solar energy partner through competitive bidding. PPA (Power Purchase Agreement) model.',
    categoryCode: 'SOLAR',
    categoryName: 'Solar Energy Solutions',
    subServices: ['Commercial Solar', 'PPA Model', 'Grid-Tie', '10-Year O&M'],
    rfqDocumentUrl: 'https://placehold.co/solar-rfq.pdf',
    technicalSpecsUrl: 'https://placehold.co/solar-specs.pdf',
    clientInfo: {
      clientType: 'company',
      company: 'Greentech IT Park Developers',
      city: 'Hyderabad',
      state: 'Telangana',
      companySize: '200-500 employees',
      industry: 'Real Estate'
    },
    requirements: {
      totalSites: 2,
      cities: ['Hyderabad'],
      description: '2MW total solar capacity across 2 tech park towers. PPA at competitive rate. 10-year lock-in.',
      contractDuration: '120 months',
      startDate: futureDate(75)
    },
    budget: { min: 80000000, max: 150000000, type: 'fixed' },
    deadline: futureDate(35),
    expiresAt: futureDate(40),
    priority: 'normal'
  },

  // ── DIRECT INVITATIONS (2) ──────────────────────────
  {
    type: 'direct_invitation',
    title: 'You are Personally Selected: CCTV + Networking for HQ',
    description: 'Based on your past performance rating (4.8/5) and 95% SLA adherence, you have been specifically selected to bid on this project. No competition.',
    categoryCode: 'CCTV', // legacy; matched to C01 via expandCategoryMatchCodes
    // Prefer canonical C01 going forward — seed keeps CCTV for old demo data compatibility
    categoryName: 'CCTV & Surveillance',
    subServices: ['IP Camera', 'NVR', 'Network Infrastructure', 'Access Control'],
    clientInfo: {
      clientType: 'company',
      company: 'TechCorp India Pvt Ltd',
      city: 'Bengaluru',
      state: 'Karnataka',
      gstNumber: '29TCORS8877H1Z1'
    },
    requirements: {
      totalSites: 1,
      cities: ['Bengaluru'],
      description: 'Full CCTV + networking setup for new corporate HQ, 4 floors, 200 staff',
      startDate: futureDate(20)
    },
    budget: { min: 800000, max: 1500000, type: 'negotiable' },
    deadline: futureDate(5), // Short deadline for urgency
    expiresAt: futureDate(7),
    priority: 'urgent'
  },
  {
    type: 'direct_invitation',
    title: 'Exclusive Invitation: Solar AMC for Premium Client',
    description: 'Premium enterprise client specifically requested your services for annual maintenance of their 250kW rooftop solar plant.',
    categoryCode: 'SOLAR',
    categoryName: 'Solar Energy Solutions',
    subServices: ['Solar AMC', 'Panel Cleaning', 'Inverter Service', 'Performance Monitoring'],
    clientInfo: {
      clientType: 'company',
      company: 'Sunrise Hotels & Resorts Ltd',
      city: 'Goa',
      state: 'Goa',
      gstNumber: '30SHRLT3344I2Z8'
    },
    requirements: {
      totalSites: 3,
      cities: ['Goa', 'Mumbai'],
      description: 'Annual maintenance of 250kW rooftop solar across 3 hotel properties',
      contractDuration: '12 months',
      startDate: futureDate(15)
    },
    budget: { min: 350000, max: 600000, type: 'per_month' },
    deadline: futureDate(3), // Very urgent
    expiresAt: futureDate(5),
    priority: 'urgent'
  },

  // ── AWARDED (2) ─────────────────────────────────────
  {
    type: 'b2b_opportunity',
    title: 'Completed: ATM CCTV Upgrade — 50 Sites',
    description: 'ATM surveillance upgrade project. 50 sites across NCR region. Already completed and awarded.',
    categoryCode: 'CCTV', // legacy; matched to C01 via expandCategoryMatchCodes
    // Prefer canonical C01 going forward — seed keeps CCTV for old demo data compatibility
    categoryName: 'CCTV & Surveillance',
    subServices: ['ATM Cameras', 'DVR', 'Remote Monitoring'],
    clientInfo: {
      clientType: 'b2b',
      company: 'National Bank of Commerce',
      city: 'Delhi',
      state: 'Delhi'
    },
    requirements: {
      totalSites: 50,
      cities: ['Delhi', 'Noida', 'Gurgaon', 'Faridabad'],
      description: 'ATM CCTV upgrade, 4 cameras per ATM, remote monitoring',
      startDate: new Date('2026-01-01')
    },
    budget: { min: 3000000, max: 5000000, type: 'per_site' },
    deadline: new Date('2026-02-01'),
    expiresAt: new Date('2026-02-15'),
    priority: 'normal',
    status: 'awarded'
  },
  {
    type: 'client_request',
    title: 'Completed: Solar Installation 10kW — Commercial',
    description: 'Commercial solar installation project. Already awarded and work is in progress.',
    categoryCode: 'SOLAR',
    categoryName: 'Solar Energy Solutions',
    subServices: ['Commercial Solar', '3-Phase Grid-Tie'],
    clientInfo: {
      clientType: 'company',
      company: 'Sunrise Textiles Mills',
      city: 'Surat',
      state: 'Gujarat'
    },
    requirements: {
      totalSites: 1,
      cities: ['Surat'],
      description: '10kW 3-phase solar with grid-tie inverter',
      startDate: new Date('2026-02-01')
    },
    budget: { min: 350000, max: 500000, type: 'fixed' },
    deadline: new Date('2026-02-15'),
    expiresAt: new Date('2026-03-01'),
    priority: 'normal',
    status: 'awarded'
  }
];

const buildDemoProposals = (vendorObjectId, insertedOpps) => {
  const oppId = (keyword) => {
    const match = insertedOpps.find((o) => o.title.toLowerCase().includes(keyword.toLowerCase()));
    return match?._id || insertedOpps[0]?._id || null;
  };

  const daysAgo = (d) => new Date(Date.now() - d * 24 * 60 * 60 * 1000);

  return [
    {
      vendorId: vendorObjectId,
      opportunityId: oppId('Website Development'),
      title: 'Quotation — Corporate Website for NovaTech Solutions',
      coverLetter: `Dear Ankit,\n\nThank you for considering us for your corporate portfolio website. Our team specializes in React + Node.js builds with CMS integration.\n\nWe propose a phased delivery over 20 days with weekly demos.\n\n[${DEMO_TAG}]`,
      pricing: {
        lineItems: [
          { description: 'UI/UX Design & Wireframes', quantity: 1, unitPrice: 15000, unit: 'lump', total: 15000 },
          { description: 'React Frontend Development', quantity: 1, unitPrice: 35000, unit: 'lump', total: 35000 },
          { description: 'Node.js Backend + CMS', quantity: 1, unitPrice: 22000, unit: 'lump', total: 22000 },
        ],
        subtotal: 72000,
        gstPercentage: 18,
        gstAmount: 12960,
        totalAmount: 84960,
        validUntil: futureDate(30),
      },
      timeline: { totalDays: 20, phases: [{ name: 'Design', duration: 5 }, { name: 'Development', duration: 12 }, { name: 'QA & Launch', duration: 3 }] },
      teamStructure: [{ role: 'Full Stack Developer', count: 2, experience: '3+ years' }, { role: 'UI Designer', count: 1, experience: '2+ years' }],
      status: 'draft',
      createdAt: daysAgo(1),
    },
    {
      vendorId: vendorObjectId,
      opportunityId: oppId('500 ATM Maintenance'),
      title: 'Proposal — HDFC Bank ATM Maintenance Contract (500 Sites)',
      coverLetter: `We are pleased to submit our comprehensive maintenance proposal for 500 ATM sites across Western India.\n\nOur certified field engineers maintain 99.2% uptime SLA for banking clients.\n\n[${DEMO_TAG}]`,
      pricing: {
        lineItems: [
          { description: 'Quarterly Preventive Maintenance (500 sites)', quantity: 4, unitPrice: 850000, unit: 'quarter', total: 3400000 },
          { description: 'Emergency Breakdown Response (4hr SLA)', quantity: 1, unitPrice: 1200000, unit: 'year', total: 1200000 },
          { description: 'Spare Parts & Consumables Pool', quantity: 1, unitPrice: 450000, unit: 'year', total: 450000 },
        ],
        subtotal: 5050000,
        gstPercentage: 18,
        gstAmount: 909000,
        totalAmount: 5959000,
        validUntil: futureDate(45),
      },
      timeline: { totalDays: 730, phases: [{ name: 'Mobilization', duration: 30 }, { name: 'Rollout Phase 1', duration: 180 }, { name: 'Full Operations', duration: 520 }] },
      teamStructure: [{ role: 'ATM Field Engineer', count: 50, experience: 'Certified' }, { role: 'Project Manager', count: 2, experience: '8+ years' }],
      status: 'draft',
      createdAt: daysAgo(2),
    },
    {
      vendorId: vendorObjectId,
      opportunityId: oppId('Enterprise CCTV'),
      title: 'Formal Quotation — StyleMart Retail CCTV Rollout (85 Stores)',
      coverLetter: `StyleMart Retail Pvt Ltd,\n\nAttached is our formal quotation for IP-based CCTV upgrade across 85 retail locations with centralized NOC monitoring.\n\n[${DEMO_TAG}]`,
      pricing: { subtotal: 12500000, gstPercentage: 18, gstAmount: 2250000, totalAmount: 14750000, validUntil: futureDate(20) },
      timeline: { totalDays: 180 },
      status: 'sent',
      sentAt: daysAgo(3),
      createdAt: daysAgo(5),
    },
    {
      vendorId: vendorObjectId,
      opportunityId: oppId('Cloud Migration'),
      title: 'Quotation — AWS Cloud Migration for Precision Tools India',
      coverLetter: `Precision Tools India Ltd,\n\nOur DevOps team proposes a zero-downtime ERP migration to AWS with containerized microservices architecture.\n\n[${DEMO_TAG}]`,
      pricing: { subtotal: 1180000, gstPercentage: 18, gstAmount: 212400, totalAmount: 1392400, validUntil: futureDate(15) },
      timeline: { totalDays: 90 },
      status: 'sent',
      sentAt: daysAgo(4),
      createdAt: daysAgo(6),
    },
    {
      vendorId: vendorObjectId,
      opportunityId: oppId('Mobile App Development'),
      title: 'Proposal — Food Delivery MVP for SpiceRoute Foods',
      coverLetter: `SpiceRoute Foods Pvt Ltd,\n\nCross-platform MVP delivery including customer app, rider app, and restaurant dashboard.\n\n[${DEMO_TAG}]`,
      pricing: { subtotal: 320000, gstPercentage: 18, gstAmount: 57600, totalAmount: 377600, validUntil: futureDate(25) },
      timeline: { totalDays: 45 },
      status: 'viewed',
      sentAt: daysAgo(7),
      viewedAt: daysAgo(2),
      createdAt: daysAgo(8),
    },
    {
      vendorId: vendorObjectId,
      opportunityId: oppId('Solar Installation 10kW'),
      title: 'Accepted Quotation — 10kW Solar for Sunrise Textiles Mills',
      coverLetter: `Project awarded and work in progress. 10kW 3-phase grid-tie solar installation.\n\n[${DEMO_TAG}]`,
      pricing: { subtotal: 425000, gstPercentage: 12, gstAmount: 51000, totalAmount: 476000, validUntil: futureDate(10) },
      timeline: { totalDays: 15 },
      status: 'accepted',
      sentAt: daysAgo(20),
      viewedAt: daysAgo(18),
      clientResponse: { date: daysAgo(15), message: 'Proposal accepted. Please proceed with site survey.' },
      createdAt: daysAgo(22),
    },
    {
      vendorId: vendorObjectId,
      opportunityId: oppId('RFQ: CCTV Infrastructure'),
      title: 'Bid Response — AAI T3 Terminal CCTV Infrastructure',
      coverLetter: `Airport Authority of India,\n\nTechnical and financial bid for world-class IP CCTV with AI analytics. Unfortunately not shortlisted.\n\n[${DEMO_TAG}]`,
      pricing: { subtotal: 95000000, gstPercentage: 18, gstAmount: 17100000, totalAmount: 112100000, validUntil: futureDate(5) },
      timeline: { totalDays: 365 },
      status: 'rejected',
      sentAt: daysAgo(30),
      viewedAt: daysAgo(25),
      clientResponse: { date: daysAgo(10), message: 'Not selected — L1 bidder policy applied.' },
      createdAt: daysAgo(35),
    },
    {
      vendorId: vendorObjectId,
      opportunityId: oppId('EV Charging'),
      title: 'Negotiating — EV Charging Stations for MetroSquare Mall',
      coverLetter: `MetroSquare Mall Management,\n\nWe propose 4 x 60kW DC fast chargers with load management. Client requested revised pricing.\n\n[${DEMO_TAG}]`,
      pricing: { subtotal: 580000, gstPercentage: 18, gstAmount: 104400, totalAmount: 684400, validUntil: futureDate(12) },
      timeline: { totalDays: 15 },
      status: 'negotiating',
      sentAt: daysAgo(5),
      viewedAt: daysAgo(3),
      clientResponse: { date: daysAgo(1), message: 'Can you reduce total by 8%? Counter-offer under review.', counterOffer: 630000 },
      createdAt: daysAgo(6),
    },
  ];
};

async function seed() {
  await connectForScript();

  let vendorIds = [];
  if (VENDOR_ID_ARG) {
    vendorIds = [VENDOR_ID_ARG];
  } else {
    const vendors = await Vendor.find({})
      .select('_id businessName name email status')
      .sort({ updatedAt: -1 })
      .limit(20)
      .lean();
    if (!vendors.length) {
      console.error('❌ No vendor found in database. Register a vendor first or pass vendorId.');
      process.exit(1);
    }
    vendorIds = vendors.map((v) => v._id.toString());
    console.log(`📌 Seeding for ${vendorIds.length} vendor(s):`);
    vendors.forEach((v) => console.log(`   • ${v.businessName || v.name} (${v._id})`));
  }

  // Remove previous demo seed
  await Opportunity.deleteMany({ description: { $regex: DEMO_TAG, $options: 'i' } });
  await VendorProposal.deleteMany({ coverLetter: { $regex: DEMO_TAG, $options: 'i' } });

  let totalInserted = 0;
  let totalProposals = 0;

  for (const vendorId of vendorIds) {
    const vendorObjectId = new mongoose.Types.ObjectId(vendorId);
    const docs = opportunities.map((opp) => {
      const doc = {
        ...opp,
        description: `${opp.description}\n\n[${DEMO_TAG}]`,
        eligibleVendors: [vendorObjectId],
      };
      if (doc.status === 'awarded') {
        doc.bids = [{
          vendorId: vendorObjectId,
          amount: doc.budget.min + Math.floor((doc.budget.max - doc.budget.min) * 0.7),
          proposalText: 'Our team has the expertise and manpower to execute this project on time.',
          timeline: 45,
          teamSize: 5,
          status: 'accepted',
          submittedAt: doc.deadline || new Date()
        }];
        doc.awardedTo = {
          vendorId: vendorObjectId,
          awardedAt: doc.deadline || new Date()
        };
      }
      return doc;
    });
    const inserted = [];
    for (const doc of docs) {
      const opp = new Opportunity(doc);
      await opp.save();
      inserted.push(opp);
    }
    totalInserted += inserted.length;

    const proposalDocs = buildDemoProposals(vendorObjectId, inserted);
    for (const pDoc of proposalDocs) {
      const proposal = new VendorProposal(pDoc);
      await proposal.save();
      totalProposals += 1;
    }
  }

  console.log(`✅ Successfully seeded ${totalInserted} opportunities across ${vendorIds.length} vendor(s)!`);
  console.log(`✅ Successfully seeded ${totalProposals} proposals & quotations!`);
  console.log('📊 Proposals tab: /vendor/dynamic/business-intake/proposals');

  await mongoose.connection.close();
  process.exit(0);
}

seed().catch(err => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
