const cron = require('node-cron');
const mongoose = require('mongoose');
const Booking = require('../models/Booking');
const Engineer = require('../models/Engineer');
const { getIO } = require('../sockets');

/**
 * Guard: Only run DB queries if Mongoose is actually connected
 * Prevents MongoServerSelectionError spam during DB outage/reconnect
 */
const isDbConnected = () => mongoose.connection.readyState === 1;

// Run every minute
const startUrgencyScheduler = () => {
  cron.schedule('* * * * *', async () => {
    // Skip if DB is not connected — will retry next minute automatically
    if (!isDbConnected()) {
      console.warn('[UrgencyScheduler] Skipping — MongoDB not connected. Will retry next cycle.');
      return;
    }

    try {
      const now = new Date();
      const thirtyMinsAgo = new Date(now.getTime() - 30 * 60000);
      const tenMinsAgo = new Date(now.getTime() - 10 * 60000);

      // Find timed out bookings (Batch of 50 to prevent memory bloat)
      const pendingBookings = await Booking.find({
        adminApprovalStatus: 'pending',
        $or: [
          { urgencyLevel: 'normal', urgencyTimerStartedAt: { $lte: thirtyMinsAgo } },
          { urgencyLevel: 'urgent', urgencyTimerStartedAt: { $lte: tenMinsAgo } },
          { urgencyLevel: { $exists: false }, urgencyTimerStartedAt: { $lte: thirtyMinsAgo } } // fallback
        ]
      }).limit(50);

      for (const booking of pendingBookings) {
        let shouldAutoAssign = true;
        let timeoutReason = booking.urgencyLevel === 'urgent' 
          ? 'Urgent request exceeded 10 mins admin timeout'
          : 'Normal request exceeded 30 mins admin timeout';

        if (shouldAutoAssign) {
          console.log(`[UrgencyScheduler] Auto-assigning booking ${booking.bookingNumber} (${timeoutReason})`);
          
          // Find best available worker (simplified for this context)
          const bestWorker = await Engineer.findOne({
            status: 'ONLINE',
            isOnline: true
            // Add category/skill matching here based on booking.categoryId
          }).sort({ rating: -1, completedJobs: -1 });

          if (bestWorker) {
            // Assign to worker
            booking.adminApprovalStatus = 'auto_assigned';
            booking.workerId = bestWorker._id;
            booking.adminLog.push({
              action: 'Auto-Assigned',
              reason: timeoutReason,
              timestamp: new Date()
            });

            await booking.save();

            // Notify Worker via Socket.IO
            const io = getIO();
            if (io) {
              io.to(`worker_${bestWorker._id}`).emit('auto_assigned_job', {
                bookingId: booking._id,
                message: `You have been automatically assigned a new job: ${booking.bookingNumber}`
              });
            }
            
            console.log(`[UrgencyScheduler] Successfully auto-assigned booking ${booking.bookingNumber} to Worker ${bestWorker._id}`);
          } else {
            booking.adminLog.push({
              action: 'Auto-Assign Failed',
              reason: 'No online workers found at timeout',
              timestamp: new Date()
            });
            booking.adminApprovalStatus = 'auto_assign_failed'; // Stop checking every minute
            await booking.save();
          }
        }
      }
    } catch (error) {
      // Log full error but don't crash the cron
      if (error.name === 'MongoServerSelectionError' || error.message?.includes('ECONNREFUSED')) {
        console.error('[UrgencyScheduler] DB connection lost during cron. Will retry next cycle.');
      } else {
        console.error('[UrgencyScheduler] Error processing timeouts:', error.message);
      }
    }
  });

  console.log('[UrgencyScheduler] Started — running every minute (30m/10m timeout check)');
};

module.exports = { startUrgencyScheduler };
