const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

let XLSX;
try {
  XLSX = require('xlsx');
} catch (err) {
  console.error('[Dependency Warning]: xlsx module is missing. Excel features will not work until installed.');
}
const B2BBatch = require('../../models/B2BBatch');
const B2BBatchErrors = require('../../models/B2BBatchErrors');
const B2BBulkUploadRow = require('../../models/B2BBulkUploadRow');
const B2BJob = require('../../models/B2BJob');
const B2BCompany = require('../../models/B2BCompany');
const B2BWallet = require('../../models/B2BWallet');
const B2BDeductionRule = require('../../models/B2BDeductionRule');
const UploadReport = require('../../models/UploadReport');
const AuditLog = require('../../models/AuditLog');

const b2bBulkJobService = require('../../services/b2bBulkJobService');
const walletLedger = require('../../services/b2bWalletLedger.service');
const { bulkJobQueue } = require('../../services/b2bBulkJobQueueService');

/**
 * GET Dashboard Statistics
 */
const getStats = async (req, res) => {
  try {
    // Use authoritative companyId — works for both Company Admin and sub-users
    const rawId = req.companyId || req.user.companyId || req.user.id;
    const companyId = new mongoose.Types.ObjectId(rawId);

    // 1. Fetch total batch uploads
    const totalUploads = await B2BBatch.countDocuments({ companyId });

    // 2. Fetch jobs uploaded
    const jobsUploaded = await B2BJob.countDocuments({ companyId });

    // 3. Fetch processing batches
    const processingJobs = await B2BBatch.countDocuments({ companyId, status: 'processing' });

    // 4. Aggregate failed rows
    const failedRowsAggregate = await B2BBatch.aggregate([
      { $match: { companyId } },
      { $group: { _id: null, count: { $sum: '$invalidRows' } } }
    ]);
    const failedRows = failedRowsAggregate[0] ? failedRowsAggregate[0].count : 0;

    // 4b. Aggregate total rows
    const totalRowsAggregate = await B2BBatch.aggregate([
      { $match: { companyId } },
      { $group: { _id: null, count: { $sum: '$totalRows' } } }
    ]);
    const totalRows = totalRowsAggregate[0] ? totalRowsAggregate[0].count : 0;

    // 5. Fetch wallet balance from B2BWallet collection (source of truth)
    let wallet = await B2BWallet.findOne({ companyId });
    if (!wallet) {
      wallet = await B2BWallet.create({ companyId, balance: 0 });
    }
    const walletBalance = wallet.balance;

    return res.status(200).json({
      success: true,
      stats: {
        totalUploads,
        jobsUploaded,
        processingJobs,
        failedRows,
        totalRows,
        walletBalance
      }
    });
  } catch (error) {
    console.error('[B2B Bulk Stats Error]:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve bulk stats summary' });
  }
};


/**
 * GET Download Sample layout
 */
const downloadSample = (req, res) => {
  try {
    const buffer = b2bBulkJobService.generateSampleExcelBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=WBI_B2B_Bulk_Jobs_Sample.xlsx');
    res.send(buffer);
  } catch (error) {
    console.error('[B2B Sample Download Error]:', error);
    res.status(500).json({ success: false, message: 'Failed to build sample excel template' });
  }
};

/**
 * GET the upload template's contract: columns, accepted header spellings,
 * limits and the services this company may raise jobs for.
 */
const getTemplateSpec = async (req, res) => {
  try {
    const companyId = req.companyId || req.user.companyId || req.user.id;
    const { getB2BConfig } = require('../../services/b2bPlatformConfig.service');
    const ServiceConfig = require('../../models/ServiceConfig');
    const [cfg, company, services] = await Promise.all([
      getB2BConfig(),
      B2BCompany.findById(companyId).select('allowedServices bulkUploadLimit').lean(),
      ServiceConfig.find({ isActive: { $ne: false } }).select('categoryName categoryCode').sort({ categoryName: 1 }).lean()
    ]);
    const allowedKeys = (company?.allowedServices || []).map((s) => String(s).toUpperCase());
    const catalog = services
      .filter((s) => !allowedKeys.length || allowedKeys.includes(String(s.categoryCode).toUpperCase()))
      .map((s) => ({ name: s.categoryName, key: s.categoryCode }));

    const bulk = cfg.bulkUpload || {};
    return res.status(200).json({
      success: true,
      data: {
        columns: b2bBulkJobService.templateSpec(),
        limits: {
          maxRows: company?.bulkUploadLimit || bulk.maxRows || 1000,
          maxFileSizeMb: bulk.maxFileSizeMb || 10,
          allowedExtensions: bulk.allowedExtensions?.length ? bulk.allowedExtensions : ['.xlsx', '.xls', '.csv'],
          rejectUnknownColumns: Boolean(bulk.rejectUnknownColumns),
          duplicateCheckEnabled: bulk.duplicateCheckEnabled !== false,
          duplicateWindowDays: bulk.duplicateWindowDays ?? 7
        },
        priorities: ['Low', 'Medium', 'High'],
        services: catalog,
        servicesRestricted: allowedKeys.length > 0
      }
    });
  } catch (error) {
    console.error('[B2B Template Spec Error]:', error);
    return res.status(500).json({ success: false, message: 'Failed to load template specification' });
  }
};

/**
 * GET validation problems across every upload of the company (or one batch).
 */
const getValidationErrors = async (req, res) => {
  try {
    const companyId = new mongoose.Types.ObjectId(String(req.companyId || req.user.companyId || req.user.id));
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 25, 1), 200);

    const PROBLEM_STATUSES = ['INVALID', 'DUPLICATE', 'FAILED'];
    const filter = { companyId };
    const status = String(req.query.status || '').toUpperCase();
    filter.status = PROBLEM_STATUSES.includes(status) ? status : { $in: PROBLEM_STATUSES };
    if (req.query.batchId && mongoose.Types.ObjectId.isValid(req.query.batchId)) {
      filter.batchId = new mongoose.Types.ObjectId(req.query.batchId);
    }
    if (req.query.field) filter['validationErrors.field'] = String(req.query.field);

    const [rows, total, byStatus, byField] = await Promise.all([
      B2BBulkUploadRow.find(filter)
        .select('batchId uploadId rowNumber status validationErrors duplicateOf normalized.customerName normalized.city normalized.serviceType createdAt')
        .sort({ createdAt: -1, rowNumber: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      B2BBulkUploadRow.countDocuments(filter),
      B2BBulkUploadRow.aggregate([
        { $match: { companyId, status: { $in: PROBLEM_STATUSES }, ...(filter.batchId ? { batchId: filter.batchId } : {}) } },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),
      B2BBulkUploadRow.aggregate([
        { $match: { companyId, status: { $in: PROBLEM_STATUSES }, ...(filter.batchId ? { batchId: filter.batchId } : {}) } },
        { $unwind: '$validationErrors' },
        { $group: { _id: '$validationErrors.field', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 15 }
      ])
    ]);

    const batchIds = [...new Set(rows.map((r) => String(r.batchId)))];
    const batches = batchIds.length
      ? await B2BBatch.find({ _id: { $in: batchIds }, companyId }).select('batchId fileName createdAt').lean()
      : [];
    const batchMap = new Map(batches.map((b) => [String(b._id), b]));

    return res.status(200).json({
      success: true,
      data: rows.map((r) => ({
        ...r,
        batch: batchMap.get(String(r.batchId)) || null
      })),
      summary: {
        byStatus: Object.fromEntries(byStatus.map((s) => [s._id, s.count])),
        byField: byField.map((f) => ({ field: f._id || 'row', count: f.count }))
      },
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) }
    });
  } catch (error) {
    console.error('[B2B Validation Errors]:', error);
    return res.status(500).json({ success: false, message: 'Failed to load validation errors' });
  }
};

/**
 * POST Excel/CSV File Upload
 */
const uploadFile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Only .xlsx, .xls, .csv allowed' });
    }

    // Limits come from the platform settings, not code.
    const { getB2BConfig } = require('../../services/b2bPlatformConfig.service');
    const bulkCfg = (await getB2BConfig()).bulkUpload || {};
    const ext = path.extname(req.file.originalname || '').toLowerCase();
    const allowed = (bulkCfg.allowedExtensions && bulkCfg.allowedExtensions.length)
      ? bulkCfg.allowedExtensions.map((e) => String(e).toLowerCase())
      : ['.xlsx', '.xls', '.csv'];
    if (!allowed.includes(ext)) {
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(400).json({ success: false, message: `Only ${allowed.join(', ')} files are accepted` });
    }
    const maxBytes = (Number(bulkCfg.maxFileSizeMb) || 10) * 1024 * 1024;
    if (req.file.size > maxBytes) {
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(413).json({ success: false, message: `File is larger than the ${bulkCfg.maxFileSizeMb || 10} MB upload limit` });
    }

    // isApprovedB2B middleware already verified company status — use authoritative companyId from auth
    const companyId = req.companyId || req.user.companyId || req.user.id;

    // Fetch company for batch metadata (no redundant auth check needed)
    const company = await B2BCompany.findById(companyId);
    if (!company) {
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(404).json({ success: false, message: 'Company not found. Please re-login.' });
    }

    // Retrieve active deduction rules
    let rule = await B2BDeductionRule.findOne({ companyId, isActive: true });
    if (!rule) {
      rule = await B2BDeductionRule.create({ companyId, perJobCharge: 12, gstPercent: 18, isActive: true });
    }

    // Get current wallet balance
    let wallet = await B2BWallet.findOne({ companyId });
    if (!wallet) {
      wallet = await B2BWallet.create({ companyId, balance: 0 });
    }

    // Quick validation to ensure the spreadsheet is readable BEFORE creating a batch
    try {
      if (!XLSX) throw new Error('Missing xlsx module');
      const workbook = XLSX.readFile(req.file.path);
      if (!workbook || workbook.SheetNames.length === 0) {
        throw new Error('Empty or invalid workbook');
      }
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const previewRows = XLSX.utils.sheet_to_json(firstSheet, { defval: null });
      if (!previewRows || previewRows.length === 0) {
        throw new Error('The uploaded file is empty');
      }
    } catch (err) {
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(400).json({
        success: false,
        message: 'Unable to read the spreadsheet. Please upload a valid .xlsx, .xls, or .csv file using the sample template.'
      });
    }

    const batchId = `BATCH-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

    // Create Batch Metadata in DB
    const batch = await B2BBatch.create({
      companyId,
      batchId,
      fileName: req.file.originalname,
      fileUrl: req.file.path,
      status: 'draft',
      totalRows: 0,
      walletBalanceAtUpload: wallet.balance,
      perJobCharge: rule.perJobCharge,
      createdBy: companyId,
      uploadedBy: {
        userId: req.user?._id || req.user?.id || companyId,
        role: req.user?.isCompanyLogin === false ? (req.user?.accessRole || 'B2B_USER') : 'COMPANY_ADMIN',
        name: req.user?.fullName || req.user?.name || req.user?.companyName || ''
      }
    });

    // Log Action
    await AuditLog.create({
      actionType: 'B2B_BULK_UPLOAD',
      actorId: companyId,
      actorRole: 'company',
      targetId: batch._id,
      targetType: 'B2BBatch',
      changes: { fileName: req.file.originalname, status: 'uploaded' }
    });

    // Enqueue Validation Job in BullMQ
    await bulkJobQueue.add('validateBatch', { batchId: batch._id.toString() });

    return res.status(201).json({
      success: true,
      message: 'File uploaded. Validation queue initiated.',
      batch: {
        id: batch._id,
        batchId: batch.batchId,
        fileName: batch.fileName,
        status: 'validating'
      }
    });
  } catch (error) {
    console.error('[B2B Bulk Upload Error]:', error);
    if (req.file?.path && fs.existsSync(req.file.path)) {
      try { fs.unlinkSync(req.file.path); } catch (_) { /* ignore */ }
    }
    res.status(500).json({ success: false, message: 'Failed to process spreadsheet upload' });
  }
};

/**
 * GET Upload History
 */
const getHistory = async (req, res) => {
  try {
    const companyId = req.companyId || req.user.companyId || req.user.id;
    const { status, search, page = 1, limit = 10, startDate, endDate, minRows, maxRows, service } = req.query;

    const filter = { companyId };
    if (status) {
      filter.status = status;
    }
    if (search) {
      filter.$or = [
        { fileName: { $regex: search, $options: 'i' } },
        { batchId: { $regex: search, $options: 'i' } }
      ];
    }
    if (startDate && endDate) {
      filter.createdAt = { $gte: new Date(startDate), $lte: new Date(endDate) };
    }
    if (minRows || maxRows) {
      filter.totalRows = {};
      if (minRows) filter.totalRows.$gte = parseInt(minRows, 10);
      if (maxRows) filter.totalRows.$lte = parseInt(maxRows, 10);
    }
    if (service) {
      filter.serviceSummary = { $in: [service] };
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skipNum = (pageNum - 1) * limitNum;

    const batches = await B2BBatch.find(filter)
      .sort({ createdAt: -1 })
      .skip(skipNum)
      .limit(limitNum);

    const total = await B2BBatch.countDocuments(filter);

    return res.status(200).json({
      success: true,
      // Server file paths never leave the API
      batches: batches.map((d) => { const { fileUrl, ...b } = d.toObject ? d.toObject() : d; return b; }),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    console.error('[B2B History Error]:', error);
    res.status(500).json({ success: false, message: 'Failed to query batch upload history' });
  }
};

/**
 * GET Batch Details
 */
const getBatchDetails = async (req, res) => {
  try {
    const companyId = req.companyId || req.user.companyId || req.user.id;
    const batch = await B2BBatch.findOne({ _id: req.params.batchId, companyId });

    if (!batch) {
      return res.status(404).json({ success: false, message: 'Batch not found or unauthorized access' });
    }

    // What the company approves before anything is dispatched: the counts, the
    // price, and whether the wallet can cover it.
    const balance = await walletLedger.getBalance(companyId);
    const required = parseFloat(Number(batch.estimatedCost || 0).toFixed(2));
    const statusCounts = await B2BBulkUploadRow.aggregate([
      { $match: { batchId: batch._id } },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);
    const counts = statusCounts.reduce((acc, r) => ({ ...acc, [r._id]: r.count }), {});

    return res.status(200).json({
      success: true,
      batch: (({ fileUrl, ...b }) => b)(batch.toObject ? batch.toObject() : batch),
      preview: {
        totalRows: batch.totalRows,
        validRows: batch.validRows,
        invalidRows: batch.invalidRows,
        duplicateRows: batch.duplicates,
        createdJobs: batch.createdJobsCount,
        failedJobs: batch.failedJobs,
        rowStatusCounts: counts,
        unknownColumns: batch.unknownColumns || [],
        totalCost: required,
        perJobCharge: batch.perJobCharge,
        pricingBreakdown: batch.pricingBreakdown,
        paymentStatus: batch.paymentStatus,
        processingStatus: batch.processingStatus,
        wallet: {
          available: balance.available,
          reserved: balance.reserved,
          creditLimit: balance.creditLimit,
          shortfall: parseFloat(Math.max(0, required - balance.spendable).toFixed(2))
        }
      }
    });
  } catch (error) {
    console.error('[B2B Details Error]:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch batch metrics' });
  }
};

/**
 * GET Routing breakdown for a batch — where every created job went, live:
 * per vendor, freelancers, unassigned (with reasons) and still routing.
 */
const getRoutingSummary = async (req, res) => {
  try {
    const companyId = req.companyId || req.user.companyId || req.user.id;
    const batch = await B2BBatch.findOne({ _id: req.params.batchId, companyId })
      .select('batchId status totalRows validRows invalidRows duplicates createdJobsCount routingPreview')
      .lean();
    if (!batch) {
      return res.status(404).json({ success: false, message: 'Batch not found or unauthorized access' });
    }

    const B2BJob = require('../../models/B2BJob');
    const Vendor = require('../../models/Vendor');
    const { deriveLifecycleFromLegacy, LIFECYCLE: S } = require('../../services/jobStateMachine');
    const jobs = await B2BJob.find({ batchId: batch._id })
      .select('jobId assignedVendorId assignedTo lifecycleStatus status allocationStage allocationReason notifiedVendors')
      .lean();

    const vendorIds = [...new Set(jobs.map((j) => j.assignedVendorId).filter(Boolean).map(String))];
    const vendors = await Vendor.find({ _id: { $in: vendorIds } }).select('businessName name').lean();
    const vendorName = new Map(vendors.map((v) => [String(v._id), v.businessName || v.name || 'Vendor']));

    const byVendor = new Map();
    const unassigned = [];
    let freelancers = 0;
    let routing = 0;
    let awaitingVendor = 0;
    let cancelled = 0;
    let fundingPending = 0;
    for (const j of jobs) {
      const state = j.lifecycleStatus || deriveLifecycleFromLegacy(j);
      if ([S.CANCELLED].includes(state)) cancelled += 1;
      else if (j.assignedVendorId) {
        const k = String(j.assignedVendorId);
        byVendor.set(k, (byVendor.get(k) || 0) + 1);
      } else if (j.assignedTo) freelancers += 1;
      else if (state === S.UNASSIGNED || state === S.ON_HOLD) unassigned.push({ jobId: String(j._id), jobCode: j.jobId, reason: j.unassignedReason || j.allocationReason || 'No eligible vendor or engineer' });
      else if (j.status === 'pending_wallet') fundingPending += 1;
      else if ((j.notifiedVendors || []).length) awaitingVendor += 1;
      else routing += 1;
    }

    return res.status(200).json({
      success: true,
      data: {
        batchId: batch.batchId,
        status: batch.status,
        rows: { total: batch.totalRows, valid: batch.validRows, invalid: batch.invalidRows, duplicates: batch.duplicates },
        created: batch.createdJobsCount,
        failed: Math.max(0, (batch.validRows || 0) - (batch.createdJobsCount || 0)),
        routingPreview: batch.routingPreview || null,
        routing: {
          vendors: [...byVendor.entries()].map(([vendorId, count]) => ({ vendorId, name: vendorName.get(vendorId) || 'Vendor', count })),
          freelancers,
          awaitingVendorAcceptance: awaitingVendor,
          stillRouting: routing,
          fundingPending,
          cancelled,
          unassigned: { count: unassigned.length, jobs: unassigned.slice(0, 100) }
        }
      }
    });
  } catch (error) {
    console.error('[B2B Routing Summary Error]:', error);
    res.status(500).json({ success: false, message: 'Failed to load routing summary' });
  }
};

/**
 * GET Batch Errors
 */
const getBatchErrors = async (req, res) => {
  try {
    const companyId = req.companyId || req.user.companyId || req.user.id;
    const batch = await B2BBatch.findOne({ _id: req.params.batchId, companyId });

    if (!batch) {
      return res.status(404).json({ success: false, message: 'Batch not found' });
    }

    const { page = 1, limit = 20 } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skipNum = (pageNum - 1) * limitNum;

    const errors = await B2BBatchErrors.find({ batchId: batch._id })
      .sort({ rowNumber: 1 })
      .skip(skipNum)
      .limit(limitNum);

    const total = await B2BBatchErrors.countDocuments({ batchId: batch._id });

    return res.status(200).json({
      success: true,
      errors,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    console.error('[B2B Errors Fetch Error]:', error);
    res.status(500).json({ success: false, message: 'Failed to resolve error grid list' });
  }
};

/**
 * GET the rows of an upload — what was read, what was wrong with it, what it
 * was priced at, and which job it became.
 */
const getBatchRows = async (req, res) => {
  try {
    const companyId = req.companyId || req.user.companyId || req.user.id;
    const batch = await B2BBatch.findOne({ _id: req.params.batchId, companyId }).select('_id batchId');
    if (!batch) {
      return res.status(404).json({ success: false, message: 'Batch not found' });
    }

    const { status, page = 1, limit = 50 } = req.query;
    const filter = { batchId: batch._id };
    if (status) filter.status = String(status).toUpperCase();

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const perPage = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));

    const [rows, total] = await Promise.all([
      B2BBulkUploadRow.find(filter)
        .sort({ rowNumber: 1 })
        .skip((pageNum - 1) * perPage)
        .limit(perPage)
        .lean(),
      B2BBulkUploadRow.countDocuments(filter)
    ]);

    res.status(200).json({
      success: true,
      data: rows.map((r) => ({
        rowNumber: r.rowNumber,
        status: r.status,
        customerName: r.normalized?.customerName || '',
        contactNumber: r.normalized?.contactNumber || '',
        city: r.normalized?.city || '',
        pincode: r.normalized?.pincode || '',
        serviceType: r.normalized?.serviceType || '',
        serviceKey: r.normalized?.serviceKey || '',
        requiredSkill: r.normalized?.requiredSkill || '',
        priority: r.normalized?.priority || '',
        preferredDate: r.normalized?.preferredDate || null,
        price: r.pricing?.totalAmount || 0,
        pricingSource: r.pricing?.source || null,
        errors: r.validationErrors || [],
        duplicateOf: r.duplicateOf || null,
        jobCode: r.jobCode || null,
        failureReason: r.failureReason || null
      })),
      pagination: { page: pageNum, limit: perPage, total, pages: Math.ceil(total / perPage) }
    });
  } catch (error) {
    console.error('[B2B Batch Rows Error]:', error);
    res.status(500).json({ success: false, message: 'Failed to load upload rows' });
  }
};

/**
 * GET Download Error Report Excel
 */
const downloadErrorReport = async (req, res) => {
  try {
    const companyId = req.companyId || req.user.companyId || req.user.id;
    const batch = await B2BBatch.findOne({ _id: req.params.batchId, companyId });

    if (!batch) {
      return res.status(404).json({ success: false, message: 'Batch not found' });
    }

    // Prefer the persisted rows: they carry field, value and suggested fix.
    const rows = await B2BBulkUploadRow.find({
      batchId: batch._id,
      status: { $in: ['INVALID', 'DUPLICATE', 'FAILED'] }
    }).sort({ rowNumber: 1 }).lean();

    let errorRows;
    if (rows.length) {
      errorRows = [];
      for (const row of rows) {
        const problems = (row.validationErrors || []).length
          ? row.validationErrors
          : [{ field: '', value: '', error: row.failureReason || 'Could not be created', suggestedFix: '' }];
        for (const problem of problems) {
          errorRows.push({
            'Row Number': row.rowNumber,
            'Customer Name': row.normalized?.customerName || '',
            'Field': problem.field || '',
            'Invalid Value': problem.value || '',
            'Error': problem.error || '',
            'Suggested Fix': problem.suggestedFix || ''
          });
        }
      }
    } else {
      // Batches uploaded before rows were persisted.
      const errors = await B2BBatchErrors.find({ batchId: batch._id }).sort({ rowNumber: 1 });
      errorRows = errors.map((err) => ({
        'Row Number': err.rowNumber,
        'Customer Name': err.rowData.customerName || '',
        'Field': '',
        'Invalid Value': '',
        'Error': (err.errorList || []).join(' | '),
        'Suggested Fix': ''
      }));
    }

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(errorRows);

    // Auto-fit column widths
    const maxCols = [12, 24, 20, 24, 60, 50];
    ws['!cols'] = maxCols.map(w => ({ wch: w }));

    XLSX.utils.book_append_sheet(wb, ws, 'Validation Failures');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=error_report_${batch.batchId}.xlsx`);
    res.send(buffer);
  } catch (error) {
    console.error('[B2B Error Report Export Error]:', error);
    res.status(500).json({ success: false, message: 'Failed to generate excel error sheet' });
  }
};

/**
 * POST Confirm Upload (Triggers Job Creation queue)
 */
const confirmUpload = async (req, res) => {
  try {
    const companyId = req.companyId || req.user.companyId || req.user.id;
    const batch = await B2BBatch.findOne({ _id: req.params.batchId, companyId });

    if (!batch) {
      return res.status(404).json({ success: false, message: 'Batch record not found' });
    }

    // Accept 'validated' OR 'failed' batches that have valid rows
    // (failed batches may have had non-critical errors like UploadReport creation failing after successful validation)
    const isConfirmable = batch.status === 'validated' || (batch.status === 'failed' && batch.validRows > 0);
    if (!isConfirmable) {
      return res.status(400).json({ 
        success: false, 
        message: `Cannot confirm upload. Batch status is '${batch.status}' with ${batch.validRows || 0} valid rows.`
      });
    }

    if (!batch.validRows || batch.validRows === 0) {
      return res.status(400).json({ success: false, message: 'This batch has 0 valid rows. Cannot create jobs.' });
    }

    // Company existence check only — isApprovedB2B middleware already verified approval status
    const company = await B2BCompany.findById(companyId);
    if (!company) {
      return res.status(404).json({ success: false, message: 'Company not found. Please re-login.' });
    }

    // Money gate: an upload that cannot be paid for creates NOTHING. The
    // company is told what is missing and how to top up, and the batch waits.
    const balance = await walletLedger.getBalance(companyId);
    const required = parseFloat(Number(batch.estimatedCost || 0).toFixed(2));
    const shortfall = parseFloat(Math.max(0, required - balance.spendable).toFixed(2));

    if (shortfall > 0) {
      const details = await walletLedger.shortfallDetails(companyId, required);
      batch.paymentStatus = 'INSUFFICIENT';
      batch.processingStatus = 'AWAITING_PAYMENT';
      batch.totalCost = required;
      await batch.save();

      return res.status(402).json({
        success: false,
        code: 'INSUFFICIENT_FUNDS',
        message: `Top up ₹${shortfall} to dispatch this upload. No jobs have been created.`,
        createdCount: 0,
        walletGate: {
          walletBalance: details.available,
          reservedBalance: balance.reserved,
          creditLimit: details.creditLimit,
          pendingBatchCost: required,
          required: details.required,
          available: details.available,
          shortfall: details.shortfall,
          canActivate: false
        },
        topUpMethods: details.topUpMethods
      });
    }

    // Duplicate confirmation check (checks if batch is already confirmed recently)
    const duplicateBatch = await B2BBatch.findOne({
      companyId,
      status: { $in: ['processing', 'completed'] },
      fileName: batch.fileName,
      totalRows: batch.totalRows,
      _id: { $ne: batch._id },
      createdAt: { $gte: new Date(Date.now() - 30 * 60 * 1000) } // within last 30 minutes
    });

    if (duplicateBatch) {
      return res.status(400).json({
        success: false,
        message: 'A similar batch file is currently processing or completed within the last 30 minutes. To prevent duplication, confirmation is blocked.'
      });
    }

    // Set batch status to validating queue for processing
    batch.status = 'processing';
    await batch.save();

    // Trigger BullMQ job creation worker
    await bulkJobQueue.add('createJobs', { batchId: batch._id.toString() });

    return res.status(200).json({
      success: true,
      message: 'Payment reserved. Job creation started in the background matching queue.',
      status: 'processing',
      isInsufficient: false,
      activationBlocked: false,
      walletGate: {
        walletBalance: balance.available,
        reservedBalance: balance.reserved,
        creditLimit: balance.creditLimit,
        pendingBatchCost: required,
        shortfall: 0,
        canActivate: true
      }
    });
  } catch (error) {
    console.error('[B2B Confirm Error]:', error);
    res.status(500).json({ success: false, message: 'Failed to queue job creation dispatch' });
  }
};

/**
 * DELETE Batch draft/errors
 */
const deleteBatch = async (req, res) => {
  try {
    const companyId = req.companyId || req.user.companyId || req.user.id;
    const batch = await B2BBatch.findOne({ _id: req.params.batchId, companyId });

    if (!batch) {
      return res.status(404).json({ success: false, message: 'Batch not found' });
    }

    if (['processing', 'completed'].includes(batch.status)) {
      return res.status(400).json({ success: false, message: 'Cannot delete a batch that has already been dispatched' });
    }

    // Delete errors from DB
    await B2BBatchErrors.deleteMany({ batchId: batch._id });
    await UploadReport.deleteMany({ batchId: batch._id });

    // Try deleting the local file safely
    try {
      if (fs.existsSync(batch.fileUrl)) {
        fs.unlinkSync(batch.fileUrl);
      }
    } catch (fsErr) {
      console.warn('[FS Warning] File could not be deleted:', fsErr.message);
    }

    await B2BBatch.findByIdAndDelete(batch._id);

    return res.status(200).json({
      success: true,
      message: 'Draft batch aborted and deleted successfully'
    });
  } catch (error) {
    console.error('[B2B Delete Batch Error]:', error);
    res.status(500).json({ success: false, message: 'Failed to purge batch records' });
  }
};

/**
 * GET Download Original Uploaded File
 */
const downloadOriginalFile = async (req, res) => {
  try {
    const companyId = req.companyId || req.user.companyId || req.user.id;
    const batch = await B2BBatch.findOne({ _id: req.params.batchId, companyId });

    if (!batch || !batch.fileUrl || !fs.existsSync(batch.fileUrl)) {
      return res.status(404).json({ success: false, message: 'File not found or no longer exists' });
    }

    res.download(batch.fileUrl, batch.fileName);
  } catch (error) {
    console.error('[B2B Original File Download Error]:', error);
    res.status(500).json({ success: false, message: 'Failed to download original file' });
  }
};

/**
 * POST Retry Failed Batch
 */
const retryBatch = async (req, res) => {
  try {
    const companyId = req.companyId || req.user.companyId || req.user.id;
    const batch = await B2BBatch.findOne({ _id: req.params.batchId, companyId });

    if (!batch) {
      return res.status(404).json({ success: false, message: 'Batch not found' });
    }

    if (batch.status !== 'failed' && batch.status !== 'draft') {
      return res.status(400).json({ success: false, message: `Cannot retry batch with status '${batch.status}'` });
    }

    if (!fs.existsSync(batch.fileUrl)) {
      return res.status(400).json({ success: false, message: 'Original file missing. Please upload a new file.' });
    }

    // Reset counts and status
    batch.status = 'validating';
    batch.totalRows = 0;
    batch.processedRows = 0;
    batch.validRows = 0;
    batch.invalidRows = 0;
    batch.duplicates = 0;
    batch.failureReason = null;
    await batch.save();

    // Clear old errors
    await B2BBatchErrors.deleteMany({ batchId: batch._id });

    // Enqueue for validation again
    await bulkJobQueue.add('validateBatch', { batchId: batch._id.toString() });

    return res.status(200).json({
      success: true,
      message: 'Batch queued for re-validation.',
      status: 'validating'
    });
  } catch (error) {
    console.error('[B2B Retry Batch Error]:', error);
    res.status(500).json({ success: false, message: 'Failed to retry batch' });
  }
};

module.exports = {
  getBatchRows,
  getStats,
  downloadSample,
  getTemplateSpec,
  getValidationErrors,
  uploadFile,
  getHistory,
  getBatchDetails,
  getRoutingSummary,
  getBatchErrors,
  downloadErrorReport,
  confirmUpload,
  deleteBatch,
  downloadOriginalFile,
  retryBatch
};
