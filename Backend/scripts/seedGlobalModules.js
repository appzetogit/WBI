/**
 * Seed: Vendor global modules demo data
 * npm run seed:global-modules [vendorId]
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Vendor = require('../models/Vendor');
const VendorGlobalPerformance = require('../models/VendorGlobalPerformance');
const VendorGlobalCompliance = require('../models/VendorGlobalCompliance');
const VendorGlobalNotification = require('../models/VendorGlobalNotification');
const VendorGlobalSupportTicket = require('../models/VendorGlobalSupportTicket');
const VendorGlobalSetting = require('../models/VendorGlobalSetting');

const DEMO_TAG = 'wbi-global-demo';
const argVendorId = process.argv[2];
const daysFromNow = (days) => new Date(Date.now() + days * 86400000);
const daysAgo = (days) => new Date(Date.now() - days * 86400000);

const SERVICE_TEMPLATES = {
  WEB: {
    name: 'Software Development',
    kpis: [['Sprint Velocity', '42 pts', '35 pts'], ['Bug Resolution', '94%', '90%'], ['Deployment Success', '98%', '95%']],
    compliance: ['MSA', 'GST', 'NDA', 'Data Protection Agreement']
  },
  SOLAR: {
    name: 'Solar Energy',
    kpis: [['Installation Time', '2.8 days', '< 3 days'], ['Energy Output', '96%', '95%'], ['Inspection Score', '92%', '90%']],
    compliance: ['Electrical License', 'Insurance', 'Safety Certificate', 'MNRE Registration']
  },
  CCTV: {
    name: 'CCTV & Surveillance',
    kpis: [['Install Success', '95%', '92%'], ['Revisit %', '4%', '< 6%'], ['Recording Uptime', '99%', '98%']],
    compliance: ['Electrical Compliance', 'Security License', 'Police Verification']
  },
  AC: {
    name: 'HVAC',
    kpis: [['Service Time', '3.2h', '< 4h'], ['Cooling Test Pass', '97%', '95%'], ['Revisit %', '5%', '< 7%']],
    compliance: ['HVAC License', 'Insurance', 'Safety Training']
  },
  NET: {
    name: 'Networking',
    kpis: [['SLA %', '96%', '95%'], ['Uptime', '99.2%', '99%'], ['Config Success', '94%', '92%']],
    compliance: ['Network Certification', 'MSA', 'NDA']
  },
  EV: {
    name: 'EV Charging',
    kpis: [['Commissioning Pass', '95%', '92%'], ['Safety Compliance', '98%', '95%'], ['Fault Rate', '2%', '< 4%']],
    compliance: ['EVSE Installer', 'Electrical License', 'Insurance']
  }
};

const modules = ['business-intake', 'project-ops', 'finance', 'quality', 'compliance', 'support', 'system'];

async function seedVendor(vendorId) {
  const vid = new mongoose.Types.ObjectId(vendorId);
  const codes = Object.keys(SERVICE_TEMPLATES);

  for (let i = 0; i < codes.length; i += 1) {
    const code = codes[i];
    const tpl = SERVICE_TEMPLATES[code];
    await VendorGlobalPerformance.create({
      vendorId: vid,
      serviceCategoryCode: code,
      serviceCategoryName: tpl.name,
      performanceScore: 78 + i * 3,
      vendorRating: 4.1 + (i % 4) * 0.2,
      slaCompliance: 88 + i,
      projectSuccessRate: 84 + i * 2,
      activeProjects: 3 + i,
      revenue: 420000 + i * 185000,
      profit: 115000 + i * 62000,
      teamProductivity: 76 + i * 3,
      customerSatisfaction: 82 + i * 2,
      repeatClients: 4 + i,
      bidWinRate: 35 + i * 4,
      quoteAcceptance: 48 + i * 3,
      averageResponseTimeMinutes: 22 - i,
      complaintRate: Math.max(1, 8 - i),
      completionPercent: 80 + i * 3,
      dynamicKpis: tpl.kpis.map(([label, value, target], idx) => ({ label, value, target, status: idx === 0 ? 'good' : 'excellent' })),
      charts: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'].map((label, idx) => ({
        label,
        revenue: 180000 + idx * 55000 + i * 12000,
        projects: 4 + idx + i,
        sla: 88 + idx + i,
        rating: 4 + idx * 0.1,
        productivity: 70 + idx * 3,
        profitMargin: 18 + idx
      })),
      engineers: ['Rahul Verma', 'Sneha Iyer', 'Amit Khan'].map((name, idx) => ({
        name,
        role: ['Lead Engineer', 'QA Engineer', 'Field Engineer'][idx],
        completedJobs: 18 + idx * 7 + i,
        averageTimeHours: 3 + idx,
        qualityScore: 86 + idx * 3,
        attendancePercent: 92 + idx,
        customerRating: 4.2 + idx * 0.2,
        reworkPercent: 4 + idx,
        lateArrivals: idx,
        safetyScore: 90 + idx * 3
      })),
      leaderboardRank: 12 + i,
      demoTag: DEMO_TAG
    });

    for (let c = 0; c < tpl.compliance.length; c += 1) {
      const status = ['verified', 'pending', 'renewal_required', 'expired'][c % 4];
      await VendorGlobalCompliance.create({
        vendorId: vid,
        requirementCode: `${code}-${String(c + 1).padStart(2, '0')}`,
        name: tpl.compliance[c],
        category: c === 0 ? 'license' : c === 1 ? 'insurance' : c === 2 ? 'legal' : 'certification',
        serviceCategoryCode: code,
        serviceCategoryName: tpl.name,
        status,
        documentNumber: `DOC-${code}-${1000 + c}`,
        issuedBy: 'WBI Compliance Authority',
        issuedAt: daysAgo(180 + c * 20),
        expiresAt: status === 'expired' ? daysAgo(5) : daysFromNow(c === 2 ? 18 : 180),
        mandatory: true,
        demoTag: DEMO_TAG
      });
    }
  }

  const notificationTypes = [
    'new_opportunity', 'project_assigned', 'payment_received', 'invoice_generated',
    'document_expiry', 'approval_pending', 'quality_failed', 'rework', 'withdrawal_approved', 'system_announcement'
  ];
  for (let i = 0; i < 18; i += 1) {
    const module = modules[i % modules.length];
    await VendorGlobalNotification.create({
      vendorId: vid,
      title: notificationTypes[i % notificationTypes.length].replace(/_/g, ' '),
      message: `Dynamic ${module} update for vendor workflow`,
      type: notificationTypes[i % notificationTypes.length],
      module,
      priority: i % 5 === 0 ? 'urgent' : i % 3 === 0 ? 'high' : 'normal',
      channels: ['in_app', 'email', i % 2 === 0 ? 'push' : 'sms'],
      read: i % 4 === 0,
      actionUrl: `/vendor/dynamic/${module === 'project-ops' ? 'projects' : module}`,
      serviceCategoryCode: codes[i % codes.length],
      serviceCategoryName: SERVICE_TEMPLATES[codes[i % codes.length]].name,
      demoTag: DEMO_TAG
    });
  }

  const ticketCategories = ['technical', 'payment', 'project', 'engineer', 'quality', 'inventory', 'billing', 'api', 'bug_report', 'feature_request'];
  for (let i = 0; i < 10; i += 1) {
    const code = codes[i % codes.length];
    await new VendorGlobalSupportTicket({
      vendorId: vid,
      subject: `${ticketCategories[i].replace(/_/g, ' ')} support request`,
      description: 'Demo support ticket with SLA timeline and comments.',
      category: ticketCategories[i],
      priority: ['low', 'medium', 'high', 'urgent'][i % 4],
      status: ['open', 'assigned', 'investigation', 'resolved', 'closed'][i % 5],
      assignedTeam: ['Tech Support', 'Finance Support', 'Ops Support'][i % 3],
      serviceCategoryCode: code,
      serviceCategoryName: SERVICE_TEMPLATES[code].name,
      attachmentsCount: i % 3,
      averageResponseMinutes: 30 + i * 8,
      replies: [{ author: 'WBI Support', role: 'support', message: 'We are checking this request.', createdAt: daysAgo(i) }],
      demoTag: DEMO_TAG
    }).save();
  }

  await VendorGlobalSetting.create({
    vendorId: vid,
    companyProfile: {
      companyName: 'Vendor Demo Pvt Ltd',
      gst: '27AABCW1234F1Z5',
      pan: 'AABCW1234F',
      address: 'Pune, Maharashtra',
      website: 'https://vendor.example.com'
    },
    teamSettings: {
      departments: ['Operations', 'Finance', 'Quality', 'Support'],
      roles: ['Owner', 'Manager', 'Engineer', 'Viewer'],
      permissions: ['projects:read', 'finance:write', 'quality:approve', 'settings:admin']
    },
    serviceSettings: codes.map((code) => ({
      serviceCategoryCode: code,
      serviceCategoryName: SERVICE_TEMPLATES[code].name,
      coverageAreas: ['Pune', 'Mumbai', 'Bengaluru'],
      pricingModel: code === 'WEB' ? 'milestone' : 'project',
      workingHours: '09:00-18:00',
      emergencyAvailable: code !== 'WEB'
    })),
    financeSettings: {
      bankAccounts: [{ bank: 'HDFC Bank', accountMasked: 'XXXXXX4321', primary: true }],
      paymentMethods: ['NEFT', 'UPI', 'Razorpay'],
      commissionPercent: 5
    },
    security: {
      twoFactorEnabled: true,
      activeSessions: 3,
      devices: [{ name: 'Chrome on Windows', lastSeen: new Date() }],
      apiTokens: [{ label: 'Ops Webhook', lastUsedAt: daysAgo(2) }]
    },
    integrations: {
      webhooks: [{ name: 'Project Completed', url: 'https://example.com/webhook', enabled: true }]
    },
    demoTag: DEMO_TAG
  });
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set');
  await mongoose.connect(uri, { family: 4, serverSelectionTimeoutMS: 30000, connectTimeoutMS: 30000 });
  console.log(`MongoDB Connected: ${mongoose.connection.host}`);
  const vendorIds = argVendorId
    ? [argVendorId]
    : (await Vendor.find().sort({ createdAt: -1 }).limit(20).select('_id').lean()).map((v) => String(v._id));
  await Promise.all([
    VendorGlobalPerformance.deleteMany({ demoTag: DEMO_TAG }),
    VendorGlobalCompliance.deleteMany({ demoTag: DEMO_TAG }),
    VendorGlobalNotification.deleteMany({ demoTag: DEMO_TAG }),
    VendorGlobalSupportTicket.deleteMany({ demoTag: DEMO_TAG }),
    VendorGlobalSetting.deleteMany({ demoTag: DEMO_TAG })
  ]);
  for (const id of vendorIds) {
    await seedVendor(id);
    console.log(`Seeded global modules for ${id}`);
  }
  console.log(`Global modules seed complete for ${vendorIds.length} vendors`);
  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
