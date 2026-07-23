const Engineer = require('../../models/Engineer');
const Booking = require('../../models/Booking');
const VendorOpsJob = require('../../models/VendorOpsJob');
const Transaction = require('../../models/Transaction');
const mongoose = require('mongoose');
const {
  formatEngineerServiceLabel,
  aggregateEngineerPaymentStats,
  buildEngineerPaymentSummary,
  statsForEngineerId,
  getEngineerPaymentSummaryForOne,
  getTransactionBreakdownForEngineer,
  getRecentWithdrawalsForEngineer,
  roundMoney
} = require('../../utils/engineerPaymentHelpers');
const { validationResult } = require('express-validator');
const { WORKER_STATUS, BOOKING_STATUS, VENDOR_STATUS } = require('../../utils/constants');
const { createNotification } = require('../notificationControllers/notificationController');

/**
 * Get all engineers with filters and pagination
 */
const getAllEngineers = async (req, res) => {
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

    // Get engineers
    const engineers = await Engineer.find(query)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Relink orphan signup KYC (tempEntityId → engineer._id) for this page
    // so admin View/Verification shows documents without a manual migration
    try {
      const { ensureProfileKycLinked, readCustomField } = require('../../services/kycEntityLinkService');
      const VerificationDocument = require('../../models/VerificationDocument');
      await Promise.all(
        engineers.map(async (eng) => {
          const tempId = readCustomField(eng, 'tempEntityId');
          if (!tempId) return;
          const docsCount = await VerificationDocument.countDocuments({
            ownerId: eng._id,
            ownerType: 'engineer'
          });
          if (docsCount > 0) return;
          await ensureProfileKycLinked('engineer', eng.toObject ? eng.toObject() : eng);
        })
      );
    } catch (linkErr) {
      console.warn('[getAllEngineers] KYC link warning:', linkErr.message);
    }

    // Get total count
    const total = await Engineer.countDocuments(query);

    res.status(200).json({
      success: true,
      data: engineers,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get all engineers error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch engineers. Please try again.'
    });
  }
};

/**
 * Temporary signed Cloudinary URL for private/authenticated verification assets
 */
const {
  isRealFileUrl,
  resolveDocumentPreviewUrl
} = require('../../utils/documentPreviewUrl');

/**
 * Get engineer details (full registration profile + documents for admin review)
 */
const getEngineerDetails = async (req, res) => {
  try {
    const { id } = req.params;

    let engineer = await Engineer.findById(id).select('-password').lean();

    if (!engineer) {
      return res.status(404).json({
        success: false,
        message: 'Engineer not found'
      });
    }

    // Relink orphan signup KYC docs (tempEntityId → engineer._id) then hydrate profile fields
    const {
      ensureProfileKycLinked,
      readCustomField
    } = require('../../services/kycEntityLinkService');
    let verificationRequest = null;
    try {
      const linkResult = await ensureProfileKycLinked('engineer', engineer);
      verificationRequest = linkResult.verificationRequest || null;
      // Reload after hydrate/remap so aadhar/pan URLs appear
      engineer = await Engineer.findById(id).select('-password').lean();
    } catch (linkErr) {
      console.warn('[getEngineerDetails] KYC link warning:', linkErr.message);
    }

    // Get engineer booking stats
    const jobStats = await Booking.aggregate([
      {
        $match: { engineerId: engineer._id }
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
          totalJobValue: {
            $sum: '$finalAmount'
          }
        }
      }
    ]);

    const VerificationDocument = require('../../models/VerificationDocument');
    const KYCVerification = require('../../models/KYCVerification');
    const VerificationRequest = require('../../models/VerificationRequest');

    const [verificationDocs, kycRecords, existingRequest] = await Promise.all([
      VerificationDocument.find({ ownerId: engineer._id }).sort({ documentType: 1, side: 1 }).lean(),
      KYCVerification.find({ role: 'engineer', entityId: engineer._id }).lean(),
      verificationRequest
        ? Promise.resolve(verificationRequest)
        : VerificationRequest.findOne({ ownerId: engineer._id, ownerType: 'engineer' })
    ]);

    const documents = verificationDocs.map((d) => {
      const { previewUrl, hasPhysicalFile } = resolveDocumentPreviewUrl(d.fileUrl, d.fileKey);
      return {
        ...d,
        signedPreviewUrl: hasPhysicalFile ? previewUrl : null,
        hasPhysicalFile,
        verifiedBy: d.verifiedBy || d.reviewedBy || null
      };
    });

    // Build a unified gallery from KYC + legacy profile fields when VerificationDocument is sparse
    const gallery = [];
    const digitalStatuses = [];
    const pushGallery = (item) => {
      if (!isRealFileUrl(item?.url)) return;
      const already = gallery.some(
        (g) =>
          g.url === item.url ||
          (g.documentType === item.documentType && g.side === (item.side || 'single') && g.source === item.source)
      );
      if (already) return;
      gallery.push({ ...item, side: item.side || 'single' });
    };

    for (const d of documents) {
      const url = d.signedPreviewUrl || d.fileUrl;
      pushGallery({
        key: `${d.documentType}_${d.side || 'single'}`,
        label: `${String(d.documentType).replace(/_/g, ' ')}${d.side && d.side !== 'single' ? ` (${d.side})` : ''}`,
        documentType: d.documentType,
        side: d.side || 'single',
        url,
        status: d.status,
        source: 'verification_document',
        docId: d._id
      });
    }

    const cgpeStatus = {};
    for (const rec of kycRecords) {
      cgpeStatus[rec.documentType] = {
        status: rec.status,
        provider: rec.provider,
        verificationMode: rec.verificationMode,
        physicalUploadStatus: rec.physicalUploadStatus,
        documentNumberMasked: rec.documentNumberMasked,
        verifiedAt: rec.verifiedAt,
        fileUrl: isRealFileUrl(rec.fileUrl) ? rec.fileUrl : null,
        backFileUrl: isRealFileUrl(rec.backFileUrl) ? rec.backFileUrl : null
      };

      const hasGalleryDoc = gallery.some((g) => g.documentType === rec.documentType);

      if (isRealFileUrl(rec.fileUrl) && !hasGalleryDoc) {
        pushGallery({
          key: `kyc_${rec.documentType}_front`,
          label: `${String(rec.documentType).replace(/_/g, ' ')}`,
          documentType: rec.documentType,
          side: 'front',
          url: rec.fileUrl,
          status: rec.physicalUploadStatus === 'uploaded' ? 'pending' : (rec.status || 'pending'),
          source: 'kyc'
        });
      }
      if (isRealFileUrl(rec.backFileUrl)) {
        pushGallery({
          key: `kyc_${rec.documentType}_back`,
          label: `${String(rec.documentType).replace(/_/g, ' ')} (back)`,
          documentType: rec.documentType,
          side: 'back',
          url: rec.backFileUrl,
          status: rec.physicalUploadStatus === 'uploaded' ? 'pending' : (rec.status || 'pending'),
          source: 'kyc'
        });
      }

      // Digital CGPE / DigiLocker verify without physical card image
      if (!isRealFileUrl(rec.fileUrl) && !isRealFileUrl(rec.backFileUrl) && ['aadhaar', 'pan', 'bank'].includes(rec.documentType)) {
        digitalStatuses.push({
          key: `digital_${rec.documentType}`,
          documentType: rec.documentType,
          label: String(rec.documentType).replace(/_/g, ' '),
          status: rec.status,
          verificationMode: rec.verificationMode,
          provider: rec.provider,
          documentNumberMasked: rec.documentNumberMasked || null,
          note:
            rec.status === 'verified'
              ? 'Verified digitally (no physical card image uploaded)'
              : 'No physical card image uploaded'
        });
      }
    }

    // Legacy profile media
    const legacyDocs = [
      { key: 'selfie', label: 'Selfie', url: engineer.selfieUrl, status: engineer.selfieStatus, documentType: 'selfie' },
      { key: 'intro_video', label: 'Intro Video', url: engineer.introVideoUrl, status: engineer.introVideoStatus, documentType: 'intro_video' },
      { key: 'aadhaar_front', label: 'Aadhaar Front', url: engineer.aadhar?.document || engineer.documents?.aadhaar || engineer.documents?.aadhaarFrontUrl, documentType: 'aadhaar', side: 'front' },
      { key: 'aadhaar_back', label: 'Aadhaar Back', url: engineer.aadhar?.backDocument || engineer.documents?.aadhaarBackUrl, documentType: 'aadhaar', side: 'back' },
      { key: 'pan', label: 'PAN Card', url: engineer.pan?.document || engineer.documents?.pan, documentType: 'pan', side: 'single' },
      { key: 'driving_license', label: 'Driving License', url: engineer.drivingLicenseUrl || engineer.licenseUrl, status: engineer.licenseVerificationStatus, documentType: 'license' },
      { key: 'rc', label: 'RC Document', url: engineer.rcUrl, documentType: 'rc' },
      { key: 'education', label: 'Education Certificate', url: engineer.educationCertificateUrl, status: engineer.educationCertificateStatus, documentType: 'education_certificate' },
      { key: 'police', label: 'Police Verification', url: engineer.policeVerification?.document, status: engineer.policeVerification?.status, documentType: 'police_verification' }
    ];

    for (const item of legacyDocs) {
      const already = gallery.some((g) => g.documentType === item.documentType && g.side === (item.side || 'single'));
      if (!already) {
        pushGallery({
          ...item,
          side: item.side || 'single',
          source: 'profile'
        });
      }
    }

    for (const doc of engineer.uploadedDocuments || []) {
      pushGallery({
        key: `uploaded_${doc.key}_front`,
        label: String(doc.key || 'Document').replace(/_/g, ' '),
        url: doc.url,
        status: doc.status,
        documentType: doc.key,
        side: 'front',
        source: 'uploadedDocuments'
      });
      if (doc.backUrl) {
        pushGallery({
          key: `uploaded_${doc.key}_back`,
          label: `${String(doc.key || 'Document').replace(/_/g, ' ')} (back)`,
          url: doc.backUrl,
          status: doc.status,
          documentType: doc.key,
          side: 'back',
          source: 'uploadedDocuments'
        });
      }
    }

    const requestDoc = existingRequest?.toObject
      ? existingRequest.toObject()
      : existingRequest;

    res.status(200).json({
      success: true,
      data: {
        engineer: {
          ...engineer,
          // Surface numbers from customFields when legacy fields empty
          aadhar: {
            ...(engineer.aadhar || {}),
            number:
              engineer.aadhar?.number ||
              readCustomField(engineer, 'aadhaarNumber') ||
              readCustomField(engineer, 'aadharNumber') ||
              cgpeStatus?.aadhaar?.documentNumberMasked ||
              ''
          },
          pan: {
            ...(engineer.pan || {}),
            number:
              engineer.pan?.number ||
              readCustomField(engineer, 'panNumber') ||
              cgpeStatus?.pan?.documentNumberMasked ||
              ''
          }
        },
        stats: jobStats[0] || {
          totalJobs: 0,
          completedJobs: 0,
          totalJobValue: 0
        },
        documents: documents.filter((d) => isRealFileUrl(d.signedPreviewUrl || d.fileUrl)),
        documentGallery: gallery,
        digitalStatuses,
        cgpeStatus,
        verificationRequest: requestDoc
          ? {
              _id: requestDoc._id,
              overallStatus: requestDoc.overallStatus,
              adminReviewStatus: requestDoc.adminReviewStatus,
              requiredDocuments: requestDoc.requiredDocuments,
              submittedDocuments: requestDoc.submittedDocuments,
              verifiedDocuments: requestDoc.verifiedDocuments,
              rejectedDocuments: requestDoc.rejectedDocuments
            }
          : null
      }
    });
  } catch (error) {
    console.error('Get engineer details error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch engineer details. Please try again.'
    });
  }
};

/**
 * Approve engineer registration
 */
const approveEngineer = async (req, res) => {
  try {
    const { id } = req.params;

    const engineer = await Engineer.findById(id);

    if (!engineer) {
      return res.status(404).json({
        success: false,
        message: 'Engineer not found'
      });
    }

    engineer.approvalStatus = 'approved';
    engineer.verificationStatus = 'approved';
    engineer.isActive = true;
    await engineer.save();

    try {
      const { emitAsync } = require('../../services/notification/notificationOrchestrator.service');
      emitAsync('engineer_approved', {
        targets: { engineerId: engineer._id },
        data: {
          engineerId: engineer._id,
          name: engineer.name,
          email: engineer.email,
          message: 'Your engineer registration has been approved. You can now receive jobs.'
        },
        actorId: req.user?.id || req.user?._id
      });
    } catch (_) { /* non-blocking */ }

    res.status(200).json({
      success: true,
      message: 'Engineer approved successfully',
      data: engineer
    });
  } catch (error) {
    console.error('Approve engineer error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to approve engineer. Please try again.'
    });
  }
};

/**
 * Reject engineer registration
 */
const rejectEngineer = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const engineer = await Engineer.findById(id);

    if (!engineer) {
      return res.status(404).json({
        success: false,
        message: 'Engineer not found'
      });
    }

    engineer.approvalStatus = 'rejected';
    engineer.verificationStatus = 'rejected';
    engineer.isActive = false;
    engineer.rejectionReason = reason || '';
    await engineer.save();

    res.status(200).json({
      success: true,
      message: 'Engineer rejected successfully',
      data: engineer
    });
  } catch (error) {
    console.error('Reject engineer error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reject engineer. Please try again.'
    });
  }
};

/**
 * Suspend engineer
 */
const suspendEngineer = async (req, res) => {
  try {
    const { id } = req.params;

    const engineer = await Engineer.findById(id);

    if (!engineer) {
      return res.status(404).json({
        success: false,
        message: 'Engineer not found'
      });
    }

    engineer.approvalStatus = 'suspended';
    engineer.isActive = false;
    await engineer.save();

    res.status(200).json({
      success: true,
      message: 'Engineer suspended successfully',
      data: engineer
    });
  } catch (error) {
    console.error('Suspend engineer error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to suspend engineer. Please try again.'
    });
  }
};

/**
 * Get engineer jobs
 */
const getEngineerJobs = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const engOid = new mongoose.Types.ObjectId(id);

    const bookingQuery = { workerId: engOid };
    if (status) bookingQuery.status = status;

    const opsQuery = { engineerId: engOid };
    if (status) opsQuery.status = status;

    const [bookings, opsJobs, bookingTotal, opsTotal] = await Promise.all([
      Booking.find(bookingQuery)
        .populate('userId', 'name phone')
        .populate('serviceId', 'title iconUrl')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit, 10))
        .lean(),
      VendorOpsJob.find(opsQuery)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit, 10))
        .lean(),
      Booking.countDocuments(bookingQuery),
      VendorOpsJob.countDocuments(opsQuery)
    ]);

    const merged = [
      ...bookings.map((b) => ({ ...b, jobSource: 'booking' })),
      ...opsJobs.map((j) => ({
        _id: j._id,
        jobCode: j.jobCode,
        title: j.title,
        status: j.status,
        clientName: j.clientName,
        city: j.city,
        budget: j.budget,
        engineerPayout: j.engineerPayout,
        payoutStatus: j.payoutStatus,
        createdAt: j.createdAt,
        completedAt: j.completedAt,
        jobSource: 'vendor_ops'
      }))
    ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.status(200).json({
      success: true,
      data: merged.slice(0, parseInt(limit, 10)),
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total: bookingTotal + opsTotal,
        pages: Math.ceil((bookingTotal + opsTotal) / parseInt(limit, 10))
      }
    });
  } catch (error) {
    console.error('Get engineer jobs error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch engineer jobs.'
    });
  }
};

/**
 * Get engineer earnings and transaction history (admin)
 */
const getEngineerEarnings = async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 25 } = req.query;

    const engineer = await Engineer.findById(id).select(
      'name phone email serviceCategories primaryCategory serviceCategory approvalStatus wallet bankDetails'
    );
    if (!engineer) {
      return res.status(404).json({ success: false, message: 'Engineer not found' });
    }

    const ledger = await getEngineerPaymentSummaryForOne(engineer._id);
    const summary = buildEngineerPaymentSummary(engineer.toObject ? engineer.toObject() : engineer, {
      ledgerEarnings: ledger.totalEarningsFromLedger,
      ledgerCredits: ledger.ledgerCredits,
      ledgerDebits: ledger.ledgerDebits,
      pendingWithdrawal: ledger.pendingWithdrawal,
      withdrawnAmount: ledger.withdrawnAmount
    });

    const txQuery = {
      $or: [{ engineerId: engineer._id }, { workerId: engineer._id }]
    };
    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const lim = parseInt(limit, 10);

    const [transactions, total, breakdown, withdrawals] = await Promise.all([
      Transaction.find(txQuery).sort({ createdAt: -1 }).skip(skip).limit(lim).lean(),
      Transaction.countDocuments(txQuery),
      getTransactionBreakdownForEngineer(engineer._id),
      getRecentWithdrawalsForEngineer(engineer._id, 15)
    ]);

    res.status(200).json({
      success: true,
      data: {
        engineer: {
          _id: engineer._id,
          name: engineer.name,
          phone: engineer.phone,
          email: engineer.email,
          serviceLabel: formatEngineerServiceLabel(engineer),
          approvalStatus: engineer.approvalStatus,
          bankDetails: engineer.bankDetails
            ? {
                upiId: engineer.bankDetails.upiId || null,
                accountHolderName: engineer.bankDetails.accountHolderName || null,
                bankName: engineer.bankDetails.bankName || null
              }
            : null
        },
        summary: {
          availableBalance: summary.availableBalance,
          totalEarnings: summary.totalEarned,
          totalCredits: summary.totalCredits,
          totalDebits: summary.totalDebits,
          withdrawnAmount: summary.withdrawnAmount,
          pendingWithdrawal: summary.pendingWithdrawal,
          allocated: summary.allocated,
          reconciliationDelta: summary.reconciliationDelta,
          isReconciled: summary.isReconciled,
          formula:
            'Total earned ≈ Available + Pending payout + Withdrawn (small rounding differences possible)'
        },
        breakdown,
        withdrawals,
        transactions,
        pagination: {
          page: parseInt(page, 10),
          limit: lim,
          total,
          pages: Math.ceil(total / lim) || 1
        }
      }
    });
  } catch (error) {
    console.error('Get engineer earnings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch engineer earnings.'
    });
  }
};

/**
 * Pay engineer manually
 */
const payEngineer = async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, reference, notes } = req.body;

    if (!amount || isNaN(amount) || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid amount'
      });
    }

    const engineer = await Engineer.findById(id);
    if (!engineer) {
      return res.status(404).json({
        success: false,
        message: 'Engineer not found'
      });
    }

    const credit = parseFloat(amount);
    if (!engineer.wallet) {
      engineer.wallet = { balance: 0, totalEarnings: 0, withdrawnAmount: 0, pendingBalance: 0 };
    }

    const balanceBefore = Number(engineer.wallet.balance) || 0;
    engineer.wallet.balance = balanceBefore + credit;
    engineer.wallet.totalEarnings = (Number(engineer.wallet.totalEarnings) || 0) + credit;
    await engineer.save();

    const adminId = req.user?.id || req.user?._id;
    await Transaction.create({
      engineerId: engineer._id,
      type: 'earnings_credit',
      amount: credit,
      status: 'completed',
      paymentMethod: 'bank_transfer',
      description: notes?.trim()
        ? `Admin payment: ${notes.trim()}`
        : `Manual credit by admin`,
      referenceId: reference?.trim() || null,
      balanceBefore,
      balanceAfter: engineer.wallet.balance,
      metadata: {
        source: 'admin_manual_pay',
        adminId: adminId ? String(adminId) : null,
        notes: notes?.trim() || null
      }
    });

    res.status(200).json({
      success: true,
      message: `Successfully recorded payment of ₹${credit} to ${engineer.name}`,
      data: {
        balance: engineer.wallet.balance,
        totalEarnings: engineer.wallet.totalEarnings
      }
    });
  } catch (error) {
    console.error('Pay engineer error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process payment. Please try again.'
    });
  }
};

/**
 * Get all engineer jobs (global)
 */
const getAllEngineerJobs = async (req, res) => {
  try {
    const { status, page = 1, limit = 20, search } = req.query;
    const { fetchAllEngineerJobsForAdmin } = require('../../utils/adminEngineerJobsList');
    const { jobs, total, page: p, limit: l } = await fetchAllEngineerJobsForAdmin({
      status: status === 'all' ? undefined : status,
      page,
      limit,
      search
    });

    res.status(200).json({
      success: true,
      data: jobs,
      pagination: {
        page: p,
        limit: l,
        total,
        pages: Math.ceil(total / l) || 1
      }
    });
  } catch (error) {
    console.error('Get all engineer jobs error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch all engineer jobs.'
    });
  }
};

/**
 * Get engineer payments summary
 */
const getEngineerPaymentsSummary = async (req, res) => {
  try {
    const { search } = req.query;
    const query = {};
    if (search && String(search).trim()) {
      const term = String(search).trim();
      query.$or = [
        { name: { $regex: term, $options: 'i' } },
        { phone: { $regex: term, $options: 'i' } }
      ];
    }

    const engineers = await Engineer.find(query)
      .select(
        'name phone wallet email serviceCategories primaryCategory serviceCategory approvalStatus completedJobs rating isActive'
      )
      .sort({ 'wallet.balance': -1, name: 1 })
      .lean();

    const ids = engineers.map((e) => e._id);
    const maps = await aggregateEngineerPaymentStats(ids);

    let totals = {
      availableBalance: 0,
      pendingWithdrawal: 0,
      totalEarned: 0,
      withdrawnAmount: 0
    };

    const data = engineers.map((e) => {
      const stats = statsForEngineerId(maps, e._id);
      const summary = buildEngineerPaymentSummary(e, stats);

      totals.availableBalance += summary.availableBalance;
      totals.pendingWithdrawal += summary.pendingWithdrawal;
      totals.totalEarned += summary.totalEarned;
      totals.withdrawnAmount += summary.withdrawnAmount;

      return {
        ...e,
        serviceLabel: formatEngineerServiceLabel(e),
        paymentSummary: summary,
        wallet: {
          balance: summary.availableBalance,
          totalEarnings: summary.totalEarned,
          withdrawnAmount: summary.withdrawnAmount,
          pendingBalance: summary.pendingWithdrawal
        }
      };
    });

    res.status(200).json({
      success: true,
      data,
      meta: {
        totals: {
          availableBalance: roundMoney(totals.availableBalance),
          pendingWithdrawal: roundMoney(totals.pendingWithdrawal),
          totalEarned: roundMoney(totals.totalEarned),
          withdrawnAmount: roundMoney(totals.withdrawnAmount)
        }
      }
    });
  } catch (error) {
    console.error('Get engineer payments summary error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch engineer payments summary.'
    });
  }
};

/**
 * Toggle engineer active status
 */
const toggleEngineerStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body; // Expecting { isActive: true/false }

    const engineer = await Engineer.findById(id);

    if (!engineer) {
      return res.status(404).json({
        success: false,
        message: 'Engineer not found'
      });
    }

    engineer.isActive = isActive;
    await engineer.save();

    res.status(200).json({
      success: true,
      message: `Engineer ${isActive ? 'activated' : 'deactivated'} successfully`,
      data: engineer
    });
  } catch (error) {
    console.error('Toggle engineer status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update engineer status'
    });
  }
};

/**
 * Delete engineer details
 */
const deleteEngineer = async (req, res) => {
  try {
    const { id } = req.params;

    const engineer = await Engineer.findByIdAndDelete(id);

    if (!engineer) {
      return res.status(404).json({
        success: false,
        message: 'Engineer not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Engineer deleted successfully'
    });
  } catch (error) {
    console.error('Delete engineer error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete engineer'
    });
  }
};

const updateMediaStatus = async (req, res, mediaType) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (!['pending', 'approved', 'rejected'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }
    const engineer = await Engineer.findById(id);
    if (!engineer) {
      return res.status(404).json({ success: false, message: 'Engineer not found' });
    }
    if (mediaType === 'selfie') engineer.selfieStatus = status;
    if (mediaType === 'video') engineer.introVideoStatus = status;
    if (mediaType === 'vehicle') engineer.vehicleVerificationStatus = status;
    
    await engineer.save();
    res.status(200).json({ success: true, message: `${mediaType} status updated`, data: engineer });
  } catch (error) {
    console.error(`Update ${mediaType} status error:`, error);
    res.status(500).json({ success: false, message: 'Failed to update status' });
  }
};

const updateSelfieStatus = (req, res) => updateMediaStatus(req, res, 'selfie');
const updateIntroVideoStatus = (req, res) => updateMediaStatus(req, res, 'video');
const updateVehicleStatus = (req, res) => updateMediaStatus(req, res, 'vehicle');

module.exports = {
  getAllEngineers,
  getEngineerDetails,
  approveEngineer,
  rejectEngineer,
  suspendEngineer,
  getEngineerJobs,
  getEngineerEarnings,
  payEngineer,
  getAllEngineerJobs,
  getEngineerPaymentsSummary,
  toggleEngineerStatus,
  deleteEngineer,
  updateSelfieStatus,
  updateIntroVideoStatus,
  updateVehicleStatus
};
