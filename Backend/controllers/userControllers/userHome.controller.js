const mongoose = require('mongoose');
const OneTimeService = require('../../models/OneTimeService');
const Banner = require('../../models/Banner');
const Notification = require('../../models/Notification');
const ServiceCategory = require('../../models/ServiceCategory');
const SubService = require('../../models/SubService');
const HomeSection = require('../../models/HomeSection');
const HomeContent = require('../../models/HomeContent');
const Brand = require('../../models/Brand');
const cacheHelper = require('../../utils/cacheHelper');
// Import Cart logic if it's stored in DB, otherwise cart count might be handled purely frontend or different logic.
// Based on typical implementation, we might not fetch cart from DB if it's local storage, but assuming DB here if auth'd.

// @desc    Get dynamic User Home data
// @route   GET /api/user/home
// @access  Public/Private
const getHomeData = async (req, res) => {
  try {
    let { cityId } = req.query; // If needed for location-based filtering later
    if (!cityId || cityId === 'undefined' || cityId === 'null' || !mongoose.Types.ObjectId.isValid(cityId)) {
      cityId = null;
    }
    
    console.log('[USER_HOME_FETCH_START] Fetching user home data for cityId: ' + cityId);

    // Set headers to disable browser caching if supported
    if (res && typeof res.setHeader === 'function') {
      res.setHeader('Cache-Control', 'public, max-age=15, stale-while-revalidate=60');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }

    // Try to get cached public home data
    const cacheKey = `homeData:city:${cityId || 'global'}`;
    let publicData = await cacheHelper.getCache(cacheKey);

    if (!publicData) {
      console.log(`[USER_HOME_CACHE_MISS] Cache miss for key: ${cacheKey}. Querying database...`);
      const now = new Date();
      const activeDateFilter = {
        $and: [
          { $or: [{ startDate: null }, { startDate: { $lte: now } }] },
          { $or: [{ endDate: null }, { endDate: { $gte: now } }] }
        ]
      };

      const [
        quickServices,
        banners,
        offers,
        promos,
        footers,
        mostBookedServices,
        popularBrands,
        sections,
        homeContentRes,
        categoriesRes
      ] = await Promise.all([
        // 1. Fetch active Quick Services
        OneTimeService.find({ isActive: true, categoryType: 'one_time' })
          .select('name slug image rating totalReviews startingPrice')
          .sort({ sortOrder: 1, createdAt: -1 })
          .limit(12)
          .lean(),
          
        // 2. Fetch Banners
        Banner.find({ isActive: true, isDeleted: { $ne: true }, bannerType: 'home_banner', ...activeDateFilter })
          .sort({ sortOrder: 1, createdAt: -1 }).lean(),
          
        // 3. Fetch Offers
        Banner.find({ isActive: true, isDeleted: { $ne: true }, bannerType: 'offer_banner', ...activeDateFilter })
          .sort({ sortOrder: 1, createdAt: -1 }).lean(),
          
        // 4. Fetch Promos
        Banner.find({ isActive: true, isDeleted: { $ne: true }, bannerType: 'promo_banner', ...activeDateFilter })
          .sort({ sortOrder: 1, createdAt: -1 }).lean(),

        // 4b. Fetch Footers
        Banner.find({ isActive: true, isDeleted: { $ne: true }, bannerType: 'footer_banner', ...activeDateFilter })
          .sort({ sortOrder: 1, createdAt: -1 }).lean(),
          
        // 5. Fetch Most Booked
        OneTimeService.find({ isActive: true, categoryType: 'one_time' })
          .select('name slug image rating totalReviews startingPrice')
          .sort({ rating: -1, totalReviews: -1 })
          .limit(10)
          .lean(),
          
        // 6. Fetch Popular Brands
        Brand.find({ 
          status: 'active', 
          $or: [{ isPopular: true }, { isFeatured: true }],
          ...(cityId ? { cityIds: { $in: [cityId, new mongoose.Types.ObjectId(cityId)] } } : { cityIds: { $exists: true } })
        })
        .select('title slug iconUrl logo imageUrl badge')
        .sort({ rating: -1, totalBookings: -1, createdAt: -1 })
        .limit(30)
        .lean(),
        
        // 7. Fetch Home Sections
        HomeSection.find({ isActive: true }).lean(),
        
        // 7b. Fetch Global Home Content config
        HomeContent.getHomeContent(cityId),
        
        // 8. Fetch Categories (merged from catalogController)
        ServiceCategory.find({ isActive: true, showOnApp: true, audience: 'b2c' })
          .select('name slug icon saleBadgeText')
          .sort({ displayOrder: 1 })
          .lean()
      ]);

      const carePlan = sections.find(s => s.sectionKey === 'care_plan') || null;
      const whyChoose = sections.find(s => s.sectionKey === 'why_choose') || null;
      const howItWorks = sections.find(s => s.sectionKey === 'how_it_works') || null;

      // Formatting homeContent based on what catalogController did
      const formattedContent = homeContentRes ? {
        isBannersVisible: homeContentRes.isBannersVisible ?? true,
        isOfferBannersVisible: homeContentRes.isOfferBannersVisible ?? true,
        isPromosVisible: homeContentRes.isPromosVisible ?? true,
        isCuratedVisible: homeContentRes.isCuratedVisible ?? true,
        isNoteworthyVisible: homeContentRes.isNoteworthyVisible ?? true,
        isBookedVisible: homeContentRes.isBookedVisible ?? true,
        isCategorySectionsVisible: homeContentRes.isCategorySectionsVisible ?? true,
        isCategoriesVisible: homeContentRes.isCategoriesVisible ?? true,
        isHowItWorksVisible: homeContentRes.isHowItWorksVisible ?? true
      } : {};

      const categories = categoriesRes.map(cat => ({
        id: cat._id.toString(),
        title: cat.name,
        slug: cat.slug,
        icon: cat.icon || '',
        hasSaleBadge: !!cat.saleBadgeText,
        badge: cat.saleBadgeText || null
      }));

      // If homeContentRes is a Mongoose document (from getHomeContent), convert it
      let homeContentObj = homeContentRes;
      if (homeContentRes && typeof homeContentRes.toObject === 'function') {
        homeContentObj = homeContentRes.toObject();
      }

      if (homeContentObj) {
        formattedContent.banners = (homeContentObj.banners || []).map(item => ({
          imageUrl: item.imageUrl,
          targetCategoryId: item.targetCategoryId?.toString() || null,
          slug: item.slug,
          order: item.order
        }));
        formattedContent.offerBanners = (homeContentObj.offerBanners || []).map(item => ({
          imageUrl: item.imageUrl,
          targetCategoryId: item.targetCategoryId?.toString() || null,
          slug: item.slug,
          order: item.order
        }));
        formattedContent.promos = (homeContentObj.promos || []).map(item => ({
          title: item.title,
          subtitle: item.subtitle,
          imageUrl: item.imageUrl,
          targetCategoryId: item.targetCategoryId?.toString() || null,
          order: item.order
        }));
        formattedContent.booked = (homeContentObj.booked || []).map(item => ({
          id: item._id ? item._id.toString() : item.id,
          title: item.title,
          rating: item.rating,
          reviews: item.reviews,
          price: item.price,
          originalPrice: item.originalPrice,
          discount: item.discount,
          imageUrl: item.imageUrl,
          targetCategoryId: item.targetCategoryId?.toString() || null,
          slug: item.slug,
          order: item.order
        }));
      }

      publicData = {
        categories,
        homeContent: formattedContent,
        quickServices,
        banners,
        offers,
        promos,
        footers,
        mostBookedServices,
        popularBrands,
        carePlan,
        whyChoose,
        howItWorks
      };

      // Cache the public data for 5 minutes (300 seconds)
      await cacheHelper.setCache(cacheKey, publicData, 300);
      console.log(`[USER_HOME_CACHE_SET] Cached user home data for key: ${cacheKey}`);
    } else {
      console.log(`[USER_HOME_CACHE_HIT] Cache hit for key: ${cacheKey}`);
    }

    // Unread Notifications is queried dynamically per-user
    const unreadNotifications = req.user 
      ? await Notification.countDocuments({ user: req.user._id, isRead: false }) 
      : 0;

    res.status(200).json({
      success: true,
      ...publicData,
      unreadNotifications,
      cartCount: 0
    });
  } catch (error) {
    console.error('[USER_HOME_FETCH_ERROR] Error fetching user home data:', error);
    res.status(500).json({
      success: false,
      message: 'Server Error fetching home data',
      error: error.message
    });
  }
};

// @desc    Get all categories and services for Our Services section
// @route   GET /api/user/home/services
// @access  Public
const getHomeServices = async (req, res) => {
  try {
    const cacheKey = 'homeServicesData';
    let cachedServices = await cacheHelper.getCache(cacheKey);

    if (cachedServices) {
      console.log(`[USER_HOME_SERVICES_CACHE_HIT] Cache hit for key: ${cacheKey}`);
      return res.status(200).json({
        success: true,
        ...cachedServices
      });
    }

    console.log(`[USER_HOME_SERVICES_CACHE_MISS] Cache miss for key: ${cacheKey}. Querying database...`);

    // Fetch all active categories to show on app
    const categories = await ServiceCategory.find({ isActive: true, showOnApp: true })
      .select('_id name slug icon serviceType audience assignedRole')
      .sort({ displayOrder: 1 })
      .lean();

    // Fetch B2C One Time Services
    const oneTimeServices = await OneTimeService.find({ isActive: true })
      .select('_id name slug image categoryId rating totalReviews startingPrice')
      .sort({ sortOrder: 1 })
      .lean();

    // Fetch B2B Sub Services
    const subServices = await SubService.find({ isActive: true })
      .select('_id name slug image categoryId rating reviewCount startingPrice')
      .sort({ displayOrder: 1 })
      .lean();

    const formattedCategories = [];
    const groupedServices = {};

    categories.forEach(cat => {
      const catIdStr = cat._id.toString();
      const isB2C = cat.audience === 'b2c' || cat.serviceType === 'one_time';

      if (isB2C) {
        // Group B2C One-Time Services (Sub-Services in the new architecture)
        const servicesForCat = oneTimeServices.filter(s => s.categoryId && s.categoryId.toString() === catIdStr);
        if (servicesForCat.length > 0) {
          formattedCategories.push({
            id: catIdStr,
            name: cat.name,
            slug: cat.slug,
            icon: cat.icon
          });

          groupedServices[catIdStr] = servicesForCat.map(s => ({
            serviceId: s._id,
            name: s.name,
            slug: s.slug,
            iconUrl: s.image,
            imageUrl: s.image,
            categoryId: catIdStr,
            rating: s.rating,
            reviewCount: s.totalReviews || 0,
            startingPrice: s.startingPrice,
            isActive: true,
            type: 'one_time'
          }));
        }
      } else {
        // Group B2B Sub-Services
        const servicesForCat = subServices.filter(s => s.categoryId && s.categoryId.toString() === catIdStr);
        if (servicesForCat.length > 0) {
          formattedCategories.push({
            id: catIdStr,
            name: cat.name,
            slug: cat.slug,
            icon: cat.icon
          });

          groupedServices[catIdStr] = servicesForCat.map(s => ({
            serviceId: s._id,
            name: s.name,
            slug: s.slug,
            iconUrl: s.image,
            imageUrl: s.image,
            categoryId: catIdStr,
            rating: s.rating,
            reviewCount: s.reviewCount || 0,
            startingPrice: s.startingPrice,
            isActive: true,
            type: 'sub_service'
          }));
        }
      }
    });

    const responseData = {
      categories: formattedCategories,
      services: groupedServices
    };

    // Cache response for 1 hour (3600 seconds) to handle high traffic
    await cacheHelper.setCache(cacheKey, responseData, 3600);
    console.log(`[USER_HOME_SERVICES_CACHE_SET] Cached services data for key: ${cacheKey}`);

    res.status(200).json({
      success: true,
      ...responseData
    });
  } catch (error) {
    console.error('[USER_HOME_SERVICES_FETCH_ERROR] Error fetching home services:', error);
    res.status(500).json({
      success: false,
      message: 'Server Error fetching home services',
      error: error.message
    });
  }
};

module.exports = {
  getHomeData,
  getHomeServices
};
