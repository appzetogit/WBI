const mongoose = require('mongoose');
const B2BContract = require('../../models/B2BContract');
const B2BCompany = require('../../models/B2BCompany');
const { logAudit } = require('../../utils/auditLogger');

/** The signed-in actor, whatever the auth middleware called the field. */
const actorId = (req) => req.user?._id || req.user?.id || null;

/**
 * Admin CRUD for B2B contracts.
 *
 * A contract is the top of the pricing chain and the source of a company's
 * allowed services, SLA and payment terms. Only one contract per company is
 * ACTIVE at a time; activating one supersedes the previous.
 */

const isValidId = (id) => mongoose.Types.ObjectId.isValid(String(id || ''));

const WRITABLE = [
  'companyId', 'contractCode', 'title', 'services', 'allowedLocations',
  'pricing', 'sla', 'paymentTerms', 'assignmentRules', 'validFrom', 'validTo',
  'documentUrl', 'notes'
];

const pickWritable = (body = {}) => {
  const out = {};
  for (const key of WRITABLE) {
    if (body[key] !== undefined) out[key] = body[key];
  }
  return out;
};

const validate = (data, { partial = false } = {}) => {
  const errors = [];
  if (!partial || data.companyId !== undefined) {
    if (!isValidId(data.companyId)) errors.push('companyId is required and must be a valid id');
  }
  if (!partial || data.contractCode !== undefined) {
    if (!data.contractCode || !String(data.contractCode).trim()) {
      errors.push('contractCode is required');
    }
  }
  if (!partial || data.validFrom !== undefined) {
    if (!data.validFrom || Number.isNaN(new Date(data.validFrom).getTime())) {
      errors.push('validFrom must be a date');
    }
  }
  if (data.validTo && Number.isNaN(new Date(data.validTo).getTime())) {
    errors.push('validTo must be a date');
  }
  if (data.validFrom && data.validTo && new Date(data.validTo) < new Date(data.validFrom)) {
    errors.push('validTo must be after validFrom');
  }
  (data.pricing || []).forEach((entry, i) => {
    if (!entry.serviceKey || !String(entry.serviceKey).trim()) {
      errors.push(`pricing[${i}].serviceKey is required — contracts price on service keys`);
    }
    if (!Number.isFinite(Number(entry.baseAmount)) || Number(entry.baseAmount) < 0) {
      errors.push(`pricing[${i}].baseAmount must be a number >= 0`);
    }
  });
  return errors;
};

/** GET /api/admin/b2b-contracts */
exports.listContracts = async (req, res) => {
  try {
    const { companyId, status, page = 1, limit = 20, search } = req.query;
    const filter = {};
    if (companyId && isValidId(companyId)) filter.companyId = companyId;
    if (status) filter.status = String(status).toUpperCase();
    if (search) filter.contractCode = { $regex: String(search).trim(), $options: 'i' };

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const perPage = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

    const [rows, total] = await Promise.all([
      B2BContract.find(filter)
        .populate('companyId', 'companyName email accountStatus')
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * perPage)
        .limit(perPage)
        .lean(),
      B2BContract.countDocuments(filter)
    ]);

    const now = new Date();
    res.status(200).json({
      success: true,
      data: rows.map((c) => ({
        ...c,
        company: c.companyId,
        companyId: c.companyId?._id || c.companyId,
        /** ACTIVE and inside its dates — what pricing actually consults. */
        inForce:
          c.status === 'ACTIVE'
          && (!c.validFrom || new Date(c.validFrom) <= now)
          && (!c.validTo || new Date(c.validTo) >= now),
        serviceCount: (c.services || []).length,
        pricedServices: (c.pricing || []).length
      })),
      pagination: { page: pageNum, limit: perPage, total, pages: Math.ceil(total / perPage) }
    });
  } catch (error) {
    console.error('[Admin Contracts] list error:', error);
    res.status(500).json({ success: false, message: 'Failed to list contracts' });
  }
};

/** GET /api/admin/b2b-contracts/:id */
exports.getContract = async (req, res) => {
  try {
    const contract = await B2BContract.findById(req.params.id)
      .populate('companyId', 'companyName email accountStatus pricingProfile slaProfile')
      .lean();
    if (!contract) return res.status(404).json({ success: false, message: 'Contract not found' });
    res.status(200).json({ success: true, data: contract });
  } catch (error) {
    console.error('[Admin Contracts] get error:', error);
    res.status(500).json({ success: false, message: 'Failed to load contract' });
  }
};

/** POST /api/admin/b2b-contracts */
exports.createContract = async (req, res) => {
  try {
    const data = pickWritable(req.body);
    const errors = validate(data);
    if (errors.length) return res.status(400).json({ success: false, message: errors.join('; '), errors });

    const company = await B2BCompany.findById(data.companyId).select('_id companyName').lean();
    if (!company) return res.status(404).json({ success: false, message: 'Company not found' });

    const exists = await B2BContract.findOne({ contractCode: String(data.contractCode).trim() }).lean();
    if (exists) return res.status(409).json({ success: false, message: 'That contract code already exists' });

    const contract = await B2BContract.create({
      ...data,
      contractCode: String(data.contractCode).trim(),
      createdBy: actorId(req) || null
    });

    await logAudit({
      actionType: 'B2B_CONTRACT_CREATED',
      actorId: actorId(req),
      actorRole: 'admin',
      targetType: 'B2BContract',
      targetId: contract._id,
      newValue: { contractCode: contract.contractCode, companyId: String(contract.companyId) },
      reason: req.body.reason || '',
      req
    });

    res.status(201).json({ success: true, message: 'Contract created', data: contract });
  } catch (error) {
    console.error('[Admin Contracts] create error:', error);
    res.status(500).json({ success: false, message: 'Failed to create contract' });
  }
};

/** PUT /api/admin/b2b-contracts/:id */
exports.updateContract = async (req, res) => {
  try {
    const contract = await B2BContract.findById(req.params.id);
    if (!contract) return res.status(404).json({ success: false, message: 'Contract not found' });

    const data = pickWritable(req.body);
    // The company a contract belongs to is fixed once it exists.
    delete data.companyId;
    const errors = validate({ ...contract.toObject(), ...data }, { partial: true });
    if (errors.length) return res.status(400).json({ success: false, message: errors.join('; '), errors });

    const before = contract.toObject();
    Object.assign(contract, data, { updatedBy: actorId(req) || null });
    await contract.save();

    await logAudit({
      actionType: 'B2B_CONTRACT_UPDATED',
      actorId: actorId(req),
      actorRole: 'admin',
      targetType: 'B2BContract',
      targetId: contract._id,
      oldValue: { pricing: before.pricing, sla: before.sla, paymentTerms: before.paymentTerms },
      newValue: { pricing: contract.pricing, sla: contract.sla, paymentTerms: contract.paymentTerms },
      reason: req.body.reason || '',
      req
    });

    res.status(200).json({ success: true, message: 'Contract updated', data: contract });
  } catch (error) {
    console.error('[Admin Contracts] update error:', error);
    res.status(500).json({ success: false, message: 'Failed to update contract' });
  }
};

/**
 * POST /api/admin/b2b-contracts/:id/status
 * ACTIVE · EXPIRED · TERMINATED · DRAFT. Activating supersedes the company's
 * previous active contract and points the company at this one.
 */
exports.setContractStatus = async (req, res) => {
  try {
    const { status, reason } = req.body || {};
    const next = String(status || '').toUpperCase();
    if (!['DRAFT', 'ACTIVE', 'EXPIRED', 'TERMINATED'].includes(next)) {
      return res.status(400).json({ success: false, message: 'status must be DRAFT, ACTIVE, EXPIRED or TERMINATED' });
    }
    if (next === 'TERMINATED' && !String(reason || '').trim()) {
      return res.status(400).json({ success: false, message: 'A reason is required to terminate a contract' });
    }

    const contract = await B2BContract.findById(req.params.id);
    if (!contract) return res.status(404).json({ success: false, message: 'Contract not found' });

    const from = contract.status;
    if (next === 'ACTIVE') {
      if (!contract.pricing.length) {
        return res.status(400).json({
          success: false,
          message: 'Add at least one priced service before activating this contract'
        });
      }
      await B2BContract.updateMany(
        { companyId: contract.companyId, _id: { $ne: contract._id }, status: 'ACTIVE' },
        { $set: { status: 'EXPIRED', terminationReason: `Superseded by ${contract.contractCode}` } }
      );
    }

    contract.status = next;
    if (next === 'TERMINATED') {
      contract.terminatedAt = new Date();
      contract.terminationReason = String(reason).trim();
    }
    contract.updatedBy = actorId(req) || null;
    await contract.save();

    await B2BCompany.updateOne(
      { _id: contract.companyId },
      { $set: { activeContractId: next === 'ACTIVE' ? contract._id : null } }
    );

    await logAudit({
      actionType: 'B2B_CONTRACT_STATUS_CHANGED',
      actorId: actorId(req),
      actorRole: 'admin',
      targetType: 'B2BContract',
      targetId: contract._id,
      oldValue: { status: from },
      newValue: { status: next },
      reason: reason || '',
      req
    });

    res.status(200).json({ success: true, message: `Contract is now ${next}`, data: contract });
  } catch (error) {
    console.error('[Admin Contracts] status error:', error);
    res.status(500).json({ success: false, message: 'Failed to change contract status' });
  }
};

/** DELETE /api/admin/b2b-contracts/:id — drafts only; live contracts are terminated. */
exports.deleteContract = async (req, res) => {
  try {
    const contract = await B2BContract.findById(req.params.id);
    if (!contract) return res.status(404).json({ success: false, message: 'Contract not found' });
    if (contract.status !== 'DRAFT') {
      return res.status(409).json({
        success: false,
        message: 'Only a draft contract can be deleted; terminate this one instead'
      });
    }
    await contract.deleteOne();

    await logAudit({
      actionType: 'B2B_CONTRACT_DELETED',
      actorId: actorId(req),
      actorRole: 'admin',
      targetType: 'B2BContract',
      targetId: contract._id,
      oldValue: { contractCode: contract.contractCode },
      reason: req.body?.reason || '',
      req
    });

    res.status(200).json({ success: true, message: 'Draft contract deleted' });
  } catch (error) {
    console.error('[Admin Contracts] delete error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete contract' });
  }
};
