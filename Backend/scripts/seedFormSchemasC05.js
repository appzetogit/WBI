/**
 * Seed FormSchema docs for C05 Banking & Financial Devices (Excel master list).
 * Run: node scripts/seedFormSchemasC05.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const FormSchema = require('../models/FormSchema');
const MASTER_CATALOG = require('../data/masterServiceCatalog');

const commonContactFields = [
  { fieldName: 'fullName', label: 'Full Name', type: 'text', required: true, placeholder: 'Your name', displayOrder: 90 },
  { fieldName: 'phone', label: 'Phone', type: 'phone', required: true, placeholder: '10-digit mobile', displayOrder: 91 },
  { fieldName: 'email', label: 'Email', type: 'email', required: true, placeholder: 'you@email.com', displayOrder: 92 },
  { fieldName: 'city', label: 'City', type: 'text', required: true, placeholder: 'City', displayOrder: 93 },
  { fieldName: 'siteAddress', label: 'Site / Branch Address', type: 'textarea', required: true, placeholder: 'Full address', displayOrder: 94 },
  { fieldName: 'preferredDate', label: 'Preferred Date', type: 'date', required: true, displayOrder: 95 },
  { fieldName: 'preferredTime', label: 'Preferred Time Slot', type: 'dropdown', required: true, options: ['Morning (9–12)', 'Afternoon (12–4)', 'Evening (4–8)'], displayOrder: 96 },
  { fieldName: 'urgency', label: 'Urgency', type: 'dropdown', required: true, options: ['Normal', 'Urgent', 'Emergency'], displayOrder: 97 }
];

const bankingFields = [
  { fieldName: 'bankName', label: 'Bank / Institution Name', type: 'text', required: true, placeholder: 'e.g. SBI, HDFC', displayOrder: 1 },
  { fieldName: 'branchCode', label: 'Branch Code', type: 'text', required: false, placeholder: 'Optional', displayOrder: 2 },
  { fieldName: 'deviceBrand', label: 'Device Brand / Model', type: 'text', required: false, placeholder: 'e.g. NCR, Diebold', displayOrder: 3 },
  { fieldName: 'issueDescription', label: 'Issue / Requirement', type: 'textarea', required: true, placeholder: 'Describe the work needed', displayOrder: 4 },
  ...commonContactFields
];

const ICONS = {
  'C05-01': 'FiServer',
  'C05-02': 'FiCreditCard',
  'C05-03': 'FiUserCheck',
  'C05-04': 'FiDollarSign',
  'C05-05': 'FiPrinter',
  'C05-06': 'FiCpu'
};

const PRICES = {
  'C05-01': 4999,
  'C05-02': 1999,
  'C05-03': 2499,
  'C05-04': 5999,
  'C05-05': 3499,
  'C05-06': 2999
};

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set');
  await mongoose.connect(uri, { family: 4, serverSelectionTimeoutMS: 30000 });

  const c05 = MASTER_CATALOG.find((c) => c.categoryCode === 'C05');
  if (!c05) throw new Error('C05 missing from master catalog');

  let upserted = 0;
  for (const sub of c05.subCategories) {
    await FormSchema.findOneAndUpdate(
      { subCatCode: sub.subCatCode },
      {
        $set: {
          categoryCode: 'C05',
          categoryName: 'Banking & Financial Devices',
          subCatCode: sub.subCatCode,
          subCategoryName: sub.subCatName,
          description: `${sub.subCatName} request`,
          iconName: ICONS[sub.subCatCode] || 'FiBriefcase',
          basePrice: PRICES[sub.subCatCode] || 2999,
          fields: bankingFields,
          isActive: true
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    upserted += 1;
    console.log(`Upserted ${sub.subCatCode} — ${sub.subCatName}`);
  }

  console.log(`C05 FormSchema seed complete: ${upserted}`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
