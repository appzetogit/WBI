const { buildFcmRouter } = require('../shared/fcmTokenFactory');
const Admin = require('../../models/Admin');

module.exports = buildFcmRouter({
  Model: Admin,
  roleCheck: (req) => ['ADMIN', 'admin', 'super_admin', 'SUPER_ADMIN'].includes(req.userRole),
  role: 'admin',
  idFromReq: (req) => req.user._id || req.user.id
});
