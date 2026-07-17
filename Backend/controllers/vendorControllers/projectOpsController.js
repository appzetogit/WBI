/**
 * Project Operations Controller — vendor-scoped dynamic ops workspace
 */
const mongoose = require('mongoose');
const VendorOpsProject = require('../../models/VendorOpsProject');
const VendorOpsSite = require('../../models/VendorOpsSite');
const VendorOpsMilestone = require('../../models/VendorOpsMilestone');
const VendorDispatch = require('../../models/VendorDispatch');
const VendorCalendarEvent = require('../../models/VendorCalendarEvent');
const Vendor = require('../../models/Vendor');

const getVendorId = (req) => req.user._id || req.user.id;

const getVendorCategoryCodes = async (vendorId) => {
  const vendor = await Vendor.findById(vendorId).select('approvedServices').lean();
  if (!vendor?.approvedServices?.length) return [];
  return vendor.approvedServices.filter((s) => s.status === 'active').map((s) => s.categoryCode).filter(Boolean);
};

const getCounts = async (req, res) => {
  try {
    const vid = new mongoose.Types.ObjectId(getVendorId(req));
    const [projects, sites, milestones, available, liveJobs, eventsToday] = await Promise.all([
      VendorOpsProject.countDocuments({ vendorId: vid, status: { $in: ['planning', 'in_progress', 'at_risk'] } }),
      VendorOpsSite.countDocuments({ vendorId: vid, status: { $in: ['active', 'in_progress', 'pending'] } }),
      VendorOpsMilestone.countDocuments({ vendorId: vid, status: { $in: ['pending', 'in_progress', 'overdue'] } }),
      VendorDispatch.countDocuments({ vendorId: vid, availability: 'available' }),
      VendorDispatch.countDocuments({ vendorId: vid, assignmentStatus: { $in: ['assigned', 'en_route', 'on_site'] } }),
      VendorCalendarEvent.countDocuments({
        vendorId: vid,
        start: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) },
        end: { $lte: new Date(new Date().setHours(23, 59, 59, 999)) }
      })
    ]);
    res.status(200).json({
      success: true,
      data: {
        activeProjects: projects,
        activeSites: sites,
        openMilestones: milestones,
        availableEngineers: available,
        liveJobs,
        eventsToday
      }
    });
  } catch (error) {
    console.error('projectOps getCounts:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch counts' });
  }
};

const getProjects = async (req, res) => {
  try {
    const vendorId = getVendorId(req);
    const { status, priority, category, search, projectType, page = 1, limit = 12, sort = 'updatedAt' } = req.query;
    const filter = { vendorId: new mongoose.Types.ObjectId(vendorId) };
    if (status) filter.status = status;
    if (priority) filter.priority = priority;
    if (projectType) filter.projectType = projectType;
    if (category) filter.serviceCategoryCode = category;
    else {
      const codes = await getVendorCategoryCodes(vendorId);
      if (codes.length) {
        filter.$or = [
          { serviceCategoryCode: { $in: codes } },
          { serviceCategoryCode: { $exists: true } }
        ];
      }
    }
    if (search?.trim()) {
      const rx = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$and = (filter.$and || []).concat([{ $or: [{ title: rx }, { clientName: rx }, { projectCode: rx }, { city: rx }] }]);
    }
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [data, total] = await Promise.all([
      VendorOpsProject.find(filter).sort({ [sort]: -1 }).skip(skip).limit(parseInt(limit)).lean(),
      VendorOpsProject.countDocuments(filter)
    ]);
    res.status(200).json({
      success: true,
      data,
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) || 1 }
    });
  } catch (error) {
    console.error('getProjects:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch projects' });
  }
};

const getProjectById = async (req, res) => {
  try {
    const vendorId = getVendorId(req);
    const project = await VendorOpsProject.findOne({
      _id: req.params.id,
      vendorId: new mongoose.Types.ObjectId(vendorId)
    }).lean();
    if (!project) return res.status(404).json({ success: false, message: 'Project not found' });
    const [sites, milestones] = await Promise.all([
      VendorOpsSite.find({ projectId: project._id }).limit(20).lean(),
      VendorOpsMilestone.find({ projectId: project._id }).sort({ sequence: 1 }).lean()
    ]);
    res.status(200).json({ success: true, data: { ...project, sites, milestones } });
  } catch (error) {
    console.error('getProjectById:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch project' });
  }
};

const updateProject = async (req, res) => {
  try {
    const vendorId = getVendorId(req);
    const project = await VendorOpsProject.findOne({
      _id: req.params.id,
      vendorId: new mongoose.Types.ObjectId(vendorId)
    });
    if (!project) return res.status(404).json({ success: false, message: 'Project not found' });
    const { action, status, progress, assignedManager } = req.body;
    if (action === 'start') project.status = 'in_progress';
    else if (action === 'pause') project.status = 'on_hold';
    else if (action === 'complete') { project.status = 'completed'; project.progress = 100; }
    else if (action === 'archive') project.status = 'archived';
    else if (status) project.status = status;
    if (progress !== undefined) project.progress = progress;
    if (assignedManager !== undefined) project.assignedManager = assignedManager;
    await project.save();
    res.status(200).json({ success: true, message: 'Project updated', data: project });
  } catch (error) {
    console.error('updateProject:', error);
    res.status(500).json({ success: false, message: 'Failed to update project' });
  }
};

const getSites = async (req, res) => {
  try {
    const vendorId = getVendorId(req);
    const { status, city, search, page = 1, limit = 12 } = req.query;
    const filter = { vendorId: new mongoose.Types.ObjectId(vendorId) };
    if (status) filter.status = status;
    if (city) filter.city = new RegExp(city, 'i');
    if (search?.trim()) {
      const rx = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ name: rx }, { siteCode: rx }, { address: rx }, { clientName: rx }];
    }
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [data, total] = await Promise.all([
      VendorOpsSite.find(filter)
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate('projectId', 'title projectCode')
        .lean(),
      VendorOpsSite.countDocuments(filter)
    ]);
    res.status(200).json({
      success: true,
      data,
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) || 1 }
    });
  } catch (error) {
    console.error('getSites:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch sites' });
  }
};

const siteCheckIn = async (req, res) => {
  try {
    const vendorId = getVendorId(req);
    const site = await VendorOpsSite.findOne({
      _id: req.params.id,
      vendorId: new mongoose.Types.ObjectId(vendorId)
    });
    if (!site) return res.status(404).json({ success: false, message: 'Site not found' });
    site.checkInAt = new Date();
    site.status = 'in_progress';
    site.gpsStatus = 'online';
    site.otpVerified = true;
    await site.save();
    res.status(200).json({ success: true, message: 'Checked in', data: site });
  } catch (error) {
    console.error('siteCheckIn:', error);
    res.status(500).json({ success: false, message: 'Check-in failed' });
  }
};

const siteCheckOut = async (req, res) => {
  try {
    const vendorId = getVendorId(req);
    const site = await VendorOpsSite.findOne({
      _id: req.params.id,
      vendorId: new mongoose.Types.ObjectId(vendorId)
    });
    if (!site) return res.status(404).json({ success: false, message: 'Site not found' });
    site.checkOutAt = new Date();
    site.status = 'completed';
    await site.save();
    res.status(200).json({ success: true, message: 'Checked out', data: site });
  } catch (error) {
    console.error('siteCheckOut:', error);
    res.status(500).json({ success: false, message: 'Check-out failed' });
  }
};

const getMilestones = async (req, res) => {
  try {
    const vendorId = getVendorId(req);
    const { status, projectId, page = 1, limit = 20 } = req.query;
    const filter = { vendorId: new mongoose.Types.ObjectId(vendorId) };
    if (status) filter.status = status;
    if (projectId) filter.projectId = new mongoose.Types.ObjectId(projectId);
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [data, total] = await Promise.all([
      VendorOpsMilestone.find(filter)
        .sort({ sequence: 1, dueDate: 1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate('projectId', 'title projectCode clientName serviceCategoryName')
        .lean(),
      VendorOpsMilestone.countDocuments(filter)
    ]);
    res.status(200).json({
      success: true,
      data,
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) || 1 }
    });
  } catch (error) {
    console.error('getMilestones:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch milestones' });
  }
};

const updateMilestone = async (req, res) => {
  try {
    const vendorId = getVendorId(req);
    const ms = await VendorOpsMilestone.findOne({
      _id: req.params.id,
      vendorId: new mongoose.Types.ObjectId(vendorId)
    });
    if (!ms) return res.status(404).json({ success: false, message: 'Milestone not found' });
    const { status, progress, taskId, taskStatus } = req.body;
    if (status) ms.status = status;
    if (progress !== undefined) ms.progress = progress;
    if (taskId && taskStatus) {
      const task = ms.tasks.id(taskId);
      if (task) task.status = taskStatus;
      const done = ms.tasks.filter((t) => t.status === 'done').length;
      ms.progress = ms.tasks.length ? Math.round((done / ms.tasks.length) * 100) : ms.progress;
      if (ms.progress === 100) ms.status = 'completed';
      else if (ms.progress > 0) ms.status = 'in_progress';
    }
    await ms.save();
    res.status(200).json({ success: true, data: ms });
  } catch (error) {
    console.error('updateMilestone:', error);
    res.status(500).json({ success: false, message: 'Failed to update milestone' });
  }
};

const getDispatches = async (req, res) => {
  try {
    const vendorId = getVendorId(req);
    const { availability, radius, search, page = 1, limit = 20 } = req.query;
    const filter = { vendorId: new mongoose.Types.ObjectId(vendorId) };
    if (availability) filter.availability = availability;
    if (radius) filter.distanceKm = { $lte: Number(radius) };
    if (search?.trim()) {
      const rx = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ engineerName: rx }, { city: rx }, { assignedJob: rx }];
    }
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [data, total] = await Promise.all([
      VendorDispatch.find(filter).sort({ distanceKm: 1, workload: 1 }).skip(skip).limit(parseInt(limit)).lean(),
      VendorDispatch.countDocuments(filter)
    ]);
    res.status(200).json({
      success: true,
      data,
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) || 1 }
    });
  } catch (error) {
    console.error('getDispatches:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch dispatch board' });
  }
};

const assignDispatch = async (req, res) => {
  try {
    const vendorId = getVendorId(req);
    const dispatch = await VendorDispatch.findOne({
      _id: req.params.id,
      vendorId: new mongoose.Types.ObjectId(vendorId)
    });
    if (!dispatch) return res.status(404).json({ success: false, message: 'Engineer not found' });
    const { projectId, siteId, assignedJob, assignmentStatus } = req.body;
    if (projectId) dispatch.projectId = projectId;
    if (siteId) dispatch.siteId = siteId;
    if (assignedJob) dispatch.assignedJob = assignedJob;
    dispatch.assignmentStatus = assignmentStatus || 'assigned';
    dispatch.availability = 'on_job';
    dispatch.workload = (dispatch.workload || 0) + 1;
    await dispatch.save();

    try {
      const io = req.app.get('io');
      if (io) io.to(`vendor-${vendorId}`).emit('dispatch_assigned', { dispatchId: dispatch._id });
    } catch (_) { /* non-critical */ }

    res.status(200).json({ success: true, message: 'Engineer assigned', data: dispatch });
  } catch (error) {
    console.error('assignDispatch:', error);
    res.status(500).json({ success: false, message: 'Assign failed' });
  }
};

const getLiveOps = async (req, res) => {
  try {
    const vendorId = getVendorId(req);
    const vid = new mongoose.Types.ObjectId(vendorId);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [liveProjects, liveEngineers, todaySites, delayed, atRisk, milestonesToday] = await Promise.all([
      VendorOpsProject.find({ vendorId: vid, status: 'in_progress' }).limit(10).lean(),
      VendorDispatch.find({ vendorId: vid, assignmentStatus: { $in: ['assigned', 'en_route', 'on_site'] } }).limit(20).lean(),
      VendorOpsSite.find({ vendorId: vid, checkInAt: { $gte: todayStart } }).limit(15).lean(),
      VendorOpsProject.countDocuments({ vendorId: vid, status: 'at_risk' }),
      VendorOpsMilestone.countDocuments({ vendorId: vid, status: 'overdue' }),
      VendorOpsMilestone.find({
        vendorId: vid,
        dueDate: { $gte: todayStart, $lte: new Date(todayStart.getTime() + 86400000) }
      }).limit(10).populate('projectId', 'title').lean()
    ]);

    res.status(200).json({
      success: true,
      data: {
        summary: {
          liveProjects: liveProjects.length,
          liveEngineers: liveEngineers.length,
          todaysJobs: todaySites.length,
          delayedJobs: delayed,
          slaBreaches: atRisk
        },
        liveProjects,
        liveEngineers,
        todaysSites: todaySites,
        milestonesToday
      }
    });
  } catch (error) {
    console.error('getLiveOps:', error);
    res.status(500).json({ success: false, message: 'Failed to load live operations' });
  }
};

const getCalendar = async (req, res) => {
  try {
    const vendorId = getVendorId(req);
    const { from, to, type } = req.query;
    const filter = { vendorId: new mongoose.Types.ObjectId(vendorId) };
    if (type) filter.type = type;
    if (from || to) {
      filter.start = {};
      if (from) filter.start.$gte = new Date(from);
      if (to) filter.start.$lte = new Date(to);
    }
    const data = await VendorCalendarEvent.find(filter)
      .sort({ start: 1 })
      .populate('projectId', 'title projectCode')
      .lean();
    res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('getCalendar:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch calendar' });
  }
};

module.exports = {
  getCounts,
  getProjects,
  getProjectById,
  updateProject,
  getSites,
  siteCheckIn,
  siteCheckOut,
  getMilestones,
  updateMilestone,
  getDispatches,
  assignDispatch,
  getLiveOps,
  getCalendar
};
