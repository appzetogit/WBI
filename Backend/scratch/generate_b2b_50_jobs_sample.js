/**
 * Generate a production-realistic 50-row B2B bulk upload sample (.xlsx + .csv)
 * using the master service catalog, then validate it with the same parser the
 * upload worker uses.
 *
 * Usage: node scratch/generate_b2b_50_jobs_sample.js
 */
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const mongoose = require('mongoose');

const catalog = require('../data/masterServiceCatalog');
const {
  mapHeaders,
  validateMappedRow,
  parsePreferredDate,
  normalizePriority,
  buildJobDocument,
  collectSchemaErrors,
  parseRowsFromFile
} = require('../services/b2bBulkJobService');

const OUT_DIR = path.join(__dirname, '../uploads/b2b-bulk/samples');
const XLSX_OUT = path.join(OUT_DIR, 'WBI_B2B_50_Jobs.xlsx');
const CSV_OUT = path.join(OUT_DIR, 'WBI_B2B_50_Jobs.csv');

const CITIES = [
  { city: 'Mumbai', state: 'Maharashtra', pincode: '400001', lat: 19.076, lng: 72.8777 },
  { city: 'Pune', state: 'Maharashtra', pincode: '411001', lat: 18.5204, lng: 73.8567 },
  { city: 'Thane', state: 'Maharashtra', pincode: '400601', lat: 19.2183, lng: 72.9781 },
  { city: 'Navi Mumbai', state: 'Maharashtra', pincode: '400703', lat: 19.033, lng: 73.0297 },
  { city: 'Delhi', state: 'Delhi', pincode: '110001', lat: 28.7041, lng: 77.1025 },
  { city: 'Gurugram', state: 'Haryana', pincode: '122001', lat: 28.4595, lng: 77.0266 },
  { city: 'Noida', state: 'Uttar Pradesh', pincode: '201301', lat: 28.5355, lng: 77.391 },
  { city: 'Bengaluru', state: 'Karnataka', pincode: '560001', lat: 12.9716, lng: 77.5946 },
  { city: 'Hyderabad', state: 'Telangana', pincode: '500001', lat: 17.385, lng: 78.4867 },
  { city: 'Chennai', state: 'Tamil Nadu', pincode: '600001', lat: 13.0827, lng: 80.2707 },
  { city: 'Kolkata', state: 'West Bengal', pincode: '700001', lat: 22.5726, lng: 88.3639 },
  { city: 'Ahmedabad', state: 'Gujarat', pincode: '380001', lat: 23.0225, lng: 72.5714 },
  { city: 'Jaipur', state: 'Rajasthan', pincode: '302001', lat: 26.9124, lng: 75.7873 },
  { city: 'Indore', state: 'Madhya Pradesh', pincode: '452001', lat: 22.7196, lng: 75.8577 },
  { city: 'Lucknow', state: 'Uttar Pradesh', pincode: '226001', lat: 26.8467, lng: 80.9462 }
];

const FIRST_NAMES = [
  'Aarav', 'Vivaan', 'Aditya', 'Vihaan', 'Arjun', 'Sai', 'Reyansh', 'Ayaan',
  'Krishna', 'Ishaan', 'Ananya', 'Aadhya', 'Diya', 'Myra', 'Anika', 'Sara',
  'Ira', 'Aisha', 'Priya', 'Neha', 'Rahul', 'Amit', 'Suresh', 'Ramesh',
  'Kavita', 'Meera', 'Rohan', 'Nikhil', 'Pooja', 'Sneha'
];
const LAST_NAMES = [
  'Sharma', 'Patel', 'Singh', 'Kumar', 'Gupta', 'Mehta', 'Joshi', 'Reddy',
  'Nair', 'Iyer', 'Desai', 'Shah', 'Verma', 'Chopra', 'Malhotra', 'Banerjee',
  'Pillai', 'Rao', 'Kapoor', 'Jain'
];
const LOCALITIES = [
  'MG Road', 'Linking Road', 'FC Road', 'Park Street', 'Anna Salai', 'Brigade Road',
  'Banjara Hills', 'Sector 18', 'Connaught Place', 'Andheri West', 'Koramangala',
  'Salt Lake', 'Satellite', 'Civil Lines', 'Hinjewadi Phase 1', 'Whitefield',
  'Powai', 'Viman Nagar', 'Indiranagar', 'Cyber City'
];
const SLOTS = [
  '09:00 AM - 12:00 PM',
  '10:00 AM - 01:00 PM',
  '12:00 PM - 03:00 PM',
  '02:00 PM - 05:00 PM',
  '04:00 PM - 07:00 PM',
  'Anytime'
];
const PRIORITIES = ['Low', 'Medium', 'High', 'Medium', 'Medium', 'High'];
const BUDGETS = [1500, 2200, 2800, 3500, 4500, 5500, 6800, 8200, 9999, 12500];

const DESCRIPTIONS = [
  'Scheduled preventive maintenance visit for enterprise site.',
  'Customer reported intermittent fault — engineer diagnosis required.',
  'New installation as per purchase order; bring required tools.',
  'AMC visit — clean, inspect and submit service report with photos.',
  'Urgent breakdown — restore service within SLA window.',
  'Relocation / upgrade of existing equipment at customer premises.',
  'Post-warranty support call; quote any spare parts before replacing.',
  'Multi-unit campus job — check all tagged assets listed in work order.'
];

function pick(arr, i) {
  return arr[i % arr.length];
}

function phoneFor(i) {
  // Valid Indian 10-digit mobiles, unique across the 50 rows
  return String(9000000000 + i * 137 + 41).slice(0, 10);
}

function buildRows(count) {
  // Flatten catalog into (category, sub) pairs so we rotate across C01–C24
  const pairs = [];
  for (const cat of catalog) {
    for (const sub of cat.subCategories) {
      pairs.push({
        service: cat.categoryName,
        subService: sub.subCatName,
        categoryCode: cat.categoryCode,
        subCatCode: sub.subCatCode
      });
    }
  }

  const rows = [];
  for (let i = 0; i < count; i++) {
    const pair = pick(pairs, i * 3 + 7); // stride to mix categories
    const city = pick(CITIES, i * 2 + 1);
    const first = pick(FIRST_NAMES, i * 5 + 2);
    const last = pick(LAST_NAMES, i * 3 + 4);
    const locality = pick(LOCALITIES, i * 7 + 1);
    const day = 1 + (i % 28);
    const month = 8 + Math.floor(i / 28); // Aug/Sep 2026
    const preferredDate = `2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const budget = pick(BUDGETS, i);

    rows.push({
      'Customer Name': `${first} ${last}`,
      'Phone': phoneFor(i),
      'Email': `${first.toLowerCase()}.${last.toLowerCase()}${i + 1}@example.com`,
      'Address': `${10 + (i % 90)}, ${locality}, Near Landmark ${i + 1}`,
      'City': city.city,
      'State': city.state,
      'Pincode': city.pincode,
      'Latitude': city.lat + ((i % 10) * 0.001),
      'Longitude': city.lng + ((i % 10) * 0.001),
      'Service': pair.service,
      'Sub Service': pair.subService,
      'Priority': pick(PRIORITIES, i),
      'Preferred Date': preferredDate,
      'Preferred Time': pick(SLOTS, i),
      'Description': `${pick(DESCRIPTIONS, i)} [${pair.categoryCode}/${pair.subCatCode}]`,
      'Budget': budget
    });
  }
  return rows;
}

function writeFiles(rows) {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const headers = [
    'Customer Name', 'Phone', 'Email', 'Address', 'City', 'State', 'Pincode',
    'Latitude', 'Longitude', 'Service', 'Sub Service', 'Priority',
    'Preferred Date', 'Preferred Time', 'Description', 'Budget'
  ];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows, { header: headers });
  ws['!cols'] = headers.map((h) => ({ wch: Math.max(h.length + 2, 14) }));
  XLSX.utils.book_append_sheet(wb, ws, 'Bulk Jobs');
  XLSX.writeFile(wb, XLSX_OUT);

  // CSV twin
  const csvWb = XLSX.utils.book_new();
  const csvWs = XLSX.utils.json_to_sheet(rows, { header: headers });
  XLSX.utils.book_append_sheet(csvWb, csvWs, 'Bulk Jobs');
  XLSX.writeFile(csvWb, CSV_OUT, { bookType: 'csv' });
}

function validateFile(filePath) {
  const rawRows = parseRowsFromFile(filePath);
  const fakeBatch = {
    _id: new mongoose.Types.ObjectId(),
    companyId: new mongoose.Types.ObjectId(),
    batchId: 'BATCH-SAMPLE-VALIDATE',
    perJobCharge: 14.16
  };

  let valid = 0;
  let invalid = 0;
  const errors = [];
  const signatures = new Set();

  for (let i = 0; i < rawRows.length; i++) {
    const rowNum = i + 1;
    const mapped = mapHeaders(rawRows[i]);
    const fieldErrors = validateMappedRow(mapped);
    mapped.preferredDate = parsePreferredDate(mapped.preferredDate);
    mapped.priority = normalizePriority(mapped.priority);

    // Provide coords if present so schema validation can run offline
    const lat = parseFloat(mapped.latitude);
    const lng = parseFloat(mapped.longitude);
    mapped.latitude = isNaN(lat) ? 19.076 : lat;
    mapped.longitude = isNaN(lng) ? 72.8777 : lng;

    const phone = mapped.phone ? String(mapped.phone).replace(/[^0-9]/g, '') : '';
    const addr = mapped.address ? String(mapped.address).toLowerCase().trim() : '';
    const sig = `${phone}_${addr}`;
    if (phone && addr) {
      if (signatures.has(sig)) fieldErrors.push('Duplicate: identical phone + address already in this file');
      else signatures.add(sig);
    }

    const jobDoc = buildJobDocument({
      mapped,
      batch: fakeBatch,
      rowNumber: rowNum,
      isInsufficient: false
    });
    const schemaErrors = collectSchemaErrors(jobDoc);
    const all = [...fieldErrors, ...schemaErrors];

    if (all.length > 0) {
      invalid++;
      errors.push({ row: rowNum, errors: all, sample: mapped });
    } else {
      valid++;
    }
  }

  return { total: rawRows.length, valid, invalid, errors };
}

(function main() {
  console.log('Generating 50 realistic B2B bulk job rows from master catalog...');
  const rows = buildRows(50);
  writeFiles(rows);
  console.log('Wrote:', XLSX_OUT);
  console.log('Wrote:', CSV_OUT);

  console.log('\nValidating generated .xlsx with production parser...');
  const result = validateFile(XLSX_OUT);
  console.log(JSON.stringify({
    total: result.total,
    valid: result.valid,
    invalid: result.invalid,
    firstErrors: result.errors.slice(0, 5)
  }, null, 2));

  if (result.total !== 50 || result.valid !== 50 || result.invalid !== 0) {
    console.error('\nFAIL: expected 50 valid / 0 invalid');
    process.exit(1);
  }

  console.log('\nOK: 50 valid rows, 0 errors.');
  process.exit(0);
})();
