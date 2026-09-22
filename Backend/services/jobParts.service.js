/**
 * Parts for the Vendor Panel: WBI parts catalog, the vendor's inventory, and
 * the parts required for / used on its jobs.
 *
 * Stock rules (same buckets as the existing Resources inventory):
 *   quantity    = free stock on hand
 *   reservedQty = held for specific jobs
 * Every stock change is a conditional atomic update (never read-modify-write)
 * plus a VendorStockMovement row, so two people cannot take the last unit.
 */
const mongoose = require('mongoose');
const B2BJob = require('../models/B2BJob');
const Vendor = require('../models/Vendor');
const JobPart = require('../models/JobPart');
const VendorPartsCatalog = require('../models/VendorPartsCatalog');
const Category = require('../models/Category');
const VendorResourceInventory = require('../models/VendorResourceInventory');
const VendorResourceWarehouse = require('../models/VendorResourceWarehouse');
const VendorStockMovement = require('../models/VendorStockMovement');
const { LIFECYCLE: S } = require('./jobStateMachine');

const oid = (v) => new mongoose.Types.ObjectId(String(v._id || v));
const idStr = (v) => (v ? String(v._id || v) : null);
const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const money = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** Jobs that can still get required parts (work not yet submitted). */
const PARTS_OPEN_STATES = [S.PENDING_ASSIGNMENT, S.REJECTED, S.ASSIGNED, S.REASSIGNED, S.ACCEPTED, S.EN_ROUTE, S.ARRIVED, S.IN_PROGRESS, S.ON_HOLD];

class PartsError extends Error {
  constructor(message, status = 409, code = 'PARTS_REFUSED') {
    super(message);
    this.name = 'PartsError';
    this.status = status;
    this.code = code;
  }
}

const positiveQty = (v, label = 'Quantity') => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 100000) throw new PartsError(`${label} must be a whole number of at least 1`, 400, 'BAD_QUANTITY');
  return n;
};

const actorRef = (actor) => ({ actorId: actor?.id ? oid(actor.id) : null, role: actor?.role || 'vendor' });

// ── Stock movements ────────────────────────────────────────────────────────
/** Recompute stock status from the new free quantity (damage flag is kept). */
const refreshStockStatus = (itemId) => VendorResourceInventory.updateOne(
  { _id: itemId, stockStatus: { $ne: 'damaged' } },
  [{
    $set: {
      stockStatus: {
        $switch: {
          branches: [
            { case: { $lte: ['$quantity', 0] }, then: 'out_of_stock' },
            { case: { $lte: ['$quantity', '$reorderLevel'] }, then: 'low_stock' }
          ],
          default: 'in_stock'
        }
      }
    }
  }]
);

/**
 * Atomically move stock. freeDelta/reservedDelta may be negative; the update
 * only applies when enough free/reserved stock exists.
 */
const moveStock = async ({ vid, itemId, freeDelta = 0, reservedDelta = 0, type, job = null, jobPartId = null, note = '', actor }) => {
  const cond = { _id: oid(itemId), vendorId: oid(vid), demoTag: null };
  if (freeDelta < 0) cond.quantity = { $gte: -freeDelta };
  if (reservedDelta < 0) cond.reservedQty = { $gte: -reservedDelta };
  const label = `${type}${job?.jobId ? ` · ${job.jobId}` : ''}${note ? ` · ${note}` : ''}`.slice(0, 200);
  const item = await VendorResourceInventory.findOneAndUpdate(
    cond,
    { $inc: { quantity: freeDelta, reservedQty: reservedDelta }, $set: { lastMovement: label } },
    { new: true }
  );
  if (!item) {
    const exists = await VendorResourceInventory.findOne({ _id: oid(itemId), vendorId: oid(vid), demoTag: null }).select('name quantity reservedQty').lean();
    if (!exists) throw new PartsError('Inventory item not found', 404, 'NOT_FOUND');
    if (freeDelta < 0) throw new PartsError(`Only ${exists.quantity} ${exists.name} in stock`, 409, 'INSUFFICIENT_STOCK');
    throw new PartsError(`Only ${exists.reservedQty} ${exists.name} reserved`, 409, 'INSUFFICIENT_RESERVED');
  }
  await refreshStockStatus(item._id);
  if (item.warehouseId) {
    try {
      const { recalculateWarehouseStock } = require('./vendorCapacity.service');
      await recalculateWarehouseStock(item.warehouseId, vid);
    } catch (_) { /* warehouse totals are informational */ }
  }
  await VendorStockMovement.create({
    vendorId: oid(vid),
    itemId: item._id,
    itemName: item.name,
    type,
    quantityDelta: freeDelta,
    reservedDelta,
    balanceAfter: item.quantity,
    reservedAfter: item.reservedQty,
    jobId: job?._id || null,
    jobCode: job?.jobId || '',
    jobPartId,
    note,
    actor: actorRef(actor)
  });
  return item;
};

// ── Catalog ────────────────────────────────────────────────────────────────
const listCatalog = async (vid, { search, categoryId, page = 1, limit = 30 } = {}) => {
  const filter = { status: 'active' };
  if (search) {
    const rx = new RegExp(escapeRegex(String(search).trim()), 'i');
    filter.$or = [{ name: rx }, { hsnCode: rx }, { description: rx }];
  }
  if (categoryId && mongoose.Types.ObjectId.isValid(categoryId)) filter.categoryId = oid(categoryId);
  const p = Math.max(1, parseInt(page, 10) || 1);
  const l = Math.min(100, Math.max(1, parseInt(limit, 10) || 30));
  const [rows, total, categories] = await Promise.all([
    VendorPartsCatalog.find(filter).populate('categoryId', 'title').sort({ name: 1 }).skip((p - 1) * l).limit(l).lean(),
    VendorPartsCatalog.countDocuments(filter),
    VendorPartsCatalog.aggregate([
      { $match: { status: 'active' } },
      { $group: { _id: '$categoryId', n: { $sum: 1 } } }
    ])
  ]);
  const stock = await VendorResourceInventory.aggregate([
    { $match: { vendorId: oid(vid), demoTag: null, catalogPartId: { $in: rows.map((r) => r._id) } } },
    { $group: { _id: '$catalogPartId', quantity: { $sum: '$quantity' }, reserved: { $sum: '$reservedQty' }, items: { $push: '$_id' } } }
  ]);
  const stockBy = new Map(stock.map((s) => [String(s._id), s]));
  const catNames = new Map((await Category.find({ _id: { $in: categories.map((c) => c._id).filter(Boolean) } }).select('title').lean()).map((c) => [String(c._id), c.title]));
  return {
    data: rows.map((r) => {
      const s = stockBy.get(String(r._id));
      return {
        id: String(r._id),
        name: r.name,
        hsnCode: r.hsnCode || '',
        price: r.price,
        gstApplicable: r.gstApplicable !== false,
        gstPercentage: r.gstApplicable === false ? 0 : r.gstPercentage ?? 18,
        category: r.categoryId ? { id: String(r.categoryId._id), name: r.categoryId.title } : null,
        description: r.description || '',
        inStock: s ? s.quantity : null,
        reserved: s ? s.reserved : 0,
        inventoryItemId: s ? String(s.items[0]) : null
      };
    }),
    categories: categories.filter((c) => c._id).map((c) => ({ id: String(c._id), name: catNames.get(String(c._id)) || 'Category', count: c.n })),
    pagination: { page: p, limit: l, total, totalPages: Math.ceil(total / l) || 1 }
  };
};

// ── Inventory ──────────────────────────────────────────────────────────────
const inventoryRow = (i, reservedJobs = 0) => ({
  id: String(i._id),
  sku: i.sku,
  name: i.name,
  category: i.category,
  serviceKey: i.serviceCategoryCode,
  serviceName: i.serviceCategoryName || i.serviceCategoryCode,
  warehouse: i.warehouseName || null,
  unit: i.unit || 'pcs',
  available: i.quantity,
  reserved: i.reservedQty || 0,
  allocated: i.allocatedQty || 0,
  reorderLevel: i.reorderLevel,
  unitCost: i.unitCost || 0,
  stockValue: money((i.quantity + (i.reservedQty || 0)) * (i.unitCost || 0)),
  stockStatus: i.stockStatus,
  hsnCode: i.hsnCode || '',
  catalogPartId: idStr(i.catalogPartId),
  lastMovement: i.lastMovement || '',
  reservedForJobs: reservedJobs,
  updatedAt: i.updatedAt
});

const listInventory = async (vid, { search, status, serviceKey, page = 1, limit = 30 } = {}) => {
  const base = { vendorId: oid(vid), demoTag: null };
  const filter = { ...base };
  if (search) {
    const rx = new RegExp(escapeRegex(String(search).trim()), 'i');
    filter.$or = [{ name: rx }, { sku: rx }, { category: rx }, { hsnCode: rx }];
  }
  if (status) filter.stockStatus = status;
  if (serviceKey) filter.serviceCategoryCode = String(serviceKey).toUpperCase();
  const p = Math.max(1, parseInt(page, 10) || 1);
  const l = Math.min(100, Math.max(1, parseInt(limit, 10) || 30));
  const [rows, total, summary] = await Promise.all([
    VendorResourceInventory.find(filter).sort({ stockStatus: 1, name: 1 }).skip((p - 1) * l).limit(l).lean(),
    VendorResourceInventory.countDocuments(filter),
    VendorResourceInventory.aggregate([
      { $match: base },
      {
        $group: {
          _id: null,
          items: { $sum: 1 },
          lowStock: { $sum: { $cond: [{ $eq: ['$stockStatus', 'low_stock'] }, 1, 0] } },
          outOfStock: { $sum: { $cond: [{ $eq: ['$stockStatus', 'out_of_stock'] }, 1, 0] } },
          damaged: { $sum: { $cond: [{ $eq: ['$stockStatus', 'damaged'] }, 1, 0] } },
          value: { $sum: { $multiply: [{ $add: ['$quantity', { $ifNull: ['$reservedQty', 0] }] }, { $ifNull: ['$unitCost', 0] }] } }
        }
      }
    ])
  ]);
  const reservedJobs = await JobPart.aggregate([
    { $match: { vendorId: oid(vid), status: 'reserved', inventoryItemId: { $in: rows.map((r) => r._id) } } },
    { $group: { _id: '$inventoryItemId', jobs: { $addToSet: '$jobId' } } }
  ]);
  const rj = new Map(reservedJobs.map((r) => [String(r._id), r.jobs.length]));
  const s = summary[0] || {};
  return {
    data: rows.map((i) => inventoryRow(i, rj.get(String(i._id)) || 0)),
    summary: { items: s.items || 0, lowStock: s.lowStock || 0, outOfStock: s.outOfStock || 0, damaged: s.damaged || 0, stockValue: money(s.value) },
    pagination: { page: p, limit: l, total, totalPages: Math.ceil(total / l) || 1 }
  };
};

/** Vendor services a stock item may be filed under (not suspended). */
const vendorServices = async (vid) => {
  const vendor = await Vendor.findById(vid).select('approvedServices').lean();
  return (vendor?.approvedServices || [])
    .filter((s) => s.categoryCode && s.status !== 'suspended')
    .map((s) => ({ key: String(s.categoryCode).toUpperCase(), name: s.categoryName || s.categoryCode }));
};

const createInventoryItem = async (vid, body = {}, actor) => {
  let catalog = null;
  if (body.catalogPartId) {
    if (!mongoose.Types.ObjectId.isValid(body.catalogPartId)) throw new PartsError('Invalid catalog part', 400, 'BAD_ID');
    catalog = await VendorPartsCatalog.findOne({ _id: body.catalogPartId, status: 'active' }).lean();
    if (!catalog) throw new PartsError('Catalog part not found', 404, 'NOT_FOUND');
  }
  const name = String(body.name || catalog?.name || '').trim();
  if (name.length < 2) throw new PartsError('Part name is required', 400, 'NAME_REQUIRED');
  const services = await vendorServices(vid);
  const serviceKey = String(body.serviceKey || services[0]?.key || '').toUpperCase();
  const service = services.find((s) => s.key === serviceKey);
  if (!service) throw new PartsError('Pick one of your approved services for this item', 400, 'BAD_SERVICE');
  const quantity = body.quantity === undefined || body.quantity === '' ? 0 : Number(body.quantity);
  if (!Number.isInteger(quantity) || quantity < 0) throw new PartsError('Opening stock must be a whole number (0 or more)', 400, 'BAD_QUANTITY');
  const reorderLevel = body.reorderLevel === undefined || body.reorderLevel === '' ? 5 : Number(body.reorderLevel);
  if (!Number.isInteger(reorderLevel) || reorderLevel < 0) throw new PartsError('Reorder level must be a whole number', 400, 'BAD_REORDER');
  const unitCost = body.unitCost === undefined || body.unitCost === '' ? Number(catalog?.price || 0) : Number(body.unitCost);
  if (!Number.isFinite(unitCost) || unitCost < 0) throw new PartsError('Unit cost must be 0 or more', 400, 'BAD_COST');

  let warehouse = null;
  if (body.warehouseId) {
    warehouse = await VendorResourceWarehouse.findOne({ _id: body.warehouseId, vendorId: oid(vid), demoTag: null }).select('name').lean();
    if (!warehouse) throw new PartsError('Warehouse not found', 404, 'NOT_FOUND');
  }
  const dup = await VendorResourceInventory.exists({
    vendorId: oid(vid), demoTag: null, name: new RegExp(`^${escapeRegex(name)}$`, 'i'), warehouseId: warehouse?._id || null
  });
  if (dup) throw new PartsError(`${name} is already in your inventory${warehouse ? ` at ${warehouse.name}` : ''} — restock it instead`, 409, 'DUPLICATE');

  const item = await VendorResourceInventory.create({
    vendorId: oid(vid),
    name,
    category: String(body.category || catalog?.description || 'Spare part').slice(0, 100) || 'Spare part',
    serviceCategoryCode: service.key,
    serviceCategoryName: service.name,
    warehouseId: warehouse?._id || null,
    warehouseName: warehouse?.name || '',
    quantity,
    reorderLevel,
    unitCost,
    unit: String(body.unit || 'pcs').slice(0, 20),
    catalogPartId: catalog?._id || null,
    hsnCode: String(body.hsnCode || catalog?.hsnCode || '').slice(0, 20),
    lastMovement: `Created with ${quantity}`
  });
  await VendorStockMovement.create({
    vendorId: oid(vid), itemId: item._id, itemName: item.name, type: 'create',
    quantityDelta: quantity, balanceAfter: quantity, reservedAfter: 0, note: 'Opening stock', actor: actorRef(actor)
  });
  return inventoryRow(item.toObject());
};

/** restock (+n), correct (set exact free stock), damaged (−n), or edit reorder level / unit cost. */
const adjustInventory = async (vid, itemId, body = {}, actor) => {
  if (!mongoose.Types.ObjectId.isValid(String(itemId))) throw new PartsError('Invalid item', 400, 'BAD_ID');
  const item = await VendorResourceInventory.findOne({ _id: itemId, vendorId: oid(vid), demoTag: null }).lean();
  if (!item) throw new PartsError('Inventory item not found', 404, 'NOT_FOUND');
  const note = String(body.note || '').trim().slice(0, 200);
  const action = String(body.action || '');

  if (action === 'restock') {
    await moveStock({ vid, itemId, freeDelta: positiveQty(body.quantity), type: 'restock', note, actor });
  } else if (action === 'damaged') {
    if (note.length < 3) throw new PartsError('Say what happened to the damaged stock', 400, 'REASON_REQUIRED');
    await moveStock({ vid, itemId, freeDelta: -positiveQty(body.quantity), type: 'damaged', note, actor });
  } else if (action === 'correct') {
    const target = Number(body.quantity);
    if (!Number.isInteger(target) || target < 0) throw new PartsError('Counted stock must be a whole number (0 or more)', 400, 'BAD_QUANTITY');
    if (note.length < 3) throw new PartsError('Add a note for the stock correction (e.g. physical count)', 400, 'REASON_REQUIRED');
    const delta = target - item.quantity;
    if (delta) await moveStock({ vid, itemId, freeDelta: delta, type: 'correction', note, actor });
  } else if (action === 'edit') {
    const $set = {};
    if (body.reorderLevel !== undefined) {
      const r = Number(body.reorderLevel);
      if (!Number.isInteger(r) || r < 0) throw new PartsError('Reorder level must be a whole number', 400, 'BAD_REORDER');
      $set.reorderLevel = r;
    }
    if (body.unitCost !== undefined) {
      const c = Number(body.unitCost);
      if (!Number.isFinite(c) || c < 0) throw new PartsError('Unit cost must be 0 or more', 400, 'BAD_COST');
      $set.unitCost = c;
    }
    if (!Object.keys($set).length) throw new PartsError('Nothing to change', 400, 'NOTHING');
    await VendorResourceInventory.updateOne({ _id: item._id }, { $set });
    await refreshStockStatus(item._id);
  } else {
    throw new PartsError('action must be restock, damaged, correct or edit', 400, 'BAD_ACTION');
  }
  const after = await VendorResourceInventory.findById(item._id).lean();
  return inventoryRow(after);
};

const itemMovements = async (vid, itemId) => {
  if (!mongoose.Types.ObjectId.isValid(String(itemId))) throw new PartsError('Invalid item', 400, 'BAD_ID');
  const rows = await VendorStockMovement.find({ vendorId: oid(vid), itemId: oid(itemId) }).sort({ createdAt: -1 }).limit(50).lean();
  return rows.map((m) => ({
    id: String(m._id), type: m.type, quantityDelta: m.quantityDelta, reservedDelta: m.reservedDelta,
    balanceAfter: m.balanceAfter, reservedAfter: m.reservedAfter, jobCode: m.jobCode, note: m.note, role: m.actor?.role || null, at: m.createdAt
  }));
};

// ── Job parts ──────────────────────────────────────────────────────────────
const loadHeldJob = async (vid, jobId) => {
  if (!mongoose.Types.ObjectId.isValid(String(jobId))) throw new PartsError('Invalid job', 400, 'BAD_ID');
  const job = await B2BJob.findOne({ _id: jobId, assignedVendorId: oid(vid) })
    .select('jobId lifecycleStatus assignedTo assignedToName').read('primary').lean();
  if (!job) {
    const { JobAccessError } = require('./jobScope.service');
    if (await B2BJob.exists({ _id: jobId })) throw new JobAccessError('This job is not held by you');
    throw new PartsError('Job not found', 404, 'NOT_FOUND');
  }
  return job;
};

const jobPartRow = (p, item = null, job = null) => {
  const free = item ? item.quantity : null;
  let stockState = 'not_stocked';
  if (p.status === 'reserved') stockState = 'reserved';
  else if (p.status === 'required' && item) stockState = free >= p.quantity ? 'available' : 'short';
  return {
    id: String(p._id),
    jobId: String(p.jobId),
    jobCode: p.jobCode,
    jobStatus: job?.lifecycleStatus || null,
    engineer: p.engineerName || null,
    name: p.name,
    sku: p.sku || '',
    hsnCode: p.hsnCode || '',
    unit: p.unit,
    quantity: p.quantity,
    unitPrice: p.unitPrice,
    gstPercentage: p.gstPercentage,
    lineValue: money(p.quantity * p.unitPrice),
    status: p.status,
    stockState,
    inStock: free,
    shortBy: stockState === 'short' ? p.quantity - free : 0,
    inventoryItemId: idStr(p.inventoryItemId),
    catalogPartId: idStr(p.catalogPartId),
    note: p.note || '',
    cancelReason: p.cancelReason || '',
    requestedByRole: p.requestedBy?.role || null,
    requiredAt: p.requiredAt,
    reservedAt: p.reservedAt,
    usedAt: p.usedAt,
    cancelledAt: p.cancelledAt
  };
};

/** Resolve what a new job part refers to: inventory item, catalog part or a free-text part. */
const describePart = async (vid, body) => {
  if (body.inventoryItemId) {
    if (!mongoose.Types.ObjectId.isValid(body.inventoryItemId)) throw new PartsError('Invalid inventory item', 400, 'BAD_ID');
    const item = await VendorResourceInventory.findOne({ _id: body.inventoryItemId, vendorId: oid(vid), demoTag: null }).lean();
    if (!item) throw new PartsError('Inventory item not found', 404, 'NOT_FOUND');
    return { inventoryItemId: item._id, catalogPartId: item.catalogPartId || null, name: item.name, sku: item.sku || '', hsnCode: item.hsnCode || '', unit: item.unit || 'pcs', unitPrice: item.unitCost || 0 };
  }
  if (body.catalogPartId) {
    if (!mongoose.Types.ObjectId.isValid(body.catalogPartId)) throw new PartsError('Invalid catalog part', 400, 'BAD_ID');
    const c = await VendorPartsCatalog.findOne({ _id: body.catalogPartId, status: 'active' }).lean();
    if (!c) throw new PartsError('Catalog part not found', 404, 'NOT_FOUND');
    // Use the vendor's stock of this catalog part when it has one.
    const item = await VendorResourceInventory.findOne({ vendorId: oid(vid), demoTag: null, catalogPartId: c._id }).sort({ quantity: -1 }).lean();
    return {
      inventoryItemId: item?._id || null, catalogPartId: c._id, name: c.name, sku: item?.sku || '', hsnCode: c.hsnCode || '', unit: item?.unit || 'pcs',
      unitPrice: item?.unitCost || c.price || 0, gstPercentage: c.gstApplicable === false ? 0 : c.gstPercentage ?? 18
    };
  }
  const name = String(body.name || '').trim();
  if (name.length < 2) throw new PartsError('Pick an inventory item or catalog part, or enter a part name', 400, 'NAME_REQUIRED');
  const unitPrice = body.unitPrice === undefined || body.unitPrice === '' ? 0 : Number(body.unitPrice);
  if (!Number.isFinite(unitPrice) || unitPrice < 0) throw new PartsError('Price must be 0 or more', 400, 'BAD_PRICE');
  return { inventoryItemId: null, catalogPartId: null, name: name.slice(0, 200), sku: '', hsnCode: '', unit: String(body.unit || 'pcs').slice(0, 20), unitPrice };
};

/** Claim a part in one of `from` states and move it to `to` (prevents double actions). */
const claimPart = async (vid, partId, from, set) => {
  if (!mongoose.Types.ObjectId.isValid(String(partId))) throw new PartsError('Invalid part', 400, 'BAD_ID');
  const part = await JobPart.findOneAndUpdate({ _id: partId, vendorId: oid(vid), status: { $in: from } }, { $set: set }, { new: false });
  if (!part) {
    const existing = await JobPart.findOne({ _id: partId, vendorId: oid(vid) }).select('status').lean();
    if (!existing) throw new PartsError('Part not found', 404, 'NOT_FOUND');
    throw new PartsError(`This part is already ${existing.status}`, 409, 'PART_STATE');
  }
  return part; // the document as it was before the claim
};

const loadRow = async (partId) => {
  const p = await JobPart.findById(partId).lean();
  const [item, job] = await Promise.all([
    p.inventoryItemId ? VendorResourceInventory.findById(p.inventoryItemId).select('quantity').lean() : null,
    B2BJob.findById(p.jobId).select('lifecycleStatus').lean()
  ]);
  return jobPartRow(p, item, job);
};

/** Reserve a required part from stock. */
const reservePart = async (vid, partId, actor) => {
  const part = await claimPart(vid, partId, ['required'], { status: 'reserved', reservedAt: new Date() });
  if (!part.inventoryItemId) {
    await JobPart.updateOne({ _id: part._id }, { $set: { status: 'required', reservedAt: null } });
    throw new PartsError('This part is not in your inventory — add it to inventory first, or mark it used when bought', 409, 'NOT_STOCKED');
  }
  const job = await B2BJob.findById(part.jobId).select('jobId').lean();
  try {
    await moveStock({ vid, itemId: part.inventoryItemId, freeDelta: -part.quantity, reservedDelta: part.quantity, type: 'reserve', job, jobPartId: part._id, actor });
  } catch (err) {
    await JobPart.updateOne({ _id: part._id }, { $set: { status: 'required', reservedAt: null } });
    throw err;
  }
  return loadRow(part._id);
};

/** Add a part required for a job; reserves it from stock when asked and available. */
const addRequiredPart = async (vid, body = {}, actor) => {
  const job = await loadHeldJob(vid, body.jobId);
  if (!PARTS_OPEN_STATES.includes(job.lifecycleStatus)) {
    throw new PartsError(`Parts can be requested until work is submitted; this job is ${job.lifecycleStatus}`, 409, 'JOB_NOT_OPEN');
  }
  const quantity = positiveQty(body.quantity);
  const desc = await describePart(vid, body);
  const part = await JobPart.create({
    vendorId: oid(vid),
    jobId: job._id,
    jobCode: job.jobId,
    engineerId: job.assignedTo || null,
    engineerName: job.assignedToName || '',
    ...desc,
    quantity,
    note: String(body.note || '').slice(0, 500),
    requestedBy: actorRef(actor)
  });
  let reserveError = null;
  if (body.reserve && desc.inventoryItemId) {
    try {
      return { part: await reservePart(vid, part._id, actor), reserveError: null };
    } catch (err) {
      reserveError = err.message;
    }
  }
  return { part: await loadRow(part._id), reserveError };
};

/** Mark a required/reserved part as used on the job (deducts stock). */
const markPartUsed = async (vid, partId, { fromStock = true } = {}, actor) => {
  const part = await claimPart(vid, partId, ['required', 'reserved'], { status: 'used', usedAt: new Date(), usedBy: actorRef(actor) });
  const job = await B2BJob.findById(part.jobId).select('jobId lifecycleStatus').lean();
  const revert = () => JobPart.updateOne({ _id: part._id }, { $set: { status: part.status, usedAt: null, usedBy: {} } });
  if (job?.lifecycleStatus === S.CANCELLED) {
    await revert();
    throw new PartsError('The job was cancelled — cancel this part instead', 409, 'JOB_CANCELLED');
  }
  try {
    if (part.inventoryItemId && part.status === 'reserved') {
      await moveStock({ vid, itemId: part.inventoryItemId, reservedDelta: -part.quantity, type: 'use', job, jobPartId: part._id, actor });
    } else if (part.inventoryItemId && fromStock) {
      await moveStock({ vid, itemId: part.inventoryItemId, freeDelta: -part.quantity, type: 'use', job, jobPartId: part._id, actor });
    }
  } catch (err) {
    await revert();
    throw err;
  }
  return loadRow(part._id);
};

/** Record a part already used on a job (e.g. fitted on site). */
const recordUsedPart = async (vid, body = {}, actor) => {
  const job = await loadHeldJob(vid, body.jobId);
  if (job.lifecycleStatus === S.CANCELLED) throw new PartsError('Parts cannot be recorded on a cancelled job', 409, 'JOB_CANCELLED');
  const quantity = positiveQty(body.quantity);
  const desc = await describePart(vid, body);
  const part = await JobPart.create({
    vendorId: oid(vid), jobId: job._id, jobCode: job.jobId, engineerId: job.assignedTo || null, engineerName: job.assignedToName || '',
    ...desc, quantity, note: String(body.note || '').slice(0, 500), requestedBy: actorRef(actor)
  });
  try {
    return await markPartUsed(vid, part._id, { fromStock: body.fromStock !== false }, actor);
  } catch (err) {
    await JobPart.deleteOne({ _id: part._id, status: 'required' });
    throw err;
  }
};

/** Cancel a required/reserved part; a reservation goes back to free stock. */
const cancelPart = async (vid, partId, reason, actor) => {
  const why = String(reason || '').trim().slice(0, 300);
  if (why.length < 3) throw new PartsError('A reason is required to cancel a part', 400, 'REASON_REQUIRED');
  const part = await claimPart(vid, partId, ['required', 'reserved'], { status: 'cancelled', cancelledAt: new Date(), cancelReason: why });
  if (part.status === 'reserved' && part.inventoryItemId) {
    const job = await B2BJob.findById(part.jobId).select('jobId').lean();
    await moveStock({ vid, itemId: part.inventoryItemId, freeDelta: part.quantity, reservedDelta: -part.quantity, type: 'release', job, jobPartId: part._id, note: why, actor });
  }
  return loadRow(part._id);
};

/** Job cancelled or failed: release everything still required/reserved for it. */
const releaseJobParts = async (jobId, reason = 'Job closed') => {
  const parts = await JobPart.find({ jobId: oid(jobId), status: { $in: ['required', 'reserved'] } }).select('_id vendorId').lean();
  for (const p of parts) {
    try {
      await cancelPart(p.vendorId, p._id, reason, { role: 'system' });
    } catch (err) {
      console.warn(`[jobParts] release ${p._id} failed:`, err.message);
    }
  }
  return parts.length;
};

/**
 * Required (required + reserved) or used parts across the vendor's jobs.
 * The used view also returns parts engineers recorded as free text.
 */
const listJobParts = async (vid, { view = 'required', search, jobId, from, to, page = 1, limit = 30 } = {}) => {
  const base = { vendorId: oid(vid) };
  const filter = { ...base, status: view === 'used' ? 'used' : { $in: ['required', 'reserved'] } };
  if (jobId && mongoose.Types.ObjectId.isValid(jobId)) filter.jobId = oid(jobId);
  if (search) {
    const rx = new RegExp(escapeRegex(String(search).trim()), 'i');
    filter.$or = [{ name: rx }, { jobCode: rx }, { engineerName: rx }, { sku: rx }];
  }
  const dateField = view === 'used' ? 'usedAt' : 'requiredAt';
  if (from || to) {
    filter[dateField] = {};
    if (from) filter[dateField].$gte = new Date(from);
    if (to) filter[dateField].$lte = new Date(to);
  }
  const p = Math.max(1, parseInt(page, 10) || 1);
  const l = Math.min(100, Math.max(1, parseInt(limit, 10) || 30));
  const [rows, total, totals] = await Promise.all([
    JobPart.find(filter).sort({ [dateField]: -1, _id: -1 }).skip((p - 1) * l).limit(l).lean(),
    JobPart.countDocuments(filter),
    JobPart.aggregate([
      { $match: filter },
      { $group: { _id: '$status', parts: { $sum: 1 }, qty: { $sum: '$quantity' }, value: { $sum: { $multiply: ['$quantity', '$unitPrice'] } }, jobs: { $addToSet: '$jobId' } } }
    ])
  ]);
  const [items, jobs] = await Promise.all([
    VendorResourceInventory.find({ _id: { $in: rows.map((r) => r.inventoryItemId).filter(Boolean) } }).select('quantity').lean(),
    B2BJob.find({ _id: { $in: rows.map((r) => r.jobId) } }).select('lifecycleStatus').lean()
  ]);
  const itemBy = new Map(items.map((i) => [String(i._id), i]));
  const jobBy = new Map(jobs.map((j) => [String(j._id), j]));
  const data = rows.map((r) => jobPartRow(r, r.inventoryItemId ? itemBy.get(String(r.inventoryItemId)) : null, jobBy.get(String(r.jobId))));
  const byStatus = Object.fromEntries(totals.map((t) => [t._id, t]));

  const summary = view === 'used'
    ? { parts: byStatus.used?.parts || 0, quantity: byStatus.used?.qty || 0, value: money(byStatus.used?.value), jobs: byStatus.used?.jobs.length || 0 }
    : {
      required: byStatus.required?.parts || 0,
      reserved: byStatus.reserved?.parts || 0,
      jobs: new Set([...(byStatus.required?.jobs || []), ...(byStatus.reserved?.jobs || [])].map(String)).size,
      short: data.filter((r) => r.stockState === 'short').length,
      notStocked: data.filter((r) => r.stockState === 'not_stocked').length,
      value: money((byStatus.required?.value || 0) + (byStatus.reserved?.value || 0))
    };

  let legacy;
  if (view === 'used') {
    const lf = { assignedVendorId: oid(vid), partsReplaced: { $nin: [null, ''] } };
    if (from || to) {
      lf.completionSubmittedAt = {};
      if (from) lf.completionSubmittedAt.$gte = new Date(from);
      if (to) lf.completionSubmittedAt.$lte = new Date(to);
    }
    if (search) {
      const rx = new RegExp(escapeRegex(String(search).trim()), 'i');
      lf.$or = [{ partsReplaced: rx }, { jobId: rx }, { assignedToName: rx }];
    }
    const lj = await B2BJob.find(lf).select('jobId partsReplaced assignedToName completionSubmittedAt lifecycleStatus').sort({ completionSubmittedAt: -1 }).limit(50).lean();
    legacy = lj.map((j) => ({ jobId: String(j._id), jobCode: j.jobId, text: j.partsReplaced, engineer: j.assignedToName || null, at: j.completionSubmittedAt || null, jobStatus: j.lifecycleStatus }));
  }

  return { data, summary, ...(legacy ? { legacy } : {}), pagination: { page: p, limit: l, total, totalPages: Math.ceil(total / l) || 1 } };
};

/** Parts of one job (job detail drawer). */
const partsForJob = async (jobId) => {
  const rows = await JobPart.find({ jobId: oid(jobId), status: { $ne: 'cancelled' } }).sort({ requiredAt: 1 }).lean();
  const items = await VendorResourceInventory.find({ _id: { $in: rows.map((r) => r.inventoryItemId).filter(Boolean) } }).select('quantity').lean();
  const itemBy = new Map(items.map((i) => [String(i._id), i]));
  return rows.map((r) => jobPartRow(r, r.inventoryItemId ? itemBy.get(String(r.inventoryItemId)) : null));
};

module.exports = {
  PartsError,
  PARTS_OPEN_STATES,
  listCatalog,
  listInventory,
  createInventoryItem,
  adjustInventory,
  itemMovements,
  addRequiredPart,
  reservePart,
  markPartUsed,
  recordUsedPart,
  cancelPart,
  releaseJobParts,
  listJobParts,
  partsForJob
};
