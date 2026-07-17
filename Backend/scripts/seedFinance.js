/**
 * Seed: Vendor Finance demo data
 * npm run seed:finance [vendorId]
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Vendor = require('../models/Vendor');
const VendorFinanceWallet = require('../models/VendorFinanceWallet');
const VendorFinanceTransaction = require('../models/VendorFinanceTransaction');
const VendorFinanceReceivable = require('../models/VendorFinanceReceivable');
const VendorFinanceDocument = require('../models/VendorFinanceDocument');
const VendorFinanceMilestone = require('../models/VendorFinanceMilestone');

const DEMO_TAG = 'wbi-fin-demo';
const VENDOR_ID_ARG = process.argv[2];
const day = 86400000;
const ago = (days) => new Date(Date.now() - days * day);
const ahead = (days) => new Date(Date.now() + days * day);

const TEMPLATES = {
  SOLAR: { name: 'Solar Energy', milestones: ['Advance', 'Site Survey', 'Installation', 'Inspection', 'Commissioning'], split: [20, 10, 35, 15, 20], material: 'Panels & inverters' },
  WEB: { name: 'Web Development', milestones: ['Advance', 'Design Sprint', 'Development Sprint', 'QA & UAT', 'Deployment'], split: [20, 15, 35, 20, 10], material: 'Cloud & licenses' },
  CCTV: { name: 'CCTV & Surveillance', milestones: ['Advance', 'Site Survey', 'Material Delivery', 'Installation', 'Handover'], split: [20, 10, 25, 30, 15], material: 'Cameras & NVR' },
  AC: { name: 'HVAC', milestones: ['Visit Charge', 'Diagnosis', 'Repair', 'Service Completion'], split: [15, 20, 45, 20], material: 'Spares & gas' },
  NET: { name: 'Networking', milestones: ['Advance', 'Cabling', 'Configuration', 'UAT', 'Go-Live'], split: [20, 25, 25, 20, 10], material: 'Switches & cable' },
  ATM: { name: 'ATM Maintenance', milestones: ['Mobilization', 'PMC Visit', 'Spare Replacement', 'SLA Closure'], split: [15, 30, 35, 20], material: 'ATM spare parts' }
};

const CLIENTS = [
  { name: 'Aarav Mehta', type: 'individual' },
  { name: 'Bharat Auto Components', type: 'b2b' },
  { name: 'StyleMart Retail', type: 'b2b' },
  { name: 'NovaTech Solutions', type: 'b2b' },
  { name: 'Ananya Sharma', type: 'individual' },
  { name: 'HDFC Bank', type: 'b2b' }
];

async function seedVendor(id) {
  const vendorId = new mongoose.Types.ObjectId(id);
  const wallet = await VendorFinanceWallet.create({
    vendorId,
    availableBalance: 625000,
    escrowBalance: 210000,
    pendingSettlement: 85000,
    processingWithdrawal: 25000,
    totalEarnings: 2450000,
    totalWithdrawn: 1480000,
    commissionDeducted: 122500,
    refundAmount: 18000,
    demoTag: DEMO_TAG
  });

  const transactionTypes = ['credit', 'escrow_hold', 'escrow_release', 'commission', 'withdrawal', 'refund'];
  for (let i = 0; i < 12; i += 1) {
    const type = transactionTypes[i % transactionTypes.length];
    await new VendorFinanceTransaction({
      vendorId,
      type,
      amount: 15000 + i * 7500,
      description: `${type.replace(/_/g, ' ')} — project finance event`,
      projectCode: `PRJ-${Object.keys(TEMPLATES)[i % 6]}-0${(i % 6) + 1}`,
      referenceCode: `REF-${202600 + i}`,
      balanceAfter: wallet.availableBalance - i * 5000,
      status: type === 'withdrawal' && i > 6 ? 'processing' : 'completed',
      occurredAt: ago(i * 3),
      demoTag: DEMO_TAG
    }).save();
  }

  const codes = Object.keys(TEMPLATES);
  for (let i = 0; i < codes.length; i += 1) {
    const code = codes[i];
    const template = TEMPLATES[code];
    const client = CLIENTS[i];
    const projectCode = `PRJ-${code}-0${i + 1}`;
    const projectName = `${template.name} Enterprise Project`;
    const contractValue = 350000 + i * 275000;
    const paid = i % 3 === 0 ? contractValue : i % 3 === 1 ? Math.round(contractValue * 0.45) : 0;

    await new VendorFinanceReceivable({
      vendorId,
      clientType: client.type,
      clientName: client.name,
      projectName,
      projectCode,
      contractCode: `CNT-${code}-26`,
      poNumber: client.type === 'b2b' ? `PO-${code}-2026` : '',
      invoiceNumber: `INV-DEMO-${code}`,
      serviceCategoryCode: code,
      serviceCategoryName: template.name,
      amount: contractValue,
      paidAmount: paid,
      dueDate: i % 3 === 2 ? ago(10) : ahead(10 + i * 5),
      paymentMethod: client.type === 'b2b' ? 'NEFT' : 'UPI',
      status: paid >= contractValue ? 'paid' : paid > 0 ? 'partial' : i % 3 === 2 ? 'overdue' : 'pending',
      demoTag: DEMO_TAG
    }).save();

    const quoteStatus = ['draft', 'sent', 'negotiation', 'approved', 'rejected', 'expired'][i];
    await new VendorFinanceDocument({
      vendorId,
      documentType: 'quotation',
      clientName: client.name,
      clientType: client.type,
      projectName,
      projectCode,
      serviceCategoryCode: code,
      serviceCategoryName: template.name,
      scope: `${template.name} complete implementation and support`,
      items: [
        { description: template.material, category: 'material', quantity: 1, rate: Math.round(contractValue * 0.45) },
        { description: 'Engineering labor', category: 'labor', quantity: 1, rate: Math.round(contractValue * 0.35) },
        { description: 'Installation & support', category: 'service', quantity: 1, rate: Math.round(contractValue * 0.1) }
      ],
      discount: Math.round(contractValue * 0.03),
      taxRate: 18,
      validUntil: ahead(20),
      status: quoteStatus,
      convertedToProject: quoteStatus === 'approved',
      demoTag: DEMO_TAG
    }).save();

    const invoiceStatus = ['issued', 'partial', 'paid', 'overdue', 'issued', 'paid'][i];
    await new VendorFinanceDocument({
      vendorId,
      documentType: 'invoice',
      invoiceType: ['advance', 'milestone', 'final', 'tax', 'milestone', 'final'][i],
      clientName: client.name,
      clientType: client.type,
      projectName,
      projectCode,
      serviceCategoryCode: code,
      serviceCategoryName: template.name,
      scope: `${template.milestones[Math.min(2, template.milestones.length - 1)]} payment`,
      items: [{ description: 'Project milestone billing', category: 'service', quantity: 1, rate: Math.round(contractValue * 0.3) }],
      taxRate: 18,
      gstNumber: '27AABCW1234F1Z5',
      dueDate: invoiceStatus === 'overdue' ? ago(8) : ahead(12),
      status: invoiceStatus,
      paymentEligible: i % 2 === 0,
      demoTag: DEMO_TAG
    }).save();

    for (let m = 0; m < template.milestones.length; m += 1) {
      const status = m < 1 ? 'paid' : m === 1 ? 'invoiced' : m === 2 ? 'approval_pending' : 'upcoming';
      await new VendorFinanceMilestone({
        vendorId,
        projectName,
        projectCode,
        clientName: client.name,
        serviceCategoryCode: code,
        serviceCategoryName: template.name,
        name: template.milestones[m],
        sequence: m + 1,
        amount: Math.round(contractValue * (template.split[m] / 100)),
        percentage: template.split[m],
        dueDate: ahead((m - 1) * 20),
        projectCompleted: m <= 2,
        qaApproved: m <= 1,
        clientApproved: m <= 1,
        invoiceNumber: m <= 1 ? `AUTO-PM-${code}-${m + 1}` : '',
        status,
        paidAt: status === 'paid' ? ago(5) : null,
        demoTag: DEMO_TAG
      }).save();
    }
  }
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set');
  mongoose.set('bufferCommands', false);
  await mongoose.connect(uri, { family: 4, serverSelectionTimeoutMS: 30000, connectTimeoutMS: 30000 });
  console.log(`MongoDB Connected: ${mongoose.connection.host}`);

  const vendorIds = VENDOR_ID_ARG
    ? [VENDOR_ID_ARG]
    : (await Vendor.find().sort({ createdAt: -1 }).limit(20).select('_id').lean()).map((vendor) => String(vendor._id));
  if (!vendorIds.length) throw new Error('No vendors found');

  await Promise.all([
    VendorFinanceWallet.deleteMany({ demoTag: DEMO_TAG }),
    VendorFinanceTransaction.deleteMany({ demoTag: DEMO_TAG }),
    VendorFinanceReceivable.deleteMany({ demoTag: DEMO_TAG }),
    VendorFinanceDocument.deleteMany({ demoTag: DEMO_TAG }),
    VendorFinanceMilestone.deleteMany({ demoTag: DEMO_TAG })
  ]);

  for (const id of vendorIds) {
    await seedVendor(id);
    console.log(`Seeded Finance for vendor ${id}`);
  }
  console.log(`Finance seed complete for ${vendorIds.length} vendors`);
  console.log('Open /vendor/dynamic/finance/wallet');
  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
