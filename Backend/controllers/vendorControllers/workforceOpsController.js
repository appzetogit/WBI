/**
 * Workforce Controller — live engineers, teams, assignments, leave, attendance
 */
const mongoose = require('mongoose');
const VendorWorkforceEngineer = require('../../models/VendorWorkforceEngineer');
const VendorWorkforceTeam = require('../../models/VendorWorkforceTeam');
const VendorWorkforceAssignment = require('../../models/VendorWorkforceAssignment');
const VendorWorkforceAttendance = require('../../models/VendorWorkforceAttendance');
const VendorWorkforceLeave = require('../../models/VendorWorkforceLeave');
const VendorWorkforceCertification = require('../../models/VendorWorkforceCertification');
const Vendor = require('../../models/Vendor');
const {
  syncLinkedEngineers,
  applyLeaveDecision
} = require('../../services/vendorWorkforceSync.service');

const getVendorId = (req) => req.user._id || req.user.id;

const getVendorCategoryCodes = async (vendorId) => {
  const vendor = await Vendor.findById(vendorId).select('approvedServices').lean();
  if (!vendor?.approvedServices?.length) return [];
  return vendor.approvedServices
    .filter((s) => s.status === 'active' || s.status === 'approved')
    .map((s) => s.categoryCode)
    .filter(Boolean);
};

const applyCategoryFilter = async (filter, vendorId, category) => {
  if (category) {
    filter.serviceCategoryCode = String(category).toUpperCase();
    return;
  }
  const codes = await getVendorCategoryCodes(vendorId);
  if (codes.length) {
    filter.serviceCategoryCode = { $in: codes };
  }
};

const liveBase = (vendorId) => ({
  vendorId: new mongoose.Types.ObjectId(vendorId),
  demoTag: null
});

const ensureWorkforceSynced = async (vendorId) => {
  try {
    await syncLinkedEngineers(vendorId);
  } catch (err) {
    console.warn('[workforce sync]', err.message);
  }
};

const refreshEngineerAvailability = async (vendorId, engineerId) => {
  if (!engineerId) return;
  const now = new Date();
  const onLeave = await VendorWorkforceLeave.exists({
    vendorId,
    engineerId,
    status: 'approved',
    startDate: { $lte: now },
    endDate: { $gte: now },
    demoTag: null
  });
  if (onLeave) {
    await VendorWorkforceEngineer.updateOne(
      { _id: engineerId, vendorId },
      { $set: { availability: 'leave' } }
    );
    return;
  }
  const openAsg = await VendorWorkforceAssignment.exists({
    vendorId,
    engineerId,
    status: { $in: ['assigned', 'in_progress', 'escalated'] },
    demoTag: null
  });
  await VendorWorkforceEngineer.updateOne(
    { _id: engineerId, vendorId },
    {
      $set: openAsg
        ? { availability: 'on_project' }
        : { availability: 'available', todayTask: '' }
    }
  );
};

const getCounts = async (req, res) => {
  try {
    const vendorId = getVendorId(req);
    await ensureWorkforceSynced(vendorId);
    const vid = new mongoose.Types.ObjectId(vendorId);
    const base = { vendorId: vid, demoTag: null };
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);
    const soon = new Date(Date.now() + 30 * 86400000);

    const [
      totalEngineers,
      available,
      activeTeams,
      openAssignments,
      onLeave,
      presentToday,
      pendingLeave,
      expiringCerts
    ] = await Promise.all([
      VendorWorkforceEngineer.countDocuments({ ...base, status: 'active' }),
      VendorWorkforceEngineer.countDocuments({ ...base, status: 'active', availability: 'available' }),
      VendorWorkforceTeam.countDocuments({ ...base, status: { $in: ['active', 'deployed'] } }),
      VendorWorkforceAssignment.countDocuments({
        ...base,
        status: { $in: ['assigned', 'in_progress', 'escalated'] }
      }),
      VendorWorkforceEngineer.countDocuments({ ...base, availability: 'leave' }),
      VendorWorkforceAttendance.countDocuments({
        ...base,
        date: { $gte: todayStart, $lte: todayEnd },
        status: { $in: ['present', 'late', 'half_day'] }
      }),
      VendorWorkforceLeave.countDocuments({ ...base, status: 'pending' }),
      VendorWorkforceCertification.countDocuments({
        ...base,
        $or: [
          { verificationStatus: 'renewal_due' },
          { verificationStatus: 'expired' },
          { expiryDate: { $lte: soon }, verificationStatus: { $ne: 'expired' } }
        ]
      })
    ]);

    res.status(200).json({
      success: true,
      data: {
        totalEngineers,
        available,
        activeTeams,
        openAssignments,
        onLeave,
        presentToday,
        pendingLeave,
        expiringCerts
      }
    });
  } catch (error) {
    console.error('workforce getCounts:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch counts' });
  }
};

const syncWorkforce = async (req, res) => {
  try {
    const vendorId = getVendorId(req);
    const result = await syncLinkedEngineers(vendorId);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    console.error('syncWorkforce:', error);
    res.status(500).json({ success: false, message: error.message || 'Sync failed' });
  }
};

const getEngineers = async (req, res) => {
  try {
    const vendorId = getVendorId(req);
    await ensureWorkforceSynced(vendorId);
    const { status, availability, category, search, city, page = 1, limit = 12, sort = 'updatedAt' } = req.query;
    const filter = liveBase(vendorId);
    if (status) filter.status = status;
    if (availability) filter.availability = availability;
    if (city) filter.city = new RegExp(city, 'i');
    await applyCategoryFilter(filter, vendorId, category);
    if (search?.trim()) {
      const rx = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$and = (filter.$and || []).concat([{
        $or: [{ name: rx }, { employeeId: rx }, { role: rx }, { primarySkill: rx }, { city: rx }]
      }]);
    }
    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const sortField = ['updatedAt', 'name', 'rating', 'performanceScore'].includes(sort) ? sort : 'updatedAt';
    const [data, total] = await Promise.all([
      VendorWorkforceEngineer.find(filter).sort({ [sortField]: -1 }).skip(skip).limit(parseInt(limit, 10)).lean(),
      VendorWorkforceEngineer.countDocuments(filter)
    ]);
    res.status(200).json({
      success: true,
      data,
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total,
        pages: Math.ceil(total / parseInt(limit, 10)) || 1
      }
    });
  } catch (error) {
    console.error('getEngineers:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch engineers' });
  }
};

const updateEngineer = async (req, res) => {
  try {
    const vendorId = getVendorId(req);
    const eng = await VendorWorkforceEngineer.findOne({
      _id: req.params.id,
      vendorId: new mongoose.Types.ObjectId(vendorId),
      demoTag: null
    });
    if (!eng) return res.status(404).json({ success: false, message: 'Engineer not found' });
    const { action, availability, status } = req.body;
    if (action === 'suspend') eng.status = 'suspended';
    else if (action === 'deactivate') eng.status = 'deactivated';
    else if (action === 'activate') eng.status = 'active';
    else if (action === 'promote') {
      const levels = ['trainee', 'junior', 'mid', 'senior', 'lead', 'expert'];
      const idx = levels.indexOf(eng.certificationLevel);
      if (idx < levels.length - 1) eng.certificationLevel = levels[idx + 1];
    }
    if (availability) eng.availability = availability;
    if (status && !action) eng.status = status;
    await eng.save();
    res.status(200).json({ success: true, data: eng });
  } catch (error) {
    console.error('updateEngineer:', error);
    res.status(500).json({ success: false, message: 'Failed to update engineer' });
  }
};

const getTeams = async (req, res) => {
  try {
    const vendorId = getVendorId(req);
    const { status, category, search, page = 1, limit = 12 } = req.query;
    const filter = liveBase(vendorId);
    if (status) filter.status = status;
    await applyCategoryFilter(filter, vendorId, category);
    if (search?.trim()) {
      const rx = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$and = (filter.$and || []).concat([{
        $or: [{ name: rx }, { teamCode: rx }, { leaderName: rx }, { city: rx }]
      }]);
    }
    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const [data, total] = await Promise.all([
      VendorWorkforceTeam.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(parseInt(limit, 10)).lean(),
      VendorWorkforceTeam.countDocuments(filter)
    ]);
    res.status(200).json({
      success: true,
      data,
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total,
        pages: Math.ceil(total / parseInt(limit, 10)) || 1
      }
    });
  } catch (error) {
    console.error('getTeams:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch teams' });
  }
};

const getStructure = async (req, res) => {
  try {
    const vendorId = getVendorId(req);
    await ensureWorkforceSynced(vendorId);
    const engineers = await VendorWorkforceEngineer.find({
      vendorId: new mongoose.Types.ObjectId(vendorId),
      demoTag: null,
      status: { $ne: 'deactivated' }
    }).select('name role department reportingManager employeeId serviceCategoryName availability status certificationLevel').lean();

    const byDept = {};
    engineers.forEach((e) => {
      const d = e.department || 'Operations';
      if (!byDept[d]) byDept[d] = [];
      byDept[d].push(e);
    });

    const tree = {
      role: 'Vendor Owner',
      children: Object.entries(byDept).map(([dept, members]) => {
        const managers = members.filter((m) => /manager|lead|supervisor/i.test(m.role));
        const rest = members.filter((m) => !/manager|lead|supervisor/i.test(m.role));
        return {
          role: dept,
          children: [
            ...managers.map((m) => ({
              role: m.role,
              name: m.name,
              employeeId: m.employeeId,
              availability: m.availability,
              children: rest
                .filter((r) => !r.reportingManager || r.reportingManager === m.name)
                .slice(0, 8)
                .map((r) => ({
                  role: r.role,
                  name: r.name,
                  employeeId: r.employeeId,
                  availability: r.availability,
                  children: []
                }))
            })),
            ...(managers.length === 0
              ? rest.slice(0, 12).map((r) => ({
                  role: r.role,
                  name: r.name,
                  employeeId: r.employeeId,
                  availability: r.availability,
                  children: []
                }))
              : [])
          ]
        };
      })
    };

    res.status(200).json({ success: true, data: { tree, total: engineers.length, departments: Object.keys(byDept) } });
  } catch (error) {
    console.error('getStructure:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch structure' });
  }
};

const getSkillMatrix = async (req, res) => {
  try {
    const vendorId = getVendorId(req);
    await ensureWorkforceSynced(vendorId);
    const { category, search } = req.query;
    const filter = { ...liveBase(vendorId), status: 'active' };
    await applyCategoryFilter(filter, vendorId, category);
    if (search?.trim()) {
      const rx = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ name: rx }, { primarySkill: rx }, { 'skills.name': rx }];
    }
    const engineers = await VendorWorkforceEngineer.find(filter)
      .select('name employeeId role primarySkill skills serviceCategoryName performanceScore')
      .lean();

    const skillAgg = {};
    engineers.forEach((e) => {
      (e.skills || []).forEach((s) => {
        if (!skillAgg[s.name]) skillAgg[s.name] = { name: s.name, count: 0, avgProficiency: 0, total: 0 };
        skillAgg[s.name].count += 1;
        skillAgg[s.name].total += s.proficiency || 0;
      });
    });
    Object.values(skillAgg).forEach((s) => {
      s.avgProficiency = s.count ? Math.round(s.total / s.count) : 0;
      delete s.total;
    });

    const gaps = Object.values(skillAgg)
      .filter((s) => s.count < 2 || s.avgProficiency < 70)
      .sort((a, b) => a.avgProficiency - b.avgProficiency);

    res.status(200).json({
      success: true,
      data: {
        engineers,
        skillSummary: Object.values(skillAgg).sort((a, b) => b.count - a.count),
        gaps
      }
    });
  } catch (error) {
    console.error('getSkillMatrix:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch skill matrix' });
  }
};

const getAssignments = async (req, res) => {
  try {
    const vendorId = getVendorId(req);
    const { status, priority, category, search, page = 1, limit = 12 } = req.query;
    const filter = liveBase(vendorId);
    if (status) filter.status = status;
    if (priority) filter.priority = priority;
    await applyCategoryFilter(filter, vendorId, category);
    if (search?.trim()) {
      const rx = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$and = (filter.$and || []).concat([{
        $or: [{ projectName: rx }, { engineerName: rx }, { task: rx }, { assignmentCode: rx }]
      }]);
    }
    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const [data, total] = await Promise.all([
      VendorWorkforceAssignment.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(parseInt(limit, 10)).lean(),
      VendorWorkforceAssignment.countDocuments(filter)
    ]);
    res.status(200).json({
      success: true,
      data,
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total,
        pages: Math.ceil(total / parseInt(limit, 10)) || 1
      }
    });
  } catch (error) {
    console.error('getAssignments:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch assignments' });
  }
};

const updateAssignment = async (req, res) => {
  try {
    const vendorId = getVendorId(req);
    const asg = await VendorWorkforceAssignment.findOne({
      _id: req.params.id,
      vendorId: new mongoose.Types.ObjectId(vendorId),
      demoTag: null
    });
    if (!asg) return res.status(404).json({ success: false, message: 'Assignment not found' });
    const { action, progress } = req.body;
    if (action === 'complete') { asg.status = 'completed'; asg.progress = 100; }
    else if (action === 'reject') asg.status = 'rejected';
    else if (action === 'escalate') asg.status = 'escalated';
    else if (action === 'start') asg.status = 'in_progress';
    if (typeof progress === 'number') asg.progress = progress;
    await asg.save();

    if (['complete', 'reject'].includes(action)) {
      await refreshEngineerAvailability(vendorId, asg.engineerId);
    } else if (['start', 'escalate'].includes(action) && asg.engineerId) {
      await VendorWorkforceEngineer.updateOne(
        { _id: asg.engineerId, vendorId, availability: { $ne: 'leave' } },
        { $set: { availability: 'on_project', todayTask: asg.task || asg.projectName } }
      );
    }

    res.status(200).json({ success: true, data: asg });
  } catch (error) {
    console.error('updateAssignment:', error);
    res.status(500).json({ success: false, message: 'Failed to update assignment' });
  }
};

const getAvailability = async (req, res) => {
  try {
    const vendorId = getVendorId(req);
    await ensureWorkforceSynced(vendorId);
    const { category, search } = req.query;
    const filter = { ...liveBase(vendorId), status: 'active' };
    await applyCategoryFilter(filter, vendorId, category);
    if (search?.trim()) {
      const rx = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ name: rx }, { city: rx }, { currentLocation: rx }];
    }
    const engineers = await VendorWorkforceEngineer.find(filter)
      .select('name employeeId role availability currentLocation city gps capacity utilization nextAvailableAt todayTask serviceCategoryName')
      .sort({ availability: 1 })
      .lean();

    const summary = engineers.reduce((acc, e) => {
      acc[e.availability] = (acc[e.availability] || 0) + 1;
      return acc;
    }, {});

    res.status(200).json({ success: true, data: { engineers, summary } });
  } catch (error) {
    console.error('getAvailability:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch availability' });
  }
};

const getAttendance = async (req, res) => {
  try {
    const vendorId = getVendorId(req);
    const { status, search, page = 1, limit = 20 } = req.query;
    const filter = liveBase(vendorId);
    if (status) filter.status = status;
    if (search?.trim()) {
      const rx = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ engineerName: rx }, { employeeId: rx }];
    }
    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const [data, total] = await Promise.all([
      VendorWorkforceAttendance.find(filter).sort({ date: -1 }).skip(skip).limit(parseInt(limit, 10)).lean(),
      VendorWorkforceAttendance.countDocuments(filter)
    ]);
    res.status(200).json({
      success: true,
      data,
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total,
        pages: Math.ceil(total / parseInt(limit, 10)) || 1
      }
    });
  } catch (error) {
    console.error('getAttendance:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch attendance' });
  }
};

const getLeaves = async (req, res) => {
  try {
    const vendorId = getVendorId(req);
    const { status, leaveType, search, page = 1, limit = 20 } = req.query;
    const filter = liveBase(vendorId);
    if (status) filter.status = status;
    if (leaveType) filter.leaveType = leaveType;
    if (search?.trim()) {
      const rx = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ engineerName: rx }, { employeeId: rx }, { reason: rx }];
    }
    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const [data, total] = await Promise.all([
      VendorWorkforceLeave.find(filter).sort({ startDate: -1 }).skip(skip).limit(parseInt(limit, 10)).lean(),
      VendorWorkforceLeave.countDocuments(filter)
    ]);
    res.status(200).json({
      success: true,
      data,
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total,
        pages: Math.ceil(total / parseInt(limit, 10)) || 1
      }
    });
  } catch (error) {
    console.error('getLeaves:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch leaves' });
  }
};

const updateLeave = async (req, res) => {
  try {
    const vendorId = getVendorId(req);
    const leave = await VendorWorkforceLeave.findOne({
      _id: req.params.id,
      vendorId: new mongoose.Types.ObjectId(vendorId),
      demoTag: null
    });
    if (!leave) return res.status(404).json({ success: false, message: 'Leave not found' });
    const { action, rejectionReason } = req.body;
    if (action === 'approve') {
      leave.status = 'approved';
      leave.approvedBy = req.user.name || 'Vendor Manager';
    } else if (action === 'manager_approve') {
      leave.status = 'manager_approved';
      leave.approvedBy = req.user.name || 'Manager';
    } else if (action === 'reject') {
      leave.status = 'rejected';
      leave.rejectionReason = rejectionReason || 'Rejected';
    } else {
      return res.status(400).json({ success: false, message: 'Invalid action' });
    }
    await leave.save();
    await applyLeaveDecision(vendorId, leave, action);
    if (action === 'reject' && leave.engineerId) {
      await refreshEngineerAvailability(vendorId, leave.engineerId);
    }
    res.status(200).json({ success: true, data: leave });
  } catch (error) {
    console.error('updateLeave:', error);
    res.status(500).json({ success: false, message: 'Failed to update leave' });
  }
};

const getCertifications = async (req, res) => {
  try {
    const vendorId = getVendorId(req);
    const { status, category, search, page = 1, limit = 20 } = req.query;
    const filter = liveBase(vendorId);
    if (status) filter.verificationStatus = status;
    if (category) filter.serviceCategoryCode = String(category).toUpperCase();
    if (search?.trim()) {
      const rx = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ name: rx }, { engineerName: rx }, { certificateNumber: rx }];
    }
    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const [data, total] = await Promise.all([
      VendorWorkforceCertification.find(filter).sort({ expiryDate: 1 }).skip(skip).limit(parseInt(limit, 10)).lean(),
      VendorWorkforceCertification.countDocuments(filter)
    ]);
    res.status(200).json({
      success: true,
      data,
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total,
        pages: Math.ceil(total / parseInt(limit, 10)) || 1
      }
    });
  } catch (error) {
    console.error('getCertifications:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch certifications' });
  }
};

module.exports = {
  getCounts,
  syncWorkforce,
  getEngineers,
  updateEngineer,
  getTeams,
  getStructure,
  getSkillMatrix,
  getAssignments,
  updateAssignment,
  getAvailability,
  getAttendance,
  getLeaves,
  updateLeave,
  getCertifications
};
