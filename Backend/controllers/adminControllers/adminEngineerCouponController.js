const EngineerCoupon = require('../../models/EngineerCoupon');
const EngineerCouponRedemption = require('../../models/EngineerCouponRedemption');
const EngineerOfferBanner = require('../../models/EngineerOfferBanner');

const sanitizeCouponBody = (body, adminId) => {
  const payload = { ...body };
  if (payload.code) payload.code = String(payload.code).toUpperCase().trim();
  if (adminId) payload.createdBy = adminId;
  return payload;
};

exports.listCoupons = async (req, res) => {
  try {
    const coupons = await EngineerCoupon.find().sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: coupons });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Failed to fetch coupons' });
  }
};

exports.createCoupon = async (req, res) => {
  try {
    const coupon = await EngineerCoupon.create(sanitizeCouponBody(req.body, req.user?._id));
    res.status(201).json({ success: true, data: coupon });
  } catch (e) {
    if (e.code === 11000) return res.status(400).json({ success: false, message: 'Coupon code already exists' });
    res.status(500).json({ success: false, message: e.message || 'Failed to create coupon' });
  }
};

exports.updateCoupon = async (req, res) => {
  try {
    const coupon = await EngineerCoupon.findByIdAndUpdate(
      req.params.id,
      sanitizeCouponBody(req.body),
      { new: true, runValidators: true }
    );
    if (!coupon) return res.status(404).json({ success: false, message: 'Coupon not found' });
    res.json({ success: true, data: coupon });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Failed to update coupon' });
  }
};

exports.deleteCoupon = async (req, res) => {
  try {
    await EngineerCoupon.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Coupon deleted' });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Failed to delete coupon' });
  }
};

exports.toggleCoupon = async (req, res) => {
  try {
    const coupon = await EngineerCoupon.findById(req.params.id);
    if (!coupon) return res.status(404).json({ success: false, message: 'Coupon not found' });
    coupon.isActive = !coupon.isActive;
    await coupon.save();
    res.json({ success: true, data: coupon });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Failed to toggle coupon' });
  }
};

exports.listBanners = async (req, res) => {
  try {
    const banners = await EngineerOfferBanner.find().sort({ priority: -1, updatedAt: -1 });
    res.json({ success: true, data: banners });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Failed to fetch banners' });
  }
};

exports.createBanner = async (req, res) => {
  try {
    const banner = await EngineerOfferBanner.create(req.body);
    res.status(201).json({ success: true, data: banner });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Failed to create banner' });
  }
};

exports.updateBanner = async (req, res) => {
  try {
    const banner = await EngineerOfferBanner.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!banner) return res.status(404).json({ success: false, message: 'Banner not found' });
    res.json({ success: true, data: banner });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Failed to update banner' });
  }
};

exports.deleteBanner = async (req, res) => {
  try {
    await EngineerOfferBanner.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Banner deleted' });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Failed to delete banner' });
  }
};

exports.getAnalytics = async (req, res) => {
  try {
    const [totals, byCoupon, recent] = await Promise.all([
      EngineerCouponRedemption.aggregate([
        { $match: { status: 'applied' } },
        {
          $group: {
            _id: null,
            redemptions: { $sum: 1 },
            totalDiscount: { $sum: '$discountAmount' },
            totalRevenue: { $sum: '$finalAmount' }
          }
        }
      ]),
      EngineerCouponRedemption.aggregate([
        { $match: { status: 'applied' } },
        {
          $group: {
            _id: '$code',
            count: { $sum: 1 },
            discount: { $sum: '$discountAmount' }
          }
        },
        { $sort: { count: -1 } },
        { $limit: 20 }
      ]),
      EngineerCouponRedemption.find({ status: 'applied' })
        .sort({ createdAt: -1 })
        .limit(50)
        .lean()
    ]);

    res.json({
      success: true,
      data: {
        summary: totals[0] || { redemptions: 0, totalDiscount: 0, totalRevenue: 0 },
        byCoupon,
        recent
      }
    });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Failed to load analytics' });
  }
};

exports.exportRedemptions = async (req, res) => {
  try {
    const rows = await EngineerCouponRedemption.find({ status: 'applied' })
      .sort({ createdAt: -1 })
      .limit(5000)
      .lean();

    const header = 'date,code,mobile,engineerType,originalAmount,discountAmount,finalAmount,orderId,paymentId\n';
    const csv =
      header +
      rows
        .map((r) =>
          [
            r.createdAt?.toISOString?.() || '',
            r.code,
            r.mobile || '',
            r.engineerType || '',
            r.originalAmount,
            r.discountAmount,
            r.finalAmount,
            r.razorpayOrderId || '',
            r.razorpayPaymentId || ''
          ].join(',')
        )
        .join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=engineer-coupon-redemptions.csv');
    res.send(csv);
  } catch (e) {
    res.status(500).json({ success: false, message: 'Export failed' });
  }
};
