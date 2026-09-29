const Worker = require('../../models/Worker');
const Booking = require('../../models/Booking');
const { validationResult } = require('express-validator');
const { WORKER_STATUS, BOOKING_STATUS, VENDOR_STATUS } = require('../../utils/constants');
const { createNotification } = require('../notificationControllers/notificationController');

/**
 * Get all workers with filters and pagination
 */
const getAllWorkers = async (req, res) => {
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
    // Availability filter: online / offline / busy (status is set by the app socket)
    if (req.query.availability) {
      const a = String(req.query.availability).toUpperCase();
      query.status = a === 'OFFLINE' ? { $in: ['OFFLINE', 'offline', null] } : a;
    }

    // Search by name, email, phone
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { serviceCategory: { $regex: search, $options: 'i' } }
      ];
    }

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get workers
    const workers = await Worker.find(query)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count
    const total = await Worker.countDocuments(query);

    res.status(200).json({
      success: true,
      data: workers,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get all workers error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch workers. Please try again.'
    });
  }
};

/**
 * Get worker details
 */
const getWorkerDetails = async (req, res) => {
  try {
    const { id } = req.params;

    const worker = await Worker.findById(id).select('-password');

    if (!worker) {
      return res.status(404).json({
        success: false,
        message: 'Worker not found'
      });
    }

    // Get worker booking stats
    const jobStats = await Booking.aggregate([
      {
        $match: { workerId: worker._id }
      },
      {
        $group: {
          _id: null,
          totalJobs: { $sum: 1 },
          completedJobs: {
            $sum: {
              $cond: [{ $eq: ['$status', BOOKING_STATUS.COMPLETED] }, 1, 0]
            }
          },
          // Assuming workers might get paid or we just track job value
          totalJobValue: {
            $sum: '$finalAmount'
          }
        }
      }
    ]);

    res.status(200).json({
      success: true,
      data: {
        worker,
        stats: jobStats[0] || {
          totalJobs: 0,
          completedJobs: 0,
          totalJobValue: 0
        }
      }
    });
  } catch (error) {
    console.error('Get worker details error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch worker details. Please try again.'
    });
  }
};

/**
 * Approve worker registration
 */
const approveWorker = async (req, res) => {
  try {
    const { id } = req.params;

    const worker = await Worker.findById(id);

    if (!worker) {
      return res.status(404).json({
        success: false,
        message: 'Worker not found'
      });
    }

    worker.approvalStatus = 'approved';
    worker.isActive = true;
    await worker.save();

    // Send notification to worker
    /*
    // Note: Assuming notification system supports 'worker' type or we treat them as users for now
    await createNotification({
      userId: worker._id, // Use userId for workers too? or need separate workerId field in notification
      type: 'worker_approved',
      title: 'Worker Registration Approved',
      message: 'Your worker registration has been approved.',
      relatedId: worker._id,
      relatedType: 'worker'
    });
    */

    res.status(200).json({
      success: true,
      message: 'Worker approved successfully',
      data: worker
    });
  } catch (error) {
    console.error('Approve worker error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to approve worker. Please try again.'
    });
  }
};

/**
 * Reject worker registration
 */
const rejectWorker = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const worker = await Worker.findById(id);

    if (!worker) {
      return res.status(404).json({
        success: false,
        message: 'Worker not found'
      });
    }

    worker.approvalStatus = 'rejected';
    worker.isActive = false;
    // worker.rejectedReason = reason; // If we want to store reason
    await worker.save();

    res.status(200).json({
      success: true,
      message: 'Worker rejected successfully',
      data: worker
    });
  } catch (error) {
    console.error('Reject worker error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reject worker. Please try again.'
    });
  }
};

/**
 * Suspend worker
 */
const suspendWorker = async (req, res) => {
  try {
    const { id } = req.params;

    const worker = await Worker.findById(id);

    if (!worker) {
      return res.status(404).json({
        success: false,
        message: 'Worker not found'
      });
    }

    worker.approvalStatus = 'suspended';
    worker.isActive = false;
    await worker.save();

    res.status(200).json({
      success: true,
      message: 'Worker suspended successfully',
      data: worker
    });
  } catch (error) {
    console.error('Suspend worker error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to suspend worker. Please try again.'
    });
  }
};

/**
 * Get worker jobs
 */
const getWorkerJobs = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, page = 1, limit = 20 } = req.query;

    const query = { workerId: id };
    if (status) {
      query.status = status;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const jobs = await Booking.find(query)
      .populate('userId', 'name phone')
      .populate('serviceId', 'title iconUrl')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Booking.countDocuments(query);

    res.status(200).json({
      success: true,
      data: jobs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get worker jobs error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch worker jobs.'
    });
  }
};

/**
 * Get worker earnings
 */
const getWorkerEarnings = async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid worker id' });
    }
    const workerId = new mongoose.Types.ObjectId(id);
    const worker = await Worker.findById(workerId).select('name wallet').lean();
    if (!worker) return res.status(404).json({ success: false, message: 'Worker not found' });

    const Transaction = require('../../models/Transaction');
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);

    const [byType, transactions, total, completedJobs] = await Promise.all([
      Transaction.aggregate([
        { $match: { workerId, status: 'completed' } },
        { $group: { _id: '$type', amount: { $sum: '$amount' }, count: { $sum: 1 } } }
      ]),
      Transaction.find({ workerId })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .select('type amount status paymentMethod description referenceId balanceBefore balanceAfter bookingId createdAt')
        .lean(),
      Transaction.countDocuments({ workerId }),
      Booking.countDocuments({ workerId, status: 'completed' })
    ]);

    const sum = (types) => byType.filter((r) => types.includes(r._id)).reduce((a, r) => a + r.amount, 0);
    res.status(200).json({
      success: true,
      data: {
        balance: worker.wallet?.balance || 0,
        totalEarnings: worker.wallet?.totalEarnings || sum(['earnings_credit', 'credit']),
        paidOut: sum(['worker_payment', 'withdrawal', 'settlement']),
        deductions: sum(['commission', 'platform_fee', 'penalty', 'tds_deduction', 'debit']),
        completedJobs,
        byType: byType.map((r) => ({ type: r._id, amount: r.amount, count: r.count })),
        transactions
      },
      pagination: { page, limit, total, pages: Math.ceil(total / limit) }
    });
  } catch (error) {
    console.error('Get worker earnings error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch worker earnings.' });
  }
};

/**
 * Pay worker manually
 */
const payWorker = async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, reference, notes } = req.body;

    if (!amount || isNaN(amount) || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid amount'
      });
    }

    const amt = Math.round(parseFloat(amount) * 100) / 100;
    const mongoose = require('mongoose');
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid worker id' });
    }

    // Atomic credit, then a ledger row carrying the balances either side, so
    // every rupee in a worker's wallet is explained by a transaction.
    const before = await Worker.findOneAndUpdate(
      { _id: id },
      { $inc: { 'wallet.balance': amt } },
      { new: false }
    ).select('name wallet');
    if (!before) {
      return res.status(404).json({
        success: false,
        message: 'Worker not found'
      });
    }
    const balanceBefore = before.wallet?.balance || 0;
    const balanceAfter = Math.round((balanceBefore + amt) * 100) / 100;

    const Transaction = require('../../models/Transaction');
    const txn = await Transaction.create({
      workerId: before._id,
      type: 'worker_payment',
      amount: amt,
      status: 'completed',
      paymentMethod: 'bank_transfer',
      description: notes ? String(notes).slice(0, 500) : 'Manual payment recorded by admin',
      referenceId: reference ? String(reference).slice(0, 120) : null,
      balanceBefore,
      balanceAfter,
      metadata: { recordedBy: req.user?._id || req.user?.id || null, source: 'admin_manual' }
    });

    const { logAudit } = require('../../utils/auditLogger');
    await logAudit({
      actionType: 'ADMIN_WORKER_PAYMENT',
      actorId: req.user?._id || req.user?.id || null,
      actorRole: 'admin',
      targetType: 'Worker',
      targetId: before._id,
      oldValue: { balance: balanceBefore },
      newValue: { balance: balanceAfter, amount: amt, transactionId: txn._id, reference: reference || null },
      reason: notes || '',
      req
    });

    res.status(200).json({
      success: true,
      message: `Successfully recorded payment of ₹${amt} to ${before.name}`,
      data: {
        balance: balanceAfter,
        transactionId: txn._id
      }
    });
  } catch (error) {
    console.error('Pay worker error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process payment. Please try again.'
    });
  }
};

/**
 * Get all worker jobs (global)
 */
const getAllWorkerJobs = async (req, res) => {
  try {
    const { status, page = 1, limit = 20, search } = req.query;

    const query = { workerId: { $exists: true, $ne: null } };
    if (status) {
      query.status = status;
    }

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // If search is provided, we need to find workers by name first
    if (search) {
      const workers = await Worker.find({
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { phone: { $regex: search, $options: 'i' } }
        ]
      }).select('_id');

      const workerIds = workers.map(w => w._id);
      query.workerId = { $in: workerIds };
    }

    const jobs = await Booking.find(query)
      .populate('workerId', 'name phone profileImage')
      .populate('userId', 'name phone')
      .populate('serviceId', 'title iconUrl')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Booking.countDocuments(query);

    res.status(200).json({
      success: true,
      data: jobs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get all worker jobs error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch all worker jobs.'
    });
  }
};

/**
 * Get worker payments summary
 */
const getWorkerPaymentsSummary = async (req, res) => {
  try {
    // For now, return workers with non-zero balances or recent job activity
    const workers = await Worker.find({
      'wallet.balance': { $exists: true }
    })
      .select('name phone wallet email serviceCategory approvalStatus')
      .sort({ 'wallet.balance': -1 });

    res.status(200).json({
      success: true,
      data: workers
    });
  } catch (error) {
    console.error('Get worker payments summary error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch worker payments summary.'
    });
  }
};

/**
 * Toggle worker active status
 */
const toggleWorkerStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body; // Expecting { isActive: true/false }

    const worker = await Worker.findById(id);

    if (!worker) {
      return res.status(404).json({
        success: false,
        message: 'Worker not found'
      });
    }

    worker.isActive = isActive;
    await worker.save();

    res.status(200).json({
      success: true,
      message: `Worker ${isActive ? 'activated' : 'deactivated'} successfully`,
      data: worker
    });
  } catch (error) {
    console.error('Toggle worker status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update worker status'
    });
  }
};

/**
 * Delete worker details
 */
const deleteWorker = async (req, res) => {
  try {
    const { id } = req.params;

    const worker = await Worker.findByIdAndDelete(id);

    if (!worker) {
      return res.status(404).json({
        success: false,
        message: 'Worker not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Worker deleted successfully'
    });
  } catch (error) {
    console.error('Delete worker error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete worker'
    });
  }
};

module.exports = {
  getAllWorkers,
  getWorkerDetails,
  approveWorker,
  rejectWorker,
  suspendWorker,
  getWorkerJobs,
  getWorkerEarnings,
  payWorker,
  getAllWorkerJobs,
  getWorkerPaymentsSummary,
  toggleWorkerStatus,
  deleteWorker
};
