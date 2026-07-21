const crypto = require('crypto');
const EngineerCoupon = require('../../models/EngineerCoupon');
const EngineerRegistrationConfig = require('../../models/EngineerRegistrationConfig');
const EngineerRegistrationDraft = require('../../models/EngineerRegistrationDraft');
const EngineerPayment = require('../../models/EngineerPayment');
const razorpayService = require('../../services/razorpayService');

const markCouponUsed = async (couponCode) => {
  if (!couponCode) return;
  await EngineerCoupon.findOneAndUpdate(
    { code: String(couponCode).toUpperCase(), isActive: true },
    { $inc: { usedCount: 1 } }
  );
};

const markDraftAndPaymentPaid = async ({
  draft,
  orderId,
  paymentId,
  signature = null
}) => {
  const wasUnpaid = draft.joiningFeeStatus !== 'paid';

  if (wasUnpaid) {
    draft.joiningFeeStatus = 'paid';
    draft.razorpayOrderId = orderId || draft.razorpayOrderId;
    draft.razorpayPaymentId = paymentId || draft.razorpayPaymentId;
    await draft.save();
  } else if (!draft.razorpayPaymentId && paymentId) {
    draft.razorpayPaymentId = paymentId;
    await draft.save();
  }

  const paymentUpdate = {
    status: 'paid',
    razorpayPaymentId: paymentId,
    paidAt: new Date(),
    ...(signature ? { razorpaySignature: signature } : {})
  };

  let payment = await EngineerPayment.findOneAndUpdate(
    { razorpayOrderId: orderId },
    paymentUpdate,
    { new: true }
  );

  if (!payment) {
    payment = await EngineerPayment.create({
      engineerDraftId: draft._id,
      engineerType: draft.engineerType || 'freelancer',
      baseAmount: draft.joiningFeeAmount || 0,
      discount: draft.joiningFeeDiscount || 0,
      finalAmount: draft.joiningFeeFinalAmount || 0,
      currency: 'INR',
      couponCode: draft.couponCode || null,
      razorpayOrderId: orderId,
      razorpayPaymentId: paymentId,
      razorpaySignature: signature,
      status: 'paid',
      paidAt: new Date()
    });
  }

  // Increment coupon only on first successful transition to paid
  if (wasUnpaid && draft.couponCode) {
    await markCouponUsed(draft.couponCode);
  }

  return payment;
};

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

    const now = new Date();
    if (coupon.validFrom && now < coupon.validFrom) {
      return res.status(400).json({ success: false, message: 'Coupon is not yet valid' });
    }
    if (coupon.validTill && now > coupon.validTill) {
      return res.status(400).json({ success: false, message: 'Coupon has expired' });
    }

    if (coupon.usageLimit > 0 && coupon.usedCount >= coupon.usageLimit) {
      return res.status(400).json({ success: false, message: 'Coupon usage limit reached' });
    }

    const config = await EngineerRegistrationConfig.findOne();
    const joiningFeeAmount = config?.joiningFeeAmount || 249;

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

/**
 * Create a Razorpay order for the joining fee
 */
const createJoiningFeeOrder = async (req, res) => {
  try {
    const { couponCode, name, phone, mobile, email, engineerType, vendorCode } = req.body;
    let { registrationDraftId } = req.body;
    const finalMobile = String(mobile || phone || '').trim();
    const finalName = String(name || 'Engineer').trim();

    if (!finalMobile || finalMobile.length < 10) {
      return res.status(400).json({ success: false, message: 'Valid mobile number is required' });
    }

    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      return res.status(500).json({ success: false, message: 'Payment gateway is not configured' });
    }

    const config = await EngineerRegistrationConfig.findOne();
    if (config && config.joiningFeeEnabled === false) {
      return res.status(400).json({ success: false, message: 'Joining fee is currently disabled' });
    }

    const type = engineerType || 'freelancer';
    const { findVendorByActiveCode, normalizeVendorCode } = require('../../utils/vendorCompanyCode');

    let resolvedVendorId = null;
    let normalizedCode = '';
    if (type === 'vendor_engineer') {
      normalizedCode = normalizeVendorCode(vendorCode);
      if (!normalizedCode) {
        return res.status(400).json({
          success: false,
          message: 'Valid vendor company code is required (e.g. WBI-2026-X7K9M2)'
        });
      }
      const vendor = await findVendorByActiveCode(normalizedCode);
      if (!vendor) {
        return res.status(400).json({
          success: false,
          message: 'Invalid or revoked vendor company code. Ask your vendor for the latest code.'
        });
      }
      resolvedVendorId = vendor._id;
      normalizedCode = vendor.uniqueCompanyCode;
    }

    let draft = null;
    if (registrationDraftId) {
      draft = await EngineerRegistrationDraft.findById(registrationDraftId);
      if (!draft) {
        return res.status(404).json({ success: false, message: 'Draft not found' });
      }
    } else {
      // Reuse latest unpaid draft for same mobile to avoid duplicate Razorpay orders
      draft = await EngineerRegistrationDraft.findOne({
        mobile: finalMobile,
        joiningFeeStatus: { $in: ['pending', 'failed'] }
      }).sort({ updatedAt: -1 });

      if (!draft) {
        draft = await EngineerRegistrationDraft.create({
          engineerType: type,
          fullName: finalName,
          mobile: finalMobile,
          email: email || '',
          vendorCode: normalizedCode || '',
          vendorId: resolvedVendorId,
          vendorCompanyName: ''
        });
      }
      registrationDraftId = draft._id;
    }

    // Idempotent: already paid
    if (draft.joiningFeeStatus === 'paid' || draft.joiningFeeStatus === 'skipped') {
      return res.status(200).json({
        success: true,
        paymentRequired: false,
        isFree: draft.joiningFeeStatus === 'skipped',
        alreadyPaid: draft.joiningFeeStatus === 'paid',
        message: draft.joiningFeeStatus === 'paid' ? 'Joining fee already paid' : 'No payment required',
        data: {
          originalAmount: draft.joiningFeeAmount,
          discountAmount: draft.joiningFeeDiscount,
          finalAmount: draft.joiningFeeFinalAmount,
          couponCode: draft.couponCode || null,
          registrationDraftId: draft._id
        }
      });
    }

    draft.fullName = finalName;
    draft.mobile = finalMobile;
    draft.email = email || draft.email || '';
    draft.engineerType = type;
    draft.vendorCode = normalizedCode || draft.vendorCode || '';
    draft.vendorId = resolvedVendorId || draft.vendorId || null;
    if (resolvedVendorId) {
      const v = await require('../../models/Vendor').findById(resolvedVendorId).select('businessName name').lean();
      draft.vendorCompanyName = v?.businessName || v?.name || '';
    }

    let skipFee = false;
    if (type === 'freelancer' && config?.freelancerJoiningFeeRequired === false) {
      skipFee = true;
    } else if (type === 'vendor_engineer' && config?.vendorEngineerJoiningFeeRequired === 'skipped') {
      skipFee = true;
    }

    const joiningFeeAmount = config?.joiningFeeAmount || 249;
    let discountAmount = 0;
    let finalAmount = skipFee ? 0 : joiningFeeAmount;

    if (couponCode && !skipFee) {
      const coupon = await EngineerCoupon.findOne({ code: couponCode.toUpperCase(), isActive: true });
      if (!coupon) {
        return res.status(404).json({ success: false, message: 'Coupon not found' });
      }

      const now = new Date();
      const isValid = (!coupon.validFrom || now >= coupon.validFrom) &&
        (!coupon.validTill || now <= coupon.validTill) &&
        (coupon.usageLimit === 0 || coupon.usedCount < coupon.usageLimit);

      if (!isValid || joiningFeeAmount < coupon.minAmount) {
        return res.status(400).json({ success: false, message: 'Invalid or expired coupon provided' });
      }

      if (coupon.discountType === 'flat') {
        discountAmount = coupon.discountValue;
      } else if (coupon.discountType === 'percentage') {
        discountAmount = (joiningFeeAmount * coupon.discountValue) / 100;
        if (coupon.maxDiscount > 0 && discountAmount > coupon.maxDiscount) {
          discountAmount = coupon.maxDiscount;
        }
      }
      if (discountAmount > joiningFeeAmount) discountAmount = joiningFeeAmount;
      finalAmount = joiningFeeAmount - discountAmount;
    }

    draft.joiningFeeAmount = joiningFeeAmount;
    draft.joiningFeeDiscount = discountAmount;
    draft.joiningFeeFinalAmount = finalAmount;
    draft.couponCode = couponCode || '';

    if (finalAmount <= 0) {
      draft.joiningFeeStatus = 'skipped';
      await draft.save();

      await EngineerPayment.findOneAndUpdate(
        { engineerDraftId: draft._id, status: 'skipped' },
        {
          engineerDraftId: draft._id,
          engineerType: type,
          baseAmount: joiningFeeAmount,
          discount: discountAmount,
          finalAmount: 0,
          currency: 'INR',
          couponCode: couponCode || null,
          razorpayOrderId: `skipped_${draft._id}`,
          status: 'skipped'
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      if (couponCode) await markCouponUsed(couponCode);

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

    // Reuse existing open Razorpay order when amount still matches
    if (draft.razorpayOrderId) {
      const existingOrder = await razorpayService.getOrderDetails(draft.razorpayOrderId);
      if (existingOrder.success) {
        const rzOrder = existingOrder.order;
        const expectedPaise = Math.round(finalAmount * 100);

        if (rzOrder.status === 'paid') {
          const orderPayments = await razorpayService.getOrderPayments(rzOrder.id);
          const captured = (orderPayments.payments || []).find((p) =>
            ['captured', 'authorized'].includes(p.status)
          );
          if (captured?.id) {
            await markDraftAndPaymentPaid({
              draft,
              orderId: rzOrder.id,
              paymentId: captured.id
            });
            return res.status(200).json({
              success: true,
              paymentRequired: false,
              alreadyPaid: true,
              message: 'Joining fee already paid',
              data: {
                originalAmount: joiningFeeAmount,
                discountAmount,
                finalAmount,
                couponCode: couponCode || null,
                registrationDraftId: draft._id
              }
            });
          }
        }

        if (rzOrder.status === 'created' && Number(rzOrder.amount) === expectedPaise) {
          await draft.save();
          await EngineerPayment.findOneAndUpdate(
            { razorpayOrderId: rzOrder.id },
            {
              engineerDraftId: draft._id,
              engineerType: type,
              baseAmount: joiningFeeAmount,
              discount: discountAmount,
              finalAmount,
              currency: rzOrder.currency || 'INR',
              couponCode: couponCode || null,
              status: 'created'
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
          );

          return res.status(200).json({
            success: true,
            isFree: false,
            reusedOrder: true,
            data: {
              orderId: rzOrder.id,
              amount: rzOrder.amount,
              currency: rzOrder.currency || 'INR',
              originalAmount: joiningFeeAmount,
              discountAmount,
              finalAmount,
              couponCode: couponCode || null,
              key: process.env.RAZORPAY_KEY_ID,
              registrationDraftId: draft._id
            }
          });
        }
      }
    }

    const receiptId = `join_${String(draft._id).slice(-6)}_${Date.now().toString().slice(-6)}`;
    const notes = {
      type: 'engineer_joining_fee',
      name: finalName,
      phone: finalMobile,
      email: email || 'N/A',
      couponCode: couponCode || 'none',
      draftId: draft._id.toString()
    };

    const order = await razorpayService.createOrder(finalAmount, 'INR', receiptId, notes);
    if (!order.success) {
      return res.status(400).json({
        success: false,
        message: 'Unable to create payment order',
        reason: order.error || 'Razorpay order failed'
      });
    }

    draft.razorpayOrderId = order.orderId;
    draft.joiningFeeStatus = 'pending';
    await draft.save();

    await EngineerPayment.findOneAndUpdate(
      { razorpayOrderId: order.orderId },
      {
        engineerDraftId: draft._id,
        engineerType: type,
        baseAmount: joiningFeeAmount,
        discount: discountAmount,
        finalAmount,
        currency: order.currency,
        couponCode: couponCode || null,
        razorpayOrderId: order.orderId,
        status: 'created'
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

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
 * Verify Razorpay payment (client callback + server-side capture check)
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

    if (!process.env.RAZORPAY_KEY_SECRET) {
      return res.status(500).json({ success: false, message: 'Payment gateway is not configured' });
    }

    const isValid = razorpayService.verifyPayment(razorpay_order_id, razorpay_payment_id, razorpay_signature);
    if (!isValid) {
      return res.status(400).json({ success: false, message: 'Invalid payment signature' });
    }

    const draft = await EngineerRegistrationDraft.findById(registrationDraftId);
    if (!draft) {
      return res.status(404).json({ success: false, message: 'Draft not found' });
    }

    // Bind payment to the draft's order (prevents attaching foreign payments)
    if (draft.razorpayOrderId && draft.razorpayOrderId !== razorpay_order_id) {
      return res.status(400).json({
        success: false,
        message: 'Payment order does not match this registration draft'
      });
    }

    // Idempotent success
    if (draft.joiningFeeStatus === 'paid' && draft.razorpayPaymentId === razorpay_payment_id) {
      return res.status(200).json({ success: true, message: 'Payment already verified', alreadyPaid: true });
    }

    // Confirm payment status + amount with Razorpay (source of truth)
    const paymentResult = await razorpayService.getPaymentDetails(razorpay_payment_id);
    if (!paymentResult.success) {
      return res.status(400).json({ success: false, message: 'Unable to confirm payment with Razorpay' });
    }

    const rzPayment = paymentResult.payment;
    const allowedStatuses = ['captured', 'authorized'];
    if (!allowedStatuses.includes(rzPayment.status)) {
      draft.joiningFeeStatus = 'failed';
      await draft.save();
      await EngineerPayment.findOneAndUpdate(
        { razorpayOrderId: razorpay_order_id },
        { status: 'failed', razorpayPaymentId: razorpay_payment_id },
        { new: true }
      );
      return res.status(400).json({
        success: false,
        message: `Payment not successful (status: ${rzPayment.status})`
      });
    }

    if (rzPayment.order_id && rzPayment.order_id !== razorpay_order_id) {
      return res.status(400).json({ success: false, message: 'Payment does not belong to this order' });
    }

    const expectedPaise = Math.round(Number(draft.joiningFeeFinalAmount || 0) * 100);
    if (expectedPaise > 0 && Number(rzPayment.amount) !== expectedPaise) {
      return res.status(400).json({
        success: false,
        message: 'Paid amount does not match joining fee order'
      });
    }

    await markDraftAndPaymentPaid({
      draft,
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      signature: razorpay_signature
    });

    res.status(200).json({
      success: true,
      message: 'Payment verified successfully',
      data: {
        registrationDraftId: draft._id,
        razorpayOrderId: razorpay_order_id,
        razorpayPaymentId: razorpay_payment_id,
        amount: draft.joiningFeeFinalAmount
      }
    });
  } catch (error) {
    // Concurrent verify / webhook race — unique razorpayPaymentId index
    if (error && (error.code === 11000 || String(error.message || '').includes('E11000'))) {
      return res.status(200).json({ success: true, message: 'Payment already verified', alreadyPaid: true });
    }
    console.error('Verify joining fee payment error:', error);
    res.status(500).json({ success: false, message: 'Server error while verifying payment' });
  }
};

/**
 * Razorpay webhook for engineer joining fee (payment.captured / payment.failed)
 * Expects raw body Buffer when mounted with express.raw
 */
const joiningFeeWebhook = async (req, res) => {
  try {
    const signature = req.headers['x-razorpay-signature'];
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

    if (!webhookSecret) {
      console.error('[JoiningFee Webhook] RAZORPAY_WEBHOOK_SECRET missing');
      return res.status(500).send('Webhook secret not configured');
    }

    if (!signature) {
      return res.status(400).send('Missing signature');
    }

    const rawBody = Buffer.isBuffer(req.body)
      ? req.body
      : Buffer.from(typeof req.body === 'string' ? req.body : JSON.stringify(req.body));

    const expected = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
    const expectedBuf = Buffer.from(expected);
    const signatureBuf = Buffer.from(String(signature));

    if (
      expectedBuf.length !== signatureBuf.length ||
      !crypto.timingSafeEqual(expectedBuf, signatureBuf)
    ) {
      return res.status(400).send('Invalid signature');
    }

    const eventPayload = JSON.parse(rawBody.toString('utf8'));
    const event = eventPayload.event;
    console.log(`[JoiningFee Webhook] event=${event}`);

    if (event === 'payment.captured' || event === 'order.paid') {
      const payment = eventPayload.payload?.payment?.entity;
      if (!payment) return res.status(200).send('OK');

      const orderId = payment.order_id;
      const paymentId = payment.id;
      const draftId = payment.notes?.draftId;

      let draft = null;
      if (draftId) {
        draft = await EngineerRegistrationDraft.findById(draftId);
      }
      if (!draft && orderId) {
        draft = await EngineerRegistrationDraft.findOne({ razorpayOrderId: orderId });
      }

      if (draft && draft.joiningFeeStatus !== 'paid') {
        await markDraftAndPaymentPaid({
          draft,
          orderId,
          paymentId
        });
      }
    }

    if (event === 'payment.failed') {
      const payment = eventPayload.payload?.payment?.entity;
      const orderId = payment?.order_id;
      const draftId = payment?.notes?.draftId;
      let draft = null;
      if (draftId) draft = await EngineerRegistrationDraft.findById(draftId);
      if (!draft && orderId) draft = await EngineerRegistrationDraft.findOne({ razorpayOrderId: orderId });

      if (draft && draft.joiningFeeStatus === 'pending') {
        draft.joiningFeeStatus = 'failed';
        await draft.save();
        await EngineerPayment.findOneAndUpdate(
          { razorpayOrderId: orderId },
          { status: 'failed', razorpayPaymentId: payment?.id || null }
        );
      }
    }

    return res.status(200).send('OK');
  } catch (error) {
    console.error('[JoiningFee Webhook] error:', error);
    return res.status(500).send('Internal Server Error');
  }
};

module.exports = {
  validateCoupon,
  createJoiningFeeOrder,
  verifyJoiningFeePayment,
  joiningFeeWebhook
};
