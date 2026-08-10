const OneTimeService = require('../../models/OneTimeService');
const Service = require('../../models/Service');
const WorkerDocumentConfig = require('../../models/WorkerDocumentConfig');
const WorkerRegistrationConfig = require('../../models/WorkerRegistrationConfig');
const ServiceCategory = require('../../models/ServiceCategory');
const FormConfig = require('../../models/FormConfig');

/**
 * Get unified dynamic configuration payload for Worker Registration flow
 * GET /api/workers/auth/config/registration
 */
const getRegistrationConfig = async (req, res) => {
  try {
    const role = 'worker';

    const categories = await ServiceCategory.find({ isActive: true, type: 'ONE_TIME', roles: 'worker' }).select('name icon image description').lean();

    const subServices = await Service.find({ status: 'active', type: 'ONE_TIME' })
      .select('title name categoryId image requiresCertification requiredDocuments')
      .lean();

    const documents = await WorkerDocumentConfig.find({ isActive: true }).sort({ order: 1 }).lean();

    let registrationConfig = await WorkerRegistrationConfig.findOne().lean();

    const fields = await FormConfig.find({
      isActive: true,
      formType: 'registration',
      $or: [{ role }, { role: 'both' }]
    }).sort({ step: 1, order: 1 });

    const stepsData = [];
    fields.forEach((field) => {
      let stepObj = stepsData.find((s) => s.stepNumber === field.step);
      if (!stepObj) {
        stepObj = { stepNumber: field.step, title: `Step ${field.step}`, fields: [] };
        stepsData.push(stepObj);
      }
      stepObj.fields.push({
        key: field.fieldKey,
        label: field.label,
        type: field.type,
        required: field.required,
        options: field.options,
        validation: field.validation
      });
    });

    if (!registrationConfig) {
      registrationConfig = {
        isRegistrationEnabled: true,
        steps:
          stepsData.length > 0
            ? stepsData.map((s) => ({ ...s, isActive: true }))
            : [
                {
                  stepNumber: 1,
                  title: 'Basic Info',
                  isActive: true,
                  fields: [
                    { key: 'name', label: 'Full Name', type: 'text', required: true },
                    { key: 'phone', label: 'Mobile Number', type: 'tel', required: true },
                    { key: 'password', label: 'Password', type: 'password', required: true }
                  ]
                }
              ]
      };
    } else {
      registrationConfig.steps = registrationConfig.steps.map((s) => {
        const stepFields = stepsData.find((sd) => sd.stepNumber === s.stepNumber)?.fields || [];
        return { ...s, fields: stepFields.length ? stepFields : s.fields || [] };
      });
      if (registrationConfig.steps.every((s) => !s.fields || s.fields.length === 0) && stepsData.length > 0) {
        registrationConfig.steps = stepsData.map((s) => ({ ...s, isActive: true }));
      }
    }

    res.status(200).json({
      success: true,
      config: {
        isRegistrationEnabled: registrationConfig.isRegistrationEnabled,
        steps: registrationConfig.steps
          .filter((s) => s.isActive !== false)
          .sort((a, b) => a.stepNumber - b.stepNumber),
        categories: categories.map((c) => ({
          id: c._id.toString(),
          _id: c._id.toString(),
          title: c.name,
          name: c.name,
          icon: c.icon
        })),
        subServices: subServices
          .filter((s) => categories.some((cat) => cat._id.toString() === s.categoryId?.toString()))
          .map((s) => ({
            id: s._id.toString(),
            _id: s._id.toString(),
            name: s.title || s.name,
            title: s.title || s.name,
            categoryId: s.categoryId ? s.categoryId.toString() : null,
            image: s.image || '',
            requiresCertification: s.requiresCertification || false,
            requiredDocuments: s.requiredDocuments || []
          })),
        documents: documents.map((d) => ({
          key: d.key,
          title: d.title,
          description: d.description,
          isRequired: d.isRequired,
          requiresFrontAndBack: d.requiresFrontAndBack,
          acceptedFormats: d.acceptedFormats
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
