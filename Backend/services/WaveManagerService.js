const Booking = require('../models/Booking');
const BookingDispatchLog = require('../models/BookingDispatchLog');
const { getIO } = require('../sockets');
const { bookingAssignmentQueue } = require('./queueService');
const workerEligibility = require('./workerEligibility');

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
      const center = workerEligibility.getBookingCoords(booking);
      if (!center) {
        console.error(`[WaveManager] Booking ${bookingId} lacks valid coordinates for dispatch.`);
        return;
      }

      console.log(`[WaveManager] [MATCHING_STARTED] Searching radius ${radiusKm}km`);

      const eligibleWorkers = await workerEligibility.findEligibleWorkers(booking, radiusKm);

      console.log(`[WaveManager] [WORKERS_FOUND:${eligibleWorkers.length}] Radius ${radiusKm}km`);

      eligibleWorkers.sort((a, b) => (a.distance || 0) - (b.distance || 0));

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
          waveNumber: waveIndex + 1,
          workers: newEligibleWorkers.map((w) => ({
            id: w._id,
            name: w.name,
            photo: w.profilePhoto,
            rating: w.rating || 4.5,
            lat: w.location?.coordinates?.[1] || w.address?.lat || null,
            lng: w.location?.coordinates?.[0] || w.address?.lng || null,
            distance: w.distance
          }))
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
          distance: workerObj.distance || 0,
          dispatchWave: waveIndex + 1,
          status: 'NOTIFIED'
        });

        const distanceKm = Number(workerObj.distance || 0).toFixed(1);

        // Socket.io Real-time Push
        if (io) {
          const payload = {
            bookingId: booking._id,
            serviceName: booking.serviceName,
            address: booking.address,
            scheduledDate: booking.scheduledDate,
            scheduledTime: booking.scheduledTime,
            price: booking.basePrice,
            distance: distanceKm,
            distanceKm,
            waveNumber: waveIndex + 1,
            timeoutSec: this.WAVE_TIMEOUT_MS / 1000
          };
          io.to(`worker:${workerIdStr}`).emit('worker:newBookingRequest', payload);
          io.to(`worker_${workerIdStr}`).emit('worker:newBookingRequest', payload);
        }

        // Firebase Push Notification for offline/background fallback
        try {
          await sendNotificationToWorker(workerIdStr, {
            title: 'New Service Request! 🛠️',
            body: `You have a new booking request for ${booking.serviceName} at ₹${booking.basePrice}. (${distanceKm} km away)`,
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
      const bookingLike = {
        serviceId,
        address: { lat, lng }
      };
      const workers = await workerEligibility.findEligibleWorkers(bookingLike, radius * 5);
      console.log(`[WaveManager] findAndGroupWorkers found ${workers.length} potential workers.`);

      const waves = [];
      const WAVE_SIZE = 3;
      for (let i = 0; i < workers.length; i += WAVE_SIZE) {
        const waveWorkers = workers.slice(i, i + WAVE_SIZE).map(w => ({
          workerId: w._id,
          distance: w.distance || 0
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
