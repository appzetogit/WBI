const mongoose = require('mongoose');
const VendorFinanceWallet = require('../../models/VendorFinanceWallet');
const VendorFinanceTransaction = require('../../models/VendorFinanceTransaction');
const VendorFinanceReceivable = require('../../models/VendorFinanceReceivable');
const VendorFinanceDocument = require('../../models/VendorFinanceDocument');
const VendorFinanceMilestone = require('../../models/VendorFinanceMilestone');
const Vendor = require('../../models/Vendor');
const ServiceRequest = require('../../models/ServiceRequest');
const B2BJob = require('../../models/B2BJob');
const Booking = require('../../models/Booking');
const VendorOpsJob = require('../../models/VendorOpsJob');
const Engineer = require('../../models/Engineer');
const Settlement = require('../../models/Settlement');
const Withdrawal = require('../../models/Withdrawal');
const Transaction = require('../../models/Transaction');
const Settings = require('../../models/Settings');
const { postVendorFinanceLedger } = require('../../services/vendorFinanceLedger.service');

const vendorId = (req) => new mongoose.Types.ObjectId(req.user._id || req.user.id);
const escapeRegex = (value) => new RegExp(String(value).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
const paging = (req) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 12));
  return { page, limit, skip: (page - 1) * limit };
};
const pagination = (page, limit, total) => ({ page, limit, total, pages: Math.ceil(total / limit) || 1 });

const categoryFilter = async (filter, vid, category) => {
  if (category) {
    filter.serviceCategoryCode = String(category).toUpperCase();
    return;
  }
  const vendor = await Vendor.findById(vid).select('approvedServices').lean();
  const codes = (vendor?.approvedServices || [])
    .filter((service) => service.status !== 'suspended')
    .map((service) => service.categoryCode)
    .filter(Boolean);
  if (codes.length) filter.serviceCategoryCode = { $in: codes };
};

const getCounts = async (req, res) => {
  try {
    const vid = vendorId(req);
    const withdrawSvc = require('../../services/vendorWithdrawal.service');
    const wallet = await VendorFinanceWallet.findOne({ vendorId: vid }).lean();
    const srEscrow = await withdrawSvc.getEscrowHeldFromServiceRequests(vid);

    // Dynamic counts across B2B, User Jobs, Engineer Payments & Settlements
    const [b2bCount, userCount, engineers, settlementsPending] = await Promise.all([
      B2BJob.countDocuments({ assignedVendorId: vid }),
      ServiceRequest.countDocuments({ assignedVendorId: vid }),
      Engineer.find({ vendorId: vid }).select('_id').lean(),
      Settlement.countDocuments({ vendorId: vid, status: 'pending' })
    ]);

    const financeEscrow = wallet?.escrowBalance || 0;
    res.json({
      success: true,
      data: {
        availableBalance: wallet?.availableBalance || 0,
        escrowBalance: financeEscrow + (srEscrow.amount || 0),
        pendingSettlement: wallet?.pendingSettlement || 0,
        totalEarnings: wallet?.totalEarnings || 0,
        totalWithdrawn: wallet?.totalWithdrawn || 0,
        b2bJobsCount: b2bCount,
        userJobsCount: userCount,
        totalEngineers: engineers.length,
        settlementsPending
      }
    });
  } catch (error) {
    console.error('finance getCounts:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch finance counts' });
  }
};

/**
 * GET /vendor/finance/earnings-by-service
 * One row per registered/approved service with earnings + pending + escrow held.
 */
const getEarningsByService = async (req, res) => {
  try {
    const vid = vendorId(req);
    const vendor = await Vendor.findById(vid).select('approvedServices').lean();
    const services = (vendor?.approvedServices || []).filter((s) => s.status !== 'suspended');

    const [txnAgg, recvAgg, escrowHeld] = await Promise.all([
      VendorFinanceTransaction.aggregate([
        {
          $match: {
            vendorId: vid,
            status: 'completed',
            type: { $in: ['credit', 'escrow_release', 'refund'] }
          }
        },
        {
          $group: {
            _id: { $ifNull: ['$serviceCategoryCode', ''] },
            totalEarnings: { $sum: '$amount' },
            creditCount: { $sum: 1 },
            lastPaidAt: { $max: '$occurredAt' }
          }
        }
      ]),
      VendorFinanceReceivable.aggregate([
        {
          $match: {
            vendorId: vid,
            status: { $in: ['pending', 'partial', 'overdue'] }
          }
        },
        {
          $group: {
            _id: { $ifNull: ['$serviceCategoryCode', ''] },
            pendingAmount: {
              $sum: { $subtract: ['$amount', { $ifNull: ['$paidAmount', 0] }] }
            },
            pendingCount: { $sum: 1 }
          }
        }
      ]),
      ServiceRequest.aggregate([
        {
          $match: {
            assignedVendorId: vid,
            'payment.status': 'paid',
            'payment.escrowStatus': 'held'
          }
        },
        {
          $group: {
            _id: '$categoryCode',
            escrowHeld: { $sum: '$payment.amount' },
            heldCount: { $sum: 1 }
          }
        }
      ]).catch(() => [])
    ]);

    const txnMap = Object.fromEntries(txnAgg.map((r) => [String(r._id || '').toUpperCase(), r]));
    const recvMap = Object.fromEntries(recvAgg.map((r) => [String(r._id || '').toUpperCase(), r]));
    const escrowMap = Object.fromEntries(
      (escrowHeld || []).map((r) => [String(r._id || '').toUpperCase(), r])
    );

    const byService = services.map((svc) => {
      const code = String(svc.categoryCode || '').toUpperCase();
      const t = txnMap[code] || {};
      const r = recvMap[code] || {};
      const e = escrowMap[code] || {};
      return {
        categoryCode: code,
        categoryName: svc.categoryName || code,
        status: svc.status || 'pending',
        subServices: svc.subServices || [],
        totalEarnings: t.totalEarnings || 0,
        creditCount: t.creditCount || 0,
        lastPaidAt: t.lastPaidAt || null,
        pendingReceivables: Math.max(0, r.pendingAmount || 0),
        pendingCount: r.pendingCount || 0,
        escrowHeld: e.escrowHeld || 0,
        heldJobs: e.heldCount || 0
      };
    });

    const known = new Set(byService.map((s) => s.categoryCode));
    Object.keys(txnMap).forEach((code) => {
      if (!code || known.has(code)) return;
      const t = txnMap[code];
      byService.push({
        categoryCode: code || 'UNASSIGNED',
        categoryName: code || 'Unassigned / Other',
        status: 'other',
        subServices: [],
        totalEarnings: t.totalEarnings || 0,
        creditCount: t.creditCount || 0,
        lastPaidAt: t.lastPaidAt || null,
        pendingReceivables: Math.max(0, recvMap[code]?.pendingAmount || 0),
        pendingCount: recvMap[code]?.pendingCount || 0,
        escrowHeld: escrowMap[code]?.escrowHeld || 0,
        heldJobs: escrowMap[code]?.heldCount || 0
      });
    });

    const totals = byService.reduce(
      (acc, row) => {
        acc.totalEarnings += row.totalEarnings;
        acc.pendingReceivables += row.pendingReceivables;
        acc.escrowHeld += row.escrowHeld;
        return acc;
      },
      { totalEarnings: 0, pendingReceivables: 0, escrowHeld: 0 }
    );

    res.json({
      success: true,
      data: { byService, totals, serviceCount: byService.length }
    });
  } catch (error) {
    console.error('finance getEarningsByService:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch per-service earnings' });
  }
};

/**
 * GET /vendor/finance/earnings
 * Dynamic aggregation of User Jobs + B2B Jobs + Ops Jobs for the vendor
 * strictly enforcing that B2B wallet recharges are NEVER counted as Vendor earnings.
 */
const getEarningsOverview = async (req, res) => {
  try {
    const vid = vendorId(req);
    const { page, limit, skip } = paging(req);
    const { source, status, search } = req.query;

    // 1. Fetch B2B Jobs assigned to vendor
    const b2bJobs = await B2BJob.find({ assignedVendorId: vid })
      .select('jobId service subService customerName phone city charge status paymentStatus payoutStatus createdAt completedAt date')
      .sort({ createdAt: -1 })
      .lean();

    // 2. Fetch User Service Requests / Bookings assigned to vendor
    const userJobs = await ServiceRequest.find({ assignedVendorId: vid })
      .select('requestId serviceName categoryCode userName userPhone address payment status createdAt completedAt date')
      .sort({ createdAt: -1 })
      .lean();

    const bookings = await Booking.find({ vendorId: vid })
      .select('bookingNumber serviceName customerName totalAmount status paymentStatus createdAt completedAt')
      .sort({ createdAt: -1 })
      .lean();

    // 3. Fetch Vendor Ops Jobs
    const opsJobs = await VendorOpsJob.find({ vendorId: vid })
      .select('jobCode title clientName clientPhone city budget engineerPayout status payoutStatus createdAt completedAt')
      .sort({ createdAt: -1 })
      .lean();

    // Combine into unified earnings entries
    let allEarnings = [];

    b2bJobs.forEach((job) => {
      const gross = Number(job.charge) || 0;
      const platformFee = Math.round(gross * 0.1); // 10% platform fee
      const netEarning = gross - platformFee;
      const engineerPayout = Math.round(gross * 0.6); // 60% engineer share
      const isPaid = ['released', 'paid'].includes(job.paymentStatus) || ['completed', 'closed'].includes(job.status);
      const isPending = !isPaid && !['cancelled', 'rejected', 'failed'].includes(job.status);
      const earningStatus = isPaid ? 'paid' : (isPending ? 'pending' : 'cancelled');

      allEarnings.push({
        id: String(job._id),
        jobId: job.jobId || `B2B-${job._id.toString().slice(-6)}`,
        jobType: 'B2B Enterprise Job',
        title: job.service + (job.subService ? ` - ${job.subService}` : ''),
        clientName: job.customerName || 'B2B Client',
        clientPhone: job.phone || '',
        city: job.city || '',
        source: 'B2B_JOB',
        sourceLabel: 'B2B Job',
        grossAmount: gross,
        platformFee,
        applicableDeductions: platformFee,
        vendorEarning: netEarning,
        engineerPayable: engineerPayout,
        netVendorPayable: netEarning,
        status: earningStatus,
        jobStatus: job.status,
        date: job.completedAt || job.date || job.createdAt,
        verifiedDate: job.completedAt || null,
        settlementDate: isPaid ? (job.completedAt || job.updatedAt) : null,
        transactionCode: `TXN-B2B-${job._id.toString().slice(-6).toUpperCase()}`
      });
    });

    userJobs.forEach((job) => {
      const gross = Number(job.payment?.amount) || 0;
      const platformFee = Math.round(gross * 0.1);
      const netEarning = gross - platformFee;
      const engineerPayout = Math.round(gross * 0.6);
      const isPaid = job.payment?.status === 'paid' && job.payment?.escrowStatus !== 'held';
      const isPending = !isPaid && !['cancelled', 'rejected'].includes(job.status);
      const earningStatus = isPaid ? 'paid' : (isPending ? 'pending' : 'cancelled');

      allEarnings.push({
        id: String(job._id),
        jobId: job.requestId || `REQ-${job._id.toString().slice(-6)}`,
        jobType: 'User Service Request',
        title: job.serviceName || 'User Service',
        clientName: job.userName || 'Customer',
        clientPhone: job.userPhone || '',
        city: job.address?.city || '',
        source: 'USER_JOB',
        sourceLabel: 'User App Job',
        grossAmount: gross,
        platformFee,
        applicableDeductions: platformFee,
        vendorEarning: netEarning,
        engineerPayable: engineerPayout,
        netVendorPayable: netEarning,
        status: earningStatus,
        jobStatus: job.status,
        date: job.completedAt || job.createdAt,
        verifiedDate: job.completedAt || null,
        settlementDate: isPaid ? (job.completedAt || job.updatedAt) : null,
        transactionCode: `TXN-REQ-${job._id.toString().slice(-6).toUpperCase()}`
      });
    });

    bookings.forEach((job) => {
      if (allEarnings.some((e) => e.jobId === job.bookingNumber)) return;
      const gross = Number(job.totalAmount) || 0;
      const platformFee = Math.round(gross * 0.1);
      const netEarning = gross - platformFee;
      const engineerPayout = Math.round(gross * 0.6);
      const isPaid = job.paymentStatus === 'completed' || job.status === 'completed';
      const isPending = !isPaid && !['cancelled'].includes(job.status);
      const earningStatus = isPaid ? 'paid' : (isPending ? 'pending' : 'cancelled');

      allEarnings.push({
        id: String(job._id),
        jobId: job.bookingNumber || `BK-${job._id.toString().slice(-6)}`,
        jobType: 'Direct Consumer Booking',
        title: job.serviceName || 'Direct Booking',
        clientName: job.customerName || 'Customer',
        clientPhone: '',
        city: '',
        source: 'USER_JOB',
        sourceLabel: 'Direct Booking',
        grossAmount: gross,
        platformFee,
        applicableDeductions: platformFee,
        vendorEarning: netEarning,
        engineerPayable: engineerPayout,
        netVendorPayable: netEarning,
        status: earningStatus,
        jobStatus: job.status,
        date: job.completedAt || job.createdAt,
        verifiedDate: job.completedAt || null,
        settlementDate: isPaid ? (job.completedAt || job.updatedAt) : null,
        transactionCode: `TXN-BK-${job._id.toString().slice(-6).toUpperCase()}`
      });
    });

    opsJobs.forEach((job) => {
      if (allEarnings.some((e) => e.jobId === job.jobCode)) return;
      const gross = Number(job.budget) || 0;
      const platformFee = Math.round(gross * 0.1);
      const netEarning = gross - platformFee;
      const engineerPayout = Number(job.engineerPayout) || Math.round(gross * 0.6);
      const isPaid = job.payoutStatus === 'credited' || job.status === 'completed';
      const isPending = !isPaid && !['cancelled', 'rejected'].includes(job.status);
      const earningStatus = isPaid ? 'paid' : (isPending ? 'pending' : 'cancelled');

      allEarnings.push({
        id: String(job._id),
        jobId: job.jobCode || `JOB-${job._id.toString().slice(-6)}`,
        jobType: 'Field Project Operations',
        title: job.title || 'Field Work',
        clientName: job.clientName || 'Client',
        clientPhone: job.clientPhone || '',
        city: job.city || '',
        source: 'B2B_JOB',
        sourceLabel: 'Operations Job',
        grossAmount: gross,
        platformFee,
        applicableDeductions: platformFee,
        vendorEarning: netEarning,
        engineerPayable: engineerPayout,
        netVendorPayable: netEarning,
        status: earningStatus,
        jobStatus: job.status,
        date: job.completedAt || job.createdAt,
        verifiedDate: job.completedAt || null,
        settlementDate: isPaid ? (job.completedAt || job.updatedAt) : null,
        transactionCode: `TXN-OPS-${job._id.toString().slice(-6).toUpperCase()}`
      });
    });

    // Compute Summary Totals
    const summary = {
      totalEarnings: 0,
      pendingEarnings: 0,
      paidEarnings: 0,
      b2bEarnings: 0,
      userEarnings: 0,
      totalJobs: allEarnings.length,
      b2bJobCount: 0,
      userJobCount: 0
    };

    allEarnings.forEach((item) => {
      if (item.status === 'paid' || item.status === 'pending') {
        summary.totalEarnings += item.vendorEarning;
      }
      if (item.status === 'paid') {
        summary.paidEarnings += item.vendorEarning;
      } else if (item.status === 'pending') {
        summary.pendingEarnings += item.vendorEarning;
      }

      if (item.source === 'B2B_JOB') {
        summary.b2bEarnings += item.vendorEarning;
        summary.b2bJobCount += 1;
      } else {
        summary.userEarnings += item.vendorEarning;
        summary.userJobCount += 1;
      }
    });

    // Filter by source
    if (source && source !== 'ALL') {
      allEarnings = allEarnings.filter((e) => e.source === source);
    }
    // Filter by status
    if (status && status !== 'ALL') {
      allEarnings = allEarnings.filter((e) => e.status === status);
    }
    // Search
    if (search) {
      const term = String(search).toLowerCase().trim();
      allEarnings = allEarnings.filter(
        (e) =>
          e.jobId.toLowerCase().includes(term) ||
          e.title.toLowerCase().includes(term) ||
          e.clientName.toLowerCase().includes(term) ||
          e.city.toLowerCase().includes(term)
      );
    }

    // Sort descending by date
    allEarnings.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

    const total = allEarnings.length;
    const paginatedEarnings = allEarnings.slice(skip, skip + limit);

    res.json({
      success: true,
      data: {
        summary,
        earnings: paginatedEarnings
      },
      pagination: pagination(page, limit, total)
    });
  } catch (error) {
    console.error('finance getEarningsOverview:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch earnings overview' });
  }
};

/**
 * GET /vendor/finance/engineer-payments
 * View per-engineer payable summaries and itemized payout records
 */
const getEngineerPayments = async (req, res) => {
  try {
    const vid = vendorId(req);
    const { page, limit, skip } = paging(req);
    const { status, engineerId: filterEngId, search } = req.query;

    // 1. Find all engineers belonging to this vendor
    const engineers = await Engineer.find({
      $or: [{ vendorId: vid }, { 'vendorDetails.vendorId': vid }]
    }).select('name phone email avatar skills status wallet').lean();

    // 2. Fetch jobs assigned to these engineers or assigned to this vendor
    const [b2bJobs, opsJobs, userJobs] = await Promise.all([
      B2BJob.find({ assignedVendorId: vid, assignedTo: { $ne: null } })
        .populate('assignedTo', 'name phone email avatar')
        .select('jobId service subService charge assignedTo status payoutStatus completedAt createdAt')
        .lean(),
      VendorOpsJob.find({ vendorId: vid, engineerId: { $ne: null } })
        .populate('engineerId', 'name phone email avatar')
        .select('jobCode title budget engineerPayout engineerId status payoutStatus completedAt createdAt')
        .lean(),
      ServiceRequest.find({ assignedVendorId: vid, assignedTo: { $ne: null } })
        .populate('assignedTo', 'name phone email avatar')
        .select('requestId serviceName payment assignedTo status createdAt completedAt')
        .lean()
    ]);

    // Build unified list of engineer payout records
    let itemizedPayments = [];

    b2bJobs.forEach((j) => {
      const eng = j.assignedTo;
      if (!eng) return;
      const charge = Number(j.charge) || 0;
      const payout = Math.round(charge * 0.7);
      const isPaid = j.payoutStatus === 'paid' || j.payoutStatus === 'released';
      itemizedPayments.push({
        id: String(j._id),
        jobId: j.jobId || `B2B-${j._id.toString().slice(-6)}`,
        jobType: 'B2B',
        service: j.service,
        engineerId: String(eng._id),
        engineerName: eng.name || 'Engineer',
        engineerPhone: eng.phone || '',
        engineerAvatar: eng.avatar || null,
        jobAmount: charge,
        engineerPayout: payout,
        payoutStatus: isPaid ? 'paid' : (['completed', 'closed'].includes(j.status) ? 'pending' : 'in_progress'),
        jobStatus: j.status,
        date: j.completedAt || j.createdAt
      });
    });

    opsJobs.forEach((j) => {
      const eng = j.engineerId;
      if (!eng) return;
      const payout = Number(j.engineerPayout) || Math.round((Number(j.budget) || 0) * 0.7);
      const isPaid = j.payoutStatus === 'credited';
      itemizedPayments.push({
        id: String(j._id),
        jobId: j.jobCode || `JOB-${j._id.toString().slice(-6)}`,
        jobType: 'Project / Field Job',
        service: j.title,
        engineerId: String(eng._id),
        engineerName: eng.name || 'Engineer',
        engineerPhone: eng.phone || '',
        engineerAvatar: eng.avatar || null,
        jobAmount: Number(j.budget) || 0,
        engineerPayout: payout,
        payoutStatus: isPaid ? 'paid' : (j.status === 'completed' ? 'pending' : 'in_progress'),
        jobStatus: j.status,
        date: j.completedAt || j.createdAt
      });
    });

    userJobs.forEach((j) => {
      const eng = j.assignedTo;
      if (!eng) return;
      const amount = Number(j.payment?.amount) || 0;
      const payout = Math.round(amount * 0.7);
      const isPaid = j.status === 'completed';
      itemizedPayments.push({
        id: String(j._id),
        jobId: j.requestId || `REQ-${j._id.toString().slice(-6)}`,
        jobType: 'User Job',
        service: j.serviceName,
        engineerId: String(eng._id),
        engineerName: eng.name || 'Engineer',
        engineerPhone: eng.phone || '',
        engineerAvatar: eng.avatar || null,
        jobAmount: amount,
        engineerPayout: payout,
        payoutStatus: isPaid ? 'paid' : (['in_progress', 'assigned'].includes(j.status) ? 'in_progress' : 'pending'),
        jobStatus: j.status,
        date: j.completedAt || j.createdAt
      });
    });

    // Group by Engineer
    const engineerMap = new Map();

    engineers.forEach((eng) => {
      engineerMap.set(String(eng._id), {
        engineerId: String(eng._id),
        name: eng.name,
        phone: eng.phone,
        email: eng.email,
        avatar: eng.avatar,
        status: eng.status || 'active',
        totalJobs: 0,
        completedJobs: 0,
        totalPayable: 0,
        totalPaid: 0,
        totalPending: 0
      });
    });

    itemizedPayments.forEach((p) => {
      if (!engineerMap.has(p.engineerId)) {
        engineerMap.set(p.engineerId, {
          engineerId: p.engineerId,
          name: p.engineerName,
          phone: p.engineerPhone,
          email: '',
          avatar: p.engineerAvatar,
          status: 'active',
          totalJobs: 0,
          completedJobs: 0,
          totalPayable: 0,
          totalPaid: 0,
          totalPending: 0
        });
      }
      const engData = engineerMap.get(p.engineerId);
      engData.totalJobs += 1;
      if (['completed', 'closed'].includes(p.jobStatus)) {
        engData.completedJobs += 1;
      }
      engData.totalPayable += p.engineerPayout;
      if (p.payoutStatus === 'paid') {
        engData.totalPaid += p.engineerPayout;
      } else if (p.payoutStatus === 'pending') {
        engData.totalPending += p.engineerPayout;
      }
    });

    const engineerSummaries = Array.from(engineerMap.values());

    const overallSummary = {
      totalPayable: engineerSummaries.reduce((s, e) => s + e.totalPayable, 0),
      totalPaid: engineerSummaries.reduce((s, e) => s + e.totalPaid, 0),
      totalPending: engineerSummaries.reduce((s, e) => s + e.totalPending, 0),
      totalEngineers: engineerSummaries.length
    };

    // Filter itemized list
    let filteredItems = [...itemizedPayments];
    if (filterEngId && filterEngId !== 'ALL') {
      filteredItems = filteredItems.filter((i) => i.engineerId === filterEngId);
    }
    if (status && status !== 'ALL') {
      filteredItems = filteredItems.filter((i) => i.payoutStatus === status);
    }
    if (search) {
      const term = String(search).toLowerCase().trim();
      filteredItems = filteredItems.filter(
        (i) =>
          i.jobId.toLowerCase().includes(term) ||
          i.engineerName.toLowerCase().includes(term) ||
          i.service?.toLowerCase().includes(term)
      );
    }

    filteredItems.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

    const total = filteredItems.length;
    const paginatedItems = filteredItems.slice(skip, skip + limit);

    res.json({
      success: true,
      data: {
        summary: overallSummary,
        engineers: engineerSummaries,
        payments: paginatedItems
      },
      pagination: pagination(page, limit, total)
    });
  } catch (error) {
    console.error('finance getEngineerPayments:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch engineer payments' });
  }
};

/**
 * POST /vendor/finance/engineer-payments/pay
 * Vendor records / initiates payout to engineer
 */
const recordEngineerPayment = async (req, res) => {
  try {
    const vid = vendorId(req);
    const { engineerId: engId, jobIds, amount, paymentMethod, transactionReference, notes } = req.body;

    if (!engId) {
      return res.status(400).json({ success: false, message: 'Engineer ID is required' });
    }
    const payAmount = Number(amount);
    if (!payAmount || payAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Valid payment amount is required' });
    }

    const engineer = await Engineer.findById(engId);
    if (!engineer) {
      return res.status(404).json({ success: false, message: 'Engineer not found' });
    }

    const refCode = transactionReference || `ENG-PAY-${Date.now()}`;

    // Duplicate protection / Idempotency check
    const existingTxn = await Transaction.findOne({
      vendorId: vid,
      engineerId: engineer._id,
      $or: [
        { referenceId: refCode },
        { 'metadata.refCode': refCode }
      ]
    });
    if (existingTxn) {
      return res.status(400).json({
        success: false,
        message: `Payment with reference ${refCode} has already been processed.`
      });
    }

    // Update job payout statuses if specific jobs provided
    if (Array.isArray(jobIds) && jobIds.length > 0) {
      await Promise.all([
        B2BJob.updateMany(
          { _id: { $in: jobIds }, assignedVendorId: vid },
          { $set: { payoutStatus: 'paid' } }
        ),
        VendorOpsJob.updateMany(
          { _id: { $in: jobIds }, vendorId: vid },
          { $set: { payoutStatus: 'credited', payoutAt: new Date() } }
        )
      ]);
    }

    // 1. Credit Engineer Wallet & Create Engineer Transaction
    if (!engineer.wallet) {
      engineer.wallet = { balance: 0, totalEarnings: 0, withdrawnAmount: 0, pendingBalance: 0 };
    }
    const engBalanceBefore = Number(engineer.wallet.balance) || 0;
    engineer.wallet.balance = engBalanceBefore + payAmount;
    engineer.wallet.totalEarnings = (Number(engineer.wallet.totalEarnings) || 0) + payAmount;
    await engineer.save();

    await Transaction.create({
      engineerId: engineer._id,
      vendorId: vid,
      type: 'earnings_credit',
      amount: payAmount,
      status: 'completed',
      paymentMethod: paymentMethod || 'wallet',
      referenceId: refCode,
      description: `Payment from Vendor: ₹${payAmount}. Ref: ${refCode}. Notes: ${notes || 'Direct Payout'}`,
      balanceBefore: engBalanceBefore,
      balanceAfter: engineer.wallet.balance,
      metadata: {
        jobIds,
        refCode,
        source: 'vendor_engineer_payment'
      }
    });

    // 2. Debit Vendor Finance Wallet & Record Double-Entry Ledger Transaction
    await postVendorFinanceLedger({
      vendorId: vid,
      type: 'debit',
      amount: payAmount,
      description: `Engineer payout to ${engineer.name}. Ref: ${refCode}`,
      referenceCode: refCode,
      source: 'engineer_payment'
    });

    // 3. Create persistent Notification records
    try {
      const Notification = require('../../models/Notification');
      await Promise.all([
        Notification.create({
          workerId: engineer._id,
          type: 'PAYOUT_PROCESSED',
          title: 'Payout Received from Vendor',
          message: `₹${payAmount.toLocaleString('en-IN')} has been credited to your wallet by Vendor. Ref: ${refCode}`,
          data: { amount: payAmount, refCode, vendorId: vid }
        }),
        Notification.create({
          vendorId: vid,
          type: 'PAYOUT_PROCESSED',
          title: 'Engineer Payout Processed',
          message: `Successfully transferred ₹${payAmount.toLocaleString('en-IN')} to ${engineer.name}. Ref: ${refCode}`,
          data: { amount: payAmount, engineerId: engineer._id, refCode }
        })
      ]);
    } catch (_) {}

    // Real-time notification if socket available
    try {
      if (global.io) {
        global.io.to(`engineer:${engineer._id}`).emit('wallet:credited', {
          amount: payAmount,
          balanceAfter: engineer.wallet.balance,
          message: `₹${payAmount.toLocaleString('en-IN')} received from Vendor`
        });
      }
    } catch (_) {}

    res.status(200).json({
      success: true,
      message: `Successfully recorded payment of ₹${payAmount.toLocaleString('en-IN')} to ${engineer.name}`,
      data: {
        engineerId: engineer._id,
        engineerName: engineer.name,
        amount: payAmount,
        referenceCode: refCode
      }
    });
  } catch (error) {
    console.error('finance recordEngineerPayment:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to record engineer payment' });
  }
};

/**
 * GET /vendor/finance/settlements
 * Track settlements and payments from Admin to Vendor
 */
const getSettlements = async (req, res) => {
  try {
    const vid = vendorId(req);
    const { page, limit, skip } = paging(req);
    const { status, search } = req.query;

    const [settlements, withdrawals, wallet] = await Promise.all([
      Settlement.find({ vendorId: vid }).sort({ createdAt: -1 }).lean(),
      Withdrawal.find({ vendorId: vid }).sort({ createdAt: -1 }).lean(),
      VendorFinanceWallet.findOne({ vendorId: vid }).lean()
    ]);

    let combinedHistory = [];

    settlements.forEach((s) => {
      combinedHistory.push({
        id: String(s._id),
        type: 'Admin Settlement',
        referenceCode: s.paymentReference || `SET-${s._id.toString().slice(-6)}`,
        amount: Number(s.amount) || 0,
        paymentMethod: s.paymentMethod || 'bank_transfer',
        status: s.status, // pending, approved, completed, rejected
        adminNotes: s.adminNotes || '',
        paymentProof: s.paymentProof || null,
        processedAt: s.processedAt || null,
        createdAt: s.createdAt
      });
    });

    withdrawals.forEach((w) => {
      combinedHistory.push({
        id: String(w._id),
        type: 'Withdrawal Payout',
        referenceCode: w.transactionReference || `WDR-${w._id.toString().slice(-6)}`,
        amount: Number(w.netAmount || w.amount) || 0,
        grossAmount: Number(w.amount) || 0,
        tdsAmount: Number(w.tdsAmount) || 0,
        platformFee: Number(w.platformFeeAmount) || 0,
        paymentMethod: w.paymentMethod || 'bank_transfer',
        status: w.status, // pending, processing, approved, paid, failed, rejected
        adminNotes: w.adminNotes || '',
        bankDetails: w.bankDetails || null,
        processedAt: w.processedDate || w.paidAt || null,
        createdAt: w.createdAt
      });
    });

    // Summary calculation
    const totalEarned = Number(wallet?.totalEarnings) || 0;
    const pendingSettlement = Number(wallet?.pendingSettlement) || 0;
    const paidByAdmin = combinedHistory
      .filter((h) => ['approved', 'completed', 'paid'].includes(h.status))
      .reduce((s, h) => s + h.amount, 0);

    const summary = {
      totalPayable: totalEarned,
      pendingSettlement,
      paidByAdmin,
      availableBalance: Number(wallet?.availableBalance) || 0
    };

    // Filters
    if (status && status !== 'ALL') {
      combinedHistory = combinedHistory.filter((h) => h.status === status);
    }
    if (search) {
      const term = String(search).toLowerCase().trim();
      combinedHistory = combinedHistory.filter(
        (h) =>
          h.referenceCode.toLowerCase().includes(term) ||
          h.type.toLowerCase().includes(term) ||
          h.adminNotes.toLowerCase().includes(term)
      );
    }

    combinedHistory.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

    const total = combinedHistory.length;
    const paginated = combinedHistory.slice(skip, skip + limit);

    res.json({
      success: true,
      data: {
        summary,
        settlements: paginated
      },
      pagination: pagination(page, limit, total)
    });
  } catch (error) {
    console.error('finance getSettlements:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch settlements' });
  }
};

const getWallet = async (req, res) => {
  try {
    const vid = vendorId(req);
    const withdrawSvc = require('../../services/vendorWithdrawal.service');
    const wallet = await VendorFinanceWallet.findOneAndUpdate(
      { vendorId: vid },
      { $setOnInsert: { vendorId: vid } },
      { new: true, upsert: true }
    ).lean();
    const srEscrow = await withdrawSvc.getEscrowHeldFromServiceRequests(vid);
    const financeEscrow = Number(wallet?.escrowBalance) || 0;
    const enrichedWallet = {
      ...wallet,
      financeEscrowBalance: financeEscrow,
      serviceRequestEscrow: srEscrow.amount || 0,
      serviceRequestEscrowCount: srEscrow.count || 0,
      escrowBalance: financeEscrow + (srEscrow.amount || 0)
    };
    const { page, limit, skip } = paging(req);
    const filter = { vendorId: vid };
    if (req.query.type) filter.type = req.query.type;
    if (req.query.status) filter.status = req.query.status;
    if (req.query.category) filter.serviceCategoryCode = String(req.query.category).toUpperCase();
    if (req.query.search) {
      const term = escapeRegex(req.query.search);
      filter.$or = [
        { transactionCode: term },
        { description: term },
        { referenceCode: term },
        { projectCode: term },
        { serviceCategoryName: term },
        { serviceCategoryCode: term }
      ];
    }
    const [transactions, total] = await Promise.all([
      VendorFinanceTransaction.find(filter).sort({ occurredAt: -1 }).skip(skip).limit(limit).lean(),
      VendorFinanceTransaction.countDocuments(filter)
    ]);
    res.json({ success: true, data: { wallet: enrichedWallet, transactions }, pagination: pagination(page, limit, total) });
  } catch (error) {
    console.error('finance getWallet:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch wallet' });
  }
};

const getWithdrawEligibility = async (req, res) => {
  try {
    const data = await require('../../services/vendorWithdrawal.service').getWithdrawEligibility(vendorId(req));
    res.json({ success: true, data });
  } catch (error) {
    console.error('finance getWithdrawEligibility:', error);
    res.status(error.status || 500).json({ success: false, message: error.message || 'Failed to load eligibility' });
  }
};

const quoteWithdrawal = async (req, res) => {
  try {
    const config = await require('../../services/vendorPayoutConfig.service').getPayoutConfig();
    const fees = require('../../services/vendorPayoutConfig.service').calculatePayoutFees(req.body.amount || req.query.amount, config);
    res.json({ success: true, data: { fees, config: {
      minWithdrawalAmount: config.minWithdrawalAmount,
      maxWithdrawalAmount: config.maxWithdrawalAmount,
      settlementSchedule: config.settlementSchedule,
      payoutProvider: config.payoutProvider
    } } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Failed to quote fees' });
  }
};

const listBankAccounts = async (req, res) => {
  try {
    const banks = await require('../../services/vendorWithdrawal.service').listBanks(vendorId(req));
    res.json({ success: true, data: banks });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Failed to list banks' });
  }
};

const upsertBankAccount = async (req, res) => {
  try {
    const bank = await require('../../services/vendorWithdrawal.service').addOrUpdateBank(vendorId(req), req.body || {});
    res.status(201).json({ success: true, data: bank });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, message: error.message || 'Failed to save bank' });
  }
};

const verifyBankAccount = async (req, res) => {
  try {
    const bank = await require('../../services/vendorWithdrawal.service').verifyBankAccount(
      vendorId(req),
      req.params.bankId
    );
    res.json({ success: true, data: bank });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, message: error.message || 'Bank verification failed' });
  }
};

const sendWithdrawOtp = async (req, res) => {
  try {
    const data = await require('../../services/vendorWithdrawal.service').sendWithdrawalOtp(vendorId(req));
    res.json({ success: true, data });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, message: error.message || 'Failed to send OTP' });
  }
};

const requestWithdrawal = async (req, res) => {
  try {
    const vid = vendorId(req);
    const withdrawSvc = require('../../services/vendorWithdrawal.service');
    const result = await withdrawSvc.createWithdrawalRequest(vid, {
      amount: req.body.amount,
      bankAccountId: req.body.bankAccountId || req.body.bankId,
      method: req.body.method || 'bank',
      otp: req.body.otp,
      idempotencyKey: req.body.idempotencyKey || req.get('Idempotency-Key'),
      notes: req.body.notes || ''
    });
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    console.error('finance requestWithdrawal:', error);
    res.status(error.status || 500).json({
      success: false,
      message: error.message || 'Failed to request withdrawal'
    });
  }
};

const listWithdrawals = async (req, res) => {
  try {
    const data = await require('../../services/vendorWithdrawal.service').listVendorWithdrawals(vendorId(req), {
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 20,
      status: req.query.status
    });
    res.json({ success: true, ...data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Failed to list withdrawals' });
  }
};

const getWithdrawal = async (req, res) => {
  try {
    const data = await require('../../services/vendorWithdrawal.service').getWithdrawalDetail(
      vendorId(req),
      req.params.id
    );
    res.json({ success: true, data });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, message: error.message || 'Not found' });
  }
};

const cancelWithdrawal = async (req, res) => {
  try {
    const data = await require('../../services/vendorWithdrawal.service').cancelWithdrawal(
      vendorId(req),
      req.params.id
    );
    res.json({ success: true, data });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, message: error.message || 'Cancel failed' });
  }
};

const downloadWithdrawalReceipt = async (req, res) => {
  try {
    const w = await require('../../services/vendorWithdrawal.service').getWithdrawalDetail(
      vendorId(req),
      req.params.id
    );
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Withdrawal Receipt</title>
<style>body{font-family:Segoe UI,Arial,sans-serif;max-width:640px;margin:40px auto;color:#111}
h1{font-size:20px}table{width:100%;border-collapse:collapse;margin-top:16px}
td{padding:8px;border-bottom:1px solid #eee;font-size:13px}.muted{color:#666}</style></head><body>
<h1>Withdrawal Settlement Receipt</h1>
<p class="muted">Reference: ${w._id}</p>
<table>
<tr><td>Status</td><td><strong>${w.status}</strong></td></tr>
<tr><td>Gross Amount</td><td>₹${w.amount}</td></tr>
<tr><td>TDS (${w.tdsRate || 0}%)</td><td>₹${w.tdsAmount || 0}</td></tr>
<tr><td>Platform Fee</td><td>₹${w.platformFeeAmount || 0}</td></tr>
<tr><td>GST on Fee</td><td>₹${w.gstOnFee || 0}</td></tr>
<tr><td>Net Payout</td><td><strong>₹${w.netAmount || w.amount}</strong></td></tr>
<tr><td>UTR / Reference</td><td>${w.transactionReference || '—'}</td></tr>
<tr><td>Gateway</td><td>${w.gatewayProvider || '—'} ${w.gatewayPayoutId || ''}</td></tr>
<tr><td>Account</td><td>${w.bankDetails?.accountHolderName || ''} · ${w.bankDetails?.accountNumberMasked || w.bankDetails?.upiId || ''}</td></tr>
<tr><td>Requested</td><td>${w.createdAt ? new Date(w.createdAt).toLocaleString('en-IN') : '—'}</td></tr>
<tr><td>Paid At</td><td>${w.paidAt ? new Date(w.paidAt).toLocaleString('en-IN') : '—'}</td></tr>
</table>
${(w.timeline || []).map((e) => `<p class="muted">${new Date(e.at).toLocaleString('en-IN')} — ${e.status}: ${e.message}</p>`).join('')}
</body></html>`;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="withdrawal-${w._id}.html"`);
    res.send(html);
  } catch (error) {
    res.status(error.status || 500).json({ success: false, message: error.message || 'Receipt failed' });
  }
};

const getReceivables = (clientType) => async (req, res) => {
  try {
    const vid = vendorId(req);
    const { page, limit, skip } = paging(req);
    const filter = { vendorId: vid, clientType };
    if (req.query.status) filter.status = req.query.status;
    await categoryFilter(filter, vid, req.query.category);
    if (req.query.search) {
      const term = escapeRegex(req.query.search);
      filter.$or = [
        { clientName: term },
        { projectName: term },
        { receivableCode: term },
        { invoiceNumber: term },
        { poNumber: term }
      ];
    }
    const [data, total, totals] = await Promise.all([
      VendorFinanceReceivable.find(filter).sort({ dueDate: 1 }).skip(skip).limit(limit).lean({ virtuals: true }),
      VendorFinanceReceivable.countDocuments(filter),
      VendorFinanceReceivable.aggregate([
        { $match: { vendorId: vid, clientType } },
        {
          $group: {
            _id: null,
            amount: { $sum: '$amount' },
            paid: { $sum: '$paidAmount' },
            overdue: {
              $sum: {
                $cond: [
                  { $eq: ['$status', 'overdue'] },
                  { $subtract: ['$amount', '$paidAmount'] },
                  0
                ]
              }
            }
          }
        }
      ])
    ]);
    const summary = totals[0] || { amount: 0, paid: 0, overdue: 0 };
    summary.remaining = summary.amount - summary.paid;
    summary.collectionRate = summary.amount ? Math.round((summary.paid / summary.amount) * 100) : 0;
    res.json({ success: true, data, summary, pagination: pagination(page, limit, total) });
  } catch (error) {
    console.error('finance getReceivables:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch receivables' });
  }
};

const updateReceivable = async (req, res) => {
  try {
    const vid = vendorId(req);
    const item = await VendorFinanceReceivable.findOne({ _id: req.params.id, vendorId: vid });
    if (!item) return res.status(404).json({ success: false, message: 'Receivable not found' });
    const { action } = req.body;
    if (action === 'remind') item.lastReminderAt = new Date();
    if (action === 'cancel') item.status = 'cancelled';
    if (action === 'record_payment') {
      const remaining = Math.max(0, item.amount - item.paidAmount);
      const amount = Math.min(remaining, Math.max(0, Number(req.body.amount) || remaining));
      item.paidAmount += amount;
      await postVendorFinanceLedger({
        vendorId: vid,
        type: 'credit',
        amount,
        description: `Payment received from ${item.clientName}`,
        projectCode: item.projectCode,
        referenceCode: item.invoiceNumber || item.receivableCode,
        serviceCategoryCode: item.serviceCategoryCode,
        serviceCategoryName: item.serviceCategoryName,
        source: 'receivable'
      });
    }
    await item.save();
    res.json({ success: true, data: item });
  } catch (error) {
    console.error('finance updateReceivable:', error);
    res.status(500).json({ success: false, message: 'Failed to update receivable' });
  }
};

const getDocuments = (documentType) => async (req, res) => {
  try {
    const vid = vendorId(req);
    const { page, limit, skip } = paging(req);
    const filter = { vendorId: vid, documentType };
    if (req.query.status) filter.status = req.query.status;
    await categoryFilter(filter, vid, req.query.category);
    if (req.query.search) {
      const term = escapeRegex(req.query.search);
      filter.$or = [{ documentCode: term }, { clientName: term }, { projectName: term }, { scope: term }];
    }
    const [data, total] = await Promise.all([
      VendorFinanceDocument.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      VendorFinanceDocument.countDocuments(filter)
    ]);
    res.json({ success: true, data, pagination: pagination(page, limit, total) });
  } catch (error) {
    console.error('finance getDocuments:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch finance documents' });
  }
};

const updateDocument = async (req, res) => {
  try {
    const vid = vendorId(req);
    const lifecycle = require('../../services/vendorFinanceLifecycle.service');
    const doc = await VendorFinanceDocument.findOne({ _id: req.params.id, vendorId: vid });
    if (!doc) return res.status(404).json({ success: false, message: 'Document not found' });
    const { action } = req.body;
    const quotationMap = {
      send: 'sent',
      negotiate: 'negotiation',
      approve: 'approved',
      reject: 'rejected',
      expire: 'expired'
    };
    const invoiceMap = { issue: 'issued', cancel: 'cancelled', mark_paid: 'paid' };
    if (doc.documentType === 'quotation' && quotationMap[action]) doc.status = quotationMap[action];
    if (doc.documentType === 'invoice' && invoiceMap[action]) {
      doc.status = invoiceMap[action];
      if (action === 'issue') doc.paymentEligible = true;
    }
    if (action === 'convert' && doc.documentType === 'quotation') {
      const result = await lifecycle.convertQuotationToProject(vid, doc._id);
      return res.json({ success: true, data: result.document, meta: { milestones: result.milestones?.length || 0 } });
    }
    if (action === 'release_escrow' && doc.documentType === 'invoice') {
      const result = await lifecycle.releaseInvoiceEscrow(vid, doc._id, {
        commissionRate: Number(req.body.commissionRate) || 5,
        tdsRate: Number(req.body.tdsRate) || 0
      });
      return res.json({ success: true, data: result.invoice, meta: result });
    }
    await doc.save();
    lifecycle.emitFinance(vid, 'finance:documentUpdated', { documentId: doc._id, status: doc.status });
    res.json({ success: true, data: doc });
  } catch (error) {
    console.error('finance updateDocument:', error);
    res.status(error.status || 500).json({ success: false, message: error.message || 'Failed to update document' });
  }
};

const getMilestones = async (req, res) => {
  try {
    const vid = vendorId(req);
    const { page, limit, skip } = paging(req);
    const filter = { vendorId: vid };
    if (req.query.status) filter.status = req.query.status;
    await categoryFilter(filter, vid, req.query.category);
    if (req.query.search) {
      const term = escapeRegex(req.query.search);
      filter.$or = [
        { milestoneCode: term },
        { name: term },
        { projectName: term },
        { clientName: term }
      ];
    }
    const [data, total] = await Promise.all([
      VendorFinanceMilestone.find(filter).sort({ dueDate: 1, sequence: 1 }).skip(skip).limit(limit).lean(),
      VendorFinanceMilestone.countDocuments(filter)
    ]);
    res.json({ success: true, data, pagination: pagination(page, limit, total) });
  } catch (error) {
    console.error('finance getMilestones:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch payment milestones' });
  }
};

const updateMilestone = async (req, res) => {
  try {
    const vid = vendorId(req);
    const lifecycle = require('../../services/vendorFinanceLifecycle.service');
    const item = await VendorFinanceMilestone.findOne({ _id: req.params.id, vendorId: vid });
    if (!item) return res.status(404).json({ success: false, message: 'Milestone not found' });
    const { action } = req.body;
    if (action === 'complete') {
      item.projectCompleted = true;
      item.status = 'qa_pending';
    } else if (action === 'qa_approve') {
      item.qaApproved = true;
      item.status = 'approval_pending';
    } else if (action === 'client_approve') {
      item.clientApproved = true;
      item.status = 'invoice_ready';
    } else if (action === 'invoice') {
      const result = await lifecycle.generateInvoiceFromMilestone(vid, item._id);
      return res.json({ success: true, data: result.milestone, invoice: result.invoice });
    } else if (action === 'pay') {
      if (item.status !== 'invoiced') {
        return res.status(400).json({ success: false, message: 'Milestone must be invoiced first' });
      }
      // Manual offline pay (ledger credit) — prefer Razorpay invoice pay for production clients
      item.status = 'paid';
      item.paidAt = new Date();
      await postVendorFinanceLedger({
        vendorId: vid,
        type: 'credit',
        amount: item.amount,
        description: `Milestone payment: ${item.name}`,
        projectCode: item.projectCode,
        referenceCode: item.invoiceNumber,
        serviceCategoryCode: item.serviceCategoryCode,
        serviceCategoryName: item.serviceCategoryName,
        source: 'milestone'
      });
    }
    await item.save();
    lifecycle.emitFinance(vid, 'finance:milestoneUpdated', { milestoneId: item._id, status: item.status });
    res.json({ success: true, data: item });
  } catch (error) {
    console.error('finance updateMilestone:', error);
    res.status(error.status || 500).json({ success: false, message: error.message || 'Failed to update payment milestone' });
  }
};

const syncFinance = async (req, res) => {
  try {
    const vid = vendorId(req);
    const lifecycle = require('../../services/vendorFinanceLifecycle.service');
    const data = await lifecycle.syncVendorFinance(vid);
    res.json({ success: true, data });
  } catch (error) {
    console.error('finance syncFinance:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to sync finance data' });
  }
};

const exportLedger = async (req, res) => {
  try {
    const vid = vendorId(req);
    const lifecycle = require('../../services/vendorFinanceLifecycle.service');
    const csv = await lifecycle.exportLedgerCsv(vid, {
      category: req.query.category,
      status: req.query.status,
      search: req.query.search
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="vendor-finance-ledger-${Date.now()}.csv"`);
    res.send(csv);
  } catch (error) {
    console.error('finance exportLedger:', error);
    res.status(500).json({ success: false, message: 'Failed to export ledger' });
  }
};

const downloadDocument = async (req, res) => {
  try {
    const vid = vendorId(req);
    const lifecycle = require('../../services/vendorFinanceLifecycle.service');
    const html = await lifecycle.getInvoiceHtml(vid, req.params.id);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (error) {
    console.error('finance downloadDocument:', error);
    res.status(error.status || 500).json({ success: false, message: error.message || 'Failed to render document' });
  }
};

const createInvoicePayOrder = async (req, res) => {
  try {
    const vid = vendorId(req);
    const lifecycle = require('../../services/vendorFinanceLifecycle.service');
    const data = await lifecycle.createInvoicePaymentOrder(vid, req.params.id, {
      idempotencyKey: req.body.idempotencyKey || req.get('Idempotency-Key')
    });
    res.status(201).json({ success: true, data });
  } catch (error) {
    console.error('finance createInvoicePayOrder:', error);
    res.status(error.status || 500).json({ success: false, message: error.message || 'Failed to create payment order' });
  }
};

const verifyInvoicePay = async (req, res) => {
  try {
    const vid = vendorId(req);
    const lifecycle = require('../../services/vendorFinanceLifecycle.service');
    const data = await lifecycle.verifyInvoicePayment(vid, {
      invoiceId: req.params.id,
      razorpay_order_id: req.body.razorpay_order_id,
      razorpay_payment_id: req.body.razorpay_payment_id,
      razorpay_signature: req.body.razorpay_signature
    });
    res.json({ success: true, data });
  } catch (error) {
    console.error('finance verifyInvoicePay:', error);
    res.status(error.status || 500).json({ success: false, message: error.message || 'Failed to verify payment' });
  }
};

module.exports = {
  getCounts,
  getWallet,
  getEarningsByService,
  getEarningsOverview,
  getEngineerPayments,
  recordEngineerPayment,
  getSettlements,
  getWithdrawEligibility,
  quoteWithdrawal,
  listBankAccounts,
  upsertBankAccount,
  verifyBankAccount,
  sendWithdrawOtp,
  requestWithdrawal,
  listWithdrawals,
  getWithdrawal,
  cancelWithdrawal,
  downloadWithdrawalReceipt,
  getClientReceivables: getReceivables('individual'),
  getB2BReceivables: getReceivables('b2b'),
  updateReceivable,
  getQuotations: getDocuments('quotation'),
  getInvoices: getDocuments('invoice'),
  updateDocument,
  getMilestones,
  updateMilestone,
  syncFinance,
  exportLedger,
  downloadDocument,
  createInvoicePayOrder,
  verifyInvoicePay
};
