/**
 * Resources Controller — live capacity, inventory, tools, warehouses, assets
 */
const mongoose = require('mongoose');
const VendorResourceWarehouse = require('../../models/VendorResourceWarehouse');
const VendorResourceInventory = require('../../models/VendorResourceInventory');
const VendorResourceTool = require('../../models/VendorResourceTool');
const VendorResourceInstalledAsset = require('../../models/VendorResourceInstalledAsset');
const Vendor = require('../../models/Vendor');
const { computeCapacity, recalculateWarehouseStock } = require('../../services/vendorCapacity.service');

const getVendorId = (req) => req.user._id || req.user.id;

const getVendorCategoryCodes = async (vendorId) => {
  const vendor = await Vendor.findById(vendorId).select('approvedServices').lean();
  if (!vendor?.approvedServices?.length) return [];
  return vendor.approvedServices
    .filter((s) => s.status === 'active' || s.status === 'approved')
    .map((s) => s.categoryCode)
    .filter(Boolean);
};

const applyCategoryFilter = async (filter, vendorId, category) => {
  if (category) {
    filter.serviceCategoryCode = String(category).toUpperCase();
    return;
  }
  const codes = await getVendorCategoryCodes(vendorId);
  if (codes.length) {
    filter.serviceCategoryCode = { $in: codes };
  }
};

const liveBase = (vendorId) => ({
  vendorId: new mongoose.Types.ObjectId(vendorId),
  demoTag: null
});

const normalizeStockStatus = (item) => {
  if (item.stockStatus === 'damaged') return;
  if (item.reservedQty > 0 && item.quantity === 0 && item.allocatedQty === 0) {
    item.stockStatus = 'reserved';
    return;
  }
  if (item.allocatedQty > 0 && item.quantity === 0 && item.reservedQty === 0) {
    item.stockStatus = 'allocated';
    return;
  }
  if (item.quantity <= 0) item.stockStatus = 'out_of_stock';
  else if (item.quantity <= item.reorderLevel) item.stockStatus = 'low_stock';
  else item.stockStatus = 'in_stock';
};

const notifyLowStock = async (vendorId, item) => {
  if (!['low_stock', 'out_of_stock'].includes(item.stockStatus)) return;
  try {
    const { publishVendorNotification } = require('../../services/vendorNotificationCenter.service');
    await publishVendorNotification({
      vendorId,
      type: 'general',
      title: item.stockStatus === 'out_of_stock' ? 'Out of stock' : 'Low stock alert',
      message: `${item.name} (${item.sku}) — qty ${item.quantity} at ${item.warehouseName || 'warehouse'}`,
      module: 'resources',
      priority: item.stockStatus === 'out_of_stock' ? 'high' : 'normal',
      relatedId: item._id,
      relatedType: 'inventory',
      actionUrl: 'resources/inventory',
      category: 'jobs',
      dedupeKey: `inv-stock-${item._id}-${item.stockStatus}`
    });
  } catch (_) { /* non-blocking */ }
};

const getCounts = async (req, res) => {
  try {
    const vid = new mongoose.Types.ObjectId(getVendorId(req));
    const base = { vendorId: vid, demoTag: null };
    const [
      warehouses,
      inventoryItems,
      lowStock,
      toolsAvailable,
      toolsAssigned,
      installedAssets,
      underMaintenance
    ] = await Promise.all([
      VendorResourceWarehouse.countDocuments({ ...base, status: 'active' }),
      VendorResourceInventory.countDocuments(base),
      VendorResourceInventory.countDocuments({
        ...base,
        stockStatus: { $in: ['low_stock', 'out_of_stock'] }
      }),
      VendorResourceTool.countDocuments({ ...base, status: 'available' }),
      VendorResourceTool.countDocuments({ ...base, status: 'assigned' }),
      VendorResourceInstalledAsset.countDocuments({ ...base, status: { $ne: 'retired' } }),
      VendorResourceInstalledAsset.countDocuments({
        ...base,
        status: { $in: ['maintenance', 'repair'] }
      })
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
    try {
      const { syncLinkedEngineers } = require('../../services/vendorWorkforceSync.service');
      await syncLinkedEngineers(vendorId);
    } catch (syncErr) {
      console.warn('[capacity] workforce sync:', syncErr.message);
    }
    const data = await computeCapacity(vendorId);
    res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('getCapacity:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch capacity' });
  }
};

const getInventory = async (req, res) => {
  try {
    const vendorId = getVendorId(req);
    const { status, category, search, page = 1, limit = 12, sort = 'updatedAt' } = req.query;
    const filter = liveBase(vendorId);
    if (status) filter.stockStatus = status;
    await applyCategoryFilter(filter, vendorId, category);
    if (search?.trim()) {
      const rx = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$and = (filter.$and || []).concat([{
        $or: [{ name: rx }, { sku: rx }, { category: rx }, { barcode: rx }, { warehouseName: rx }, { serialNumber: rx }]
      }]);
    }
    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const sortField = ['updatedAt', 'quantity', 'name', 'stockStatus'].includes(sort) ? sort : 'updatedAt';
    const [data, total] = await Promise.all([
      VendorResourceInventory.find(filter).sort({ [sortField]: -1 }).skip(skip).limit(parseInt(limit, 10)).lean(),
      VendorResourceInventory.countDocuments(filter)
    ]);
    res.status(200).json({
      success: true,
      data,
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total,
        pages: Math.ceil(total / parseInt(limit, 10)) || 1
      }
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
      vendorId: new mongoose.Types.ObjectId(vendorId),
      demoTag: null
    });
    if (!item) return res.status(404).json({ success: false, message: 'Item not found' });

    const { action, quantity, warehouseId, warehouseName, projectName } = req.body;
    const qty = Math.max(1, parseInt(quantity, 10) || 1);

    if (action === 'reserve') {
      if (item.quantity < qty) {
        return res.status(400).json({ success: false, message: 'Insufficient quantity to reserve' });
      }
      item.reservedQty += qty;
      item.quantity -= qty;
      item.lastMovement = `Reserved ${qty}${projectName ? ` for ${projectName}` : ''}`;
    } else if (action === 'allocate') {
      if (item.quantity < qty && item.reservedQty < qty) {
        return res.status(400).json({ success: false, message: 'Insufficient quantity to allocate' });
      }
      if (item.reservedQty >= qty) {
        item.reservedQty -= qty;
      } else {
        item.quantity = Math.max(0, item.quantity - qty);
      }
      item.allocatedQty += qty;
      item.lastMovement = `Allocated ${qty}${projectName ? ` → ${projectName}` : ''}`;
    } else if (action === 'return') {
      item.quantity += qty;
      item.reservedQty = Math.max(0, item.reservedQty - qty);
      item.allocatedQty = Math.max(0, item.allocatedQty - qty);
      item.lastMovement = `Returned ${qty}`;
    } else if (action === 'transfer') {
      if (!warehouseId && !warehouseName) {
        return res.status(400).json({ success: false, message: 'Target warehouse required for transfer' });
      }
      if (item.quantity < qty) {
        return res.status(400).json({ success: false, message: 'Insufficient quantity to transfer' });
      }
      const fromWh = item.warehouseId;
      item.quantity -= qty;
      item.lastMovement = `Transferred ${qty} out`;
      normalizeStockStatus(item);
      await item.save();
      if (fromWh) await recalculateWarehouseStock(fromWh, vendorId);

      const targetWh = warehouseId
        ? await VendorResourceWarehouse.findOne({ _id: warehouseId, vendorId, demoTag: null })
        : await VendorResourceWarehouse.findOne({ vendorId, name: warehouseName, demoTag: null });
      if (!targetWh) {
        return res.status(404).json({ success: false, message: 'Target warehouse not found' });
      }

      let dest = await VendorResourceInventory.findOne({
        vendorId,
        name: item.name,
        warehouseId: targetWh._id,
        demoTag: null
      });
      if (!dest) {
        dest = new VendorResourceInventory({
          vendorId,
          name: item.name,
          category: item.category,
          serviceCategoryCode: item.serviceCategoryCode,
          serviceCategoryName: item.serviceCategoryName,
          warehouseId: targetWh._id,
          warehouseName: targetWh.name,
          unitCost: item.unitCost,
          unit: item.unit,
          reorderLevel: item.reorderLevel,
          quantity: qty,
          demoTag: null,
          lastMovement: `Transferred ${qty} in from ${item.warehouseName || 'warehouse'}`
        });
      } else {
        dest.quantity += qty;
        dest.lastMovement = `Transferred ${qty} in from ${item.warehouseName || 'warehouse'}`;
      }
      normalizeStockStatus(dest);
      await dest.save();
      await recalculateWarehouseStock(targetWh._id, vendorId);
      await notifyLowStock(vendorId, item);
      return res.status(200).json({ success: true, data: { from: item, to: dest } });
    } else if (action === 'scrap') {
      item.stockStatus = 'damaged';
      item.lastMovement = 'Scrapped / damaged';
    } else {
      return res.status(400).json({ success: false, message: 'Invalid action' });
    }

    if (action !== 'scrap') normalizeStockStatus(item);
    await item.save();
    if (item.warehouseId) await recalculateWarehouseStock(item.warehouseId, vendorId);
    await notifyLowStock(vendorId, item);

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
    const filter = liveBase(vendorId);
    if (status) filter.status = status;
    await applyCategoryFilter(filter, vendorId, category);
    if (search?.trim()) {
      const rx = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$and = (filter.$and || []).concat([{
        $or: [{ name: rx }, { toolCode: rx }, { serialNumber: rx }, { assignedEngineer: rx }, { category: rx }]
      }]);
    }
    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const [data, total] = await Promise.all([
      VendorResourceTool.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(parseInt(limit, 10)).lean(),
      VendorResourceTool.countDocuments(filter)
    ]);
    res.status(200).json({
      success: true,
      data,
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total,
        pages: Math.ceil(total / parseInt(limit, 10)) || 1
      }
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
      vendorId: new mongoose.Types.ObjectId(vendorId),
      demoTag: null
    });
    if (!tool) return res.status(404).json({ success: false, message: 'Tool not found' });

    const { action, assignedEngineer, assignedEngineerId, assignedProject } = req.body;
    if (action === 'assign') {
      if (!assignedEngineer && !assignedEngineerId) {
        return res.status(400).json({
          success: false,
          message: 'assignedEngineer or assignedEngineerId is required'
        });
      }
      tool.status = 'assigned';
      if (assignedEngineer) tool.assignedEngineer = assignedEngineer;
      if (assignedEngineerId) tool.assignedEngineerId = String(assignedEngineerId);
      if (assignedProject) tool.assignedProject = assignedProject;
    } else if (action === 'return') {
      tool.status = 'available';
      tool.assignedEngineer = '';
      tool.assignedEngineerId = '';
      tool.assignedProject = '';
    } else if (action === 'maintenance') {
      tool.status = 'maintenance';
      tool.assignedEngineer = '';
      tool.assignedEngineerId = '';
      tool.assignedProject = '';
    } else if (action === 'inspect') {
      tool.lastInspection = new Date();
    } else {
      return res.status(400).json({ success: false, message: 'Invalid action' });
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
    const filter = liveBase(vendorId);
    if (status) filter.status = status;
    if (search?.trim()) {
      const rx = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ name: rx }, { city: rx }, { warehouseCode: rx }, { manager: rx }];
    }
    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const [data, total] = await Promise.all([
      VendorResourceWarehouse.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(parseInt(limit, 10)).lean(),
      VendorResourceWarehouse.countDocuments(filter)
    ]);
    res.status(200).json({
      success: true,
      data,
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total,
        pages: Math.ceil(total / parseInt(limit, 10)) || 1
      }
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
    const filter = liveBase(vendorId);
    if (status) filter.status = status;
    await applyCategoryFilter(filter, vendorId, category);
    if (search?.trim()) {
      const rx = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$and = (filter.$and || []).concat([{
        $or: [{ name: rx }, { assetCode: rx }, { clientName: rx }, { siteName: rx }, { serialNumber: rx }, { projectName: rx }]
      }]);
    }
    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const [data, total] = await Promise.all([
      VendorResourceInstalledAsset.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(parseInt(limit, 10)).lean(),
      VendorResourceInstalledAsset.countDocuments(filter)
    ]);
    res.status(200).json({
      success: true,
      data,
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total,
        pages: Math.ceil(total / parseInt(limit, 10)) || 1
      }
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
      vendorId: new mongoose.Types.ObjectId(vendorId),
      demoTag: null
    });
    if (!asset) return res.status(404).json({ success: false, message: 'Asset not found' });
    const { action, notes, engineerName } = req.body;
    const map = {
      inspect: 'inspection',
      maintenance: 'maintenance',
      repair: 'repair',
      replace: 'replacement',
      retire: 'retired'
    };
    if (!map[action]) {
      return res.status(400).json({ success: false, message: 'Invalid action' });
    }
    asset.status = map[action];
    asset.serviceHistory = asset.serviceHistory || [];
    asset.serviceHistory.push({
      action: map[action],
      date: new Date(),
      engineer: engineerName || req.user.name || 'Vendor Ops',
      notes: notes || ''
    });
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
