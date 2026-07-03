const ServiceCategory = require('../../models/ServiceCategory');
const OneTimeService = require('../../models/OneTimeService');
const SubService = require('../../models/SubService');
const ServiceIssue = require('../../models/ServiceIssue');

const catchAsync = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// GET /categories
exports.getCategories = catchAsync(async (req, res) => {
  const { audience, serviceType } = req.query;
  const filter = { isActive: true };
  if (audience) filter.audience = audience;
  if (serviceType) filter.serviceType = serviceType;

  const categories = await ServiceCategory.find(filter)
    .sort({ displayOrder: 1, createdAt: -1 })
    .lean();

  res.status(200).json({
    success: true,
    count: categories.length,
    data: categories
  });
});

// GET /categories/:id/sub-services
exports.getCategorySubServices = catchAsync(async (req, res) => {
  const { id } = req.params;
  const category = await ServiceCategory.findById(id).lean();
  if (!category) {
    return res.status(404).json({ success: false, message: 'Category not found' });
  }

  const isB2C = category.audience === 'b2c' || category.serviceType === 'one_time';

  if (isB2C) {
    const services = await OneTimeService.find({ categoryId: id, isActive: true })
      .sort({ sortOrder: 1 })
      .lean();

    const mapped = services.map(s => ({
      ...s,
      id: s._id,
      title: s.name,
      basePrice: s.startingPrice,
      price: s.startingPrice,
      reviews: s.totalReviews || 0
    }));

    res.status(200).json({
      success: true,
      count: mapped.length,
      data: mapped
    });
  } else {
    const services = await SubService.find({ categoryId: id, isActive: true })
      .sort({ displayOrder: 1 })
      .lean();

    res.status(200).json({
      success: true,
      count: services.length,
      data: services
    });
  }
});

// GET /sub-services/:id
exports.getSubServiceById = catchAsync(async (req, res) => {
  const { id } = req.params;
  
  // Try B2C first
  let service = await OneTimeService.findById(id).lean();
  if (service) {
    return res.status(200).json({
      success: true,
      type: 'one_time',
      data: {
        ...service,
        id: service._id,
        title: service.name,
        basePrice: service.startingPrice,
        price: service.startingPrice,
        reviews: service.totalReviews || 0
      }
    });
  }

  // Try B2B next
  service = await SubService.findById(id).populate('categoryId', 'name slug').lean();
  if (service) {
    return res.status(200).json({
      success: true,
      type: 'sub_service',
      data: {
        ...service,
        id: service._id,
        basePrice: service.startingPrice,
        price: service.startingPrice
      }
    });
  }

  res.status(404).json({ success: false, message: 'Sub service not found' });
});

// GET /sub-services/:id/problems
exports.getSubServiceProblems = catchAsync(async (req, res) => {
  const { id } = req.params;

  // Check if B2C
  const b2cService = await OneTimeService.findById(id).lean();
  if (b2cService) {
    const issues = await ServiceIssue.find({ serviceId: id, isActive: true })
      .sort({ sortOrder: 1 })
      .lean();

    const formattedIssues = issues.map(issue => ({
      id: issue._id,
      title: issue.issueLabel || issue.title,
      price: issue.price || 0
    }));

    return res.status(200).json({
      success: true,
      data: formattedIssues
    });
  }

  // B2B sub-service problems (templates)
  const b2bService = await SubService.findById(id).lean();
  if (b2bService) {
    // Fallback B2B issues template
    const defaultProblems = [
      { id: 'p1', title: 'Hardware Fault' },
      { id: 'p2', title: 'Software Issue' },
      { id: 'p3', title: 'Network Disconnection' },
      { id: 'p4', title: 'Other Issue' }
    ];
    return res.status(200).json({
      success: true,
      data: defaultProblems
    });
  }

  res.status(404).json({ success: false, message: 'Sub service not found' });
});

// GET /worker/services
exports.getWorkerServices = catchAsync(async (req, res) => {
  const categories = await ServiceCategory.find({ audience: 'b2c', isActive: true })
    .sort({ displayOrder: 1 })
    .lean();

  const services = await OneTimeService.find({ isActive: true })
    .sort({ sortOrder: 1 })
    .lean();

  const data = categories.map(cat => ({
    category: cat,
    subServices: services.filter(s => s.categoryId && s.categoryId.toString() === cat._id.toString())
  }));

  res.status(200).json({
    success: true,
    data
  });
});

// GET /engineer/services
exports.getEngineerServices = catchAsync(async (req, res) => {
  const categories = await ServiceCategory.find({ audience: 'b2b', isActive: true })
    .sort({ displayOrder: 1 })
    .lean();

  const services = await SubService.find({ isActive: true })
    .sort({ displayOrder: 1 })
    .lean();

  const data = categories.map(cat => ({
    category: cat,
    subServices: services.filter(s => s.categoryId && s.categoryId.toString() === cat._id.toString())
  }));

  res.status(200).json({
    success: true,
    data
  });
});
