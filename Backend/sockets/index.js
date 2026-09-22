// Socket.io initialization
const { Server } = require('socket.io');

let io = null;

const attachRedisAdapter = async (ioInstance) => {
  if (process.env.REDIS_ENABLED !== 'true') {
    console.log('[Socket] Redis adapter skipped (REDIS_ENABLED != true)');
    return;
  }

  try {
    const { createAdapter } = require('@socket.io/redis-adapter');
    const Redis = require('ioredis');

    const redisUrl = process.env.REDIS_URL;
    const baseOpts = {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT, 10) || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
      maxRetriesPerRequest: null,
      enableReadyCheck: true
    };

    const pubClient = redisUrl ? new Redis(redisUrl, { maxRetriesPerRequest: null }) : new Redis(baseOpts);
    const subClient = pubClient.duplicate();

    pubClient.on('error', (err) => console.error('[Socket Redis pub]', err.message));
    subClient.on('error', (err) => console.error('[Socket Redis sub]', err.message));

    ioInstance.adapter(createAdapter(pubClient, subClient));
    console.log('[Socket] ✅ Redis adapter attached (PM2 cluster-safe)');
  } catch (err) {
    console.warn('[Socket] Redis adapter not attached — single-process mode:', err.message);
  }
};

const initializeSocket = (server) => {
  const allowedOrigins = [
    process.env.FRONTEND_URL,
    'http://localhost:5173',
    'http://localhost:5174',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:5174',
    'https://app.wbinfs.com',
    'https://www.app.wbinfs.com',
    'https://wbinfs.com',
    'https://api.wbinfs.com'
  ].filter(Boolean);

  io = new Server(server, {
    pingTimeout: 60000,
    pingInterval: 25000,
    cors: {
      origin: function (origin, callback) {
        // Allow requests with no origin
        if (!origin) return callback(null, true);
        // Allow if in allowed list or is a subdomain of wbinfs.com or vercel or any localhost/IP
        if (
          allowedOrigins.indexOf(origin) !== -1 ||
          origin.endsWith('wbinfs.com') ||
          origin.includes('.vercel.app') ||
          /^https?:\/\/(localhost|127\.0\.0\.1|10\.|192\.168\.|172\.)(:\d+)?$/.test(origin)
        ) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      },
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE"]
    },
    transports: ['polling', 'websocket']
  });

  // Non-blocking: rooms still work on one process if Redis is down
  attachRedisAdapter(io).catch((err) => {
    console.warn('[Socket] Redis adapter setup failed:', err.message);
  });

  // Authentication middleware for Socket.io
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) {
        socket.userId = 'anonymous';
        socket.userRole = 'GUEST';
        return next();
      }

      // Verify token using the same method as HTTP middleware. A token that
      // does not verify is NEVER trusted: its claims (userId/role) could be
      // forged, so the socket is treated as an anonymous guest and joins no
      // private rooms.
      const { verifyAccessToken } = require('../utils/tokenService');
      let decoded = null;
      try {
        decoded = verifyAccessToken(token);
      } catch (jwtErr) {
        decoded = null;
      }
      if (!decoded || !(decoded.userId || decoded.id || decoded.profileId)) {
        socket.userId = 'anonymous';
        socket.userRole = 'GUEST';
        return next();
      }
      socket.userId = String(decoded.userId || decoded.id || decoded.profileId);
      socket.userRole = decoded.role ? decoded.role.toUpperCase() : 'UNKNOWN';
      if (socket.userRole === 'SUPER_ADMIN') socket.userRole = 'ADMIN';

      // B2B sub-users receive their company's job events.
      if (socket.userRole === 'B2B') {
        try {
          const B2BUser = require('../models/B2BUser');
          const b2bUser = await B2BUser.findById(socket.userId).select('companyId').lean();
          socket.companyId = String(b2bUser?.companyId || socket.userId);
        } catch (_) {
          socket.companyId = socket.userId;
        }
      }
      next();
    } catch (error) {
      console.warn('[Socket Auth Error]', error.message);
      next();
    }
  });

  io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id} (User: ${socket.userId}, Role: ${socket.userRole})`);

    // Join user-specific room for notifications
    if (socket.userRole === 'USER') {
      socket.join(`user:${socket.userId.toString()}`);
      socket.join(`user_${socket.userId.toString()}`);
      socket.join(`client:${socket.userId.toString()}`); // New format
    } else if (socket.userRole === 'B2B') {
      const companyId = socket.companyId || socket.userId.toString();
      socket.join(`b2b:${companyId}`);
      socket.join(`company:${companyId}`);
      if (companyId !== socket.userId.toString()) socket.join(`b2b:${socket.userId.toString()}`);
    } else if (socket.userRole === 'VENDOR') {
      socket.join(`vendor:${socket.userId.toString()}`);
      socket.join(`vendor_${socket.userId.toString()}`);
      // Update vendor online status
      updateVendorOnlineStatus(socket.userId, true, socket.id);
    } else if (socket.userRole === 'WORKER') {
      socket.join(`worker:${socket.userId.toString()}`);
      socket.join(`worker_${socket.userId.toString()}`);
      // Update worker online status
      updateWorkerOnlineStatus(socket.userId, true, socket.id);
    } else if (socket.userRole === 'ENGINEER') {
      socket.join(`engineer:${socket.userId.toString()}`);
      socket.join(`worker:${socket.userId.toString()}`); // Ensure also joined since engineers perform worker jobs
      socket.join(`worker_${socket.userId.toString()}`);
      // Update worker online status
      updateWorkerOnlineStatus(socket.userId, true, socket.id);
    } else if (socket.userRole === 'ADMIN') {
      socket.join('admin');
      socket.join(`admin_${socket.userId.toString()}`);
      socket.join('admin:wbi'); // New format
    }

    // ── Authorization helpers (every privileged event checks the VERIFIED
    // socket identity, never ids sent by the client) ─────────────────────────
    const isSelfEngineer = (engineerId) =>
      socket.userRole === 'ENGINEER' && Boolean(engineerId) && String(socket.userId) === String(engineerId);

    const deny = (event, message = 'Not authorized') => {
      socket.emit('socket:error', { event, message });
    };

    /** Booking participants: the customer, the assigned worker/engineer, the vendor, or admin. */
    const bookingAccess = new Map();
    const canAccessBooking = async (bookingId) => {
      if (!bookingId || socket.userRole === 'GUEST') return false;
      if (socket.userRole === 'ADMIN') return true;
      const key = String(bookingId);
      if (bookingAccess.has(key)) return bookingAccess.get(key);
      try {
        const Booking = require('../models/Booking');
        const b = await Booking.findById(bookingId).select('userId workerId engineerId vendorId').lean();
        const uid = String(socket.userId);
        const ok = Boolean(b) && [b.userId, b.workerId, b.engineerId, b.vendorId].some((id) => id && String(id) === uid);
        // Only grants are cached — a worker assigned later must not stay locked out.
        if (ok) bookingAccess.set(key, true);
        return ok;
      } catch (_) {
        return false;
      }
    };

    /** Same scope rules as the HTTP job APIs (services/jobScope.service.js). */
    const canAccessJob = async (jobId) => {
      const mongoose = require('mongoose');
      if (!jobId || !mongoose.Types.ObjectId.isValid(String(jobId)) || socket.userRole === 'GUEST') return false;
      const { readScopeFilter } = require('../services/jobScope.service');
      const B2BJob = require('../models/B2BJob');
      const scope = readScopeFilter({
        userRole: socket.userRole,
        user: { _id: socket.userId },
        userId: socket.userId,
        companyId: socket.companyId
      });
      return Boolean(await B2BJob.exists({ $and: [{ _id: jobId }, scope] }));
    };

    // Explicit Room Join Events (Fallback/Frontend Initiated)
    socket.on('join_vendor_room', (vendorId) => {
      // Security check: ensure the socket user actually IS this vendor
      if (socket.userRole === 'VENDOR' && socket.userId.toString() === vendorId.toString()) {
        socket.join(`vendor_${vendorId.toString()}`);
        console.log(`Socket ${socket.id} explicitly joined room vendor_${vendorId}`);
      }
    });

    socket.on('join_user_room', (userId) => {
      // Ensure strings for comparison
      if (socket.userRole === 'USER' && socket.userId.toString() === userId.toString()) {
        socket.join(`user_${userId.toString()}`);
        console.log(`Socket ${socket.id} explicitly joined room user_${userId}`);
      }
    });

    socket.on('join_worker_room', (workerId) => {
      if (socket.userRole === 'WORKER' && socket.userId === workerId) {
        socket.join(`worker_${workerId}`);
        console.log(`Socket ${socket.id} explicitly joined room worker_${workerId}`);
      }
    });

    socket.on('worker:register', async (data) => {
      const { workerId, userId, role, device } = data || {};
      if (!workerId) return;
      // Only the authenticated worker/engineer may register (and join) their own room.
      if (!['WORKER', 'ENGINEER'].includes(socket.userRole) || String(socket.userId) !== String(workerId)) {
        return deny('worker:register');
      }

      console.log(`[WORKER_CONNECTED] Worker registered: ${workerId}`);

      socket.join(`worker:${workerId}`);
      socket.join(`worker_${workerId}`);
      socket.join('role:worker');
      
      console.log(`[WORKER_JOINED_ROOM] Worker ${workerId} joined room: worker:${workerId}`);

      try {
        const Worker = require('../models/Worker');
        await Worker.findByIdAndUpdate(workerId, { status: 'ONLINE' });

        const ActiveWorkerSession = require('../models/ActiveWorkerSession');
        await ActiveWorkerSession.findOneAndUpdate(
          { workerId },
          { 
            userId: userId || workerId,
            socketId: socket.id,
            isOnline: true,
            device: device || 'web',
            role: role || 'worker',
            lastSeen: new Date()
          },
          { upsert: true, new: true }
        );
      } catch (error) {
        console.error('[Socket] Error updating worker session:', error);
      }
    });

    socket.on('join_booking_search', async (bookingId) => {
      try {
        if (!bookingId) return;
        if (!(await canAccessBooking(bookingId))) return deny('join_booking_search');
        socket.join(`booking_${bookingId}`);
        console.log(`[Socket] Socket ${socket.id} joined booking search room booking_${bookingId}`);

        // Immediately respond with live status for newly joined sockets
        const Booking = require('../models/Booking');
        const booking = await Booking.findById(bookingId).populate('workerId notifiedWorkers').lean();
        if (booking) {
          const count = (booking.notifiedWorkers?.length || 0) || (booking.workerId ? 1 : 0);
          socket.emit('booking:searchStarted', {
            status: booking.status,
            message: 'Searching nearby experts...',
            radius: 100,
            center: { lat: booking.address?.lat, lng: booking.address?.lng }
          });
          if (count > 0) {
            socket.emit('booking:workersFound', {
              count: count,
              message: `${count} technician${count > 1 ? 's' : ''} found nearby`,
              workers: booking.notifiedWorkers || []
            });
            socket.emit('booking:requestSentToWorker', {
              count: count
            });
          }
          if (booking.status === 'worker_assigned' || booking.status === 'assigned') {
            socket.emit('booking:workerAccepted', {
              message: 'Technician confirmed!',
              workerId: booking.workerId?._id || booking.workerId
            });
          }
        }
      } catch (err) {
        console.error('[Socket] join_booking_search error:', err.message);
      }
    });

    // Live Tracking Events
    socket.on('join_tracking', async (bookingId) => {
      try {
        if (!bookingId || !socket.userId) return;

        const Booking = require('../models/Booking');
        const booking = await Booking.findById(bookingId)
          .select('userId workerId vendorId')
          .lean();

        if (!booking) {
          socket.emit('tracking_error', { message: 'Booking not found' });
          return;
        }

        const uid = String(socket.userId);
        const isParticipant =
          booking.userId?.toString() === uid ||
          booking.workerId?.toString() === uid ||
          booking.vendorId?.toString() === uid;

        if (!isParticipant) {
          console.warn(`[Socket] join_tracking denied user=${uid} booking=${bookingId}`);
          socket.emit('tracking_error', { message: 'Unauthorized' });
          return;
        }

        socket.join(`booking_${bookingId}`);
        console.log(`User ${socket.userId} joined tracking for booking_${bookingId}`);

        // Disconnect Recovery: Send last known location from Redis
        try {
          const { getLiveLocation } = require('../services/redisService');
          const cachedLocation = await getLiveLocation(bookingId);
          if (cachedLocation) {
            socket.emit('live_location_update', cachedLocation);
            console.log(`[Socket] Sent cached location to user for booking ${bookingId}`);
          }
        } catch (error) {
          console.error('[Socket] Error fetching cached location:', error);
        }
      } catch (err) {
        console.error('[Socket] join_tracking error:', err.message);
        socket.emit('tracking_error', { message: 'Unable to join tracking' });
      }
    });

    // Join a job room (every status change of that job is broadcast there).
    // Only callers who can see the job via the HTTP APIs may join.
    socket.on('join_job', async (jobId) => {
      try {
        if (!(await canAccessJob(jobId))) return deny('join_job');
        socket.join(`job:${jobId}`);
      } catch (_) {
        deny('join_job', 'Unable to join job room');
      }
    });

    socket.on('leave_job', (jobId) => {
      if (jobId) socket.leave(`job:${jobId}`);
    });

    // B2B Batch Tracking Room Join — the owning company (or admin) only.
    socket.on('join_batch', async (batchId) => {
      try {
        const mongoose = require('mongoose');
        if (!batchId || !mongoose.Types.ObjectId.isValid(String(batchId))) return deny('join_batch');
        if (socket.userRole !== 'ADMIN') {
          if (socket.userRole !== 'B2B') return deny('join_batch');
          const B2BBatch = require('../models/B2BBatch');
          const owned = await B2BBatch.exists({ _id: batchId, companyId: socket.companyId || socket.userId });
          if (!owned) return deny('join_batch');
        }
        socket.join(`batch:${batchId}`);
      } catch (_) {
        deny('join_batch', 'Unable to join batch room');
      }
    });

    // Vendor acknowledges receiving booking alert
    socket.on('booking_alert_received', async (data) => {
      try {
        const BookingRequest = require('../models/BookingRequest');
        await BookingRequest.findOneAndUpdate(
          { bookingId: data.bookingId, vendorId: socket.userId },
          { status: 'VIEWED', viewedAt: new Date(), socketDelivered: true }
        );
        console.log(`[Socket] Vendor ${socket.userId} viewed booking ${data.bookingId}`);
      } catch (error) {
        console.error('[Socket] Error updating booking request:', error);
      }
    });

    // Worker/Vendor sets availability
    socket.on('set_availability', async (data) => {
      try {
        const Vendor = require('../models/Vendor');
        const Worker = require('../models/Worker');

        if (socket.userRole === 'VENDOR') {
          await Vendor.findByIdAndUpdate(socket.userId, {
            availability: data.status // 'AVAILABLE', 'BUSY', etc.
          });
        } else if (socket.userRole === 'WORKER') {
          await Worker.findByIdAndUpdate(socket.userId, {
            status: data.status // 'ONLINE', 'BUSY', etc.
          });
        }
        console.log(`[Socket] ${socket.userRole} ${socket.userId} set availability to ${data.status}`);
      } catch (error) {
        console.error('[Socket] Error setting availability:', error);
      }
    });

    // Rate limiting map for location updates
    const locationUpdateTimestamps = new Map();

    socket.on('update_location', async (data) => {
      // data: { bookingId, lat, lng, heading }
      const lat = parseFloat(data?.lat);
      const lng = parseFloat(data?.lng);
      const heading = parseFloat(data?.heading) || 0;

      if (isNaN(lat) || isNaN(lng)) return;
      // Only the booking's own worker/vendor may publish its live location.
      if (!['WORKER', 'ENGINEER', 'VENDOR'].includes(socket.userRole) || !(await canAccessBooking(data.bookingId))) {
        return deny('update_location');
      }

      // Rate limiting: max 1 update per 2 seconds per booking
      const rateLimitKey = `${socket.userId}:${data.bookingId}`;
      const lastUpdate = locationUpdateTimestamps.get(rateLimitKey) || 0;
      const now = Date.now();
      if (now - lastUpdate < 2000) {
        return; // Skip this update, too frequent
      }
      locationUpdateTimestamps.set(rateLimitKey, now);

      const locationPayload = {
        lat,
        lng,
        heading,
        role: socket.userRole
      };

      // DEBUG: Log the broadcast
      console.log(`[Socket] 📍 Broadcasting location to booking_${data.bookingId}:`, { lat: lat.toFixed(6), lng: lng.toFixed(6), heading });

      // 1. Broadcast to everyone in the booking room (User is listening)
      socket.to(`booking_${data.bookingId}`).emit('live_location_update', locationPayload);

      // 2. Cache in Redis with TTL for disconnect recovery
      try {
        const { setLiveLocation, setVendorLocation } = require('../services/redisService');
        await setLiveLocation(data.bookingId, locationPayload, 30); // 30 second TTL

        // Also update vendor geo cache
        if (socket.userRole === 'VENDOR') {
          await setVendorLocation(socket.userId, lat, lng);
        }
      } catch (error) {
        console.error('[Socket] Error caching live location:', error);
      }

      // 3. Save latest location to Database (for initial tracking load)
      try {
        const Vendor = require('../models/Vendor');
        const Worker = require('../models/Worker');

        const updateData = {
          location: {
            type: 'Point',
            coordinates: [lng, lat],
            updatedAt: new Date()
          }
        };

        if (socket.userRole === 'VENDOR') {
          await Vendor.findByIdAndUpdate(socket.userId, updateData);
        } else if (socket.userRole === 'WORKER') {
          await Worker.findByIdAndUpdate(socket.userId, updateData);
        }
      } catch (error) {
        console.error('Error saving live location:', error);
      }
    });

    // Real-time Chat socket event handler
    socket.on('chat:send_message', async (data) => {
      try {
        const { bookingId, text, fileUrl, fileType, fileName } = data || {};
        if (!bookingId) return;
        if (!(await canAccessBooking(bookingId))) return deny('chat:send_message');

        const Chat = require('../models/Chat');
        const senderModel = socket.userRole === 'WORKER' ? 'Worker' : 'User';

        const message = await Chat.create({
          bookingId,
          senderId: socket.userId,
          senderModel,
          text: text || '',
          fileUrl: fileUrl || null,
          fileType: fileType || 'none',
          fileName: fileName || null,
          readBy: [socket.userId]
        });

        // Broadcast to everyone in the booking tracking room
        io.to(`booking_${bookingId}`).emit('chat:message_received', message);
        console.log(`[Socket] Chat message sent for booking_${bookingId} by ${socket.userId}`);
      } catch (error) {
        console.error('[Socket] Error sending chat message over socket:', error);
      }
    });

    // ==========================================
    // ENGINEER B2B LIVE TRACKING EVENTS
    // ==========================================

    socket.on('engineer:locationUpdated', async (data) => {
      try {
        const { engineerId, jobId, lat, lng, heading, speed, battery } = data || {};
        if (!engineerId || isNaN(parseFloat(lat)) || isNaN(parseFloat(lng))) return;
        // Location feeds routing (geo matching) — only the engineer themself may set it.
        if (!isSelfEngineer(engineerId)) return deny('engineer:locationUpdated');
        if (jobId && !(await canAccessJob(jobId))) return deny('engineer:locationUpdated', 'Not your job');

        const mongoose = require('mongoose');
        const Engineer = require('../models/Engineer');
        const EngineerLocationSession = require('../models/EngineerLocationSession');
        const B2BJob = require('../models/B2BJob');

        const engObjId = new mongoose.Types.ObjectId(engineerId);

        // 1. Update latest location in session
        const session = await EngineerLocationSession.findOneAndUpdate(
          { engineerId: engObjId },
          {
            currentLocation: { type: 'Point', coordinates: [parseFloat(lng), parseFloat(lat)] },
            heading: parseFloat(heading) || 0,
            speed: parseFloat(speed) || 0,
            battery: parseInt(battery) || 100,
            isOnline: true,
            socketId: socket.id,
            lastUpdatedAt: new Date()
          },
          { upsert: true, new: true }
        );

        // Update engineer collection
        await Engineer.findByIdAndUpdate(engObjId, {
          location: {
            lat: parseFloat(lat),
            lng: parseFloat(lng),
            updatedAt: new Date()
          },
          geoLocation: {
            type: 'Point',
            coordinates: [parseFloat(lng), parseFloat(lat)]
          }
        });

        // 2. Resolve active job & ETA
        let resolvedJobId = jobId;
        if (!resolvedJobId) {
          const activeJob = await B2BJob.findOne({
            assignedTo: engObjId,
            status: { $in: ['assigned', 'in_progress'] }
          }).select('_id').lean();
          if (activeJob) {
            resolvedJobId = activeJob._id.toString();
          }
        }

        let companyRoom = null;
        let eta = null;

        if (resolvedJobId && mongoose.Types.ObjectId.isValid(resolvedJobId)) {
          const job = await B2BJob.findById(resolvedJobId).select('companyId coordinates').lean();
          if (job) {
            companyRoom = `b2b:${job.companyId.toString()}`;
            if (job.coordinates && job.coordinates.coordinates) {
              const distance = calculateHaversineDistance(
                parseFloat(lat),
                parseFloat(lng),
                job.coordinates.coordinates[1],
                job.coordinates.coordinates[0]
              );
              eta = estimateETA(distance);
              
              await B2BJob.findByIdAndUpdate(job._id, { eta });

              if (companyRoom) {
                io.to(companyRoom).emit('b2b:etaUpdated', { jobId: job._id.toString(), eta });
              }
              io.to('admin').emit('b2b:etaUpdated', { jobId: job._id.toString(), eta });
            }
          }
        }

        // 3. Emit b2b:engineerLocationUpdated
        const payload = {
          engineerId,
          lat: parseFloat(lat),
          lng: parseFloat(lng),
          heading: parseFloat(heading) || 0,
          speed: parseFloat(speed) || 0,
          battery: parseInt(battery) || 100,
          status: session ? session.status : 'available',
          eta,
          lastUpdatedAt: new Date()
        };

        if (companyRoom) {
          io.to(companyRoom).emit('b2b:engineerLocationUpdated', payload);
        }
        io.to('admin').emit('b2b:engineerLocationUpdated', payload);

      } catch (error) {
        console.error('Error handling engineer:locationUpdated:', error);
      }
    });

    socket.on('engineer:statusChanged', async (data) => {
      try {
        const { engineerId, jobId, status, message } = data || {};
        if (!engineerId || !status) return;
        if (!isSelfEngineer(engineerId)) return deny('engineer:statusChanged');
        if (jobId && !(await canAccessJob(jobId))) return deny('engineer:statusChanged', 'Not your job');

        const mongoose = require('mongoose');
        const Engineer = require('../models/Engineer');
        const EngineerLocationSession = require('../models/EngineerLocationSession');
        const B2BJob = require('../models/B2BJob');
        const JobStatusLog = require('../models/JobStatusLog');

        const engObjId = new mongoose.Types.ObjectId(engineerId);

        await EngineerLocationSession.findOneAndUpdate(
          { engineerId: engObjId },
          { status, lastUpdatedAt: new Date() },
          { upsert: true }
        );

        let engineerStatus = 'ONLINE';
        if (status === 'offline') engineerStatus = 'OFFLINE';
        else if (status === 'on_break') engineerStatus = 'ONLINE';
        else if (['assigned', 'en_route', 'at_location', 'working'].includes(status)) engineerStatus = 'BUSY';

        await Engineer.findByIdAndUpdate(engObjId, { status: engineerStatus });

        let companyRoom = null;
        if (jobId && mongoose.Types.ObjectId.isValid(jobId)) {
          const job = await B2BJob.findById(jobId).select('companyId').lean();
          if (job) {
            companyRoom = `b2b:${job.companyId.toString()}`;
          }
        }

        const payload = { engineerId, status, message, lastUpdatedAt: new Date() };
        if (companyRoom) {
          io.to(companyRoom).emit('b2b:engineerStatusChanged', payload);
        }
        io.to('admin').emit('b2b:engineerStatusChanged', payload);

        if (jobId && mongoose.Types.ObjectId.isValid(jobId)) {
          await JobStatusLog.create({
            jobId: new mongoose.Types.ObjectId(jobId),
            engineerId: engObjId,
            status,
            message: message || `Status changed to ${status}`
          });
        }
      } catch (error) {
        console.error('Error handling engineer:statusChanged:', error);
      }
    });

    // ── Engineer lifecycle events (TazkY) ──────────────────────────────────
    // These used to let ANY socket (even an anonymous one) set ANY job's
    // status, bypassing OTP, photos and verification. They now:
    //   - require the verified engineer to be the one assigned,
    //   - go through the same validated lifecycle service as the HTTP API,
    //   - refuse start/complete, which need OTP + photo evidence (HTTP only).
    const recordLegacyTracking = async (jobId, engineerId, status, message, assignmentPatch) => {
      try {
        const mongoose = require('mongoose');
        const EngineerAssignment = require('../models/EngineerAssignment');
        const JobStatusLog = require('../models/JobStatusLog');
        const B2BJob = require('../models/B2BJob');
        const job = await B2BJob.findById(jobId).select('companyId').lean();
        const engObjId = new mongoose.Types.ObjectId(String(engineerId));
        if (job && assignmentPatch) {
          await EngineerAssignment.findOneAndUpdate(
            { jobId, engineerId: engObjId },
            { $set: assignmentPatch, $setOnInsert: { companyId: job.companyId } },
            { upsert: true }
          );
        }
        await JobStatusLog.create({ jobId, engineerId: engObjId, status, message });
      } catch (err) {
        console.warn('[Socket] legacy tracking write failed:', err.message);
      }
    };

    const runEngineerTransition = async (event, data, run) => {
      try {
        const { engineerId, jobId } = data || {};
        if (!jobId || !isSelfEngineer(engineerId || socket.userId)) return deny(event);
        const B2BJob = require('../models/B2BJob');
        const job = await B2BJob.findById(jobId).read('primary').lean();
        if (!job) return deny(event, 'Job not found');
        const updated = await run(job, String(socket.userId));
        socket.emit(`${event}:ack`, { jobId: String(jobId), status: updated?.status, lifecycleStatus: updated?.lifecycleStatus });
      } catch (error) {
        deny(event, error.message || 'Action failed');
      }
    };

    socket.on('engineer:jobAccepted', (data) =>
      runEngineerTransition('engineer:jobAccepted', data, async (job, engineerId) => {
        const { acceptAssignment } = require('../services/jobAssignment.service');
        const updated = await acceptAssignment({ jobId: job._id, engineerId });
        await recordLegacyTracking(job._id, engineerId, 'accepted', 'Engineer accepted the job assignment', {
          status: 'accepted', acceptedAt: new Date()
        });
        return updated;
      })
    );

    socket.on('engineer:enRoute', (data) =>
      runEngineerTransition('engineer:enRoute', data, async (job, engineerId) => {
        const { advanceEngineerJob } = require('../services/jobAssignment.service');
        const { LIFECYCLE } = require('../services/jobStateMachine');
        const updated = await advanceEngineerJob({
          job, engineerId, target: LIFECYCLE.EN_ROUTE, reason: 'Engineer started travel to site',
          event: 'ENGINEER_EN_ROUTE', patch: { travelStartedAt: new Date() }
        });
        await recordLegacyTracking(job._id, engineerId, 'en_route', 'Engineer started travel (En Route)', {
          status: 'en_route', enRouteAt: new Date()
        });
        return updated;
      })
    );

    socket.on('engineer:reachedLocation', (data) =>
      runEngineerTransition('engineer:reachedLocation', data, async (job, engineerId) => {
        const { advanceEngineerJob } = require('../services/jobAssignment.service');
        const { LIFECYCLE } = require('../services/jobStateMachine');
        const updated = await advanceEngineerJob({
          job, engineerId, target: LIFECYCLE.ARRIVED, reason: 'Engineer reached the site',
          event: 'ENGINEER_ARRIVED', patch: { arrivedAt: new Date() }
        });
        await recordLegacyTracking(job._id, engineerId, 'reached_location', 'Engineer reached location', {
          status: 'reached_location', reachedAt: new Date()
        });
        return updated;
      })
    );

    // Starting and completing work require the customer OTP and photo
    // evidence, which only the HTTP endpoints verify.
    socket.on('engineer:workStarted', (data) =>
      deny('engineer:workStarted', `Start work via POST /api/engineers/b2b-jobs/${data?.jobId || ':jobId'}/start (customer OTP + before photos required)`)
    );
    socket.on('engineer:jobCompleted', (data) =>
      deny('engineer:jobCompleted', `Complete work via POST /api/engineers/b2b-jobs/${data?.jobId || ':jobId'}/complete (after photos required)`)
    );

    socket.on('engineer:batteryUpdated', async (data) => {
      try {
        const { engineerId, battery } = data || {};
        if (!engineerId) return;
        if (!isSelfEngineer(engineerId)) return deny('engineer:batteryUpdated');

        const mongoose = require('mongoose');
        const B2BJob = require('../models/B2BJob');
        const EngineerLocationSession = require('../models/EngineerLocationSession');

        const engObjId = new mongoose.Types.ObjectId(engineerId);
        const level = parseInt(battery) || 100;

        await EngineerLocationSession.findOneAndUpdate(
          { engineerId: engObjId },
          { battery: level }
        );

        const activeJob = await B2BJob.findOne({
          assignedTo: engObjId,
          status: { $in: ['assigned', 'in_progress'] }
        }).select('companyId').lean();

        const payload = { engineerId, battery: level };
        if (activeJob) {
          const companyRoom = `b2b:${activeJob.companyId.toString()}`;
          io.to(companyRoom).emit('b2b:engineerLocationUpdated', payload);
        }
        io.to('admin').emit('b2b:engineerLocationUpdated', payload);
      } catch (error) {
        console.error('Error handling engineer:batteryUpdated:', error);
      }
    });

    socket.on('disconnect', () => {
      console.log(`Socket disconnected: ${socket.id}`);
      // Update online status
      if (socket.userRole === 'VENDOR') {
        updateVendorOnlineStatus(socket.userId, false, null);
      } else if (socket.userRole === 'WORKER' || socket.userRole === 'ENGINEER') {
        updateWorkerOnlineStatus(socket.userId, false, null);
      }
    });
  });

  console.log('Socket.io initialized successfully');
};

// Helper function to update vendor online status
const updateVendorOnlineStatus = async (vendorId, isOnline, socketId) => {
  try {
    const Vendor = require('../models/Vendor');
    const { setVendorOnline, setVendorAvailability } = require('../services/redisService');

    const updateData = {
      isOnline,
      currentSocketId: socketId
    };

    if (isOnline) {
      updateData.availability = 'AVAILABLE';
    } else {
      updateData.lastSeenAt = new Date();
      updateData.availability = 'OFFLINE';
    }

    // Update MongoDB
    await Vendor.findByIdAndUpdate(vendorId, updateData);

    // Update Redis cache (fast lookup)
    await setVendorOnline(vendorId, isOnline);
    await setVendorAvailability(vendorId, updateData.availability);

    console.log(`[Socket] Vendor ${vendorId} is now ${isOnline ? 'ONLINE' : 'OFFLINE'}`);
  } catch (error) {
    console.error('[Socket] Error updating vendor online status:', error);
  }
};

// Helper function to update worker online status
const updateWorkerOnlineStatus = async (workerId, isOnline, socketId) => {
  try {
    const Worker = require('../models/Worker');
    const ActiveWorkerSession = require('../models/ActiveWorkerSession');

    const updateData = {
      status: isOnline ? 'ONLINE' : 'OFFLINE',
    };

    if (!isOnline) {
      updateData.lastSeenAt = new Date();
    }

    // Update MongoDB
    await Worker.findByIdAndUpdate(workerId, updateData);

    // Update ActiveWorkerSession
    if (isOnline) {
       await ActiveWorkerSession.findOneAndUpdate(
          { workerId },
          { 
            socketId, 
            isOnline: true, 
            lastSeen: new Date(),
            userId: workerId.toString(),
            role: 'worker',
            device: 'web'
          },
          { upsert: true, new: true }
       );
    } else {
       await ActiveWorkerSession.findOneAndUpdate(
          { workerId },
          { isOnline: false, lastSeen: new Date() }
       );
       console.log(`[WORKER_DISCONNECTED] Worker disconnected: ${workerId}`);
    }

    console.log(`[Socket] Worker ${workerId} is now ${isOnline ? 'ONLINE' : 'OFFLINE'}`);
  } catch (error) {
    console.error('[Socket] Error updating worker online status:', error);
  }
};

// Get io instance for emitting notifications
// Helpers for B2B Live Tracking
const calculateHaversineDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const estimateETA = (distanceKm) => {
  if (distanceKm <= 0.05) return 0;
  const averageSpeedKmh = 25;
  const durationMins = (distanceKm / averageSpeedKmh) * 60;
  return Math.ceil(durationMins);
};

const getIO = () => {
  if (!io) {
    throw new Error('Socket.io not initialized');
  }
  return io;
};

module.exports = { initializeSocket, getIO };

