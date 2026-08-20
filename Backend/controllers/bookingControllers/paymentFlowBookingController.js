const mongoose = require('mongoose');
const crypto = require('crypto');
const Booking = require('../../models/Booking');
const BookingEvent = require('../../models/BookingEvent');
const User = require('../../models/User');
const Worker = require('../../models/Worker');
const Category = require('../../models/Category');
const UserService = require('../../models/UserService');
const OneTimeSubService = require('../../models/OneTimeSubService');
const Notification = require('../../models/Notification');
const { getIO } = require('../../sockets');
const { sendNotificationToUser, sendNotificationToWorker } = require('../../services/firebaseAdmin');
const { getRedis, isRedisConnected } = require('../../services/redisService');
const Razorpay = require('razorpay');
const razorpayService = require('../../services/razorpayService');

function getRazorpayClient() {
  const key_id = process.env.RAZORPAY_KEY_ID;
  const key_secret = process.env.RAZORPAY_KEY_SECRET;
  if (!key_id || !key_secret) return null;
  return new Razorpay({ key_id, key_secret });
}

const razorpay = getRazorpayClient();

// Helper for transition logging
async function logBookingEvent(bookingId, statusFrom, statusTo, triggeredBy, actorId, remarks = null, metadata = {}) {
  try {
    await BookingEvent.create({
      bookingId,
      statusFrom,
      statusTo,
      triggeredBy,
      actorId,
      remarks,
      metadata
    });
  } catch (err) {
    console.error('Failed to log booking event:', err);
  }
}

// Helper to broadcast socket updates
function broadcastBookingStatus(booking, status, additionalData = {}) {
  const io = getIO();
  if (io) {
    // Notify tracking room
    io.to(`booking_${booking._id.toString()}`).emit('booking:statusUpdated', {
      bookingId: booking._id,
      status,
      ...additionalData
    });
    // Notify user room
    io.to(`user_${booking.userId.toString()}`).emit('booking:statusUpdated', {
      bookingId: booking._id,
      status,
      ...additionalData
    });
    // Notify worker room if assigned
    if (booking.workerId) {
      io.to(`worker_${booking.workerId.toString()}`).emit('booking:statusUpdated', {
        bookingId: booking._id,
        status,
        ...additionalData
      });
    }
  }
}

// 1. Create Booking (Before Payment)
exports.createBooking = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      serviceId,
      subServiceIds = [],
      brandId,
      selectedIssues = [],
      customIssue,
      address,
      bookingType = 'instant',
      scheduledDate,
      scheduledTime,
      timeSlot
    } = req.body;

    // 1. Validate inputs
    const service = await UserService.findById(serviceId);
    if (!service) return res.status(404).json({ success: false, message: 'Service not found' });

    // 2. Fetch prices from DB (No trust on frontend pricing)
    let subTotal = 0;
    const items = [];

    // Add base service pricing if no sub-services selected, otherwise sum sub-services
    if (subServiceIds.length === 0) {
      subTotal = service.basePrice || 299;
      items.push({
        name: service.title,
        price: subTotal,
        quantity: 1
      });
    } else {
      const subServices = await OneTimeSubService.find({ _id: { $in: subServiceIds } });
      for (const sub of subServices) {
        subTotal += sub.price;
        items.push({
          name: sub.name,
          price: sub.price,
          quantity: 1
        });
      }
    }

    // Category configurations
    const categoryId = service.categoryId;
    const category = categoryId ? await Category.findById(categoryId) : null;
    const visitCharge = category?.visitCharge || 49;
    const platformFee = 29;

    // Pricing breakdowns
    const taxableAmount = subTotal + visitCharge + platformFee;
    const gst = Math.round(taxableAmount * 0.18 * 100) / 100;
    const totalAmount = taxableAmount + gst;

    // Worker payout split calculations
    const commissionPercent = category?.commissionPercent || 20; // 18-25%
    const workerCommission = subTotal * (commissionPercent / 100);
    const workerPayout = subTotal - workerCommission;
    const platformEarning = workerCommission + platformFee + visitCharge;

    // 3. Create Booking Document in DB
    const timestamp = Date.now().toString().slice(-8);
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    const bookingNumber = `BK${timestamp}${random}`;

    const bookingData = {
      bookingNumber,
      userId,
      serviceId,
      serviceName: service.title,
      serviceCategory: category?.title || 'One-Time Services',
      description: customIssue || selectedIssues.join(', '),
      address: {
        addressLine1: address.addressLine1,
        addressLine2: address.addressLine2 || '',
        city: address.city,
        state: address.state,
        pincode: address.pincode,
        lat: address.lat,
        lng: address.lng
      },
      bookingType,
      scheduledDate: scheduledDate || new Date(),
      scheduledTime: scheduledTime || 'ASAP',
      timeSlot: timeSlot || { start: 'ASAP', end: 'ASAP' },
      basePrice: subTotal,
      tax: gst,
      visitingCharges: visitCharge,
      finalAmount: totalAmount,
      userPayableAmount: totalAmount,
      status: 'pending',
      paymentStatus: 'pending',
      paymentMethod: 'razorpay',
      subTotal,
      platformFee,
      workerPayout,
      platformEarning,
      workerCommissionRate: commissionPercent,
      totalAmount
    };

    const booking = await Booking.create(bookingData);

    // 4. Create Razorpay Order (fail closed — never invent order_ ids)
    const rzpClient = razorpay || getRazorpayClient();
    if (!rzpClient) {
      await Booking.findByIdAndDelete(booking._id);
      return res.status(503).json({
        success: false,
        message: 'Payment gateway is not configured.'
      });
    }

    let razorpayOrderId = null;
    try {
      const options = {
        amount: Math.round(totalAmount * 100), // paise
        currency: 'INR',
        receipt: booking._id.toString(),
        notes: {
          bookingId: booking._id.toString(),
          userId: userId.toString()
        }
      };
      const order = await rzpClient.orders.create(options);
      razorpayOrderId = order.id;

      booking.razorpayOrderId = razorpayOrderId;
      await booking.save();
    } catch (rzpErr) {
      console.error('[Razorpay] Order creation failed:', rzpErr.message);
      await Booking.findByIdAndDelete(booking._id);
      return res.status(502).json({
        success: false,
        message: 'Unable to create payment order. Please try again.'
      });
    }

    await logBookingEvent(booking._id, null, 'pending', 'user', userId, 'Booking created. Awaiting worker matching.');

    // 5. Trigger wave-assignment asynchronously
    if (bookingType === 'instant') {
      const WaveManagerService = require('../../services/WaveManagerService');
      WaveManagerService.dispatchWave(booking._id.toString(), 0).catch(err => {
        console.error('[WaveManagerService Error]', err);
      });
    }

    res.status(201).json({
      success: true,
      bookingId: booking._id,
      razorpayOrderId,
      priceBreakdown: {
        subTotal,
        visitCharge,
        platformFee,
        gst,
        totalAmount
      }
    });
  } catch (error) {
    console.error('Create booking failed:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// 2. Worker Arrived (OTP 1 Generation)
exports.workerArrived = async (req, res) => {
  try {
    const bookingId = req.params.bookingId;
    const workerId = req.user.id;

    // Verify worker is assigned to booking and status is ASSIGNED
    const booking = await Booking.findById(bookingId);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    if (booking.workerId?.toString() !== workerId) {
      return res.status(403).json({ success: false, message: 'Unauthorized. You are not assigned to this booking.' });
    }
    if (booking.status !== 'assigned' && booking.status !== 'worker_assigned' && booking.status !== 'accepted') {
      return res.status(400).json({ success: false, message: `Invalid state transition. Booking status is ${booking.status}` });
    }

    // Generate 4-digit OTP
    const otp = crypto.randomInt(1000, 9999).toString();

    // Store in Redis with TTL 30 minutes (1800s)
    const redis = getRedis();
    if (isRedisConnected()) {
      await redis.set(`otp:start:${bookingId}`, JSON.stringify({ otp, attempts: 0 }), 'EX', 1800);
    }

    // Save in DB as fallback
    booking.visitOtp = otp;
    booking.otpAttempts = 0;
    booking.otpExpiresAt = new Date(Date.now() + 30 * 60 * 1000);
    booking.status = 'arrived';
    booking.arrivedAt = new Date();
    await booking.save();

    await logBookingEvent(bookingId, 'assigned', 'arrived', 'worker', workerId, 'Worker arrived at destination. OTP 1 generated.');

    // Save notification to MongoDB inbox
    try {
      await Notification.create({
        userId: booking.userId,
        type: 'vendor_reached',
        title: 'Technician Arrived! 🛠️',
        message: `Your technician is at your location. Share OTP: ${otp} to start the service.`,
        relatedId: booking._id,
        relatedType: 'booking'
      });
      console.log(`[DB NOTIFICATION] Saved technician arrived notification for user ${booking.userId}`);
    } catch (dbErr) {
      console.warn('[DB Notification] Failed to save database notification:', dbErr.message);
    }

    // Push notification/SMS triggers (independent)
    try {
      await sendNotificationToUser(booking.userId, {
        title: 'Technician Arrived! 🛠️',
        body: `Your technician is at your location. Share OTP: ${otp} to start the service.`,
        data: { bookingId: booking._id.toString(), type: 'worker_arrived', otp }
      });
    } catch (notifyErr) {
      console.warn('[FCM Push Notification] Failed to dispatch:', notifyErr.message);
    }

    // Broadcast update via Socket.io
    broadcastBookingStatus(booking, 'arrived', {
      otp,
      validFor: '30 mins',
      workerName: req.user.name || 'Technician'
    });

    res.status(200).json({
      success: true,
      message: 'Arrived status saved. OTP 1 sent to customer.',
      otp // Optional for testing/simulation
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 3. Verify Start OTP (OTP 1 Verification)
exports.verifyStartOtp = async (req, res) => {
  try {
    const bookingId = req.params.bookingId;
    const { otp } = req.body;
    const workerId = req.user.id;

    const booking = await Booking.findById(bookingId);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    if (booking.workerId?.toString() !== workerId) {
      return res.status(403).json({ success: false, message: 'Unauthorized. You are not assigned to this booking.' });
    }
    if (booking.status !== 'arrived') {
      return res.status(400).json({ success: false, message: 'Booking is not in arrived state.' });
    }

    // 1. Get OTP from Redis / DB fallback
    let cachedOtp = null;
    let attempts = 0;
    const redis = getRedis();

    if (isRedisConnected()) {
      const redisVal = await redis.get(`otp:start:${bookingId}`);
      if (redisVal) {
        const parsed = JSON.parse(redisVal);
        cachedOtp = parsed.otp;
        attempts = parsed.attempts;
      }
    }

    // Fallback to Mongoose DB
    if (!cachedOtp) {
      cachedOtp = booking.visitOtp;
      attempts = booking.otpAttempts || 0;
      if (booking.otpExpiresAt && new Date() > booking.otpExpiresAt) {
        return res.status(400).json({ success: false, message: 'OTP expired. Please request worker to re-trigger arrival.' });
      }
    }

    // Brute force protection
    if (attempts >= 5) {
      booking.status = 'disputed';
      await booking.save();
      await logBookingEvent(bookingId, 'arrived', 'disputed', 'system', null, 'Start OTP blocked due to excessive wrong attempts.');
      return res.status(429).json({ success: false, message: 'Too many attempts. Booking flagged for security review.' });
    }

    if (cachedOtp !== otp) {
      attempts++;
      if (isRedisConnected()) {
        await redis.set(`otp:start:${bookingId}`, JSON.stringify({ otp: cachedOtp, attempts }), 'EX', 1800);
      }
      booking.otpAttempts = attempts;
      await booking.save();
      return res.status(400).json({ success: false, message: 'Incorrect OTP. Please enter the correct code.' });
    }

    // Valid OTP
    if (isRedisConnected()) {
      await redis.del(`otp:start:${bookingId}`);
    }
    booking.visitOtp = undefined;
    booking.otpAttempts = 0;
    booking.status = 'in_progress';
    booking.startedAt = new Date();
    await booking.save();

    await logBookingEvent(bookingId, 'arrived', 'in_progress', 'worker', workerId, 'Start OTP verified. Service in progress.');

    // Broadcast status change
    broadcastBookingStatus(booking, 'in_progress');

    res.status(200).json({ success: true, message: 'Service started successfully.' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 4. Upload Work Photos
exports.uploadWorkPhotos = async (req, res) => {
  try {
    const bookingId = req.params.bookingId;
    const workerId = req.user.id;
    
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, message: 'Please upload at least one photo.' });
    }

    const booking = await Booking.findById(bookingId);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    if (booking.workerId?.toString() !== workerId) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    // Upload files to Cloudinary using standard config
    const cloudinary = require('cloudinary').v2;
    const photoUrls = [];

    for (const file of req.files) {
      const uploadResult = await cloudinary.uploader.upload(file.path, {
        folder: 'wbi_work_photos'
      });
      photoUrls.push(uploadResult.secure_url);
    }

    booking.workPhotos.push(...photoUrls);
    await booking.save();

    res.status(200).json({ success: true, urls: booking.workPhotos });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 5. Worker Completed (Awaiting Online Payment)
exports.workerCompleted = async (req, res) => {
  try {
    const bookingId = req.params.bookingId;
    const workerId = req.user.id;

    const booking = await Booking.findById(bookingId);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    if (booking.workerId?.toString() !== workerId) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }
    if (booking.status !== 'in_progress') {
      return res.status(400).json({ success: false, message: 'Service is not in progress.' });
    }

    // Validations: Min 1 photo and 10 mins elapsed (we bypass 10 mins check in dev for convenience)
    if (booking.workPhotos.length === 0) {
      return res.status(400).json({ success: false, message: 'Please upload at least one work progress photo before completing.' });
    }

    booking.status = 'completed_pending_payment';
    booking.visitedAt = new Date(); // workerCompletedAt
    await booking.save();

    await logBookingEvent(bookingId, 'in_progress', 'completed_pending_payment', 'worker', workerId, 'Worker completed work. Awaiting customer online payment.');

    // Save notification to MongoDB inbox
    try {
      await Notification.create({
        userId: booking.userId,
        type: 'work_done',
        title: 'Service Done! 💳',
        message: `Technician marked work complete. Pay ₹${booking.finalAmount} online to close booking.`,
        relatedId: booking._id,
        relatedType: 'booking'
      });
      console.log(`[DB NOTIFICATION] Saved service completed notification for user ${booking.userId}`);
    } catch (dbErr) {
      console.warn('[DB Notification] Failed to save database notification:', dbErr.message);
    }

    // Push notification to User (independent)
    try {
      await sendNotificationToUser(booking.userId, {
        title: 'Service Done! 💳',
        body: `Technician marked work complete. Pay ₹${booking.finalAmount} online to close booking.`,
        data: { bookingId: booking._id.toString(), type: 'payment_required', amount: booking.finalAmount.toString() }
      });
    } catch (notifyErr) {
      console.warn('[FCM Push Notification] Failed to dispatch:', notifyErr.message);
    }

    // Broadcast socket event
    broadcastBookingStatus(booking, 'completed_pending_payment', { amount: booking.finalAmount });

    res.status(200).json({ success: true, message: 'Work marked done. Awaiting customer online payment.' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 6. Initiate Payment (User JWT)
exports.initiatePayment = async (req, res) => {
  try {
    const bookingId = req.params.bookingId;
    const userId = req.user.id;

    const booking = await Booking.findById(bookingId);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    if (booking.userId.toString() !== userId) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }
    
    if (booking.paymentStatus === 'success' || booking.paymentStatus === 'paid') {
      return res.status(400).json({ success: false, message: 'Payment already completed for this booking.' });
    }

    if (booking.status === 'cancelled') {
      return res.status(400).json({ success: false, message: 'Cannot pay for cancelled booking.' });
    }

    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keyId || !keySecret) {
      return res.status(503).json({ success: false, message: 'Razorpay gateway credentials not configured.' });
    }

    // Dynamic regeneration of Razorpay order to align with current active keys in .env
    const instance = new Razorpay({
      key_id: keyId,
      key_secret: keySecret
    });

    const amountInPaise = Math.max(100, Math.round((booking.finalAmount || booking.totalAmount || 100) * 100));

    const razorpayOrder = await instance.orders.create({
      amount: amountInPaise,
      currency: 'INR',
      receipt: `rcpt_${booking._id.toString().slice(-8)}`,
      notes: {
        bookingId: booking._id.toString(),
        bookingNumber: booking.bookingNumber
      }
    });

    booking.razorpayOrderId = razorpayOrder.id;
    if (booking.status !== 'completed' && booking.status !== 'work_done') {
      booking.status = 'payment_initiated';
    }
    await booking.save();

    await logBookingEvent(bookingId, booking.status, 'payment_initiated', 'user', userId, 'User opened Razorpay checkout.', { razorpayOrderId: razorpayOrder.id });

    res.status(200).json({
      success: true,
      razorpayOrderId: razorpayOrder.id,
      key: keyId,
      amount: amountInPaise,
      currency: 'INR'
    });
  } catch (error) {
    console.error('[Razorpay Order Creation Error]', error);
    res.status(500).json({ success: false, message: 'Failed to initiate Razorpay order: ' + error.message });
  }
};

// 7. Verify Payment & Route Split (User JWT)
exports.verifyPayment = async (req, res) => {
  try {
    const bookingId = req.params.bookingId;
    const { razorpayPaymentId, razorpayOrderId, razorpaySignature } = req.body;
    const userId = req.user.id;

    const booking = await Booking.findById(bookingId);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    if (booking.userId.toString() !== userId) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    if (!razorpayPaymentId || !razorpayOrderId || !razorpaySignature) {
      return res.status(400).json({ success: false, message: 'Payment credentials are required.' });
    }

    if (!process.env.RAZORPAY_KEY_SECRET) {
      console.error('[Razorpay] RAZORPAY_KEY_SECRET is not configured');
      return res.status(503).json({ success: false, message: 'Payment gateway is not configured.' });
    }

    // 1. Signature validation (always required — no order_ bypass)
    const isValidSignature = razorpayService.verifyPayment(
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature
    );
    if (!isValidSignature) {
      return res.status(400).json({ success: false, message: 'Invalid payment signature. Fraud attempt blocked.' });
    }

    // Bind payment to the booking's order when present
    if (booking.razorpayOrderId && booking.razorpayOrderId !== razorpayOrderId) {
      return res.status(400).json({ success: false, message: 'Payment order does not match this booking.' });
    }

    // 2. Confirm capture on Razorpay (fail closed)
    const paymentDetails = await razorpayService.getPaymentDetails(razorpayPaymentId);
    if (!paymentDetails.success || !paymentDetails.payment) {
      return res.status(400).json({
        success: false,
        message: paymentDetails.error || 'Unable to verify payment with gateway.'
      });
    }
    const gatewayStatus = paymentDetails.payment.status;
    if (gatewayStatus !== 'captured' && gatewayStatus !== 'authorized') {
      return res.status(400).json({ success: false, message: 'Payment is not captured on Razorpay gateway.' });
    }
    if (paymentDetails.payment.order_id && paymentDetails.payment.order_id !== razorpayOrderId) {
      return res.status(400).json({ success: false, message: 'Payment does not belong to this order.' });
    }

    // 3. Trigger Razorpay Route Auto-Split transfer
    const rzp = razorpay || getRazorpayClient();
    const worker = await Worker.findById(booking.workerId);
    let transferProcessed = false;
    if (rzp && worker && worker.razorpayLinkedAccountId) {
      try {
        await rzp.payments.transfer(razorpayPaymentId, {
          transfers: [{
            account: worker.razorpayLinkedAccountId,
            amount: Math.round(booking.workerPayout * 100), // convert to paise
            currency: 'INR',
            on_hold: true, // Hold for 7 days
            on_hold_until: Math.round((Date.now() + 7 * 24 * 60 * 60 * 1000) / 1000)
          }]
        });
        transferProcessed = true;
      } catch (transferErr) {
        console.error('[Razorpay Route Transfer Error]', transferErr);
        // We log split failure but don't crash checkout (enqueue for manual/admin retry queue)
        await logBookingEvent(bookingId, 'payment_initiated', 'paid', 'system', null, 'Razorpay split transfer failed. Payout queued for manual processing.', { error: transferErr.message });
      }
    }

    // 4. Update Booking Document & Credit Worker Wallet
    booking.status = 'paid';
    booking.paymentStatus = 'success';
    booking.paidAt = new Date();
    booking.paymentMethod = 'online';
    booking.razorpayPaymentId = razorpayPaymentId;
    
    // Credit Worker Wallet if not yet credited
    if (!booking.isWorkerPaid && booking.workerId) {
      try {
        const workerPayout = Number(booking.workerPayout) || Math.round((booking.finalAmount || 0) * 0.8);
        const workerDoc = await Worker.findById(booking.workerId);
        if (workerDoc) {
          if (!workerDoc.wallet) {
            workerDoc.wallet = { balance: 0, totalEarnings: 0, pendingBalance: 0, withdrawnAmount: 0 };
          }
          workerDoc.wallet.balance = (workerDoc.wallet.balance || 0) + workerPayout;
          workerDoc.wallet.totalEarnings = (workerDoc.wallet.totalEarnings || 0) + workerPayout;
          await workerDoc.save();

          const Transaction = require('../../models/Transaction');
          await Transaction.create({
            workerId: booking.workerId,
            bookingId: booking._id,
            type: 'earnings_credit',
            amount: workerPayout,
            status: 'completed',
            paymentMethod: 'razorpay',
            description: `Earning ₹${workerPayout} credited for booking #${booking.bookingNumber} (Online Payment)`
          });
        }
        booking.isWorkerPaid = true;
        booking.workerPaymentStatus = 'SUCCESS';
      } catch (walletErr) {
        console.error('[Wallet Credit Error]', walletErr);
      }
    }

    // Generate OTP 2 (4-digit code)
    const otp2 = crypto.randomInt(1000, 9999).toString();
    booking.paymentOtp = otp2;
    await booking.save();

    // Store in Redis with TTL 2 hours
    const redis = getRedis();
    if (isRedisConnected()) {
      await redis.set(`otp:complete:${bookingId}`, JSON.stringify({ otp: otp2, attempts: 0 }), 'EX', 7200);
    }

    await logBookingEvent(bookingId, 'payment_initiated', 'paid', 'user', userId, 'Online payment verified. OTP 2 generated.', { razorpayPaymentId, splitSuccess: transferProcessed });

    // Save notifications to MongoDB inboxes
    try {
      await Notification.create({
        workerId: booking.workerId,
        type: 'payment_received',
        title: 'Payment Received! ✅',
        message: `Customer paid ₹${booking.finalAmount}. Show completion OTP: ${otp2} to customer.`,
        relatedId: booking._id,
        relatedType: 'booking'
      });
      await Notification.create({
        userId: booking.userId,
        type: 'payment_success',
        title: 'Payment Successful! 🎉',
        message: `Successfully paid ₹${booking.finalAmount}. Enter technician's code to complete service.`,
        relatedId: booking._id,
        relatedType: 'booking'
      });
      console.log(`[DB NOTIFICATION] Saved payment confirmation notifications for booking ${booking._id}`);
    } catch (dbErr) {
      console.warn('[DB Notification] Failed to save database notifications:', dbErr.message);
    }

    // Send push notifications to Worker and User (independent)
    try {
      await sendNotificationToWorker(booking.workerId, {
        title: 'Payment Received! ✅',
        body: `Customer paid ₹${booking.finalAmount}. Show completion OTP: ${otp2} to customer.`,
        data: { bookingId: booking._id.toString(), type: 'payment_received', otp: otp2 }
      });
      await sendNotificationToUser(booking.userId, {
        title: 'Payment Successful! 🎉',
        body: `Successfully paid ₹${booking.finalAmount}. Enter technician's code to complete service.`,
        data: { bookingId: booking._id.toString(), type: 'payment_confirmed' }
      });
    } catch (notifyErr) {
      console.warn('[FCM Push Notification] Failed to dispatch:', notifyErr.message);
    }

    // Broadcast socket updates
    broadcastBookingStatus(booking, 'paid', { otp: otp2 });

    res.status(200).json({
      success: true,
      message: 'Payment verified. OTP 2 sent to technician.',
      otp: otp2 // Optional for testing/simulation
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 8. Verify Complete OTP (OTP 2 Verification - User JWT)
exports.verifyCompleteOtp = async (req, res) => {
  try {
    const bookingId = req.params.bookingId;
    const { otp } = req.body;
    const userId = req.user.id;

    const booking = await Booking.findById(bookingId);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    if (booking.userId.toString() !== userId) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }
    if (booking.status !== 'paid') {
      return res.status(400).json({ success: false, message: 'Service payment is not completed yet.' });
    }

    // 1. Get OTP from Redis / DB fallback
    let cachedOtp = null;
    let attempts = 0;
    const redis = getRedis();

    if (isRedisConnected()) {
      const redisVal = await redis.get(`otp:complete:${bookingId}`);
      if (redisVal) {
        const parsed = JSON.parse(redisVal);
        cachedOtp = parsed.otp;
        attempts = parsed.attempts;
      }
    }

    if (!cachedOtp) {
      cachedOtp = booking.paymentOtp;
      attempts = booking.otpAttempts || 0;
    }

    // Brute force protection
    if (attempts >= 5) {
      booking.status = 'disputed';
      await booking.save();
      await logBookingEvent(bookingId, 'paid', 'disputed', 'system', null, 'Complete OTP blocked due to excessive wrong attempts.');
      return res.status(429).json({ success: false, message: 'Too many attempts. Service flagged for dispute review.' });
    }

    if (cachedOtp !== otp) {
      attempts++;
      if (isRedisConnected()) {
        await redis.set(`otp:complete:${bookingId}`, JSON.stringify({ otp: cachedOtp, attempts }), 'EX', 7200);
      }
      booking.otpAttempts = attempts;
      await booking.save();
      return res.status(400).json({ success: false, message: 'Incorrect OTP code.' });
    }

    // Valid OTP
    if (isRedisConnected()) {
      await redis.del(`otp:complete:${bookingId}`);
    }
    booking.paymentOtp = undefined;
    booking.otpAttempts = 0;
    booking.status = 'completed';
    booking.completedAt = new Date();
    await booking.save();

    // Update Worker Statistics & Wallet Ledger
    try {
      const workerDoc = await Worker.findById(booking.workerId);
      if (workerDoc) {
        // Increment job count stats
        workerDoc.completedJobs = (workerDoc.completedJobs || 0) + 1;
        workerDoc.totalJobs = (workerDoc.totalJobs || 0) + 1;
        workerDoc.status = 'ONLINE'; // Back online

        // Credit payout to worker's virtual wallet
        if (!workerDoc.wallet) {
          workerDoc.wallet = { balance: 0, totalEarnings: 0 };
        }
        workerDoc.wallet.balance = (workerDoc.wallet.balance || 0) + booking.workerPayout;
        workerDoc.wallet.totalEarnings = (workerDoc.wallet.totalEarnings || 0) + booking.workerPayout;
        await workerDoc.save();

        // Create Ledger Transaction in DB
        const Transaction = require('../../models/Transaction');
        await Transaction.create({
          workerId: booking.workerId,
          bookingId: booking._id,
          type: 'earnings_credit',
          amount: booking.workerPayout,
          status: 'completed',
          paymentMethod: 'wallet',
          description: `Earning ₹${booking.workerPayout} credited for booking #${booking.bookingNumber} (Online Payment)`,
          metadata: {
            type: 'earnings_increase',
            workerPayout: booking.workerPayout,
            platformEarning: booking.platformEarning
          }
        });
        console.log(`[LEDGER] Successfully credited ₹${booking.workerPayout} to worker ${booking.workerId} wallet balance.`);
      }
    } catch (ledgerErr) {
      console.warn('[LEDGER ERROR] Failed to credit worker wallet/transaction:', ledgerErr.message);
    }

    await logBookingEvent(bookingId, 'paid', 'completed', 'user', userId, 'Service completed OTP verified. Booking closed.');

    // Broadcast booking completion
    broadcastBookingStatus(booking, 'completed', { redirectTo: 'rating' });

    res.status(200).json({
      success: true,
      message: 'Service completed successfully.',
      redirectTo: 'rating'
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 9. Submit Rating & Review (User JWT)
exports.submitRating = async (req, res) => {
  try {
    const bookingId = req.params.bookingId;
    const { rating, review, reviewImages = [] } = req.body;
    const userId = req.user.id;

    const booking = await Booking.findById(bookingId);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    if (booking.userId.toString() !== userId) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    booking.rating = rating;
    booking.review = review;
    booking.reviewImages = reviewImages;
    booking.reviewedAt = new Date();
    await booking.save();

    // Update Worker Average Rating
    const worker = await Worker.findById(booking.workerId);
    if (worker) {
      const bookingsCount = await Booking.countDocuments({ workerId: worker._id, rating: { $ne: null } });
      const totalRatingsResult = await Booking.aggregate([
        { $match: { workerId: worker._id, rating: { $ne: null } } },
        { $group: { _id: null, sum: { $sum: '$rating' } } }
      ]);
      const ratingSum = totalRatingsResult[0]?.sum || 0;
      worker.rating = Math.round((ratingSum / (bookingsCount || 1)) * 10) / 10;
      await worker.save();
    }

    await logBookingEvent(bookingId, 'completed', 'completed', 'user', userId, `User reviewed service. Rating: ${rating} stars.`);

    res.status(200).json({ success: true, message: 'Thank you for your rating!' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 10. Webhooks Handler (Public Signature Check)
exports.razorpayWebhook = async (req, res) => {
  try {
    const signature = req.headers['x-razorpay-signature'];
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

    if (!webhookSecret) {
      console.error('[Razorpay Webhook] RAZORPAY_WEBHOOK_SECRET is not configured');
      return res.status(503).send('Webhook not configured');
    }

    if (!signature) {
      return res.status(400).send('Missing signature');
    }

    // Prefer raw body when available (express.json verify); fall back to serialized body
    const rawBody = req.rawBody
      ? (Buffer.isBuffer(req.rawBody) ? req.rawBody.toString('utf8') : String(req.rawBody))
      : JSON.stringify(req.body);

    const hmac = crypto.createHmac('sha256', webhookSecret);
    hmac.update(rawBody);
    const generatedSignature = hmac.digest('hex');

    try {
      const expected = Buffer.from(generatedSignature);
      const actual = Buffer.from(String(signature));
      if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
        return res.status(400).send('Invalid signature');
      }
    } catch {
      return res.status(400).send('Invalid signature');
    }

    const event = req.body.event;
    console.log(`[Razorpay Webhook] Received event: ${event}`);

    // Process event types
    if (event === 'payment.captured') {
      const payment = req.body.payload.payment.entity;
      const bookingId = payment.notes.bookingId;
      const razorpayPaymentId = payment.id;
      const razorpayOrderId = payment.order_id;

      const booking = await Booking.findById(bookingId);
      if (booking && booking.status === 'payment_initiated') {
        booking.status = 'paid';
        booking.paymentStatus = 'success';
        booking.paidAt = new Date();
        booking.paymentMethod = 'online';
        booking.razorpayPaymentId = razorpayPaymentId;
        
        const otp2 = crypto.randomInt(1000, 9999).toString();
        booking.paymentOtp = otp2;
        await booking.save();

        const redis = getRedis();
        if (isRedisConnected()) {
          await redis.set(`otp:complete:${bookingId}`, JSON.stringify({ otp: otp2, attempts: 0 }), 'EX', 7200);
        }

        await logBookingEvent(bookingId, 'payment_initiated', 'paid', 'system', null, 'Online payment verified via Razorpay webhook.', { razorpayPaymentId });
        broadcastBookingStatus(booking, 'paid', { otp: otp2 });
      }
    } else if (event === 'payment.failed') {
      const payment = req.body.payload.payment.entity;
      const bookingId = payment.notes.bookingId;
      const booking = await Booking.findById(bookingId);
      if (booking) {
        booking.paymentStatus = 'failed';
        await booking.save();
        await logBookingEvent(bookingId, booking.status, booking.status, 'system', null, 'Razorpay payment failed notification received.');
      }
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).send('Internal Server Error');
  }
};
