const Vendor = require('../../models/Vendor');
const Booking = require('../../models/Booking');
const Withdrawal = require('../../models/Withdrawal');
const VendorBill = require('../../models/VendorBill');
const { validationResult } = require('express-validator');
const { VENDOR_STATUS, BOOKING_STATUS, PAYMENT_STATUS } = require('../../utils/constants');
const { createNotification } = require('../notificationControllers/notificationController');

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
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { businessName: { $regex: search, $options: 'i' } }
      ];
    }

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get vendors
    const vendors = await Vendor.find(query)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count
    const total = await Vendor.countDocuments(query);

    res.status(200).json({
      success: true,
      data: vendors,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
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

    const vendor = await Vendor.findById(id).select('-password');

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found'
      });
    }

    // Get vendor stats from VendorBill (single source of truth)
    const totalBookings = await Booking.countDocuments({ vendorId: vendor._id });
    const completedBookings = await Booking.countDocuments({ vendorId: vendor._id, status: BOOKING_STATUS.COMPLETED });

    const earningsResult = await VendorBill.aggregate([
      {
        $match: {
          vendorId: vendor._id,
          status: 'paid'
        }
      },
      {
        $group: {
          _id: null,
          totalEarnings: { $sum: '$vendorTotalEarning' },
          totalRevenue: { $sum: '$grandTotal' }
        }
      }
    ]);

    const bookingStats = [{
      totalBookings,
      completedBookings,
      totalEarnings: earningsResult[0]?.totalEarnings || 0,
      totalRevenue: earningsResult[0]?.totalRevenue || 0
    }];

    res.status(200).json({
      success: true,
      data: {
        vendor,
        stats: bookingStats[0] || {
          totalBookings: 0,
          completedBookings: 0,
          totalEarnings: 0
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

    // Send notification to vendor
    await createNotification({
      vendorId: vendor._id,
      type: 'vendor_approved',
      title: 'Vendor Registration Approved',
      message: 'Your vendor registration has been approved. You can now start accepting bookings.',
      relatedId: vendor._id,
      relatedType: 'vendor'
    });

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

    vendor.approvalStatus = VENDOR_STATUS.REJECTED;
    vendor.rejectedReason = reason || 'Registration rejected by admin';
    await vendor.save();

    // Send notification to vendor
    await createNotification({
      vendorId: vendor._id,
      type: 'vendor_rejected',
      title: 'Vendor Registration Rejected',
      message: `Your vendor registration has been rejected. Reason: ${vendor.rejectedReason}`,
      relatedId: vendor._id,
      relatedType: 'vendor'
    });

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

    vendor.approvalStatus = VENDOR_STATUS.SUSPENDED;
    vendor.isActive = false;
    await vendor.save();

    res.status(200).json({
      success: true,
      message: 'Vendor suspended successfully',
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

    // Get earnings from VendorBill (single source of truth)
    const billQuery = {
      vendorId: require('mongoose').Types.ObjectId(id),
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

    const vendor = await Vendor.findById(id);

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found'
      });
    }

    vendor.isActive = isActive;
    await vendor.save();

    // Log the action (optional but recommended)
    // console.log(`Vendor ${vendor._id} status changed to ${isActive}`);

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

    const vendor = await Vendor.findByIdAndDelete(id);

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found'
      });
    }

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
    
    const vendor = await Vendor.findById(id);
    if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found' });
    
    vendor.kycStatus = status;
    if (status === 'rejected' && reason) {
      // You can store reason in Vendor or VendorKYC
    }
    await vendor.save();

    try {
      const { buildOnboardingStatus, emitOnboardingStatus } = require('../../services/vendorOnboarding.service');
      emitOnboardingStatus(vendor._id, buildOnboardingStatus(vendor));
    } catch (_) {
      /* non-blocking */
    }
    
    res.status(200).json({ success: true, message: `KYC status updated to ${status}` });
  } catch (error) {
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
    
    const vendor = await Vendor.findById(id);
    if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found' });
    
    vendor.bankStatus = status;
    await vendor.save();

    try {
      const { buildOnboardingStatus, emitOnboardingStatus } = require('../../services/vendorOnboarding.service');
      emitOnboardingStatus(vendor._id, buildOnboardingStatus(vendor));
    } catch (_) {
      /* non-blocking */
    }
    
    res.status(200).json({ success: true, message: `Bank status updated to ${status}` });
  } catch (error) {
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

