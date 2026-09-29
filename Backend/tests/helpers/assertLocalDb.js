/**
 * These legacy tests delete documents. Refuse to run against anything that is not a local DB
 * (Backend/.env may point at production Atlas).
 */
module.exports = function assertLocalDb(uri) {
  const target = uri || 'mongodb://localhost:27017/appzeto';
  if (!/^mongodb:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(target)) {
    console.error('Refusing to run: MONGODB_URI must point to a local MongoDB (localhost/127.0.0.1).');
    process.exit(1);
  }
  return target;
};
