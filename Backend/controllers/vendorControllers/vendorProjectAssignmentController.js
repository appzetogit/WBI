const mongoose = require('mongoose');
const VendorProjectAssignment = require('../../models/VendorProjectAssignment');
const ProjectOS = require('../../models/projectOS/ProjectOS');
const ProjectTemplate = require('../../models/projectOS/ProjectTemplate');
const ProjectMilestone = require('../../models/projectOS/ProjectMilestone');
const ProjectSite = require('../../models/projectOS/ProjectSite');
const ProjectTask = require('../../models/projectOS/ProjectTask');
const Vendor = require('../../models/Vendor');
const VendorTeamMember = require('../../models/VendorTeamMember');
const VendorSkillMatrix = require('../../models/VendorSkillMatrix');

// Helper: Calculate overlap allocation percentage
const getOverlappingAllocation = async (vendorId, memberId, startDate, endDate) => {
  const existingAssignments = await VendorProjectAssignment.find({
    vendorId,
    memberId,
    status: { $in: ['PENDING_ACCEPTANCE', 'ACCEPTED', 'ACTIVE'] },
    $or: [
      { startDate: { $lte: endDate }, endDate: { $gte: startDate } } // overlaps
    ]
  });

  return existingAssignments.reduce((sum, a) => sum + (a.allocationPercent || 0), 0);
};

// 1. Get Available Projects for the Vendor
exports.getAvailableProjects = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const { search, limit = 50 } = req.query;

    const vendor = await Vendor.findById(vendorId).lean();
    if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found' });

    // The project must be assigned to the vendor, and be in an assignable state
    const query = {
      vendorId: vendor._id,
      status: { $in: ['PLANNING', 'IN_PROGRESS', 'APPROVED'] }
    };

    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { projectCode: { $regex: search, $options: 'i' } }
      ];
    }

    // Optimization: we could further restrict by vendor.categories if required by business logic,
    // but vendorId being directly on ProjectOS means it's already explicitly allocated to them.

    const projects = await ProjectOS.find(query)
      .select('projectCode title category subcategory projectTemplateId status startDate expectedEndDate clientName')
      .populate('projectTemplateId', 'name executionType')
      .limit(parseInt(limit))
      .sort({ createdAt: -1 })
      .lean();

    res.json({ success: true, data: projects });
  } catch (error) {
    console.error('[getAvailableProjects Error]', error);
    res.status(500).json({ success: false, message: 'Failed to fetch available projects' });
  }
};

// 2. Get Project Details (Milestones, Sites, Tasks) based on Project/Template execution type
exports.getProjectDetails = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const { projectId } = req.params;

    const project = await ProjectOS.findOne({ _id: projectId, vendorId }).lean();
    if (!project) return res.status(404).json({ success: false, message: 'Project not found or not assigned to you' });

    const template = await ProjectTemplate.findById(project.projectTemplateId).lean();
    if (!template) return res.status(404).json({ success: false, message: 'Project template not found' });

    // Fetch related scope objects
    const [milestones, sites, tasks] = await Promise.all([
      ProjectMilestone.find({ project: project._id }).select('title status').lean(),
      ProjectSite.find({ project: project._id }).select('name siteCode status').lean(),
      ProjectTask.find({ project: project._id }).select('title taskCode status assignedTo priority').lean()
    ]);

    // Roles (normally embedded in template or milestones depending on architecture; assuming global roles for this)
    // As a placeholder, we'll return generic roles based on the execution type
    const defaultRoles = template.category === 'DIGITAL' 
      ? ['Project Manager', 'Business Analyst', 'UI/UX Designer', 'Frontend Developer', 'Backend Developer', 'QA Engineer']
      : ['Project Manager', 'Site Supervisor', 'CCTV Engineer', 'Technician', 'Safety Officer'];

    res.json({
      success: true,
      data: {
        project,
        template,
        milestones,
        sites,
        tasks,
        roles: defaultRoles
      }
    });
  } catch (error) {
    console.error('[getProjectDetails Error]', error);
    res.status(500).json({ success: false, message: 'Failed to fetch project details' });
  }
};

// 3. Validate Assignment (Allocation & Skill check)
exports.validateAssignment = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const { memberId, projectId, startDate, endDate, allocationPercent, requiredSkills = [] } = req.body;

    if (!memberId || !projectId || !startDate || !endDate || !allocationPercent) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (start > end) {
      return res.status(400).json({ success: false, message: 'Start date cannot be after end date' });
    }

    // 1. Check current allocation
    const currentAllocation = await getOverlappingAllocation(vendorId, memberId, start, end);
    const resultingAllocation = currentAllocation + parseInt(allocationPercent);

    // 2. Check skill match
    let skillMatchPercentage = 100;
    let missingSkills = [];
    if (requiredSkills && requiredSkills.length > 0) {
      const memberSkills = await VendorSkillMatrix.find({ vendorId, memberId }).populate('skillId', 'name').lean();
      const memberSkillNames = memberSkills.map(ms => ms.skillId?.name?.toLowerCase());

      const required = requiredSkills.map(s => s.toLowerCase());
      const matched = required.filter(s => memberSkillNames.includes(s));
      
      skillMatchPercentage = Math.round((matched.length / required.length) * 100);
      missingSkills = required.filter(s => !memberSkillNames.includes(s));
    }

    const conflicts = [];
    if (resultingAllocation > 100) conflicts.push(`Allocation exceeds 100% (Current: ${currentAllocation}%, Requested: ${allocationPercent}%)`);

    res.json({
      success: true,
      data: {
        valid: resultingAllocation <= 100,
        currentAllocation,
        resultingAllocation,
        skillMatchPercentage,
        missingSkills,
        conflicts,
        warnings: skillMatchPercentage < 100 ? [`Skill match is only ${skillMatchPercentage}%`] : []
      }
    });

  } catch (error) {
    console.error('[validateAssignment Error]', error);
    res.status(500).json({ success: false, message: 'Validation failed' });
  }
};

// 4. Create Assignment
exports.createAssignment = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const vendorId = req.user.id;
    const {
      memberId, projectId, assignmentScope,
      milestoneId, siteId, taskId,
      assignedRole, requiredSkills = [],
      startDate, endDate, allocationPercent,
      plannedHoursPerDay = 8, priority = 'Medium', notes = ''
    } = req.body;

    const start = new Date(startDate);
    const end = new Date(endDate);

    // Ensure member exists
    const member = await VendorTeamMember.findOne({ _id: memberId, vendorId }).session(session);
    if (!member) throw new Error('Team member not found');

    // Ensure project exists
    const project = await ProjectOS.findOne({ _id: projectId, vendorId }).session(session);
    if (!project) throw new Error('Project not found or not assigned to vendor');

    // Validation
    const currentAllocation = await getOverlappingAllocation(vendorId, memberId, start, end);
    if (currentAllocation + parseInt(allocationPercent) > 100) {
      throw new Error(`Allocation conflict: Resulting allocation is ${currentAllocation + parseInt(allocationPercent)}%`);
    }

    // Create
    const assignment = await VendorProjectAssignment.create([{
      vendorId,
      memberId,
      projectId: project._id,
      projectName: project.title,
      projectTemplateId: project.projectTemplateId,
      assignmentScope,
      milestoneId: milestoneId || null,
      siteId: siteId || null,
      taskId: taskId || null,
      assignedRole,
      requiredSkills,
      skillMatchPercentage: 100, // Normally computed, simplified for creation as it was validated
      startDate: start,
      endDate: end,
      allocationPercent,
      plannedHoursPerDay,
      priority,
      notes,
      assignedBy: req.user.id,
      status: 'PENDING_ACCEPTANCE' // Flow requirement
    }], { session });

    await session.commitTransaction();
    session.endSession();

    res.status(201).json({ success: true, data: assignment[0] });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error('[createAssignment Error]', error);
    res.status(400).json({ success: false, message: error.message || 'Failed to create assignment' });
  }
};
