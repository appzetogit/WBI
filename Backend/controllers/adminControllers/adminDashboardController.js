const User = require('../../models/User');
const Vendor = require('../../models/Vendor');
const Worker = require('../../models/Worker');
const Engineer = require('../../models/Engineer');
const B2BCompany = require('../../models/B2BCompany');
const Dispute = require('../../models/Dispute');
const Booking = require('../../models/Booking');
const Withdrawal = require('../../models/Withdrawal');
const Settlement = require('../../models/Settlement');
const Scrap = require('../../models/Scrap');
const Service = require('../../models/Service');
const UserService = require('../../models/UserService');
const { BOOKING_STATUS, BOOKING_STATUS_GROUPS, PAYMENT_STATUS, VENDOR_STATUS } = require('../../utils/constants');

/**
 * Helper to build date range filter on createdAt or completedAt
 */
const buildDateFilter = (startDate, endDate, field = 'createdAt') => {
  const filter = {};
  if (startDate || endDate) {
    filter[field] = {};
    if (startDate) filter[field].$gte = new Date(startDate);
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      filter[field].$lte = end;
    }
  }
  return filter;
};

/**
 * Get overall dashboard stats
 */
const getDashboardStats = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const dateFilter = buildDateFilter(startDate, endDate, 'createdAt');

    // Revenue date filter: matching on either completedAt or createdAt in range
    let revenueDateMatch = {};
    if (startDate || endDate) {
      const s = startDate ? new Date(startDate) : new Date(0);
      const e = endDate ? new Date(endDate) : new Date();
      e.setHours(23, 59, 59, 999);
      revenueDateMatch = {
        $or: [
          { completedAt: { $gte: s, $lte: e } },
          { $and: [{ completedAt: null }, { createdAt: { $gte: s, $lte: e } }] }
        ]
      };
    }

    // Total counts
    const totalUsers = await User.countDocuments({ isActive: true, ...dateFilter });
    const totalVendors = await Vendor.countDocuments({ isActive: true, ...dateFilter });
    const totalWorkers = await Worker.countDocuments({ isActive: true, ...dateFilter });
    const totalBookings = await Booking.countDocuments(dateFilter);

    // Booking stats using shared status groups
    const [pendingBookings, confirmedBookings, inProgressBookings, completedBookings, cancelledBookings] = await Promise.all([
      Booking.countDocuments({ ...dateFilter, status: { $in: BOOKING_STATUS_GROUPS.pending } }),
      Booking.countDocuments({ ...dateFilter, status: { $in: BOOKING_STATUS_GROUPS.confirmed } }),
      Booking.countDocuments({ ...dateFilter, status: { $in: BOOKING_STATUS_GROUPS.in_progress } }),
      Booking.countDocuments({ ...dateFilter, status: { $in: BOOKING_STATUS_GROUPS.completed } }),
      Booking.countDocuments({ ...dateFilter, status: { $in: BOOKING_STATUS_GROUPS.cancelled } })
    ]);

    // Revenue stats: sum finalAmount or fallback to basePrice
    const validPaymentStatuses = [
      PAYMENT_STATUS.SUCCESS,
      PAYMENT_STATUS.COLLECTED_BY_VENDOR,
      'success',
      'collected_by_vendor',
      'collected_by_worker',
      'paid',
      'PAID'
    ];

    const revenueResult = await Booking.aggregate([
      {
        $match: {
          $or: [
            { status: { $in: BOOKING_STATUS_GROUPS.completed } },
            { paymentStatus: { $in: validPaymentStatuses } }
          ],
          ...revenueDateMatch
        }
      },
      {
        $group: {
          _id: null,
          totalRevenue: {
            $sum: {
              $ifNull: ['$finalAmount', { $ifNull: ['$basePrice', 0] }]
            }
          },
          totalBookings: { $sum: 1 }
        }
      }
    ]);

    const revenue = revenueResult[0] || { totalRevenue: 0, totalBookings: 0 };
    const platformCommission = revenue.totalRevenue * 0.2; // 20% commission

    // Vendor approval stats
    const pendingVendors = await Vendor.countDocuments({ approvalStatus: VENDOR_STATUS.PENDING, ...dateFilter });
    const approvedVendors = await Vendor.countDocuments({ approvalStatus: VENDOR_STATUS.APPROVED, ...dateFilter });

    // Withdrawal & Settlement stats
    const pendingWithdrawals = await Withdrawal.countDocuments({
      status: { $in: ['pending', 'awaiting_manual_transfer', 'processing'] },
      ...dateFilter
    }).catch(() => 0);
    const pendingSettlementsCount = await Settlement.countDocuments({ status: 'pending', ...dateFilter }).catch(() => 0);
    const pendingScraps = await Scrap.countDocuments({ status: 'pending', ...dateFilter }).catch(() => 0);
    const pendingWorkers = await Worker.countDocuments({ approvalStatus: 'pending', ...dateFilter }).catch(() => 0);
    const pendingEngineers = await Engineer.countDocuments({ approvalStatus: 'pending', ...dateFilter }).catch(() => 0);
    const pendingB2B = await B2BCompany.countDocuments({ verificationStatus: { $in: ['pending', 'verified'] }, deletedAt: null }).catch(() => 0);
    const openDisputes = await Dispute.countDocuments({ status: { $in: ['open', 'in_review', 'pending'] } }).catch(() => 0);

    // Recent activities (filtered by period)
    const recentActivityDocs = await Booking.find(dateFilter)
      .populate('userId', 'name phone')
      .populate('vendorId', 'name businessName')
      .populate('serviceId', 'title name')
      .sort({ createdAt: -1 })
      .limit(50);

    const recentBookings = recentActivityDocs.map(b => ({
      id: b.bookingNumber || b._id,
      _id: b._id,
      status: b.status,
      user: { name: b.userId?.name || 'Customer' },
      serviceType: b.serviceName || b.serviceId?.title || b.serviceId?.name || b.serviceCategory || 'Service',
      price: b.finalAmount || b.basePrice || 0,
      createdAt: b.createdAt,
      acceptedAt: b.acceptedAt,
      assignedAt: b.assignedAt,
      visitedAt: b.visitedAt,
      completedAt: b.completedAt,
      workerPaymentStatus: b.workerPaymentStatus
    }));

    res.status(200).json({
      success: true,
      data: {
        stats: {
          totalUsers,
          totalVendors,
          totalWorkers,
          totalBookings,
          pendingBookings,
          confirmedBookings,
          inProgressBookings,
          completedBookings,
          cancelledBookings,
          totalRevenue: revenue.totalRevenue,
          platformCommission,
          pendingVendors,
          approvedVendors,
          pendingWithdrawals,
          pendingSettlements: pendingSettlementsCount,
          pendingScraps,
          pendingWorkers,
          pendingEngineers,
          pendingB2B,
          openDisputes
        },
        recentBookings
      }
    });
  } catch (error) {
    console.error('Get dashboard stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard stats. Please try again.'
    });
  }
};

/**
 * Get revenue analytics
 */
const getRevenueAnalytics = async (req, res) => {
  try {
    const { period = 'monthly', startDate, endDate } = req.query;

    let groupFormat = '%Y-%m';
    if (period === 'daily') {
      groupFormat = '%Y-%m-%d';
    } else if (period === 'weekly') {
      groupFormat = '%Y-%W';
    }

    let revenueDateMatch = {};
    if (startDate || endDate) {
      const s = startDate ? new Date(startDate) : new Date(0);
      const e = endDate ? new Date(endDate) : new Date();
      e.setHours(23, 59, 59, 999);
      revenueDateMatch = {
        $or: [
          { completedAt: { $gte: s, $lte: e } },
          { $and: [{ completedAt: null }, { createdAt: { $gte: s, $lte: e } }] }
        ]
      };
    }

    const completedStatuses = [BOOKING_STATUS.COMPLETED, BOOKING_STATUS.CLOSED, 'completed', 'closed'];
    const validPaymentStatuses = [
      PAYMENT_STATUS.SUCCESS,
      PAYMENT_STATUS.COLLECTED_BY_VENDOR,
      'success',
      'collected_by_vendor',
      'collected_by_worker',
      'paid',
      'PAID'
    ];

    const revenueData = await Booking.aggregate([
      {
        $match: {
          $or: [
            { status: { $in: BOOKING_STATUS_GROUPS.completed } },
            { paymentStatus: { $in: validPaymentStatuses } }
          ],
          ...revenueDateMatch
        }
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: groupFormat,
              date: { $ifNull: ['$completedAt', '$createdAt'] }
            }
          },
          revenue: {
            $sum: {
              $ifNull: ['$finalAmount', { $ifNull: ['$basePrice', 0] }]
            }
          },
          bookings: { $sum: 1 },
          platformCommission: {
            $sum: {
              $multiply: [
                { $ifNull: ['$finalAmount', { $ifNull: ['$basePrice', 0] }] },
                0.2
              ]
            }
          }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    res.status(200).json({
      success: true,
      data: {
        period,
        revenueData
      }
    });
  } catch (error) {
    console.error('Get revenue analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch revenue analytics. Please try again.'
    });
  }
};

/**
 * Get booking trends
 */
const getBookingTrends = async (req, res) => {
  try {
    const { days = 30, startDate: qStartDate, endDate: qEndDate, period = 'daily' } = req.query;

    let startDate, endDate;
    if (qStartDate) {
      startDate = new Date(qStartDate);
    } else {
      startDate = new Date();
      startDate.setDate(startDate.getDate() - parseInt(days));
    }
    if (qEndDate) {
      endDate = new Date(qEndDate);
      endDate.setHours(23, 59, 59, 999);
    } else {
      endDate = new Date();
    }

    let groupFormat = '%Y-%m-%d';
    if (period === 'monthly') {
      groupFormat = '%Y-%m';
    }

    const completedStatuses = [BOOKING_STATUS.COMPLETED, BOOKING_STATUS.CLOSED, 'completed', 'closed'];
    const cancelledStatuses = [BOOKING_STATUS.CANCELLED, BOOKING_STATUS.REJECTED, 'cancelled', 'rejected'];

    const trends = await Booking.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: groupFormat,
              date: '$createdAt'
            }
          },
          count: { $sum: 1 },
          completed: {
            $sum: {
              $cond: [{ $in: ['$status', completedStatuses] }, 1, 0]
            }
          },
          cancelled: {
            $sum: {
              $cond: [{ $in: ['$status', cancelledStatuses] }, 1, 0]
            }
          },
          pending: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $not: [{ $in: ['$status', completedStatuses] }] },
                    { $not: [{ $in: ['$status', cancelledStatuses] }] }
                  ]
                },
                1,
                0
              ]
            }
          }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    res.status(200).json({
      success: true,
      data: {
        trends
      }
    });
  } catch (error) {
    console.error('Get booking trends error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch booking trends. Please try again.'
    });
  }
};

/**
 * Get user growth metrics
 */
const getUserGrowthMetrics = async (req, res) => {
  try {
    const { days = 30, startDate: qStartDate, endDate: qEndDate } = req.query;

    let startDate, endDate;
    if (qStartDate) {
      startDate = new Date(qStartDate);
    } else {
      startDate = new Date();
      startDate.setDate(startDate.getDate() - parseInt(days));
    }
    if (qEndDate) {
      endDate = new Date(qEndDate);
      endDate.setHours(23, 59, 59, 999);
    } else {
      endDate = new Date();
    }

    const userGrowth = await User.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$createdAt'
            }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    const vendorGrowth = await Vendor.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$createdAt'
            }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    const workerGrowth = await Worker.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$createdAt'
            }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    res.status(200).json({
      success: true,
      data: {
        userGrowth,
        vendorGrowth,
        workerGrowth
      }
    });
  } catch (error) {
    console.error('Get user growth metrics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user growth metrics. Please try again.'
    });
  }
};

module.exports = {
  getDashboardStats,
  getRevenueAnalytics,
  getBookingTrends,
  getUserGrowthMetrics
};


