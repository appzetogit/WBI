/**
 * Enquiry emails for every public form, from one place.
 *
 * Each enquiry model (web, app, banking, security, energy, healthcare, ...)
 * is saved by its own controller. Instead of editing all of them, a global
 * Mongoose plugin watches new documents of these models and sends:
 *   - a confirmation to the person who submitted the form, and
 *   - an alert to the admins.
 *
 * `register()` must run before the models are compiled (server.js calls it at
 * boot). It is safe to call more than once.
 */
const mongoose = require('mongoose');

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** modelName -> [label shown to people, admin page] */
const ENQUIRY_MODELS = {
  WebEnquiry: ['Website development', '/admin/web-enquiries'],
  AppEnquiry: ['App development', '/admin/app-enquiries'],
  CrmEnquiry: ['CRM', '/admin/crm-enquiries'],
  MarketingEnquiry: ['Digital marketing', '/admin/marketing-enquiries'],
  DesignEnquiry: ['Design', '/admin/design-enquiries'],
  BankingEnquiry: ['Banking solutions', '/admin/banking-enquiries'],
  InstallationEnquiry: ['Security installation', '/admin/security-solutions/installation'],
  MaintenanceEnquiry: ['Security maintenance', '/admin/security-solutions/maintenance'],
  BreakdownEnquiry: ['Breakdown support', '/admin/security-solutions/breakdown'],
  SiteTestingEnquiry: ['Site testing', '/admin/security-solutions/testing'],
  MultipleServicesEnquiry: ['Multiple services', '/admin/dashboard'],
  AutomatedPowerMonitoringEnquiry: ['Power monitoring', '/admin/security-solutions/monitoring'],
  AtmServiceEnquiry: ['ATM service', '/admin/banking-solutions/atm-service'],
  AtmCassetteService: ['ATM cassette service', '/admin/banking-solutions/atm-cassette-service'],
  PassbookPrinterService: ['Passbook printer service', '/admin/banking-solutions/passbook-printer-service'],
  CdmService: ['CDM service', '/admin/banking-solutions/cdm-service'],
  PosService: ['POS service', '/admin/banking-solutions/pos-service'],
  VsatService: ['VSAT service', '/admin/banking-solutions/vsat-service'],
  BarcodeReaderService: ['Barcode reader service', '/admin/banking-solutions/barcode-reader-service'],
  DgService: ['DG service', '/admin/energy-solutions/dg-services'],
  BatteryService: ['Battery service', '/admin/energy-solutions/battery-services'],
  UpsBatteryService: ['UPS battery service', '/admin/energy-solutions/ups-battery-services'],
  EvService: ['EV service', '/admin/energy-solutions/ev-services'],
  AcPowerService: ['AC power service', '/admin/energy-solutions/ac-power-services'],
  DcPowerService: ['DC power service', '/admin/energy-solutions/dc-power-services'],
  PowerTestingService: ['Power testing', '/admin/energy-solutions/power-testing-services'],
  MedicalEquipmentService: ['Medical equipment service', '/admin/healthcare-solutions/medical-equipment'],
  QualityControlTest: ['Quality control testing', '/admin/healthcare-solutions/qc-test'],
  ElectricalSafetyTest: ['Electrical safety testing', '/admin/healthcare-solutions/safety-test'],
  HcPreventiveMaintenance: ['Preventive maintenance', '/admin/healthcare-solutions/preventive-maintenance'],
  HcAmc: ['Annual maintenance contract', '/admin/healthcare-solutions/amc'],
  DynamicEnquiry: ['Service', '/admin/dashboard']
};

const reference = (doc) => String(doc._id).slice(-6).toUpperCase();

async function sendEnquiryMail(doc, modelName) {
  const [label, adminPath] = ENQUIRY_MODELS[modelName];
  const { emitAsync } = require('./notificationOrchestrator.service');
  const base = {
    enquiryId: String(doc._id),
    reference: reference(doc),
    enquiryLabel: label,
    adminPath,
    submittedAt: doc.createdAt || new Date().toISOString()
  };

  let person;
  if (modelName === 'DynamicEnquiry') {
    const User = mongoose.model('User');
    const user = doc.clientId ? await User.findById(doc.clientId).select('name email phone').lean() : null;
    let service = label;
    try {
      const sub = await mongoose.model('SubService').findById(doc.subServiceId).select('name').lean();
      if (sub?.name) service = sub.name;
    } catch (_) { /* label stays generic */ }
    base.enquiryLabel = service;
    person = { name: user?.name, email: user?.email, phone: user?.phone };
  } else {
    person = {
      name: doc.fullName,
      email: doc.email,
      phone: doc.phone,
      companyName: doc.companyName,
      city: doc.city
    };
  }
  const data = { ...base, ...person };
  const email = String(person.email || '').trim().toLowerCase();

  if (EMAIL_RX.test(email)) {
    emitAsync('enquiry_received', {
      targets: { emails: [{ role: 'user', email }] },
      data
    });
  }
  emitAsync('enquiry_submitted_admin', { targets: { notifyAllAdmins: true }, data });
}

let registered = false;

function register() {
  if (registered) return;
  registered = true;

  mongoose.plugin((schema) => {
    schema.pre('save', function markNew(next) {
      this.$locals.enquiryWasNew = this.isNew;
      next();
    });
    schema.post('save', function mailEnquiry(doc) {
      const modelName = doc.constructor?.modelName;
      if (!doc.$locals?.enquiryWasNew || !ENQUIRY_MODELS[modelName]) return;
      doc.$locals.enquiryWasNew = false;
      sendEnquiryMail(doc, modelName).catch((err) => {
        console.warn(`[enquiryMail] ${modelName} email skipped:`, err.message);
      });
    });
  });
}

module.exports = { register, ENQUIRY_MODELS };
