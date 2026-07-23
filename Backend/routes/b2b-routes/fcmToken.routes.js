const { buildFcmRouter } = require('../shared/fcmTokenFactory');
const B2BUser = require('../../models/B2BUser');

module.exports = buildFcmRouter({
  Model: B2BUser,
  roleCheck: (req) => ['B2B', 'b2b'].includes(req.userRole),
  idFromReq: (req) => req.user._id || req.user.id
});
