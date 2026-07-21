const express = require('express');

const router = express.Router();

const ServiceConfig = require('../../models/ServiceConfig');

const RegistrationTemplate = require('../../models/RegistrationTemplate');

const DashboardConfiguration = require('../../models/DashboardConfiguration');



/**

 * Public service configs for vendor registration + pickers

 * GET /api/public/service-configs

 */

router.get('/service-configs', async (req, res) => {

  try {

    const data = await ServiceConfig.find({ isActive: true, status: { $ne: 'archived' } })

      .select(

        'categoryCode categoryName description tags displayOrder type serviceType icon color image subCategories inventoryCategories toolCategories projectMilestones complianceDocs matchAliases requiredSkills requiredDocuments version'

      )

      .sort({ displayOrder: 1, categoryCode: 1 })

      .lean();

    return res.status(200).json({ success: true, data });

  } catch (error) {

    console.error('Public service configs error:', error);

    return res.status(500).json({ success: false, message: 'Failed to load service configs' });

  }

});



/**

 * GET /api/public/registration-templates?codes=C01,C05

 * Dynamic vendor registration requirements by selected services.

 */

router.get('/registration-templates', async (req, res) => {

  try {

    const codes = String(req.query.codes || '')

      .split(',')

      .map((c) => c.trim().toUpperCase())

      .filter(Boolean);

    const filter = { isActive: true };

    if (codes.length) filter.categoryCode = { $in: codes };



    const data = await RegistrationTemplate.find(filter).sort({ categoryCode: 1 }).lean();

    return res.status(200).json({ success: true, data });

  } catch (error) {

    console.error('registration-templates error:', error);

    return res.status(500).json({ success: false, message: 'Failed to load registration templates' });

  }

});



/**

 * GET /api/public/dashboard-configurations?codes=C01,C05

 */

router.get('/dashboard-configurations', async (req, res) => {

  try {

    const codes = String(req.query.codes || '')

      .split(',')

      .map((c) => c.trim().toUpperCase())

      .filter(Boolean);

    const filter = { isActive: true };

    if (codes.length) filter.categoryCode = { $in: codes };



    const data = await DashboardConfiguration.find(filter).sort({ categoryCode: 1 }).lean();

    return res.status(200).json({ success: true, data });

  } catch (error) {

    console.error('dashboard-configurations error:', error);

    return res.status(500).json({ success: false, message: 'Failed to load dashboard configurations' });

  }

});



module.exports = router;


