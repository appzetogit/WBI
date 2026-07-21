/**
 * Seed master service_configs for dynamic Vendor Panel
 * npm run seed:service-configs
 */
require('dotenv').config();
const mongoose = require('mongoose');
const ServiceConfig = require('../models/ServiceConfig');
const MASTER_CATALOG = require('../data/masterServiceCatalog');

const catalogByCode = Object.fromEntries(MASTER_CATALOG.map((c) => [c.categoryCode, c]));
const attachSubs = (svc) => {
  const master = catalogByCode[svc.categoryCode];
  if (!master) return svc;
  return {
    ...svc,
    categoryName: master.categoryName || svc.categoryName,
    matchAliases: master.matchAliases || svc.matchAliases || [],
    subCategories: (master.subCategories || []).map((s) => ({
      subCatCode: s.subCatCode,
      subCatName: s.subCatName,
      isActive: true
    }))
  };
};

const milestones = (titles, percents = null) => {
  const equal = Math.floor(100 / titles.length);
  const remainder = 100 - equal * titles.length;
  return titles.map((title, i) => ({
    order: i + 1,
    title: typeof title === 'string' ? title : title.title,
    description: typeof title === 'string' ? `${title} phase` : (title.description || ''),
    defaultDays: typeof title === 'object' && title.defaultDays ? title.defaultDays : 1,
    paymentPercent: percents ? percents[i] : (i === 0 ? 0 : equal + (i === titles.length - 1 ? remainder : 0)),
    proofRequired: true,
    proofTypes: ['photos', 'checklist']
  }));
};

const checklist = (items) => items.map((item) => ({
  item: typeof item === 'string' ? item : item.item,
  required: typeof item === 'object' ? item.required !== false : true
}));

const inventory = (items) => items.map((row) => {
  if (typeof row === 'string') return { name: row, unit: 'piece', lowStockThreshold: 5, icon: 'box' };
  return {
    name: row.name,
    unit: row.unit || 'piece',
    lowStockThreshold: row.lowStockThreshold ?? 5,
    icon: row.icon || 'box'
  };
});

const tools = (items) => items.map((row) => {
  if (typeof row === 'string') return { name: row, type: 'hand_tool' };
  return { name: row.name, type: row.type || 'hand_tool' };
});

const compliance = (items) => items.map((row) => {
  if (typeof row === 'string') return { name: row, required: true, expiryTracked: false, renewalDays: 365 };
  return {
    name: row.name,
    required: row.required !== false,
    expiryTracked: !!row.expiryTracked,
    renewalDays: row.renewalDays || 365
  };
});

const assetFields = (fields) => fields.map((f) => {
  if (typeof f === 'string') return { field: f, label: f, required: false };
  return f;
});

const SERVICES = [
  {
    categoryCode: 'C01',
    categoryName: 'CCTV & Surveillance',
    matchAliases: ['CCTV', 'SURVEILLANCE', 'CAMERA'],
    icon: 'cctv',
    color: '#3B82F6',
    extraKPIs: [
      { key: 'camerasInstalled', label: 'Cameras Installed', unit: 'units', icon: 'camera', color: 'blue', dataSource: 'installed_assets', countField: 'assetType', countValue: 'camera' },
      { key: 'sitesCovered', label: 'Sites Covered', unit: 'sites', icon: 'map-pin', color: 'green', dataSource: 'projects', countField: 'status', countValue: 'completed' }
    ],
    inventoryCategories: inventory([
      { name: 'IP Camera', icon: 'camera' }, { name: 'Dome Camera', icon: 'camera' },
      { name: 'DVR / NVR', icon: 'server', lowStockThreshold: 2 }, { name: 'CAT6 Cable', unit: 'meter', lowStockThreshold: 100, icon: 'cable' },
      { name: 'Camera Mount', lowStockThreshold: 10 }, { name: 'BNC Connector', lowStockThreshold: 50 },
      { name: 'Power Supply Unit', lowStockThreshold: 3 }, { name: 'Junction Box', lowStockThreshold: 10 }
    ]),
    toolCategories: tools([
      { name: 'Crimping Tool', type: 'hand_tool' }, { name: 'Cable Tester', type: 'testing_equipment' },
      { name: 'Ladder 8ft', type: 'heavy_equipment' }, { name: 'Drill Machine', type: 'power_tool' },
      { name: 'CCTV Tester Monitor', type: 'testing_equipment' }, 'Wire Stripper', 'Screwdriver Set'
    ]),
    projectMilestones: milestones([
      { title: 'Site Survey', description: 'Survey location, plan camera positions, measure cable runs', defaultDays: 1 },
      { title: 'Cable Laying', description: 'Run CAT6/coaxial cables from cameras to DVR location', defaultDays: 2 },
      { title: 'Camera Installation', description: 'Mount cameras, connect cables, adjust angles' },
      { title: 'DVR/NVR Configuration', description: 'Setup DVR, configure recording, motion detection' },
      { title: 'Live Testing', description: 'Test live feed, night vision, remote access' },
      { title: 'Handover', description: 'Client walkthrough, training, sign-off' }
    ], [0, 20, 30, 20, 20, 10]),
    siteChecklist: checklist([
      'Camera angles verified', 'Night vision working', 'DVR recording confirmed',
      'Remote viewing setup', { item: 'Motion alerts configured', required: false },
      'Cable channels properly closed', 'Client trained on playback', 'Warranty cards handed over'
    ]),
    complianceDocs: compliance([
      { name: 'Electrical Safety Certificate', required: true, expiryTracked: true },
      { name: 'Work at Height Permit', required: false },
      'Company Registration'
    ]),
    assetFields: assetFields([
      { field: 'serialNumber', label: 'Serial Number', required: true },
      { field: 'brand', label: 'Brand', required: true },
      { field: 'model', label: 'Model', required: true },
      { field: 'resolution', label: 'Resolution', required: false },
      { field: 'warrantyYears', label: 'Warranty (Years)', required: true },
      { field: 'installationHeight', label: 'Height (ft)', required: false }
    ]),
    opportunityMatchFields: ['totalSites', 'cameraCount', 'storageRequired', 'indoorOutdoor']
  },
  {
    categoryCode: 'C02',
    categoryName: 'IT & Computer Services',
    icon: 'monitor',
    color: '#6366F1',
    extraKPIs: [
      { key: 'devicesServiced', label: 'Devices Serviced', unit: 'devices', icon: 'monitor', color: 'indigo', dataSource: 'projects', countField: 'status', countValue: 'completed' },
      { key: 'ticketsResolved', label: 'Tickets Resolved', unit: 'tickets', icon: 'check', color: 'green', dataSource: 'quality_issues', countField: 'status', countValue: 'resolved' }
    ],
    inventoryCategories: inventory(['RAM', 'SSD', 'HDD', 'Thermal Paste', 'Power Supply', 'Keyboard', 'Mouse', 'USB Drive', 'Network Card', 'Monitor']),
    toolCategories: tools(['Screwdriver Set', { name: 'Anti-static Mat', type: 'safety' }, { name: 'USB Bootable Drive', type: 'testing_equipment' }, { name: 'Multimeter', type: 'testing_equipment' }, { name: 'Cable Tester', type: 'testing_equipment' }]),
    projectMilestones: milestones(['Assessment', 'Procurement', 'Installation', 'Config', 'Testing', 'User Training', 'Handover']),
    siteChecklist: checklist(['Boot test', 'Speed benchmark', 'Data backup verified', 'All software licensed', 'User training done']),
    complianceDocs: compliance(['IT Certification', 'Data Privacy Policy', 'NDA Template']),
    assetFields: assetFields([
      { field: 'serialNumber', label: 'Serial Number', required: true },
      { field: 'brand', label: 'Brand', required: true },
      { field: 'model', label: 'Model', required: true },
      { field: 'warrantyYears', label: 'Warranty (Years)', required: true }
    ]),
    opportunityMatchFields: ['deviceCount', 'ticketVolume']
  },
  {
    categoryCode: 'C03',
    categoryName: 'Networking & Internet',
    icon: 'network',
    color: '#0EA5E9',
    extraKPIs: [
      { key: 'networkPointsLive', label: 'Network Points Live', unit: 'points', icon: 'wifi', color: 'sky', dataSource: 'installed_assets', countField: 'assetType', countValue: 'network' },
      { key: 'bandwidthDelivered', label: 'Bandwidth Delivered', unit: 'Mbps', icon: 'activity', color: 'blue', dataSource: 'projects', countField: 'status', countValue: 'completed', aggregation: 'sum' }
    ],
    inventoryCategories: inventory(['Router', 'Switch', 'Patch Panel', { name: 'CAT6 Cable', unit: 'meter', lowStockThreshold: 100 }, 'RJ45 Connectors', 'Rack Cabinet', 'Fiber Cable', 'Media Converter', 'Keystone Jack', 'Face Plate']),
    toolCategories: tools([
      { name: 'Cable Crimper', type: 'hand_tool' }, { name: 'Cable Tester', type: 'testing_equipment' },
      { name: 'Network Analyzer', type: 'testing_equipment' }, { name: 'Punch Down Tool', type: 'hand_tool' },
      { name: 'Fiber Splicer', type: 'power_tool' }, { name: 'OTDR Tester', type: 'testing_equipment' }
    ]),
    projectMilestones: milestones(['Survey', 'Cabling', 'Equipment Rack Setup', 'Device Config', 'Speed Test', 'Handover']),
    siteChecklist: checklist(['All ports live', 'Speed test passed', 'VPN working', 'Config backup saved', 'Documentation complete']),
    complianceDocs: compliance(['Network Engineering Cert', 'ISP Agreement Copy']),
    assetFields: assetFields([
      { field: 'serialNumber', label: 'Serial Number', required: true },
      { field: 'brand', label: 'Brand', required: true },
      { field: 'model', label: 'Model', required: true },
      { field: 'ports', label: 'Ports', required: false },
      { field: 'warrantyYears', label: 'Warranty (Years)', required: true }
    ]),
    opportunityMatchFields: ['portCount', 'bandwidthMbps']
  },
  {
    categoryCode: 'C04',
    categoryName: 'Energy & Power Backup',
    icon: 'sun',
    color: '#F59E0B',
    extraKPIs: [
      { key: 'kwInstalled', label: 'kW Installed', unit: 'kW', icon: 'sun', color: 'amber', dataSource: 'installed_assets', countField: 'assetType', countValue: 'solar', aggregation: 'sum' },
      { key: 'unitsGenerated', label: 'Units Generated Today', unit: 'kWh', icon: 'zap', color: 'yellow', dataSource: 'projects', countField: 'status', countValue: 'completed' }
    ],
    inventoryCategories: inventory(['Solar Panel', 'String Inverter', 'Battery Bank', 'MC4 Connector', { name: 'DC Cable', unit: 'meter', lowStockThreshold: 50 }, { name: 'AC Cable', unit: 'meter', lowStockThreshold: 50 }, 'Mounting Structure', 'Net Meter', 'Junction Box', 'DC Fuse', 'AC Isolator']),
    toolCategories: tools([
      { name: 'MC4 Crimping Tool', type: 'hand_tool' }, { name: 'Multimeter', type: 'testing_equipment' },
      { name: 'Clamp Meter', type: 'testing_equipment' }, { name: 'Drill', type: 'power_tool' },
      { name: 'Safety Harness', type: 'safety' }, { name: 'Torque Wrench', type: 'hand_tool' },
      { name: 'Solar Irradiance Meter', type: 'testing_equipment' }
    ]),
    projectMilestones: milestones(['Site Survey', 'Foundation/Structure', 'Panel Mounting', 'DC Wiring', 'Inverter Installation', 'AC Wiring', 'Grid Connection', 'Commissioning'], [0, 15, 20, 15, 15, 10, 15, 10]),
    siteChecklist: checklist(['Panel tilt angle correct', 'DC voltage measured', 'AC output verified', 'Grid sync confirmed', 'Monitoring app connected', 'DISCOM inspection done']),
    complianceDocs: compliance([
      { name: 'Electrical License', required: true, expiryTracked: true },
      { name: 'Net Metering Approval', required: true, expiryTracked: true },
      'DISCOM NOC', 'CEA Certificate'
    ]),
    assetFields: assetFields([
      { field: 'serialNumber', label: 'Serial Number', required: true },
      { field: 'brand', label: 'Brand', required: true },
      { field: 'model', label: 'Model', required: true },
      { field: 'wattPeak', label: 'Watt Peak', required: true },
      { field: 'efficiencyPercent', label: 'Efficiency %', required: false },
      { field: 'warrantyYears', label: 'Warranty (Years)', required: true },
      { field: 'installationAngle', label: 'Installation Angle', required: false }
    ]),
    opportunityMatchFields: ['systemKw', 'roofArea']
  },
  {
    categoryCode: 'C05',
    categoryName: 'Banking & Financial Devices',
    icon: 'landmark',
    color: '#10B981',
    extraKPIs: [
      { key: 'atmsUnderAmc', label: 'ATMs Under AMC', unit: 'ATMs', icon: 'landmark', color: 'emerald', dataSource: 'installed_assets', countField: 'assetType', countValue: 'atm' },
      { key: 'devicesServicedMonth', label: 'Devices Serviced This Month', unit: 'devices', icon: 'wrench', color: 'green', dataSource: 'projects', countField: 'status', countValue: 'completed' }
    ],
    inventoryCategories: inventory(['Cash Cassette', 'ATM Rollers', 'Receipt Paper', 'Cleaning Kit', 'POS Paper Roll', 'Biometric Sensor', 'Keyboard Overlay', 'Card Dip Module']),
    toolCategories: tools([{ name: 'ATM Service Toolkit', type: 'hand_tool' }, { name: 'Diagnostic Laptop', type: 'testing_equipment' }, { name: 'Cleaning Equipment', type: 'hand_tool' }, { name: 'Card Tester', type: 'testing_equipment' }]),
    projectMilestones: milestones(['Dispatch', 'Site Reach', 'Diagnosis', 'Part Replacement', 'Testing', 'Audit Log', 'Sign-off']),
    siteChecklist: checklist(['Cash dispense test', 'Receipt print OK', 'Network connectivity confirmed', 'Audit trail updated', 'Security seal intact']),
    complianceDocs: compliance([
      { name: 'Bank Empanelment Letter', required: true, expiryTracked: true },
      'NDA', { name: 'Police Verification Certificate', required: true, expiryTracked: true }, 'Company Registration'
    ]),
    assetFields: assetFields([
      { field: 'serialNumber', label: 'Serial Number', required: true },
      { field: 'brand', label: 'Brand', required: true },
      { field: 'model', label: 'Model', required: true },
      { field: 'bankBranch', label: 'Bank Branch', required: true }
    ]),
    opportunityMatchFields: ['atmCount', 'bankName']
  },
  {
    categoryCode: 'C07',
    categoryName: 'Security Systems',
    icon: 'shield',
    color: '#EF4444',
    extraKPIs: [
      { key: 'devicesInstalled', label: 'Devices Installed', unit: 'devices', icon: 'shield', color: 'red', dataSource: 'installed_assets', countField: 'assetType', countValue: 'security' },
      { key: 'zonesConfigured', label: 'Zones Configured', unit: 'zones', icon: 'map', color: 'orange', dataSource: 'projects', countField: 'status', countValue: 'completed' }
    ],
    inventoryCategories: inventory(['Access Controller', 'EM Lock', 'Card Reader', 'Door Sensor', 'Fire Panel', 'Smoke Detector', 'Heat Detector', 'Siren', 'Strobe Light', 'Call Point', 'Break Glass Unit']),
    toolCategories: tools(['Programming Cable', 'Drill', 'Wire Stripper', { name: 'Multimeter', type: 'testing_equipment' }, { name: 'Gas Detector Tester', type: 'testing_equipment' }]),
    projectMilestones: milestones(['Survey', 'Cable Layout', 'Device Installation', 'Programming', 'System Integration', 'Fire/Access Test', 'Handover']),
    siteChecklist: checklist(['Access control test', 'Fire alarm test', 'All zones configured', 'Remote arm/disarm', 'Emergency override tested', 'User codes programmed']),
    complianceDocs: compliance([
      { name: 'Security Agency License', required: true, expiryTracked: true },
      'Police NOC', { name: 'Fire NOC', required: false, expiryTracked: true }
    ]),
    assetFields: assetFields([
      { field: 'serialNumber', label: 'Serial Number', required: true },
      { field: 'brand', label: 'Brand', required: true },
      { field: 'model', label: 'Model', required: true },
      { field: 'zoneId', label: 'Zone ID', required: false }
    ]),
    opportunityMatchFields: ['deviceCount', 'zoneCount']
  },
  {
    categoryCode: 'C08',
    categoryName: 'Telecom & Communication',
    icon: 'phone',
    color: '#8B5CF6',
    extraKPIs: [
      { key: 'linesInstalled', label: 'Lines Installed', unit: 'lines', icon: 'phone', color: 'violet', dataSource: 'installed_assets', countField: 'assetType', countValue: 'telecom' },
      { key: 'extensionsActive', label: 'Extensions Active', unit: 'ext', icon: 'hash', color: 'purple', dataSource: 'installed_assets', countField: 'assetType', countValue: 'extension' }
    ],
    inventoryCategories: inventory(['IP Phone', 'EPABX Unit', 'Patch Cable', 'Voice Cable', 'RJ11 Connector', 'Headset', 'Router', 'PoE Switch']),
    toolCategories: tools([{ name: 'Cable Tester', type: 'testing_equipment' }, 'Punch Down Tool', { name: 'Phone Line Tester', type: 'testing_equipment' }, 'Screwdriver Set']),
    projectMilestones: milestones(['Survey', 'Cable Run', 'EPABX Install', 'Extension Config', 'IVR Setup', 'Testing', 'Training', 'Handover']),
    siteChecklist: checklist(['All extensions working', 'IVR configured', 'Call recording setup', 'External lines connected', 'Hunt group configured']),
    complianceDocs: compliance(['DOT License Copy', 'ISP Agreement']),
    assetFields: assetFields([
      { field: 'serialNumber', label: 'Serial Number', required: true },
      { field: 'brand', label: 'Brand', required: true },
      { field: 'extensionNumber', label: 'Extension Number', required: false }
    ]),
    opportunityMatchFields: ['extensionCount', 'trunkLines']
  },
  {
    categoryCode: 'C10',
    categoryName: 'Healthcare Equipment',
    icon: 'heart-pulse',
    color: '#EC4899',
    extraKPIs: [
      { key: 'equipmentUnderAmc', label: 'Equipment Under AMC', unit: 'units', icon: 'heart', color: 'pink', dataSource: 'installed_assets', countField: 'assetType', countValue: 'medical' },
      { key: 'calibrationsDone', label: 'Calibrations Done', unit: 'certs', icon: 'file-check', color: 'rose', dataSource: 'quality_proofs', countField: 'status', countValue: 'approved' }
    ],
    inventoryCategories: inventory(['Calibration Kit', 'O2 Regulator', 'Medical Consumables', 'Spare Sensors', 'Cleaning Supplies', 'Sterilization Kit']),
    toolCategories: tools([{ name: 'Calibration Equipment', type: 'testing_equipment' }, { name: 'Medical Device Tester', type: 'testing_equipment' }, { name: 'Digital Multimeter', type: 'testing_equipment' }, { name: 'Manometer', type: 'testing_equipment' }]),
    projectMilestones: milestones(['Equipment Inspection', 'Diagnosis', 'Part Replacement', 'Calibration', 'Performance Test', 'Certificate Issue']),
    siteChecklist: checklist(['Calibration certificate issued', 'Output levels within spec', 'Safety check done', 'Service log updated', 'Next service date set']),
    complianceDocs: compliance([
      { name: 'BMCE Registration', required: true, expiryTracked: true },
      { name: 'Medical Device License', required: true, expiryTracked: true },
      'Bio-Medical Engineering Certificate'
    ]),
    assetFields: assetFields([
      { field: 'serialNumber', label: 'Serial Number', required: true },
      { field: 'brand', label: 'Brand', required: true },
      { field: 'model', label: 'Model', required: true },
      { field: 'calibrationDue', label: 'Calibration Due', required: true }
    ]),
    opportunityMatchFields: ['equipmentType', 'amcRequired']
  },
  {
    categoryCode: 'C11',
    categoryName: 'Agricultural Machinery',
    icon: 'tractor',
    color: '#84CC16',
    extraKPIs: [
      { key: 'machinesServiced', label: 'Machines Serviced', unit: 'machines', icon: 'wrench', color: 'lime', dataSource: 'projects', countField: 'status', countValue: 'completed' },
      { key: 'acresCovered', label: 'Acres Covered', unit: 'acres', icon: 'map', color: 'green', dataSource: 'projects', countField: 'status', countValue: 'completed' }
    ],
    inventoryCategories: inventory(['Engine Oil', 'Filters', 'Belts', 'Bearings', 'Spark Plug', 'Fuel Injector', 'Hydraulic Oil', 'Tyre Repair Kit', 'Welding Rod']),
    toolCategories: tools([{ name: 'Torque Wrench', type: 'hand_tool' }, { name: 'Hydraulic Jack', type: 'heavy_equipment' }, { name: 'Diesel Injector Tester', type: 'testing_equipment' }, { name: 'Compression Tester', type: 'testing_equipment' }, { name: 'Welding Machine', type: 'power_tool' }]),
    projectMilestones: milestones(['Breakdown Call', 'Site Reach', 'Diagnosis', 'Part Procurement', 'Repair', 'Trial Run', 'Sign-off']),
    siteChecklist: checklist(['Engine running smooth', 'All functions tested', 'Fluid levels topped', 'Trial run done', 'Field test completed']),
    complianceDocs: compliance(['Technician Trade Certificate', 'Equipment Handling License']),
    assetFields: assetFields([
      { field: 'serialNumber', label: 'Serial Number', required: true },
      { field: 'brand', label: 'Brand', required: true },
      { field: 'model', label: 'Model', required: true },
      { field: 'engineHours', label: 'Engine Hours', required: false }
    ]),
    opportunityMatchFields: ['machineType', 'farmSize']
  },
  {
    categoryCode: 'C15',
    categoryName: 'Office & Commercial Equipment',
    icon: 'printer',
    color: '#64748B',
    extraKPIs: [
      { key: 'devicesUnderAmc', label: 'Devices Under AMC', unit: 'devices', icon: 'printer', color: 'slate', dataSource: 'installed_assets', countField: 'assetType', countValue: 'office' },
      { key: 'serviceCallsResolved', label: 'Service Calls Resolved', unit: 'calls', icon: 'check', color: 'green', dataSource: 'projects', countField: 'status', countValue: 'completed' }
    ],
    inventoryCategories: inventory(['Toner Cartridge', 'Drum Unit', 'Fuser Kit', 'Copier Paper', 'Shredder Bags', 'Projector Lamp', 'HDMI Cable']),
    toolCategories: tools(['Screwdriver Set', { name: 'Compressed Air Can', type: 'hand_tool' }, { name: 'Multimeter', type: 'testing_equipment' }, { name: 'Printer Service Kit', type: 'hand_tool' }, { name: 'Diagnostic USB', type: 'testing_equipment' }]),
    projectMilestones: milestones(['Complaint Received', 'Site Visit', 'Diagnosis', 'Part Order', 'Repair', 'Test Print', 'Sign-off']),
    siteChecklist: checklist(['Print quality test', 'All functions working', 'AMC log updated', 'Next service scheduled']),
    complianceDocs: compliance(['Manufacturer Authorization Letter', 'Company Registration']),
    assetFields: assetFields([
      { field: 'serialNumber', label: 'Serial Number', required: true },
      { field: 'brand', label: 'Brand', required: true },
      { field: 'model', label: 'Model', required: true }
    ]),
    opportunityMatchFields: ['deviceType', 'amcRequired']
  },
  {
    categoryCode: 'C16',
    categoryName: 'Industrial Machinery & Automation',
    icon: 'factory',
    color: '#78716C',
    extraKPIs: [
      { key: 'industrialMachinesServiced', label: 'Machines Serviced', unit: 'machines', icon: 'factory', color: 'stone', dataSource: 'projects', countField: 'status', countValue: 'completed' },
      { key: 'downtimeHoursSaved', label: 'Downtime Hours Saved', unit: 'hours', icon: 'clock', color: 'orange', dataSource: 'projects', countField: 'status', countValue: 'completed' }
    ],
    inventoryCategories: inventory(['Bearings', 'V-Belts', 'Gaskets', 'Seals', 'Lubricants', 'Electrical Components', 'PLC Cards', 'Sensors', 'Contactors', 'Relays']),
    toolCategories: tools([
      { name: 'Vibration Analyzer', type: 'testing_equipment' }, { name: 'Thermal Camera', type: 'testing_equipment' },
      { name: 'Heavy Spanners Set', type: 'hand_tool' }, { name: 'Hydraulic Jack', type: 'heavy_equipment' },
      { name: 'PLC Programming Cable', type: 'testing_equipment' }, { name: 'Alignment Tool', type: 'hand_tool' }
    ]),
    projectMilestones: milestones(['Breakdown Alert', 'Emergency Dispatch', 'Site Reach', 'Diagnosis', 'Part Order/Replace', 'Repair', 'Trial Run', 'Performance Test', 'Sign-off']),
    siteChecklist: checklist(['Trial run successful', 'Vibration normal', 'Temperature normal', 'Efficiency at spec', 'Maintenance log updated', 'Operator trained on new procedure']),
    complianceDocs: compliance([
      { name: 'Industrial Safety Certificate', required: true, expiryTracked: true },
      'Factory License Compliance', 'Electrical Installation Certificate'
    ]),
    assetFields: assetFields([
      { field: 'serialNumber', label: 'Serial Number', required: true },
      { field: 'brand', label: 'Brand', required: true },
      { field: 'model', label: 'Model', required: true },
      { field: 'plcType', label: 'PLC Type', required: false }
    ]),
    opportunityMatchFields: ['machineType', 'downtimeCritical']
  },
  {
    categoryCode: 'C18',
    categoryName: 'Elevator & Lift Services',
    icon: 'building',
    color: '#0F766E',
    extraKPIs: [
      { key: 'liftsUnderAmc', label: 'Lifts Under AMC', unit: 'lifts', icon: 'building', color: 'teal', dataSource: 'installed_assets', countField: 'assetType', countValue: 'lift' },
      { key: 'breakdownResponseTime', label: 'Breakdown Response Time', unit: 'mins', icon: 'clock', color: 'cyan', dataSource: 'projects', countField: 'status', countValue: 'completed' }
    ],
    inventoryCategories: inventory(['Wire Rope', 'Guide Rails', 'Brake Pads', 'Control Cards', 'Door Sensor', 'Emergency Phone', 'Safety Gear', 'Motor Brushes', 'Contactor']),
    toolCategories: tools([{ name: 'Multimeter', type: 'testing_equipment' }, { name: 'Phase Tester', type: 'testing_equipment' }, { name: 'Hydraulic Jack', type: 'heavy_equipment' }, { name: 'Alignment Gauge', type: 'testing_equipment' }, { name: 'Speed Governor Tester', type: 'testing_equipment' }]),
    projectMilestones: milestones(['Inspection', 'Component Assessment', 'Part Replacement', 'Safety Test', 'Load Test', 'Government Inspection', 'Handover with Certificate']),
    siteChecklist: checklist(['Load test passed', 'Safety gear working', 'Emergency stop functional', 'Govt inspector sign-off', 'Maintenance log updated']),
    complianceDocs: compliance([
      { name: 'Lift Inspector License', required: true, expiryTracked: true },
      'Govt Lift Registration', { name: 'Annual Safety Certificate', required: true, expiryTracked: true }
    ]),
    assetFields: assetFields([
      { field: 'serialNumber', label: 'Serial Number', required: true },
      { field: 'brand', label: 'Brand', required: true },
      { field: 'capacityKg', label: 'Capacity (Kg)', required: true },
      { field: 'floors', label: 'Floors', required: true }
    ]),
    opportunityMatchFields: ['liftCount', 'buildingFloors']
  },
  {
    categoryCode: 'C19',
    categoryName: 'Fire & Safety Equipment',
    icon: 'flame',
    color: '#DC2626',
    extraKPIs: [
      { key: 'fireSystemsUnderAmc', label: 'Systems Under AMC', unit: 'systems', icon: 'flame', color: 'red', dataSource: 'installed_assets', countField: 'assetType', countValue: 'fire' },
      { key: 'inspectionsDone', label: 'Inspections Done', unit: 'inspections', icon: 'clipboard', color: 'orange', dataSource: 'projects', countField: 'status', countValue: 'completed' }
    ],
    inventoryCategories: inventory(['Fire Extinguisher', 'Smoke Detector', 'Heat Detector', 'Sprinkler Head', 'Fire Hose', 'Call Point', 'Refill Gas (CO2/DCP/Clean Agent)', 'Fire Panel Battery']),
    toolCategories: tools([{ name: 'Pressure Gauge', type: 'testing_equipment' }, { name: 'Gas Weight Scale', type: 'testing_equipment' }, { name: 'Smoke Tester Aerosol', type: 'testing_equipment' }, { name: 'Panel Programmer', type: 'testing_equipment' }, 'Pipe Wrench', { name: 'Pressure Test Kit', type: 'testing_equipment' }]),
    projectMilestones: milestones(['Annual Inspection', 'System Testing', 'Refill/Replace Components', 'Panel Config Check', 'Mock Drill', 'Certificate Issue']),
    siteChecklist: checklist(['All detectors tested', 'Panel alarm working', 'Extinguisher pressure OK', 'Mock drill conducted', 'Fire dept NOC current']),
    complianceDocs: compliance([
      { name: 'Fire NOC', required: true, expiryTracked: true },
      { name: 'Fire Safety Certificate', required: true, expiryTracked: true },
      'Fire Dept Empanelment Letter'
    ]),
    assetFields: assetFields([
      { field: 'serialNumber', label: 'Serial Number', required: true },
      { field: 'brand', label: 'Brand', required: true },
      { field: 'extinguisherType', label: 'Extinguisher Type', required: false },
      { field: 'nextInspection', label: 'Next Inspection', required: true }
    ]),
    opportunityMatchFields: ['systemType', 'buildingArea']
  },
  {
    categoryCode: 'C20',
    categoryName: 'Educational & Institutional Equipment',
    icon: 'graduation-cap',
    color: '#2563EB',
    extraKPIs: [
      { key: 'classroomsEquipped', label: 'Classrooms Equipped', unit: 'rooms', icon: 'book', color: 'blue', dataSource: 'projects', countField: 'status', countValue: 'completed' },
      { key: 'devicesActive', label: 'Devices Active', unit: 'devices', icon: 'monitor', color: 'indigo', dataSource: 'installed_assets', countField: 'assetType', countValue: 'education' }
    ],
    inventoryCategories: inventory(['Smart Board', 'Projector', 'PA Amplifier', 'Speaker', 'Microphone', 'HDMI Cable', 'Interactive Pen', 'Projector Mount', 'Biometric Reader']),
    toolCategories: tools(['Drill', { name: 'HDMI Tester', type: 'testing_equipment' }, { name: 'Audio Analyzer', type: 'testing_equipment' }, 'Screwdriver Set', { name: 'Cable Tester', type: 'testing_equipment' }]),
    projectMilestones: milestones(['Site Assessment', 'Procurement', 'Installation', 'AV Integration', 'Software Config', 'Teacher Training', 'Handover']),
    siteChecklist: checklist(['Projection quality', 'Audio clarity', 'Software licensed', 'Teacher trained', 'All devices networked']),
    complianceDocs: compliance(['Manufacturer Authorization', 'School/College Work Order']),
    assetFields: assetFields([
      { field: 'serialNumber', label: 'Serial Number', required: true },
      { field: 'brand', label: 'Brand', required: true },
      { field: 'model', label: 'Model', required: true },
      { field: 'classroomId', label: 'Classroom ID', required: false }
    ]),
    opportunityMatchFields: ['classroomCount', 'avRequired']
  },
  {
    categoryCode: 'C21',
    categoryName: 'Retail & POS Equipment',
    icon: 'store',
    color: '#D946EF',
    extraKPIs: [
      { key: 'posTerminalsActive', label: 'POS Terminals Active', unit: 'POS', icon: 'credit-card', color: 'fuchsia', dataSource: 'installed_assets', countField: 'assetType', countValue: 'pos' },
      { key: 'storesCovered', label: 'Stores Covered', unit: 'stores', icon: 'store', color: 'pink', dataSource: 'projects', countField: 'status', countValue: 'completed' }
    ],
    inventoryCategories: inventory(['POS Paper Roll', 'Thermal Printer Head', 'Barcode Scanner', 'Cash Drawer', 'Weighing Scale', 'Cleaning Kit']),
    toolCategories: tools([{ name: 'Diagnostic Tablet', type: 'testing_equipment' }, 'Screwdriver Set', { name: 'Barcode Tester', type: 'testing_equipment' }, { name: 'Multimeter', type: 'testing_equipment' }]),
    projectMilestones: milestones(['Site Survey', 'Hardware Install', 'Software Config', 'Payment Gateway Setup', 'Staff Training', 'Go-Live', 'Handover']),
    siteChecklist: checklist(['Test transaction done', 'Receipt printing', 'Barcode scanning', 'Cash drawer open/close', 'EOD report working']),
    complianceDocs: compliance(['PCI DSS Compliance', 'Payment Aggregator Agreement']),
    assetFields: assetFields([
      { field: 'serialNumber', label: 'Serial Number', required: true },
      { field: 'brand', label: 'Brand', required: true },
      { field: 'model', label: 'Model', required: true },
      { field: 'storeId', label: 'Store ID', required: false }
    ]),
    opportunityMatchFields: ['storeCount', 'posCount']
  },
  {
    categoryCode: 'C22',
    categoryName: 'Automobile & EV Services',
    icon: 'car',
    color: '#059669',
    extraKPIs: [
      { key: 'evChargersInstalled', label: 'EV Chargers Installed', unit: 'chargers', icon: 'zap', color: 'emerald', dataSource: 'installed_assets', countField: 'assetType', countValue: 'ev_charger' },
      { key: 'vehiclesServiced', label: 'Vehicles Serviced', unit: 'vehicles', icon: 'car', color: 'green', dataSource: 'projects', countField: 'status', countValue: 'completed' }
    ],
    inventoryCategories: inventory(['EV Charging Cable', 'AC Charger Unit', 'DC Fast Charger', 'Cable Trunking', 'MCB', 'RCCB', 'Energy Meter', 'GPS Tracker Unit', 'Wiring Harness']),
    toolCategories: tools([{ name: 'Multimeter', type: 'testing_equipment' }, { name: 'EV Diagnostic Tool', type: 'testing_equipment' }, 'Crimping Tool', 'Cable Cutter', { name: 'Torque Wrench', type: 'hand_tool' }, { name: 'Car Lift', type: 'heavy_equipment' }]),
    projectMilestones: milestones(['Site Survey', 'Electrical Assessment', 'Charger Installation', 'Software/App Setup', 'Load Test', 'Handover']),
    siteChecklist: checklist(['Charging test done', 'App connected', 'Energy meter reading', 'Safety check', 'Cable properly secured']),
    complianceDocs: compliance([
      { name: 'Electrical License', required: true, expiryTracked: true },
      { name: 'EVSE Installer Certificate', required: true, expiryTracked: true },
      'BIS Certification Copy'
    ]),
    assetFields: assetFields([
      { field: 'serialNumber', label: 'Serial Number', required: true },
      { field: 'brand', label: 'Brand', required: true },
      { field: 'model', label: 'Model', required: true },
      { field: 'chargerKw', label: 'Charger kW', required: true }
    ]),
    opportunityMatchFields: ['chargerCount', 'chargerType']
  },
  {
    categoryCode: 'C23',
    categoryName: 'Smart Home Automation',
    icon: 'home',
    color: '#7C3AED',
    extraKPIs: [
      { key: 'devicesPaired', label: 'Devices Paired', unit: 'devices', icon: 'cpu', color: 'violet', dataSource: 'installed_assets', countField: 'assetType', countValue: 'smart_home' },
      { key: 'homesAutomated', label: 'Homes Automated', unit: 'homes', icon: 'home', color: 'purple', dataSource: 'projects', countField: 'status', countValue: 'completed' }
    ],
    inventoryCategories: inventory(['Smart Switch', 'Smart Sensor', 'Automation Hub/Controller', 'Smart Bulb', 'Door Lock', 'IR Blaster', 'Smart Plug', 'Ethernet Cable', 'Smart Camera']),
    toolCategories: tools(['Screwdriver Set', 'Drill', { name: 'Network Tester', type: 'testing_equipment' }, { name: 'Multimeter', type: 'testing_equipment' }, { name: 'Programming Laptop/Tablet', type: 'testing_equipment' }]),
    projectMilestones: milestones(['Consultation', 'Network Setup', 'Device Installation', 'Hub Configuration', 'Scene Programming', 'Voice Assistant Integration', 'Demo & Training', 'Handover']),
    siteChecklist: checklist(['All devices paired', 'Scenes working correctly', 'Voice commands functional', 'Remote access tested', 'Client demo done']),
    complianceDocs: compliance([
      { name: 'Electrical License', required: true, expiryTracked: true },
      'Brand Authorization Letter'
    ]),
    assetFields: assetFields([
      { field: 'serialNumber', label: 'Serial Number', required: true },
      { field: 'brand', label: 'Brand', required: true },
      { field: 'model', label: 'Model', required: true },
      { field: 'hubId', label: 'Hub ID', required: false }
    ]),
    opportunityMatchFields: ['deviceCount', 'rooms']
  }
];

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set');
  await mongoose.connect(uri, { family: 4, serverSelectionTimeoutMS: 30000 });
  console.log(`MongoDB Connected: ${mongoose.connection.host}`);

  let upserted = 0;
  for (const svc of SERVICES) {
    const payload = attachSubs(svc);
    await ServiceConfig.findOneAndUpdate(
      { categoryCode: payload.categoryCode },
      { $set: { ...payload, type: 'project_based', isActive: true } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    upserted += 1;
    console.log(`Upserted ${payload.categoryCode} — ${payload.categoryName} (${(payload.subCategories || []).length} subs)`);
  }

  console.log(`Service configs seed complete: ${upserted} services`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
