/**
 * Transaction options.
 *
 * config/db.js connects with `readPreference: 'secondaryPreferred'` to offload
 * reads to replicas. MongoDB REQUIRES read preference `primary` inside a
 * transaction, so every `startTransaction()` / `withTransaction()` that inherits
 * the connection default fails at runtime with:
 *
 *   "Read preference in a transaction must be primary, not: secondaryPreferred"
 *
 * That broke every transactional path in the app — engineer registration, B2B
 * job acceptance, vendor company-code linking, project assignment, B2B
 * onboarding sync, payouts, withdrawals and the finance lifecycle.
 *
 * Passing these options pins the transaction to the primary without changing
 * the connection-wide read topology (and therefore without shifting read load
 * back onto the primary for ordinary queries).
 *
 * Usage:
 *   session.startTransaction(TXN_OPTS);
 *   await session.withTransaction(fn, TXN_OPTS);
 */
const TXN_OPTS = {
  readPreference: 'primary',
  // Transactional reads must see the writes of the same transaction.
  readConcern: { level: 'local' },
  writeConcern: { w: 'majority' }
};

module.exports = { TXN_OPTS };
