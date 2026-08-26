/**
 * Force-clear null inviteLinkToken values that block vendor signup (E11000).
 * Usage (from Backend/): node scripts/clearNullInviteTokens.js
 */
require('dotenv').config();
const mongoose = require('mongoose');

(async () => {
  await mongoose.connect(process.env.MONGODB_URI, { family: 4 });
  const col = mongoose.connection.db.collection('vendors');

  const before = await col.countDocuments({ inviteLinkToken: null });
  const r = await col.updateMany(
    {
      $or: [
        { inviteLinkToken: null },
        { inviteLinkToken: '' }
      ]
    },
    { $unset: { inviteLinkToken: 1, inviteLinkExpiresAt: 1 } }
  );

  // Also clear empty company codes (keep real string codes)
  const r2 = await col.updateMany(
    {
      $or: [
        { uniqueCompanyCode: null },
        { uniqueCompanyCode: '' }
      ]
    },
    { $unset: { uniqueCompanyCode: 1 } }
  );

  const after = await col.countDocuments({ inviteLinkToken: null });
  const missing = await col.countDocuments({ inviteLinkToken: { $exists: false } });

  console.log({
    beforeNullInvite: before,
    inviteMatched: r.matchedCount,
    inviteModified: r.modifiedCount,
    codeMatched: r2.matchedCount,
    codeModified: r2.modifiedCount,
    afterNullInvite: after,
    afterMissingInvite: missing
  });

  await mongoose.disconnect();
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
