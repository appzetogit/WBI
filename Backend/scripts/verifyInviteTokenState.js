require('dotenv').config();
const mongoose = require('mongoose');

(async () => {
  await mongoose.connect(process.env.MONGODB_URI, { family: 4 });
  const col = mongoose.connection.db.collection('vendors');
  const explicitNull = await col.countDocuments({ inviteLinkToken: { $type: 10 } });
  const hasField = await col.countDocuments({ inviteLinkToken: { $exists: true } });
  const withToken = await col.countDocuments({ inviteLinkToken: { $type: 'string' } });
  const indexes = await col.indexes();
  console.log({
    explicitNull,
    hasField,
    withToken,
    inviteIndexes: indexes.filter((i) => i.key?.inviteLinkToken || /invite/i.test(i.name))
  });
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
