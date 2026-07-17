/**
 * Seed: Resources demo data
 * npm run seed:resources
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Vendor = require('../models/Vendor');
const VendorResourceWarehouse = require('../models/VendorResourceWarehouse');
const VendorResourceInventory = require('../models/VendorResourceInventory');
const VendorResourceTool = require('../models/VendorResourceTool');
const VendorResourceInstalledAsset = require('../models/VendorResourceInstalledAsset');

const VENDOR_ID_ARG = process.argv[2];
const DEMO_TAG = 'wbi-res-demo';

const connectForScript = async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set');
  mongoose.set('bufferCommands', false);
  await mongoose.connect(uri, { family: 4, serverSelectionTimeoutMS: 30000, connectTimeoutMS: 30000 });
  console.log(`✅ MongoDB Connected: ${mongoose.connection.host}`);
};

const daysAgo = (d) => new Date(Date.now() - d * 86400000);
const daysFromNow = (d) => new Date(Date.now() + d * 86400000);

const SERVICE_RESOURCES = {
  SOLAR: {
    name: 'Solar Energy',
    inventory: [
      { name: 'Mono PERC Panel 540W', category: 'Panels', unitCost: 12500, qty: 120, reorder: 20 },
      { name: 'String Inverter 50kW', category: 'Inverters', unitCost: 185000, qty: 8, reorder: 2 },
      { name: 'LiFePO4 Battery 10kWh', category: 'Battery', unitCost: 95000, qty: 15, reorder: 3 },
      { name: 'DC Cable 6mm', category: 'Cable', unitCost: 85, qty: 500, reorder: 100 },
      { name: 'MC4 Connector Pair', category: 'MC4', unitCost: 45, qty: 800, reorder: 150 }
    ],
    tools: ['Torque Wrench', 'IV Curve Tracer', 'Insulation Tester', 'Safety Harness'],
    assets: ['Rooftop Panel Array', 'String Inverter', 'Battery Bank']
  },
  CCTV: {
    name: 'CCTV & Surveillance',
    inventory: [
      { name: 'IP Camera 4MP', category: 'Cameras', unitCost: 4500, qty: 80, reorder: 15 },
      { name: 'NVR 16CH', category: 'NVR', unitCost: 22000, qty: 12, reorder: 3 },
      { name: 'DVR 8CH', category: 'DVR', unitCost: 8500, qty: 6, reorder: 2 },
      { name: 'Cat6 Cable Box', category: 'Cables', unitCost: 3200, qty: 40, reorder: 8 }
    ],
    tools: ['Crimping Tool', 'PoE Tester', 'Ladder Set'],
    assets: ['Lobby Camera', 'Parking NVR', 'Perimeter Camera']
  },
  WEB: {
    name: 'Web Development',
    inventory: [
      { name: 'JetBrains License', category: 'License', unitCost: 12000, qty: 10, reorder: 2 },
      { name: 'Cloud Credits Pack', category: 'Cloud Credits', unitCost: 50000, qty: 5, reorder: 1 },
      { name: 'Dev Server Slot', category: 'Server', unitCost: 8000, qty: 20, reorder: 4 },
      { name: 'MacBook Pro M3', category: 'Hardware', unitCost: 185000, qty: 4, reorder: 1 }
    ],
    tools: ['Staging Laptop', 'VPN Token', 'Test Device Kit'],
    assets: ['Client Web App', 'Production License', 'Hosting Server']
  },
  AC: {
    name: 'HVAC',
    inventory: [
      { name: 'Split AC 1.5T', category: 'AC Units', unitCost: 42000, qty: 18, reorder: 4 },
      { name: 'Compressor Unit', category: 'Compressors', unitCost: 15000, qty: 10, reorder: 2 },
      { name: 'R32 Gas Cylinder', category: 'Gas Cylinders', unitCost: 3500, qty: 25, reorder: 5 }
    ],
    tools: ['Manifold Gauge', 'Vacuum Pump', 'Leak Detector'],
    assets: ['Office Split AC', 'Plant AHU']
  },
  NET: {
    name: 'Networking',
    inventory: [
      { name: 'Managed Switch 24P', category: 'Switches', unitCost: 28000, qty: 14, reorder: 3 },
      { name: 'Fiber Patch Cord', category: 'Fiber', unitCost: 450, qty: 200, reorder: 40 },
      { name: 'Cat6 Cable Box', category: 'Cables', unitCost: 3200, qty: 35, reorder: 8 }
    ],
    tools: ['OTDR', 'Fiber Splicer', 'Cable Tester'],
    assets: ['Core Switch', 'Branch Router']
  },
  ATM: {
    name: 'ATM Maintenance',
    inventory: [
      { name: 'Cash Dispenser Module', category: 'ATM Spare Parts', unitCost: 65000, qty: 6, reorder: 2 },
      { name: 'Card Reader Assembly', category: 'ATM Spare Parts', unitCost: 18000, qty: 8, reorder: 2 },
      { name: 'Receipt Printer', category: 'ATM Spare Parts', unitCost: 9500, qty: 12, reorder: 3 }
    ],
    tools: ['ATM Diagnostic Kit', 'Lock Tool Set'],
    assets: ['Branch ATM Unit', 'Lobby ATM']
  },
  DEFAULT: {
    name: 'General Services',
    inventory: [
      { name: 'General Consumable Kit', category: 'Consumables', unitCost: 500, qty: 50, reorder: 10 }
    ],
    tools: ['Multimeter', 'Tool Bag'],
    assets: ['Installed Equipment']
  }
};

const CITIES = [
  { name: 'Pune Central Warehouse', city: 'Pune', manager: 'Ravi Kulkarni' },
  { name: 'Mumbai West Hub', city: 'Mumbai', manager: 'Sneha Patil' },
  { name: 'Bengaluru Tech Store', city: 'Bengaluru', manager: 'Arun Rao' }
];

const ENGINEERS = ['Rahul Verma', 'Sneha Iyer', 'Amit Khan', 'Priya Nair', 'Vikas Patel'];
const CLIENTS = ['Bharat Auto', 'StyleMart Retail', 'NovaTech', 'HDFC Bank', 'Techno Park'];

async function seedVendor(vendorId) {
  const vid = new mongoose.Types.ObjectId(vendorId);
  const warehouses = [];

  for (let i = 0; i < CITIES.length; i++) {
    const c = CITIES[i];
    const wh = new VendorResourceWarehouse({
      vendorId: vid,
      name: c.name,
      city: c.city,
      state: 'MH',
      address: `${100 + i} Industrial Estate, ${c.city}`,
      manager: c.manager,
      contact: `98${20000000 + i}`,
      capacityUnits: 2000 + i * 500,
      currentStockUnits: 800 + i * 200,
      stockValue: 2500000 + i * 500000,
      lowStockCount: 2 + i,
      reservedCount: 5 + i,
      incomingCount: 3,
      outgoingCount: 4,
      damagedCount: i,
      status: 'active',
      demoTag: DEMO_TAG
    });
    await wh.save();
    warehouses.push(wh);
  }

  const codes = Object.keys(SERVICE_RESOURCES).filter((k) => k !== 'DEFAULT');
  let invCount = 0;
  let toolCount = 0;
  let assetCount = 0;

  for (let si = 0; si < codes.length; si++) {
    const code = codes[si];
    const tpl = SERVICE_RESOURCES[code];
    const wh = warehouses[si % warehouses.length];

    for (let j = 0; j < tpl.inventory.length; j++) {
      const it = tpl.inventory[j];
      let stockStatus = 'in_stock';
      let qty = it.qty;
      if (j === tpl.inventory.length - 1) { stockStatus = 'low_stock'; qty = Math.max(2, it.reorder - 2); }
      if (j === 0 && si % 3 === 0) { stockStatus = 'reserved'; }

      const item = new VendorResourceInventory({
        vendorId: vid,
        name: it.name,
        category: it.category,
        serviceCategoryCode: code,
        serviceCategoryName: tpl.name,
        warehouseId: wh._id,
        warehouseName: wh.name,
        barcode: `BC${code}${1000 + j}`,
        batchNumber: `BTH-${code}-${2026}${j}`,
        serialNumber: j % 2 === 0 ? `SN-${code}-${5000 + j}` : '',
        quantity: qty,
        reservedQty: stockStatus === 'reserved' ? 5 : 0,
        allocatedQty: 0,
        reorderLevel: it.reorder,
        unitCost: it.unitCost,
        unit: 'pcs',
        stockStatus,
        lastMovement: 'Seeded stock',
        demoTag: DEMO_TAG
      });
      await item.save();
      invCount += 1;
    }

    for (let t = 0; t < tpl.tools.length; t++) {
      const assigned = t % 2 === 0;
      const tool = new VendorResourceTool({
        vendorId: vid,
        name: tpl.tools[t],
        category: `${tpl.name} Tools`,
        serviceCategoryCode: code,
        serviceCategoryName: tpl.name,
        serialNumber: `TSN-${code}-${2000 + t}`,
        assignedEngineer: assigned ? ENGINEERS[t % ENGINEERS.length] : '',
        assignedProject: assigned ? `${tpl.name} Project` : '',
        condition: ['excellent', 'good', 'fair'][t % 3],
        purchaseDate: daysAgo(200 + t * 30),
        warrantyExpiry: daysFromNow(180 + t * 20),
        calibrationDate: daysAgo(30),
        lastInspection: daysAgo(7 + t),
        status: assigned ? 'assigned' : t === tpl.tools.length - 1 ? 'maintenance' : 'available',
        demoTag: DEMO_TAG
      });
      await tool.save();
      toolCount += 1;
    }

    for (let a = 0; a < tpl.assets.length; a++) {
      const asset = new VendorResourceInstalledAsset({
        vendorId: vid,
        name: tpl.assets[a],
        assetType: tpl.assets[a].split(' ').slice(-1)[0],
        serviceCategoryCode: code,
        serviceCategoryName: tpl.name,
        clientName: CLIENTS[a % CLIENTS.length],
        siteName: `${CLIENTS[a % CLIENTS.length]} Site`,
        projectName: `${tpl.name} Rollout`,
        projectCode: `PRJ-${code}-0${a + 1}`,
        serialNumber: `ASN-${code}-${9000 + a}`,
        installationDate: daysAgo(60 + a * 10),
        warrantyExpiry: daysFromNow(300 + a * 30),
        installedBy: ENGINEERS[a % ENGINEERS.length],
        city: warehouses[a % warehouses.length].city,
        status: ['installed', 'inspection', 'maintenance'][a % 3],
        serviceHistory: [
          { action: 'installed', date: daysAgo(60 + a * 10), engineer: ENGINEERS[a % ENGINEERS.length], notes: 'Initial install' }
        ],
        demoTag: DEMO_TAG
      });
      await asset.save();
      assetCount += 1;
    }
  }

  return { invCount, toolCount, assetCount, wh: warehouses.length };
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
    VendorResourceWarehouse.deleteMany({ demoTag: DEMO_TAG }),
    VendorResourceInventory.deleteMany({ demoTag: DEMO_TAG }),
    VendorResourceTool.deleteMany({ demoTag: DEMO_TAG }),
    VendorResourceInstalledAsset.deleteMany({ demoTag: DEMO_TAG })
  ]);

  let totals = { inv: 0, tools: 0, assets: 0, wh: 0 };
  for (const id of vendorIds) {
    const r = await seedVendor(id);
    totals.inv += r.invCount;
    totals.tools += r.toolCount;
    totals.assets += r.assetCount;
    totals.wh += r.wh;
    console.log(`  ✓ Vendor ${id}: ${r.invCount} SKUs, ${r.toolCount} tools, ${r.assetCount} assets`);
  }

  console.log(`\n✅ Seeded Resources: ${totals.inv} inventory, ${totals.tools} tools, ${totals.assets} assets, ${totals.wh} warehouses`);
  console.log('👉 Open /vendor/dynamic/resources/capacity');
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
