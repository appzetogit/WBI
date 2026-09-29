const Engineer = require('../../models/Engineer');
const Transaction = require('../../models/Transaction');
const Booking = require('../../models/Booking');
const Withdrawal = require('../../models/Withdrawal');
const { holdBalance, releaseHold, resolvePayoutDestination, checkWithdrawalRules } = require('../../services/fieldWithdrawalGuard.service');
const {
  EARNING_TX_TYPES,
  buildEngineerPaymentSummary,
  statsForEngineerId,
  aggregateEngineerPaymentStats
} = require('../../utils/engineerPaymentHelpers');

/**
 * Get engineer wallet with ledger balance
 */
const getWallet = async (req, res) => {
  try {
    const engineerId = req.user.id;
    const engineer = await Engineer.findById(engineerId);

    if (!engineer) {
      return res.status(404).json({ success: false, message: 'Engineer not found' });
    }

    // List of bookings pending payment
    const pendingBookings = await Booking.find({
      engineerId: engineerId,
      status: 'completed', // Only completed jobs
      engineerPaymentStatus: 'PENDING'
    })
      .select('bookingNumber serviceName completedAt vendorId finalAmount vendorBillId')
      .sort({ completedAt: -1 });

    // Calculate Dynamic Wallet Balances (shared rules with admin payments)
    const maps = await aggregateEngineerPaymentStats([engineerId]);
    const stats = statsForEngineerId(maps, engineerId);
    const summary = buildEngineerPaymentSummary(engineer.toObject(), stats);

    engineer.wallet.totalEarnings = summary.totalEarned;
    engineer.wallet.withdrawnAmount = summary.withdrawnAmount;
    engineer.wallet.pendingBalance = summary.pendingWithdrawal;
    await engineer.save();

    res.status(200).json({
      success: true,
      data: {
        balance: summary.availableBalance,
        availableBalance: summary.availableBalance,
        totalBalance: summary.totalEarned,
        totalEarnings: summary.totalEarned,
        withdrawnAmount: summary.withdrawnAmount,
        pendingWithdrawal: summary.pendingWithdrawal,
        pendingBalance: summary.pendingWithdrawal,
        totalCredits: summary.totalCredits,
        totalDebits: summary.totalDebits,
        allocated: summary.allocated,
        reconciliationDelta: summary.reconciliationDelta,
        isReconciled: summary.isReconciled,
        pendingBookings: pendingBookings
      }
    });

  } catch (error) {
    console.error('Get wallet error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch wallet info' });
  }
};

/**
 * Get engineer transactions
 */
const getTransactions = async (req, res) => {
  try {
    const engineerId = req.user.id;
    const { page = 1, limit = 20, type } = req.query;

    const query = { $or: [{ engineerId }, { workerId: engineerId }] };

    // Filter by type if provided
    if (type && type !== 'all') {
      query.type = type;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [transactions, total] = await Promise.all([
      Transaction.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Transaction.countDocuments(query)
    ]);

    res.status(200).json({
      success: true,
      data: transactions,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (error) {
    console.error('Get transactions error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch transactions' });
  }
};

const { sendPushNotification } = require('../../services/firebaseAdmin');

/**
 * Request payout from vendor for a specific booking
 */
const requestPayout = async (req, res) => {
  try {
    const engineerId = req.user.id;
    const { bookingId } = req.body;
    const engineer = await Engineer.findById(engineerId);

    if (!bookingId) {
      return res.status(400).json({ success: false, message: 'Booking ID is required' });
    }

    const booking = await Booking.findOne({
      _id: bookingId,
      engineerId: engineerId,
      status: 'completed',
      engineerPaymentStatus: 'PENDING'
    }).populate('vendorId'); // Ensure vendor is populated to access tokens

    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found or already paid' });
    }

    if (!booking.vendorId) {
      return res.status(400).json({ success: false, message: 'No vendor associated with this booking' });
    }

    const vendor = booking.vendorId;
    const message = `Engineer ${engineer.name} has requested payment for Booking #${booking.bookingNumber}.`;
    const title = '💸 Payout Request';

    // Use createNotification helper for proper notification delivery
    const { createNotification } = require('../notificationControllers/notificationController');
    await createNotification({
      vendorId: vendor._id,
      type: 'payout_requested',
      title: title,
      message: message,
      relatedId: booking._id,
      relatedType: 'booking',
      priority: 'high',
      pushData: {
        type: 'payout_requested',
        bookingId: booking._id.toString(),
        link: `/vendor/booking/${booking._id}`
      }
    });

    res.status(200).json({ success: true, message: 'Payment request sent to vendor' });

  } catch (error) {
    console.error('Request payout error:', error);
    res.status(500).json({ success: false, message: 'Failed to send payout request' });
  }
};

/**
 * Get wallet summary for engineer
 */
const getWalletSummary = async (req, res) => {
  try {
    const engineerId = req.user.id;
    const engineer = await Engineer.findById(engineerId);

    if (!engineer) {
      return res.status(404).json({ success: false, message: 'Engineer not found' });
    }

    // Pending bookings sum
    const pendingBookings = await Booking.find({
      engineerId: engineerId,
      status: 'completed',
      engineerPaymentStatus: 'PENDING'
    });

    // In a real system, you'd calculate exact engineer commission from VendorBill.
    // Here we use finalAmount as a proxy if no explicit commission is set.
    const pendingPayouts = pendingBookings.reduce((sum, b) => sum + (b.finalAmount || 0), 0);

    // Total Monthly Earnings
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const monthlyTransactions = await Transaction.find({
      engineerId: engineerId,
      status: 'completed',
      type: { $in: ['engineer_payment', 'cash_collected', 'credit', 'commission'] },
      createdAt: { $gte: startOfMonth }
    });

    const totalMonthlyEarnings = monthlyTransactions.reduce((sum, t) => sum + t.amount, 0);

    res.status(200).json({
      success: true,
      data: {
        walletBalance: engineer.wallet?.balance || 0,
        pendingPayouts: pendingPayouts,
        totalMonthlyEarnings: totalMonthlyEarnings,
      }
    });

  } catch (error) {
    console.error('Get wallet summary error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch wallet summary' });
  }
};

const UPI_ID_REGEX = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z0-9._-]{2,64}$/;

const verifyUpi = async (req, res) => {
  try {
    const upiId = String(req.body?.upiId || '').trim().toLowerCase();
    if (!upiId) {
      return res.status(400).json({ success: false, message: 'UPI ID is required' });
    }
    if (!UPI_ID_REGEX.test(upiId)) {
      return res.status(400).json({ success: false, message: 'Invalid UPI ID format (e.g. name@ybl)' });
    }
    const engineerId = req.user.id || req.user._id;
    await Engineer.findByIdAndUpdate(engineerId, {
      $set: { 'bankDetails.upiId': upiId }
    }).catch(() => {});

    res.status(200).json({
      success: true,
      message: 'UPI ID validated',
      data: { upiId, verified: true }
    });
  } catch (error) {
    console.error('verifyUpi error:', error);
    res.status(500).json({ success: false, message: 'UPI verification failed' });
  }
};

/**
 * Request Withdrawal
 */
const requestWithdrawal = async (req, res) => {
  try {
    const engineerId = req.user.id;
    const { method, upiId } = req.body;
    const amount = Number(req.body.amount);
    
    const engineer = await Engineer.findById(engineerId);
    if (!engineer) return res.status(404).json({ success: false, message: 'Engineer not found' });

    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid withdrawal amount' });
    }

    const rules = await checkWithdrawalRules({ amount, ownerField: 'engineerId', ownerId: engineerId });
    if (!rules.ok) {
      return res.status(rules.status).json({ success: false, message: rules.message });
    }

    const destination = await resolvePayoutDestination({
      ownerId: engineerId,
      method,
      upiId,
      savedUpiId: engineer.bankDetails?.upiId
    });
    if (!destination.ok) {
      return res.status(destination.status).json({ success: false, message: destination.message });
    }

    // Atomic hold: concurrent requests cannot both spend the same balance
    const held = await holdBalance(Engineer, engineerId, amount);
    if (!held) {
      return res.status(400).json({ success: false, message: 'Insufficient balance' });
    }
    engineer.wallet = held.wallet;

    let withdrawal;
    try {
      withdrawal = await Withdrawal.create({
        engineerId,
        source: 'engineer',
        method: destination.method,
        amount,
        status: 'pending',
        bankDetails: destination.payoutDetails,
        requestDate: new Date(),
        timeline: [
          {
            status: 'pending',
            message: 'Withdrawal requested — balance held',
            actorType: 'system',
            at: new Date()
          }
        ]
      });
    } catch (createErr) {
      await releaseHold(Engineer, engineerId, amount);
      throw createErr;
    }

    const transaction = await Transaction.create({
      engineerId,
      type: 'withdrawal',
      amount: -amount,
      status: 'pending',
      description: 'Withdrawal Request',
      referenceId: withdrawal._id.toString(),
      balanceBefore: engineer.wallet.balance + amount,
      balanceAfter: engineer.wallet.balance
    });

    // Notify admins
    const { createNotification } = require('../notificationControllers/notificationController');
    const Admin = require('../../models/Admin');
    const admins = await Admin.find({ role: { $in: ['super_admin', 'admin'] }, isActive: { $ne: false } });
    
    for (const admin of admins) {
      await createNotification({
        userId: admin._id,
        userModel: 'Admin',
        type: 'engineer_withdrawal_request',
        title: '💸 Engineer Withdrawal',
        message: `${engineer.name} requested a withdrawal of ₹${amount}`,
        relatedId: withdrawal._id,
        relatedType: 'withdrawal',
        priority: 'high'
      });
    }

    res.status(200).json({ success: true, message: 'Withdrawal request submitted', data: withdrawal });

    try {
      const { notifyEngineer } = require('../../services/engineerNotify.service');
      await notifyEngineer(engineerId, {
        type: 'payout_requested',
        category: 'payments',
        title: 'Withdrawal submitted',
        message: `₹${Number(amount).toLocaleString('en-IN')} withdrawal is being processed`,
        relatedId: withdrawal._id,
        relatedType: 'withdrawal',
        data: { amount: String(amount) }
      });
    } catch (_) {}

    try {
      if (global.io) {
        global.io.to(`engineer:${engineerId}`).emit('wallet:updated', {
          availableBalance: engineer.wallet.balance,
          pendingWithdrawal: engineer.wallet.pendingBalance,
          message: `Withdrawal of ₹${amount} submitted — processing`
        });
      }
    } catch (_) {}
  } catch (error) {
    console.error('Request withdrawal error:', error);
    res.status(500).json({ success: false, message: 'Failed to request withdrawal' });
  }
};

module.exports = {
  getWallet,
  getTransactions,
  requestPayout,
  getWalletSummary,
  requestWithdrawal,
  verifyUpi
};
