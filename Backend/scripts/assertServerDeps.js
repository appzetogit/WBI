/**
 * Loaded via `node -r ./scripts/assertServerDeps.js server.js` (see ecosystem.config.js).
 * Fails fast with a clear message when production node_modules is incomplete.
 */
'use strict';

const critical = [
  'express',
  'cors',
  'cookie-parser',
  'helmet',
  'morgan',
  'compression',
  'dotenv',
  'express-mongo-sanitize',
  'mongoose',
  'socket.io',
  'bullmq',
  'ioredis',
  'razorpay',
  'firebase-admin'
];

const missing = [];
for (const name of critical) {
  try {
    require(name);
  } catch (e) {
    if (e && e.code === 'MODULE_NOT_FOUND') {
      missing.push(name);
    } else {
      throw e;
    }
  }
}

if (missing.length) {
  // eslint-disable-next-line no-console
  console.error(
    '[boot] Missing npm packages:',
    missing.join(', '),
    '\n[boot] Fix: cd Backend && rm -rf node_modules && npm ci --omit=dev && pm2 restart ecosystem.config.js --env production'
  );
  process.exit(1);
}
