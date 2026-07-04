const Booking = require('../models/Booking');
const { BOOKING_STATUS } = require('../utils/constants');
const { getIO } = require('../sockets');
const WaveManagerService = require('./WaveManagerService');

class ScheduledBookingScheduler {
  constructor() {
    this.intervalId = null;
    this.isRunning = false;
    this.checkIntervalMs = 60 * 1000; // Check every 60 seconds
    this.leadTimeMs = 30 * 60 * 1000; // Match 30 minutes in advance
  }

  start() {
    if (this.isRunning) {
      console.log('[ScheduledBookingScheduler] Already running.');
      return;
    }
    this.isRunning = true;
    console.log('[ScheduledBookingScheduler] Started successfully — check interval: 60s, lead time: 30m');
    
    this.intervalId = setInterval(async () => {
      await this.processScheduledBookings();
    }, this.checkIntervalMs);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      this.isRunning = false;
      console.log('[ScheduledBookingScheduler] Stopped.');
    }
  }

  async processScheduledBookings() {
    try {
      const now = new Date();
      const matchThresholdTime = new Date(now.getTime() + this.leadTimeMs);

      // Find scheduled bookings that start soon (within next 30 minutes) and haven't started matching yet
      const bookingsToMatch = await Booking.find({
        bookingType: 'scheduled',
        status: 'scheduled',
        scheduledStartAt: { $lte: matchThresholdTime, $gt: now }
      });

      if (bookingsToMatch.length === 0) {
        return;
      }

      console.log(`[ScheduledBookingScheduler] Found ${bookingsToMatch.length} scheduled bookings starting within 30m. Starting worker matching...`);

      let io = null;
      try {
        io = getIO();
      } catch (err) {
        console.warn('[ScheduledBookingScheduler] Socket.io not initialized. Skipping real-time emits.');
      }

      for (const booking of bookingsToMatch) {
        try {
          console.log(`[ScheduledBookingScheduler] Dispatching scheduled booking ${booking.bookingNumber} (Starts at: ${booking.scheduledStartAt})`);
          
          // Get dynamic search radius (default to 10km if not set on the service)
          let radius = 10;
          try {
            const OneTimeService = require('../models/OneTimeService');
            const service = await OneTimeService.findById(booking.serviceId);
            if (service && service.defaultRadiusKm) {
              radius = service.defaultRadiusKm;
            }
          } catch (err) {
            console.error('[ScheduledBookingScheduler] Error reading service radius config:', err.message);
          }

          // Group nearby available workers
          let waves = [];
          try {
            waves = await WaveManagerService.findAndGroupWorkers(
              booking.address.lat,
              booking.address.lng,
              radius,
              booking.serviceId
            );
          } catch (waveErr) {
            console.error('[ScheduledBookingScheduler] Wave finding error:', waveErr.message);
          }

          if (waves.length === 0) {
            // No workers found
            booking.status = 'admin_action_required';
            if (!booking.adminLog) booking.adminLog = [];
            booking.adminLog.push({
              action: 'No Workers Found',
              reason: 'No online workers found within radius upon schedule execution.',
              timestamp: new Date()
            });
            await booking.save();
            
            console.log(`[ScheduledBookingScheduler] Booking ${booking.bookingNumber}: No workers available near client coordinates. Set to admin action required.`);

            // Notify user & admin
            if (io) {
              io.to(`user_${booking.userId}`).emit('booking:scheduledMatchingFailed', {
                bookingId: booking._id,
                message: 'We could not find any technicians nearby for your scheduled slot. Admin has been notified to manually assign.'
              });
              io.to('admin:wbi').emit('admin:bookingUpdated', {
                bookingId: booking._id,
                status: 'admin_action_required'
              });
            }
          } else {
            // Workers found! Transition status and trigger wave dispatching
            booking.potentialWorkers = waves.flat();
            booking.status = 'searching_worker';
            booking.currentWave = 1;
            booking.waveStartedAt = new Date();
            await booking.save();

            console.log(`[ScheduledBookingScheduler] Booking ${booking.bookingNumber}: Worker matching started. Dispatched Wave 1.`);

            // Dispatch Wave 1
            await WaveManagerService.dispatchWave(booking._id.toString(), 0);

            // Notify User & Admin
            if (io) {
              io.to(`user_${booking.userId}`).emit('booking:scheduledMatchingStarted', {
                bookingId: booking._id,
                bookingNumber: booking.bookingNumber,
                message: 'Worker matching has started for your scheduled booking. A technician will be assigned shortly!'
              });
              io.to('admin:wbi').emit('admin:bookingUpdated', {
                bookingId: booking._id,
                status: 'searching_worker'
              });
            }
          }
        } catch (bookingErr) {
          console.error(`[ScheduledBookingScheduler] Error processing booking ${booking._id}:`, bookingErr);
        }
      }
    } catch (error) {
      console.error('[ScheduledBookingScheduler] Global tick process error:', error);
    }
  }
}

let schedulerInstance = null;

const initializeScheduledScheduler = () => {
  if (!schedulerInstance) {
    schedulerInstance = new ScheduledBookingScheduler();
    schedulerInstance.start();
  }
  return schedulerInstance;
};

module.exports = { initializeScheduledScheduler };
