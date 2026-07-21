const Vendor = require('../models/Vendor');
const { VENDOR_STATUS } = require('../utils/constants');

function generateKitWaybill(vendorId) {
  const tail = String(vendorId).slice(-5).toUpperCase().replace(/[^A-Z0-9]/g, '0');
  const year = new Date().getFullYear().toString().slice(-2);
  return `WBI-LOG-${year}${tail}`;
}

function logisticsLabel(kitDispatchStatus) {
  const map = {
    pending: { label: 'Awaiting dispatch', tone: 'amber' },
    dispatched: { label: 'In transit', tone: 'emerald' },
    delivered: { label: 'Delivered', tone: 'emerald' }
  };
  return map[kitDispatchStatus] || { label: 'Unknown', tone: 'slate' };
}

/**
 * When KYC, bank, and induction are complete, operational audit is satisfied for self-serve onboarding.
 */
function syncOperationalAudit(vendor) {
  const stepsComplete =
    vendor.kycStatus === 'verified' &&
    vendor.bankStatus === 'verified' &&
    vendor.inductionStatus === 'completed';

  if (stepsComplete && vendor.operationalAuditStatus !== 'approved') {
    vendor.operationalAuditStatus = 'approved';
    vendor.operationalAuditAt = new Date();
  }
}

function deriveActiveStep(vendor) {
  if (vendor.approvalStatus === VENDOR_STATUS.APPROVED) return 5;
  if (vendor.kycStatus !== 'verified') return 2;
  if (vendor.bankStatus !== 'verified') return 3;
  if (vendor.inductionStatus !== 'completed') return 4;
  return 5;
}

function buildOnboardingStatus(vendor) {
  syncOperationalAudit(vendor);

  const activeStep = deriveActiveStep(vendor);
  const logistics = logisticsLabel(vendor.kitDispatchStatus);
  const provisioning = vendor.workspaceProvisioning || { status: 'idle' };

  const canActivate =
    vendor.approvalStatus !== VENDOR_STATUS.APPROVED &&
    vendor.kycStatus === 'verified' &&
    vendor.bankStatus === 'verified' &&
    vendor.inductionStatus === 'completed' &&
    vendor.operationalAuditStatus === 'approved' &&
    provisioning.status !== 'in_progress';

  return {
    id: vendor._id,
    _id: vendor._id,
    name: vendor.name,
    businessName: vendor.businessName,
    email: vendor.email,
    phone: vendor.phone,
    kycStatus: vendor.kycStatus,
    bankStatus: vendor.bankStatus,
    inductionStatus: vendor.inductionStatus,
    operationalAuditStatus: vendor.operationalAuditStatus || 'pending',
    approvalStatus: vendor.approvalStatus,
    kitDispatchStatus: vendor.kitDispatchStatus,
    kitWaybill: vendor.kitWaybill || null,
    logistics: {
      title: 'Standardized Uniform & Toolkit',
      waybill: vendor.kitWaybill || null,
      status: vendor.kitDispatchStatus,
      label: logistics.label,
      tone: logistics.tone
    },
    workspaceProvisioning: {
      status: provisioning.status || 'idle',
      startedAt: provisioning.startedAt || null,
      completedAt: provisioning.completedAt || null,
      error: provisioning.error || null
    },
    activeStep,
    canActivate,
    allAuditsPassed: vendor.operationalAuditStatus === 'approved',
    isActivated: vendor.approvalStatus === VENDOR_STATUS.APPROVED,
    uniqueCompanyCode: vendor.uniqueCompanyCode || null
  };
}

function emitOnboardingStatus(vendorId, payload) {
  try {
    const { getIO } = require('../sockets');
    const io = getIO();
    if (!io) return;
    const id = String(vendorId);
    const eventPayload = { ...payload, updatedAt: new Date().toISOString() };
    for (const room of [`vendor:${id}`, `vendor_${id}`]) {
      io.to(room).emit('onboarding:status_updated', eventPayload);
    }
  } catch (_) {
    /* non-blocking */
  }
}

async function persistAndEmit(vendor) {
  syncOperationalAudit(vendor);
  await vendor.save();
  const payload = buildOnboardingStatus(vendor);
  emitOnboardingStatus(vendor._id, payload);
  return payload;
}

module.exports = {
  generateKitWaybill,
  buildOnboardingStatus,
  syncOperationalAudit,
  emitOnboardingStatus,
  persistAndEmit,
  deriveActiveStep
};
