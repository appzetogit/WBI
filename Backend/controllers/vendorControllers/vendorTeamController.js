const mongoose = require('mongoose');
const VendorDepartment = require('../../models/VendorDepartment');
const VendorRole = require('../../models/VendorRole');
const VendorTeamSkill = require('../../models/VendorTeamSkill');
const VendorTeamMember = require('../../models/VendorTeamMember');
const VendorLeave = require('../../models/VendorLeave');
const VendorActivityLog = require('../../models/VendorActivityLog');
const VendorProjectAssignment = require('../../models/VendorProjectAssignment');
const VendorPerformance = require('../../models/VendorPerformance');
const VendorSkillMatrix = require('../../models/VendorSkillMatrix');
const VendorAttendance = require('../../models/VendorAttendance');
const VendorCertification = require('../../models/VendorCertification');

// ─── Helper: Log activity ────────────────────────────────────────────────────
const logActivity = async (vendorId, memberId, action, description) => {
  try {
    await VendorActivityLog.create({ vendorId, memberId, action, description });
  } catch (err) {
    console.error('[ActivityLog Error]', err.message);
  }
};

// ─── Helper: Compute Auto Performance Score ───────────────────────────────────
const computeAutoScore = (perf) => {
  const jobsCompleted = perf.jobsCompleted || 0;
  const jobsAssigned = perf.jobsAssigned || 0;
  const jobScore = Math.min((jobsCompleted / Math.max(jobsAssigned, 1)) * 100, 100) * 0.25;
  const slaScore = (perf.slaPercent || 0) * 0.25;
  const ratingScore = ((perf.customerRating || 0) / 5) * 100 * 0.20;
  const attendanceScore = (perf.attendancePercent || 0) * 0.15;
  const ftfrScore = (perf.firstTimeFixRate || 0) * 0.15;
  return Math.round((jobScore || 0) + (slaScore || 0) + (ratingScore || 0) + (attendanceScore || 0) + (ftfrScore || 0)) || 0;
};

// ─── WORKFORCE DASHBOARD ─────────────────────────────────────────────────────
exports.getWorkforceDashboard = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const vId = new mongoose.Types.ObjectId(vendorId);
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [members, departments, roles, assignments, performances, leaves, certs] = await Promise.all([
      VendorTeamMember.find({ vendorId: vId }).populate('roleId departmentId').lean(),
      VendorDepartment.find({ vendorId: vId }).lean(),
      VendorRole.find({ vendorId: vId }).lean(),
      VendorProjectAssignment.find({ vendorId: vId }).lean(),
      VendorPerformance.find({ vendorId: vId }).lean(),
      VendorLeave.find({ vendorId: vId }).lean(),
      VendorCertification.find({ vendorId: vId }).lean()
    ]);

    const activeMembers = members.filter(m => m.isActive);
    const available = activeMembers.filter(m => m.availabilityStatus === 'Available').length;
    const busy = activeMembers.filter(m => m.availabilityStatus === 'Busy' || m.availabilityStatus === 'On Job').length;
    const onLeave = activeMembers.filter(m => m.availabilityStatus === 'On Leave').length;
    const travelling = activeMembers.filter(m => m.availabilityStatus === 'Travelling').length;
    const onTraining = activeMembers.filter(m => m.availabilityStatus === 'Training').length;

    const activeProjects = assignments.filter(a => a.status === 'Active').length;
    const completedProjects = assignments.filter(a => a.status === 'Completed').length;

    const pendingLeaves = leaves.filter(l => l.status === 'Pending').length;
    const upcomingLeaves = leaves.filter(l => l.status === 'Approved' && new Date(l.startDate) > now).length;

    // Expiring certs (within 30 days)
    const thirtyDaysLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const expiringDocs = certs.filter(c => c.expiryDate && new Date(c.expiryDate) <= thirtyDaysLater && new Date(c.expiryDate) > now).length;

    // Performance averages
    const avgRating = performances.length ? (performances.reduce((s, p) => s + (p.customerRating || 0), 0) / performances.length).toFixed(1) : 0;
    const avgSla = performances.length ? Math.round(performances.reduce((s, p) => s + (p.slaPercent || 0), 0) / performances.length) : 0;
    const avgScore = performances.length ? Math.round(performances.reduce((s, p) => s + (p.autoScore || 0), 0) / performances.length) : 0;

    // Workforce utilization
    const workforceUtil = activeMembers.length ? Math.round(((busy + travelling) / activeMembers.length) * 100) : 0;

    // Skill gap: members with no skills
    const skillGapMembers = activeMembers.filter(m => !m.performanceSummary?.autoScore).length;

    // Department distribution (for chart)
    const deptDist = departments.map(d => ({
      name: d.name,
      color: d.color,
      count: activeMembers.filter(m => m.departmentId?._id?.toString() === d._id.toString()).length
    }));

    // Availability breakdown (for chart)
    const availabilityChart = [
      { name: 'Available', value: available, color: '#10B981' },
      { name: 'Busy', value: busy, color: '#F59E0B' },
      { name: 'On Leave', value: onLeave, color: '#EF4444' },
      { name: 'Travelling', value: travelling, color: '#6366F1' },
      { name: 'Training', value: onTraining, color: '#3B82F6' },
      { name: 'Offline', value: activeMembers.filter(m => m.availabilityStatus === 'Offline').length, color: '#9CA3AF' }
    ].filter(item => item.value > 0);

    res.json({
      success: true,
      data: {
        kpis: {
          totalEmployees: members.length,
          activeEmployees: activeMembers.length,
          available,
          busy,
          onLeave,
          travelling,
          onTraining,
          departmentCount: departments.length,
          roleCount: roles.length,
          activeProjects,
          completedProjects,
          workforceUtilization: workforceUtil,
          avgCustomerRating: parseFloat(avgRating),
          avgSlaCompliance: avgSla,
          avgPerformanceScore: avgScore,
          pendingLeaves,
          upcomingLeaves,
          expiringDocuments: expiringDocs,
          skillGapAlerts: skillGapMembers
        },
        charts: {
          availabilityChart,
          deptDistribution: deptDist
        }
      }
    });
  } catch (error) {
    console.error('[Workforce Dashboard Error]', error);
    res.status(500).json({ success: false, message: 'Failed to fetch workforce dashboard' });
  }
};

// ─── DEPARTMENTS CRUD ────────────────────────────────────────────────────────
exports.getDepartments = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const vId = new mongoose.Types.ObjectId(vendorId);
    const depts = await VendorDepartment.find({ vendorId: vId }).populate('managerId', 'name profileImage').lean();

    // Attach headcount & active projects dynamically
    const enriched = await Promise.all(depts.map(async (d) => {
      const headcount = await VendorTeamMember.countDocuments({ vendorId: vId, departmentId: d._id, isActive: true });
      const activeProjects = await VendorProjectAssignment.countDocuments({
        vendorId: vId,
        memberId: { $in: await VendorTeamMember.distinct('_id', { vendorId: vId, departmentId: d._id }) },
        status: 'Active'
      });
      return { ...d, headcount, activeProjects };
    }));

    res.json({ success: true, data: enriched });
  } catch (error) {
    console.error('[getDepartments Error]', error);
    res.status(500).json({ success: false, message: 'Failed to fetch departments' });
  }
};

exports.createDepartment = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const { name, description, color, managerId, capacity } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Department name is required' });
    const dept = await VendorDepartment.create({ vendorId, name, description, color, managerId, capacity });
    await logActivity(vendorId, null, 'Department Created', `Created department: ${name}`);
    res.status(201).json({ success: true, data: dept });
  } catch (error) {
    console.error('[createDepartment Error]', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to create department' });
  }
};

exports.updateDepartment = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const { name, description, color, managerId, capacity, status } = req.body;
    const dept = await VendorDepartment.findOneAndUpdate(
      { _id: req.params.id, vendorId },
      { name, description, color, managerId, capacity, status },
      { new: true, runValidators: true }
    );
    if (!dept) return res.status(404).json({ success: false, message: 'Department not found' });
    res.json({ success: true, data: dept });
  } catch (error) {
    console.error('[updateDepartment Error]', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to update department' });
  }
};

exports.deleteDepartment = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const memberCount = await VendorTeamMember.countDocuments({ vendorId, departmentId: req.params.id, isActive: true });
    if (memberCount > 0) return res.status(400).json({ success: false, message: `Cannot delete: ${memberCount} active members in this department` });
    await VendorDepartment.findOneAndDelete({ _id: req.params.id, vendorId });
    res.json({ success: true, message: 'Department deleted successfully' });
  } catch (error) {
    console.error('[deleteDepartment Error]', error);
    res.status(500).json({ success: false, message: 'Failed to delete department' });
  }
};

// ─── ROLES CRUD ───────────────────────────────────────────────────────────────
exports.getRoles = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const roles = await VendorRole.find({ vendorId }).populate('reportingTo', 'title level').sort({ level: 1 }).lean();
    // Attach member count per role
    const enriched = await Promise.all(roles.map(async (r) => {
      const memberCount = await VendorTeamMember.countDocuments({ vendorId, roleId: r._id, isActive: true });
      return { ...r, memberCount };
    }));
    res.json({ success: true, data: enriched });
  } catch (error) {
    console.error('[getRoles Error]', error);
    res.status(500).json({ success: false, message: 'Failed to fetch roles' });
  }
};

exports.createRole = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const { title, level, permissions, approvalRights, salaryGrade, reportingTo, escalationLevel, color } = req.body;
    if (!title) return res.status(400).json({ success: false, message: 'Role title is required' });
    const role = await VendorRole.create({ vendorId, title, level, permissions, approvalRights, salaryGrade, reportingTo, escalationLevel, color });
    res.status(201).json({ success: true, data: role });
  } catch (error) {
    console.error('[createRole Error]', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to create role' });
  }
};

exports.updateRole = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const role = await VendorRole.findOneAndUpdate(
      { _id: req.params.id, vendorId },
      req.body,
      { new: true, runValidators: true }
    );
    if (!role) return res.status(404).json({ success: false, message: 'Role not found' });
    res.json({ success: true, data: role });
  } catch (error) {
    console.error('[updateRole Error]', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to update role' });
  }
};

exports.deleteRole = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const memberCount = await VendorTeamMember.countDocuments({ vendorId, roleId: req.params.id, isActive: true });
    if (memberCount > 0) return res.status(400).json({ success: false, message: `Cannot delete: ${memberCount} members have this role` });
    await VendorRole.findOneAndDelete({ _id: req.params.id, vendorId });
    res.json({ success: true, message: 'Role deleted successfully' });
  } catch (error) {
    console.error('[deleteRole Error]', error);
    res.status(500).json({ success: false, message: 'Failed to delete role' });
  }
};

// ─── SKILL CATALOG CRUD ───────────────────────────────────────────────────────
exports.getSkills = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const skills = await VendorTeamSkill.find({ vendorId }).lean();
    const enriched = await Promise.all(skills.map(async (s) => {
      const memberCount = await VendorSkillMatrix.countDocuments({ vendorId, skillId: s._id });
      return { ...s, memberCount };
    }));
    res.json({ success: true, data: enriched });
  } catch (error) {
    console.error('[getSkills Error]', error);
    res.status(500).json({ success: false, message: 'Failed to fetch skills' });
  }
};

exports.createSkill = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const { name, category, description, color } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Skill name is required' });
    const skill = await VendorTeamSkill.create({ vendorId, name, category, description, color });
    res.status(201).json({ success: true, data: skill });
  } catch (error) {
    console.error('[createSkill Error]', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to create skill' });
  }
};

exports.updateSkill = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const skill = await VendorTeamSkill.findOneAndUpdate({ _id: req.params.id, vendorId }, req.body, { new: true });
    if (!skill) return res.status(404).json({ success: false, message: 'Skill not found' });
    res.json({ success: true, data: skill });
  } catch (error) {
    console.error('[updateSkill Error]', error);
    res.status(500).json({ success: false, message: 'Failed to update skill' });
  }
};

exports.deleteSkill = async (req, res) => {
  try {
    const vendorId = req.user.id;
    await VendorTeamSkill.findOneAndDelete({ _id: req.params.id, vendorId });
    await VendorSkillMatrix.deleteMany({ vendorId, skillId: req.params.id });
    res.json({ success: true, message: 'Skill deleted' });
  } catch (error) {
    console.error('[deleteSkill Error]', error);
    res.status(500).json({ success: false, message: 'Failed to delete skill' });
  }
};

// ─── SKILL MATRIX (Per-member skill entries) ─────────────────────────────────
exports.getMemberSkillMatrix = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const { memberId } = req.params;
    const matrix = await VendorSkillMatrix.find({ vendorId, memberId }).populate('skillId').lean();
    res.json({ success: true, data: matrix });
  } catch (error) {
    console.error('[getMemberSkillMatrix Error]', error);
    res.status(500).json({ success: false, message: 'Failed to fetch skill matrix' });
  }
};

exports.upsertMemberSkill = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const { memberId, skillId, level, yearsExperience, lastAssessedAt, expiryDate, certificationUrl, trainingRequired, notes } = req.body;
    const entry = await VendorSkillMatrix.findOneAndUpdate(
      { vendorId, memberId, skillId },
      { vendorId, memberId, skillId, level, yearsExperience, lastAssessedAt, expiryDate, certificationUrl, trainingRequired, notes },
      { upsert: true, new: true, runValidators: true }
    );
    res.json({ success: true, data: entry });
  } catch (error) {
    console.error('[upsertMemberSkill Error]', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to update skill matrix' });
  }
};

exports.deleteMemberSkill = async (req, res) => {
  try {
    const vendorId = req.user.id;
    await VendorSkillMatrix.findOneAndDelete({ _id: req.params.id, vendorId });
    res.json({ success: true, message: 'Skill entry removed' });
  } catch (error) {
    console.error('[deleteMemberSkill Error]', error);
    res.status(500).json({ success: false, message: 'Failed to delete skill entry' });
  }
};

exports.getSkillGapAnalysis = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const vId = new mongoose.Types.ObjectId(vendorId);
    const members = await VendorTeamMember.find({ vendorId: vId, isActive: true }).lean();
    const skills = await VendorTeamSkill.find({ vendorId: vId }).lean();

    const gaps = await Promise.all(members.map(async (m) => {
      const memberSkills = await VendorSkillMatrix.find({ memberId: m._id }).distinct('skillId');
      const coveredIds = memberSkills.map(id => id.toString());
      const missingSkills = skills.filter(s => !coveredIds.includes(s._id.toString()));
      const expiringSkills = await VendorSkillMatrix.find({
        memberId: m._id,
        expiryDate: { $lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), $gt: new Date() }
      }).populate('skillId', 'name').lean();
      return {
        member: { _id: m._id, name: m.name, profileImage: m.profileImage },
        missingSkillCount: missingSkills.length,
        expiringSkillCount: expiringSkills.length,
        expiringSkills: expiringSkills.map(e => e.skillId?.name)
      };
    }));

    res.json({ success: true, data: gaps.filter(g => g.missingSkillCount > 0 || g.expiringSkillCount > 0) });
  } catch (error) {
    console.error('[getSkillGapAnalysis Error]', error);
    res.status(500).json({ success: false, message: 'Failed to compute skill gap analysis' });
  }
};

// ─── TEAM MEMBERS CRUD ────────────────────────────────────────────────────────
exports.getTeamMembers = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const { page = 1, limit = 20, search = '', department = '', role = '', status = '', employmentType = '' } = req.query;
    const vId = new mongoose.Types.ObjectId(vendorId);

    const query = { vendorId: vId };
    if (search) query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
      { employeeId: { $regex: search, $options: 'i' } }
    ];
    if (department && department !== 'all') query.departmentId = new mongoose.Types.ObjectId(department);
    if (role && role !== 'all') query.roleId = new mongoose.Types.ObjectId(role);
    if (status && status !== 'all') query.availabilityStatus = status;
    if (employmentType && employmentType !== 'all') query.employmentType = employmentType;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [members, total] = await Promise.all([
      VendorTeamMember.find(query)
        .populate('roleId', 'title level color')
        .populate('departmentId', 'name color')
        .populate('reportingManagerId', 'name profileImage')
        .skip(skip)
        .limit(parseInt(limit))
        .sort({ createdAt: -1 })
        .lean(),
      VendorTeamMember.countDocuments(query)
    ]);

    // Attach current active project
    const enriched = await Promise.all(members.map(async (m) => {
      const assignment = await VendorProjectAssignment.findOne({ memberId: m._id, status: 'Active' }).lean();
      const skillCount = await VendorSkillMatrix.countDocuments({ memberId: m._id });
      return { ...m, currentAssignment: assignment || null, skillCount };
    }));

    res.json({
      success: true,
      data: enriched,
      pagination: { total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)), limit: parseInt(limit) }
    });
  } catch (error) {
    console.error('[getTeamMembers Error]', error);
    res.status(500).json({ success: false, message: 'Failed to fetch team members' });
  }
};

exports.getMemberProfile = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const member = await VendorTeamMember.findOne({ _id: req.params.id, vendorId })
      .populate('roleId').populate('departmentId').populate('reportingManagerId', 'name profileImage').lean();
    if (!member) return res.status(404).json({ success: false, message: 'Member not found' });

    const [skills, assignments, leaves, performance, attendance, certs] = await Promise.all([
      VendorSkillMatrix.find({ memberId: member._id }).populate('skillId').lean(),
      VendorProjectAssignment.find({ memberId: member._id }).sort({ createdAt: -1 }).lean(),
      VendorLeave.find({ memberId: member._id }).sort({ startDate: -1 }).limit(10).lean(),
      VendorPerformance.find({ memberId: member._id }).sort({ period: -1 }).limit(6).lean(),
      VendorAttendance.find({ memberId: member._id }).sort({ date: -1 }).limit(30).lean(),
      VendorCertification.find({ memberId: member._id }).lean()
    ]);

    res.json({ success: true, data: { ...member, skills, assignments, leaves, performance, attendance, certifications: certs } });
  } catch (error) {
    console.error('[getMemberProfile Error]', error);
    res.status(500).json({ success: false, message: 'Failed to fetch member profile' });
  }
};

exports.addMember = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const {
      name, email, phone, roleId, departmentId, designation,
      employmentType, shift, experience, education, languages,
      region, city, branch, joiningDate, emergencyContact,
      bankDetails, upiId, address, gender, dateOfBirth, notes,
      reportingManagerId
    } = req.body;

    if (!name) return res.status(400).json({ success: false, message: 'Member name is required' });

    // Auto-generate employeeId
    const count = await VendorTeamMember.countDocuments({ vendorId });
    const employeeId = `EMP-${String(count + 1).padStart(4, '0')}`;

    const member = await VendorTeamMember.create({
      vendorId, name, email, phone, roleId, departmentId, designation,
      employmentType, shift, experience, education, languages,
      region, city, branch, joiningDate, emergencyContact,
      bankDetails, upiId, address, gender, dateOfBirth, notes,
      reportingManagerId, employeeId
    });

    await logActivity(vendorId, member._id, 'Member Added', `Added new team member: ${name}`);
    res.status(201).json({ success: true, data: member });
  } catch (error) {
    console.error('[addMember Error]', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to add member' });
  }
};

exports.updateMember = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const updated = await VendorTeamMember.findOneAndUpdate(
      { _id: req.params.id, vendorId },
      { $set: req.body },
      { new: true, runValidators: true }
    ).populate('roleId departmentId');
    if (!updated) return res.status(404).json({ success: false, message: 'Member not found' });
    res.json({ success: true, data: updated });
  } catch (error) {
    console.error('[updateMember Error]', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to update member' });
  }
};

exports.deleteMember = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const member = await VendorTeamMember.findOne({ _id: req.params.id, vendorId });
    if (!member) return res.status(404).json({ success: false, message: 'Member not found' });
    // Soft delete
    await VendorTeamMember.findByIdAndUpdate(req.params.id, { isActive: false });
    await logActivity(vendorId, req.params.id, 'Member Deactivated', `Deactivated: ${member.name}`);
    res.json({ success: true, message: 'Member deactivated successfully' });
  } catch (error) {
    console.error('[deleteMember Error]', error);
    res.status(500).json({ success: false, message: 'Failed to deactivate member' });
  }
};

exports.updateMemberStatus = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const { status } = req.body;
    const validStatuses = ['Available', 'Busy', 'On Job', 'Travelling', 'Offline', 'On Leave', 'Training', 'Holiday'];
    if (!validStatuses.includes(status)) return res.status(400).json({ success: false, message: 'Invalid status value' });
    const updated = await VendorTeamMember.findOneAndUpdate(
      { _id: req.params.id, vendorId },
      { availabilityStatus: status },
      { new: true }
    );
    if (!updated) return res.status(404).json({ success: false, message: 'Member not found' });
    res.json({ success: true, data: updated });
  } catch (error) {
    console.error('[updateMemberStatus Error]', error);
    res.status(500).json({ success: false, message: 'Failed to update status' });
  }
};

exports.bulkUpdateMembers = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const { memberIds, update } = req.body; // e.g. { departmentId, availabilityStatus }
    if (!memberIds?.length) return res.status(400).json({ success: false, message: 'No member IDs provided' });
    const result = await VendorTeamMember.updateMany(
      { _id: { $in: memberIds }, vendorId },
      { $set: update }
    );
    res.json({ success: true, message: `Updated ${result.modifiedCount} members` });
  } catch (error) {
    console.error('[bulkUpdateMembers Error]', error);
    res.status(500).json({ success: false, message: 'Bulk update failed' });
  }
};

// ─── PROJECT ASSIGNMENT ───────────────────────────────────────────────────────
exports.getProjectAssignments = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const { memberId, status } = req.query;
    const query = { vendorId };
    if (memberId) query.memberId = memberId;
    if (status) query.status = status;

    const assignments = await VendorProjectAssignment.find(query)
      .populate('memberId', 'name profileImage roleId departmentId')
      .populate({ path: 'memberId', populate: [{ path: 'roleId', select: 'title' }, { path: 'departmentId', select: 'name color' }] })
      .sort({ createdAt: -1 })
      .lean();

    res.json({ success: true, data: assignments });
  } catch (error) {
    console.error('[getProjectAssignments Error]', error);
    res.status(500).json({ success: false, message: 'Failed to fetch project assignments' });
  }
};

exports.assignProject = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const { memberId, projectName, projectType, roleInProject, startDate, endDate, allocationPercent, dailyHours, budget, priority, description } = req.body;

    if (!memberId || !projectName || !startDate || !endDate) {
      return res.status(400).json({ success: false, message: 'Member, project name, start and end dates are required' });
    }

    // Overallocation check
    const existingTotal = await VendorProjectAssignment.aggregate([
      { $match: { memberId: new mongoose.Types.ObjectId(memberId), status: 'Active', startDate: { $lte: new Date(endDate) }, endDate: { $gte: new Date(startDate) } } },
      { $group: { _id: null, totalAlloc: { $sum: '$allocationPercent' } } }
    ]);
    const currentAlloc = existingTotal[0]?.totalAlloc || 0;
    if (currentAlloc + (allocationPercent || 100) > 100) {
      return res.status(400).json({
        success: false,
        message: `Overallocation! Member is already at ${currentAlloc}% allocation in this period. Available: ${100 - currentAlloc}%`
      });
    }

    const assignment = await VendorProjectAssignment.create({
      vendorId, memberId, projectName, projectType, roleInProject,
      startDate, endDate, allocationPercent, dailyHours, budget, priority, description
    });

    if (allocationPercent >= 80) {
      await VendorTeamMember.findByIdAndUpdate(memberId, { availabilityStatus: 'Busy', currentProjectId: assignment._id });
    }

    await logActivity(vendorId, memberId, 'Project Assigned', `Assigned to project: ${projectName}`);
    res.status(201).json({ success: true, data: assignment });
  } catch (error) {
    console.error('[assignProject Error]', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to assign project' });
  }
};

exports.updateProjectAssignment = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const assignment = await VendorProjectAssignment.findOneAndUpdate(
      { _id: req.params.id, vendorId },
      { $set: req.body },
      { new: true, runValidators: true }
    );
    if (!assignment) return res.status(404).json({ success: false, message: 'Assignment not found' });

    // If completed, free up member
    if (req.body.status === 'Completed' || req.body.status === 'Cancelled') {
      const otherActive = await VendorProjectAssignment.countDocuments({ memberId: assignment.memberId, status: 'Active' });
      if (!otherActive) {
        await VendorTeamMember.findByIdAndUpdate(assignment.memberId, { availabilityStatus: 'Available', currentProjectId: null });
      }
    }

    res.json({ success: true, data: assignment });
  } catch (error) {
    console.error('[updateProjectAssignment Error]', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to update assignment' });
  }
};

// ─── PERFORMANCE ──────────────────────────────────────────────────────────────
exports.getPerformance = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const { period, memberId } = req.query;
    const query = { vendorId };
    if (period) query.period = period;
    if (memberId) query.memberId = memberId;

    const performance = await VendorPerformance.find(query)
      .populate('memberId', 'name profileImage roleId departmentId employeeId')
      .populate({ path: 'memberId', populate: [{ path: 'roleId', select: 'title' }, { path: 'departmentId', select: 'name' }] })
      .sort({ period: -1, autoScore: -1 })
      .lean();

    res.json({ success: true, data: performance });
  } catch (error) {
    console.error('[getPerformance Error]', error);
    res.status(500).json({ success: false, message: 'Failed to fetch performance data' });
  }
};

exports.upsertPerformance = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const { memberId, period, periodType, ...metrics } = req.body;
    if (!memberId || !period) return res.status(400).json({ success: false, message: 'memberId and period are required' });

    const autoScore = computeAutoScore(metrics);

    const perf = await VendorPerformance.findOneAndUpdate(
      { vendorId, memberId, period },
      { vendorId, memberId, period, periodType, ...metrics, autoScore },
      { upsert: true, new: true, runValidators: true }
    );

    // Update cached summary on member
    await VendorTeamMember.findByIdAndUpdate(memberId, {
      'performanceSummary.avgRating': metrics.customerRating || 0,
      'performanceSummary.jobsCompleted': metrics.jobsCompleted || 0,
      'performanceSummary.slaPercent': metrics.slaPercent || 0,
      'performanceSummary.attendancePercent': metrics.attendancePercent || 0,
      'performanceSummary.autoScore': autoScore
    });

    res.json({ success: true, data: perf });
  } catch (error) {
    console.error('[upsertPerformance Error]', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to save performance data' });
  }
};

// ─── AVAILABILITY ─────────────────────────────────────────────────────────────
exports.getAvailability = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const members = await VendorTeamMember.find({ vendorId, isActive: true })
      .populate('roleId', 'title')
      .populate('departmentId', 'name color')
      .lean();

    const groups = {
      Available: [], Busy: [], 'On Job': [], Travelling: [],
      Offline: [], 'On Leave': [], Training: [], Holiday: []
    };
    members.forEach(m => {
      const s = m.availabilityStatus || 'Available';
      if (groups[s]) groups[s].push(m);
    });

    const summary = Object.entries(groups).map(([status, list]) => ({
      status,
      count: list.length,
      percent: members.length ? Math.round((list.length / members.length) * 100) : 0
    }));

    res.json({ success: true, data: { members, groups, summary } });
  } catch (error) {
    console.error('[getAvailability Error]', error);
    res.status(500).json({ success: false, message: 'Failed to fetch availability' });
  }
};

exports.updateAvailability = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const { status, currentLocation } = req.body;
    const update = { availabilityStatus: status, lastSeenAt: new Date() };
    if (currentLocation) update.currentLocation = { ...currentLocation, updatedAt: new Date() };
    const member = await VendorTeamMember.findOneAndUpdate({ _id: req.params.id, vendorId }, update, { new: true });
    if (!member) return res.status(404).json({ success: false, message: 'Member not found' });
    res.json({ success: true, data: member });
  } catch (error) {
    console.error('[updateAvailability Error]', error);
    res.status(500).json({ success: false, message: 'Failed to update availability' });
  }
};

// ─── LEAVE MANAGEMENT ─────────────────────────────────────────────────────────
exports.getLeaves = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const { status, memberId, from, to } = req.query;
    const query = { vendorId };
    if (status) query.status = status;
    if (memberId) query.memberId = memberId;
    if (from || to) {
      query.startDate = {};
      if (from) query.startDate.$gte = new Date(from);
      if (to) query.startDate.$lte = new Date(to);
    }

    const leaves = await VendorLeave.find(query)
      .populate('memberId', 'name profileImage departmentId roleId employeeId')
      .populate({ path: 'memberId', populate: [{ path: 'roleId', select: 'title' }, { path: 'departmentId', select: 'name' }] })
      .populate('approvedBy', 'name')
      .sort({ createdAt: -1 })
      .lean();

    res.json({ success: true, data: leaves });
  } catch (error) {
    console.error('[getLeaves Error]', error);
    res.status(500).json({ success: false, message: 'Failed to fetch leaves' });
  }
};

exports.applyLeave = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const { memberId, leaveType, startDate, endDate, reason, isHalfDay, halfDaySession } = req.body;
    if (!memberId || !startDate || !endDate) return res.status(400).json({ success: false, message: 'Member, start and end dates are required' });

    const start = new Date(startDate);
    const end = new Date(endDate);
    const days = isHalfDay ? 0.5 : Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1);

    const leave = await VendorLeave.create({
      vendorId, memberId, leaveType, startDate: start, endDate: end, days, reason, isHalfDay, halfDaySession,
      status: 'Pending'
    });

    await logActivity(vendorId, memberId, 'Leave Applied', `Applied ${leaveType} leave from ${startDate} to ${endDate}`);
    res.status(201).json({ success: true, data: leave });
  } catch (error) {
    console.error('[applyLeave Error]', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to apply leave' });
  }
};

exports.approveLeave = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const { approvedById } = req.body;
    const leave = await VendorLeave.findOneAndUpdate(
      { _id: req.params.id, vendorId },
      { status: 'Approved', approvedBy: approvedById || null, approvedAt: new Date() },
      { new: true }
    );
    if (!leave) return res.status(404).json({ success: false, message: 'Leave request not found' });
    await VendorTeamMember.findByIdAndUpdate(leave.memberId, { availabilityStatus: 'On Leave' });
    res.json({ success: true, data: leave });
  } catch (error) {
    console.error('[approveLeave Error]', error);
    res.status(500).json({ success: false, message: 'Failed to approve leave' });
  }
};

exports.rejectLeave = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const { rejectionReason } = req.body;
    const leave = await VendorLeave.findOneAndUpdate(
      { _id: req.params.id, vendorId },
      { status: 'Rejected', rejectionReason: rejectionReason || '', approvedAt: new Date() },
      { new: true }
    );
    if (!leave) return res.status(404).json({ success: false, message: 'Leave request not found' });
    res.json({ success: true, data: leave });
  } catch (error) {
    console.error('[rejectLeave Error]', error);
    res.status(500).json({ success: false, message: 'Failed to reject leave' });
  }
};

// ─── ATTENDANCE ───────────────────────────────────────────────────────────────
exports.getAttendance = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const { memberId, from, to, status } = req.query;
    const query = { vendorId };
    if (memberId) query.memberId = memberId;
    if (status) query.status = status;
    if (from || to) {
      query.date = {};
      if (from) query.date.$gte = new Date(from);
      if (to) query.date.$lte = new Date(to);
    }

    const attendance = await VendorAttendance.find(query)
      .populate('memberId', 'name profileImage employeeId departmentId')
      .sort({ date: -1 })
      .lean();

    res.json({ success: true, data: attendance });
  } catch (error) {
    console.error('[getAttendance Error]', error);
    res.status(500).json({ success: false, message: 'Failed to fetch attendance' });
  }
};

exports.markAttendance = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const { memberId, date, status, checkInTime, checkOutTime, method, checkInLocation, checkOutLocation, overtimeHours, remarks, isLateArrival, lateByMinutes } = req.body;
    if (!memberId || !date) return res.status(400).json({ success: false, message: 'Member ID and date are required' });

    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);

    // Compute working hours
    let workingHours = 0;
    if (checkInTime && checkOutTime) {
      workingHours = Math.max(0, (new Date(checkOutTime) - new Date(checkInTime)) / (1000 * 60 * 60));
    }

    const attendance = await VendorAttendance.findOneAndUpdate(
      { vendorId, memberId, date: dayStart },
      { vendorId, memberId, date: dayStart, status, checkInTime, checkOutTime, method, checkInLocation, checkOutLocation, workingHours: parseFloat(workingHours.toFixed(2)), overtimeHours, remarks, isLateArrival, lateByMinutes },
      { upsert: true, new: true, runValidators: true }
    );

    res.json({ success: true, data: attendance });
  } catch (error) {
    console.error('[markAttendance Error]', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to mark attendance' });
  }
};

// ─── CERTIFICATIONS ───────────────────────────────────────────────────────────
exports.getCertifications = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const { memberId, type, status } = req.query;
    const query = { vendorId };
    if (memberId) query.memberId = memberId;
    if (type) query.type = type;
    if (status) query.status = status;

    const certs = await VendorCertification.find(query)
      .populate('memberId', 'name profileImage employeeId departmentId')
      .sort({ expiryDate: 1 })
      .lean();

    // Auto-update status based on expiry
    const now = new Date();
    const soon = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const enriched = certs.map(c => {
      let computedStatus = c.status;
      if (c.expiryDate) {
        const exp = new Date(c.expiryDate);
        if (exp < now) computedStatus = 'Expired';
        else if (exp <= soon) computedStatus = 'Expiring Soon';
        else computedStatus = 'Valid';
      }
      return { ...c, computedStatus };
    });

    res.json({ success: true, data: enriched });
  } catch (error) {
    console.error('[getCertifications Error]', error);
    res.status(500).json({ success: false, message: 'Failed to fetch certifications' });
  }
};

exports.addCertification = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const { memberId, type, name, issuedBy, issuedDate, expiryDate, documentUrl, notes } = req.body;
    if (!memberId || !name) return res.status(400).json({ success: false, message: 'Member and certification name are required' });

    const cert = await VendorCertification.create({ vendorId, memberId, type, name, issuedBy, issuedDate, expiryDate, documentUrl, notes });
    res.status(201).json({ success: true, data: cert });
  } catch (error) {
    console.error('[addCertification Error]', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to add certification' });
  }
};

exports.updateCertification = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const cert = await VendorCertification.findOneAndUpdate({ _id: req.params.id, vendorId }, { $set: req.body }, { new: true });
    if (!cert) return res.status(404).json({ success: false, message: 'Certification not found' });
    res.json({ success: true, data: cert });
  } catch (error) {
    console.error('[updateCertification Error]', error);
    res.status(500).json({ success: false, message: 'Failed to update certification' });
  }
};

exports.deleteCertification = async (req, res) => {
  try {
    const vendorId = req.user.id;
    await VendorCertification.findOneAndDelete({ _id: req.params.id, vendorId });
    res.json({ success: true, message: 'Certification deleted' });
  } catch (error) {
    console.error('[deleteCertification Error]', error);
    res.status(500).json({ success: false, message: 'Failed to delete certification' });
  }
};

// ─── ACTIVITY LOG ─────────────────────────────────────────────────────────────
exports.getActivity = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const { memberId, limit = 20 } = req.query;
    const query = { vendorId };
    if (memberId) query.memberId = memberId;
    const activities = await VendorActivityLog.find(query)
      .populate('memberId', 'name profileImage')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .lean();
    res.json({ success: true, data: activities });
  } catch (error) {
    console.error('[getActivity Error]', error);
    res.status(500).json({ success: false, message: 'Failed to fetch activity log' });
  }
};

// ─── ANALYTICS ───────────────────────────────────────────────────────────────
exports.getAnalytics = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const vId = new mongoose.Types.ObjectId(vendorId);
    const { period } = req.query; // e.g. '2026-07'

    const [members, departments, assignments, performances, attendance] = await Promise.all([
      VendorTeamMember.find({ vendorId: vId, isActive: true }).lean(),
      VendorDepartment.find({ vendorId: vId }).lean(),
      VendorProjectAssignment.find({ vendorId: vId }).lean(),
      period ? VendorPerformance.find({ vendorId: vId, period }).lean() : VendorPerformance.find({ vendorId: vId }).lean(),
      VendorAttendance.find({ vendorId: vId }).lean()
    ]);

    // Department performance
    const deptPerformance = await Promise.all(departments.map(async d => {
      const deptMembers = members.filter(m => m.departmentId?.toString() === d._id.toString());
      const memberIds = deptMembers.map(m => m._id);
      const deptPerfs = performances.filter(p => memberIds.some(id => id.toString() === p.memberId?.toString()));
      const avgScore = deptPerfs.length ? Math.round(deptPerfs.reduce((s, p) => s + (p.autoScore || 0), 0) / deptPerfs.length) : 0;
      return { department: d.name, color: d.color, memberCount: deptMembers.length, avgScore };
    }));

    // Attendance summary
    const presentDays = attendance.filter(a => a.status === 'Present').length;
    const totalDays = attendance.length || 1;
    const overallAttendance = Math.round((presentDays / totalDays) * 100);

    // Project utilization
    const activeAssignments = assignments.filter(a => a.status === 'Active').length;
    const projectUtilization = members.length ? Math.round((activeAssignments / members.length) * 100) : 0;

    res.json({
      success: true,
      data: {
        totalMembers: members.length,
        overallAttendance,
        projectUtilization,
        deptPerformance,
        performanceSummary: {
          avgScore: performances.length ? Math.round(performances.reduce((s, p) => s + (p.autoScore || 0), 0) / performances.length) : 0,
          avgRating: performances.length ? parseFloat((performances.reduce((s, p) => s + (p.customerRating || 0), 0) / performances.length).toFixed(1)) : 0,
          avgSla: performances.length ? Math.round(performances.reduce((s, p) => s + (p.slaPercent || 0), 0) / performances.length) : 0,
          totalJobs: performances.reduce((s, p) => s + (p.jobsCompleted || 0), 0),
          totalRevenue: performances.reduce((s, p) => s + (p.revenueGenerated || 0), 0)
        }
      }
    });
  } catch (error) {
    console.error('[getAnalytics Error]', error);
    res.status(500).json({ success: false, message: 'Failed to fetch analytics' });
  }
};

// ─── LEGACY COMPATIBILITY ─────────────────────────────────────────────────────
exports.getTeamOverview = exports.getWorkforceDashboard;
