/**
 * Barrel export for notification subsystem
 */
module.exports = {
  ...require('./eventCatalog'),
  ...require('./notificationOrchestrator.service'),
  ...require('./channelAdapters')
};
