const CmsContent = require('../models/CmsContent');

// Default initial metadata/titles/content if not configured in DB yet
const DEFAULT_PAGES = {
  'terms-services': {
    title: 'Terms & Conditions',
    subtitle: 'Terms and conditions governing the use of our platform.',
    content: `
      <p>These terms and conditions ("Terms") govern the use of services made available on or through https://www.wbinfs.com/ and/or the "WBI" mobile app (collectively, the "Platform", and together with the services made available on or through the Platform, the "Services"). These Terms also include our privacy policy, available on the website and the app ("Privacy Policy"), and any guidelines, additional, or supplemental terms, policies, and disclaimers made available or issued by us from time to time ("Additional Terms"). Privacy Policy and Additional Terms form an integral part of these Terms.</p>
      <p>These Terms form a legally binding agreement between WBI Enterprise Services Private Limited a company registered under Indian Companies Act, and you, a user of the Platform.</p>
      <h2>1. Services & Eligibility</h2>
      <p>The Platform provides an online marketplace facilitating direct connectivity between end customers and independent verified service professionals.</p>
      <h2>2. Account Creation & Security</h2>
      <p>You must maintain active and accurate mobile registration credentials. You are responsible for all activities that occur under your registered account.</p>
      <h2>3. Pricing & Billing</h2>
      <p>Base service fees and applicable taxes (GST) are itemized at checkout prior to order placement.</p>
    `
  },
  'about-us': {
    title: 'About Us',
    subtitle: 'Learn more about our vision, values, and service excellence.',
    content: `
      <p>Welcome to <strong>WBI</strong>! We are dedicated to providing world-class doorstep services, maintenance, and technical solutions with unmatched convenience, safety, and reliability.</p>
      <p>Founded with the vision of bridging skilled service partners with households and enterprise businesses, our platform streamlines service discovery, transparent pricing, and instant real-time dispatch.</p>
      <h2>Our Core Values</h2>
      <p>Our commitment rests on three core pillars: Trust, Speed, and Quality. Every technician and service partner on our network undergoes rigorous background checks and technical evaluations before onboarding.</p>
      <h2>Why Thousands Trust Us</h2>
      <ul>
        <li><strong>Verified Experts:</strong> Certified professionals dedicated to excellence.</li>
        <li><strong>Transparent Pricing:</strong> Upfront rates with clear billing breakups.</li>
        <li><strong>24/7 Customer Support:</strong> Responsive help and escalation channels.</li>
      </ul>
    `
  },
  'privacy-policy': {
    title: 'Privacy Policy',
    subtitle: 'How we collect, protect, and process your personal data.',
    content: `
      <p>We value your privacy and are committed to safeguarding your personal information. This Privacy Policy details how we collect, store, process, and protect your data when you use our website or mobile application.</p>
      <h2>1. Information We Collect</h2>
      <p>We collect information you provide directly, such as your full name, contact number, delivery address, and transaction logs necessary to fulfill your requested services.</p>
      <h2>2. Usage of Collected Data</h2>
      <p>Your information is strictly used to process service bookings, communicate OTPs and delivery updates, and continuously improve platform performance and security.</p>
      <h2>3. Data Protection & Encryption</h2>
      <p>We deploy standard TLS encryption, secure database access controls, and strict internal compliance standards to prevent unauthorized access or disclosure of user data.</p>
    `
  }
};

/**
 * @desc Get CMS content by slug (Public)
 * @route GET /api/public/cms/:slug
 * @access Public
 */
exports.getCmsContentBySlug = async (req, res) => {
  try {
    const { slug } = req.params;
    
    if (!DEFAULT_PAGES[slug]) {
      return res.status(404).json({
        success: false,
        message: 'Invalid CMS page requested'
      });
    }

    let cmsItem = await CmsContent.findOne({ slug, isActive: true });

    if (!cmsItem) {
      const defaultPage = DEFAULT_PAGES[slug];
      return res.status(200).json({
        success: true,
        data: {
          slug,
          title: defaultPage.title,
          subtitle: defaultPage.subtitle,
          content: defaultPage.content,
          isConfigured: true,
          updatedAt: null
        }
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        slug: cmsItem.slug,
        title: cmsItem.title || DEFAULT_PAGES[slug].title,
        subtitle: cmsItem.subtitle || '',
        content: cmsItem.content || DEFAULT_PAGES[slug].content,
        isConfigured: Boolean(cmsItem.content && cmsItem.content.trim()),
        updatedAt: cmsItem.updatedAt
      }
    });
  } catch (error) {
    console.error('Error fetching CMS content:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while fetching content',
      error: error.message
    });
  }
};

/**
 * @desc Get all CMS content items (Admin)
 * @route GET /api/admin/cms
 * @access Admin
 */
exports.getAllCmsContents = async (req, res) => {
  try {
    const cmsItems = await CmsContent.find();
    
    const result = {};
    Object.keys(DEFAULT_PAGES).forEach((slug) => {
      const dbItem = cmsItems.find((item) => item.slug === slug);
      result[slug] = {
        slug,
        title: dbItem ? dbItem.title : DEFAULT_PAGES[slug].title,
        subtitle: dbItem ? dbItem.subtitle : DEFAULT_PAGES[slug].subtitle,
        content: dbItem ? dbItem.content : DEFAULT_PAGES[slug].content,
        isActive: dbItem ? dbItem.isActive : true,
        updatedAt: dbItem ? dbItem.updatedAt : null
      };
    });

    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error fetching all CMS contents for admin:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch CMS content list',
      error: error.message
    });
  }
};

/**
 * @desc Update or create CMS content by slug (Admin)
 * @route PUT /api/admin/cms/:slug
 * @access Admin
 */
exports.updateCmsContent = async (req, res) => {
  try {
    const { slug } = req.params;
    const { title, subtitle, content, isActive } = req.body;

    if (!DEFAULT_PAGES[slug]) {
      return res.status(400).json({
        success: false,
        message: 'Invalid CMS page slug'
      });
    }

    const adminId = req.user ? req.user._id || req.user.id : null;

    const updatedCms = await CmsContent.findOneAndUpdate(
      { slug },
      {
        slug,
        title: title || DEFAULT_PAGES[slug].title,
        subtitle: subtitle !== undefined ? subtitle : DEFAULT_PAGES[slug].subtitle,
        content: content !== undefined ? content : '',
        isActive: isActive !== undefined ? isActive : true,
        updatedBy: adminId
      },
      { new: true, upsert: true, runValidators: true }
    );

    return res.status(200).json({
      success: true,
      message: `${updatedCms.title} content saved successfully`,
      data: updatedCms
    });
  } catch (error) {
    console.error('Error updating CMS content:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update CMS content',
      error: error.message
    });
  }
};
