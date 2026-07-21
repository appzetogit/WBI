/**
 * Seed FormSchema docs for C03 Networking & Internet (8 sub-services).
 * Run: node scripts/seedFormSchemasC03.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const FormSchema = require('../models/FormSchema');

const commonContactFields = [
  { fieldName: 'fullName', label: 'Full Name', type: 'text', required: true, placeholder: 'Your name', displayOrder: 90 },
  { fieldName: 'phone', label: 'Phone', type: 'phone', required: true, placeholder: '10-digit mobile', displayOrder: 91 },
  { fieldName: 'email', label: 'Email', type: 'email', required: true, placeholder: 'you@email.com', displayOrder: 92 },
  { fieldName: 'city', label: 'City', type: 'text', required: true, placeholder: 'City', displayOrder: 93 },
  { fieldName: 'siteAddress', label: 'Site Address', type: 'textarea', required: true, placeholder: 'Full address', displayOrder: 94 },
  { fieldName: 'preferredDate', label: 'Preferred Date', type: 'date', required: true, displayOrder: 95 },
  { fieldName: 'preferredTime', label: 'Preferred Time Slot', type: 'dropdown', required: true, options: ['Morning (9–12)', 'Afternoon (12–4)', 'Evening (4–8)'], displayOrder: 96 }
];

const C03 = [
  {
    subCatCode: 'C03-01',
    subCategoryName: 'Router & Modem Setup',
    description: 'ISP router/modem installation and configuration',
    iconName: 'FiWifi',
    basePrice: 799,
    fields: [
      { fieldName: 'ispName', label: 'Existing ISP Name', type: 'text', required: true, placeholder: 'e.g. JioFiber, Airtel', displayOrder: 1 },
      { fieldName: 'connectionType', label: 'Connection Type', type: 'dropdown', required: true, options: ['Broadband', 'Fiber', '4G/5G', 'Not sure'], displayOrder: 2 },
      { fieldName: 'deviceCount', label: 'Devices to Connect', type: 'number', required: true, validation: { min: 1, max: 200 }, displayOrder: 3 },
      { fieldName: 'routerProvided', label: 'Router Provided By', type: 'dropdown', required: true, options: ['ISP', 'Self-purchased', 'Need recommendation'], displayOrder: 4 },
      { fieldName: 'issueDescription', label: 'Issue / Requirement', type: 'textarea', required: true, placeholder: 'Describe setup needs', displayOrder: 5 },
      ...commonContactFields
    ]
  },
  {
    subCatCode: 'C03-02',
    subCategoryName: 'WiFi Range Extension',
    description: 'Extend WiFi coverage across rooms and floors',
    iconName: 'FiWifi',
    basePrice: 999,
    fields: [
      { fieldName: 'routerBrand', label: 'Current Router Brand', type: 'text', required: true, placeholder: 'e.g. TP-Link, Netgear', displayOrder: 1 },
      { fieldName: 'roomsNeedingCoverage', label: 'Rooms Needing Coverage', type: 'number', required: true, validation: { min: 1, max: 50 }, displayOrder: 2 },
      { fieldName: 'buildingMaterial', label: 'Building Material', type: 'dropdown', required: true, options: ['Concrete', 'Brick', 'Wood', 'Mixed'], displayOrder: 3 },
      { fieldName: 'floorsCount', label: 'Number of Floors', type: 'number', required: true, validation: { min: 1, max: 50 }, displayOrder: 4 },
      { fieldName: 'currentDeadZones', label: 'Current Dead Zones', type: 'textarea', required: false, placeholder: 'Where signal is weak', displayOrder: 5 },
      ...commonContactFields
    ]
  },
  {
    subCatCode: 'C03-03',
    subCategoryName: 'Structured Cabling (LAN)',
    description: 'CAT6/fiber structured cabling for offices',
    iconName: 'FiLink',
    basePrice: 2499,
    fields: [
      { fieldName: 'portCount', label: 'Number of Network Points', type: 'number', required: true, validation: { min: 1, max: 500 }, displayOrder: 1 },
      { fieldName: 'cableType', label: 'Preferred Cable', type: 'dropdown', required: true, options: ['CAT6', 'CAT6A', 'Fiber', 'Mixed'], displayOrder: 2 },
      { fieldName: 'buildingType', label: 'Building Type', type: 'dropdown', required: true, options: ['Office', 'Warehouse', 'Retail', 'Residential', 'Other'], displayOrder: 3 },
      { fieldName: 'floorsCount', label: 'Floors to Cover', type: 'number', required: true, validation: { min: 1, max: 50 }, displayOrder: 4 },
      { fieldName: 'rackAvailable', label: 'Rack Available?', type: 'dropdown', required: true, options: ['Yes', 'No', 'Need to install'], displayOrder: 5 },
      { fieldName: 'notes', label: 'Additional Notes', type: 'textarea', required: false, displayOrder: 6 },
      ...commonContactFields
    ]
  },
  {
    subCatCode: 'C03-04',
    subCategoryName: 'Switch & Access Point Installation',
    description: 'Managed switches and WiFi AP deployment',
    iconName: 'FiServer',
    basePrice: 1999,
    fields: [
      { fieldName: 'switchCount', label: 'Switches Required', type: 'number', required: true, validation: { min: 0, max: 50 }, displayOrder: 1 },
      { fieldName: 'apCount', label: 'Access Points Required', type: 'number', required: true, validation: { min: 0, max: 100 }, displayOrder: 2 },
      { fieldName: 'poeNeeded', label: 'PoE Required?', type: 'dropdown', required: true, options: ['Yes', 'No', 'Not sure'], displayOrder: 3 },
      { fieldName: 'brandPreference', label: 'Brand Preference', type: 'dropdown', required: false, options: ['Cisco', 'Ubiquiti', 'TP-Link', 'MikroTik', 'No preference'], displayOrder: 4 },
      { fieldName: 'notes', label: 'Requirements', type: 'textarea', required: false, displayOrder: 5 },
      ...commonContactFields
    ]
  },
  {
    subCatCode: 'C03-05',
    subCategoryName: 'Network Troubleshooting',
    description: 'Diagnose and fix network outages / slow speeds',
    iconName: 'FiTool',
    basePrice: 699,
    fields: [
      { fieldName: 'issueType', label: 'Issue Type', type: 'dropdown', required: true, options: ['No internet', 'Slow speed', 'Intermittent drops', 'LAN only issue', 'WiFi only issue', 'Other'], displayOrder: 1 },
      { fieldName: 'urgency', label: 'Urgency', type: 'dropdown', required: true, options: ['Normal', 'Urgent', 'Critical — business down'], displayOrder: 2 },
      { fieldName: 'affectedDevices', label: 'Affected Devices', type: 'number', required: false, validation: { min: 1, max: 500 }, displayOrder: 3 },
      { fieldName: 'issueStarted', label: 'When Did It Start?', type: 'text', required: false, placeholder: 'e.g. Today morning', displayOrder: 4 },
      { fieldName: 'issueDescription', label: 'Describe the Issue', type: 'textarea', required: true, displayOrder: 5 },
      ...commonContactFields
    ]
  },
  {
    subCatCode: 'C03-06',
    subCategoryName: 'VPN Setup',
    description: 'Site-to-site or remote VPN configuration',
    iconName: 'FiLock',
    basePrice: 1499,
    fields: [
      { fieldName: 'vpnType', label: 'VPN Type', type: 'dropdown', required: true, options: ['Remote access (users)', 'Site-to-site', 'Both', 'Not sure'], displayOrder: 1 },
      { fieldName: 'userCount', label: 'Remote Users', type: 'number', required: false, validation: { min: 1, max: 500 }, displayOrder: 2 },
      { fieldName: 'sitesCount', label: 'Number of Sites', type: 'number', required: false, validation: { min: 1, max: 50 }, displayOrder: 3 },
      { fieldName: 'firewallBrand', label: 'Firewall / Router Brand', type: 'text', required: false, placeholder: 'e.g. Fortinet, Sophos', displayOrder: 4 },
      { fieldName: 'notes', label: 'Requirements', type: 'textarea', required: true, displayOrder: 5 },
      ...commonContactFields
    ]
  },
  {
    subCatCode: 'C03-07',
    subCategoryName: 'CCTV-Network Integration',
    description: 'Integrate CCTV cameras with existing LAN/WiFi',
    iconName: 'FiVideo',
    basePrice: 1799,
    fields: [
      { fieldName: 'cameraCount', label: 'Number of CCTV Cameras', type: 'number', required: true, validation: { min: 1, max: 500 }, displayOrder: 1 },
      { fieldName: 'dvrNvrBrand', label: 'Existing DVR/NVR Brand', type: 'text', required: true, placeholder: 'e.g. Hikvision, Dahua', displayOrder: 2 },
      { fieldName: 'networkType', label: 'Network Type', type: 'dropdown', required: true, options: ['LAN', 'WiFi', 'Mixed'], displayOrder: 3 },
      { fieldName: 'buildingLayout', label: 'Building Layout', type: 'dropdown', required: true, options: ['Single floor', 'Multi floor', 'Campus / multiple buildings'], displayOrder: 4 },
      { fieldName: 'poeAvailable', label: 'PoE Switch Available?', type: 'dropdown', required: true, options: ['Yes', 'No', 'Need to install'], displayOrder: 5 },
      { fieldName: 'notes', label: 'Additional Details', type: 'textarea', required: false, displayOrder: 6 },
      ...commonContactFields
    ]
  },
  {
    subCatCode: 'C03-08',
    subCategoryName: 'Office Network Setup',
    description: 'End-to-end office LAN + WiFi setup',
    iconName: 'FiMonitor',
    basePrice: 4999,
    fields: [
      { fieldName: 'employeeCount', label: 'Approx. Employees', type: 'number', required: true, validation: { min: 1, max: 5000 }, displayOrder: 1 },
      { fieldName: 'workstations', label: 'Workstations / Desktops', type: 'number', required: true, validation: { min: 1, max: 2000 }, displayOrder: 2 },
      { fieldName: 'floorsCount', label: 'Number of Floors', type: 'number', required: true, validation: { min: 1, max: 50 }, displayOrder: 3 },
      { fieldName: 'needs', label: 'What Do You Need?', type: 'multiselect', required: true, options: ['LAN cabling', 'WiFi', 'Switches', 'Firewall', 'Server rack', 'Internet / ISP help'], displayOrder: 4 },
      { fieldName: 'goLiveDate', label: 'Target Go-Live', type: 'date', required: false, displayOrder: 5 },
      { fieldName: 'notes', label: 'Project Notes', type: 'textarea', required: false, displayOrder: 6 },
      ...commonContactFields
    ]
  }
].map((s) => ({
  categoryCode: 'C03',
  categoryName: 'Networking & Internet',
  ...s,
  isActive: true
}));

async function run() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) throw new Error('MONGODB_URI missing');
  await mongoose.connect(uri);

  for (const doc of C03) {
    await FormSchema.findOneAndUpdate(
      { subCatCode: doc.subCatCode },
      { $set: doc },
      { upsert: true, new: true }
    );
    console.log('Upserted', doc.subCatCode, doc.subCategoryName);
  }

  console.log('Done. C03 form schemas:', C03.length);
  await mongoose.disconnect();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
