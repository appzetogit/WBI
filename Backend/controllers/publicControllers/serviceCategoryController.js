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

  const mapFormSchemas = async (categoryCode) => {
    const FormSchema = require('../../models/FormSchema');
    const docs = await FormSchema.find({ categoryCode, isActive: true })
      .select('subCatCode subCategoryName description iconName basePrice categoryCode categoryName')
      .sort({ subCatCode: 1 })
      .lean();
    return docs.map((d) => ({
      _id: d.subCatCode,
      subCatCode: d.subCatCode,
      title: d.subCategoryName,
      name: d.subCategoryName,
      description: d.description || `${d.subCategoryName} service`,
      icon: d.iconName || 'FiBriefcase',
      iconName: d.iconName || 'FiBriefcase',
      startingPrice: d.basePrice || 2999,
      basePrice: d.basePrice || 2999,
      rating: 4.8,
      reviewCount: 64,
      reviews: 64,
      categoryCode: d.categoryCode,
      categoryName: d.categoryName
    }));
  };

  // Banking / coded categories — prefer FormSchema master list when available
  const coded =
    category.categoryCode &&
    /^C\d{2}$/i.test(String(category.categoryCode));
  if (coded) {
    const codedServices = await mapFormSchemas(String(category.categoryCode).toUpperCase());
    if (codedServices.length) {
      return res.status(200).json({
        success: true,
        count: codedServices.length,
        data: codedServices
      });
    }
  }

  const bankingSlug =
    /banking/i.test(category.slug || '') ||
    /banking/i.test(category.name || '');
  if (bankingSlug) {
    const bankingServices = await mapFormSchemas('C05');
    if (bankingServices.length) {
      return res.status(200).json({
        success: true,
        count: bankingServices.length,
        data: bankingServices
      });
    }
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

    if (!mappedServices.length && category.categoryCode) {
      const fromForms = await mapFormSchemas(String(category.categoryCode).toUpperCase());
      if (fromForms.length) {
        return res.status(200).json({ success: true, count: fromForms.length, data: fromForms });
      }
    }

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

    if (!services.length && category.categoryCode) {
      const fromForms = await mapFormSchemas(String(category.categoryCode).toUpperCase());
      if (fromForms.length) {
        return res.status(200).json({ success: true, count: fromForms.length, data: fromForms });
      }
    }

    return res.status(200).json({
      success: true,
      count: services.length,
      data: services
    });
  }
});
