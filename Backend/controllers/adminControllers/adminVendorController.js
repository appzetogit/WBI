const Vendor = require('../../models/Vendor');
const Booking = require('../../models/Booking');
const Withdrawal = require('../../models/Withdrawal');
const VendorBill = require('../../models/VendorBill');
const { validationResult } = require('express-validator');
const { VENDOR_STATUS, BOOKING_STATUS, PAYMENT_STATUS } = require('../../utils/constants');
const { createNotification } = require('../notificationControllers/notificationController');
const { logAudit } = require('../../utils/auditLogger');

/** Every admin decision about a vendor is recorded with actor, change and reason. */
const auditVendor = (req, actionType, vendor, oldValue, newValue, reason = '') =>
  logAudit({
    actionType,
    actorId: req.user?._id || req.user?.id || null,
    actorRole: 'admin',
    targetType: 'Vendor',
    targetId: vendor._id,
    oldValue,
    newValue,
    reason: String(reason || ''),
    req
  });

/**
 * Get all vendors with filters and pagination
 */
const getAllVendors = async (req, res) => {
  try {
    const {
      search,
      approvalStatus,
      isActive,
      page = 1,
      limit = 20
    } = req.query;

    // Build query
    const query = {};

    if (approvalStatus) {
      query.approvalStatus = approvalStatus;
    }
    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }

    // Search by name, email, phone, or business name
    if (search && String(search).trim()) {
      const rx = { $regex: String(search).trim().slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
      query.$or = [{ name: rx }, { email: rx }, { phone: rx }, { businessName: rx }];
    }

    // Pagination
    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 500);
    const skip = (pageNum - 1) * limitNum;

    // Get vendors
    const vendors = await Vendor.find(query)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    // Get total count
    const total = await Vendor.countDocuments(query);

    res.status(200).json({
      success: true,
      data: vendors,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    console.error('Get all vendors error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch vendors. Please try again.'
    });
  }
};

/**
 * Get vendor details
 */
const getVendorDetails = async (req, res) => {
  try {
    const { id } = req.params;

    const vendor = await Vendor.findById(id).select('-password').lean();

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found'
      });
    }

    let VendorBank;
    let VendorDocument;
    let KYCVerification;
    try { VendorBank = require('../../models/VendorBank'); } catch (_) { VendorBank = null; }
    try { VendorDocument = require('../../models/VendorDocument'); } catch (_) { VendorDocument = null; }
    try { KYCVerification = require('../../models/KYCVerification'); } catch (_) { KYCVerification = null; }

    const [bankAccounts, vaultDocuments, kycDocuments, totalBookings, completedBookings, earningsResult] = await Promise.all([
      VendorBank
        ? VendorBank.find({ vendorId: vendor._id })
          .select('-accountNumberEncrypted')
          .sort({ isPrimary: -1, updatedAt: -1 })
          .lean()
        : Promise.resolve([]),
      VendorDocument
        ? VendorDocument.find({ vendorId: vendor._id }).sort({ uploadedAt: -1 }).lean()
        : Promise.resolve([]),
      KYCVerification
        ? KYCVerification.find({ role: 'vendor', entityId: vendor._id }).lean()
        : Promise.resolve([]),
      Booking.countDocuments({ vendorId: vendor._id }),
      Booking.countDocuments({ vendorId: vendor._id, status: BOOKING_STATUS.COMPLETED }),
      VendorBill.aggregate([
        { $match: { vendorId: vendor._id, status: 'paid' } },
        {
          $group: {
            _id: null,
            totalEarnings: { $sum: '$vendorTotalEarning' },
            totalRevenue: { $sum: '$grandTotal' }
          }
        }
      ])
    ]);

    const otherLabels = ['GST Certificate', 'Company Registration', 'Cancelled Cheque', 'Work Order / Portfolio'];
    const otherDocs = (vendor.otherDocuments || []).map((url, idx) => ({
      label: otherLabels[idx] || `Document ${idx + 1}`,
      url,
      source: 'otherDocuments'
    })).filter((d) => d.url);

    const profileDocs = [
      { label: 'PAN Card', url: vendor.pan?.document, number: vendor.pan?.number, source: 'pan' },
      { label: 'Aadhaar Front', url: vendor.aadhar?.document, number: vendor.aadhar?.number, source: 'aadhar' },
      { label: 'Aadhaar Back', url: vendor.aadhar?.backDocument, source: 'aadharBack' },
      { label: 'Incorporation Certificate', url: vendor.incorporationCertificate, source: 'incorporation' },
      { label: 'PF Document', url: vendor.pfDocument, source: 'pf' },
      { label: 'ESI Document', url: vendor.esiDocument, source: 'esi' },
      { label: 'Profile Photo', url: vendor.profilePhoto, source: 'profile' },
      ...otherDocs
    ].filter((d) => d.url);

    const vaultDocs = (vaultDocuments || []).map((d) => ({
      label: d.title || d.documentType || 'Document',
      url: d.documentUrl,
      number: d.documentNumber || null,
      status: d.status,
      type: d.type,
      documentType: d.documentType,
      source: 'vault',
      _id: d._id
    })).filter((d) => d.url);

    const kycVerifications = (kycDocuments || []).map((d) => ({
      label: String(d.documentType).replace('_', ' ').toUpperCase(),
      url: d.fileUrl || d.frontFileUrl || d.backFileUrl || d.fileKey,
      number: d.documentNumberMasked || null,
      status: d.status || d.physicalUploadStatus,
      type: 'kyc',
      documentType: d.documentType,
      source: 'kyc',
      _id: d._id
    })).filter((d) => d.url);

    let resolveDocumentPreviewUrl = null;
    let isRealFileUrl = null;
    try {
      ({ resolveDocumentPreviewUrl, isRealFileUrl } = require('../../utils/documentPreviewUrl'));
    } catch (_) { /* optional */ }

    const seen = new Set();
    const documents = [...profileDocs, ...vaultDocs, ...kycVerifications]
      .map((d) => {
        let previewUrl = d.url;
        if (resolveDocumentPreviewUrl) {
          const resolved = resolveDocumentPreviewUrl(d.url, null);
          if (resolved?.previewUrl) previewUrl = resolved.previewUrl;
        }
        if (isRealFileUrl && !isRealFileUrl(previewUrl) && !isRealFileUrl(d.url)) {
          return null;
        }
        return {
          ...d,
          previewUrl: previewUrl || d.url,
          fileUrl: d.url
        };
      })
      .filter(Boolean)
      .filter((d) => {
        const key = String(d.fileUrl || d.url);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

    const primaryBank = bankAccounts.find((b) => b.isPrimary) || bankAccounts[0] || null;

    res.status(200).json({
      success: true,
      data: {
        vendor: {
          ...vendor,
          bankAccounts,
          primaryBank,
          documents
        },
        bankAccounts,
        documents,
        stats: {
          totalBookings,
          completedBookings,
          totalEarnings: earningsResult[0]?.totalEarnings || 0,
          totalRevenue: earningsResult[0]?.totalRevenue || 0
        }
      }
    });
  } catch (error) {
    console.error('Get vendor details error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch vendor details. Please try again.'
    });
  }
};

/**
 * Approve vendor registration
 */
const approveVendor = async (req, res) => {
  try {
    const { id } = req.params;

    const vendor = await Vendor.findById(id);

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found'
      });
    }

    const approveBefore = { approvalStatus: vendor.approvalStatus, isActive: vendor.isActive };
    vendor.approvalStatus = VENDOR_STATUS.APPROVED;
    vendor.approvalDate = new Date();
    vendor.isActive = true;
    vendor.operationalAuditStatus = 'approved';
    vendor.operationalAuditAt = new Date();
    if (vendor.onboarding) vendor.onboarding.status = 'APPROVED';
    await vendor.save();

    try {
      const { buildOnboardingStatus, emitOnboardingStatus } = require('../../services/vendorOnboarding.service');
      emitOnboardingStatus(vendor._id, buildOnboardingStatus(vendor));
    } catch (_) {
      /* non-blocking */
    }

    try {
      const { ensureVendorCompanyCode } = require('../../utils/vendorCompanyCode');
      await ensureVendorCompanyCode(vendor);
    } catch (codeErr) {
      console.warn('Vendor company code generation failed:', codeErr.message);
    }

    // Notify vendor via enterprise orchestrator (in-app + push + email + SMS when DLT configured)
    try {
      const { emitAsync } = require('../../services/notification/notificationOrchestrator.service');
      emitAsync('vendor_approved', {
        targets: { vendorId: vendor._id },
        data: {
          vendorId: vendor._id,
          businessName: vendor.businessName || vendor.name,
          email: vendor.email,
          phone: vendor.phone
        },
        actorId: req.user?._id
      });
    } catch (notifErr) {
      console.warn('vendor_approved notify failed:', notifErr.message);
      await createNotification({
        vendorId: vendor._id,
        type: 'vendor_approved',
        title: 'Vendor Registration Approved',
        message: 'Your vendor registration has been approved. You can now start accepting bookings.',
        relatedId: vendor._id,
        relatedType: 'vendor'
      });
    }

    await auditVendor(req, 'ADMIN_APPROVED_VENDOR', vendor, approveBefore, { approvalStatus: vendor.approvalStatus, isActive: true });

    res.status(200).json({
      success: true,
      message: 'Vendor approved successfully',
      data: vendor
    });
  } catch (error) {
    console.error('Approve vendor error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to approve vendor. Please try again.'
    });
  }
};

/**
 * Reject vendor registration
 */
const rejectVendor = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { id } = req.params;
    const { reason } = req.body;

    const vendor = await Vendor.findById(id);

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found'
      });
    }

    const rejectBefore = { approvalStatus: vendor.approvalStatus, isActive: vendor.isActive };
    vendor.approvalStatus = VENDOR_STATUS.REJECTED;
    vendor.rejectedReason = reason || 'Registration rejected by admin';
    await vendor.save();
    await auditVendor(req, 'ADMIN_REJECTED_VENDOR', vendor, rejectBefore, { approvalStatus: vendor.approvalStatus }, vendor.rejectedReason);

    try {
      const { emitAsync } = require('../../services/notification/notificationOrchestrator.service');
      emitAsync('vendor_rejected', {
        targets: { vendorId: vendor._id },
        data: {
          vendorId: vendor._id,
          reason: vendor.rejectedReason,
          email: vendor.email,
          phone: vendor.phone
        },
        actorId: req.user?._id
      });
    } catch (notifErr) {
      console.warn('vendor_rejected notify failed:', notifErr.message);
      await createNotification({
        vendorId: vendor._id,
        type: 'vendor_rejected',
        title: 'Vendor Registration Rejected',
        message: `Your vendor registration has been rejected. Reason: ${vendor.rejectedReason}`,
        relatedId: vendor._id,
        relatedType: 'vendor'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Vendor rejected successfully',
      data: vendor
    });
  } catch (error) {
    console.error('Reject vendor error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reject vendor. Please try again.'
    });
  }
};

/**
 * Suspend vendor
 */
const suspendVendor = async (req, res) => {
  try {
    const { id } = req.params;

    const vendor = await Vendor.findById(id);

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found'
      });
    }

    const reason = String(req.body?.reason || '').trim();
    if (!reason) {
      return res.status(400).json({ success: false, message: 'A reason is required to suspend a vendor' });
    }
    const suspendBefore = { approvalStatus: vendor.approvalStatus, isActive: vendor.isActive };
    vendor.approvalStatus = VENDOR_STATUS.SUSPENDED;
    vendor.isActive = false;
    vendor.rejectedReason = reason;
    await vendor.save();
    await auditVendor(req, 'ADMIN_SUSPENDED_VENDOR', vendor, suspendBefore, { approvalStatus: vendor.approvalStatus, isActive: false }, reason);

    // Jobs the vendor still holds need an operator's attention.
    const B2BJob = require('../../models/B2BJob');
    const { viewFilter } = require('../../services/b2bJobViews');
    const openJobs = await B2BJob.countDocuments({
      assignedVendorId: vendor._id,
      $nor: [viewFilter('resolved'), viewFilter('cancelled'), viewFilter('failed')]
    });

    res.status(200).json({
      success: true,
      openJobs,
      message: openJobs
        ? `Vendor suspended. ${openJobs} open job(s) are still with this vendor; reassign them from the Project Assignment Engine.`
        : 'Vendor suspended successfully',
      data: vendor
    });
  } catch (error) {
    console.error('Suspend vendor error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to suspend vendor. Please try again.'
    });
  }
};

/**
 * View vendor bookings
 */
const getVendorBookings = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, page = 1, limit = 20 } = req.query;

    // Build query
    const query = { vendorId: id };
    if (status) {
      query.status = status;
    }

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get bookings
    const bookings = await Booking.find(query)
      .populate('userId', 'name phone')
      .populate('serviceId', 'title iconUrl')
      .populate('workerId', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Booking.countDocuments(query);

    res.status(200).json({
      success: true,
      data: bookings,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get vendor bookings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch vendor bookings. Please try again.'
    });
  }
};

/**
 * View vendor earnings
 */
const getVendorEarnings = async (req, res) => {
  try {
    const { id } = req.params;
    const { startDate, endDate } = req.query;
    const mongoose = require('mongoose');
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid vendor id' });
    }

    // Get earnings from VendorBill (single source of truth)
    const billQuery = {
      vendorId: new mongoose.Types.ObjectId(id),
      status: 'paid'
    };

    if (startDate || endDate) {
      billQuery.paidAt = {};
      if (startDate) billQuery.paidAt.$gte = new Date(startDate);
      if (endDate) billQuery.paidAt.$lte = new Date(endDate);
    }

    const earnings = await VendorBill.aggregate([
      { $match: billQuery },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$grandTotal' },
          vendorEarnings: { $sum: '$vendorTotalEarning' },
          platformCommission: { $sum: '$companyRevenue' },
          totalBookings: { $sum: 1 }
        }
      }
    ]);

    res.status(200).json({
      success: true,
      data: earnings[0] || {
        totalRevenue: 0,
        vendorEarnings: 0,
        platformCommission: 0,
        totalBookings: 0
      }
    });
  } catch (error) {
    console.error('Get vendor earnings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch vendor earnings. Please try again.'
    });
  }
};

/**
 * Get all vendor bookings (global)
 */
const getAllVendorBookings = async (req, res) => {
  try {
    const { status, page = 1, limit = 20, search } = req.query;

    const query = { vendorId: { $exists: true, $ne: null } };

    const statusGroups = {
      in_progress: [
        BOOKING_STATUS.IN_PROGRESS,
        BOOKING_STATUS.SERVICE_STARTED,
        BOOKING_STATUS.JOURNEY_STARTED,
        BOOKING_STATUS.ARRIVED,
        BOOKING_STATUS.WORKER_ASSIGNED,
        BOOKING_STATUS.ASSIGNED,
        BOOKING_STATUS.VISITED,
        BOOKING_STATUS.WORK_DONE
      ],
      completed: [
        BOOKING_STATUS.COMPLETED,
        BOOKING_STATUS.CLOSED,
        BOOKING_STATUS.PAID,
        BOOKING_STATUS.COMPLETED_PENDING_PAYMENT
      ],
      cancelled: [
        BOOKING_STATUS.CANCELLED,
        BOOKING_STATUS.REJECTED,
        BOOKING_STATUS.REFUNDED,
        BOOKING_STATUS.DISPUTED
      ],
      pending: [
        BOOKING_STATUS.PENDING,
        BOOKING_STATUS.REQUESTED,
        BOOKING_STATUS.SEARCHING,
        BOOKING_STATUS.SEARCHING_WORKER,
        BOOKING_STATUS.REQUEST_SENT,
        BOOKING_STATUS.AWAITING_PAYMENT,
        BOOKING_STATUS.CONFIRMED,
        BOOKING_STATUS.ACCEPTED,
        BOOKING_STATUS.SCHEDULED,
        BOOKING_STATUS.ADMIN_ACTION_REQUIRED
      ]
    };

    if (status && status !== 'all') {
      if (statusGroups[status]) {
        query.status = { $in: statusGroups[status] };
      } else {
        query.status = status;
      }
    }

    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    if (search) {
      const vendors = await Vendor.find({
        $or: [
          { businessName: { $regex: search, $options: 'i' } },
          { name: { $regex: search, $options: 'i' } },
          { phone: { $regex: search, $options: 'i' } }
        ]
      }).select('_id');

      const vendorIds = vendors.map((v) => v._id);
      query.vendorId = { $in: vendorIds };
    }

    const lim = parseInt(limit, 10);

    const [bookings, total] = await Promise.all([
      Booking.find(query)
        .populate('vendorId', 'name businessName phone profileImage')
        .populate('userId', 'name phone')
        .populate('serviceId', 'title iconUrl')
        .populate('workerId', 'name phone')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(lim)
        .lean(),
      Booking.countDocuments(query)
    ]);

    const data = bookings.map((b) => ({
      ...b,
      displayDate: b.scheduledDate || b.createdAt,
      serviceTitle: b.serviceId?.title || b.serviceName || 'Service'
    }));

    res.status(200).json({
      success: true,
      data,
      pagination: {
        page: parseInt(page, 10),
        limit: lim,
        total,
        pages: Math.ceil(total / lim) || 1
      }
    });
  } catch (error) {
    console.error('Get all vendor bookings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch all vendor bookings.'
    });
  }
};

/**
 * Get vendor payments summary
 */
const getVendorPaymentsSummary = async (req, res) => {
  try {
    const { search } = req.query;
    const query = {};
    if (search && String(search).trim()) {
      const term = String(search).trim();
      query.$or = [
        { businessName: { $regex: term, $options: 'i' } },
        { name: { $regex: term, $options: 'i' } },
        { phone: { $regex: term, $options: 'i' } }
      ];
    }

    const vendors = await Vendor.find(query)
      .select('name businessName phone wallet email approvalStatus isActive')
      .sort({ 'wallet.dues': -1, 'wallet.earnings': -1, businessName: 1 })
      .lean();

    const vendorIds = vendors.map((v) => v._id);
    const pendingWithdrawals = vendorIds.length
      ? await Withdrawal.aggregate([
          { $match: { vendorId: { $in: vendorIds }, status: 'pending' } },
          { $group: { _id: '$vendorId', total: { $sum: '$amount' } } }
        ])
      : [];

    const pendingMap = new Map(
      pendingWithdrawals.map((r) => [String(r._id), r.total || 0])
    );

    let meta = {
      totalDuesToAdmin: 0,
      totalEarningsOwed: 0,
      totalPendingWithdrawals: 0,
      vendorCount: vendors.length
    };

    const data = vendors.map((v) => {
      const dues = Number(v.wallet?.dues) || 0;
      const earnings = Number(v.wallet?.earnings) || 0;
      const pendingWithdrawal = pendingMap.get(String(v._id)) || 0;
      const netBalance = earnings - dues;

      meta.totalDuesToAdmin += dues;
      meta.totalEarningsOwed += earnings;
      meta.totalPendingWithdrawals += pendingWithdrawal;

      return {
        ...v,
        paymentSummary: {
          dues,
          earnings,
          netBalance,
          pendingWithdrawal,
          totalWithdrawn: Number(v.wallet?.totalWithdrawn) || 0,
          totalSettled: Number(v.wallet?.totalSettled) || 0,
          totalCashCollected: Number(v.wallet?.totalCashCollected) || 0,
          cashLimit: Number(v.wallet?.cashLimit) || 10000,
          isBlocked: Boolean(v.wallet?.isBlocked)
        }
      };
    });

    res.status(200).json({
      success: true,
      data,
      meta
    });
  } catch (error) {
    console.error('Get vendor payments summary error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch vendor payments summary.'
    });
  }
};

/**
 * Toggle vendor active status (approve/disable login)
 */
const toggleVendorStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body; // Expecting { isActive: true/false }
    if (typeof isActive !== 'boolean') {
      return res.status(400).json({ success: false, message: 'isActive must be true or false' });
    }

    const vendor = await Vendor.findById(id);

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found'
      });
    }

    const toggleBefore = { isActive: vendor.isActive };
    vendor.isActive = isActive;
    await vendor.save();
    await auditVendor(req, isActive ? 'ADMIN_ACTIVATED_VENDOR' : 'ADMIN_DEACTIVATED_VENDOR', vendor, toggleBefore, { isActive }, req.body?.reason);

    res.status(200).json({
      success: true,
      message: `Vendor ${isActive ? 'activated' : 'deactivated'} successfully`,
      data: vendor
    });
  } catch (error) {
    console.error('Toggle vendor status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update vendor status'
    });
  }
};

/**
 * Delete vendor
 */
const deleteVendor = async (req, res) => {
  try {
    const { id } = req.params;

    const vendor = await Vendor.findById(id);
    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found'
      });
    }

    // A vendor with jobs, bookings, engineers, bills or withdrawals is part of
    // the record: deleting it would orphan them. Deactivate it instead.
    const B2BJob = require('../../models/B2BJob');
    const Engineer = require('../../models/Engineer');
    const [jobs, bookings, engineers, bills, withdrawals] = await Promise.all([
      B2BJob.countDocuments({ $or: [{ assignedVendorId: vendor._id }, { notifiedVendors: vendor._id }] }),
      Booking.countDocuments({ vendorId: vendor._id }),
      Engineer.countDocuments({ vendorId: vendor._id }),
      VendorBill.countDocuments({ vendorId: vendor._id }),
      Withdrawal.countDocuments({ vendorId: vendor._id })
    ]);
    const linked = { jobs, bookings, engineers, bills, withdrawals };
    if (jobs + bookings + engineers + bills + withdrawals > 0) {
      return res.status(409).json({
        success: false,
        code: 'VENDOR_HAS_RECORDS',
        linked,
        message: 'This vendor has jobs, bookings, engineers or payments on record and cannot be deleted. Deactivate or suspend it instead.'
      });
    }

    await auditVendor(req, 'ADMIN_DELETED_VENDOR', vendor,
      { businessName: vendor.businessName, name: vendor.name, phone: vendor.phone, email: vendor.email, approvalStatus: vendor.approvalStatus },
      null, req.body?.reason);
    await Vendor.deleteOne({ _id: vendor._id });

    res.status(200).json({
      success: true,
      message: 'Vendor deleted successfully'
    });
  } catch (error) {
    console.error('Delete vendor error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete vendor'
    });
  }
};

/**
 * Update vendor KYC status
 */
const updateVendorKycStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, reason } = req.body;
    if (!['pending', 'verified', 'rejected'].includes(status)) {
      return res.status(400).json({ success: false, message: 'status must be pending, verified or rejected' });
    }
    if (status === 'rejected' && !String(reason || '').trim()) {
      return res.status(400).json({ success: false, message: 'A reason is required to reject KYC' });
    }

    const vendor = await Vendor.findById(id);
    if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found' });

    const kycBefore = { kycStatus: vendor.kycStatus };
    vendor.kycStatus = status;
    await vendor.save();
    // The reason is kept on the audit trail for this vendor.
    await auditVendor(req, 'ADMIN_VENDOR_KYC_STATUS', vendor, kycBefore, { kycStatus: status }, reason);

    try {
      const { buildOnboardingStatus, emitOnboardingStatus } = require('../../services/vendorOnboarding.service');
      emitOnboardingStatus(vendor._id, buildOnboardingStatus(vendor));
    } catch (_) {
      /* non-blocking */
    }

    res.status(200).json({ success: true, message: `KYC status updated to ${status}` });
  } catch (error) {
    console.error('Update vendor KYC status error:', error);
    res.status(500).json({ success: false, message: 'Failed to update KYC status' });
  }
};

/**
 * Update vendor Bank status
 */
const updateVendorBankStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, reason } = req.body;
    if (!['pending', 'verified', 'rejected'].includes(status)) {
      return res.status(400).json({ success: false, message: 'status must be pending, verified or rejected' });
    }
    if (status === 'rejected' && !String(reason || '').trim()) {
      return res.status(400).json({ success: false, message: 'A reason is required to reject bank details' });
    }

    const vendor = await Vendor.findById(id);
    if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found' });

    const bankBefore = { bankStatus: vendor.bankStatus };
    vendor.bankStatus = status;
    await vendor.save();
    await auditVendor(req, 'ADMIN_VENDOR_BANK_STATUS', vendor, bankBefore, { bankStatus: status }, reason);

    try {
      const { buildOnboardingStatus, emitOnboardingStatus } = require('../../services/vendorOnboarding.service');
      emitOnboardingStatus(vendor._id, buildOnboardingStatus(vendor));
    } catch (_) {
      /* non-blocking */
    }

    res.status(200).json({ success: true, message: `Bank status updated to ${status}` });
  } catch (error) {
    console.error('Update vendor bank status error:', error);
    res.status(500).json({ success: false, message: 'Failed to update Bank status' });
  }
};

/**
 * Update vendor Registration Config
 */
const updateVendorRegistrationConfig = async (req, res) => {
  try {
    const VendorRegistrationConfig = require('../../models/VendorRegistrationConfig');
    let config = await VendorRegistrationConfig.findOne();
    if (!config) {
      config = new VendorRegistrationConfig(req.body);
    } else {
      Object.assign(config, req.body);
    }
    await config.save();

    res.status(200).json({ success: true, message: 'Configuration updated successfully', data: config });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update configuration' });
  }
};

module.exports = {
  getAllVendors,
  getVendorDetails,
  approveVendor,
  rejectVendor,
  suspendVendor,
  getVendorBookings,
  getVendorEarnings,
  getAllVendorBookings,
  getVendorPaymentsSummary,
  toggleVendorStatus,
  deleteVendor,
  updateVendorKycStatus,
  updateVendorBankStatus,
  updateVendorRegistrationConfig
};

