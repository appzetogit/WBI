const BookingDraft = require('../../models/BookingDraft');
const Coupon = require('../../models/Coupon');
const OneTimeService = require('../../models/OneTimeService');
const ServicePackage = require('../../models/ServicePackage');
const Settings = require('../../models/Settings');

/**
 * Recalculate pricing for a draft dynamically
 */
const calculatePricing = async (draft) => {
  let packageTotal = 0;

  // Simulate pricing calculation dynamically
  if (draft.packageIds && draft.packageIds.length > 0) {
    const packageIds = draft.packageIds.map(p => p._id || p);
    
    // Find packages
    const packages = await ServicePackage.find({ _id: { $in: packageIds } });
    packages.forEach(pkg => {
      const qty = (draft.quantities && typeof draft.quantities.get === 'function') 
        ? (draft.quantities.get(pkg._id.toString()) || 1) 
        : 1;
      packageTotal += (pkg.price || 0) * qty;
    });

    // Find sub-services
    const OneTimeSubService = require('../../models/OneTimeSubService');
    const subServices = await OneTimeSubService.find({ _id: { $in: packageIds } });
    subServices.forEach(sub => {
      const qty = (draft.quantities && typeof draft.quantities.get === 'function') 
        ? (draft.quantities.get(sub._id.toString()) || 1) 
        : 1;
      packageTotal += (sub.price || 0) * qty;
    });
  }

  // Fetch admin settings dynamically
  const settings = await Settings.findOne({ type: 'global' });
  const visitCharge = settings ? settings.visitedCharges : 199;
  const platformFee = 30; // Assuming fixed fee or could be derived from settings.platformFeePercentage if needed
  let surgeCharge = 0;
  let emergencyCharge = 0;
  let convenienceFee = 0;
  let discount = 0;
  let couponDiscount = 0;

  const subtotal = packageTotal + visitCharge + platformFee + surgeCharge + emergencyCharge + convenienceFee;
  const gstRate = settings ? settings.serviceGstPercentage / 100 : 0.18;
  const gst = subtotal * gstRate;

  // Apply Coupon if valid
  if (draft.couponId) {
    const couponId = draft.couponId._id || draft.couponId;
    const coupon = await Coupon.findById(couponId);
    if (coupon && coupon.isActive && subtotal >= coupon.minOrderValue) {
      if (coupon.discountType === 'percentage') {
        couponDiscount = (subtotal * coupon.discountValue) / 100;
        if (coupon.maxDiscountAmount) {
          couponDiscount = Math.min(couponDiscount, coupon.maxDiscountAmount);
        }
      } else {
        couponDiscount = coupon.discountValue;
      }
    } else {
      // Coupon invalid, remove it
      draft.couponId = null;
    }
  }

  const finalAmount = (subtotal + gst) - discount - couponDiscount;

  return {
    packageTotal,
    visitCharge,
    platformFee,
    gst,
    discount,
    couponDiscount,
    surgeCharge,
    emergencyCharge,
    convenienceFee,
    finalAmount: Math.max(0, finalAmount),
    itemCount: draft.packageIds.length
  };
};

/**
 * Get the full review details for a Booking Draft
 */
exports.getReviewDraft = async (req, res) => {
  try {
    const { draftId } = req.params;

    const draft = await BookingDraft.findById(draftId)
      .populate('serviceId', 'name description icon')
      .populate('brandId', 'brandName icon')
      .populate('issueIds', 'title')
      .populate('couponId', 'code discountType discountValue');

    if (!draft) {
      return res.status(404).json({ success: false, message: 'Draft not found' });
    }

    // Query populated packages and sub-services manually
    const rawDraft = await BookingDraft.findById(draftId).lean();
    const rawPackageIds = rawDraft.packageIds || [];

    const packages = await ServicePackage.find({ _id: { $in: rawPackageIds } }).select('name price').lean();
    const OneTimeSubService = require('../../models/OneTimeSubService');
    const subServices = await OneTimeSubService.find({ _id: { $in: rawPackageIds } }).select('name price').lean();

    const populatedItems = [
      ...packages.map(p => ({ _id: p._id, name: p.name, price: p.price })),
      ...subServices.map(s => ({ _id: s._id, name: s.name, price: s.price }))
    ];

    // Ensure pricing is up to date before returning
    const pricing = await calculatePricing(draft);
    draft.priceSnapshot = pricing;
    await draft.save();

    const draftObj = draft.toObject();
    draftObj.packageIds = populatedItems;

    // Mock vendor data for demonstration
    if (!draftObj.vendorInfo || !draftObj.vendorInfo.vendorId) {
       draftObj.vendorInfo = {
         name: "Acme Services",
         rating: 4.8,
         jobsCompleted: 154,
         verified: true,
         supportNumber: "+91 9876543210"
       };
    }

    res.status(200).json({
      success: true,
      data: draftObj
    });
  } catch (error) {
    console.error('Error fetching review draft:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * Update the Draft (instructions, notes, etc.)
 */
exports.updateDraft = async (req, res) => {
  try {
    const { draftId } = req.params;
    const { specialInstructions, gatePassInfo, parkingInfo, societyRules, petInfo, couponId } = req.body;

    const draft = await BookingDraft.findById(draftId);
    if (!draft) {
      return res.status(404).json({ success: false, message: 'Draft not found' });
    }

    if (specialInstructions !== undefined) draft.specialInstructions = specialInstructions;
    if (gatePassInfo !== undefined) draft.gatePassInfo = gatePassInfo;
    if (parkingInfo !== undefined) draft.parkingInfo = parkingInfo;
    if (societyRules !== undefined) draft.societyRules = societyRules;
    if (petInfo !== undefined) draft.petInfo = petInfo;
    if (couponId !== undefined) draft.couponId = couponId;

    // Recalculate if coupon changed
    const pricing = await calculatePricing(draft);
    draft.priceSnapshot = pricing;

    await draft.save();

    res.status(200).json({ success: true, data: draft });
  } catch (error) {
    console.error('Error updating draft:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const parseSlotTimes = (dateObj, timeSlotStr) => {
  if (!timeSlotStr) return { start: null, end: null };
  const parts = timeSlotStr.split(' - ');
  const startStr = parts[0];
  const endStr = parts[1] || parts[0];

  const parseSingleTime = (timeStr) => {
    const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
    let hours = 9;
    let minutes = 0;
    if (match) {
      hours = parseInt(match[1]);
      minutes = parseInt(match[2]);
      const ampm = match[3].toUpperCase();
      if (ampm === 'PM' && hours < 12) hours += 12;
      if (ampm === 'AM' && hours === 12) hours = 0;
    } else {
      const simple = timeStr.match(/(\d+):(\d+)/);
      if (simple) {
        hours = parseInt(simple[1]);
        minutes = parseInt(simple[2]);
      }
    }
    const d = new Date(dateObj);
    d.setHours(hours, minutes, 0, 0);
    return d;
  };

  return {
    start: parseSingleTime(startStr),
    end: parseSingleTime(endStr)
  };
};

/**
 * Confirm and Prepare Booking
 */
exports.confirmReview = async (req, res) => {
  try {
    const { draftId } = req.body;

    const draft = await BookingDraft.findById(draftId).populate('serviceId');
    if (!draft) {
      return res.status(404).json({ success: false, message: 'Draft not found' });
    }

    if (draft.status === 'converted') {
      const Booking = require('../../models/Booking');
      // Prevent duplicate booking creation, but return success so the UI can proceed
      const existingBooking = await Booking.findOne({ userId: draft.userId, serviceId: draft.serviceId._id }).sort({ createdAt: -1 });
      if (existingBooking) {
        return res.status(200).json({ 
          success: true, 
          bookingId: existingBooking._id,
          message: 'Booking already confirmed.' 
        });
      }
      return res.status(400).json({ success: false, message: 'Booking already confirmed for this draft. Please check your bookings page.' });
    }

    // Validation
    if (!draft.address) {
      return res.status(400).json({ success: false, message: 'Address is required' });
    }
    if (!draft.scheduledDate || !draft.scheduledTime) {
      return res.status(400).json({ success: false, message: 'Schedule is required' });
    }

    // Create the actual Booking document
    const Booking = require('../../models/Booking');
    const pricing = await calculatePricing(draft);

    const isScheduled = draft.bookingType === 'scheduled';
    let scheduledStartAt = null;
    let scheduledEndAt = null;

    if (isScheduled && draft.scheduledDate && draft.scheduledTime) {
      try {
        const parsed = parseSlotTimes(draft.scheduledDate, draft.scheduledTime);
        scheduledStartAt = parsed.start;
        scheduledEndAt = parsed.end;
      } catch (err) {
        console.error('Error parsing scheduled slot times:', err);
      }
    }

    // Calculate splits
    const Category = require('../../models/Category');
    const category = await Category.findOne({ title: draft.serviceId.category });
    const commissionPercent = category?.commissionPercent || 20;
    const workerCommission = pricing.packageTotal * (commissionPercent / 100);
    const workerPayout = pricing.packageTotal - workerCommission;
    const platformEarning = workerCommission + (pricing.platformFee || 29) + (pricing.visitCharge || 49);

    const booking = new Booking({
      userId: draft.userId,
      serviceId: draft.serviceId._id,
      serviceName: draft.serviceId.name || 'Service',
      serviceCategory: draft.serviceId.category || 'Category',
      brandName: draft.brandId ? 'Selected Brand' : null,
      basePrice: pricing.packageTotal,
      finalAmount: pricing.finalAmount,
      address: {
        type: draft.address.type || 'home',
        addressLine1: draft.address.addressLine1 || draft.address.address || draft.address.line1 || 'No address line 1',
        addressLine2: draft.address.addressLine2 || '',
        city: draft.address.city || 'Unknown',
        state: draft.address.state || 'Unknown',
        pincode: draft.address.pincode || '000000',
        lat: draft.address.lat,
        lng: draft.address.lng
      },
      scheduledDate: draft.scheduledDate,
      scheduledTime: draft.scheduledTime,
      timeSlot: draft.timeSlot || { start: draft.scheduledTime, end: 'TBD' },
      scheduledStartAt,
      scheduledEndAt,
      bookingType: draft.bookingType || 'scheduled',
      status: isScheduled ? 'scheduled' : 'pending',
      paymentStatus: 'pending',
      paymentMethod: 'razorpay',
      subTotal: pricing.packageTotal,
      platformFee: pricing.platformFee || 29,
      workerPayout: workerPayout,
      platformEarning: platformEarning,
      workerCommissionRate: commissionPercent,
      totalAmount: pricing.finalAmount,
      visitingCharges: pricing.visitCharge || 49,
      tax: pricing.gst,
      userPayableAmount: pricing.finalAmount
    });

    // Create Razorpay Order
    try {
      const crypto = require('crypto');
      const Razorpay = require('razorpay');
      const razorpay = new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_mock',
        key_secret: process.env.RAZORPAY_KEY_SECRET || 'mock_secret'
      });
      const options = {
        amount: Math.round(pricing.finalAmount * 100),
        currency: 'INR',
        receipt: booking._id.toString(),
        notes: {
          bookingId: booking._id.toString(),
          userId: draft.userId.toString()
        }
      };
      const order = await razorpay.orders.create(options);
      booking.razorpayOrderId = order.id;
    } catch (rzpErr) {
      console.warn('[Razorpay] Order creation failed in confirmation, using sandbox placeholder:', rzpErr.message);
      const crypto = require('crypto');
      booking.razorpayOrderId = `order_${crypto.randomBytes(8).toString('hex')}`;
    }

    await booking.save();

    // Convert draft status
    draft.status = 'converted';
    await draft.save();

    // Trigger Socket.io real-time events for dynamic UI sync
    try {
      const io = require('../../sockets').getIO();
      if (io) {
        if (isScheduled) {
          io.to(`user_${booking.userId}`).emit('booking:scheduledCreated', {
            bookingId: booking._id,
            bookingNumber: booking.bookingNumber,
            scheduledDate: booking.scheduledDate,
            scheduledTime: booking.scheduledTime
          });
          io.to('admin:wbi').emit('admin:bookingUpdated', {
            bookingId: booking._id,
            status: 'scheduled'
          });
        }
      }
    } catch (sockErr) {
      console.warn('Socket emit error on booking confirm:', sockErr.message);
    }

    if (isScheduled) {
      return res.status(200).json({
        success: true,
        bookingId: booking._id,
        message: 'Your booking has been scheduled successfully.'
      });
    }

    // Instead of old matchingService, use the new WaveManagerService (Urban Company style)
    const WaveManagerService = require('../../services/WaveManagerService');
    
    // Find nearby workers within 10km
    let waves = [];
    try {
      waves = await WaveManagerService.findAndGroupWorkers(
        booking.address.lat,
        booking.address.lng,
        draft.serviceId.defaultRadiusKm || 10,
        booking.serviceId
      );
    } catch (waveErr) {
      console.warn('[WaveManager] Error finding workers:', waveErr.message);
      waves = [];
    }

    if (waves.length === 0) {
      // No workers found
      booking.status = 'admin_action_required';
      if (!booking.adminLog) booking.adminLog = [];
      booking.adminLog.push({
        action: 'No Workers Found',
        reason: 'No online workers found within radius upon creation.',
        timestamp: new Date()
      });
      await booking.save();
    } else {
      // Set potential workers and start wave 1
      booking.potentialWorkers = waves.flat();
      booking.status = 'searching_worker';
      await booking.save();

      // Dispatch Wave 1 asynchronously so we don't block the response
      WaveManagerService.dispatchWave(booking._id.toString(), 0).catch(err => {
        console.error('[WaveManagerService Error]', err);
      });
    }

    res.status(200).json({
      success: true,
      bookingId: booking._id,
      message: waves.length === 0 ? 'Booking created but no workers available. Admin notified.' : 'Booking created. Searching for technicians...'
    });
  } catch (error) {
    console.error('Error confirming review:', error);
    res.status(500).json({ success: false, message: 'Server error: ' + error.message });
  }
};

/**
 * Short-polling live-check
 */
exports.liveCheck = async (req, res) => {
  try {
    const { draftId } = req.params;
    
    // In a real scenario, this checks redis/database for changes
    res.status(200).json({
      success: true,
      data: {
         slotAvailable: true,
         workerAvailable: true,
         pricingChanged: false,
         timestamp: Date.now()
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};
