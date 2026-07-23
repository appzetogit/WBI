/**
 * Dynamic Compliance — sync templates from ServiceConfig + map KYC/docs/certs.
 * Supports upload, expiry processing, reminders. No seed-only rows required.
 */
const mongoose = require('mongoose');
const Vendor = require('../models/Vendor');
const VendorGlobalCompliance = require('../models/VendorGlobalCompliance');
const VendorDocument = require('../models/VendorDocument');
const VendorCertification = require('../models/VendorCertification');
const ServiceConfig = require('../models/ServiceConfig');
const { publishVendorNotification } = require('./vendorNotificationCenter.service');

function slugify(name) {
  return String(name || 'doc')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 48);
}

function inferCategory(name = '') {
  const n = name.toLowerCase();
  if (/nda|legal|agreement/.test(n)) return 'legal';
  if (/gst|pan|tan|tax/.test(n)) return 'tax';
  if (/insurance|policy/.test(n)) return 'insurance';
  if (/license|licence|empanel/.test(n)) return 'license';
  if (/police|verification|background/.test(n)) return 'verification';
  if (/bank|ifsc|account/.test(n)) return 'bank';
  if (/certif|iso|training/.test(n)) return 'certification';
  if (/kyc|aadhaar|aadhar/.test(n)) return 'kyc';
  return 'legal';
}

function mapDocStatus(raw, expiresAt) {
  const s = String(raw || 'pending').toLowerCase();
  if (expiresAt && new Date(expiresAt) < new Date()) return 'expired';
  if (expiresAt && new Date(expiresAt) - Date.now() < 30 * 86400000) return 'renewal_required';
  if (['verified', 'valid', 'approved'].includes(s)) return 'verified';
  if (['rejected'].includes(s)) return 'rejected';
  if (['expired'].includes(s)) return 'expired';
  if (['expiring soon', 'renewal_required'].includes(s)) return 'renewal_required';
  return 'pending';
}

/**
 * Upsert compliance rows from service templates + hydrate from real documents.
 */
async function syncVendorCompliance(vendorId) {
  const vendor = await Vendor.findById(vendorId).select('approvedServices businessName').lean();
  if (!vendor) return { created: 0, updated: 0 };

  const services = (vendor.approvedServices || []).filter(
    (s) => s.status === 'active' || s.status === 'approved' || !s.status
  );
  const codes = services.map((s) => s.categoryCode).filter(Boolean);

  const configs = codes.length
    ? await ServiceConfig.find({
        $or: [{ categoryCode: { $in: codes } }, { code: { $in: codes } }]
      })
        .select('categoryCode code categoryName name complianceDocs')
        .lean()
    : [];

  const templates = [];
  for (const cfg of configs) {
    const code = cfg.categoryCode || cfg.code || '';
    const name = cfg.categoryName || cfg.name || code;
    for (const doc of cfg.complianceDocs || []) {
      if (!doc?.name) continue;
      templates.push({
        requirementCode: `${code || 'GEN'}_${slugify(doc.name)}`.toUpperCase(),
        name: doc.name,
        category: inferCategory(doc.name),
        serviceCategoryCode: code,
        serviceCategoryName: name,
        mandatory: doc.required !== false,
        reminderDays: doc.expiryTracked ? 30 : 0,
        expiryTracked: Boolean(doc.expiryTracked)
      });
    }
  }

  // Platform baseline if no service templates
  if (!templates.length) {
    [
      'Company Registration',
      'NDA',
      'GST Certificate',
      'Bank Empanelment Letter',
      'Police Verification Certificate'
    ].forEach((name) => {
      templates.push({
        requirementCode: `PLATFORM_${slugify(name)}`.toUpperCase(),
        name,
        category: inferCategory(name),
        serviceCategoryCode: '',
        serviceCategoryName: 'Platform',
        mandatory: true,
        reminderDays: 30,
        expiryTracked: /police|bank|gst|insurance|license/i.test(name)
      });
    });
  }

  const [vaultDocs, certs] = await Promise.all([
    VendorDocument.find({ vendorId }).lean(),
    VendorCertification.find({ vendorId }).lean()
  ]);

  let created = 0;
  let updated = 0;

  for (const tpl of templates) {
    const matchDoc =
      vaultDocs.find((d) => String(d.title || d.documentType || '').toLowerCase().includes(tpl.name.toLowerCase().slice(0, 12))) ||
      vaultDocs.find((d) => String(d.documentType || '').toLowerCase() === tpl.category) ||
      null;
    const matchCert =
      certs.find((c) => String(c.name || '').toLowerCase().includes(tpl.name.toLowerCase().slice(0, 12))) ||
      certs.find((c) => String(c.type || '').toLowerCase().includes(tpl.name.toLowerCase().slice(0, 8))) ||
      null;

    const source = matchDoc || matchCert;
    const expiresAt = matchDoc?.expiryDate || matchCert?.expiryDate || null;
    const documentNumber = matchDoc?.documentNumber || '';
    const documentUrl = matchDoc?.documentUrl || matchCert?.documentUrl || '';
    const issuedBy = matchCert?.issuedBy || '';
    const status = source
      ? mapDocStatus(matchDoc?.status || matchCert?.status, expiresAt)
      : 'pending';

    const existing = await VendorGlobalCompliance.findOne({
      vendorId,
      requirementCode: tpl.requirementCode,
      demoTag: null
    });

    const payload = {
      vendorId,
      requirementCode: tpl.requirementCode,
      name: tpl.name,
      category: tpl.category,
      serviceCategoryCode: tpl.serviceCategoryCode,
      serviceCategoryName: tpl.serviceCategoryName,
      mandatory: tpl.mandatory,
      reminderDays: tpl.reminderDays || 30,
      status,
      documentNumber,
      issuedBy,
      expiresAt: expiresAt || undefined,
      documentUrl,
      demoTag: null,
      notes: source ? 'Linked from uploaded vendor documents' : 'Awaiting document upload'
    };

    if (existing) {
      Object.assign(existing, payload);
      // Don't overwrite verified without source expiry change unless pending
      if (existing.isModified()) {
        await existing.save();
        updated += 1;
      }
    } else {
      await VendorGlobalCompliance.create(payload);
      created += 1;
    }
  }

  // Mark expired
  await VendorGlobalCompliance.updateMany(
    {
      vendorId,
      demoTag: null,
      expiresAt: { $lt: new Date() },
      status: { $nin: ['expired', 'rejected'] }
    },
    { $set: { status: 'expired' } }
  );

  return { created, updated, templates: templates.length };
}

async function processComplianceExpiries(limit = 200) {
  const soon = new Date(Date.now() + 30 * 86400000);
  const due = await VendorGlobalCompliance.find({
    demoTag: null,
    expiresAt: { $lte: soon },
    status: { $in: ['verified', 'pending', 'renewal_required'] }
  })
    .limit(limit)
    .exec();

  let reminded = 0;
  for (const doc of due) {
    const expired = doc.expiresAt && doc.expiresAt < new Date();
    doc.status = expired ? 'expired' : 'renewal_required';
    const last = doc.lastReminderAt ? new Date(doc.lastReminderAt).getTime() : 0;
    if (Date.now() - last > 7 * 86400000) {
      doc.lastReminderAt = new Date();
      await doc.save();
      await publishVendorNotification({
        vendorId: doc.vendorId,
        type: expired ? 'document_expiry' : 'compliance_alert',
        title: expired ? 'Compliance document expired' : 'Compliance renewal due',
        message: `${doc.name} ${expired ? 'has expired' : 'expires soon'}. Please upload a renewed document.`,
        module: 'compliance',
        priority: expired ? 'urgent' : 'high',
        relatedId: doc._id,
        relatedType: 'compliance',
        actionUrl: 'compliance',
        category: 'account'
      });
      reminded += 1;
    } else {
      await doc.save();
    }
  }
  return { processed: due.length, reminded };
}

async function attachComplianceDocument(vendorId, complianceId, { documentUrl, documentNumber, expiresAt, notes }) {
  const doc = await VendorGlobalCompliance.findOne({ _id: complianceId, vendorId, demoTag: null });
  if (!doc) {
    const err = new Error('Compliance requirement not found');
    err.status = 404;
    throw err;
  }
  if (!documentUrl) {
    const err = new Error('documentUrl is required');
    err.status = 400;
    throw err;
  }

  doc.documentUrl = documentUrl;
  if (documentNumber) doc.documentNumber = documentNumber;
  if (expiresAt) doc.expiresAt = new Date(expiresAt);
  if (notes) doc.notes = notes;
  doc.status = 'pending';
  doc.issuedAt = new Date();
  await doc.save();

  // Mirror into VendorDocument vault
  await VendorDocument.create({
    vendorId,
    title: doc.name,
    documentType: doc.category,
    documentNumber: doc.documentNumber || '',
    documentUrl,
    expiryDate: doc.expiresAt || undefined,
    status: 'PENDING',
    type: 'Vault'
  });

  await publishVendorNotification({
    vendorId,
    type: 'document_verification',
    title: 'Compliance document uploaded',
    message: `${doc.name} uploaded and awaiting verification.`,
    module: 'compliance',
    priority: 'normal',
    relatedId: doc._id,
    relatedType: 'compliance',
    actionUrl: 'compliance',
    category: 'account'
  });

  return doc;
}

module.exports = {
  syncVendorCompliance,
  processComplianceExpiries,
  attachComplianceDocument,
  inferCategory,
  slugify
};
