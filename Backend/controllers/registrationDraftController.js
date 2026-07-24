const mongoose = require('mongoose');
const RegistrationDraft = require('../models/RegistrationDraft');
const { sanitizeDraftPayload } = require('../utils/kycReverify.util');

function ensureObjectId(id) {
  if (id && mongoose.Types.ObjectId.isValid(id)) return new mongoose.Types.ObjectId(id);
  return new mongoose.Types.ObjectId();
}

/**
 * POST /api/registration-drafts
 * Body: { role, draftKey, phone?, email?, currentStep?, completedSteps?, payload?, entityId? }
 */
exports.upsertDraft = async (req, res) => {
  try {
    const {
      role,
      draftKey,
      phone,
      email,
      currentStep,
      completedSteps,
      payload,
      entityId
    } = req.body;

    if (!role || !['vendor', 'engineer', 'worker', 'b2b'].includes(role)) {
      return res.status(400).json({ success: false, message: 'Invalid role' });
    }
    if (!draftKey || typeof draftKey !== 'string') {
      return res.status(400).json({ success: false, message: 'draftKey is required' });
    }

    let draft = await RegistrationDraft.findOne({ role, draftKey, status: 'draft' });
    const nextEntityId = ensureObjectId(entityId || draft?.entityId);

    if (!draft) {
      draft = await RegistrationDraft.create({
        role,
        draftKey,
        phone: phone || null,
        email: email || null,
        currentStep: currentStep ?? 1,
        completedSteps: Array.isArray(completedSteps) ? completedSteps : [],
        payload: sanitizeDraftPayload(payload || {}),
        entityId: nextEntityId,
        status: 'draft'
      });
    } else {
      if (phone) draft.phone = phone;
      if (email) draft.email = email;
      if (currentStep !== undefined) draft.currentStep = currentStep;
      if (Array.isArray(completedSteps)) draft.completedSteps = completedSteps;
      if (payload && typeof payload === 'object') {
        draft.payload = sanitizeDraftPayload({ ...(draft.payload || {}), ...payload });
      }
      draft.entityId = nextEntityId;
      await draft.save();
    }

    res.json({
      success: true,
      data: {
        draftKey: draft.draftKey,
        role: draft.role,
        entityId: String(draft.entityId),
        currentStep: draft.currentStep,
        completedSteps: draft.completedSteps,
        payload: draft.payload,
        phone: draft.phone,
        email: draft.email,
        updatedAt: draft.updatedAt
      }
    });
  } catch (err) {
    console.error('[registrationDraft] upsert:', err.message);
    res.status(500).json({ success: false, message: err.message || 'Failed to save draft' });
  }
};

/**
 * GET /api/registration-drafts/:draftKey?role=
 */
exports.getDraft = async (req, res) => {
  try {
    const { draftKey } = req.params;
    const { role } = req.query;
    const filter = { draftKey, status: 'draft' };
    if (role) filter.role = role;

    const draft = await RegistrationDraft.findOne(filter).lean();
    if (!draft) {
      return res.status(404).json({ success: false, message: 'Draft not found' });
    }

    res.json({
      success: true,
      data: {
        draftKey: draft.draftKey,
        role: draft.role,
        entityId: draft.entityId ? String(draft.entityId) : null,
        currentStep: draft.currentStep,
        completedSteps: draft.completedSteps || [],
        payload: draft.payload || {},
        phone: draft.phone,
        email: draft.email,
        updatedAt: draft.updatedAt
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * GET /api/registration-drafts/by-phone?role=&phone=
 */
exports.getDraftByPhone = async (req, res) => {
  try {
    const { role, phone } = req.query;
    if (!role || !phone) {
      return res.status(400).json({ success: false, message: 'role and phone are required' });
    }
    const cleaned = String(phone).replace(/\D/g, '').slice(-10);
    const draft = await RegistrationDraft.findOne({
      role,
      status: 'draft',
      phone: { $in: [cleaned, phone, `91${cleaned}`] }
    })
      .sort({ updatedAt: -1 })
      .lean();

    if (!draft) {
      return res.status(404).json({ success: false, message: 'No draft for this phone' });
    }

    res.json({
      success: true,
      data: {
        draftKey: draft.draftKey,
        role: draft.role,
        entityId: draft.entityId ? String(draft.entityId) : null,
        currentStep: draft.currentStep,
        completedSteps: draft.completedSteps || [],
        payload: draft.payload || {},
        phone: draft.phone,
        email: draft.email,
        updatedAt: draft.updatedAt
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * DELETE /api/registration-drafts/:draftKey?role=
 */
exports.deleteDraft = async (req, res) => {
  try {
    const { draftKey } = req.params;
    const { role } = req.query;
    const filter = { draftKey };
    if (role) filter.role = role;

    await RegistrationDraft.updateMany(filter, { $set: { status: 'submitted' } });
    res.json({ success: true, message: 'Draft cleared' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
