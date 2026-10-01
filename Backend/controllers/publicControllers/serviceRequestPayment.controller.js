const {
  createPaymentOrder,
  verifyServiceRequestPayment
} = require('../../services/serviceRequestPayment.service');
const { requireOwnedServiceRequest } = require('../../services/serviceRequestAccess.service');

/** POST /api/public/service-requests/:requestCode/payment/order */
exports.createOrder = async (req, res) => {
  try {
    const owned = await requireOwnedServiceRequest(req, res);
    if (!owned) return;

    const result = await createPaymentOrder(owned.requestCode);
    if (!result.ok) {
      return res.status(result.status || 400).json({ success: false, message: result.message });
    }
    res.json({
      success: true,
      paymentRequired: !result.alreadyPaid,
      alreadyPaid: !!result.alreadyPaid,
      data: result.data
    });
  } catch (error) {
    console.error('serviceRequest createOrder:', error);
    res.status(500).json({ success: false, message: 'Failed to create payment order' });
  }
};

/** POST /api/public/service-requests/:requestCode/payment/verify */
exports.verifyPayment = async (req, res) => {
  try {
    const owned = await requireOwnedServiceRequest(req, res);
    if (!owned) return;

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ success: false, message: 'Missing Razorpay payment fields' });
    }

    const result = await verifyServiceRequestPayment(owned.requestCode, {
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      signature: razorpay_signature
    });

    if (!result.ok) {
      return res.status(result.status || 400).json({ success: false, message: result.message });
    }

    res.json({
      success: true,
      message: result.message,
      alreadyPaid: !!result.alreadyPaid,
      processing: !!result.processing
    });
  } catch (error) {
    console.error('serviceRequest verifyPayment:', error);
    res.status(500).json({ success: false, message: 'Payment verification failed' });
  }
};
