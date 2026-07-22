const EngineerCoupon = require('../models/EngineerCoupon');
const EngineerCouponRedemption = require('../models/EngineerCouponRedemption');
const EngineerOfferBanner = require('../models/EngineerOfferBanner');
const EngineerRegistrationConfig = require('../models/EngineerRegistrationConfig');

const REGISTRATION_TYPE = 'engineer_joining_fee';

const normalizeList = (arr) =>
  (arr || []).map((s) => String(s).trim().toLowerCase()).filter(Boolean);

const isWithinSchedule = (coupon, now = new Date()) => {
  if (!coupon.isActive) return false;
  if (coupon.validFrom && now < new Date(coupon.validFrom)) return false;
  if (coupon.validTill && now > new Date(coupon.validTill)) return false;
  return true;
};

const matchesUserType = (coupon, engineerType) => {
  const types = coupon.applicableUserTypes?.length
    ? coupon.applicableUserTypes
    : ['freelancer', 'vendor_engineer'];
  if (types.includes('any')) return true;
  return types.includes(engineerType);
};

const matchesRegistrationType = (coupon, registrationType) => {
  const types = coupon.applicableRegistrationTypes?.length
    ? coupon.applicableRegistrationTypes
    : [REGISTRATION_TYPE];
  return types.includes(registrationType);
};

const matchesLocation = (coupon, location = {}) => {
  const allowed = normalizeList(coupon.applicableLocations);
  if (!allowed.length) return true;
  const city = String(location.city || '').toLowerCase();
  const state = String(location.state || '').toLowerCase();
  return allowed.some((loc) => loc === city || loc === state);
};

const matchesServices = (coupon, serviceCodes = []) => {
  const allowed = normalizeList(coupon.applicableServices);
  if (!allowed.length) return true;
  const codes = normalizeList(serviceCodes);
  return codes.some((c) => allowed.includes(c));
};

async function getJoiningFeeBaseAmount() {
  const config = await EngineerRegistrationConfig.findOne().lean();
  return config?.joiningFeeAmount ?? 249;
}

function calculateDiscount(coupon, baseAmount) {
  let discountAmount = 0;
  if (coupon.discountType === 'flat') {
    discountAmount = Number(coupon.discountValue) || 0;
  } else if (coupon.discountType === 'percentage') {
    discountAmount = (baseAmount * Number(coupon.discountValue)) / 100;
    if (coupon.maxDiscount > 0 && discountAmount > coupon.maxDiscount) {
      discountAmount = coupon.maxDiscount;
    }
  }
  if (discountAmount > baseAmount) discountAmount = baseAmount;
  const finalAmount = Math.max(0, baseAmount - discountAmount);
  return { discountAmount, finalAmount };
}

async function countUserRedemptions(couponId, mobile) {
  if (!mobile) return 0;
  const normalized = String(mobile).replace(/\D/g, '').slice(-10);
  return EngineerCouponRedemption.countDocuments({
    couponId,
    mobile: normalized,
    status: { $in: ['applied', 'reserved'] }
  });
}

/**
 * Full server-side validation for engineer joining fee coupons.
 */
async function validateCouponForRegistration({
  code,
  engineerType = 'freelancer',
  mobile = null,
  registrationType = REGISTRATION_TYPE,
  location = {},
  serviceCodes = [],
  baseAmount = null
}) {
  if (!code) {
    return { ok: false, status: 400, message: 'Coupon code is required' };
  }

  const coupon = await EngineerCoupon.findOne({
    code: String(code).toUpperCase().trim()
  });

  if (!coupon) {
    return { ok: false, status: 404, message: 'Invalid or inactive coupon code' };
  }

  if (!isWithinSchedule(coupon)) {
    return { ok: false, status: 400, message: 'Coupon is not active or has expired' };
  }

  if (!matchesUserType(coupon, engineerType)) {
    return { ok: false, status: 400, message: 'Coupon is not valid for this registration type' };
  }

  if (!matchesRegistrationType(coupon, registrationType)) {
    return { ok: false, status: 400, message: 'Coupon is not valid for this registration flow' };
  }

  if (!matchesLocation(coupon, location)) {
    return { ok: false, status: 400, message: 'Coupon is not available in your location' };
  }

  if (!matchesServices(coupon, serviceCodes)) {
    return { ok: false, status: 400, message: 'Coupon is not valid for selected services' };
  }

  const joiningFeeAmount = baseAmount != null ? Number(baseAmount) : await getJoiningFeeBaseAmount();

  if (joiningFeeAmount < (coupon.minAmount || 0)) {
    return {
      ok: false,
      status: 400,
      message: `Coupon requires a minimum registration amount of ₹${coupon.minAmount}`
    };
  }

  if (coupon.usageLimit > 0 && coupon.usedCount >= coupon.usageLimit) {
    return { ok: false, status: 400, message: 'Coupon usage limit reached' };
  }

  const perUserLimit = coupon.perUserLimit > 0 ? coupon.perUserLimit : 1;
  if (mobile) {
    const usedByUser = await countUserRedemptions(coupon._id, mobile);
    if (usedByUser >= perUserLimit) {
      return { ok: false, status: 400, message: 'You have already used this coupon' };
    }
  }

  const { discountAmount, finalAmount } = calculateDiscount(coupon, joiningFeeAmount);

  return {
    ok: true,
    coupon,
    data: {
      couponId: coupon._id,
      originalAmount: joiningFeeAmount,
      discountAmount,
      finalAmount,
      couponCode: coupon.code,
      couponTitle: coupon.title || coupon.code,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue
    }
  };
}

async function getActiveBanner(placement = 'engineer_registration_payment') {
  const now = new Date();
  return EngineerOfferBanner.findOne({
    placement,
    isActive: true,
    validFrom: { $lte: now },
    $or: [{ validTill: null }, { validTill: { $gte: now } }]
  })
    .sort({ priority: -1, updatedAt: -1 })
    .lean();
}

async function listApplicableCoupons(ctx) {
  const now = new Date();
  const coupons = await EngineerCoupon.find({ isActive: true }).lean();
  const applicable = [];
  for (const c of coupons) {
    if (!isWithinSchedule(c, now)) continue;
    if (!matchesUserType(c, ctx.engineerType)) continue;
    if (!matchesRegistrationType(c, ctx.registrationType)) continue;
    if (!matchesLocation(c, ctx.location)) continue;
    if (!matchesServices(c, ctx.serviceCodes)) continue;
    if (c.usageLimit > 0 && c.usedCount >= c.usageLimit) continue;
    if (ctx.mobile && c.perUserLimit > 0) {
      const used = await countUserRedemptions(c._id, ctx.mobile);
      if (used >= c.perUserLimit) continue;
    }
    applicable.push(c);
  }
  return applicable;
}

async function getActiveOffersContext({
  engineerType = 'freelancer',
  mobile = null,
  registrationType = REGISTRATION_TYPE,
  location = {},
  serviceCodes = []
}) {
  const baseAmount = await getJoiningFeeBaseAmount();
  const banner = await getActiveBanner();
  const applicable = await listApplicableCoupons({
    engineerType,
    mobile,
    registrationType,
    location,
    serviceCodes
  });

  const publicCoupons = applicable
    .filter((c) => c.isPublic !== false)
    .map((c) => ({
      code: c.code,
      title: c.title || c.code,
      description: c.description || '',
      discountType: c.discountType,
      discountValue: c.discountValue,
      autoApply: !!c.autoApply
    }));

  const autoCoupon = applicable.find((c) => c.autoApply);
  let autoApplyPreview = null;
  if (autoCoupon) {
    const { discountAmount, finalAmount } = calculateDiscount(autoCoupon, baseAmount);
    autoApplyPreview = {
      couponCode: autoCoupon.code,
      originalAmount: baseAmount,
      discountAmount,
      finalAmount
    };
  }

  const couponsAvailable = applicable.length > 0 || !!banner;

  return {
    baseAmount,
    banner,
    publicCoupons,
    autoApplyPreview,
    couponsAvailable,
    showCouponInput: applicable.length > 0
  };
}

async function recordRedemption({
  coupon,
  mobile,
  email,
  engineerType,
  engineerDraftId,
  originalAmount,
  discountAmount,
  finalAmount,
  razorpayOrderId,
  razorpayPaymentId,
  status = 'applied',
  req,
  skipCounter = false
}) {
  const couponDoc =
    coupon && coupon._id
      ? coupon
      : await EngineerCoupon.findOne({ code: String(coupon).toUpperCase() });
  if (!couponDoc) return null;

  const normalizedMobile = mobile ? String(mobile).replace(/\D/g, '').slice(-10) : null;

  if (razorpayPaymentId) {
    const dup = await EngineerCouponRedemption.findOne({
      razorpayPaymentId,
      status: 'applied'
    });
    if (dup) return dup;
  }

  const redemption = await EngineerCouponRedemption.create({
    couponId: couponDoc._id,
    code: couponDoc.code,
    mobile: normalizedMobile,
    email: email || '',
    engineerType: engineerType || 'freelancer',
    registrationType: REGISTRATION_TYPE,
    engineerDraftId,
    originalAmount,
    discountAmount,
    finalAmount,
    razorpayOrderId,
    razorpayPaymentId,
    status,
    ipAddress: req?.ip,
    userAgent: req?.get?.('User-Agent')
  });

  if (status === 'applied' && !skipCounter) {
    await EngineerCoupon.findByIdAndUpdate(couponDoc._id, { $inc: { usedCount: 1 } });
  }

  return redemption;
}

async function redeemCouponOnPaid(draft, { orderId, paymentId, req } = {}) {
  if (!draft?.couponCode) return null;
  const coupon = await EngineerCoupon.findOne({
    code: String(draft.couponCode).toUpperCase(),
    isActive: true
  });
  if (!coupon) return null;

  const updated = await EngineerCoupon.findOneAndUpdate(
    {
      _id: coupon._id,
      $or: [{ usageLimit: 0 }, { $expr: { $lt: ['$usedCount', '$usageLimit'] } }]
    },
    { $inc: { usedCount: 1 } },
    { new: true }
  );
  if (!updated) return null;

  return recordRedemption({
    coupon: updated,
    mobile: draft.mobile,
    email: draft.email,
    engineerType: draft.engineerType,
    engineerDraftId: draft._id,
    originalAmount: draft.joiningFeeAmount,
    discountAmount: draft.joiningFeeDiscount,
    finalAmount: draft.joiningFeeFinalAmount,
    razorpayOrderId: orderId,
    razorpayPaymentId: paymentId,
    status: 'applied',
    req,
    skipCounter: true
  });
}

module.exports = {
  REGISTRATION_TYPE,
  getJoiningFeeBaseAmount,
  calculateDiscount,
  validateCouponForRegistration,
  getActiveOffersContext,
  getActiveBanner,
  recordRedemption,
  redeemCouponOnPaid,
  countUserRedemptions
};
