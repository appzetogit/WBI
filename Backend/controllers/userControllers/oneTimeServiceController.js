const OneTimeService = require('../../models/OneTimeService');
const ServiceBrand = require('../../models/ServiceBrand');
const ServiceIssue = require('../../models/ServiceIssue');
const ServicePackage = require('../../models/ServicePackage');
const ServicePricingRule = require('../../models/ServicePricingRule');
const mongoose = require('mongoose');

// Get Service Details by Slug or ID
exports.getServiceDetails = async (req, res) => {
  try {
    const { slug } = req.params;
    let query = { isActive: true };
    if (mongoose.Types.ObjectId.isValid(slug)) {
      query.$or = [{ _id: slug }, { slug: slug }];
    } else {
      query.slug = slug;
    }
    const service = await OneTimeService.findOne(query);
    if (!service) return res.status(404).json({ success: false, error: 'Service not found' });
    
    res.status(200).json({ success: true, data: service });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};

// Get Service Details Optimized (single payload)
exports.getServiceDetailsOptimized = async (req, res) => {
  try {
    const { slug } = req.params;
    let query = { isActive: true };
    if (mongoose.Types.ObjectId.isValid(slug)) {
      query.$or = [{ _id: slug }, { slug: slug }];
    } else {
      query.slug = slug;
    }
    const service = await OneTimeService.findOne(query);
    if (!service) return res.status(404).json({ success: false, error: 'Service not found' });

    // Fetch related brands, problems, packages, and pricing rules in parallel
    const [brands, problems, packages, pricingRule] = await Promise.all([
      ServiceBrand.find({ serviceId: service._id, isActive: true }).sort({ sortOrder: 1, brandName: 1 }).lean(),
      ServiceIssue.find({ serviceId: service._id, isActive: true }).sort({ sortOrder: 1, title: 1 }).lean(),
      ServicePackage.find({ serviceId: service._id, isActive: true }).sort({ isRequired: -1, sortOrder: 1, price: 1 }).lean(),
      ServicePricingRule.findOne({ serviceId: service._id }).lean()
    ]);

    // Format service response mapping to match the requested spec
    const mappedService = {
      _id: service._id,
      name: service.name,
      slug: service.slug,
      description: service.description || service.subtitle || '',
      iconUrl: service.iconUrl || '',
      imageUrl: service.imageUrl || service.image || '',
      rating: service.rating || 4.8,
      reviewCount: service.totalReviews || 0,
      estimatedTime: service.estimatedTime || service.estimatedDuration || '60 mins',
      startingPrice: service.startingPrice || 0,
      requiresBrand: service.requiresBrand !== undefined ? service.requiresBrand : service.isBrandRequired,
      requiresProblem: service.requiresProblem !== undefined ? service.requiresProblem : service.isIssueRequired,
      requiresPackage: service.requiresPackage !== undefined ? service.requiresPackage : service.isPackageRequired,
      allowsOtherProblem: service.allowsOtherProblem !== undefined ? service.allowsOtherProblem : true
    };

    res.status(200).json({
      success: true,
      service: mappedService,
      brands: brands,
      problems: problems,
      packages: packages,
      pricing: pricingRule || { platformFee: 49, gstPercent: 18, discount: 0 }
    });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};

// Get Brands for a Service
exports.getServiceBrands = async (req, res) => {
  try {
    const brands = await ServiceBrand.find({ serviceId: req.params.serviceId, isActive: true }).sort({ sortOrder: 1, brandName: 1 });
    res.status(200).json({ success: true, data: brands });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};

// Get Issues for a Service (optionally filtered by brandId)
exports.getServiceIssues = async (req, res) => {
  try {
    const { brandId } = req.query;
    let query = { serviceId: req.params.serviceId, isActive: true };
    
    if (brandId && brandId !== 'other') {
      // Find issues that either have this brandId or have empty brandIds (meaning it applies to all brands)
      query.$or = [
        { brandIds: brandId },
        { brandIds: { $size: 0 } }
      ];
    } else if (brandId === 'other') {
      // If brandId is 'other', only get generic issues
      query.brandIds = { $size: 0 };
    }

    const issues = await ServiceIssue.find(query).sort({ sortOrder: 1, title: 1 });
    res.status(200).json({ success: true, data: issues });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};

// Get Packages based on Service, Brand, and Issues
exports.getServicePackages = async (req, res) => {
  try {
    const { brandId, issueIds } = req.query;
    let query = { serviceId: req.params.serviceId, isActive: true };
    
    // Parse issueIds if provided as comma-separated
    let issuesArray = [];
    if (issueIds) {
      issuesArray = issueIds.split(',');
    }

    // Logic to filter packages:
    // We want packages that are generic (no brand/issue restriction)
    // OR packages that match the specific brand
    // OR packages that match the specific issues selected
    let orConditions = [
      { brandIds: { $size: 0 }, issueIds: { $size: 0 } } // Generic packages for this service
    ];

    if (brandId && brandId !== 'other') {
      orConditions.push({ brandIds: brandId });
    }

    const validIssueIds = issuesArray.filter(id => id !== 'other');
    if (validIssueIds.length > 0) {
      orConditions.push({ issueIds: { $in: validIssueIds } });
    }

    query.$or = orConditions;

    const packages = await ServicePackage.find(query).sort({ isRequired: -1, sortOrder: 1, price: 1 });
    res.status(200).json({ success: true, data: packages });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};

// Get Service Estimate (Starting Price and Estimated Time)
exports.getServiceEstimate = async (req, res) => {
  try {
    const { brandId, issueIds } = req.query;
    // We fetch the packages based on the selections to determine the lowest starting price and average time
    req.params.serviceId = req.params.serviceId;
    
    // Use the same logic as getServicePackages but just to aggregate
    let query = { serviceId: req.params.serviceId, isActive: true };
    let issuesArray = issueIds ? issueIds.split(',') : [];
    
    let orConditions = [{ brandIds: { $size: 0 }, issueIds: { $size: 0 } }];
    if (brandId && brandId !== 'other') orConditions.push({ brandIds: brandId });
    const validIssueIds = issuesArray.filter(id => id !== 'other');
    if (validIssueIds.length > 0) orConditions.push({ issueIds: { $in: validIssueIds } });
    
    query.$or = orConditions;

    const packages = await ServicePackage.find(query);
    
    let startingPrice = 0;
    let totalDuration = 0;
    let durationCount = 0;

    packages.forEach(pkg => {
      if (startingPrice === 0 || pkg.price < startingPrice) startingPrice = pkg.price;
      if (pkg.estimatedDurationMins) {
        totalDuration += pkg.estimatedDurationMins;
        durationCount++;
      }
    });

    const avgDuration = durationCount > 0 ? Math.round(totalDuration / durationCount) : 60;

    res.status(200).json({ 
      success: true, 
      data: { 
        startingPrice, 
        estimatedDurationMins: avgDuration 
      } 
    });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};

// Calculate Price Preview based on selections
exports.getPricePreview = async (req, res) => {
  try {
    const { serviceId, packageIds } = req.body;
    
    if (!packageIds || packageIds.length === 0) {
       return res.status(200).json({ success: true, data: { itemTotal: 0, finalTotal: 0, items: [] }});
    }

    const packages = await ServicePackage.find({ _id: { $in: packageIds }, isActive: true });
    
    let itemTotal = 0;
    let items = [];

    packages.forEach(pkg => {
      itemTotal += pkg.price;
      items.push({
        id: pkg._id,
        title: pkg.title,
        price: pkg.price
      });
    });

    // Configurable fees (could be moved to a settings collection later)
    const platformFee = 49;
    const gstPercent = 18;
    
    const subtotal = itemTotal;
    const itemCount = items.length;
    const gst = Math.round((subtotal + platformFee) * (gstPercent / 100));
    const totalAmount = subtotal + platformFee + gst;

    res.status(200).json({
      success: true,
      data: {
        subtotal,
        platformFee,
        gst,
        totalAmount,
        itemCount,
        items
      }
    });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};

// Search Services
exports.searchServices = async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) {
      return res.status(200).json({ success: true, data: [] });
    }

    const escapedQuery = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const searchRegex = new RegExp(escapedQuery, 'i');

    const services = await OneTimeService.find({
      isActive: true,
      categoryType: 'one_time',
      $or: [
        { name: searchRegex },
        { subtitle: searchRegex },
        { slug: searchRegex }
      ]
    }).select('name slug image rating totalReviews startingPrice').limit(10).lean();

    res.status(200).json({ success: true, data: services });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Get Most Booked Services
exports.getMostBooked = async (req, res) => {
  try {
    const services = await OneTimeService.find({
      isActive: true,
      categoryType: 'one_time'
    })
    .sort({ rating: -1, totalReviews: -1 }) // Proxy for most booked
    .limit(10)
    .select('name slug image rating totalReviews startingPrice')
    .lean();

    res.status(200).json({ success: true, data: services });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Toggle wishlist status
exports.toggleWishlist = async (req, res) => {
  try {
    const { serviceId } = req.params;
    const Wishlist = require('../../models/Wishlist');
    
    const existing = await Wishlist.findOne({ userId: req.user.id, serviceId });
    if (existing) {
      await Wishlist.deleteOne({ _id: existing._id });
      return res.status(200).json({ success: true, isWishlisted: false, message: 'Removed from favorites' });
    } else {
      await Wishlist.create({ userId: req.user.id, serviceId });
      return res.status(200).json({ success: true, isWishlisted: true, message: 'Added to favorites' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Check wishlist status
exports.getWishlistStatus = async (req, res) => {
  try {
    const { serviceId } = req.params;
    const Wishlist = require('../../models/Wishlist');
    
    if (!req.user) {
      return res.status(200).json({ success: true, isWishlisted: false });
    }
    
    const existing = await Wishlist.findOne({ userId: req.user.id, serviceId });
    return res.status(200).json({ success: true, isWishlisted: !!existing });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Get sub-services for a service (and optionally filtered by brandId)
exports.getServiceSubServices = async (req, res) => {
  try {
    const { serviceId } = req.params;
    const { brandId } = req.query;

    const OneTimeSubService = require('../../models/OneTimeSubService');

    let query = { serviceId, isActive: true };

    if (brandId && brandId !== 'other') {
      const mongoose = require('mongoose');
      if (mongoose.Types.ObjectId.isValid(brandId)) {
        // Find sub-services matching this specific brand, OR generic ones (brandId is null)
        query.$or = [
          { brandId: brandId },
          { brandId: null }
        ];
      } else {
        query.brandId = null;
      }
    } else {
      query.brandId = null;
    }

    let subServices = await OneTimeSubService.find(query).sort({ sortOrder: 1, name: 1 });
    
    let data = [];
    if (subServices.length > 0) {
      data = subServices.map(item => ({
        subServiceId: item._id,
        name: item.name,
        description: item.description,
        price: item.price,
        isDefault: item.isDefault,
        sortOrder: item.sortOrder
      }));
    } else {
      const ServicePackage = require('../../models/ServicePackage');
      const packagesQuery = { serviceId, isActive: true };
      
      if (brandId && brandId !== 'other') {
        const mongoose = require('mongoose');
        if (mongoose.Types.ObjectId.isValid(brandId)) {
          packagesQuery.$or = [
            { brandIds: brandId },
            { brandIds: { $size: 0 } }
          ];
        }
      }
      
      const packages = await ServicePackage.find(packagesQuery).sort({ isRequired: -1, sortOrder: 1, name: 1 });
      data = packages.map(pkg => ({
        subServiceId: pkg._id,
        name: pkg.name,
        description: pkg.description || 'Standard basic package',
        price: pkg.price,
        isDefault: true, // Default check basic service package
        sortOrder: pkg.sortOrder
      }));
    }

    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};
