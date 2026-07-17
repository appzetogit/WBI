/**
 * Seed: Quality & Control demo data
 * npm run seed:quality
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Vendor = require('../models/Vendor');
const VendorQualityProof = require('../models/VendorQualityProof');
const VendorQualityReview = require('../models/VendorQualityReview');
const VendorQualityApproval = require('../models/VendorQualityApproval');
const VendorQualityIssue = require('../models/VendorQualityIssue');
const VendorQualityChangeRequest = require('../models/VendorQualityChangeRequest');
const VendorQualityDamage = require('../models/VendorQualityDamage');

const VENDOR_ID_ARG = process.argv[2];
const DEMO_TAG = 'wbi-qc-demo';

const connectForScript = async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set');
  mongoose.set('bufferCommands', false);
  await mongoose.connect(uri, { family: 4, serverSelectionTimeoutMS: 30000, connectTimeoutMS: 30000 });
  console.log(`✅ MongoDB Connected: ${mongoose.connection.host}`);
};

const daysAgo = (d) => new Date(Date.now() - d * 86400000);

/** Dynamic proof + QA checklist templates by service */
const SERVICE_QA = {
  SOLAR: {
    name: 'Solar Energy',
    proof: ['Before Photos', 'After Photos', 'Panel Serial Number', 'Installation Checklist', 'Customer Signature', 'Electrical Testing Report'],
    checklist: ['Panel Alignment', 'Wiring', 'Voltage', 'Safety', 'Cleaning']
  },
  CCTV: {
    name: 'CCTV & Surveillance',
    proof: ['Before Photos', 'After Photos', 'Camera Serial', 'NVR Config Screenshot', 'Customer Signature'],
    checklist: ['Camera Angle', 'Cabling', 'Recording Test', 'Night Vision', 'Safety']
  },
  WEB: {
    name: 'Web Development',
    proof: ['Git Repository', 'Build Status', 'Demo URL', 'Testing Report', 'Client Acceptance'],
    checklist: ['UI', 'API', 'Testing', 'Performance', 'Security']
  },
  AC: {
    name: 'HVAC',
    proof: ['Gas Pressure Report', 'Before Photos', 'After Photos', 'Cooling Test', 'Service Checklist'],
    checklist: ['Gas Pressure', 'Cooling', 'Noise Level', 'Cleaning', 'Safety']
  },
  NET: {
    name: 'Networking',
    proof: ['Before Photos', 'After Photos', 'Switch Config', 'Speed Test Report', 'Client Signoff'],
    checklist: ['Cabling', 'Switch Config', 'Throughput', 'Redundancy', 'Labeling']
  },
  ATM: {
    name: 'ATM Maintenance',
    proof: ['Before Photos', 'After Photos', 'Spare Part Serial', 'Test Transaction', 'Site Signoff'],
    checklist: ['Dispenser Test', 'Card Reader', 'Printer', 'Cleaning', 'Safety']
  },
  DEFAULT: {
    name: 'General Services',
    proof: ['Before Photos', 'After Photos', 'Checklist', 'Customer Signature'],
    checklist: ['Workmanship', 'Safety', 'Cleaning', 'Completion']
  }
};

const CLIENTS = ['Bharat Auto', 'StyleMart Retail', 'NovaTech', 'HDFC Bank', 'Techno Park'];
const ENGINEERS = ['Rahul Verma', 'Sneha Iyer', 'Amit Khan', 'Priya Nair', 'Vikas Patel'];
const PROOF_STATUS = ['pending_review', 'under_review', 'approved', 'rejected', 'resubmit_required'];
const QA_STATUS = ['pending', 'passed', 'failed'];

async function seedVendor(vendorId) {
  const vid = new mongoose.Types.ObjectId(vendorId);
  const codes = Object.keys(SERVICE_QA).filter((k) => k !== 'DEFAULT');
  const counts = { proof: 0, qa: 0, appr: 0, iss: 0, chg: 0, dmg: 0 };

  for (let i = 0; i < codes.length; i++) {
    const code = codes[i];
    const tpl = SERVICE_QA[code];
    const client = CLIENTS[i % CLIENTS.length];
    const eng = ENGINEERS[i % ENGINEERS.length];
    const project = `${tpl.name} Rollout`;
    const projectCode = `PRJ-${code}-0${i + 1}`;

    // Proof submissions (2 per service)
    for (let p = 0; p < 2; p++) {
      const status = PROOF_STATUS[(i + p) % PROOF_STATUS.length];
      const requirements = tpl.proof.map((label, idx) => ({
        label,
        type: /photo/i.test(label) ? 'photo' : /report|checklist/i.test(label) ? 'document' : 'field',
        required: true,
        submitted: status === 'approved' ? true : idx < tpl.proof.length - (p + 1),
        value: ''
      }));
      await new VendorQualityProof({
        vendorId: vid,
        projectName: project,
        projectCode,
        clientName: client,
        siteName: `${client} Site`,
        serviceCategoryCode: code,
        serviceCategoryName: tpl.name,
        engineerName: eng,
        submittedAt: daysAgo(p + i),
        gpsVerified: true,
        otpVerified: p % 2 === 0,
        signatureCaptured: status === 'approved',
        requirements,
        status,
        internalNotes: '',
        demoTag: DEMO_TAG
      }).save();
      counts.proof += 1;
    }

    // QA review
    const qaStatus = QA_STATUS[i % QA_STATUS.length];
    const checklist = tpl.checklist.map((label, idx) => ({
      label,
      passed: qaStatus === 'pending' ? null : qaStatus === 'passed' ? true : idx % 3 !== 0,
      notes: ''
    }));
    await new VendorQualityReview({
      vendorId: vid,
      projectName: project,
      projectCode,
      clientName: client,
      serviceCategoryCode: code,
      serviceCategoryName: tpl.name,
      engineerName: eng,
      checklist,
      qaStatus,
      reworkStatus: qaStatus === 'failed' ? 'pending' : 'none',
      remarks: qaStatus === 'failed' ? 'Rework required on failed checks' : '',
      demoTag: DEMO_TAG
    }).save();
    counts.qa += 1;

    // Client approval
    const cStatus = ['pending', 'approved', 'waiting_changes'][i % 3];
    await new VendorQualityApproval({
      vendorId: vid,
      approvalType: 'client',
      projectName: project,
      projectCode,
      clientName: client,
      clientType: 'individual',
      serviceCategoryCode: code,
      serviceCategoryName: tpl.name,
      status: cStatus,
      rating: cStatus === 'approved' ? 4 + (i % 2) : 0,
      feedback: cStatus === 'approved' ? 'Great work, on time.' : '',
      demoTag: DEMO_TAG
    }).save();
    counts.appr += 1;

    // B2B approval with levels
    const bStatus = ['pending', 'approved'][i % 2];
    await new VendorQualityApproval({
      vendorId: vid,
      approvalType: 'b2b',
      projectName: project,
      projectCode,
      clientName: `${client} Enterprise`,
      clientType: 'b2b',
      serviceCategoryCode: code,
      serviceCategoryName: tpl.name,
      status: bStatus,
      slaCompliance: bStatus === 'approved',
      documentationOk: true,
      siteCompletion: bStatus === 'approved' ? 100 : 70 + i * 3,
      approvalLevels: [
        { level: 'Engineer', status: 'approved', by: eng, at: daysAgo(4) },
        { level: 'Vendor QA', status: 'approved', by: 'QA Lead', at: daysAgo(3) },
        { level: 'B2B Manager', status: bStatus === 'approved' ? 'approved' : 'pending', by: bStatus === 'approved' ? 'B2B Manager' : '', at: bStatus === 'approved' ? daysAgo(1) : null },
        { level: 'Final Closure', status: bStatus === 'approved' ? 'approved' : 'pending', by: '', at: null }
      ],
      demoTag: DEMO_TAG
    }).save();
    counts.appr += 1;

    // Issue
    const iTypes = ['technical', 'material', 'safety', 'delay', 'compliance'];
    const iStatus = ['open', 'in_progress', 'escalated', 'resolved'][i % 4];
    const priority = ['low', 'medium', 'high', 'critical'][i % 4];
    await new VendorQualityIssue({
      vendorId: vid,
      title: `${iTypes[i % iTypes.length]} issue on ${project}`,
      issueType: iTypes[i % iTypes.length],
      projectName: project,
      projectCode,
      clientName: client,
      serviceCategoryCode: code,
      serviceCategoryName: tpl.name,
      priority,
      owner: iStatus === 'open' ? '' : eng,
      description: 'Auto-generated demo issue for QA lifecycle.',
      status: iStatus,
      slaBreached: priority === 'critical' && iStatus !== 'resolved',
      reportedAt: daysAgo(i + 2),
      resolvedAt: iStatus === 'resolved' ? daysAgo(1) : null,
      demoTag: DEMO_TAG
    }).save();
    counts.iss += 1;

    // Change request
    const chStatus = ['requested', 'under_approval', 'approved', 'implementing'][i % 4];
    const chTypes = ['additional_work', 'design_change', 'timeline_extension', 'budget_revision'];
    await new VendorQualityChangeRequest({
      vendorId: vid,
      title: `${chTypes[i % chTypes.length].replace(/_/g, ' ')} — ${project}`,
      projectName: project,
      projectCode,
      clientName: client,
      serviceCategoryCode: code,
      serviceCategoryName: tpl.name,
      requestedBy: ['client', 'b2b', 'vendor'][i % 3],
      changeType: chTypes[i % chTypes.length],
      previousScope: 'Original agreed scope',
      updatedScope: 'Expanded scope with additional deliverables',
      costDifference: (i + 1) * 25000,
      timelineDifferenceDays: (i % 3) * 5,
      status: chStatus,
      demoTag: DEMO_TAG
    }).save();
    counts.chg += 1;

    // Damage incident (every other service)
    if (i % 2 === 0) {
      const dStatus = ['reported', 'investigation', 'settlement'][i % 3];
      await new VendorQualityDamage({
        vendorId: vid,
        projectName: project,
        projectCode,
        clientName: client,
        engineerName: eng,
        serviceCategoryCode: code,
        serviceCategoryName: tpl.name,
        description: 'Minor site damage during installation.',
        estimatedCost: (i + 1) * 12000,
        responsibleParty: ['engineer', 'third_party', 'material'][i % 3],
        insuranceCase: i % 4 === 0,
        photosCount: 3 + i,
        status: dStatus,
        resolution: '',
        demoTag: DEMO_TAG
      }).save();
      counts.dmg += 1;
    }
  }

  return counts;
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
    VendorQualityProof.deleteMany({ demoTag: DEMO_TAG }),
    VendorQualityReview.deleteMany({ demoTag: DEMO_TAG }),
    VendorQualityApproval.deleteMany({ demoTag: DEMO_TAG }),
    VendorQualityIssue.deleteMany({ demoTag: DEMO_TAG }),
    VendorQualityChangeRequest.deleteMany({ demoTag: DEMO_TAG }),
    VendorQualityDamage.deleteMany({ demoTag: DEMO_TAG })
  ]);

  const totals = { proof: 0, qa: 0, appr: 0, iss: 0, chg: 0, dmg: 0 };
  for (const id of vendorIds) {
    const c = await seedVendor(id);
    Object.keys(totals).forEach((k) => { totals[k] += c[k]; });
    console.log(`  ✓ Vendor ${id}: ${c.proof} proofs, ${c.qa} QA, ${c.appr} approvals, ${c.iss} issues`);
  }

  console.log(`\n✅ Seeded Quality: ${totals.proof} proofs, ${totals.qa} QA, ${totals.appr} approvals, ${totals.iss} issues, ${totals.chg} changes, ${totals.dmg} damages`);
  console.log('👉 Open /vendor/dynamic/quality/proof');
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
