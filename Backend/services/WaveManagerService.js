const Worker = require('../models/Worker');
const Booking = require('../models/Booking');
const { getIO } = require('../sockets');
const { bookingAssignmentQueue } = require('./queueService');

class WaveManagerService {
  
  /**
   * Finds nearby workers, groups them into waves (arrays of arrays), and returns the grouped array.
   */
  async findAndGroupWorkers(lat, lng, radius = 10, serviceId = null) {
    // 1. Try to find online workers nearby approved for the service
    let query = {
      status: 'ONLINE'
    };

    if (lat && lng) {
      query.location = {
        $nearSphere: {
          $geometry: {
            type: 'Point',
            coordinates: [parseFloat(lng), parseFloat(lat)]
          },
          $maxDistance: 10000 * 1000 // Nationwide fallback (10,000 km) to support dev matching
        }
      };
    }

    if (serviceId) {
      query.approvedOneTimeServices = serviceId;
    }

    let workers = await Worker.find(query)
      .select('_id name rating completedJobs location fcmTokens')
      .lean();

    // Fallback 1: If no approved workers found, search for ANY online workers within wide radius
    if (workers.length === 0) {
      console.log('[WaveManager] No approved workers found, falling back to all online workers...');
      delete query.approvedOneTimeServices;
      workers = await Worker.find(query)
        .select('_id name rating completedJobs location fcmTokens')
        .lean();
    }

    // Fallback 2: If still no workers found (e.g. coordinates mismatch or missing location), match ANY online worker
    if (workers.length === 0) {
      console.log('[WaveManager] Fallback to matching ANY online worker without location restriction...');
      workers = await Worker.find({ status: 'ONLINE' })
        .select('_id name rating completedJobs location fcmTokens')
        .lean();
    }

    console.log(`[WaveManager] Found ${workers.length} workers total.`);

    // Group into waves - Set wave size to 50 so all matching workers are notified in parallel
    const WAVE_SIZE = 50;
    const waves = [];
    for (let i = 0; i < workers.length; i += WAVE_SIZE) {
      const waveWorkers = workers.slice(i, i + WAVE_SIZE).map(w => ({
        workerId: w._id,
        distance: 0
      }));
      waves.push(waveWorkers);
    }

    return waves;
  }

  /**
   * Dispatches a specific wave of workers for a booking
   */
  async dispatchWave(bookingId, waveNumber) {
    console.log(`[WaveManager] Dispatching Wave ${waveNumber} for Booking ${bookingId}`);
    
    const booking = await Booking.findById(bookingId);
    if (!booking) {
      console.log(`[WaveManager] Booking ${bookingId} not found`);
      return;
    }

    const io = getIO();
    
    // Emit search status to User tracking room so frontend updates immediately
    if (io) {
      io.to(`booking_${bookingId}`).emit('booking:searchStarted', {
        radius: 10000,
        center: booking.address
      });
      io.to(`booking_${bookingId}`).emit('booking:workersFound', {
        count: booking.potentialWorkers.length,
        workers: booking.potentialWorkers
      });
    }

    const WAVE_SIZE = 50;
    const totalWorkers = booking.potentialWorkers.length;
    const startIndex = (waveNumber - 1) * WAVE_SIZE;
    const endIndex = startIndex + WAVE_SIZE;

    if (startIndex >= totalWorkers) {
       console.log(`[WaveManager] Wave ${waveNumber} is out of bounds. All workers exhausted.`);
       if (io) {
         io.to(`booking_${bookingId}`).emit('booking:noWorkerAvailable');
       }
       return;
    }

    const currentWaveWorkers = booking.potentialWorkers.slice(startIndex, endIndex);

    // Update booking state
    booking.currentWave = waveNumber;
    booking.waveStartedAt = new Date();
    
    // Add current wave workers to notifiedWorkers array
    const newWorkerIds = currentWaveWorkers.map(w => w.workerId);
    booking.notifiedWorkers = [...new Set([...booking.notifiedWorkers, ...newWorkerIds])];
    
    await booking.save();

    // Broadcast to workers in this wave
    const { sendNotificationToWorker } = require('./firebaseAdmin');
    currentWaveWorkers.forEach(workerObj => {
      const workerIdStr = workerObj.workerId.toString();
      console.log(`[WaveManager] Emitting to worker:${workerIdStr}`);
      
      io.to(`worker:${workerIdStr}`).emit('worker:newBookingRequest', {
        bookingId: booking._id,
        serviceName: booking.serviceName,
        address: booking.address,
        scheduledDate: booking.scheduledDate,
        scheduledTime: booking.scheduledTime,
        price: booking.basePrice,
        waveNumber: waveNumber
      });

      // Emit to User tracking room that request has been sent to this worker
      if (io) {
        io.to(`booking_${bookingId}`).emit('booking:requestSentToWorker', {
          workerId: workerIdStr
        });
      }

      // Send Firebase push notification
      sendNotificationToWorker(workerIdStr, {
        title: 'New Service Request! 🛠️',
        body: `You have a new booking request for ${booking.serviceName} at ₹${booking.basePrice}.`,
        data: { bookingId: booking._id.toString(), type: 'new_booking_request' }
      }).catch(err => {
        console.warn(`[FCM] Notification dispatch failed for worker ${workerIdStr}:`, err.message);
      });
    });

    // Add Delayed Job to Queue (timeout after 60 seconds)
    await bookingAssignmentQueue.add(
      'processWaveTimeout',
      { bookingId: booking._id.toString(), waveNumber },
      { delay: 60000, jobId: `timeout-${booking._id}-${waveNumber}` }
    );
    
    console.log(`[WaveManager] Added timeout job for Wave ${waveNumber} with 60000ms delay.`);
  }

}

module.exports = new WaveManagerService();
