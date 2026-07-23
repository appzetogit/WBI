/**
 * One-shot: fix Vendor inviteLinkToken / uniqueCompanyCode unique indexes.
 * Usage: node Backend/scripts/fixVendorInviteIndexes.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const { ensureVendorSparseUniqueIndexes } = require('../utils/ensureVendorSparseUniqueIndexes');

(async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI missing');
    process.exit(1);
  }
  await mongoose.connect(uri, { family: 4 });
  const result = await ensureVendorSparseUniqueIndexes(mongoose.connection);
  console.log(JSON.stringify(result, null, 2));
  await mongoose.disconnect();
  process.exit(result.ok ? 0 : 1);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
