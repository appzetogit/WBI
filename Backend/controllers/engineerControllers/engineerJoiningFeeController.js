const EngineerCoupon = require('../../models/EngineerCoupon');
const EngineerRegistrationConfig = require('../../models/EngineerRegistrationConfig');
const razorpayService = require('../../services/razorpayService');

/**
 * Validate a coupon code during registration
 */
const validateCoupon = async (req, res) => {
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({ success: false, message: 'Coupon code is required' });
    }

    const coupon = await EngineerCoupon.findOne({ code: code.toUpperCase(), isActive: true });
    
    if (!coupon) {
      return res.status(404).json({ success: false, message: 'Invalid or inactive coupon code' });
    }

    // Check validity dates
    const now = new Date();
    if (coupon.validFrom && now < coupon.validFrom) {
      return res.status(400).json({ success: false, message: 'Coupon is not yet valid' });
    }
    if (coupon.validTill && now > coupon.validTill) {
      return res.status(400).json({ success: false, message: 'Coupon has expired' });
    }

    // Check usage limit
    if (coupon.usageLimit > 0 && coupon.usedCount >= coupon.usageLimit) {
      return res.status(400).json({ success: false, message: 'Coupon usage limit reached' });
    }

    // Calculate discount against current joining fee
    let config = await EngineerRegistrationConfig.findOne();
    const joiningFeeAmount = config?.joiningFeeAmount || 249;
    
    // Check minimum amount if applicable
    if (joiningFeeAmount < coupon.minAmount) {
      return res.status(400).json({ success: false, message: `Coupon requires a minimum amount of ${coupon.minAmount}` });
    }

    let discountAmount = 0;
    if (coupon.discountType === 'flat') {
      discountAmount = coupon.discountValue;
    } else if (coupon.discountType === 'percentage') {
      discountAmount = (joiningFeeAmount * coupon.discountValue) / 100;
      if (coupon.maxDiscount > 0 && discountAmount > coupon.maxDiscount) {
        discountAmount = coupon.maxDiscount;
      }
    }

    // Cap discount to total amount
    if (discountAmount > joiningFeeAmount) {
      discountAmount = joiningFeeAmount;
    }

    const finalAmount = joiningFeeAmount - discountAmount;

    res.status(200).json({
      success: true,
      message: 'Coupon applied successfully',
      data: {
        originalAmount: joiningFeeAmount,
        discountAmount,
        finalAmount,
        couponCode: coupon.code
      }
    });

  } catch (error) {
    console.error('Validate coupon error:', error);
    res.status(500).json({ success: false, message: 'Failed to validate coupon' });
  }
};

const EngineerRegistrationDraft = require('../../models/EngineerRegistrationDraft');
const EngineerPayment = require('../../models/EngineerPayment');

/**
 * Create a Razorpay order for the joining fee
 */
const createJoiningFeeOrder = async (req, res) => {
  try {
    const { couponCode, name, phone, mobile, email, engineerType, vendorCode } = req.body;
    let { registrationDraftId } = req.body;
    const finalMobile = mobile || phone || '';
    const finalName = name || 'User';

    if (!finalMobile) {
      return res.status(400).json({ success: false, message: 'Mobile number is required' });
    }

    let config = await EngineerRegistrationConfig.findOne();
    if (config && config.joiningFeeEnabled === false) {
      return res.status(400).json({ success: false, message: 'Joining fee is currently disabled' });
    }

    const type = engineerType || 'freelancer';

    // 1. Create or fetch Draft
    let draft;
    if (registrationDraftId) {
      draft = await EngineerRegistrationDraft.findById(registrationDraftId);
      if (!draft) return res.status(404).json({ success: false, message: 'Draft not found' });
    } else {
      draft = await EngineerRegistrationDraft.create({
        engineerType: type,
        fullName: finalName,
        mobile: finalMobile,
        email: email || '',
        vendorCode: vendorCode || ''
      });
      registrationDraftId = draft._id;
    }

    // 2. Check if fee is skipped based on Admin config and engineer type
    let skipFee = false;
    if (type === 'freelancer' && config?.freelancerJoiningFeeRequired === false) {
      skipFee = true;
    } else if (type === 'vendor_engineer' && config?.vendorEngineerJoiningFeeRequired === 'skipped') {
      skipFee = true;
    }

    let joiningFeeAmount = config?.joiningFeeAmount || 249;
    let discountAmount = 0;
    let finalAmount = skipFee ? 0 : joiningFeeAmount;

    // Recalculate if coupon is provided and fee not skipped
    if (couponCode && !skipFee) {
      const coupon = await EngineerCoupon.findOne({ code: couponCode.toUpperCase(), isActive: true });
      if (coupon) {
        const now = new Date();
        const isValid = (!coupon.validFrom || now >= coupon.validFrom) &&
                        (!coupon.validTill || now <= coupon.validTill) &&
                        (coupon.usageLimit === 0 || coupon.usedCount < coupon.usageLimit);
        
        if (isValid && joiningFeeAmount >= coupon.minAmount) {
          if (coupon.discountType === 'flat') {
            discountAmount = coupon.discountValue;
          } else if (coupon.discountType === 'percentage') {
            discountAmount = (joiningFeeAmount * coupon.discountValue) / 100;
            if (coupon.maxDiscount > 0 && discountAmount > coupon.maxDiscount) {
              discountAmount = coupon.maxDiscount;
            }
          }
          if (discountAmount > joiningFeeAmount) {
            discountAmount = joiningFeeAmount;
          }
          finalAmount = joiningFeeAmount - discountAmount;
        } else {
          return res.status(400).json({ success: false, message: 'Invalid or expired coupon provided', reason: 'invalid amount or expired' });
        }
      } else {
        return res.status(404).json({ success: false, message: 'Coupon not found', reason: 'invalid coupon' });
      }
    }

    // Update Draft amounts
    draft.joiningFeeAmount = joiningFeeAmount;
    draft.joiningFeeDiscount = discountAmount;
    draft.joiningFeeFinalAmount = finalAmount;
    draft.couponCode = couponCode || '';

    // If final amount is 0 (skipped or 100% discount)
    if (finalAmount <= 0) {
      draft.joiningFeeStatus = 'skipped';
      await draft.save();

      // Create skipped payment record
      await EngineerPayment.create({
        engineerDraftId: draft._id,
        engineerType: type,
        baseAmount: joiningFeeAmount,
        discount: discountAmount,
        finalAmount: 0,
        currency: 'INR',
        couponCode: couponCode || null,
        razorpayOrderId: 'skipped',
        status: 'skipped'
      });

      return res.status(200).json({
        success: true,
        paymentRequired: false,
        message: 'No payment required',
        isFree: true,
        finalAmount: 0,
        couponApplied: !!couponCode,
        data: {
          originalAmount: joiningFeeAmount,
          discountAmount,
          finalAmount: 0,
          couponCode: couponCode || null,
          registrationDraftId: draft._id
        }
      });
    }

    // 3. Create Razorpay Order
    const receiptId = `join_${Date.now().toString().slice(-8)}`;
    
    const notes = {
      type: 'engineer_registration',
      name: finalName,
      phone: finalMobile,
      email: email || 'N/A',
      couponCode: couponCode || 'none',
      draftId: draft._id.toString()
    };

    const order = await razorpayService.createOrder(finalAmount, 'INR', receiptId, notes);

    if (!order.success) {
      return res.status(400).json({ success: false, message: 'Unable to create payment order', reason: order.error || 'Razorpay order failed' });
    }

    // Update draft with order ID
    draft.razorpayOrderId = order.orderId;
    await draft.save();

    // Store pending payment
    await EngineerPayment.create({
        engineerDraftId: draft._id,
        engineerType: type,
        baseAmount: joiningFeeAmount,
        discount: discountAmount,
        finalAmount: finalAmount,
        currency: order.currency,
        couponCode: couponCode || null,
        razorpayOrderId: order.orderId,
        status: 'created'
    });

    res.status(200).json({
      success: true,
      isFree: false,
      data: {
        orderId: order.orderId,
        amount: order.amount,
        currency: order.currency,
        originalAmount: joiningFeeAmount,
        discountAmount,
        finalAmount,
        couponCode: couponCode || null,
        key: process.env.RAZORPAY_KEY_ID,
        registrationDraftId: draft._id
      }
    });

  } catch (error) {
    console.error('Create joining fee order error:', error);
    res.status(500).json({ success: false, message: 'Server error while creating payment order' });
  }
};

/**
 * Verify Razorpay payment
 */
const verifyJoiningFeePayment = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, registrationDraftId } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ success: false, message: 'Missing payment details' });
    }

    if (!registrationDraftId) {
      return res.status(400).json({ success: false, message: 'Missing registration draft ID' });
    }

    const isValid = razorpayService.verifyPayment(razorpay_order_id, razorpay_payment_id, razorpay_signature);

    if (!isValid) {
      return res.status(400).json({ success: false, message: 'Invalid payment signature' });
    }

    // Update Draft
    const draft = await EngineerRegistrationDraft.findById(registrationDraftId);
    if (!draft) {
      return res.status(404).json({ success: false, message: 'Draft not found' });
    }

    draft.joiningFeeStatus = 'paid';
    draft.razorpayPaymentId = razorpay_payment_id;
    await draft.save();

    // Update Payment Record
    await EngineerPayment.findOneAndUpdate(
      { razorpayOrderId: razorpay_order_id },
      {
        status: 'paid',
        razorpayPaymentId: razorpay_payment_id,
        razorpaySignature: razorpay_signature,
        paidAt: new Date()
      }
    );

    res.status(200).json({
      success: true,
      message: 'Payment verified successfully'
    });

  } catch (error) {
    console.error('Verify joining fee payment error:', error);
    res.status(500).json({ success: false, message: 'Server error while verifying payment' });
  }
};

module.exports = {
  validateCoupon,
  createJoiningFeeOrder,
  verifyJoiningFeePayment
};
