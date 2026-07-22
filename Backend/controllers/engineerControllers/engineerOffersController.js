const {
  validateCouponForRegistration,
  getActiveOffersContext,
  REGISTRATION_TYPE
} = require('../../services/engineerCouponService');

exports.getActiveOffers = async (req, res) => {
  try {
    const engineerType = req.query.engineerType || 'freelancer';
    const mobile = req.query.mobile || req.query.phone || null;
    const city = req.query.city || '';
    const state = req.query.state || '';

    const ctx = await getActiveOffersContext({
      engineerType,
      mobile,
      registrationType: REGISTRATION_TYPE,
      location: { city, state },
      serviceCodes: []
    });

    res.status(200).json({
      success: true,
      data: {
        baseAmount: ctx.baseAmount,
        banner: ctx.banner,
        publicCoupons: ctx.publicCoupons,
        autoApplyPreview: ctx.autoApplyPreview,
        couponsAvailable: ctx.couponsAvailable,
        showCouponInput: ctx.showCouponInput && ctx.couponsAvailable
      }
    });
  } catch (error) {
    console.error('[Offers] getActiveOffers', error);
    res.status(500).json({ success: false, message: 'Failed to load offers' });
  }
};

exports.validateCoupon = async (req, res) => {
  try {
    const {
      code,
      engineerType,
      mobile,
      phone,
      city,
      state,
      registrationType
    } = req.body;

    const result = await validateCouponForRegistration({
      code,
      engineerType: engineerType || 'freelancer',
      mobile: mobile || phone,
      registrationType: registrationType || REGISTRATION_TYPE,
      location: { city, state }
    });

    if (!result.ok) {
      return res.status(result.status || 400).json({ success: false, message: result.message });
    }

    res.status(200).json({
      success: true,
      message: 'Coupon applied successfully',
      data: result.data
    });
  } catch (error) {
    console.error('[Offers] validateCoupon', error);
    res.status(500).json({ success: false, message: 'Failed to validate coupon' });
  }
};
