const Booking = require('../../models/Booking');
const Engineer = require('../../models/Engineer');
const WorkerProject = require('../../models/WorkerProject');
const DigitalJob = require('../../models/DigitalJob');
const DigitalAssignment = require('../../models/DigitalAssignment');
const VendorOpsJob = require('../../models/VendorOpsJob');
const B2BJob = require('../../models/B2BJob');
const Transaction = require('../../models/Transaction');
const { BOOKING_STATUS } = require('../../utils/constants');

// A job document exists in one of these statuses while it's actively being
// worked (accepted through completion submission) — mirrors the real
// B2BJob status enum, which never uses a literal 'assigned' status.
const B2B_ACTIVE_STATUSES = ['accepted', 'travelling', 'arrived', 'in_progress', 'completion_submitted'];

/**
 * Get engineer dashboard statistics
 */
const getDashboardStats = async (req, res) => {
  const startTime = Date.now();
  console.log('[API_START] GET /api/engineers/dashboard/stats');
  try {
    const engineerId = req.user.id;
    const engineer = await Engineer.findById(engineerId).select('_id rating status wallet').lean();

    if (!engineer) {
      return res.status(404).json({ success: false, message: 'Engineer not found' });
    }

    const [
      hardwareEarningStats,
      digitalEarningStats,
      hardwareActiveJobsCount,
      digitalActiveJobsCount,
      hardwareActiveProjectsCount,
      digitalActiveProjectsCount,
      completedHardwareCount,
      completedDigitalCount,
      ratingStats,
      recentHardwareJobs,
      recentDigitalJobs,
      opsEarningStats,
      opsActiveCount,
      opsCompletedCount,
      recentOpsJobs,
      b2bEarningStats,
      b2bActiveCount,
      b2bCompletedCount,
      recentB2BJobs
    ] = await Promise.all([
      Booking.aggregate([
        { $match: { workerId: engineer._id, status: { $in: [BOOKING_STATUS.COMPLETED, BOOKING_STATUS.WORK_DONE] } } },
        { $group: { _id: null, total: { $sum: "$finalAmount" } } }
      ]),
      DigitalAssignment.aggregate([
        { $match: { engineerId: engineer._id, status: 'Completed' } },
        { $group: { _id: null, total: { $sum: "$earnings" } } }
      ]),
      Booking.countDocuments({
        workerId: engineer._id,
        status: { $in: [BOOKING_STATUS.ASSIGNED, BOOKING_STATUS.VISITED, BOOKING_STATUS.IN_PROGRESS, BOOKING_STATUS.CONFIRMED] }
      }),
      DigitalJob.countDocuments({
        assignedEngineer: engineer._id,
        status: { $in: ['Assigned', 'In Progress'] }
      }),
      WorkerProject.countDocuments({
        workerId: engineer._id,
        status: { $in: ['PENDING', 'IN_PROGRESS'] }
      }),
      DigitalAssignment.countDocuments({
        engineerId: engineer._id,
        status: 'Active'
      }),
      Booking.countDocuments({
        workerId: engineer._id,
        status: { $in: [BOOKING_STATUS.COMPLETED, BOOKING_STATUS.WORK_DONE] }
      }),
      DigitalJob.countDocuments({
        assignedEngineer: engineer._id,
        status: 'Completed'
      }),
      Booking.aggregate([
        { $match: { workerId: engineer._id, rating: { $exists: true, $ne: null } } },
        { $group: { _id: null, avgRating: { $avg: "$rating" } } }
      ]),
      Booking.find({ workerId: engineer._id })
        .sort({ createdAt: -1 })
        .limit(5)
        .populate('userId', 'name')
        .populate('serviceId', 'title categoryIcon')
        .lean(),
      DigitalJob.find({ assignedEngineer: engineer._id })
        .sort({ createdAt: -1 })
        .limit(5)
        .populate('vendorId', 'companyName')
        .lean(),
      VendorOpsJob.aggregate([
        { $match: { engineerId: engineer._id, payoutStatus: 'credited' } },
        { $group: { _id: null, total: { $sum: '$engineerPayout' } } }
      ]),
      VendorOpsJob.countDocuments({
        engineerId: engineer._id,
        status: { $in: ['pending_acceptance', 'accepted', 'en_route', 'on_site', 'in_progress'] }
      }),
      VendorOpsJob.countDocuments({
        engineerId: engineer._id,
        status: 'completed'
      }),
      VendorOpsJob.find({ engineerId: engineer._id })
        .sort({ updatedAt: -1 })
        .limit(5)
        .select('title clientName city budget status jobCode updatedAt createdAt projectId')
        .lean(),
      Transaction.aggregate([
        {
          $match: {
            engineerId: engineer._id,
            status: 'completed',
            type: 'earnings_credit',
            'metadata.source': 'b2b_escrow'
          }
        },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      B2BJob.countDocuments({
        assignedTo: engineer._id,
        status: { $in: B2B_ACTIVE_STATUSES }
      }),
      B2BJob.countDocuments({
        assignedTo: engineer._id,
        status: 'completed'
      }),
      // Both jobs already assigned to this engineer AND jobs merely offered
      // to them (notifiedEngineers, awaiting accept/reject) — a B2B/freelancer
      // job offer must show up here the same way a fresh booking or ops job
      // offer does, not only after acceptance.
      B2BJob.find({
        $or: [{ assignedTo: engineer._id }, { notifiedEngineers: engineer._id }]
      })
        .sort({ createdAt: -1 })
        .limit(5)
        .select('jobId customerName service city address charge preferredDate createdAt status assignedTo')
        .lean()
    ]);

    const hardwareEarnings = hardwareEarningStats.length > 0 ? hardwareEarningStats[0].total : 0;
    const digitalEarnings = digitalEarningStats.length > 0 ? digitalEarningStats[0].total : 0;
    const opsEarnings = opsEarningStats.length > 0 ? opsEarningStats[0].total : 0;
    const walletOpsCredits = await Transaction.aggregate([
      {
        $match: {
          engineerId: engineer._id,
          status: 'completed',
          type: 'earnings_credit',
          'metadata.source': 'vendor_ops'
        }
      },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const opsTxnEarnings = walletOpsCredits.length ? walletOpsCredits[0].total : 0;
    const b2bEarnings = b2bEarningStats.length ? b2bEarningStats[0].total : 0;
    const totalEarnings = hardwareEarnings + digitalEarnings + Math.max(opsEarnings, opsTxnEarnings) + b2bEarnings;
    const activeJobsCount = hardwareActiveJobsCount + digitalActiveJobsCount + opsActiveCount + b2bActiveCount;
    const activeProjectsCount = hardwareActiveProjectsCount + digitalActiveProjectsCount;
    const completedJobsCount = completedHardwareCount + completedDigitalCount + opsCompletedCount + b2bCompletedCount;
    const averageRating = ratingStats.length > 0 ? parseFloat(ratingStats[0].avgRating.toFixed(1)) : (engineer.rating || 0);

    const allRecentJobs = [
      ...recentHardwareJobs,
      ...recentDigitalJobs.map(job => ({
        _id: job._id,
        serviceCategory: job.serviceType,
        serviceId: { name: job.title },
        address: { city: job.clientName },
        basePrice: job.budget?.min || 0,
        finalAmount: job.budget?.max || 0,
        scheduledDate: job.createdAt,
        status: job.status === 'Assigned' && job.assignmentStatus === 'Pending' ? 'NEW' : job.status,
        isDigital: true,
        createdAt: job.createdAt
      })),
      ...recentOpsJobs.map((job) => ({
        _id: job._id,
        serviceId: { name: job.title, title: job.title },
        userId: { name: job.clientName || 'Vendor client' },
        address: { city: job.city },
        finalAmount: job.budget || 0,
        basePrice: job.budget || 0,
        scheduledDate: job.updatedAt || job.createdAt,
        createdAt: job.createdAt,
        status: job.status,
        isOpsJob: true,
        jobCode: job.jobCode
      })),
      ...recentB2BJobs.map((job) => {
        // Not yet assigned to this engineer = a live offer awaiting their
        // accept/reject, same "NEW" treatment DigitalJob offers get above.
        const isOffer = !job.assignedTo || String(job.assignedTo) !== String(engineer._id);
        return {
          _id: job._id,
          serviceId: { name: job.service, title: job.service },
          userId: { name: job.customerName || 'B2B Customer' },
          address: { city: job.city || job.address },
          finalAmount: job.charge || 0,
          basePrice: job.charge || 0,
          scheduledDate: job.preferredDate || job.createdAt,
          createdAt: job.createdAt,
          status: isOffer ? 'NEW' : job.status,
          isB2BJob: true,
          jobCode: job.jobId
        };
      })
    ].sort((a, b) => new Date(b.createdAt || b.scheduledDate) - new Date(a.createdAt || a.scheduledDate)).slice(0, 8);

    const timeTaken = Date.now() - startTime;
    console.log(`[API_SUCCESS] GET /api/engineers/dashboard/stats - ${timeTaken}ms`);

    res.status(200).json({
      success: true,
      data: {
        totalEarnings,
        walletBalance: engineer.wallet?.balance || 0,
        activeJobs: activeJobsCount,
        activeProjects: activeProjectsCount,
        completedJobs: completedJobsCount,
        rating: averageRating,
        recentJobs: allRecentJobs
      }
    });

  } catch (error) {
    console.error(`[API_ERROR] GET /api/engineers/dashboard/stats - ${Date.now() - startTime}ms :`, error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard statistics'
    });
  }
};

module.exports = {
  getDashboardStats
};
