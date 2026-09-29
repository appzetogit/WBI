/**
 * Admin review queue for vendor service offerings (vendors submit → admin
 * approves / requests changes / rejects → vendor activates).
 * Permission: vendors.read / vendors.approve (central adminAccess guard).
 */
const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const VendorServiceOffering = require('../../models/VendorServiceOffering');

router.get('/vendor-offerings', async (req, res) => {
  const { approvalStatus = 'PENDING', vendorId } = req.query;
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, parseInt(req.query.limit, 10) || 25);
  const filter = { deletedAt: null };
  if (approvalStatus !== 'all') filter.approvalStatus = approvalStatus;
  if (vendorId && mongoose.Types.ObjectId.isValid(vendorId)) filter.vendorId = vendorId;
  const [rows, total] = await Promise.all([
    VendorServiceOffering.find(filter).populate('vendorId', 'name businessName phone')
      .sort({ updatedAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    VendorServiceOffering.countDocuments(filter)
  ]);
  res.json({ success: true, data: rows, pagination: { page, limit, total } });
});

const decide = (approvalStatus, status) => async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid offering id' });
  const reason = String(req.body?.reason || '').trim();
  if (approvalStatus !== 'APPROVED' && !reason) {
    return res.status(400).json({ success: false, message: 'A reason is required' });
  }
  const offering = await VendorServiceOffering.findOne({ _id: req.params.id, deletedAt: null });
  if (!offering) return res.status(404).json({ success: false, message: 'Service offering not found' });
  if (offering.approvalStatus !== 'PENDING') {
    return res.status(409).json({ success: false, message: `Offering is ${offering.approvalStatus}, not pending review` });
  }
  offering.approvalStatus = approvalStatus;
  offering.approvalReason = reason || undefined;
  if (status) offering.status = status;
  if (approvalStatus === 'APPROVED') {
    offering.approvedBy = req.user._id;
    offering.approvedAt = new Date();
  }
  await offering.save();
  res.json({ success: true, message: `Offering ${approvalStatus.toLowerCase().replace('_', ' ')}`, data: offering });
};

router.post('/vendor-offerings/:id/approve', decide('APPROVED', null));
router.post('/vendor-offerings/:id/request-changes', decide('CHANGES_REQUESTED', 'DRAFT'));
router.post('/vendor-offerings/:id/reject', decide('REJECTED', 'REJECTED'));

module.exports = router;
