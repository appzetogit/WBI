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
const B2BJob = require('../models/B2BJob');
const B2BCompany = require('../models/B2BCompany');
const B2BWallet = require('../models/B2BWallet');
const B2BWalletTransaction = require('../models/B2BWalletTransaction');
const JobHistory = require('../models/JobHistory');
const UploadReport = require('../models/UploadReport');
const B2BDeductionRule = require('../models/B2BDeductionRule');

const { geocodeAddress } = require('./locationService');
const {
  pickCategoryFromConfigs,
  loadActiveServiceConfigs
} = require('../utils/createOpportunityFromEnquiry');

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
  preferredTime: ['preferred time', 'schedule time', 'time', 'time slot', 'preferred slot', 'slot']
};

// Collapse a spreadsheet header into a comparable token: lowercase, punctuation
// and separators to single spaces, trimmed. "Customer_Name " -> "customer name".
const normalizeHeader = (header) =>
  String(header)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

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
const validateMappedRow = (mapped, serviceCatalog = null) => {
  const errors = [];

  if (!mapped.customerName) {
    errors.push('Customer Name: required');
  }

  if (!mapped.phone) {
    errors.push('Phone: required');
  } else if (String(mapped.phone).replace(/[^0-9]/g, '').length !== 10) {
    errors.push('Phone: must be a 10-digit mobile number');
  }

  if (mapped.email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(String(mapped.email).trim())) {
      errors.push('Email: invalid format');
    }
  }

  if (!mapped.address) {
    errors.push('Address: required');
  }

  if (!mapped.city) {
    errors.push('City: required');
  }

  if (!mapped.service) {
    errors.push('Service: required');
  } else if (serviceCatalog?.length) {
    // A service with no catalog category can never be routed to a vendor, and
    // the wallet is charged at job creation — reject it here instead.
    const text = [mapped.service, mapped.subService].filter(Boolean).join(' ');
    if (!pickCategoryFromConfigs(text, serviceCatalog)) {
      errors.push(`Service: "${mapped.service}" is not an offered service category`);
    }
  }

  return errors;
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
const buildJobDocument = ({ mapped, batch, rowNumber, isInsufficient }) => {
  const cleanCity = String(mapped.city || '').toLowerCase().trim();

  return {
    companyId: batch.companyId,
    batchId: batch._id,
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
    status: isInsufficient ? 'pending_wallet' : 'searching_engineer',
    charge: batch.perJobCharge,
    paymentStatus: isInsufficient ? 'pending_deduction' : 'escrow_locked',
    payoutStatus: 'none',
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

  // 6. Absolute Fallback
  if (!coords) {
    coords = { lat: 19.0760, lng: 72.8777 }; // Mumbai default
  }

  return coords;
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
    batch.totalRows = totalRows;
    await batch.save();

    if (totalRows === 0) {
      throw new Error('The uploaded file is empty or contains no parseable job rows');
    }

    // 3. Set up batching variables
    const serviceCatalog = await loadActiveServiceConfigs();
    let validRows = 0;
    let invalidRows = 0;
    let duplicates = 0;

    const parsedRows = [];
    const errorChunks = [];

    // Track duplicates inside this file (Phone + Address combination)
    const rowSignatures = new Set();

    // 5. Parse and Validate Chunks of rows
    for (let index = 0; index < totalRows; index++) {
      const rawRow = rawRows[index];
      const rowNum = index + 1;

      const mapped = mapHeaders(rawRow);
      const errors = validateMappedRow(mapped, serviceCatalog);

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
          errors.push('Duplicate: identical phone + address already in this file');
        } else {
          rowSignatures.add(signature);
        }

        // Duplicate check against existing active jobs (Database)
        const dbDuplicate = await B2BJob.findOne({
          phone: cleanPhone,
          address: { $regex: new RegExp(cleanAddr.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'i') },
          status: { $in: ['pending', 'searching_engineer', 'assigned', 'in_progress'] }
        }).select('_id').lean();
        if (dbDuplicate) {
          duplicates++;
          errors.push('Duplicate: a similar active job already exists');
        }
      }

      // Geocoding coordinates resolution (Geocode chain)
      let finalLat = parseFloat(mapped.latitude);
      let finalLng = parseFloat(mapped.longitude);

      if (isNaN(finalLat) || isNaN(finalLng) || finalLat === 0 || finalLng === 0) {
        const coords = await geocodeRow(mapped);
        finalLat = coords.lat;
        finalLng = coords.lng;
      }

      mapped.latitude = finalLat;
      mapped.longitude = finalLng;

      // Final schema gate — never let a row that would fail Mongoose
      // "validate" count as valid just because field presence checks passed.
      if (errors.length === 0) {
        const provisionalDoc = buildJobDocument({
          mapped,
          batch,
          rowNumber: rowNum,
          isInsufficient: false
        });
        const schemaErrors = collectSchemaErrors(provisionalDoc);
        if (schemaErrors.length > 0) {
          errors.push(...schemaErrors);
        }
      }

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

    // 8. Fetch active deduction rules to calculate costs
    let rule = await B2BDeductionRule.findOne({ companyId: batch.companyId, isActive: true });
    if (!rule) {
      rule = await B2BDeductionRule.create({ companyId: batch.companyId, perJobCharge: 12, gstPercent: 18, isActive: true });
    }
    const perJobCharge = rule.perJobCharge;
    const gstPercent = rule.gstPercent;
    const ratePerJob = parseFloat((perJobCharge * (1 + gstPercent / 100)).toFixed(2));
    const estimatedCost = parseFloat((validRows * ratePerJob).toFixed(2));

    // 9. Update final batch data
    batch.validRows = validRows;
    batch.invalidRows = invalidRows;
    batch.duplicates = duplicates;
    batch.estimatedCost = estimatedCost;
    batch.perJobCharge = ratePerJob;
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
      estimatedCost
    });
    emitSocket(app, `batch:${batchId}`, 'b2b:validationCompleted', {
      batchId,
      total: totalRows,
      valid: validRows,
      invalid: invalidRows,
      duplicates,
      estimatedCost
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
    // 1. Double check wallet balance
    const wallet = await B2BWallet.findOne({ companyId: batch.companyId });
    const isInsufficient = !wallet || wallet.balance < batch.estimatedCost;
    walletBalanceSnapshot = wallet?.balance || 0;

    // Company existence check only — approval already verified at upload time
    const company = await B2BCompany.findById(batch.companyId);
    if (!company) {
      throw new Error('Company account not found. Please re-login.');
    }
    companyName = company.companyName;

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

    const serviceCatalog = await loadActiveServiceConfigs();
    const creationErrors = [];
    const candidates = [];

    for (let index = 0; index < rawRows.length; index++) {
      const rowNum = index + 1;
      if (previouslyInvalid.has(rowNum)) continue;

      const mapped = mapHeaders(rawRows[index]);
      const fieldErrors = validateMappedRow(mapped, serviceCatalog);
      mapped.preferredDate = parsePreferredDate(mapped.preferredDate);
      mapped.priority = normalizePriority(mapped.priority);

      let finalLat = parseFloat(mapped.latitude);
      let finalLng = parseFloat(mapped.longitude);
      if (isNaN(finalLat) || isNaN(finalLng) || finalLat === 0 || finalLng === 0) {
        const coords = await geocodeRow(mapped);
        finalLat = coords.lat;
        finalLng = coords.lng;
      }
      mapped.latitude = finalLat;
      mapped.longitude = finalLng;

      const jobDoc = buildJobDocument({
        mapped,
        batch,
        rowNumber: rowNum,
        isInsufficient
      });
      const schemaErrors = collectSchemaErrors(jobDoc);
      const allErrors = [...fieldErrors, ...schemaErrors];

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

    let newTxn = null;
    // 3. Reserve funds in escrow (Available → Escrow Locked). Do NOT mark totalSpent yet —
    //    spend happens only on successful release after company approval.
    //    Skip if a prior successful escrow hold already exists for this batch.
    const existingTxn = await B2BWalletTransaction.findOne({
      companyId: batch.companyId,
      remark: { $regex: new RegExp(`Batch ID: ${batch.batchId}`) },
      type: { $in: ['escrow_hold', 'job_deduction'] },
      status: 'success'
    });

    if (!isInsufficient && !existingTxn) {
      const holdAmount = parseFloat(Number(batch.estimatedCost).toFixed(2));
      const updatedWallet = await B2BWallet.findOneAndUpdate(
        { companyId: batch.companyId, balance: { $gte: holdAmount } },
        {
          $inc: { balance: -holdAmount, escrowBalance: holdAmount },
          $set: { lastUpdatedAt: new Date() }
        },
        { new: true }
      );
      if (!updatedWallet) {
        throw new Error('Insufficient wallet balance to lock escrow for this batch.');
      }
      walletBalanceSnapshot = updatedWallet.balance;
      company.walletBalance = updatedWallet.balance;
      await company.save();

      const transactionId = `TXN-BULK-ESH-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      newTxn = await B2BWalletTransaction.create({
        companyId: batch.companyId,
        walletId: updatedWallet._id,
        transactionId,
        type: 'escrow_hold',
        amount: -holdAmount,
        totalAmount: -holdAmount,
        status: 'success',
        paymentMethod: 'wallet',
        remark: `Escrow hold for bulk jobs (Batch ID: ${batch.batchId}, Rows: ${candidates.length})`
      });
    } else if (existingTxn) {
      newTxn = existingTxn;
      walletBalanceSnapshot = wallet?.balance || 0;
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

      historyLogs.push({
        jobId: jobMongoId,
        status: isInsufficient ? 'pending_wallet' : 'searching_engineer',
        remark: `Job initialized via Bulk Upload (Batch ID: ${batch.batchId})${isInsufficient ? ' - Awaiting Wallet Top-up' : ''}`,
        role: 'system'
      });
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

      const historyChunk = historyLogs.slice(i, i + chunkSize);
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
    batch.status = 'completed';
    batch.completedAt = new Date();
    batch.failureReason = creationErrors.length > 0
      ? `${createdCount} jobs created. ${creationErrors.length} rows could not be created — download the error report.`
      : null;
    await batch.save();
    terminatedCleanly = true;

    if (newTxn) {
      newTxn.relatedJobIds = jobIdsList;
      await newTxn.save();
    }

    // 6b. Per-job EscrowLedger rows (batch already moved Available → Escrow Locked)
    if (!isInsufficient && createdCount > 0) {
      const EscrowLedger = require('../models/EscrowLedger');
      const perJob = parseFloat(Number(batch.perJobCharge).toFixed(2));
      for (const jobMongoId of jobIdsList) {
        try {
          const exists = await EscrowLedger.findOne({
            sourceType: 'b2b_job',
            sourceId: jobMongoId
          }).select('_id').lean();
          if (exists) continue;
          await EscrowLedger.create({
            paymentId: jobMongoId,
            sourceType: 'b2b_job',
            sourceId: jobMongoId,
            grossAmount: perJob,
            heldAmount: perJob,
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
    if (!isInsufficient) {
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

module.exports = {
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
  generateSampleExcelBuffer: () => {
    const headers = [
      'Customer Name', 'Phone', 'Email', 'Address', 'City', 'State', 'Pincode',
      'Latitude', 'Longitude', 'Service', 'Sub Service', 'Priority', 'Preferred Date', 'Preferred Time'
    ];

    // Sample rows use real catalog names so the template teaches the right shape.
    const sampleData = [
      {
        'Customer Name': 'Ramesh Mehta',
        'Phone': '9876543210',
        'Email': 'ramesh@example.com',
        'Address': '2, MG Road, Fort',
        'City': 'Mumbai',
        'State': 'Maharashtra',
        'Pincode': '400001',
        'Latitude': 18.9268,
        'Longitude': 72.8273,
        'Service': 'CCTV & Surveillance',
        'Sub Service': 'CCTV Camera Installation',
        'Priority': 'High',
        'Preferred Date': '2026-08-15',
        'Preferred Time': '10:00 AM - 01:00 PM'
      },
      {
        'Customer Name': 'Suresh Yadav',
        'Phone': '9876543211',
        'Email': 'suresh@example.com',
        'Address': '15, Kalyani Nagar',
        'City': 'Pune',
        'State': 'Maharashtra',
        'Pincode': '411006',
        'Latitude': 18.5463,
        'Longitude': 73.9033,
        'Service': 'Plumbing & Water Systems',
        'Sub Service': 'Pipe Leak Repair',
        'Priority': 'Medium',
        'Preferred Date': '2026-08-16',
        'Preferred Time': '02:00 PM - 05:00 PM'
      }
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(sampleData, { header: headers });

    const wscols = headers.map(h => ({ wch: Math.max(h.length + 3, 15) }));
    ws['!cols'] = wscols;

    XLSX.utils.book_append_sheet(wb, ws, 'Bulk Jobs Template');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  }
};
