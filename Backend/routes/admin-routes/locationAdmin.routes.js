/**
 * Location masters + coverage lookup (spec §10). Reads: services.read,
 * writes: locations.manage (central adminAccess guard).
 */
const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const LocationMaster = require('../../models/LocationMaster');

const TYPES = ['country', 'state', 'pincode', 'service_area'];
const INDIA_STATES = [
  ['AN', 'Andaman and Nicobar Islands'], ['AP', 'Andhra Pradesh'], ['AR', 'Arunachal Pradesh'], ['AS', 'Assam'], ['BR', 'Bihar'],
  ['CH', 'Chandigarh'], ['CT', 'Chhattisgarh'], ['DH', 'Dadra and Nagar Haveli and Daman and Diu'], ['DL', 'Delhi'], ['GA', 'Goa'],
  ['GJ', 'Gujarat'], ['HR', 'Haryana'], ['HP', 'Himachal Pradesh'], ['JK', 'Jammu and Kashmir'], ['JH', 'Jharkhand'],
  ['KA', 'Karnataka'], ['KL', 'Kerala'], ['LA', 'Ladakh'], ['LD', 'Lakshadweep'], ['MP', 'Madhya Pradesh'],
  ['MH', 'Maharashtra'], ['MN', 'Manipur'], ['ML', 'Meghalaya'], ['MZ', 'Mizoram'], ['NL', 'Nagaland'],
  ['OR', 'Odisha'], ['PY', 'Puducherry'], ['PB', 'Punjab'], ['RJ', 'Rajasthan'], ['SK', 'Sikkim'],
  ['TN', 'Tamil Nadu'], ['TG', 'Telangana'], ['TR', 'Tripura'], ['UP', 'Uttar Pradesh'], ['UT', 'Uttarakhand'], ['WB', 'West Bengal']
];

const wrap = (fn) => (req, res) => fn(req, res).catch((e) => {
  if (e.code === 11000) return res.status(409).json({ success: false, message: 'That code already exists' });
  if (e.name === 'ValidationError') return res.status(400).json({ success: false, message: Object.values(e.errors).map((x) => x.message).join('; ') });
  console.error('[locations]', e);
  return res.status(500).json({ success: false, message: 'Request failed' });
});

router.get('/locations', wrap(async (req, res) => {
  const { type, parentId, cityId, q } = req.query;
  const filter = {};
  if (type) filter.type = type;
  if (parentId && mongoose.Types.ObjectId.isValid(parentId)) filter.parentId = parentId;
  if (cityId && mongoose.Types.ObjectId.isValid(cityId)) filter.cityId = cityId;
  if (q) filter.$or = [{ name: new RegExp(String(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }, { code: String(q).toUpperCase() }, { pincodes: String(q) }];
  const rows = await LocationMaster.find(filter).populate('cityId', 'name').populate('parentId', 'name code').sort({ type: 1, name: 1 }).limit(1000).lean();
  res.json({ success: true, data: rows });
}));

router.post('/locations', wrap(async (req, res) => {
  const { type, name, code, parentId, cityId, pincodes, serviceKeys, isActive } = req.body || {};
  if (!TYPES.includes(type)) return res.status(400).json({ success: false, message: `type must be one of ${TYPES.join(', ')}` });
  if (type === 'pincode' && !/^[1-9][0-9]{5}$/.test(String(code || name))) return res.status(400).json({ success: false, message: 'Pincode must be 6 digits' });
  const doc = await LocationMaster.create({
    type, name: name || code, code: type === 'pincode' ? String(code || name) : code, parentId: parentId || null, cityId: cityId || null,
    pincodes: Array.isArray(pincodes) ? pincodes.map(String) : [], serviceKeys: Array.isArray(serviceKeys) ? serviceKeys : [], isActive: isActive !== false
  });
  res.status(201).json({ success: true, data: doc });
}));

router.put('/locations/:id', wrap(async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid id' });
  const allowed = ['name', 'code', 'parentId', 'cityId', 'pincodes', 'serviceKeys', 'isActive'];
  const set = Object.fromEntries(Object.entries(req.body || {}).filter(([k]) => allowed.includes(k)));
  const doc = await LocationMaster.findByIdAndUpdate(req.params.id, { $set: set }, { new: true, runValidators: true });
  if (!doc) return res.status(404).json({ success: false, message: 'Location not found' });
  res.json({ success: true, data: doc });
}));

router.delete('/locations/:id', wrap(async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid id' });
  if (await LocationMaster.exists({ parentId: req.params.id })) return res.status(409).json({ success: false, message: 'Remove its child locations first' });
  await LocationMaster.deleteOne({ _id: req.params.id });
  res.json({ success: true, message: 'Location deleted' });
}));

// One-click master data: India + its states / union territories (idempotent)
router.post('/locations/seed-india', wrap(async (req, res) => {
  const india = await LocationMaster.findOneAndUpdate({ type: 'country', code: 'IN' }, { $setOnInsert: { name: 'India', isActive: true } }, { upsert: true, new: true });
  let created = 0;
  for (const [code, name] of INDIA_STATES) {
    const r = await LocationMaster.updateOne({ type: 'state', code }, { $setOnInsert: { name, parentId: india._id, isActive: true } }, { upsert: true });
    created += r.upsertedCount || 0;
  }
  res.json({ success: true, message: `India with ${INDIA_STATES.length} states/UTs ready (${created} new)` });
}));

// Who can serve this pincode (and service)? Vendor coverage + engineer / worker presence + service areas
router.get('/locations/coverage', wrap(async (req, res) => {
  const pincode = String(req.query.pincode || '').trim();
  const serviceKey = req.query.serviceKey ? String(req.query.serviceKey).toUpperCase() : null;
  if (!/^[1-9][0-9]{5}$/.test(pincode)) return res.status(400).json({ success: false, message: 'pincode (6 digits) is required' });
  const VendorServiceCoverage = require('../../models/VendorServiceCoverage');
  const Engineer = require('../../models/Engineer');
  const Worker = require('../../models/Worker');
  const areas = await LocationMaster.find({ type: 'service_area', pincodes: pincode, isActive: true }).populate('cityId', 'name').lean();
  const cities = [...new Set(areas.map((a) => a.cityId?.name).filter(Boolean))];
  const cityRx = cities.map((c) => new RegExp(`^${c}$`, 'i'));
  const covFilter = { active: true, $or: [{ coveragePincodes: pincode }, ...(cities.length ? [{ coverageCities: { $in: cities.map((c) => c.toLowerCase()) } }] : [])] };
  if (serviceKey) covFilter.serviceKey = serviceKey;
  const [vendors, engineers, workers] = await Promise.all([
    VendorServiceCoverage.find(covFilter).populate('vendorId', 'businessName name approvalStatus').lean(),
    Engineer.find({ approvalStatus: 'approved', isActive: { $ne: false }, $or: [{ 'address.pincode': pincode }, ...(cityRx.length ? [{ 'address.city': { $in: cityRx } }] : [])] })
      .select('name engineerType status address.city address.pincode serviceCategories').limit(200).lean(),
    Worker.countDocuments({ approvalStatus: 'approved', isActive: { $ne: false }, $or: [{ 'address.pincode': pincode }, ...(cityRx.length ? [{ 'address.city': { $in: cityRx } }] : [])] })
  ]);
  res.json({
    success: true,
    data: {
      pincode, serviceKey,
      serviceAreas: areas.map((a) => ({ id: a._id, name: a.name, city: a.cityId?.name, services: a.serviceKeys })),
      vendors: vendors.map((v) => ({ vendorId: v.vendorId?._id, vendor: v.vendorId?.businessName || v.vendorId?.name, serviceKey: v.serviceKey, byPincode: (v.coveragePincodes || []).includes(pincode) })),
      engineers: engineers.map((e) => ({ id: e._id, name: e.name, type: e.engineerType, status: e.status, city: e.address?.city, pincode: e.address?.pincode })),
      workers
    }
  });
}));

module.exports = router;
