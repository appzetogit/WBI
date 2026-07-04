const Worker = require('../models/Worker');
const Booking = require('../models/Booking');
const BookingDispatchLog = require('../models/BookingDispatchLog');
const { getIO } = require('../sockets');
const { bookingAssignmentQueue } = require('./queueService');

class WaveManagerService {
  constructor() {
    // Define the dispatch waves in KM
    // Wave 1: 100KM, Wave 2: 150KM, Wave 3: 200KM, Wave 4: 300KM, Wave 5: 500KM (State approx), Wave 6: 3000KM (Nationwide approx)
    this.WAVE_RADII = [100, 150, 200, 300, 500, 3000];
    this.WAVE_TIMEOUT_MS = 30000; // 30 seconds per wave
  }

  /**
   * Dispatches a specific wave of workers for a booking
   * This is triggered initially by the booking creation, and subsequently by the timeout queue
   */
  async dispatchWave(bookingId, waveIndex = 0) {
    try {
      console.log(`[WaveManager] Dispatching Wave ${waveIndex + 1} for Booking ${bookingId}`);
      
      const booking = await Booking.findById(bookingId);
      if (!booking) {
        console.log(`[WaveManager] Booking ${bookingId} not found`);
        return;
      }

      // If booking is already assigned or cancelled, stop dispatching
      if (booking.status !== 'searching_worker') {
        console.log(`[WaveManager] Booking ${bookingId} is no longer searching (Status: ${booking.status}). Halting dispatch.`);
        return;
      }

      if (waveIndex >= this.WAVE_RADII.length) {
        console.log(`[WaveManager] All waves exhausted for Booking ${bookingId}. No workers accepted.`);
        const io = getIO();
        if (io) {
          io.to(`booking_${bookingId}`).emit('booking:noWorkerAvailable');
        }
        // Could automatically transition booking status to admin_action_required here
        booking.status = 'admin_action_required';
        booking.adminLog.push({
          action: 'All Dispatch Waves Exhausted',
          reason: 'No workers accepted the booking across all waves.',
          timestamp: new Date()
        });
        await booking.save();
        return;
      }

      const radiusKm = this.WAVE_RADII[waveIndex];
      const radiusMeters = radiusKm * 1000;
      
      const { lat, lng } = booking.address;
      if (!lat || !lng) {
        console.error(`[WaveManager] Booking ${bookingId} lacks valid coordinates for dispatch.`);
        return;
      }

      // 1. Eligibility Filter & Geospatial Search
      // We do a broader query first to log exactly WHY workers were rejected
      console.log(`[WaveManager] [MATCHING_STARTED] Searching radius ${radiusKm}km`);
      
      const workers = await Worker.aggregate([
        {
          $geoNear: {
            near: {
              type: "Point",
              coordinates: [parseFloat(lng), parseFloat(lat)]
            },
            distanceField: "calculatedDistance",
            maxDistance: radiusMeters,
            spherical: true,
            query: { isActive: true } // Only pull active accounts
          }
        }
      ]);

      let onlineCount = 0;
      let approvedCount = 0;
      let serviceMatchCount = 0;
      const eligibleWorkers = [];

      const bookingServiceIdStr = booking.serviceId ? booking.serviceId.toString() : null;
      const bookingServiceName = booking.serviceName ? booking.serviceName.toLowerCase() : '';

      workers.forEach(w => {
        // Log Offline/Busy
        if (w.status !== 'ONLINE') {
           console.log(`[WaveManager] Rejected ${w._id}: Offline or Busy (Status: ${w.status})`);
           return;
        }
        onlineCount++;
        let isEligible = true;
        let rejectReason = '';

        if (!w.isActive) {
          isEligible = false;
          rejectReason = 'inactive';
        } else if (w.approvalStatus !== 'approved') {
          isEligible = false;
          rejectReason = 'unverified';
          approvedCount--;
        } else if (w.status !== 'ONLINE') {
          isEligible = false;
          rejectReason = 'offline';
          onlineCount--;
        }

        if (!isEligible) {
           console.log(`[WaveManager] Rejected ${w._id}: ${rejectReason}`);
           return;
        }

        // Log Service Matching
        let hasService = false;
        if (bookingServiceIdStr) {
          const hasCat = w.serviceCategoryRefs?.some(id => id.toString() === bookingServiceIdStr);
          const hasOneTime = w.approvedOneTimeServices?.some(id => id.toString() === bookingServiceIdStr);
          const hasSub = w.subServices?.some(s => s.subServiceId && s.subServiceId.toString() === bookingServiceIdStr);
          
          if (hasCat || hasOneTime || hasSub) {
            hasService = true;
          }
        } 

        // Flexible Keyword Matching
        if (!hasService && bookingServiceName) {
           const workerServiceNames = [
             ...(w.subServices?.map(s => s.name?.toLowerCase()) || []),
             ...(w.customSkills?.map(s => s.name?.toLowerCase()) || []),
             ...(w.serviceCategories?.map(s => typeof s === 'string' ? s.toLowerCase() : '') || []),
             ...(w.skills || []).map(s => typeof s === 'string' ? s.toLowerCase() : '')
           ];
           
           for (const wService of workerServiceNames) {
              if (!wService) continue;
              if (wService.includes(bookingServiceName) || bookingServiceName.includes(wService)) { hasService = true; break; }
              if (bookingServiceName.includes('ac ') && wService.includes('ac ')) { hasService = true; break; }
              if (bookingServiceName.includes('washing machine') && wService.includes('washing machine')) { hasService = true; break; }
              if (bookingServiceName.includes('geyser') && wService.includes('geyser')) { hasService = true; break; }
              if (bookingServiceName.includes('plumb') && wService.includes('plumb')) { hasService = true; break; }
              if (bookingServiceName.includes('electric') && wService.includes('electric')) { hasService = true; break; }
              if (bookingServiceName.includes('clean') && wService.includes('clean')) { hasService = true; break; }
              if (bookingServiceName.includes('cctv') && wService.includes('cctv')) { hasService = true; break; }
              if (bookingServiceName.includes('ro ') && wService.includes('ro ')) { hasService = true; break; }
              if (bookingServiceName.includes('fridge') && (wService.includes('fridge') || wService.includes('refrigerator'))) { hasService = true; break; }
              if (bookingServiceName.includes('purifier') && (wService.includes('purifier') || wService.includes('ro '))) { hasService = true; break; }
           }
        }

        // If still no match, fallback to true if config allows it, but for now we reject
        // We will default to true if the booking has no serviceId
        if (!bookingServiceIdStr && !bookingServiceName) {
          hasService = true;
        }

        if (!hasService) {
           console.log(`[WaveManager] Rejected ${w._id}: Wrong service (Lacks ${bookingServiceIdStr} / ${bookingServiceName})`);
           return;
        }
        serviceMatchCount++;

        // Calculate Priority Score
        const rating = w.rating || 0;
        const jobs = w.completedJobs || 0;
        w.priorityScore = (rating * 10) + jobs - (w.calculatedDistance / 1000);

        eligibleWorkers.push(w);
      });

      console.log(`[WaveManager] [WORKERS_FOUND:${eligibleWorkers.length}] Radius ${radiusKm}km Stats: Found ${workers.length} active -> ${onlineCount} online -> ${approvedCount} approved -> ${serviceMatchCount} service matched.`);

      eligibleWorkers.sort((a, b) => b.priorityScore - a.priorityScore);

      // Filter out workers who have already been notified in previous waves
      const previouslyNotifiedIds = (booking.notifiedWorkers || []).map(id => id.toString());
      // CRITICAL FIX: Use eligibleWorkers, NOT workers!
      const newEligibleWorkers = eligibleWorkers.filter(w => !previouslyNotifiedIds.includes(w._id.toString()));

      if (newEligibleWorkers.length === 0) {
        console.log(`[WaveManager] No new eligible workers found in Wave ${waveIndex + 1} (${radiusKm} KM). Expanding to next wave...`);
        // Expand immediately to the next wave if no one is found in this radius
        return this.dispatchWave(bookingId, waveIndex + 1);
      }

      console.log(`[WaveManager] Wave ${waveIndex + 1} found ${newEligibleWorkers.length} eligible workers.`);

      const io = getIO();
      if (io) {
        io.to(`booking_${bookingId}`).emit('booking:searchStarted', {
          radius: radiusKm,
          center: booking.address,
          waveNumber: waveIndex + 1
        });
        io.to(`booking_${bookingId}`).emit('booking:workersFound', {
          count: newEligibleWorkers.length,
          waveNumber: waveIndex + 1
        });
      }

      // Update booking state
      booking.currentWave = waveIndex + 1;
      booking.waveStartedAt = new Date();
      
      const newWorkerIds = newEligibleWorkers.map(w => w._id);
      booking.notifiedWorkers = [...new Set([...booking.notifiedWorkers, ...newWorkerIds])];
      await booking.save();

      // Parallel Dispatch
      const { sendNotificationToWorker } = require('./firebaseAdmin');
      
      const dispatchPromises = newEligibleWorkers.map(async (workerObj) => {
        const workerIdStr = workerObj._id.toString();
        
        // Log the dispatch
        await BookingDispatchLog.create({
          bookingId: booking._id,
          workerId: workerObj._id,
          distance: workerObj.calculatedDistance,
          dispatchWave: waveIndex + 1,
          status: 'NOTIFIED'
        });

        // Socket.io Real-time Push
        if (io) {
          io.to(`worker:${workerIdStr}`).emit('worker:newBookingRequest', {
            bookingId: booking._id,
            serviceName: booking.serviceName,
            address: booking.address,
            scheduledDate: booking.scheduledDate,
            scheduledTime: booking.scheduledTime,
            price: booking.basePrice,
            distance: (workerObj.calculatedDistance / 1000).toFixed(1),
            waveNumber: waveIndex + 1,
            timeoutSec: this.WAVE_TIMEOUT_MS / 1000
          });
        }

        // Firebase Push Notification for offline/background fallback
        try {
          await sendNotificationToWorker(workerIdStr, {
            title: 'New Service Request! 🛠️',
            body: `You have a new booking request for ${booking.serviceName} at ₹${booking.basePrice}. (${(workerObj.calculatedDistance / 1000).toFixed(1)} km away)`,
            data: { bookingId: booking._id.toString(), type: 'new_booking_request' }
          });
        } catch (err) {
          console.warn(`[FCM] Notification dispatch failed for worker ${workerIdStr}:`, err.message);
        }
      });

      // Execute all notifications simultaneously
      await Promise.allSettled(dispatchPromises);

      // Add Delayed Job to Queue (timeout after 30 seconds to trigger next wave)
      await bookingAssignmentQueue.add(
        'processWaveTimeout',
        { bookingId: booking._id.toString(), waveIndex: waveIndex },
        { delay: this.WAVE_TIMEOUT_MS, jobId: `timeout-${booking._id}-${waveIndex}` }
      );
      
      console.log(`[WaveManager] Added timeout job for Wave ${waveIndex + 1} with ${this.WAVE_TIMEOUT_MS}ms delay.`);

    } catch (error) {
      console.error(`[WaveManager] Error in dispatchWave:`, error);
    }
  }

  /**
   * Finds nearby workers, groups them into waves (arrays of arrays), and returns the grouped array.
   * This is required by the checkout controller and scheduler.
   */
  async findAndGroupWorkers(lat, lng, radius = 10, serviceId = null) {
    try {
      let query = {
        status: 'ONLINE',
        isActive: true,
        approvalStatus: 'approved'
      };

      if (lat && lng) {
        query.location = {
          $nearSphere: {
            $geometry: {
              type: 'Point',
              coordinates: [parseFloat(lng), parseFloat(lat)]
            },
            $maxDistance: radius * 1000 * 10 // 10x radius fallback for dev
          }
        };
      }

      let workers = await Worker.find(query).select('_id name location status').lean();

      if (workers.length === 0) {
        // Fallback: any online worker
        workers = await Worker.find({ status: 'ONLINE', isActive: true, approvalStatus: 'approved' }).select('_id name location status').lean();
      }

      console.log(`[WaveManager] findAndGroupWorkers found ${workers.length} potential workers.`);

      const waves = [];
      const WAVE_SIZE = 3;
      for (let i = 0; i < workers.length; i += WAVE_SIZE) {
        const waveWorkers = workers.slice(i, i + WAVE_SIZE).map(w => ({
          workerId: w._id,
          distance: 0
        }));
        waves.push(waveWorkers);
      }
      return waves;
    } catch (err) {
      console.error('[WaveManager] Error in findAndGroupWorkers:', err);
      return [];
    }
  }

}

module.exports = new WaveManagerService();
