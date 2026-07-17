/**
 * Resources Controller — vendor-scoped dynamic resource management
 */
const mongoose = require('mongoose');
const VendorResourceWarehouse = require('../../models/VendorResourceWarehouse');
const VendorResourceInventory = require('../../models/VendorResourceInventory');
const VendorResourceTool = require('../../models/VendorResourceTool');
const VendorResourceInstalledAsset = require('../../models/VendorResourceInstalledAsset');
const Vendor = require('../../models/Vendor');

let VendorWorkforceEngineer;
try {
  VendorWorkforceEngineer = require('../../models/VendorWorkforceEngineer');
} catch {
  VendorWorkforceEngineer = null;
}

const getVendorId = (req) => req.user._id || req.user.id;

const getVendorCategoryCodes = async (vendorId) => {
  const vendor = await Vendor.findById(vendorId).select('approvedServices').lean();
  if (!vendor?.approvedServices?.length) return [];
  return vendor.approvedServices.filter((s) => s.status === 'active').map((s) => s.categoryCode).filter(Boolean);
};

const applyCategoryFilter = async (filter, vendorId, category) => {
  if (category) {
    filter.serviceCategoryCode = category;
    return;
  }
  const codes = await getVendorCategoryCodes(vendorId);
  if (codes.length) {
    filter.$or = [
      { serviceCategoryCode: { $in: codes } },
      { serviceCategoryCode: { $exists: true } }
    ];
  }
};

const getCounts = async (req, res) => {
  try {
    const vid = new mongoose.Types.ObjectId(getVendorId(req));
    const [
      warehouses,
      inventoryItems,
      lowStock,
      toolsAvailable,
      toolsAssigned,
      installedAssets,
      underMaintenance
    ] = await Promise.all([
      VendorResourceWarehouse.countDocuments({ vendorId: vid, status: 'active' }),
      VendorResourceInventory.countDocuments({ vendorId: vid }),
      VendorResourceInventory.countDocuments({ vendorId: vid, stockStatus: { $in: ['low_stock', 'out_of_stock'] } }),
      VendorResourceTool.countDocuments({ vendorId: vid, status: 'available' }),
      VendorResourceTool.countDocuments({ vendorId: vid, status: 'assigned' }),
      VendorResourceInstalledAsset.countDocuments({ vendorId: vid, status: { $ne: 'retired' } }),
      VendorResourceInstalledAsset.countDocuments({ vendorId: vid, status: { $in: ['maintenance', 'repair'] } })
    ]);

    res.status(200).json({
      success: true,
      data: {
        warehouses,
        inventoryItems,
        lowStock,
        toolsAvailable,
        toolsAssigned,
        installedAssets,
        underMaintenance
      }
    });
  } catch (error) {
    console.error('resources getCounts:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch counts' });
  }
};

const getCapacity = async (req, res) => {
  try {
    const vendorId = getVendorId(req);
    const vid = new mongoose.Types.ObjectId(vendorId);

    let engineersAvailable = 0;
    let engineersActive = 0;
    if (VendorWorkforceEngineer) {
      [engineersAvailable, engineersActive] = await Promise.all([
        VendorWorkforceEngineer.countDocuments({ vendorId: vid, status: 'active', availability: 'available' }),
        VendorWorkforceEngineer.countDocuments({ vendorId: vid, status: 'active', availability: { $in: ['busy', 'on_project', 'traveling'] } })
      ]);
    }

    const [toolsAvailable, toolsTotal, invAgg, warehouses, cityInv] = await Promise.all([
      VendorResourceTool.countDocuments({ vendorId: vid, status: 'available' }),
      VendorResourceTool.countDocuments({ vendorId: vid, status: { $ne: 'lost' } }),
      VendorResourceInventory.aggregate([
        { $match: { vendorId: vid } },
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
      VendorResourceWarehouse.find({ vendorId: vid }).select('name city capacityUnits currentStockUnits').lean(),
      VendorResourceInventory.aggregate([
        { $match: { vendorId: vid } },
        { $group: { _id: '$warehouseName', qty: { $sum: '$quantity' }, items: { $sum: 1 } } },
        { $sort: { qty: -1 } },
        { $limit: 8 }
      ])
    ]);

    const inv = invAgg[0] || { totalQty: 0, reserved: 0, allocated: 0, items: 0, inStock: 0, lowStock: 0 };
    const inventoryAvailability = inv.items ? Math.round((inv.inStock / inv.items) * 100) : 0;
    const totalEngineers = engineersAvailable + engineersActive;
    const engineerUtil = totalEngineers ? Math.round((engineersActive / totalEngineers) * 100) : 0;
    const toolUtil = toolsTotal ? Math.round(((toolsTotal - toolsAvailable) / toolsTotal) * 100) : 0;
    const stockUtil = inv.totalQty ? Math.round(((inv.reserved + inv.allocated) / Math.max(inv.totalQty, 1)) * 100) : 0;
    const utilization = Math.round((engineerUtil + toolUtil + stockUtil) / 3);
    const totalCapacity = 100;
    const usedCapacity = Math.min(100, utilization);
    const remainingCapacity = Math.max(0, totalCapacity - usedCapacity);

    let capacityStatus = 'green';
    if (utilization >= 85 || inventoryAvailability < 40 || engineersAvailable === 0) capacityStatus = 'red';
    else if (utilization >= 65 || inventoryAvailability < 60 || inv.lowStock > 0) capacityStatus = 'yellow';

    const vehiclesAvailable = Math.max(2, Math.floor(toolsAvailable / 3));

    res.status(200).json({
      success: true,
      data: {
        totalCapacity,
        usedCapacity,
        remainingCapacity,
        engineersAvailable,
        engineersActive,
        inventoryAvailability,
        vehiclesAvailable,
        toolsAvailable,
        toolsTotal,
        utilization,
        capacityStatus,
        inventory: inv,
        warehouses,
        cityWise: cityInv.map((c) => ({ location: c._id || 'Unassigned', qty: c.qty, items: c.items })),
        demandVsCapacity: [
          { label: 'Engineers', capacity: totalEngineers || 10, demand: engineersActive + 2 },
          { label: 'Tools', capacity: toolsTotal || 10, demand: toolsTotal - toolsAvailable + 1 },
          { label: 'Inventory SKUs', capacity: inv.items || 10, demand: inv.reserved + inv.allocated + Math.ceil((inv.items || 0) * 0.2) },
          { label: 'Warehouse slots', capacity: warehouses.reduce((s, w) => s + (w.capacityUnits || 0), 0) || 1000, demand: warehouses.reduce((s, w) => s + (w.currentStockUnits || 0), 0) }
        ]
      }
    });
  } catch (error) {
    console.error('getCapacity:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch capacity' });
  }
};

const getInventory = async (req, res) => {
  try {
    const vendorId = getVendorId(req);
    const { status, category, search, page = 1, limit = 12, sort = 'updatedAt' } = req.query;
    const filter = { vendorId: new mongoose.Types.ObjectId(vendorId) };
    if (status) filter.stockStatus = status;
    await applyCategoryFilter(filter, vendorId, category);
    if (search?.trim()) {
      const rx = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$and = (filter.$and || []).concat([{
        $or: [{ name: rx }, { sku: rx }, { category: rx }, { barcode: rx }, { warehouseName: rx }, { serialNumber: rx }]
      }]);
    }
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [data, total] = await Promise.all([
      VendorResourceInventory.find(filter).sort({ [sort]: -1 }).skip(skip).limit(parseInt(limit)).lean(),
      VendorResourceInventory.countDocuments(filter)
    ]);
    res.status(200).json({
      success: true,
      data,
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) || 1 }
    });
  } catch (error) {
    console.error('getInventory:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch inventory' });
  }
};

const updateInventory = async (req, res) => {
  try {
    const vendorId = getVendorId(req);
    const item = await VendorResourceInventory.findOne({
      _id: req.params.id,
      vendorId: new mongoose.Types.ObjectId(vendorId)
    });
    if (!item) return res.status(404).json({ success: false, message: 'Item not found' });
    const { action, quantity } = req.body;
    if (action === 'reserve') {
      const qty = quantity || 1;
      item.reservedQty += qty;
      item.quantity = Math.max(0, item.quantity - qty);
      item.stockStatus = 'reserved';
      item.lastMovement = `Reserved ${qty}`;
    } else if (action === 'allocate') {
      const qty = quantity || 1;
      item.allocatedQty += qty;
      item.quantity = Math.max(0, item.quantity - qty);
      item.stockStatus = 'allocated';
      item.lastMovement = `Allocated ${qty}`;
    } else if (action === 'return') {
      const qty = quantity || 1;
      item.quantity += qty;
      item.reservedQty = Math.max(0, item.reservedQty - qty);
      item.allocatedQty = Math.max(0, item.allocatedQty - qty);
      item.lastMovement = `Returned ${qty}`;
    } else if (action === 'scrap') {
      item.stockStatus = 'damaged';
      item.lastMovement = 'Scrapped / damaged';
    }
    await item.save();
    res.status(200).json({ success: true, data: item });
  } catch (error) {
    console.error('updateInventory:', error);
    res.status(500).json({ success: false, message: 'Failed to update inventory' });
  }
};

const getTools = async (req, res) => {
  try {
    const vendorId = getVendorId(req);
    const { status, category, search, page = 1, limit = 12 } = req.query;
    const filter = { vendorId: new mongoose.Types.ObjectId(vendorId) };
    if (status) filter.status = status;
    await applyCategoryFilter(filter, vendorId, category);
    if (search?.trim()) {
      const rx = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$and = (filter.$and || []).concat([{
        $or: [{ name: rx }, { toolCode: rx }, { serialNumber: rx }, { assignedEngineer: rx }, { category: rx }]
      }]);
    }
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [data, total] = await Promise.all([
      VendorResourceTool.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(parseInt(limit)).lean(),
      VendorResourceTool.countDocuments(filter)
    ]);
    res.status(200).json({
      success: true,
      data,
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) || 1 }
    });
  } catch (error) {
    console.error('getTools:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch tools' });
  }
};

const updateTool = async (req, res) => {
  try {
    const vendorId = getVendorId(req);
    const tool = await VendorResourceTool.findOne({
      _id: req.params.id,
      vendorId: new mongoose.Types.ObjectId(vendorId)
    });
    if (!tool) return res.status(404).json({ success: false, message: 'Tool not found' });
    const { action, assignedEngineer, assignedProject } = req.body;
    if (action === 'assign') {
      tool.status = 'assigned';
      if (assignedEngineer) tool.assignedEngineer = assignedEngineer;
      if (assignedProject) tool.assignedProject = assignedProject;
    } else if (action === 'return') {
      tool.status = 'available';
      tool.assignedEngineer = '';
      tool.assignedProject = '';
    } else if (action === 'maintenance') {
      tool.status = 'maintenance';
    } else if (action === 'inspect') {
      tool.lastInspection = new Date();
    }
    await tool.save();
    res.status(200).json({ success: true, data: tool });
  } catch (error) {
    console.error('updateTool:', error);
    res.status(500).json({ success: false, message: 'Failed to update tool' });
  }
};

const getWarehouses = async (req, res) => {
  try {
    const vendorId = getVendorId(req);
    const { status, search, page = 1, limit = 12 } = req.query;
    const filter = { vendorId: new mongoose.Types.ObjectId(vendorId) };
    if (status) filter.status = status;
    if (search?.trim()) {
      const rx = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ name: rx }, { city: rx }, { warehouseCode: rx }, { manager: rx }];
    }
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [data, total] = await Promise.all([
      VendorResourceWarehouse.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(parseInt(limit)).lean(),
      VendorResourceWarehouse.countDocuments(filter)
    ]);
    res.status(200).json({
      success: true,
      data,
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) || 1 }
    });
  } catch (error) {
    console.error('getWarehouses:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch warehouses' });
  }
};

const getInstalledAssets = async (req, res) => {
  try {
    const vendorId = getVendorId(req);
    const { status, category, search, page = 1, limit = 12 } = req.query;
    const filter = { vendorId: new mongoose.Types.ObjectId(vendorId) };
    if (status) filter.status = status;
    await applyCategoryFilter(filter, vendorId, category);
    if (search?.trim()) {
      const rx = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$and = (filter.$and || []).concat([{
        $or: [{ name: rx }, { assetCode: rx }, { clientName: rx }, { siteName: rx }, { serialNumber: rx }, { projectName: rx }]
      }]);
    }
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [data, total] = await Promise.all([
      VendorResourceInstalledAsset.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(parseInt(limit)).lean(),
      VendorResourceInstalledAsset.countDocuments(filter)
    ]);
    res.status(200).json({
      success: true,
      data,
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) || 1 }
    });
  } catch (error) {
    console.error('getInstalledAssets:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch installed assets' });
  }
};

const updateInstalledAsset = async (req, res) => {
  try {
    const vendorId = getVendorId(req);
    const asset = await VendorResourceInstalledAsset.findOne({
      _id: req.params.id,
      vendorId: new mongoose.Types.ObjectId(vendorId)
    });
    if (!asset) return res.status(404).json({ success: false, message: 'Asset not found' });
    const { action, notes } = req.body;
    const map = {
      inspect: 'inspection',
      maintenance: 'maintenance',
      repair: 'repair',
      replace: 'replacement',
      retire: 'retired'
    };
    if (map[action]) {
      asset.status = map[action];
      asset.serviceHistory = asset.serviceHistory || [];
      asset.serviceHistory.push({
        action: map[action],
        date: new Date(),
        engineer: req.user.name || 'Vendor Ops',
        notes: notes || ''
      });
    }
    await asset.save();
    res.status(200).json({ success: true, data: asset });
  } catch (error) {
    console.error('updateInstalledAsset:', error);
    res.status(500).json({ success: false, message: 'Failed to update asset' });
  }
};

module.exports = {
  getCounts,
  getCapacity,
  getInventory,
  updateInventory,
  getTools,
  updateTool,
  getWarehouses,
  getInstalledAssets,
  updateInstalledAsset
};
