const ServiceCategory = require('../../models/ServiceCategory');
const OneTimeService = require('../../models/OneTimeService');

/**
 * Get active Service Categories for Worker Registration/Profile
 * GET /api/worker/services/categories
 */
exports.getWorkerCategories = async (req, res) => {
  try {
    // Fetch categories that are active
    const categories = await ServiceCategory.find({ isActive: true })
      .select('name slug icon image description')
      .sort({ displayOrder: 1, createdAt: -1 });
      
    res.status(200).json({
      success: true,
      count: categories.length,
      data: categories
    });
  } catch (error) {
    console.error('getWorkerCategories Error:', error);
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

/**
 * Get active Sub-Services (OneTimeServices) for a Category
 * GET /api/worker/services/categories/:categoryId/sub-services
 */
exports.getWorkerSubServices = async (req, res) => {
  try {
    const { categoryId } = req.params;

    if (!categoryId) {
      return res.status(400).json({ success: false, message: 'Category ID is required' });
    }

    // Fetch OneTimeServices for the category
    const subServices = await OneTimeService.find({ categoryId, isActive: true })
      .select('name slug subtitle iconUrl imageUrl startingPrice estimatedTime requiresBrand requiresProblem requiresPackage')
      .sort({ sortOrder: 1, name: 1 });

    res.status(200).json({
      success: true,
      count: subServices.length,
      data: subServices
    });
  } catch (error) {
    console.error('getWorkerSubServices Error:', error);
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};
