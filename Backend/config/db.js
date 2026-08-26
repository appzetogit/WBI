const mongoose = require('mongoose');

/**
 * Connect to MongoDB Atlas with production-grade retry logic and TLS support
 */
const connectDB = async () => {
  const primaryUri = process.env.MONGODB_URI;

  if (!primaryUri) {
    console.error('❌ MONGODB_URI is not set in environment variables!');
    process.exit(1);
  }

  // Disable query buffering globally to avoid memory exhaustion during retries
  mongoose.set('bufferCommands', false);

  let retryCount = 0;
  const MAX_RETRIES = 10;
  const RETRY_DELAY_MS = 5000;

  const connectWithRetry = async () => {
    try {
      console.log(`[DB] Attempting MongoDB Atlas connection (attempt ${retryCount + 1})...`);

      const conn = await mongoose.connect(primaryUri, {
        family: 4,                        // Force IPv4 — avoids IPv6 resolution delays on EC2
        serverSelectionTimeoutMS: 30000,  // Increased from 5s → 30s for production stability
        socketTimeoutMS: 45000,           // Close sockets after 45s of inactivity
        connectTimeoutMS: 30000,          // TCP connection timeout
        heartbeatFrequencyMS: 10000,      // How often to check server health
        maxPoolSize: parseInt(process.env.MONGODB_MAX_POOL_SIZE, 10) || 25,
        minPoolSize: parseInt(process.env.MONGODB_MIN_POOL_SIZE, 10) || 5,
        retryWrites: true,
        w: 'majority',
        readPreference: 'secondaryPreferred', // Offload read operations to Replicas
      });

      // Runtime error listener (reconnect handled by mongoose internally)
      mongoose.connection.on('error', (err) => {
        console.error('[DB] MongoDB runtime error:', err.message);
      });

      mongoose.connection.on('disconnected', () => {
        console.warn('[DB] MongoDB disconnected. Mongoose will auto-reconnect...');
      });

      mongoose.connection.on('reconnected', () => {
        console.log('[DB] ✅ MongoDB reconnected successfully.');
      });

      console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
      retryCount = 0; // Reset on success

      // Fix vendor signup E11000 on inviteLinkToken:null (non-blocking)
      setImmediate(async () => {
        try {
          const { ensureVendorSparseUniqueIndexes } = require('../utils/ensureVendorSparseUniqueIndexes');
          await ensureVendorSparseUniqueIndexes(conn.connection);
        } catch (idxErr) {
          console.warn('[DB] Vendor index repair skipped:', idxErr.message);
        }
      });
    } catch (error) {
      retryCount++;

      // Log the specific error type for debugging
      if (error.message.includes('ECONNREFUSED')) {
        console.error(`[DB] ❌ Connection REFUSED to MongoDB Atlas. EC2 Server IP may not be whitelisted.`);
        console.error(`[DB]    → Go to MongoDB Atlas → Network Access → Add IP: (your EC2 public IP)`);
        console.error(`[DB]    → Or temporarily allow 0.0.0.0/0 for testing`);
        console.error(`[DB]    → Attempted URI host: ${primaryUri.split('@')[1]?.split('/')[0] || 'unknown'}`);
      } else if (error.message.includes('Authentication failed')) {
        console.error(`[DB] ❌ Authentication failed. Check MONGODB_URI username/password.`);
      } else if (error.message.includes('ETIMEOUT') || error.message.includes('ENOTFOUND')) {
        console.error(`[DB] ❌ DNS/Timeout error. Check internet connectivity or DNS settings on server.`);
      } else {
        console.error(`[DB] ❌ MongoDB Connection Failed:`, error.message);
      }

      if (retryCount >= MAX_RETRIES) {
        console.error(`[DB] ❌ Max retries (${MAX_RETRIES}) reached. Server will continue running without DB.`);
        console.error(`[DB]    → Fix the Atlas Network Access whitelist and restart the server.`);
        return; // Don't crash the process — let API return 503 gracefully
      }

      const delay = Math.min(RETRY_DELAY_MS * retryCount, 30000); // Exponential backoff, max 30s
      console.log(`[DB] ⏳ Retrying in ${delay / 1000}s... (${retryCount}/${MAX_RETRIES})`);
      setTimeout(connectWithRetry, delay);
    }
  };

  connectWithRetry();
};

module.exports = connectDB;
