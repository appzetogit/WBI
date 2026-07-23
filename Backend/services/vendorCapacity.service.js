/**
 * Live Capacity Center — honest aggregates from workforce + resources + ops demand.
 * No fabricated vehicles, no padded demand.
 */
const mongoose = require('mongoose');
const VendorWorkforceEngineer = require('../models/VendorWorkforceEngineer');
const VendorWorkforceLeave = require('../models/VendorWorkforceLeave');
const VendorWorkforceAssignment = require('../models/VendorWorkforceAssignment');
const VendorResourceWarehouse = require('../models/VendorResourceWarehouse');
const VendorResourceInventory = require('../models/VendorResourceInventory');
const VendorResourceTool = require('../models/VendorResourceTool');
const VendorResourceInstalledAsset = require('../models/VendorResourceInstalledAsset');
const VendorOpsProject = require('../models/VendorOpsProject');
const Engineer = require('../models/Engineer');

async function computeCapacity(vendorId) {
  const vid = new mongoose.Types.ObjectId(vendorId);
  const now = new Date();

  const [
    wfAvailable,
    wfOnProject,
    wfOnLeave,
    wfTotal,
    linkedApproved,
    openAssignments,
    activeLeaves,
    toolsAvailable,
    toolsTotal,
    toolsAssigned,
    invAgg,
    warehouses,
    cityInv,
    installedAssets,
    assetsMaintenance,
    openProjects,
    atRiskProjects
  ] = await Promise.all([
    VendorWorkforceEngineer.countDocuments({
      vendorId: vid, demoTag: null, status: 'active', availability: 'available'
    }),
    VendorWorkforceEngineer.countDocuments({
      vendorId: vid, demoTag: null, status: 'active',
      availability: { $in: ['busy', 'on_project', 'traveling'] }
    }),
    VendorWorkforceEngineer.countDocuments({
      vendorId: vid, demoTag: null, availability: 'leave'
    }),
    VendorWorkforceEngineer.countDocuments({
      vendorId: vid, demoTag: null, status: 'active'
    }),
    Engineer.countDocuments({
      vendorId: vid,
      $or: [
        { vendorApprovalStatus: 'approved' },
        {
          approvalStatus: 'approved',
          $or: [
            { vendorApprovalStatus: { $in: ['approved', 'not_required'] } },
            { vendorApprovalStatus: { $exists: false } },
            { vendorApprovalStatus: null }
          ]
        }
      ]
    }).catch(() => 0),
    VendorWorkforceAssignment.countDocuments({
      vendorId: vid, demoTag: null,
      status: { $in: ['assigned', 'in_progress', 'escalated'] }
    }),
    VendorWorkforceLeave.countDocuments({
      vendorId: vid, demoTag: null, status: 'approved',
      startDate: { $lte: now },
      endDate: { $gte: now }
    }).catch(() => 0),
    VendorResourceTool.countDocuments({ vendorId: vid, demoTag: null, status: 'available' }),
    VendorResourceTool.countDocuments({ vendorId: vid, demoTag: null, status: { $ne: 'lost' } }),
    VendorResourceTool.countDocuments({ vendorId: vid, demoTag: null, status: 'assigned' }),
    VendorResourceInventory.aggregate([
      { $match: { vendorId: vid, demoTag: null } },
      {
        $group: {
          _id: null,
          totalQty: { $sum: '$quantity' },
          reserved: { $sum: '$reservedQty' },
          allocated: { $sum: '$allocatedQty' },
          items: { $sum: 1 },
          inStock: { $sum: { $cond: [{ $eq: ['$stockStatus', 'in_stock'] }, 1, 0] } },
          lowStock: { $sum: { $cond: [{ $in: ['$stockStatus', ['low_stock', 'out_of_stock']] }, 1, 0] } }
        }
      }
    ]),
    VendorResourceWarehouse.find({ vendorId: vid, demoTag: null })
      .select('name city capacityUnits currentStockUnits stockValue lowStockCount status')
      .lean(),
    VendorResourceInventory.aggregate([
      { $match: { vendorId: vid, demoTag: null } },
      { $group: { _id: '$warehouseName', qty: { $sum: '$quantity' }, items: { $sum: 1 } } },
      { $sort: { qty: -1 } },
      { $limit: 8 }
    ]),
    VendorResourceInstalledAsset.countDocuments({ vendorId: vid, demoTag: null, status: { $ne: 'retired' } }),
    VendorResourceInstalledAsset.countDocuments({
      vendorId: vid, demoTag: null, status: { $in: ['maintenance', 'repair'] }
    }),
    VendorOpsProject.countDocuments({
      vendorId: vid, demoTag: null,
      status: { $in: ['planning', 'in_progress', 'at_risk', 'on_hold'] }
    }),
    VendorOpsProject.countDocuments({ vendorId: vid, demoTag: null, status: 'at_risk' })
  ]);

  // Prefer synced workforce; fall back to linked Engineer count for headcount visibility
  const engineersAvailable = wfTotal > 0 ? wfAvailable : Math.max(0, linkedApproved - wfOnProject);
  const engineersActive = wfTotal > 0 ? wfOnProject : Math.min(linkedApproved, openAssignments);
  const totalEngineers = wfTotal > 0 ? wfTotal : linkedApproved;

  const inv = invAgg[0] || { totalQty: 0, reserved: 0, allocated: 0, items: 0, inStock: 0, lowStock: 0 };
  const inventoryAvailability = inv.items ? Math.round((inv.inStock / inv.items) * 100) : 0;

  const engineerUtil = totalEngineers ? Math.round((engineersActive / totalEngineers) * 100) : 0;
  const toolUtil = toolsTotal ? Math.round((toolsAssigned / toolsTotal) * 100) : 0;
  const stockUtil = inv.totalQty
    ? Math.round(((inv.reserved + inv.allocated) / Math.max(inv.totalQty, 1)) * 100)
    : 0;
  const projectPressure = totalEngineers
    ? Math.min(100, Math.round((openProjects / Math.max(totalEngineers, 1)) * 100))
    : openProjects > 0 ? 100 : 0;

  const utilization = Math.round((engineerUtil + toolUtil + stockUtil + projectPressure) / 4);
  const totalCapacity = 100;
  const usedCapacity = Math.min(100, utilization);
  const remainingCapacity = Math.max(0, totalCapacity - usedCapacity);

  let capacityStatus = 'green';
  if (
    utilization >= 85 ||
    inventoryAvailability < 40 ||
    (totalEngineers > 0 && engineersAvailable === 0) ||
    atRiskProjects > 0
  ) {
    capacityStatus = 'red';
  } else if (utilization >= 65 || inventoryAvailability < 60 || inv.lowStock > 0 || activeLeaves > 0) {
    capacityStatus = 'yellow';
  }

  const warehouseCapacity = warehouses.reduce((s, w) => s + (w.capacityUnits || 0), 0);
  const warehouseUsed = warehouses.reduce((s, w) => s + (w.currentStockUnits || 0), 0);

  // Honest demand from open work — no padding
  const demandVsCapacity = [
    {
      label: 'Engineers',
      capacity: totalEngineers,
      demand: Math.min(totalEngineers + openProjects, openAssignments + openProjects)
    },
    {
      label: 'Tools',
      capacity: toolsTotal,
      demand: toolsAssigned + Math.min(openProjects, toolsAvailable)
    },
    {
      label: 'Inventory SKUs',
      capacity: inv.items,
      demand: inv.reserved + inv.allocated
    },
    {
      label: 'Warehouse slots',
      capacity: warehouseCapacity,
      demand: warehouseUsed
    }
  ];

  return {
    totalCapacity,
    usedCapacity,
    remainingCapacity,
    engineersAvailable,
    engineersActive,
    engineersOnLeave: wfOnLeave || activeLeaves,
    engineersTotal: totalEngineers,
    linkedEngineers: linkedApproved,
    inventoryAvailability,
    vehiclesAvailable: 0, // no fleet model — do not fabricate
    fleetTracked: false,
    toolsAvailable,
    toolsTotal,
    toolsAssigned,
    installedAssets,
    assetsMaintenance,
    openProjects,
    atRiskProjects,
    openAssignments,
    utilization,
    capacityStatus,
    inventory: inv,
    warehouses,
    cityWise: cityInv.map((c) => ({ location: c._id || 'Unassigned', qty: c.qty, items: c.items })),
    demandVsCapacity,
    computedAt: new Date(),
    source: 'live'
  };
}

async function recalculateWarehouseStock(warehouseId, vendorId) {
  if (!warehouseId) return null;
  const match = {
    vendorId: new mongoose.Types.ObjectId(vendorId),
    warehouseId: new mongoose.Types.ObjectId(warehouseId),
    demoTag: null
  };
  const [agg] = await VendorResourceInventory.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        units: { $sum: { $add: ['$quantity', '$reservedQty', '$allocatedQty'] } },
        value: { $sum: { $multiply: ['$quantity', '$unitCost'] } },
        lowStock: { $sum: { $cond: [{ $in: ['$stockStatus', ['low_stock', 'out_of_stock']] }, 1, 0] } },
        reserved: { $sum: '$reservedQty' }
      }
    }
  ]);
  const wh = await VendorResourceWarehouse.findOne({ _id: warehouseId, vendorId });
  if (!wh) return null;
  wh.currentStockUnits = agg?.units || 0;
  wh.stockValue = agg?.value || 0;
  wh.lowStockCount = agg?.lowStock || 0;
  wh.reservedCount = agg?.reserved || 0;
  if (wh.capacityUnits > 0 && wh.currentStockUnits >= wh.capacityUnits) wh.status = 'full';
  else if (wh.status === 'full') wh.status = 'active';
  await wh.save();
  return wh;
}

module.exports = {
  computeCapacity,
  recalculateWarehouseStock
};
