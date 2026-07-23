/**
 * Repair Vendor unique indexes that break signup when fields are null.
 *
 * MongoDB sparse unique indexes STILL index explicit `null` values, so only
 * one vendor could have inviteLinkToken: null — every subsequent signup E11000s.
 *
 * This migrates to partial unique indexes that only apply when the value is a
 * non-empty string, and unsets null/empty fields on existing documents.
 */
async function ensureVendorSparseUniqueIndexes(mongooseConnection) {
  const db = mongooseConnection?.db || require('mongoose').connection.db;
  if (!db) {
    console.warn('[VendorIndexes] No DB connection — skip index repair');
    return { ok: false, reason: 'no_db' };
  }

  const col = db.collection('vendors');
  const report = {
    unsetInvite: 0,
    unsetCode: 0,
    dropped: [],
    created: [],
    errors: []
  };

  try {
    // Match explicit null / empty / BSON Null — do not touch real tokens
    const unsetInvite = await col.updateMany(
      {
        $or: [
          { inviteLinkToken: null },
          { inviteLinkToken: '' },
          { inviteLinkToken: { $exists: true, $not: { $type: 'string' } } }
        ]
      },
      { $unset: { inviteLinkToken: '', inviteLinkExpiresAt: '' } }
    );
    report.unsetInvite = unsetInvite.modifiedCount || 0;

    const unsetCode = await col.updateMany(
      {
        $or: [
          { uniqueCompanyCode: null },
          { uniqueCompanyCode: '' },
          { uniqueCompanyCode: { $exists: true, $not: { $type: 'string' } } }
        ]
      },
      { $unset: { uniqueCompanyCode: '' } }
    );
    report.unsetCode = unsetCode.modifiedCount || 0;
  } catch (err) {
    report.errors.push(`unset: ${err.message}`);
  }

  let existing = [];
  try {
    existing = await col.indexes();
  } catch (err) {
    report.errors.push(`listIndexes: ${err.message}`);
    return { ok: false, ...report };
  }

  const dropIfPresent = async (name) => {
    if (existing.some((idx) => idx.name === name)) {
      try {
        await col.dropIndex(name);
        report.dropped.push(name);
        existing = existing.filter((idx) => idx.name !== name);
      } catch (err) {
        if (!/index not found/i.test(err.message)) {
          report.errors.push(`drop ${name}: ${err.message}`);
        }
      }
    }
  };

  // Legacy indexes that collide on null
  await dropIfPresent('inviteLinkToken_1');
  await dropIfPresent('uniqueCompanyCode_1');

  const ensurePartial = async (name, key, field) => {
    const current = existing.find((idx) => idx.name === name);
    const partialOk =
      current?.unique === true &&
      current?.partialFilterExpression?.[field]?.$type === 'string';

    if (partialOk) return;

    if (current) {
      await dropIfPresent(name);
    }

    try {
      await col.createIndex(
        key,
        {
          unique: true,
          name,
          partialFilterExpression: {
            [field]: { $type: 'string', $gt: '' }
          }
        }
      );
      report.created.push(name);
    } catch (err) {
      if (!/already exists|IndexOptionsConflict/i.test(err.message)) {
        report.errors.push(`create ${name}: ${err.message}`);
      }
    }
  };

  await ensurePartial('inviteLinkToken_partial_unique', { inviteLinkToken: 1 }, 'inviteLinkToken');
  await ensurePartial('uniqueCompanyCode_partial_unique', { uniqueCompanyCode: 1 }, 'uniqueCompanyCode');

  const ok = report.errors.length === 0;
  console.log(
    `[VendorIndexes] repair ${ok ? 'OK' : 'PARTIAL'} — unset invite=${report.unsetInvite}, code=${report.unsetCode}, dropped=[${report.dropped.join(',')}], created=[${report.created.join(',')}]`
  );
  if (report.errors.length) {
    console.warn('[VendorIndexes] errors:', report.errors.join(' | '));
  }
  return { ok, ...report };
}

module.exports = { ensureVendorSparseUniqueIndexes };
