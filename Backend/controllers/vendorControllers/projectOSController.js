const VendorProject = require('../../models/VendorProject');
const ServiceCategory = require('../../models/ServiceCategory');
const VendorEngineer = require('../../models/VendorEngineer');

// Get all projects for a vendor
exports.getVendorProjects = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const { status, search } = req.query;
    
    let query = { vendorId };
    
    if (status && status !== 'all') {
      query.status = status;
    }

    if (search) {
      query.$or = [
        { projectCode: { $regex: search, $options: 'i' } },
        { title: { $regex: search, $options: 'i' } }
      ];
    }

    const projects = await VendorProject.find(query)
      .populate('clientId', 'name email companyName')
      .populate('projectTemplate', 'name categoryCode')
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, data: projects });
  } catch (error) {
    console.error('Error fetching vendor projects:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Get single project details (Dynamic OS Engine)
exports.getProjectDetails = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const { projectId } = req.params;

    const project = await VendorProject.findOne({ _id: projectId, vendorId })
      .populate('clientId', 'name email companyName phone')
      .populate('projectTemplate')
      .populate('sites.assignedEngineerId', 'name phone photo skills')
      .populate('milestones.approvedBy', 'name');

    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }

    // Dynamic UI Configs based on the service category of the project
    const category = await ServiceCategory.findOne({ categoryCode: project.serviceCategory });
    
    let dynamicUI = {
      themeColor: category?.color || '#3b82f6',
      availableMilestoneTemplates: category?.subCategories[0]?.defaultMilestones || [],
      requiredTools: category?.subCategories[0]?.requiredTools || [],
      checklistItems: category?.subCategories[0]?.defaultChecklist || [],
      complianceRules: category?.complianceRequirements || {}
    };

    res.status(200).json({ 
      success: true, 
      data: project,
      dynamicUI
    });
  } catch (error) {
    console.error('Error fetching project details:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Update Milestone Status
exports.updateMilestone = async (req, res) => {
  try {
    const { projectId, milestoneId } = req.params;
    const { status, proofUploaded } = req.body;
    const vendorId = req.user.id;

    const project = await VendorProject.findOne({ _id: projectId, vendorId });
    if (!project) return res.status(404).json({ success: false, message: 'Project not found' });

    const milestone = project.milestones.id(milestoneId);
    if (!milestone) return res.status(404).json({ success: false, message: 'Milestone not found' });

    milestone.status = status;
    if (status === 'completed') {
      milestone.completedDate = new Date();
    }
    if (proofUploaded && proofUploaded.length > 0) {
      milestone.proofUploaded.push(...proofUploaded);
    }

    await project.save();
    res.status(200).json({ success: true, data: project });
  } catch (error) {
    console.error('Error updating milestone:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};
