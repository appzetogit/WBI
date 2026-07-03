const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const B2BUser = require('../../models/B2BUser');
const B2BRole = require('../../models/B2BRole');
const B2BUserActivityLog = require('../../models/B2BUserActivityLog');
const B2BCompany = require('../../models/B2BCompany');

// Helper to log user activities
const logActivity = async (req, userId, action, module) => {
  try {
    await B2BUserActivityLog.create({
      companyId: req.companyId,
      userId: userId,
      action: action,
      module: module,
      ipAddress: req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress,
      deviceInfo: req.headers['user-agent']
    });
  } catch (error) {
    console.error('Activity log error:', error);
  }
};

// Helper to check if a user is the last remaining active Company Admin
const isLastActiveAdmin = async (companyId, userId) => {
  const activeAdmins = await B2BUser.find({
    companyId,
    role: 'Company Admin',
    status: 'active'
  });
  
  if (activeAdmins.length > 1) {
    return false;
  }
  
  if (activeAdmins.length === 1 && activeAdmins[0]._id.toString() === userId.toString()) {
    return true;
  }
  
  return false;
};

/**
 * GET /api/b2b/users/summary
 */
exports.getUsersSummary = async (req, res) => {
  try {
    const companyId = req.companyId;

    const total = await B2BUser.countDocuments({ companyId });
    const active = await B2BUser.countDocuments({ companyId, status: 'active' });
    const invited = await B2BUser.countDocuments({ companyId, status: 'invited' });
    const inactive = await B2BUser.countDocuments({ companyId, status: 'inactive' });

    return res.status(200).json({
      success: true,
      data: { total, active, invited, inactive }
    });
  } catch (error) {
    console.error('GET Users Summary Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch users summary',
      error: error.message
    });
  }
};

/**
 * GET /api/b2b/users
 */
exports.getUsersList = async (req, res) => {
  try {
    const companyId = req.companyId;
    const { status, role, search, page = 1, limit = 10 } = req.query;

    const query = { companyId };

    if (status && status !== 'all') {
      query.status = status;
    }

    if (role && role !== 'all') {
      query.role = role;
    }

    if (search) {
      const searchRegex = new RegExp(search.trim(), 'i');
      query.$or = [
        { fullName: searchRegex },
        { email: searchRegex },
        { mobile: searchRegex }
      ];
    }

    const skipCount = (parseInt(page) - 1) * parseInt(limit);

    const users = await B2BUser.find(query)
      .select('-passwordHash -inviteTokenHash')
      .sort({ createdAt: -1 })
      .skip(skipCount)
      .limit(parseInt(limit));

    const total = await B2BUser.countDocuments(query);

    return res.status(200).json({
      success: true,
      data: users,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('GET Users List Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve users list',
      error: error.message
    });
  }
};

/**
 * POST /api/b2b/users/invite
 */
exports.inviteUser = async (req, res) => {
  try {
    const companyId = req.companyId;
    const { fullName, email, mobile, role, permissions } = req.body;

    if (!fullName || !email || !mobile || !role) {
      return res.status(400).json({
        success: false,
        message: 'fullName, email, mobile, and role are required.'
      });
    }

    // Uniqueness validation within same company
    const existingUser = await B2BUser.findOne({
      companyId,
      $or: [
        { email: email.toLowerCase().trim() },
        { mobile: mobile.trim() }
      ]
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'A user with this email or mobile number already exists in your company.'
      });
    }

    // Check if email is globally unique for authentication purposes
    const globalExistingUser = await B2BUser.findOne({ email: email.toLowerCase().trim() });
    if (globalExistingUser) {
      return res.status(400).json({
        success: false,
        message: 'This email is already registered in the WBI platform.'
      });
    }

    // Generate token
    const token = crypto.randomBytes(24).toString('hex');
    const inviteTokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const inviteExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours expiry

    // Retrieve default permissions of the role if custom permissions aren't explicitly provided
    let finalPermissions = permissions;
    if (!finalPermissions || finalPermissions.length === 0) {
      const b2bRole = await B2BRole.findOne({ companyId, roleName: role });
      finalPermissions = b2bRole ? b2bRole.permissions : [];
    }

    const newUser = await B2BUser.create({
      companyId,
      fullName,
      email: email.toLowerCase().trim(),
      mobile: mobile.trim(),
      role,
      permissions: finalPermissions,
      status: 'invited',
      inviteTokenHash,
      inviteExpiresAt,
      createdBy: req.user.id
    });

    // Log activity
    await logActivity(req, req.user.id, `Invited user ${fullName} (${email}) as ${role}`, 'Users');

    // In a real application, we would email/SMS the link.
    // For local evaluation, we print it to console and return the token URL in response.
    const inviteLink = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/b2b/accept-invite?token=${token}`;
    console.log(`[B2B INVITE LINK]: ${inviteLink}`);

    return res.status(201).json({
      success: true,
      message: 'Invitation sent successfully.',
      inviteLink,
      token,
      data: newUser
    });
  } catch (error) {
    console.error('Invite User Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to invite user',
      error: error.message
    });
  }
};

/**
 * GET /api/b2b/users/:userId
 */
exports.getUserById = async (req, res) => {
  try {
    const user = await B2BUser.findOne({
      _id: req.params.userId,
      companyId: req.companyId
    }).select('-passwordHash -inviteTokenHash');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    return res.status(200).json({
      success: true,
      data: user
    });
  } catch (error) {
    console.error('GET User By ID Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve user details',
      error: error.message
    });
  }
};

/**
 * PATCH /api/b2b/users/:userId
 */
exports.updateUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const companyId = req.companyId;
    const { fullName, email, mobile, role, permissions } = req.body;

    const user = await B2BUser.findOne({ _id: userId, companyId });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Constraint: Last Company Admin cannot be downgraded to another role
    if (user.role === 'Company Admin' && role !== 'Company Admin') {
      const isLast = await isLastActiveAdmin(companyId, userId);
      if (isLast) {
        return res.status(400).json({
          success: false,
          message: 'Downgrade failed. You cannot change the role of the last remaining Company Admin.'
        });
      }
    }

    // Validate email/mobile uniqueness (excluding self)
    if (email && email.toLowerCase().trim() !== user.email) {
      const emailConflict = await B2BUser.findOne({
        companyId,
        email: email.toLowerCase().trim(),
        _id: { $ne: userId }
      });
      if (emailConflict) {
        return res.status(400).json({
          success: false,
          message: 'Another user with this email address already exists in your company.'
        });
      }
    }

    if (mobile && mobile.trim() !== user.mobile) {
      const mobileConflict = await B2BUser.findOne({
        companyId,
        mobile: mobile.trim(),
        _id: { $ne: userId }
      });
      if (mobileConflict) {
        return res.status(400).json({
          success: false,
          message: 'Another user with this mobile number already exists in your company.'
        });
      }
    }

    // Constraint: Users cannot edit their own permissions
    if (userId.toString() === req.user.id.toString() && permissions) {
      // Allow name, phone edits but block permission overrides to prevent self-elevation or self-downgrading
      return res.status(400).json({
        success: false,
        message: 'Security Block: You cannot modify your own roles or permissions.'
      });
    }

    // Update fields
    if (fullName) user.fullName = fullName;
    if (email) user.email = email.toLowerCase().trim();
    if (mobile) user.mobile = mobile.trim();
    if (role) user.role = role;
    if (permissions) user.permissions = permissions;
    user.updatedBy = req.user.id;

    await user.save();

    await logActivity(req, req.user.id, `Updated user ${user.fullName} (${user.email}) details`, 'Users');

    return res.status(200).json({
      success: true,
      message: 'User updated successfully',
      data: user
    });
  } catch (error) {
    console.error('Update User Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update user',
      error: error.message
    });
  }
};

/**
 * PATCH /api/b2b/users/:userId/status
 */
exports.updateUserStatus = async (req, res) => {
  try {
    const { userId } = req.params;
    const companyId = req.companyId;
    const { status } = req.body;

    if (!['active', 'inactive'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Choose either active or inactive.'
      });
    }

    const user = await B2BUser.findOne({ _id: userId, companyId });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Constraint: Cannot deactivate yourself
    if (userId.toString() === req.user.id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'Action denied. You cannot deactivate or block yourself.'
      });
    }

    // Constraint: Cannot deactivate last Company Admin
    if (user.role === 'Company Admin' && status === 'inactive') {
      const isLast = await isLastActiveAdmin(companyId, userId);
      if (isLast) {
        return res.status(400).json({
          success: false,
          message: 'Deactivation blocked. The last remaining Company Admin cannot be deactivated.'
        });
      }
    }

    user.status = status;
    user.updatedBy = req.user.id;
    await user.save();

    await logActivity(req, req.user.id, `Changed user ${user.fullName} status to ${status}`, 'Users');

    return res.status(200).json({
      success: true,
      message: `User status changed to ${status} successfully.`,
      data: user
    });
  } catch (error) {
    console.error('Update User Status Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update user status',
      error: error.message
    });
  }
};

/**
 * POST /api/b2b/users/:userId/resend-invite
 */
exports.resendInvitation = async (req, res) => {
  try {
    const { userId } = req.params;
    const companyId = req.companyId;

    const user = await B2BUser.findOne({ _id: userId, companyId });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (user.status !== 'invited') {
      return res.status(400).json({
        success: false,
        message: 'This user is already active/deactivated and cannot be invited again.'
      });
    }

    // Regenerate invitation token
    const token = crypto.randomBytes(24).toString('hex');
    user.inviteTokenHash = crypto.createHash('sha256').update(token).digest('hex');
    user.inviteExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    user.updatedBy = req.user.id;
    await user.save();

    await logActivity(req, req.user.id, `Resent invitation to ${user.fullName} (${user.email})`, 'Users');

    const inviteLink = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/b2b/accept-invite?token=${token}`;
    console.log(`[B2B RESEND INVITE LINK]: ${inviteLink}`);

    return res.status(200).json({
      success: true,
      message: 'Invitation resent successfully.',
      inviteLink,
      token
    });
  } catch (error) {
    console.error('Resend Invite Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to resend invitation',
      error: error.message
    });
  }
};

/**
 * DELETE /api/b2b/users/:userId
 */
exports.deleteUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const companyId = req.companyId;

    const user = await B2BUser.findOne({ _id: userId, companyId });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Constraint: Users cannot delete themselves
    if (userId.toString() === req.user.id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'Action denied. You cannot delete yourself.'
      });
    }

    // Constraint: Cannot delete last Company Admin
    if (user.role === 'Company Admin') {
      const isLast = await isLastActiveAdmin(companyId, userId);
      if (isLast) {
        return res.status(400).json({
          success: false,
          message: 'Deletion blocked. The last remaining Company Admin cannot be deleted.'
        });
      }
    }

    await B2BUser.deleteOne({ _id: userId });

    await logActivity(req, req.user.id, `Deleted user ${user.fullName} (${user.email})`, 'Users');

    return res.status(200).json({
      success: true,
      message: 'User removed successfully.'
    });
  } catch (error) {
    console.error('Delete User Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete user',
      error: error.message
    });
  }
};

/**
 * GET /api/b2b/users/:userId/activity
 */
exports.getUserActivityLog = async (req, res) => {
  try {
    const { userId } = req.params;
    const companyId = req.companyId;

    // Verify user belongs to same company
    const user = await B2BUser.findOne({ _id: userId, companyId });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const logs = await B2BUserActivityLog.find({ companyId, userId })
      .sort({ createdAt: -1 })
      .limit(100);

    return res.status(200).json({
      success: true,
      data: logs
    });
  } catch (error) {
    console.error('GET User Activity Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve user activity logs',
      error: error.message
    });
  }
};

/**
 * POST /api/b2b/users/accept-invite
 * (Public Endpoint to verify token validity)
 */
exports.acceptInviteVerify = async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ success: false, message: 'Token is required' });
    }

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await B2BUser.findOne({
      inviteTokenHash: hashedToken,
      status: 'invited',
      inviteExpiresAt: { $gt: new Date() }
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired invitation token.'
      });
    }

    const company = await B2BCompany.findById(user.companyId);

    return res.status(200).json({
      success: true,
      message: 'Token is valid',
      data: {
        fullName: user.fullName,
        email: user.email,
        mobile: user.mobile,
        companyName: company ? company.companyName : ''
      }
    });
  } catch (error) {
    console.error('Accept Invite Verify Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to verify invitation token',
      error: error.message
    });
  }
};

/**
 * POST /api/b2b/users/set-password
 * (Public Endpoint to set password and activate account)
 */
exports.acceptInviteSetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({
        success: false,
        message: 'Token and password are required.'
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters long.'
      });
    }

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await B2BUser.findOne({
      inviteTokenHash: hashedToken,
      status: 'invited',
      inviteExpiresAt: { $gt: new Date() }
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired invitation token.'
      });
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    user.passwordHash = passwordHash;
    user.status = 'active';
    user.inviteTokenHash = null;
    user.inviteExpiresAt = null;

    await user.save();

    // Log activation action
    await logActivity({
      companyId: user.companyId,
      ip: req.ip,
      headers: req.headers,
      connection: req.connection
    }, user._id, `Activated user account and configured password`, 'Auth');

    return res.status(200).json({
      success: true,
      message: 'Account activated successfully. You can now login.'
    });
  } catch (error) {
    console.error('Set Password Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to activate user account',
      error: error.message
    });
  }
};
