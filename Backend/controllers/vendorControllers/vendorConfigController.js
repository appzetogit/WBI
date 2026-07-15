const Vendor = require('../../models/Vendor');
const ServiceCategory = require('../../models/ServiceCategory');
const VendorProject = require('../../models/VendorProject');
const Opportunity = require('../../models/Opportunity');

exports.getDynamicConfig = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const vendor = await Vendor.findById(vendorId).select('approvedServices masterWallet compliance vendorTier overallRating');
    
    if (!vendor) {
      return res.status(404).json({ success: false, message: 'Vendor not found' });
    }

    // Get the category codes the vendor is approved for
    const approvedCategoryCodes = vendor.approvedServices.map(s => s.categoryCode);

    // Fetch full category details for these codes
    const categories = await ServiceCategory.find({ categoryCode: { $in: approvedCategoryCodes } });

    // Build Dashboard Widgets based on services
    let dashboardWidgets = ['wallet', 'active_projects', 'sla_adherence'];
    let kpiDefinitions = [];
    
    if (approvedCategoryCodes.includes('C01')) {
      dashboardWidgets.push('cctv_kpis');
      kpiDefinitions.push({ key: 'camerasInstalled', label: 'Cameras Installed', type: 'number' });
      kpiDefinitions.push({ key: 'sitesCompleted', label: 'Sites Completed', type: 'number' });
    }
    if (approvedCategoryCodes.includes('C03')) {
      dashboardWidgets.push('network_kpis');
      kpiDefinitions.push({ key: 'racksInstalled', label: 'Racks Installed', type: 'number' });
    }
    if (approvedCategoryCodes.includes('C04')) {
      dashboardWidgets.push('solar_kpis');
      kpiDefinitions.push({ key: 'kwInstalled', label: 'kW Installed', type: 'number' });
      kpiDefinitions.push({ key: 'panelsDeployed', label: 'Panels Deployed', type: 'number' });
    }

    // Build Sidebar Sections (Permissions)
    let sidebarSections = [
      'Dashboard',
      'Business Intake',
      'Clients & Contracts',
      'Project Operations',
      'Workforce',
      'Resources',
      'Quality & Control',
      'Finance',
      'Performance',
      'Compliance',
      'Notifications',
      'Support',
      'Settings'
    ];

    // Build project templates per service
    let projectTemplates = {};
    categories.forEach(cat => {
      projectTemplates[cat.categoryCode] = cat.projectTemplates;
    });

    const activeProjectsCount = await VendorProject.countDocuments({ vendorId, status: { $in: ['active', 'in_progress', 'quality_check'] } });
    const pendingOpportunitiesCount = await Opportunity.countDocuments({ 
      status: 'open',
      eligibleVendors: vendorId 
    });

    res.status(200).json({
      success: true,
      data: {
        vendorProfile: {
          walletBalance: vendor.masterWallet?.balance || 0,
          vendorTier: vendor.vendorTier,
          overallRating: vendor.overallRating,
          complianceStatus: vendor.compliance
        },
        approvedServices: vendor.approvedServices,
        dashboardWidgets,
        sidebarSections,
        kpiDefinitions,
        projectTemplates,
        activeProjectsCount,
        pendingOpportunitiesCount,
        alerts: [] // You can populate SLA alerts, compliance expiry here
      }
    });

  } catch (error) {
    console.error('Config API Error:', error);
    res.status(500).json({ success: false, message: 'Server Error fetching config' });
  }
};
