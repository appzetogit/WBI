// Socket.io initialization
const { Server } = require('socket.io');
const { authenticateSocket } = require('../middleware/authMiddleware');

let io = null;

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
        // Allow if in allowed list or is a subdomain of wbinfs.com or vercel
        if (allowedOrigins.indexOf(origin) !== -1 || origin.endsWith('wbinfs.com') || origin.includes('.vercel.app')) {
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

  // Authentication middleware for Socket.io
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');

      if (!token) {
        return next(new Error('Authentication error: No token provided'));
      }

      // Verify token using the same method as HTTP middleware
      const { verifyAccessToken } = require('../utils/tokenService');
      const decoded = verifyAccessToken(token);

      socket.userId = decoded.userId;
      socket.userRole = decoded.role ? decoded.role.toUpperCase() : 'UNKNOWN';

      next();
    } catch (error) {
      next(new Error('Authentication error: Invalid token'));
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
      socket.join(`b2b:${socket.userId.toString()}`);
      socket.join(`company:${socket.userId.toString()}`);
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
      const { workerId, userId, role, device } = data;
      if (!workerId) return;

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

    // Live Tracking Events
    socket.on('join_tracking', async (bookingId) => {
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
    });

    // New Flow: Join Job Room
    socket.on('join_job', (jobId) => {
      socket.join(`job:${jobId}`);
      console.log(`Socket ${socket.userId} joined room job:${jobId}`);
    });

    // B2B Batch Tracking Room Join
    socket.on('join_batch', (batchId) => {
      socket.join(`batch:${batchId}`);
      console.log(`Socket ${socket.userId} joined room batch:${batchId}`);
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
      const lat = parseFloat(data.lat);
      const lng = parseFloat(data.lng);
      const heading = parseFloat(data.heading) || 0;

      if (isNaN(lat) || isNaN(lng)) return;

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
            lat,
            lng,
            heading,
            updatedAt: new Date()
          },
          geoLocation: {
            type: 'Point',
            coordinates: [lng, lat]
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
        const { bookingId, text, fileUrl, fileType, fileName } = data;
        if (!bookingId) return;

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
        const { engineerId, jobId, lat, lng, heading, speed, battery } = data;
        if (!engineerId || isNaN(parseFloat(lat)) || isNaN(parseFloat(lng))) return;

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
        const { engineerId, jobId, status, message } = data;
        if (!engineerId || !status) return;

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

    socket.on('engineer:jobAccepted', async (data) => {
      try {
        const { engineerId, jobId } = data;
        if (!engineerId || !jobId) return;

        const mongoose = require('mongoose');
        const B2BJob = require('../models/B2BJob');
        const EngineerAssignment = require('../models/EngineerAssignment');
        const JobStatusLog = require('../models/JobStatusLog');

        const engObjId = new mongoose.Types.ObjectId(engineerId);
        const jobObjId = new mongoose.Types.ObjectId(jobId);

        const job = await B2BJob.findByIdAndUpdate(
          jobObjId,
          { status: 'assigned', trackingStatus: 'accepted', assignedAt: new Date() },
          { new: true }
        );
        if (!job) return;

        await EngineerAssignment.findOneAndUpdate(
          { jobId: jobObjId, engineerId: engObjId },
          { status: 'accepted', acceptedAt: new Date() },
          { upsert: true }
        );

        await JobStatusLog.create({
          jobId: jobObjId,
          engineerId: engObjId,
          status: 'accepted',
          message: 'Engineer accepted the job assignment'
        });

        const companyRoom = `b2b:${job.companyId.toString()}`;
        io.to(companyRoom).emit('b2b:jobStatusUpdated', { jobId, status: 'assigned', trackingStatus: 'accepted' });
        io.to('admin').emit('b2b:jobStatusUpdated', { jobId, status: 'assigned', trackingStatus: 'accepted' });
      } catch (error) {
        console.error('Error handling engineer:jobAccepted:', error);
      }
    });

    socket.on('engineer:enRoute', async (data) => {
      try {
        const { engineerId, jobId } = data;
        if (!engineerId || !jobId) return;

        const mongoose = require('mongoose');
        const B2BJob = require('../models/B2BJob');
        const EngineerAssignment = require('../models/EngineerAssignment');
        const EngineerLocationSession = require('../models/EngineerLocationSession');
        const JobStatusLog = require('../models/JobStatusLog');

        const engObjId = new mongoose.Types.ObjectId(engineerId);
        const jobObjId = new mongoose.Types.ObjectId(jobId);

        const job = await B2BJob.findByIdAndUpdate(
          jobObjId,
          { status: 'in_progress', trackingStatus: 'en_route' },
          { new: true }
        );
        if (!job) return;

        await EngineerAssignment.findOneAndUpdate(
          { jobId: jobObjId, engineerId: engObjId },
          { status: 'en_route', enRouteAt: new Date() },
          { upsert: true }
        );

        await EngineerLocationSession.findOneAndUpdate(
          { engineerId: engObjId },
          { status: 'en_route' }
        );

        await JobStatusLog.create({
          jobId: jobObjId,
          engineerId: engObjId,
          status: 'en_route',
          message: 'Engineer started travel (En Route)'
        });

        const companyRoom = `b2b:${job.companyId.toString()}`;
        io.to(companyRoom).emit('b2b:jobStatusUpdated', { jobId, status: 'in_progress', trackingStatus: 'en_route' });
        io.to(companyRoom).emit('b2b:engineerStatusChanged', { engineerId, status: 'en_route' });
        io.to('admin').emit('b2b:jobStatusUpdated', { jobId, status: 'in_progress', trackingStatus: 'en_route' });
        io.to('admin').emit('b2b:engineerStatusChanged', { engineerId, status: 'en_route' });
      } catch (error) {
        console.error('Error handling engineer:enRoute:', error);
      }
    });

    socket.on('engineer:reachedLocation', async (data) => {
      try {
        const { engineerId, jobId } = data;
        if (!engineerId || !jobId) return;

        const mongoose = require('mongoose');
        const B2BJob = require('../models/B2BJob');
        const EngineerAssignment = require('../models/EngineerAssignment');
        const EngineerLocationSession = require('../models/EngineerLocationSession');
        const JobStatusLog = require('../models/JobStatusLog');

        const engObjId = new mongoose.Types.ObjectId(engineerId);
        const jobObjId = new mongoose.Types.ObjectId(jobId);

        const job = await B2BJob.findByIdAndUpdate(
          jobObjId,
          { trackingStatus: 'reached_location' },
          { new: true }
        );
        if (!job) return;

        await EngineerAssignment.findOneAndUpdate(
          { jobId: jobObjId, engineerId: engObjId },
          { status: 'reached_location', reachedAt: new Date() },
          { upsert: true }
        );

        await EngineerLocationSession.findOneAndUpdate(
          { engineerId: engObjId },
          { status: 'at_location' }
        );

        await JobStatusLog.create({
          jobId: jobObjId,
          engineerId: engObjId,
          status: 'reached_location',
          message: 'Engineer arrived at job location'
        });

        const companyRoom = `b2b:${job.companyId.toString()}`;
        io.to(companyRoom).emit('b2b:jobStatusUpdated', { jobId, status: job.status, trackingStatus: 'reached_location' });
        io.to(companyRoom).emit('b2b:engineerStatusChanged', { engineerId, status: 'at_location' });
        io.to('admin').emit('b2b:jobStatusUpdated', { jobId, status: job.status, trackingStatus: 'reached_location' });
        io.to('admin').emit('b2b:engineerStatusChanged', { engineerId, status: 'at_location' });
      } catch (error) {
        console.error('Error handling engineer:reachedLocation:', error);
      }
    });

    socket.on('engineer:workStarted', async (data) => {
      try {
        const { engineerId, jobId } = data;
        if (!engineerId || !jobId) return;

        const mongoose = require('mongoose');
        const B2BJob = require('../models/B2BJob');
        const EngineerAssignment = require('../models/EngineerAssignment');
        const EngineerLocationSession = require('../models/EngineerLocationSession');
        const JobStatusLog = require('../models/JobStatusLog');

        const engObjId = new mongoose.Types.ObjectId(engineerId);
        const jobObjId = new mongoose.Types.ObjectId(jobId);

        const job = await B2BJob.findByIdAndUpdate(
          jobObjId,
          { status: 'in_progress', trackingStatus: 'work_started', startedAt: new Date() },
          { new: true }
        );
        if (!job) return;

        await EngineerAssignment.findOneAndUpdate(
          { jobId: jobObjId, engineerId: engObjId },
          { status: 'work_started' },
          { upsert: true }
        );

        await EngineerLocationSession.findOneAndUpdate(
          { engineerId: engObjId },
          { status: 'working' }
        );

        await JobStatusLog.create({
          jobId: jobObjId,
          engineerId: engObjId,
          status: 'work_started',
          message: 'Engineer started service work'
        });

        const companyRoom = `b2b:${job.companyId.toString()}`;
        io.to(companyRoom).emit('b2b:jobStatusUpdated', { jobId, status: 'in_progress', trackingStatus: 'work_started' });
        io.to(companyRoom).emit('b2b:engineerStatusChanged', { engineerId, status: 'working' });
        io.to('admin').emit('b2b:jobStatusUpdated', { jobId, status: 'in_progress', trackingStatus: 'work_started' });
        io.to('admin').emit('b2b:engineerStatusChanged', { engineerId, status: 'working' });
      } catch (error) {
        console.error('Error handling engineer:workStarted:', error);
      }
    });

    socket.on('engineer:jobCompleted', async (data) => {
      try {
        const { engineerId, jobId } = data;
        if (!engineerId || !jobId) return;

        const mongoose = require('mongoose');
        const B2BJob = require('../models/B2BJob');
        const Engineer = require('../models/Engineer');
        const EngineerAssignment = require('../models/EngineerAssignment');
        const EngineerLocationSession = require('../models/EngineerLocationSession');
        const JobStatusLog = require('../models/JobStatusLog');

        const engObjId = new mongoose.Types.ObjectId(engineerId);
        const jobObjId = new mongoose.Types.ObjectId(jobId);

        const job = await B2BJob.findByIdAndUpdate(
          jobObjId,
          { status: 'completed', trackingStatus: 'completed', completedAt: new Date(), eta: 0 },
          { new: true }
        );
        if (!job) return;

        await EngineerAssignment.findOneAndUpdate(
          { jobId: jobObjId, engineerId: engObjId },
          { status: 'completed', completedAt: new Date() },
          { upsert: true }
        );

        await EngineerLocationSession.findOneAndUpdate(
          { engineerId: engObjId },
          { status: 'available' }
        );

        await Engineer.findByIdAndUpdate(engObjId, { status: 'ONLINE' });

        await JobStatusLog.create({
          jobId: jobObjId,
          engineerId: engObjId,
          status: 'completed',
          message: 'Engineer successfully completed the job'
        });

        const companyRoom = `b2b:${job.companyId.toString()}`;
        io.to(companyRoom).emit('b2b:jobStatusUpdated', { jobId, status: 'completed', trackingStatus: 'completed' });
        io.to(companyRoom).emit('b2b:engineerStatusChanged', { engineerId, status: 'available' });
        io.to('admin').emit('b2b:jobStatusUpdated', { jobId, status: 'completed', trackingStatus: 'completed' });
        io.to('admin').emit('b2b:engineerStatusChanged', { engineerId, status: 'available' });
      } catch (error) {
        console.error('Error handling engineer:jobCompleted:', error);
      }
    });

    socket.on('engineer:batteryUpdated', async (data) => {
      try {
        const { engineerId, battery } = data;
        if (!engineerId) return;

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
      } else if (socket.userRole === 'WORKER') {
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

