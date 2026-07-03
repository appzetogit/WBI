const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/authMiddleware');
const { isApprovedB2B, checkB2BPermission } = require('../../middleware/roleMiddleware');
const userController = require('../../controllers/b2bControllers/b2bUserController');

// Public routes for accepting invitation
router.post('/accept-invite', userController.acceptInviteVerify);
router.post('/set-password', userController.acceptInviteSetPassword);

// Authenticated and approved company routes
router.use(authenticate, isApprovedB2B);

// Manage users (requires users.manage permission)
router.get('/summary', checkB2BPermission('users.manage'), userController.getUsersSummary);
router.get('/', checkB2BPermission('users.manage'), userController.getUsersList);
router.post('/invite', checkB2BPermission('users.manage'), userController.inviteUser);

router.get('/:userId', checkB2BPermission('users.manage'), userController.getUserById);
router.patch('/:userId', checkB2BPermission('users.manage'), userController.updateUser);
router.patch('/:userId/status', checkB2BPermission('users.manage'), userController.updateUserStatus);
router.post('/:userId/resend-invite', checkB2BPermission('users.manage'), userController.resendInvitation);
router.delete('/:userId', checkB2BPermission('users.manage'), userController.deleteUser);
router.get('/:userId/activity', checkB2BPermission('users.manage'), userController.getUserActivityLog);

module.exports = router;
