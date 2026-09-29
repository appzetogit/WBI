let XLSX;
try {
  XLSX = require('xlsx');
} catch (err) {
  console.error('[Dependency Warning]: xlsx module is missing. Excel features will not work until installed.');
}
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');

const B2BBatch = require('../models/B2BBatch');
const B2BBatchErrors = require('../models/B2BBatchErrors');
const B2BBulkUploadRow = require('../models/B2BBulkUploadRow');
const B2BJob = require('../models/B2BJob');
const B2BCompany = require('../models/B2BCompany');
const B2BWalletTransaction = require('../models/B2BWalletTransaction');
const walletLedger = require('./b2bWalletLedger.service');
const JobHistory = require('../models/JobHistory');
const UploadReport = require('../models/UploadReport');
const B2BDeductionRule = require('../models/B2BDeductionRule');

const { geocodeAddress } = require('./locationService');
const { pickCategoryFromConfigs } = require('../utils/createOpportunityFromEnquiry');

// Socket emission helper
const emitSocket = (app, room, event, data) => {
  try {
    const { getIO } = require('../sockets');
    const io = getIO();
    if (io) {
      io.to(room).emit(event, data);
      console.log(`[Socket] Emitted '${event}' to room '${room}'`);
    }
  } catch (err) {
    console.error(`[Socket Error] Could not emit event '${event}':`, err.message);
  }
};

const SUPPORTED_UPLOAD_EXTENSIONS = ['.xlsx', '.xls', '.csv'];

/**
 * Column header aliases. Keys are the internal field names; values are accepted
 * spreadsheet headers after normalisation (lowercased, punctuation stripped,
 * whitespace collapsed).
 */
/**
 * The official upload template. Required columns must be present and filled;
 * optional columns are used when present. Anything else in the file is
 * reported back as an unknown column rather than silently ignored.
 */
const TEMPLATE_COLUMNS = {
  required: [
    'customerName', 'phone', 'address', 'city', 'state', 'pincode',
    'service', 'serviceKey', 'requiredSkill'
  ],
  optional: [
    'customerRef', 'email', 'latitude', 'longitude', 'subService', 'assetId',
    'assetModel', 'serialNumber', 'priority', 'preferredDate', 'preferredTime',
    'description', 'specialInstructions'
  ]
};

/** Header shown in the downloadable template, per internal field. */
const TEMPLATE_HEADERS = {
  customerName: 'Customer Name',
  phone: 'Contact Number',
  address: 'Service Address',
  city: 'City',
  state: 'State',
  pincode: 'Pincode',
  service: 'Service Type',
  serviceKey: 'Service Key',
  requiredSkill: 'Required Skill',
  customerRef: 'Customer ID',
  email: 'Email',
  latitude: 'Latitude',
  longitude: 'Longitude',
  subService: 'Sub Service',
  assetId: 'Asset ID',
  assetModel: 'Asset Model',
  serialNumber: 'Serial Number',
  priority: 'Priority',
  preferredDate: 'Preferred Date',
  preferredTime: 'Preferred Time',
  description: 'Description',
  specialInstructions: 'Special Instructions'
};

/** What each template column means, shown in the template's Column Guide. */
const TEMPLATE_NOTES = {
  customerName: 'Name of the customer or site contact.',
  phone: '10-digit mobile number, no country code.',
  address: 'Full service address including landmark.',
  city: 'City the job is in.',
  state: 'State the job is in.',
  pincode: '6-digit Indian postal code.',
  service: 'Service name as it appears in your service list.',
  serviceKey: 'Service code used for routing. Leave blank to resolve it from the service name.',
  requiredSkill: 'Skill the engineer must hold for this job.',
  customerRef: 'Your own customer or account reference.',
  email: 'Customer email, if you want them notified.',
  latitude: 'Optional. Provide with Longitude to skip geocoding.',
  longitude: 'Optional. Provide with Latitude to skip geocoding.',
  subService: 'More specific service, when it matters.',
  assetId: 'Asset or equipment identifier at the site.',
  assetModel: 'Asset model number.',
  serialNumber: 'Asset serial number.',
  priority: 'Low, Medium or High. Defaults to Medium.',
  preferredDate: 'DD-MM-YYYY. Defaults to three days out.',
  preferredTime: 'HH:MM, a range like 10:00-13:00, or Anytime.',
  description: 'What is wrong, in the customer\'s words.',
  specialInstructions: 'Site access, safety or reporting instructions.'
};

const HEADER_ALIASES = {
  customerName: ['customer name', 'customer', 'client name', 'client', 'name', 'contact person', 'site contact'],
  phone: ['phone', 'phone number', 'phone no', 'mobile', 'mobile number', 'mobile no', 'contact', 'contact number', 'contact no'],
  email: ['email', 'email address', 'email id', 'mail'],
  address: ['address', 'street', 'location', 'address line 1', 'address line', 'site address', 'full address'],
  city: ['city', 'town', 'city name'],
  state: ['state', 'region'],
  pincode: ['pincode', 'pin code', 'pin', 'zipcode', 'zip code', 'zip', 'postal code'],
  latitude: ['latitude', 'lat'],
  longitude: ['longitude', 'lng', 'lon', 'long'],
  service: ['service', 'service name', 'category', 'service category', 'category name'],
  subService: ['sub service', 'subservice', 'sub category', 'subcategory', 'service package', 'sub service name'],
  priority: ['priority', 'urgency'],
  preferredDate: ['preferred date', 'schedule date', 'date', 'service date', 'visit date'],
  preferredTime: ['preferred time', 'schedule time', 'time', 'time slot', 'preferred slot', 'slot'],
  serviceKey: ['service key', 'servicekey', 'service code', 'category code', 'service category code'],
  requiredSkill: ['required skill', 'skill', 'skill required', 'engineer skill', 'skill needed'],
  customerRef: ['customer id', 'customer code', 'customer ref', 'client id', 'account id', 'reference'],
  assetId: ['asset id', 'assetid', 'asset code', 'equipment id', 'machine id'],
  assetModel: ['asset model', 'model', 'model number', 'equipment model'],
  serialNumber: ['serial number', 'serial no', 'serial', 'sr no', 'sr number'],
  description: ['description', 'issue', 'issue description', 'problem', 'complaint', 'remarks'],
  specialInstructions: ['special instructions', 'instructions', 'notes', 'site notes', 'special note']
};

// Collapse a spreadsheet header into a comparable token: lowercase, punctuation
// and separators to single spaces, trimmed. "Customer_Name " -> "customer name".
const normalizeHeader = (header) =>
  String(header)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

// The template's own headers are always accepted for their field.
for (const [field, label] of Object.entries(TEMPLATE_HEADERS)) {
  const token = normalizeHeader(label);
  if (!HEADER_ALIASES[field]) HEADER_ALIASES[field] = [];
  if (!HEADER_ALIASES[field].includes(token)) HEADER_ALIASES[field].unshift(token);
}

/**
 * Smart column header mapping
 * Maps various Excel header titles to standardized internal fields.
 */
const mapHeaders = (rowObject) => {
  const normalizedRow = {};
  const rowKeys = Object.keys(rowObject || {});

  for (const [targetField, aliases] of Object.entries(HEADER_ALIASES)) {
    const matchedKey = rowKeys.find(key => aliases.includes(normalizeHeader(key)));
    const value = matchedKey !== undefined ? rowObject[matchedKey] : null;
    // Treat blank/whitespace-only cells as missing so validation catches them
    // instead of Mongoose rejecting a trimmed-empty required string later.
    normalizedRow[targetField] =
      typeof value === 'string' && value.trim() === '' ? null : value;
  }

  return normalizedRow;
};

/**
 * Columns in the file that the template does not define. They are reported so
 * an uploader learns their data was not read, instead of losing it silently.
 */
const detectUnknownColumns = (rawRows = []) => {
  const known = new Set();
  Object.values(HEADER_ALIASES).forEach((aliases) => aliases.forEach((a) => known.add(a)));

  const seen = new Map();
  for (const row of rawRows.slice(0, 50)) {
    for (const key of Object.keys(row || {})) {
      const norm = normalizeHeader(key);
      if (!norm || known.has(norm)) continue;
      // __EMPTY* are the placeholder names the parser gives unlabelled columns.
      if (/^empty/.test(norm)) continue;
      if (!seen.has(norm)) seen.set(norm, String(key).trim());
    }
  }
  return [...seen.values()];
};

/**
 * Single source of truth for turning an uploaded file into raw row objects.
 * Both the validation pass and the job-creation pass must use this so the two
 * phases can never disagree about what is in the file.
 */
const parseRowsFromFile = (filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  if (!SUPPORTED_UPLOAD_EXTENSIONS.includes(ext)) {
    throw new Error('Unsupported file type. Please upload an .xlsx, .xls or .csv file.');
  }
  if (!XLSX) {
    throw new Error('Spreadsheet engine unavailable. Please contact support.');
  }

  const workbook = XLSX.readFile(filePath);
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new Error('The uploaded file has no readable sheet.');
  }
  const sheet = workbook.Sheets[firstSheetName];
  return XLSX.utils.sheet_to_json(sheet, { defval: null });
};

const PRIORITY_ALIASES = {
  low: 'Low', normal: 'Medium', medium: 'Medium', standard: 'Medium',
  high: 'High', urgent: 'High', critical: 'High', emergency: 'High', p1: 'High', p2: 'Medium', p3: 'Low'
};

// B2BJob.priority is an enum — an unrecognised sheet value would otherwise blow
// up the whole batch with a Mongoose ValidationError.
const normalizePriority = (value) => {
  if (!value) return 'Medium';
  return PRIORITY_ALIASES[String(value).toLowerCase().trim()] || 'Medium';
};

const parsePreferredDate = (value) => {
  const fallback = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
  if (value === null || value === undefined || value === '') return fallback;

  if (value instanceof Date) {
    return isNaN(value.getTime()) ? fallback : value;
  }

  if (typeof value === 'number') {
    const serial = new Date((value - 25569) * 86400 * 1000);
    return isNaN(serial.getTime()) ? fallback : serial;
  }

  const dateStr = String(value).trim();
  let parsed = null;

  // DD/MM/YYYY or DD-MM-YYYY (most common in Indian B2B sheets)
  const indianFmt = dateStr.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (indianFmt) {
    const [, dd, mm, yyyy] = indianFmt;
    parsed = new Date(`${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`);
  }

  if (!parsed || isNaN(parsed.getTime())) {
    const isoSlash = dateStr.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
    if (isoSlash) {
      const [, yyyy, mm, dd] = isoSlash;
      parsed = new Date(`${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`);
    }
  }

  if (!parsed || isNaN(parsed.getTime())) {
    parsed = new Date(dateStr);
  }

  return !parsed || isNaN(parsed.getTime()) ? fallback : parsed;
};

/**
 * Field-level row validation. Returns { errors: [], row } where each error is a
 * human-readable "<Field>: <reason>" string safe to show to the client.
 */
/** Column label shown to the uploader for an internal field name. */
const labelFor = (field) => TEMPLATE_HEADERS[field] || field;

/** One validation problem, in the shape the error report prints. */
const issue = (field, value, error, suggestedFix = '') => ({
  field: labelFor(field),
  value: value === null || value === undefined ? '' : String(value),
  error,
  suggestedFix
});

/** The single-line form kept for the legacy error list. */
const issueText = (i) => `${i.field}: ${i.error}`;

/**
 * Validate one mapped row. Returns structured issues (row, field, value,
 * error, suggested fix) so the downloadable report tells the uploader exactly
 * what to change.
 */
const validateMappedRow = (mapped, serviceCatalog = null) => {
  const issues = [];

  if (!mapped.customerName) {
    issues.push(issue('customerName', mapped.customerName, 'required', 'Enter the customer or site contact name'));
  }

  if (!mapped.phone) {
    issues.push(issue('phone', mapped.phone, 'required', 'Enter a 10-digit mobile number'));
  } else if (String(mapped.phone).replace(/[^0-9]/g, '').length !== 10) {
    issues.push(issue('phone', mapped.phone, 'must be a 10-digit mobile number', 'Remove country codes and spaces, e.g. 9876543210'));
  }

  if (mapped.email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(String(mapped.email).trim())) {
      issues.push(issue('email', mapped.email, 'invalid format', 'Use name@example.com, or leave it blank'));
    }
  }

  if (!mapped.address) {
    issues.push(issue('address', mapped.address, 'required', 'Enter the full service address'));
  }

  if (!mapped.city) {
    issues.push(issue('city', mapped.city, 'required', 'Enter the city the job is in'));
  }

  if (mapped.pincode !== null && mapped.pincode !== undefined && String(mapped.pincode).trim() !== '') {
    if (!/^[1-9][0-9]{5}$/.test(String(mapped.pincode).replace(/\s+/g, ''))) {
      issues.push(issue('pincode', mapped.pincode, 'must be a valid 6-digit Indian pincode', 'Use the 6-digit postal code, e.g. 452001'));
    }
  }

  if (!mapped.service) {
    issues.push(issue('service', mapped.service, 'required', 'Enter one of the services your contract covers'));
  } else if (serviceCatalog?.length) {
    // A service with no catalog category can never be routed to a vendor, and
    // the wallet is charged at job creation — reject it here instead.
    const text = [mapped.service, mapped.subService].filter(Boolean).join(' ');
    if (!pickCategoryFromConfigs(text, serviceCatalog)) {
      issues.push(issue(
        'service',
        mapped.service,
        `"${mapped.service}" is not an offered service category`,
        serviceCatalog.slice(0, 3).map((c) => c.name || c.categoryCode).filter(Boolean).join(', ')
          ? `Try one of: ${serviceCatalog.slice(0, 3).map((c) => c.name || c.categoryCode).filter(Boolean).join(', ')}`
          : 'Use a service name from your service list'
      ));
    }
  }

  // A service key in the file must be one the catalog actually knows; routing
  // never happens on a free-text service name.
  if (mapped.serviceKey && serviceCatalog?.length) {
    const key = String(mapped.serviceKey).toUpperCase().trim();
    if (!serviceCatalog.some((c) => String(c.categoryCode || '').toUpperCase() === key)) {
      issues.push(issue('serviceKey', mapped.serviceKey, `"${key}" is not a known service key`, 'Leave it blank to resolve the key from the service name'));
    }
  }

  if (mapped.preferredDate !== null && mapped.preferredDate !== undefined && String(mapped.preferredDate).trim() !== '') {
    const parsed = parsePreferredDate(mapped.preferredDate);
    const raw = String(mapped.preferredDate).trim();
    // parsePreferredDate falls back to +3 days; catch text it could not read.
    if (!(mapped.preferredDate instanceof Date) && typeof mapped.preferredDate !== 'number'
        && Number.isNaN(new Date(raw).getTime()) && !/^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}$/.test(raw)) {
      issues.push(issue('preferredDate', raw, 'could not be read as a date', 'Use DD-MM-YYYY, e.g. 24-09-2026'));
    } else if (parsed && parsed < new Date(Date.now() - 24 * 60 * 60 * 1000)) {
      issues.push(issue('preferredDate', raw, 'is in the past', 'Use today or a later date'));
    }
  }

  if (mapped.preferredTime && String(mapped.preferredTime).trim()) {
    const t = String(mapped.preferredTime).trim();
    const readable = /^(anytime|morning|afternoon|evening)$/i.test(t)
      || /^\d{1,2}(:\d{2})?\s*(am|pm)?(\s*-\s*\d{1,2}(:\d{2})?\s*(am|pm)?)?$/i.test(t);
    if (!readable) {
      issues.push(issue('preferredTime', t, 'could not be read as a time', 'Use HH:MM, a range like 10:00-13:00, or Anytime'));
    }
  }

  return issues;
};

const CITY_STATE_MAP = {
  'mumbai': 'Maharashtra', 'pune': 'Maharashtra', 'thane': 'Maharashtra',
  'navi mumbai': 'Maharashtra', 'nashik': 'Maharashtra', 'nagpur': 'Maharashtra',
  'delhi': 'Delhi', 'new delhi': 'Delhi', 'gurgaon': 'Haryana', 'noida': 'Uttar Pradesh',
  'bangalore': 'Karnataka', 'bengaluru': 'Karnataka', 'mysore': 'Karnataka',
  'hyderabad': 'Telangana', 'chennai': 'Tamil Nadu', 'kolkata': 'West Bengal',
  'ahmedabad': 'Gujarat', 'surat': 'Gujarat', 'jaipur': 'Rajasthan',
  'lucknow': 'Uttar Pradesh', 'kanpur': 'Uttar Pradesh', 'indore': 'Madhya Pradesh',
  'bhopal': 'Madhya Pradesh', 'patna': 'Bihar', 'chandigarh': 'Chandigarh',
  'kochi': 'Kerala', 'coimbatore': 'Tamil Nadu', 'visakhapatnam': 'Andhra Pradesh'
};

/**
 * Build the B2BJob document for a validated row.
 * jobId is deterministic (batch + row number) so re-running creation for the
 * same batch upserts rather than duplicating jobs.
 */
const buildJobDocument = ({ mapped, batch, rowNumber, rowPricing = null, reservation = null, sla = null }) => {
  const cleanCity = String(mapped.city || '').toLowerCase().trim();
  const charge = rowPricing?.totalAmount || batch.perJobCharge;

  return {
    companyId: batch.companyId,
    batchId: batch._id,
    source: 'B2B',
    createdBy: { actorId: batch.createdBy || batch.companyId, role: 'company' },
    serviceKey: mapped.serviceKey || null,
    subServiceKey: mapped.subServiceKey || null,
    serviceConfigId: mapped.serviceConfigId || null,
    slaDueAt: mapped.slaDueAt || null,
    routingMode: 'auto',
    // Rows reaching creation have passed validation; routing moves them on.
    lifecycleStatus: 'VALIDATED',
    lifecycleUpdatedAt: new Date(),
    jobId: `JOB-B2B-${batch.batchId}-R${rowNumber}`,
    customerName: String(mapped.customerName).trim(),
    phone: String(mapped.phone).replace(/[^0-9]/g, ''),
    email: mapped.email ? String(mapped.email).trim() : '',
    address: String(mapped.address).trim(),
    city: String(mapped.city).trim(),
    state: mapped.state ? String(mapped.state).trim() : (CITY_STATE_MAP[cleanCity] || 'India'),
    pincode: mapped.pincode ? String(mapped.pincode).replace(/[^0-9]/g, '') : '',
    coordinates: {
      type: 'Point',
      coordinates: [mapped.longitude, mapped.latitude] // longitude first in GeoJSON
    },
    service: String(mapped.service).trim(),
    subService: mapped.subService ? String(mapped.subService).trim() : '',
    priority: normalizePriority(mapped.priority),
    preferredDate: mapped.preferredDate,
    preferredTime: mapped.preferredTime ? String(mapped.preferredTime).trim() : 'Anytime',
    // A job only exists once its money is held, so it is never "unpaid".
    status: 'pending',
    assignmentType: 'unassigned',
    charge,
    paymentStatus: 'escrow_locked',
    payoutStatus: 'none',

    // ── B2B intake detail carried from the upload ──────────────────
    customerRef: mapped.customerRef ? String(mapped.customerRef).trim() : '',
    description: mapped.description ? String(mapped.description).trim() : '',
    specialInstructions: mapped.specialInstructions ? String(mapped.specialInstructions).trim() : '',
    requiredSkill: mapped.requiredSkill ? String(mapped.requiredSkill).trim() : '',
    asset: {
      assetId: mapped.assetId ? String(mapped.assetId).trim() : '',
      model: mapped.assetModel ? String(mapped.assetModel).trim() : '',
      serialNumber: mapped.serialNumber ? String(mapped.serialNumber).trim() : ''
    },

    // ── SLA clocks, from the contract or the company's SLA profile ─
    sla: sla ? { ...sla } : undefined,

    // ── What paid for it ───────────────────────────────────────────
    paymentMode: batch.paymentMode || 'REAL',
    walletStatus: 'reserved',
    walletReservationId: batch.reservationId || null,
    paymentReference: reservation?._id || null,
    pricing: rowPricing
      ? { ...rowPricing, pricedAt: new Date() }
      : { totalAmount: charge, currency: 'INR', source: 'LEGACY', pricedAt: new Date() },

    date: new Date()
  };
};

/**
 * Final gate before writing: run the row through Mongoose validation in-memory.
 * A failure here becomes a per-row error report entry rather than a batch crash.
 */
const collectSchemaErrors = (jobDoc) => {
  const validationError = new B2BJob(jobDoc).validateSync();
  if (!validationError) return [];
  return Object.values(validationError.errors || {}).map((err) => {
    const field = err.path || 'Field';
    return `${field}: ${err.kind === 'required' ? 'required' : 'invalid value'}`;
  });
};

/**
 * Translate any internal exception into a message safe for the client UI.
 * Mongoose/driver internals must never reach a toast.
 */
const toUserFacingFailure = (error) => {
  const raw = error && error.message ? String(error.message) : '';

  if (error && (error.name === 'ValidationError' || error.name === 'ValidatorError')) {
    return 'Some rows had missing or invalid required fields. Download the error report for row-level details.';
  }
  if (error && (error.name === 'MongoBulkWriteError' || error.code === 11000)) {
    return 'Some jobs in this batch already exist. Download the error report for details.';
  }
  if (/^[\w .,'()\-/&:₹]+$/.test(raw) && raw.length <= 200 && !/B2BJob|mongo|schema|ObjectId/i.test(raw)) {
    return raw;
  }
  return 'We could not process this file. Please download the error report or re-upload using the sample template.';
};

/**
 * Persist per-row failures, replacing any previous report for the batch.
 */
const saveBatchErrors = async (batchId, errorChunks) => {
  await B2BBatchErrors.deleteMany({ batchId });
  if (errorChunks.length > 0) {
    await B2BBatchErrors.insertMany(errorChunks);
  }
};

/** Active service catalog with the fields routing needs (key, sub-services, SLA). */
const loadRoutingCatalog = () => {
  const ServiceConfig = require('../models/ServiceConfig');
  return ServiceConfig.find({ isActive: true, status: { $ne: 'archived' } })
    .select('_id categoryCode categoryName matchAliases subCategories slaRules')
    .lean();
};

/**
 * The admin's company controls: a company restricted to certain services or
 * locations may only raise jobs inside them. Empty lists mean unrestricted.
 * 'zone' entries cannot be judged from a row, so they never block on their own.
 */
const companyAccessIssues = (mapped, company) => {
  const issues = [];
  if (!company) return issues;
  const allowedServices = (company.allowedServices || []).map((s) => String(s).toUpperCase().trim()).filter(Boolean);
  if (allowedServices.length && mapped.serviceKey && !allowedServices.includes(String(mapped.serviceKey).toUpperCase())) {
    issues.push(issue('service', mapped.service, `"${mapped.service}" is not enabled for your company`, 'Ask your account manager to enable this service'));
  }
  const norm = (v) => String(v || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const judged = (company.allowedLocations || []).filter((l) => l && l.value && ['city', 'pincode', 'state'].includes(l.type || 'city'));
  if (judged.length) {
    const inside = judged.some((l) => {
      const type = l.type || 'city';
      if (type === 'pincode') return String(mapped.pincode || '').replace(/[^0-9]/g, '') === String(l.value).replace(/[^0-9]/g, '');
      return norm(type === 'state' ? mapped.state : mapped.city) === norm(l.value);
    });
    if (!inside) {
      issues.push(issue('city', mapped.city, 'this location is outside the areas enabled for your company', `Allowed: ${judged.map((l) => l.value).join(', ')}`));
    }
  }
  return issues;
};

/**
 * Persist what routing needs on the row: the catalog service key, sub-service
 * key, config id and SLA due date. Resolved once here, never inferred later.
 */
const enrichRowForRouting = (mapped, catalog = []) => {
  const text = [mapped.service, mapped.subService].filter(Boolean).join(' ');
  const serviceKey = text ? pickCategoryFromConfigs(text, catalog) : null;
  const cfg = serviceKey ? catalog.find((c) => c.categoryCode === serviceKey) : null;
  const subName = String(mapped.subService || '').trim().toLowerCase();
  const sub = subName && cfg
    ? (cfg.subCategories || []).find(
      (s) => String(s.subCatName || '').toLowerCase() === subName || String(s.subCatCode || '').toLowerCase() === subName
    )
    : null;
  const { computeSlaDueAt } = require('./jobRouting.service');
  mapped.serviceKey = serviceKey;
  mapped.serviceConfigId = cfg?._id || null;
  mapped.subServiceKey = sub?.subCatCode || null;
  mapped.slaDueAt = computeSlaDueAt(cfg, { priority: mapped.priority });
  if (mapped.pincode) mapped.pincode = String(mapped.pincode).replace(/[^0-9]/g, '');
  return mapped;
};

/**
 * Geocoding Sequence Chain
 */
const geocodeRow = async (row) => {
  let coords = null;
  const address = row.address ? String(row.address).trim() : '';
  const city = row.city ? String(row.city).trim() : '';
  const pincode = row.pincode ? String(row.pincode).trim() : '';

  // 1. Try geocoding full address
  if (address) {
    coords = await geocodeAddress(address);
  }
  
  // 2. Try geocoding address + city
  if (!coords && address && city) {
    coords = await geocodeAddress(`${address}, ${city}`);
  }

  // 3. Try geocoding city + pincode
  if (!coords && city && pincode) {
    coords = await geocodeAddress(`${city} ${pincode}`);
  }

  // 4. Try geocoding pincode only
  if (!coords && pincode) {
    coords = await geocodeAddress(pincode);
  }

  // 5. Logical City-Center Coordinate Fallbacks (no external API hit)
  if (!coords && city) {
    const cityCoords = {
      'mumbai': { lat: 19.0760, lng: 72.8777 },
      'pune': { lat: 18.5204, lng: 73.8567 },
      'thane': { lat: 19.2183, lng: 72.9781 },
      'navi mumbai': { lat: 19.0330, lng: 73.0297 },
      'indore': { lat: 22.7196, lng: 75.8577 },
      'delhi': { lat: 28.7041, lng: 77.1025 },
      'bangalore': { lat: 12.9716, lng: 77.5946 },
    };
    const cleanCity = city.toLowerCase().trim();
    if (cityCoords[cleanCity]) {
      coords = cityCoords[cleanCity];
    }
  }

  // No resolvable location: return null so the row is reported invalid.
  // (Previously every unresolvable row was silently placed in Mumbai and
  // routed to Mumbai engineers.)
  return coords || null;
};

/**
 * Validate B2B Batch (BullMQ Task)
 */
const processValidation = async (batchId, app) => {
  const batch = await B2BBatch.findById(batchId);
  if (!batch) {
    console.error(`[Validation] Batch ${batchId} not found in database`);
    return;
  }

  console.log(`[Validation] Starting processing for Batch: ${batchId}`);
  batch.status = 'validating';
  await batch.save();

  emitSocket(app, `b2b:${batch.companyId.toString()}`, 'b2b:validationStarted', { batchId });
  emitSocket(app, `batch:${batchId}`, 'b2b:validationStarted', { batchId });

  try {
    // 1. Fetch file path
    const filePath = path.resolve(batch.fileUrl);
    if (!fs.existsSync(filePath)) {
      throw new Error('The uploaded file is no longer available. Please upload it again.');
    }

    // 2. Parse the spreadsheet (same parser the creation pass uses)
    const rawRows = parseRowsFromFile(filePath);

    const totalRows = rawRows.length;
    const { getB2BConfig } = require('./b2bPlatformConfig.service');
    const config = await getB2BConfig();
    const maxRows = config.bulkUpload?.maxRows || 1000;

    if (totalRows === 0) {
      throw new Error('The uploaded file is empty or contains no parseable job rows');
    }
    if (totalRows > maxRows) {
      throw new Error(
        `This file has ${totalRows} rows. An upload may contain at most ${maxRows} rows. Split it and upload again.`
      );
    }

    // Columns the template does not define are reported, never silently dropped.
    const unknownColumns = detectUnknownColumns(rawRows);
    if (unknownColumns.length && config.bulkUpload?.rejectUnknownColumns) {
      throw new Error(
        `This file has columns the template does not define - ${unknownColumns.join(', ')}. Remove them and upload again.`
      );
    }

    batch.totalRows = totalRows;
    batch.unknownColumns = unknownColumns;
    batch.processingStatus = 'VALIDATING';
    await batch.save();

    // 3. Set up batching variables
    const serviceCatalog = await loadRoutingCatalog();
    const accessCompany = await B2BCompany.findById(batch.companyId).select('allowedServices allowedLocations').lean();
    const VendorServiceCoverage = require('../models/VendorServiceCoverage');
    const coverageCache = new Map();
    const hasCoverage = async (row) => {
      const pin = VendorServiceCoverage.normalizePincode(row.pincode);
      const city = VendorServiceCoverage.normalizeCity(row.city);
      const key = `${row.serviceKey}|${pin}|${city}`;
      if (!coverageCache.has(key)) {
        const or = [];
        if (pin.length === 6) or.push({ coveragePincodes: pin });
        if (city) or.push({ coverageCities: city });
        coverageCache.set(
          key,
          row.serviceKey && or.length
            ? Boolean(await VendorServiceCoverage.exists({ serviceKey: row.serviceKey, active: true, $or: or }))
            : false
        );
      }
      return coverageCache.get(key);
    };
    const routingPreview = { coveredRows: 0, uncoveredRows: 0, uncoveredSamples: [] };
    let validRows = 0;
    let invalidRows = 0;
    let duplicates = 0;

    const parsedRows = [];
    /** Valid rows only — input to the pricing engine (step 8). */
    const validParsedRows = [];
    const errorChunks = [];

    // Track duplicates inside this file (Phone + Address combination),
    // remembering the row each signature first appeared on.
    const rowSignatures = new Map();
    /** One persisted B2BBulkUploadRow per file row, valid or not. */
    const uploadRows = [];

    // 5. Parse and Validate Chunks of rows
    for (let index = 0; index < totalRows; index++) {
      const rawRow = rawRows[index];
      const rowNum = index + 1;

      const mapped = mapHeaders(rawRow);
      mapped.__rowNumber = rowNum;
      const issues = validateMappedRow(mapped, serviceCatalog);
      let duplicateOf = null;

      // Date is optional — soft-normalize so creation never hits NaN Date
      mapped.preferredDate = parsePreferredDate(mapped.preferredDate);
      mapped.priority = normalizePriority(mapped.priority);

      // Duplicate Checks (Inside File)
      const cleanPhone = mapped.phone ? String(mapped.phone).replace(/[^0-9]/g, '') : '';
      const cleanAddr = mapped.address ? String(mapped.address).toLowerCase().trim() : '';
      const signature = `${cleanPhone}_${cleanAddr}`;

      if (cleanPhone && cleanAddr) {
        if (rowSignatures.has(signature)) {
          duplicates++;
          duplicateOf = `row ${rowSignatures.get(signature)}`;
          issues.push(issue(
            'phone',
            mapped.phone,
            `duplicate of row ${rowSignatures.get(signature)} in this file (same phone and address)`,
            'Remove one of the two rows'
          ));
        } else {
          rowSignatures.set(signature, rowNum);
        }

        // Duplicate check against existing active jobs (Database)
        const dbDuplicate = await B2BJob.findOne({
          phone: cleanPhone,
          address: { $regex: new RegExp(cleanAddr.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'i') },
          status: { $in: ['pending', 'searching_engineer', 'assigned', 'in_progress'] }
        }).select('_id jobId').lean();
        if (dbDuplicate) {
          duplicates++;
          duplicateOf = dbDuplicate.jobId || String(dbDuplicate._id);
          issues.push(issue(
            'address',
            mapped.address,
            `an active job (${dbDuplicate.jobId || 'existing'}) already covers this customer and address`,
            'Remove this row, or reference the existing job'
          ));
        }
      }

      // Geocoding coordinates resolution (Geocode chain)
      let finalLat = parseFloat(mapped.latitude);
      let finalLng = parseFloat(mapped.longitude);

      if (isNaN(finalLat) || isNaN(finalLng) || finalLat === 0 || finalLng === 0) {
        const coords = await geocodeRow(mapped);
        if (coords) {
          finalLat = coords.lat;
          finalLng = coords.lng;
        } else {
          issues.push(issue(
            'address',
            mapped.address,
            'address, city and pincode could not be resolved to a location',
            'Check the address and pincode, or add Latitude and Longitude columns'
          ));
        }
      }

      mapped.latitude = finalLat;
      mapped.longitude = finalLng;
      enrichRowForRouting(mapped, serviceCatalog);
      issues.push(...companyAccessIssues(mapped, accessCompany));

      // Final schema gate — never let a row that would fail Mongoose
      // "validate" count as valid just because field presence checks passed.
      if (issues.length === 0) {
        const provisionalDoc = buildJobDocument({
          mapped,
          batch,
          rowNumber: rowNum,
          rowPricing: null
        });
        const schemaErrors = collectSchemaErrors(provisionalDoc);
        for (const text of schemaErrors) {
          const [field, ...rest] = String(text).split(':');
          issues.push(issue(field.trim(), '', rest.join(':').trim() || text, 'Correct this column and upload again'));
        }
      }

      const errors = issues.map(issueText);
      uploadRows.push({
        batchId: batch._id,
        uploadId: batch.batchId,
        companyId: batch.companyId,
        rowNumber: rowNum,
        raw: rawRow,
        status: issues.length ? (duplicateOf ? 'DUPLICATE' : 'INVALID') : 'VALID',
        validationErrors: issues,
        duplicateOf,
        normalized: {
          customerName: mapped.customerName || '',
          contactNumber: mapped.phone ? String(mapped.phone) : '',
          serviceAddress: mapped.address || '',
          city: mapped.city || '',
          state: mapped.state || '',
          pincode: mapped.pincode ? String(mapped.pincode) : '',
          serviceType: mapped.service || '',
          serviceKey: mapped.serviceKey || '',
          subServiceKey: mapped.subServiceKey || '',
          requiredSkill: mapped.requiredSkill || '',
          customerRef: mapped.customerRef || '',
          assetId: mapped.assetId || '',
          assetModel: mapped.assetModel || '',
          serialNumber: mapped.serialNumber || '',
          priority: mapped.priority || 'Medium',
          preferredDate: mapped.preferredDate || null,
          preferredTime: mapped.preferredTime || 'Anytime',
          description: mapped.description || '',
          specialInstructions: mapped.specialInstructions || '',
          coordinates: { lat: mapped.latitude ?? null, lng: mapped.longitude ?? null }
        }
      });

      if (errors.length > 0) {
        invalidRows++;
        errorChunks.push({
          batchId: batch._id,
          rowNumber: rowNum,
          rowData: mapped,
          errorList: errors
        });
      } else {
        validRows++;
        // Only billable rows feed the pricing engine.
        validParsedRows.push(mapped);
        if (await hasCoverage(mapped)) {
          routingPreview.coveredRows++;
        } else {
          routingPreview.uncoveredRows++;
          if (routingPreview.uncoveredSamples.length < 10) {
            routingPreview.uncoveredSamples.push(
              `Row ${rowNum}: no vendor covers ${mapped.serviceKey || mapped.service} in ${mapped.pincode ? `pincode ${mapped.pincode}` : mapped.city}`
            );
          }
        }
      }

      parsedRows.push(mapped);

      // 6. Emit real-time progress update every 100 rows
      if (rowNum % 100 === 0 || rowNum === totalRows) {
        batch.processedRows = rowNum;
        batch.validRows = validRows;
        batch.invalidRows = invalidRows;
        batch.duplicates = duplicates;
        await batch.save();

        const progressPercent = Math.round((rowNum / totalRows) * 100);
        emitSocket(app, `b2b:${batch.companyId.toString()}`, 'b2b:validationProgress', {
          batchId,
          progress: progressPercent,
          total: totalRows,
          processed: rowNum,
          valid: validRows,
          invalid: invalidRows,
          duplicates
        });
        emitSocket(app, `batch:${batchId}`, 'b2b:validationProgress', {
          batchId,
          progress: progressPercent,
          total: totalRows,
          processed: rowNum,
          valid: validRows,
          invalid: invalidRows,
          duplicates
        });
      }
    }

    // 7. Insert errors into DB in one bulk operation (Relational)
    await saveBatchErrors(batch._id, errorChunks);

    // 7b. Persist every parsed row. Re-validating a batch replaces them.
    await B2BBulkUploadRow.deleteMany({ batchId: batch._id });
    if (uploadRows.length) {
      await B2BBulkUploadRow.insertMany(uploadRows, { ordered: false });
    }

    // 8. Cost calculation via the configuration-driven pricing engine.
    //    Falls back to the company's B2BDeductionRule when no B2BPricingRule
    //    matches, so pricing is unchanged until an admin configures rules.
    let ratePerJob;
    let estimatedCost;
    let pricingBreakdown = null;

    try {
      const { calculateBatchPricing } = require('./b2bPricingEngine.service');
      const { isAfterHours } = require('./b2bPlatformConfig.service');
      // After-hours is decided from the requested slot against the configured
      // business hours — never guessed in the frontend.
      const pricedRows = [];
      for (const row of validParsedRows) {
        let afterHours = false;
        if (row.preferredDate) {
          const at = new Date(row.preferredDate);
          const time = String(row.preferredTime || '').match(/^(\d{1,2}):(\d{2})/);
          if (time) at.setHours(Number(time[1]), Number(time[2]), 0, 0);
          if (!Number.isNaN(at.getTime())) afterHours = await isAfterHours(at);
        }
        pricedRows.push({ ...row, afterHours });
      }
      const priced = await calculateBatchPricing({
        companyId: batch.companyId,
        jobs: pricedRows
      });
      ratePerJob = priced.perJobCharge;
      estimatedCost = priced.estimatedCost;

      // Stamp each valid row with the line price it was quoted.
      const lineFor = (row) => priced.lines.find((l) =>
        String(l.serviceKey || '') === String(row.serviceKey || '')
        && String(l.priority || '') === String(row.priority || '')
        && String(l.city || '') === String(row.city || '')
        && String(l.pincode || '') === String(row.pincode || ''));
      const rowPriceOps = [];
      for (let i = 0; i < validParsedRows.length; i++) {
        const row = pricedRows[i];
        const line = lineFor(row);
        if (!line) continue;
        const rowNumber = row.__rowNumber;
        if (!rowNumber) continue;
        rowPriceOps.push({
          updateOne: {
            filter: { batchId: batch._id, rowNumber },
            update: {
              $set: {
                status: 'PRICED',
                pricing: {
                  baseAmount: line.perJob.baseAmount,
                  geographicSurcharge: line.perJob.geographicCharge,
                  priorityCharge: line.perJob.priorityCharge || 0,
                  slaCharge: line.perJob.slaCharge || 0,
                  emergencyCharge: line.perJob.emergencyCharge || 0,
                  afterHoursCharge: line.perJob.afterHoursCharge || 0,
                  additionalCharges: line.perJob.additionalChargesTotal || 0,
                  discount: line.perJob.discountAmount || 0,
                  taxPercent: line.perJob.taxPercent || 0,
                  taxAmount: line.perJob.taxAmount || 0,
                  totalAmount: line.perJob.total,
                  source: line.level || 'DEFAULT',
                  ruleId: line.ruleId && mongoose.Types.ObjectId.isValid(String(line.ruleId))
                    ? line.ruleId
                    : null
                }
              }
            }
          }
        });
      }
      if (rowPriceOps.length) await B2BBulkUploadRow.bulkWrite(rowPriceOps, { ordered: false });

      pricingBreakdown = {
        currency: priced.currency,
        lines: priced.lines,
        totals: priced.totals,
        calculatedAt: new Date()
      };
    } catch (pricingErr) {
      // Never fail a validated batch on a pricing error — fall back to the
      // legacy flat rate and surface it for admin follow-up.
      console.error(
        `[Validation] Pricing engine failed for batch ${batch.batchId}, using legacy rate:`,
        pricingErr.message
      );
      let rule = await B2BDeductionRule.findOne({ companyId: batch.companyId, isActive: true });
      if (!rule) {
        rule = await B2BDeductionRule.create({ companyId: batch.companyId, perJobCharge: 12, gstPercent: 18, isActive: true });
      }
      ratePerJob = parseFloat((rule.perJobCharge * (1 + rule.gstPercent / 100)).toFixed(2));
      estimatedCost = parseFloat((validRows * ratePerJob).toFixed(2));
    }

    // 9. Update final batch data
    batch.validRows = validRows;
    batch.invalidRows = invalidRows;
    batch.duplicates = duplicates;
    batch.estimatedCost = estimatedCost;
    batch.perJobCharge = ratePerJob;
    if (pricingBreakdown) batch.pricingBreakdown = pricingBreakdown;
    batch.routingPreview = routingPreview;
    batch.totalCost = estimatedCost;
    batch.processingStatus = 'PRICED';
    batch.status = 'validated';
    batch.failureReason = null;
    await batch.save();

    // 10. Write validation reports reference (non-critical — don't fail the batch if this errors)
    try {
      await UploadReport.create({
        batchId: batch._id,
        reportType: 'error_report',
        fileName: `validation_errors_${batch.batchId}.xlsx`,
        fileUrl: `/api/b2b/bulk-jobs/errors/${batch._id}/download`
      });
    } catch (reportErr) {
      console.warn(`[Validation] UploadReport creation failed for batch ${batchId} (non-critical):`, reportErr.message);
    }

    console.log(`[Validation] Completed Batch: ${batchId}. Valid: ${validRows}, Invalid: ${invalidRows}`);
    emitSocket(app, `b2b:${batch.companyId.toString()}`, 'b2b:validationCompleted', {
      batchId,
      total: totalRows,
      valid: validRows,
      invalid: invalidRows,
      duplicates,
      estimatedCost,
      routingPreview
    });
    emitSocket(app, `batch:${batchId}`, 'b2b:validationCompleted', {
      batchId,
      total: totalRows,
      valid: validRows,
      invalid: invalidRows,
      duplicates,
      estimatedCost,
      routingPreview
    });

  } catch (error) {
    console.error(`[Validation Error] Batch ${batchId} failed validation:`, error);
    const safeMessage = toUserFacingFailure(error);
    batch.status = 'failed';
    batch.failedAt = new Date();
    batch.failureReason = safeMessage;
    await batch.save();

    emitSocket(app, `b2b:${batch.companyId.toString()}`, 'b2b:validationFailed', {
      batchId,
      error: safeMessage
    });
    emitSocket(app, `batch:${batchId}`, 'b2b:validationFailed', {
      batchId,
      error: safeMessage
    });
  }
};

/**
 * Perform Job Creation (BullMQ Task)
 * Process rows, save in Mongo using BulkWrite, deduct Wallet.
 * Partial success: valid rows are created; any late-failing rows are reported
 * via B2BBatchErrors and never crash the whole batch with a raw Mongoose error.
 * Idempotent: jobId is deterministic per (batch, row), so retries upsert.
 */
const processJobCreation = async (batchId, app) => {
  const batch = await B2BBatch.findById(batchId);
  if (!batch) {
    console.error(`[Job Creation] Batch ${batchId} not found`);
    return;
  }

  console.log(`[Job Creation] Starting insertion for Batch: ${batchId}`);
  batch.status = 'processing';
  await batch.save();

  emitSocket(app, `b2b:${batch.companyId.toString()}`, 'b2b:uploadStarted', { batchId });
  emitSocket(app, `batch:${batchId}`, 'b2b:uploadStarted', { batchId });

  // Tracking so the finally-block can always leave the batch in a terminal state
  // even if an unexpected exception escapes the try body.
  let terminatedCleanly = false;
  let createdCount = 0;
  let walletBalanceSnapshot = 0;
  let companyName = '';

  try {
    // Company existence check only — approval already verified at upload time
    const company = await B2BCompany.findById(batch.companyId);
    if (!company) {
      throw new Error('Company account not found. Please re-login.');
    }
    companyName = company.companyName;

    // 1. Money first: reserve the whole upload before a single job exists.
    //    An upload that cannot be paid for creates nothing and waits.
    const holdAmount = parseFloat(Number(batch.estimatedCost).toFixed(2));
    const reservationId = `BATCH-${batch.batchId}`;
    const alreadyReserved = await B2BWalletTransaction.findOne({
      companyId: batch.companyId,
      ledgerType: 'JOB_RESERVATION',
      reservationId,
      status: 'success'
    }).lean();

    let reservation = null;
    if (!alreadyReserved && holdAmount > 0) {
      try {
        reservation = await walletLedger.reserve({
          companyId: batch.companyId,
          amount: holdAmount,
          reservationId,
          batchId: batch._id,
          idempotencyKey: `batch-reservation:${batch.batchId}`,
          remark: `Reserved for bulk upload ${batch.batchId} (${batch.validRows} jobs)`
        });
      } catch (err) {
        if (err.code !== 'INSUFFICIENT_FUNDS') throw err;

        // Nothing is created, nothing is dispatched: the batch waits for funds.
        batch.status = 'paused';
        batch.paymentStatus = 'INSUFFICIENT';
        batch.processingStatus = 'AWAITING_PAYMENT';
        batch.totalCost = holdAmount;
        batch.failureReason = `Wallet short by ₹${err.details?.shortfall ?? holdAmount}. No jobs were created.`;
        await batch.save();
        terminatedCleanly = true;

        const payload = {
          batchId,
          required: err.details?.required ?? holdAmount,
          available: err.details?.available ?? 0,
          shortfall: err.details?.shortfall ?? holdAmount,
          topUpMethods: err.details?.topUpMethods || [],
          createdCount: 0,
          message: 'Top up the wallet to dispatch this upload. No jobs were created.'
        };
        emitSocket(app, `b2b:${batch.companyId.toString()}`, 'b2b:uploadPaymentRequired', payload);
        emitSocket(app, `batch:${batchId}`, 'b2b:uploadPaymentRequired', payload);
        return;
      }
    }

    const balanceNow = await walletLedger.getBalance(batch.companyId);
    walletBalanceSnapshot = balanceNow.available;
    if (reservation || alreadyReserved) {
      batch.reservationId = reservationId;
      batch.paymentStatus = 'RESERVED';
      batch.totalCost = holdAmount;
      batch.paymentMode = (reservation?.transaction || alreadyReserved).paymentMode || 'REAL';
    }
    batch.processingStatus = 'CREATING_JOBS';
    await batch.save();

    // The reservation row that paid for every job in this batch.
    const newTxn = reservation?.transaction || alreadyReserved || null;

    // Everything below runs only because the money is held.

    // 2. Re-parse with the SAME parser used during validation, then skip rows
    //    already flagged as invalid. Re-run field/schema validation so a stale
    //    or corrupt error report can never let a bad row reach insertOne.
    const filePath = path.resolve(batch.fileUrl);
    if (!fs.existsSync(filePath)) {
      throw new Error('The uploaded file is no longer available. Please upload it again.');
    }
    const rawRows = parseRowsFromFile(filePath);

    const previousErrors = await B2BBatchErrors.find({ batchId: batch._id }).select('rowNumber');
    const previouslyInvalid = new Set(previousErrors.map(err => err.rowNumber));

    const serviceCatalog = await loadRoutingCatalog();
    const creationErrors = [];
    const candidates = [];

    // One set of SLA thresholds for the whole batch — they are per company.
    let slaStamp = null;
    try {
      const { thresholdsFor } = require('./b2bSla.service');
      const t = await thresholdsFor(batch.companyId);
      const from = Date.now();
      const due = (minutes) => (minutes > 0 ? new Date(from + minutes * 60000) : null);
      slaStamp = {
        profile: t.name || '',
        assignmentMinutes: t.assignmentMinutes ?? null,
        acceptanceMinutes: t.acceptanceMinutes ?? null,
        arrivalMinutes: t.arrivalMinutes ?? null,
        responseMinutes: t.responseMinutes ?? null,
        resolutionMinutes: t.resolutionMinutes ?? null,
        assignmentDueAt: due(t.assignmentMinutes),
        responseDueAt: due(t.responseMinutes),
        resolutionDueAt: due(t.resolutionMinutes)
      };
    } catch (slaErr) {
      console.warn('[Job Creation] SLA thresholds unavailable:', slaErr.message);
    }

    // The price each row was quoted at validation time — what the company saw
    // in the preview is what the job is created with.
    const persistedRows = await B2BBulkUploadRow.find({ batchId: batch._id })
      .select('rowNumber pricing')
      .lean();
    const rowPricingByNumber = new Map(
      persistedRows
        .filter((r) => r.pricing && r.pricing.totalAmount)
        .map((r) => [r.rowNumber, r.pricing])
    );

    for (let index = 0; index < rawRows.length; index++) {
      const rowNum = index + 1;
      if (previouslyInvalid.has(rowNum)) continue;

      const mapped = mapHeaders(rawRows[index]);
      const fieldIssues = validateMappedRow(mapped, serviceCatalog);
      mapped.preferredDate = parsePreferredDate(mapped.preferredDate);
      mapped.priority = normalizePriority(mapped.priority);

      let finalLat = parseFloat(mapped.latitude);
      let finalLng = parseFloat(mapped.longitude);
      if (isNaN(finalLat) || isNaN(finalLng) || finalLat === 0 || finalLng === 0) {
        const coords = await geocodeRow(mapped);
        if (coords) {
          finalLat = coords.lat;
          finalLng = coords.lng;
        } else {
          fieldIssues.push(issue(
            'address',
            mapped.address,
            'address, city and pincode could not be resolved to a location',
            'Check the address and pincode, or add Latitude and Longitude columns'
          ));
        }
      }
      mapped.latitude = finalLat;
      mapped.longitude = finalLng;
      enrichRowForRouting(mapped, serviceCatalog);

      const jobDoc = buildJobDocument({
        mapped,
        batch,
        rowNumber: rowNum,
        rowPricing: rowPricingByNumber.get(rowNum) || null,
        reservation: newTxn,
        sla: slaStamp
      });
      const schemaErrors = collectSchemaErrors(jobDoc);
      const allErrors = [...fieldIssues.map(issueText), ...schemaErrors];

      if (allErrors.length > 0) {
        creationErrors.push({
          batchId: batch._id,
          rowNumber: rowNum,
          rowData: mapped,
          errorList: allErrors
        });
        continue;
      }

      candidates.push({ rowNum, mapped, jobDoc });
    }

    if (candidates.length === 0) {
      // No creatable rows — surface as a failed batch with an error report,
      // never as a raw Mongoose ValidationError toast.
      if (creationErrors.length > 0) {
        const existingErrorDocs = await B2BBatchErrors.find({ batchId: batch._id }).lean();
        const byRow = new Map();
        for (const e of existingErrorDocs) {
          byRow.set(e.rowNumber, {
            batchId: batch._id,
            rowNumber: e.rowNumber,
            rowData: e.rowData || {},
            errorList: e.errorList || []
          });
        }
        for (const e of creationErrors) byRow.set(e.rowNumber, e);
        await saveBatchErrors(batch._id, Array.from(byRow.values()));
        batch.invalidRows = byRow.size;
      }
      batch.validRows = 0;
      batch.createdJobsCount = 0;
      batch.status = 'failed';
      batch.failedAt = new Date();
      batch.failureReason = 'No valid jobs found in this batch to create. Download the error report for details.';
      await batch.save();
      terminatedCleanly = true;

      emitSocket(app, `b2b:${batch.companyId.toString()}`, 'b2b:uploadFailed', {
        batchId,
        error: batch.failureReason
      });
      emitSocket(app, `batch:${batchId}`, 'b2b:uploadFailed', {
        batchId,
        error: batch.failureReason
      });
      return;
    }


    // 4. Build idempotent upserts (deterministic jobId) + history logs
    const jobWrites = [];
    const historyLogs = [];
    const jobIdsList = [];

    for (const { rowNum, jobDoc } of candidates) {
      // Prefer existing _id on retry so history / matching keep a stable reference
      const existing = await B2BJob.findOne({ jobId: jobDoc.jobId }).select('_id').lean();
      const jobMongoId = existing?._id || new mongoose.Types.ObjectId();
      jobDoc._id = jobMongoId;
      jobIdsList.push(jobMongoId);

      jobWrites.push({
        updateOne: {
          filter: { jobId: jobDoc.jobId },
          update: { $setOnInsert: jobDoc },
          upsert: true
        }
      });

      // Backend-sourced timeline: CREATED → VALIDATED (routing adds ROUTED).
      historyLogs.push([
        {
          jobId: jobMongoId,
          status: 'pending',
          fromStatus: null,
          toStatus: 'CREATED',
          event: 'JOB_CREATED',
          role: 'company',
          changedBy: batch.createdBy || batch.companyId,
          remark: `Created via bulk upload (Batch ${batch.batchId}, row ${rowNum})`,
          meta: { source: 'B2B', batchId: batch.batchId, rowNumber: rowNum }
        },
        {
          jobId: jobMongoId,
          status: jobDoc.status,
          fromStatus: 'CREATED',
          toStatus: 'VALIDATED',
          event: 'JOB_VALIDATED',
          role: 'system',
          remark: 'Validated — funds reserved in the company wallet',
          meta: { serviceKey: jobDoc.serviceKey, slaDueAt: jobDoc.slaDueAt }
        }
      ]);
    }

    // 5. Execute MongoDB bulk writes in chunks. Ordered:false so one bad doc
    //    cannot abort the rest of the chunk (partial success).
    const chunkSize = 500;
    let written = 0;

    for (let i = 0; i < jobWrites.length; i += chunkSize) {
      const chunk = jobWrites.slice(i, i + chunkSize);
      try {
        await B2BJob.bulkWrite(chunk, { ordered: false });
        written += chunk.length;
      } catch (bulkErr) {
        // Collect per-write failures as row-level errors instead of failing the batch
        const writeErrors = bulkErr.writeErrors || bulkErr.result?.getWriteErrors?.() || [];
        const failedIndices = new Set(writeErrors.map((we) => we.index));
        written += chunk.length - failedIndices.size;

        for (const we of writeErrors) {
          const failedCandidate = candidates[i + we.index];
          if (!failedCandidate) continue;
          creationErrors.push({
            batchId: batch._id,
            rowNumber: failedCandidate.rowNum,
            rowData: failedCandidate.mapped,
            errorList: ['Could not create this job. Please re-check required fields and retry.']
          });
        }

        // If the error is something other than writeErrors (e.g. connection), rethrow
        if (writeErrors.length === 0) {
          throw bulkErr;
        }
      }

      const historyChunk = historyLogs.slice(i, i + chunkSize).flat();
      try {
        await JobHistory.insertMany(historyChunk, { ordered: false });
      } catch (histErr) {
        // History is informational — duplicate keys on retry are fine
        console.warn(`[Job Creation] History insert soft-fail for batch ${batchId}:`, histErr.message);
      }

      const percent = Math.round((written / candidates.length) * 100);
      emitSocket(app, `b2b:${batch.companyId.toString()}`, 'b2b:creationProgress', {
        batchId,
        progress: percent,
        written,
        total: candidates.length
      });
      emitSocket(app, `batch:${batchId}`, 'b2b:creationProgress', {
        batchId,
        progress: percent,
        written,
        total: candidates.length
      });
    }

    createdCount = written;

    // Persist any late-failing row errors alongside the original validation ones
    if (creationErrors.length > 0) {
      const existingErrorDocs = await B2BBatchErrors.find({ batchId: batch._id }).lean();
      const merged = [
        ...existingErrorDocs.map((e) => ({
          batchId: batch._id,
          rowNumber: e.rowNumber,
          rowData: e.rowData || {},
          errorList: e.errorList || []
        })),
        ...creationErrors
      ];
      // De-dupe by rowNumber, prefer the newest error list
      const byRow = new Map();
      for (const e of merged) byRow.set(e.rowNumber, e);
      await saveBatchErrors(batch._id, Array.from(byRow.values()));
      batch.invalidRows = byRow.size;
    }

    // 6. Complete Batch — always leave a terminal status
    batch.createdJobsCount = createdCount;
    batch.failedJobs = creationErrors.length;
    batch.processingStatus = 'ROUTING';
    batch.status = 'completed';
    batch.completedAt = new Date();
    batch.failureReason = creationErrors.length > 0
      ? `${createdCount} jobs created. ${creationErrors.length} rows could not be created — download the error report.`
      : null;
    await batch.save();
    terminatedCleanly = true;

    if (newTxn) {
      // The reservation row is returned as a plain object by the ledger.
      await B2BWalletTransaction.updateOne(
        { _id: newTxn._id },
        { $set: { relatedJobIds: jobIdsList } }
      );
    }

    // 6a. Point every uploaded row at the job it became — or at why it did not.
    const rowLinkOps = candidates.map(({ rowNum, jobDoc }) => ({
      updateOne: {
        filter: { batchId: batch._id, rowNumber: rowNum },
        update: {
          $set: {
            status: 'CREATED',
            jobId: jobDoc._id,
            jobCode: jobDoc.jobId,
            createdAtJob: new Date()
          }
        }
      }
    }));
    for (const e of creationErrors) {
      rowLinkOps.push({
        updateOne: {
          filter: { batchId: batch._id, rowNumber: e.rowNumber },
          update: {
            $set: {
              status: 'FAILED',
              failureReason: (e.errorList || []).join(' | ')
            }
          }
        }
      });
    }
    if (rowLinkOps.length) {
      await B2BBulkUploadRow.bulkWrite(rowLinkOps, { ordered: false });
    }

    // 6b. Per-job EscrowLedger rows (batch already moved Available → Escrow Locked)
    if (createdCount > 0) {
      const EscrowLedger = require('../models/EscrowLedger');
      const perJob = parseFloat(Number(batch.perJobCharge).toFixed(2));
      // Hold each job's own quoted price: perJobCharge is the batch average, and
      // using it would over/under-charge every job that was priced differently.
      const jobCharges = new Map(
        (await B2BJob.find({ _id: { $in: jobIdsList } }).select('charge').lean())
          .map((j) => [String(j._id), Number(j.charge)])
      );
      for (const jobMongoId of jobIdsList) {
        try {
          const exists = await EscrowLedger.findOne({
            sourceType: 'b2b_job',
            sourceId: jobMongoId
          }).select('_id').lean();
          if (exists) continue;
          const ownCharge = jobCharges.get(String(jobMongoId));
          const held = parseFloat((ownCharge > 0 ? ownCharge : perJob).toFixed(2));
          await EscrowLedger.create({
            paymentId: jobMongoId,
            sourceType: 'b2b_job',
            sourceId: jobMongoId,
            grossAmount: held,
            heldAmount: held,
            releasedAmount: 0,
            status: 'held',
            releaseReason: `b2b_bulk:${batch.batchId}`
          });
        } catch (ledgerErr) {
          console.warn(`[Job Creation] EscrowLedger for ${jobMongoId}:`, ledgerErr.message);
        }
      }
    }

    // 7. Trigger assignment: vendor marketplace OR engineer matching (never both)
    {
      const { dispatchB2BJobAssignment } = require('./enterpriseB2BOrchestrator.service');
      for (const jobMongoId of jobIdsList) {
        dispatchB2BJobAssignment(jobMongoId, app).catch((err) => {
          console.error(`[Assignment Trigger Error] Job ID ${jobMongoId}:`, err.message);
        });
      }
    }

    // 8. Emit final completions
    emitSocket(app, `b2b:${batch.companyId.toString()}`, 'b2b:uploadCompleted', {
      batchId,
      createdCount,
      walletBalance: walletBalanceSnapshot,
      partialFailures: creationErrors.length
    });
    emitSocket(app, `batch:${batchId}`, 'b2b:uploadCompleted', {
      batchId,
      createdCount,
      walletBalance: walletBalanceSnapshot,
      partialFailures: creationErrors.length
    });
    emitSocket(app, 'admin', 'admin:batchCompleted', {
      batchId,
      companyName,
      createdCount
    });

  } catch (error) {
    console.error(`[Job Creation Error] Batch ${batchId} failed job creation:`, error);
    const safeMessage = toUserFacingFailure(error);
    batch.status = 'failed';
    batch.failedAt = new Date();
    batch.failureReason = safeMessage;
    await batch.save();
    terminatedCleanly = true;

    emitSocket(app, `b2b:${batch.companyId.toString()}`, 'b2b:uploadFailed', {
      batchId,
      error: safeMessage
    });
    emitSocket(app, `batch:${batchId}`, 'b2b:uploadFailed', {
      batchId,
      error: safeMessage
    });
  } finally {
    // Absolute safety net: never leave a batch stuck in 'processing'
    if (!terminatedCleanly) {
      try {
        const fresh = await B2BBatch.findById(batchId);
        if (fresh && fresh.status === 'processing') {
          fresh.status = 'failed';
          fresh.failedAt = new Date();
          fresh.failureReason = fresh.failureReason || 'Job creation interrupted unexpectedly. Please retry the batch.';
          await fresh.save();
          emitSocket(app, `b2b:${fresh.companyId.toString()}`, 'b2b:uploadFailed', {
            batchId,
            error: fresh.failureReason
          });
        }
      } catch (finallyErr) {
        console.error(`[Job Creation] finally-block status recovery failed for ${batchId}:`, finallyErr.message);
      }
    }
  }
};

/**
 * The template's column contract, read by the panel's Templates page so the
 * spec shown to uploaders is the one the parser actually applies.
 */
const templateSpec = () => {
  const describe = (field, required) => ({
    field,
    header: TEMPLATE_HEADERS[field] || field,
    required,
    note: TEMPLATE_NOTES[field] || '',
    // Other header spellings the parser accepts for this column.
    aliases: (HEADER_ALIASES[field] || []).filter((a) => a !== normalizeHeader(TEMPLATE_HEADERS[field] || field))
  });
  return [
    ...TEMPLATE_COLUMNS.required.map((f) => describe(f, true)),
    ...TEMPLATE_COLUMNS.optional.map((f) => describe(f, false))
  ];
};

module.exports = {
  templateSpec,
  processValidation,
  processJobCreation,
  mapHeaders,
  parseRowsFromFile,
  validateMappedRow,
  parsePreferredDate,
  normalizePriority,
  buildJobDocument,
  collectSchemaErrors,
  toUserFacingFailure,
  /**
   * The official template: required columns first, then optional ones, in the
   * order the uploader is asked for them. Two sample rows teach the shape.
   */
  generateSampleExcelBuffer: () => {
    const fields = [...TEMPLATE_COLUMNS.required, ...TEMPLATE_COLUMNS.optional];
    const headers = fields.map((f) => TEMPLATE_HEADERS[f] || f);

    const sample = (row) => {
      const out = {};
      for (const field of fields) out[TEMPLATE_HEADERS[field] || field] = row[field] ?? '';
      return out;
    };

    // Sample rows use real catalog names so the template teaches the right shape.
    const sampleData = [
      sample({
        customerName: 'Ramesh Mehta',
        phone: '9876543210',
        address: '2, MG Road, Fort',
        city: 'Mumbai',
        state: 'Maharashtra',
        pincode: '400001',
        service: 'CCTV & Surveillance',
        serviceKey: 'CCTV',
        requiredSkill: 'CCTV Installation',
        customerRef: 'CUST-1042',
        email: 'ramesh@example.com',
        latitude: 18.9268,
        longitude: 72.8273,
        subService: 'CCTV Camera Installation',
        assetId: 'AST-88120',
        assetModel: 'HIK-DS2CD',
        serialNumber: 'SN-4471123',
        priority: 'High',
        preferredDate: '2026-10-15',
        preferredTime: '10:00-13:00',
        description: 'Two cameras offline at the main gate',
        specialInstructions: 'Report to security desk on arrival'
      }),
      sample({
        customerName: 'Suresh Yadav',
        phone: '9876543211',
        address: '15, Kalyani Nagar',
        city: 'Pune',
        state: 'Maharashtra',
        pincode: '411006',
        service: 'Plumbing & Water Systems',
        serviceKey: 'PLUMBING',
        requiredSkill: 'Pipe Fitting',
        customerRef: 'CUST-1043',
        email: 'suresh@example.com',
        latitude: 18.5463,
        longitude: 73.9033,
        subService: 'Pipe Leak Repair',
        assetId: '',
        assetModel: '',
        serialNumber: '',
        priority: 'Medium',
        preferredDate: '2026-10-16',
        preferredTime: '14:00-17:00',
        description: 'Leak under the pantry sink',
        specialInstructions: ''
      })
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(sampleData, { header: headers });
    ws['!cols'] = headers.map((h) => ({ wch: Math.max(h.length + 3, 15) }));
    XLSX.utils.book_append_sheet(wb, ws, 'Bulk Jobs Template');

    // A second sheet documents what each column means and whether it is required.
    const guide = fields.map((field) => ({
      Column: TEMPLATE_HEADERS[field] || field,
      Required: TEMPLATE_COLUMNS.required.includes(field) ? 'Yes' : 'No',
      Notes: TEMPLATE_NOTES[field] || ''
    }));
    const guideSheet = XLSX.utils.json_to_sheet(guide);
    guideSheet['!cols'] = [{ wch: 24 }, { wch: 10 }, { wch: 60 }];
    XLSX.utils.book_append_sheet(wb, guideSheet, 'Column Guide');

    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  },
  TEMPLATE_COLUMNS,
  TEMPLATE_HEADERS,
  detectUnknownColumns
};
