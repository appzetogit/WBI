const ServiceCategory = require('../../models/ServiceCategory');
const catchAsync = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

exports.getPublicServiceCategories = catchAsync(async (req, res) => {
  const categories = await ServiceCategory.find({
    isActive: true,
    showOnApp: true
  }).sort({ displayOrder: 1, createdAt: -1 }).lean();

  res.status(200).json({
    success: true,
    count: categories.length,
    categories // Return as categories to easily map in frontend
  });
});

exports.getCategoryBySlug = catchAsync(async (req, res) => {
  const category = await ServiceCategory.findOne({
    slug: req.params.slug,
    isActive: true
  }).lean();

  if (!category) {
    return res.status(404).json({ success: false, message: 'Category not found' });
  }

  res.status(200).json({
    success: true,
    data: category
  });
});

exports.getCategorySubServices = catchAsync(async (req, res) => {
  const category = await ServiceCategory.findOne({ slug: req.params.slug }).lean();
  
  if (!category) {
    return res.status(404).json({ success: false, message: 'Category not found' });
  }

  const isB2C = category.audience === 'b2c' || category.serviceType === 'one_time';

  if (isB2C) {
    const OneTimeService = require('../../models/OneTimeService');
    const services = await OneTimeService.find({
      categoryId: category._id,
      isActive: true
    }).sort({ sortOrder: 1 }).lean();

    const mappedServices = services.map(s => ({
      ...s,
      title: s.name,
      basePrice: s.startingPrice,
      price: s.startingPrice,
      reviews: s.totalReviews || 0
    }));

    return res.status(200).json({
      success: true,
      count: mappedServices.length,
      data: mappedServices
    });
  } else {
    const SubService = require('../../models/SubService');
    const services = await SubService.find({
      categoryId: category._id,
      isActive: true
    }).sort({ displayOrder: 1 }).lean();

    return res.status(200).json({
      success: true,
      count: services.length,
      data: services
    });
  }
});
