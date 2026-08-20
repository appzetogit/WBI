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

    // Fetch from BOTH OneTimeService AND Service collections
    const [otsList, svcList] = await Promise.all([
      OneTimeService.find({ categoryId, isActive: { $ne: false } }).lean(),
      Service.find({ categoryId, status: { $ne: 'inactive' } }).lean()
    ]);

    const combined = [];
    const seenTitles = new Set();

    otsList.forEach((ots) => {
      const name = (ots.name || ots.title || '').trim();
      if (name && !seenTitles.has(name.toLowerCase())) {
        seenTitles.add(name.toLowerCase());
        combined.push({
          _id: ots._id,
          id: ots._id,
          name: name,
          title: name,
          categoryId: ots.categoryId,
          startingPrice: ots.startingPrice || 0,
          estimatedTime: ots.estimatedTime || '30-60 min',
          iconUrl: ots.iconUrl || ots.imageUrl || ots.image || '',
          imageUrl: ots.imageUrl || ots.iconUrl || ots.image || '',
          requiresBrand: ots.requiresBrand || false,
          requiresProblem: ots.requiresProblem || false,
          requiresPackage: ots.requiresPackage || false
        });
      }
    });

    svcList.forEach((svc) => {
      const name = (svc.title || svc.name || '').trim();
      if (name && !seenTitles.has(name.toLowerCase())) {
        seenTitles.add(name.toLowerCase());
        combined.push({
          _id: svc._id,
          id: svc._id,
          name: name,
          title: name,
          categoryId: svc.categoryId,
          startingPrice: svc.basePrice || svc.price || 0,
          estimatedTime: svc.duration || '30-60 min',
          iconUrl: svc.icon || svc.image || '',
          imageUrl: svc.image || svc.icon || '',
          requiresCertification: svc.requiresCertification || false,
          requiredDocuments: svc.requiredDocuments || []
        });
      }
    });

    res.status(200).json({
      success: true,
      count: combined.length,
      data: combined
    });
  } catch (error) {
    console.error('getWorkerSubServices Error:', error);
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};
