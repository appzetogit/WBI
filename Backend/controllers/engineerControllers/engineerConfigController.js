const SubService = require('../../models/SubService');
const WorkerDocumentConfig = require('../../models/WorkerDocumentConfig');
const WorkerRegistrationConfig = require('../../models/WorkerRegistrationConfig');
const ServiceCategory = require('../../models/ServiceCategory');
const EngineerRegistrationConfig = require('../../models/EngineerRegistrationConfig');
const EngineerTool = require('../../models/EngineerTool');
const FormConfig = require('../../models/FormConfig');

/**
 * Get unified dynamic configuration payload for Engineer Registration flow
 * GET /api/engineer/config/registration
 */
const getRegistrationConfig = async (req, res) => {
  try {
    const role = 'engineer';

    // 1. Fetch Categories (where engineers can register)
    const categories = await ServiceCategory.find({ isActive: true, roles: role }).select('name icon').lean();

    // 2. Fetch SubServices (with their specific required skills and tools)
    const subServices = await SubService.find({ isActive: true })
      .select('name categoryId icon requiredSkills suggestedTools')
      .lean();

    // 3. Fetch Document Requirements
    const documents = await WorkerDocumentConfig.find({ isActive: true }).sort({ order: 1 }).lean();

    // 4. Fetch Registration Steps & General Config
    let registrationConfig = await WorkerRegistrationConfig.findOne().lean();

    // 5. Fetch Engineer Registration Config
    let engineerConfig = await EngineerRegistrationConfig.findOne().lean();

    // 6. Fetch Tools
    let tools = await EngineerTool.find({ isActive: true }).sort({ sortOrder: 1 }).lean();

    // 7. Fetch Form Fields for Dynamic Steps
    const fields = await FormConfig.find({ 
      isActive: true, 
      formType: 'registration',
      $or: [{ role: role }, { role: 'both' }]
    }).sort({ step: 1, order: 1 });

    // Format steps dynamically
    const stepsData = [];

    fields.forEach(field => {
      // Create Step if not exists
      let stepObj = stepsData.find(s => s.stepNumber === field.step);
      if (!stepObj) {
        stepObj = { stepNumber: field.step, title: `Step ${field.step}`, fields: [] };
        stepsData.push(stepObj);
      }
      
      // Clean field for frontend
      const fieldData = {
        key: field.fieldKey,
        label: field.label,
        type: field.type,
        required: field.required,
        options: field.options,
        validation: field.validation
      };

      stepObj.fields.push(fieldData);
    });

    // Fallback if not initialized
    if (!registrationConfig) {
      registrationConfig = {
        isRegistrationEnabled: true,
        steps: stepsData.length > 0 ? stepsData : [
          { stepNumber: 1, title: 'Basic Info', isActive: true, fields: [] },
          { stepNumber: 2, title: 'Skills & Work', isActive: true, fields: [] },
          { stepNumber: 3, title: 'Documents', isActive: true, fields: [] },
          { stepNumber: 4, title: 'Location & Availability', isActive: true, fields: [] },
          { stepNumber: 5, title: 'Complete', isActive: true, fields: [] }
        ]
      };
    } else {
      // Merge FormConfig fields into WorkerRegistrationConfig steps
      registrationConfig.steps = registrationConfig.steps.map(s => {
         const stepFields = stepsData.find(sd => sd.stepNumber === s.stepNumber)?.fields || [];
         return { ...s, fields: stepFields };
      });
    }

    res.status(200).json({
      success: true,
      config: {
        isRegistrationEnabled: registrationConfig.isRegistrationEnabled,
        steps: registrationConfig.steps.filter(s => s.isActive).sort((a,b) => a.stepNumber - b.stepNumber),
        categories: categories.map(c => ({ 
          id: c._id.toString(), 
          _id: c._id.toString(), 
          title: c.name, 
          name: c.name, 
          icon: c.icon 
        })),
        subServices: subServices
          .filter(s => categories.some(cat => cat._id.toString() === s.categoryId?.toString()))
          .map(s => ({ 
            id: s._id.toString(), 
            _id: s._id.toString(), 
            name: s.name, 
            title: s.name, 
            categoryId: s.categoryId ? s.categoryId.toString() : null,
            requiredSkills: s.requiredSkills || [],
            suggestedTools: s.suggestedTools || []
          })),
        documents: documents.map(d => ({
          key: d.key,
          title: d.title,
          description: d.description,
          isRequired: d.isRequired,
          requiresFrontAndBack: d.requiresFrontAndBack,
          acceptedFormats: d.acceptedFormats
        })),
        engineerConfig: engineerConfig || {
          joiningFeeEnabled: true,
          joiningFeeAmount: 249,
          selfieRequired: true,
          videoRequired: false,
          bikeRequired: false,
          toolsRequired: false,
          tshirtSizeRequired: true
        },
        tools: tools.map(t => ({
          name: t.name,
          icon: t.icon
        }))
      }
    });
  } catch (error) {
    console.error('Get registration config error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch registration configuration'
    });
  }
};

module.exports = {
  getRegistrationConfig
};
