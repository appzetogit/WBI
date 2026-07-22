/**
 * PM2 cluster: run cron/schedulers on a single worker only.
 * Uses NODE_APP_INSTANCE (PM2) or defaults to leader when unset (single process).
 */
function isClusterLeader() {
  const inst = process.env.NODE_APP_INSTANCE;
  if (inst === undefined || inst === '') return true;
  return String(inst) === '0';
}

module.exports = { isClusterLeader };
