const mongoose = require('mongoose');
const KYCVerification = require('../models/KYCVerification');
const VerificationDocument = require('../models/VerificationDocument');
const VerificationRequest = require('../models/VerificationRequest');
const VerificationConfig = require('../models/VerificationConfig');
const Engineer = require('../models/Engineer');
const Worker = require('../models/Worker');

const getProfileModel = (role) => (role === 'engineer' ? Engineer : Worker);

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

const readCustomField = (profile, key) => {
  if (!profile) return undefined;
  const cf = profile.customFields;
  if (!cf) return undefined;
  if (typeof cf.get === 'function') return cf.get(key);
  return cf[key];
};

/**
 * Remap KYC + VerificationDocument rows from signup tempEntityId → real profile _id.
 * Also upserts VerificationRequest and hydrates legacy profile document fields.
 */
async function linkKycEntityToProfile({
  role,
  fromEntityId,
  toEntityId,
  session = null
}) {
  if (!role || !fromEntityId || !toEntityId) {
    return { remapped: false, reason: 'missing_ids' };
  }
  if (String(fromEntityId) === String(toEntityId)) {
    return { remapped: false, reason: 'same_id' };
  }
  if (!isValidObjectId(fromEntityId) || !isValidObjectId(toEntityId)) {
    return { remapped: false, reason: 'invalid_id' };
  }

  const fromId = new mongoose.Types.ObjectId(fromEntityId);
  const toId = new mongoose.Types.ObjectId(toEntityId);
  const opts = session ? { session } : {};

  // Move KYC rows (unique on role+entityId+documentType — handle conflicts)
  const kycRows = await KYCVerification.find({ role, entityId: fromId }).session(session || null);
  for (const row of kycRows) {
    const existing = await KYCVerification.findOne({
      role,
      entityId: toId,
      documentType: row.documentType
    }).session(session || null);

    if (existing) {
      const patch = {};
      if ((!existing.fileUrl || existing.fileUrl === 'digilocker-fetch') && row.fileUrl) {
        patch.fileUrl = row.fileUrl;
        patch.fileKey = row.fileKey || row.fileUrl;
      }
      if (!existing.backFileUrl && row.backFileUrl) {
        patch.backFileUrl = row.backFileUrl;
        patch.backFileKey = row.backFileKey || row.backFileUrl;
      }
      if (!existing.documentNumberMasked && row.documentNumberMasked) {
        patch.documentNumberMasked = row.documentNumberMasked;
      }
      if (row.status && existing.status !== 'verified') patch.status = row.status;
      if (row.physicalUploadStatus && row.physicalUploadStatus !== 'not_required') {
        patch.physicalUploadStatus = row.physicalUploadStatus;
      }
      if (Object.keys(patch).length) {
        Object.assign(existing, patch);
        await existing.save(opts);
      }
      await KYCVerification.deleteOne({ _id: row._id }, opts);
    } else {
      row.entityId = toId;
      await row.save(opts);
    }
  }

  // Move VerificationDocument rows (unique ownerId+documentType+side)
  const docs = await VerificationDocument.find({ ownerId: fromId, ownerType: role }).session(session || null);
  for (const doc of docs) {
    const side = doc.side || 'single';
    const existing = await VerificationDocument.findOne({
      ownerId: toId,
      documentType: doc.documentType,
      side
    }).session(session || null);

    if (existing) {
      if (!existing.fileUrl && doc.fileUrl) {
        existing.fileUrl = doc.fileUrl;
        existing.fileKey = doc.fileKey || doc.fileUrl;
        await existing.save(opts);
      }
      await VerificationDocument.deleteOne({ _id: doc._id }, opts);
    } else {
      doc.ownerId = toId;
      await doc.save(opts);
    }
  }

  await hydrateProfileDocuments(role, toId, { session });
  const verificationRequest = await ensureVerificationRequest(role, toId, { session });

  return {
    remapped: true,
    fromEntityId: String(fromId),
    toEntityId: String(toId),
    verificationRequestId: verificationRequest?._id || null
  };
}

async function hydrateProfileDocuments(role, entityId, { session = null } = {}) {
  const ProfileModel = getProfileModel(role);
  const opts = session ? { session } : {};
  const profile = await ProfileModel.findById(entityId).session(session || null);
  if (!profile) return null;

  const kycRows = await KYCVerification.find({ role, entityId }).session(session || null);
  const update = {};

  for (const row of kycRows) {
    const front = row.fileUrl && row.fileUrl !== 'digilocker-fetch' ? row.fileUrl : null;
    const back = row.backFileUrl && row.backFileUrl !== 'digilocker-fetch' ? row.backFileUrl : null;

    if (row.documentType === 'aadhaar') {
      if (front) {
        update['aadhar.document'] = front;
        update['documents.aadhaar'] = front;
        update['documents.aadhaarFrontUrl'] = front;
      }
      if (back) {
        update['aadhar.backDocument'] = back;
        update['documents.aadhaarBackUrl'] = back;
      }
      if (row.documentNumberMasked && !profile.aadhar?.number) {
        update['aadhar.number'] = row.documentNumberMasked;
      }
    }

    if (row.documentType === 'pan') {
      if (front) {
        update['pan.document'] = front;
        update['documents.pan'] = front;
      }
      if (row.documentNumberMasked && !profile.pan?.number) {
        update['pan.number'] = row.documentNumberMasked;
      }
    }

    if (row.documentType === 'selfie' && front && role === 'engineer' && !profile.selfieUrl) {
      update.selfieUrl = front;
    }

    if ((row.documentType === 'license' || row.documentType === 'driving_license') && front) {
      if (!profile.licenseUrl && !profile.drivingLicenseUrl) {
        update.licenseUrl = front;
        update.drivingLicenseUrl = front;
      }
    }

    if (row.documentType === 'education_certificate' && front && !profile.educationCertificateUrl) {
      update.educationCertificateUrl = front;
    }
  }

  // Prefer numbers from customFields if present
  const aadhaarFromCustom = readCustomField(profile, 'aadhaarNumber') || readCustomField(profile, 'aadharNumber');
  const panFromCustom = readCustomField(profile, 'panNumber');
  if (aadhaarFromCustom && !profile.aadhar?.number) update['aadhar.number'] = aadhaarFromCustom;
  if (panFromCustom && !profile.pan?.number) update['pan.number'] = panFromCustom;

  if (Object.keys(update).length) {
    await ProfileModel.findByIdAndUpdate(entityId, { $set: update }, opts);
  }

  return update;
}

async function ensureVerificationRequest(role, ownerId, { session = null } = {}) {
  const opts = session ? { session } : {};
  let request = await VerificationRequest.findOne({ ownerId, ownerType: role }).session(session || null);

  const config = await VerificationConfig.findOne({ roleType: role }).lean();
  const requiredDocuments = config?.requiredDocuments || ['aadhaar', 'pan', 'selfie'];

  const docs = await VerificationDocument.find({ ownerId, ownerType: role }).session(session || null);
  const kycRows = await KYCVerification.find({ role, entityId: ownerId }).session(session || null);

  const submitted = new Set([
    ...docs.map((d) => d.documentType),
    ...kycRows.filter((k) => k.fileUrl || k.status === 'verified').map((k) => k.documentType)
  ]);

  const verified = new Set(
    [
      ...docs.filter((d) => d.status === 'verified').map((d) => d.documentType),
      ...kycRows.filter((k) => k.status === 'verified').map((k) => k.documentType)
    ]
  );

  const payload = {
    requiredDocuments,
    submittedDocuments: [...submitted],
    verifiedDocuments: [...verified],
    overallStatus: verified.size === 0
      ? (submitted.size ? 'pending_verification' : 'not_submitted')
      : (requiredDocuments.every((d) => verified.has(d)) ? 'verified' : 'partially_verified'),
    adminReviewStatus: 'pending'
  };

  if (!request) {
    const created = await VerificationRequest.create([{
      ownerId,
      ownerType: role,
      ...payload
    }], opts);
    request = created[0];
  } else {
    Object.assign(request, payload);
    // Keep existing verified/rejected lists if admin already reviewed
    if (!request.verifiedDocuments?.length) request.verifiedDocuments = [...verified];
    if (!request.submittedDocuments?.length) request.submittedDocuments = [...submitted];
    if (submitted.size && request.overallStatus === 'not_submitted') {
      request.overallStatus = 'pending_verification';
    }
    await request.save(opts);
  }

  return request;
}

/**
 * Resolve signup temp entity id for an already-created profile.
 */
async function resolveTempEntityId(role, profile) {
  if (!profile) return null;

  const fromCustom = readCustomField(profile, 'tempEntityId') || readCustomField(profile, 'kycEntityId');
  if (fromCustom && String(fromCustom) !== String(profile._id) && isValidObjectId(fromCustom)) {
    const orphanCount = await KYCVerification.countDocuments({ role, entityId: fromCustom });
    const orphanDocs = await VerificationDocument.countDocuments({ ownerId: fromCustom, ownerType: role });
    if (orphanCount || orphanDocs) return String(fromCustom);
  }

  // Selfie URL match (when KYC selfie used same cloudinary URL)
  if (profile.selfieUrl) {
    const selfieDoc = await VerificationDocument.findOne({
      ownerType: role,
      documentType: 'selfie',
      fileUrl: profile.selfieUrl,
      ownerId: { $ne: profile._id }
    }).select('ownerId').lean();
    if (selfieDoc?.ownerId) return String(selfieDoc.ownerId);

    const selfieKyc = await KYCVerification.findOne({
      role,
      documentType: 'selfie',
      fileUrl: profile.selfieUrl,
      entityId: { $ne: profile._id }
    }).select('entityId').lean();
    if (selfieKyc?.entityId) return String(selfieKyc.entityId);
  }

  // Time + name heuristic for orphan KYC created during signup window
  if (profile.createdAt && profile.name) {
    const windowStart = new Date(new Date(profile.createdAt).getTime() - 6 * 60 * 60 * 1000);
    const windowEnd = new Date(new Date(profile.createdAt).getTime() + 6 * 60 * 60 * 1000);
    const candidates = await KYCVerification.aggregate([
      {
        $match: {
          role,
          createdAt: { $gte: windowStart, $lte: windowEnd },
          entityId: { $ne: profile._id }
        }
      },
      {
        $group: {
          _id: '$entityId',
          types: { $addToSet: '$documentType' },
          names: { $addToSet: '$verifiedName' },
          extracted: { $addToSet: '$extractedName' },
          hasFile: {
            $max: {
              $cond: [
                { $and: [{ $ne: ['$fileUrl', null] }, { $ne: ['$fileUrl', 'digilocker-fetch'] }] },
                1,
                0
              ]
            }
          }
        }
      }
    ]);

    const ProfileModel = getProfileModel(role);
    const nameNorm = String(profile.name).trim().toLowerCase();

    for (const c of candidates) {
      if (!c._id) continue;
      const taken = await ProfileModel.exists({ _id: c._id });
      if (taken) continue;

      const names = [...(c.names || []), ...(c.extracted || [])]
        .filter(Boolean)
        .map((n) => String(n).trim().toLowerCase());
      const nameHit = names.some((n) => n && (n.includes(nameNorm) || nameNorm.includes(n)));
      const hasIdDocs = (c.types || []).some((t) => ['aadhaar', 'pan'].includes(t));

      if ((nameHit || c.hasFile) && hasIdDocs) {
        return String(c._id);
      }
    }
  }

  return null;
}

/**
 * Ensure profile KYC docs are linked under the real _id (safe to call on every admin detail fetch).
 */
async function ensureProfileKycLinked(role, profile) {
  if (!profile?._id) return { remapped: false, verificationRequest: null };

  const realId = profile._id;
  let docsCount = await VerificationDocument.countDocuments({ ownerId: realId, ownerType: role });
  let kycCount = await KYCVerification.countDocuments({ role, entityId: realId });

  let remapped = false;
  let fromEntityId = null;

  if (docsCount === 0 && kycCount === 0) {
    fromEntityId = await resolveTempEntityId(role, profile);
    if (fromEntityId) {
      const result = await linkKycEntityToProfile({
        role,
        fromEntityId,
        toEntityId: realId
      });
      remapped = !!result.remapped;
    }
  } else {
    await hydrateProfileDocuments(role, realId);
  }

  const verificationRequest = await ensureVerificationRequest(role, realId);

  // Reload counts after remap
  docsCount = await VerificationDocument.countDocuments({ ownerId: realId, ownerType: role });
  kycCount = await KYCVerification.countDocuments({ role, entityId: realId });

  return {
    remapped,
    fromEntityId,
    docsCount,
    kycCount,
    verificationRequest
  };
}

module.exports = {
  linkKycEntityToProfile,
  hydrateProfileDocuments,
  ensureVerificationRequest,
  resolveTempEntityId,
  ensureProfileKycLinked,
  readCustomField
};
