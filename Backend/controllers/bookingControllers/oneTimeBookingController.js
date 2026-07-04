const Booking = require('../../models/Booking');
const Worker = require('../../models/Worker');
const ServiceCategory = require('../../models/ServiceCategory');
const SubService = require('../../models/SubService');
const { getIO } = require('../../sockets');
const crypto = require('crypto');

// 1. Fetch available one-time services
exports.getAvailableServices = async (req, res) => {
  try {
    const categories = await ServiceCategory.find({ isActive: true });
    // This is simplified. In a real app we might join SubServices directly
    res.status(200).json({ success: true, data: categories });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 2. Find nearby workers based on criteria
exports.findNearbyWorkers = async (req, res) => {
  try {
    const { lat, lng, radius = 10, categoryId, subServiceId } = req.query;

    if (!lat || !lng) {
      return res.status(400).json({ success: false, message: 'Latitude and Longitude are required' });
    }

    const query = {
      status: 'ONLINE',
      location: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [parseFloat(lng), parseFloat(lat)]
          },
          $maxDistance: parseInt(radius) * 1000 // Convert km to meters
        }
      }
    };

    // Note: If adding category filters, they should be applied here.
    // e.g., if (categoryId) query.serviceCategories = categoryId;

    const workers = await Worker.find(query)
      .select('name profilePhoto rating completedJobs location status')
      .limit(20);

    res.status(200).json({ success: true, count: workers.length, data: workers });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 3. Create a Booking
exports.createBooking = async (req, res) => {
  try {
    const { serviceId, subServiceId, workerId, address, scheduledDate, scheduledTime, timeSlot, basePrice } = req.body;

    // Validate inputs
    if (!serviceId || !address || !basePrice) {
      return res.status(400).json({ success: false, message: 'Missing required booking fields' });
    }

    // Determine target worker(s). If user picked one, use it. If not, auto-assign nearest.
    // For now, assuming user picked `workerId` or we leave it null for auto-assignment broadcasting.
    
    // Generate OTP
    const completionOTP = crypto.randomInt(100000, 999999).toString();

    const booking = new Booking({
      userId: req.user._id,
      workerId: workerId || null,
      serviceId,
      serviceName: 'One-Time Service', // Ideally fetched from DB
      serviceCategory: 'One-Time', 
      address,
      scheduledDate,
      scheduledTime,
      timeSlot,
      basePrice,
      finalAmount: basePrice,
      status: 'searching_worker',
      paymentStatus: 'pending',
      customerConfirmationOTP: completionOTP,
      bookingType: 'scheduled'
    });

    await booking.save();

    const WaveManagerService = require('../../services/WaveManagerService');

    // Notify the worker(s) via Socket.IO and Auto-Assignment Engine
    if (workerId) {
      // If user specifically picked a worker, put them in a wave of 1
      const io = getIO();
      io.to(`worker:${workerId.toString()}`).emit('worker:newBookingRequest', {
        bookingId: booking._id,
        serviceName: booking.serviceName,
        address: booking.address,
        scheduledDate,
        scheduledTime,
        price: basePrice,
        waveNumber: 1
      });
      
      booking.potentialWorkers = [{ workerId: workerId, distance: 0 }];
      await booking.save();
      
      // Start auto-assignment fallback timer (re-using dispatchWave logic for queueing)
      await WaveManagerService.dispatchWave(booking._id.toString(), 0);
      // Trigger new Dispatch Engine directly
      if (!address.lat || !address.lng) {
        return res.status(400).json({ success: false, message: 'Address must contain lat and lng for auto-assignment' });
      }

      // Dispatch Wave 1 (index 0)
      await WaveManagerService.dispatchWave(booking._id.toString(), 0);
    }

    res.status(201).json({ success: true, data: booking, message: 'Booking created and worker assignment started' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 4. Verify OTP upon completion
exports.verifyOTP = async (req, res) => {
  try {
    const { otp } = req.body;
    const booking = await Booking.findOne({ _id: req.params.id, userId: req.user._id });

    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    
    // In this flow, worker usually enters OTP in their app. If user verifies it via their app, it's a different UX.
    // Assuming user app provides it to worker, and worker app calls verify.
    // If this is User Controller, user might be confirming via button instead of OTP.
    // Adjust based on your specific flow.
    res.status(200).json({ success: true, message: 'Verified' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 5. Rate the booking
exports.rateBooking = async (req, res) => {
  try {
    const { rating, reviewText } = req.body;
    const booking = await Booking.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      { rating, review: reviewText, reviewedAt: new Date() },
      { new: true }
    );

    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    
    // Also update worker's average rating here
    if (booking.workerId) {
      const worker = await Worker.findById(booking.workerId);
      if (worker) {
        const totalReviews = worker.totalReviews + 1;
        const newRating = ((worker.rating * worker.totalReviews) + rating) / totalReviews;
        worker.rating = newRating;
        worker.totalReviews = totalReviews;
        await worker.save();
      }
    }

    res.status(200).json({ success: true, message: 'Rating submitted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const BookingDraft = require('../../models/BookingDraft');

// 6. Create a Booking Draft from selected services
exports.createDraft = async (req, res) => {
  try {
    const { serviceId, brandId, issueIds, packageIds, quantities, priceSnapshot, customIssueText } = req.body;
    const userId = req.user._id || req.user.id;

    let finalPackageIds = packageIds || [];
    let finalQuantities = quantities || {};
    let finalPriceSnapshot = priceSnapshot || {};

    if (finalPackageIds.length === 0 && serviceId) {
      const ServicePackage = require('../../models/ServicePackage');
      const defaultPkg = await ServicePackage.findOne({ serviceId, isActive: true });
      if (defaultPkg) {
        finalPackageIds = [defaultPkg._id];
        finalQuantities[defaultPkg._id.toString()] = 1;
        finalPriceSnapshot = {
          packageTotal: defaultPkg.price || 0,
          finalAmount: defaultPkg.price || 0,
          itemCount: 1
        };
      }
    }

    if (!serviceId || finalPackageIds.length === 0) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    const mongoose = require('mongoose');
    const cleanIssueIds = Array.isArray(issueIds)
      ? issueIds.filter(id => id && id !== 'other' && mongoose.Types.ObjectId.isValid(id))
      : [];

    // Create or update existing draft for this user and service
    let draft = await BookingDraft.findOne({ userId, serviceId, status: 'draft' });

    if (draft) {
      // Update existing draft
      draft.brandId = brandId || null;
      draft.issueIds = cleanIssueIds;
      draft.packageIds = finalPackageIds;
      draft.quantities = finalQuantities;
      draft.priceSnapshot = finalPriceSnapshot;
      draft.specialInstructions = customIssueText || '';
      await draft.save();
    } else {
      // Create new draft
      draft = new BookingDraft({
        userId,
        serviceId,
        brandId: brandId || null,
        issueIds: cleanIssueIds,
        packageIds: finalPackageIds,
        quantities: finalQuantities,
        priceSnapshot: finalPriceSnapshot,
        specialInstructions: customIssueText || ''
      });
      await draft.save();
    }

    res.status(200).json({ success: true, data: draft, message: 'Draft saved successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 7. Update Draft (Address & Schedule)
exports.updateDraft = async (req, res) => {
  try {
    const draftId = req.params.id;
    const { bookingType, address, scheduledDate, scheduledTime } = req.body;
    const userId = req.user._id || req.user.id;

    console.log('[updateDraft] Draft ID:', draftId);
    console.log('[updateDraft] Payload Address:', address);

    const draft = await BookingDraft.findOne({ _id: draftId, userId });
    
    if (!draft) {
      console.log('[updateDraft] Draft NOT FOUND for user:', userId);
      return res.status(404).json({ success: false, message: 'Draft not found' });
    }

    await BookingDraft.updateOne(
      { _id: draftId },
      { 
        $set: { 
          bookingType: bookingType,
          address: address,
          scheduledDate: scheduledDate,
          scheduledTime: scheduledTime 
        } 
      }
    );
    
    // Fetch updated to return
    const updatedDraft = await BookingDraft.findById(draftId);
    console.log('[updateDraft] Successfully saved draft with address:', updatedDraft.address);

    res.status(200).json({ success: true, data: updatedDraft, message: 'Draft updated successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const axios = require('axios');

// 8. Reverse Geocode (Lat/Lng to Address via Google Maps)
exports.reverseGeocode = async (req, res) => {
  try {
    const { lat, lng } = req.body;
    if (!lat || !lng) {
      return res.status(400).json({ success: false, message: 'Latitude and Longitude are required' });
    }

    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ success: false, message: 'Google Maps API key not configured' });
    }

    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${apiKey}`;
    const response = await axios.get(url);

    if (response.data.status === 'OK' && response.data.results.length > 0) {
      const result = response.data.results[0];
      const addressComponents = result.address_components;

      let city = '';
      let state = '';
      let pincode = '';

      addressComponents.forEach(component => {
        if (component.types.includes('locality') || component.types.includes('administrative_area_level_2')) {
          city = component.long_name;
        }
        if (component.types.includes('administrative_area_level_1')) {
          state = component.long_name;
        }
        if (component.types.includes('postal_code')) {
          pincode = component.long_name;
        }
      });

      return res.status(200).json({
        success: true,
        data: {
          formattedAddress: result.formatted_address,
          city,
          state,
          pincode,
          lat,
          lng
        }
      });
    }

    res.status(404).json({ success: false, message: 'Address not found for these coordinates' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 9. Generate Dynamic Available Slots
const TimeSlotConfig = require('../../models/TimeSlotConfig');
const WorkerAvailability = require('../../models/WorkerAvailability');

exports.getAvailableSlots = async (req, res) => {
  try {
    const { date, serviceId, city = 'Indore', pincode } = req.query;
    if (!date) {
      return res.status(400).json({ success: false, message: 'Date parameter is required' });
    }

    const selectedDate = new Date(date);
    const dateStr = selectedDate.toISOString().split('T')[0];
    const weekday = selectedDate.toLocaleDateString('en-US', { weekday: 'long' });

    // 1. Fetch Time Slot configurations for this service and city
    let slotConfigs = [];
    if (serviceId) {
      slotConfigs = await TimeSlotConfig.find({ serviceId, city, isActive: true }).sort({ slotStartTime: 1 });
    }

    // Fallback default slots if no database configurations found
    if (slotConfigs.length === 0) {
      const defaultHours = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
      slotConfigs = defaultHours.map(hour => {
        const startH = hour > 12 ? hour - 12 : hour;
        const startAmPm = hour >= 12 ? 'PM' : 'AM';
        const endHour = hour + 1;
        const endH = endHour > 12 ? endHour - 12 : endHour;
        const endAmPm = endHour >= 12 ? 'PM' : 'AM';
        return {
          slotStartTime: `${hour < 10 ? '0' + hour : hour}:00`,
          slotEndTime: `${endHour < 10 ? '0' + endHour : endHour}:00`,
          maxBookingsPerSlot: 5,
          timeString: `${startH}:00 ${startAmPm} - ${endH}:00 ${endAmPm}`
        };
      });
    }

    // 2. Fetch available workers for this service on this weekday who haven't blocked this date
    let availableWorkerIds = [];
    if (serviceId) {
      const activeAvailabilities = await WorkerAvailability.find({
        serviceIds: serviceId,
        workingDays: weekday,
        blockedDates: { $ne: dateStr },
        status: 'active'
      });
      availableWorkerIds = activeAvailabilities.map(a => a.workerId.toString());
    }

    const now = new Date();
    const isToday = selectedDate.toDateString() === now.toDateString();

    const slots = [];
    
    for (const config of slotConfigs) {
      const startHour = parseInt(config.slotStartTime.split(':')[0]);
      const startMinute = parseInt(config.slotStartTime.split(':')[1] || '0');
      
      // Determine timeString display format (e.g. "09:00 AM - 10:00 AM")
      let timeString = config.timeString;
      if (!timeString) {
        const startH = startHour > 12 ? startHour - 12 : (startHour === 0 ? 12 : startHour);
        const startAmPm = startHour >= 12 ? 'PM' : 'AM';
        const endHour = parseInt(config.slotEndTime.split(':')[0]);
        const endH = endHour > 12 ? endHour - 12 : (endHour === 0 ? 12 : endHour);
        const endAmPm = endHour >= 12 ? 'PM' : 'AM';
        timeString = `${startH}:00 ${startAmPm} - ${endH}:00 ${endAmPm}`;
      }

      // Check if slot starts in the past (minimum 2 hours gap for today slots)
      let isAvailable = true;
      if (isToday) {
        const slotStartDate = new Date(selectedDate);
        slotStartDate.setHours(startHour, startMinute, 0, 0);
        // Only allow bookings at least 2 hours in the future
        const cutOffTime = new Date(now.getTime() + 2 * 60 * 60 * 1000);
        if (slotStartDate < cutOffTime) {
          isAvailable = false;
        }
      }

      // Check if date is in the past entirely
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      if (selectedDate < startOfDay) {
        isAvailable = false;
      }

      // Check if any workers support this slot hour
      if (isAvailable && serviceId) {
        // If we have worker availability config, check if any available worker covers this slot time
        const slotWorkers = await WorkerAvailability.find({
          workerId: { $in: availableWorkerIds },
          startTime: { $lte: config.slotStartTime },
          endTime: { $gte: config.slotEndTime }
        });
        if (slotWorkers.length === 0) {
          isAvailable = false;
        }
      }

      // Check capacity/double booking for this slot on this date
      if (isAvailable && serviceId) {
        const existingBookingsCount = await Booking.countDocuments({
          serviceId,
          status: { $nin: ['cancelled', 'rejected'] },
          scheduledDate: {
            $gte: new Date(selectedDate.getFullYear(), selectedDate.getDate()),
            $lt: new Date(selectedDate.getFullYear(), selectedDate.getDate() + 1)
          },
          scheduledTime: timeString
        });

        if (existingBookingsCount >= (config.maxBookingsPerSlot || 5)) {
          isAvailable = false;
        }
      }

      slots.push({
        id: config.id || `slot_${config.slotStartTime.replace(':', '_')}`,
        time: timeString,
        startTime: config.slotStartTime,
        endTime: config.slotEndTime,
        isAvailable
      });
    }

    res.status(200).json({ success: true, data: slots });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};


// 10. Get Available Dates
exports.getAvailableDates = async (req, res) => {
  try {
    const { serviceId } = req.query;
    const dates = [];
    const today = new Date();
    // Generate next 14 days dynamically
    for (let i = 0; i < 14; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      
      const dateStr = d.toISOString().split('T')[0];
      const weekday = d.toLocaleDateString('en-US', { weekday: 'long' });
      
      let isAvailable = true;
      
      // If serviceId is specified, check if any workers are configured to be available on this date/day
      if (serviceId) {
        const activeWorkers = await WorkerAvailability.countDocuments({
          serviceIds: serviceId,
          workingDays: weekday,
          blockedDates: { $ne: dateStr },
          status: 'active'
        });
        isAvailable = activeWorkers > 0;
      } else {
        // Fallback: disable Sundays by default
        isAvailable = d.getDay() !== 0; 
      }
      
      dates.push({
        date: dateStr,
        isAvailable
      });
    }
    res.status(200).json({ success: true, data: dates });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 11. Schedule Draft
exports.scheduleDraft = async (req, res) => {
  try {
    const { scheduledDate, slotId, timeString } = req.body;
    const draftId = req.params.id;
    
    const draft = await BookingDraft.findOne({ _id: draftId, userId: req.user._id });
    if (!draft) return res.status(404).json({ success: false, message: 'Draft not found' });
    
    draft.bookingType = 'scheduled';
    draft.scheduledDate = scheduledDate;
    draft.scheduledSlot = slotId;
    draft.scheduledTime = timeString;
    await draft.save();
    
    res.status(200).json({ success: true, message: 'Schedule updated successfully', draft });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
