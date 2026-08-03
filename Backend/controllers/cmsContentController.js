const CmsContent = require('../models/CmsContent');

// Panel-specific default initial metadata/titles/content if not configured in DB yet
const DEFAULT_PAGES_BY_PANEL = {
  user: {
    'terms-services': {
      title: 'User Terms & Conditions',
      subtitle: 'Terms and conditions governing customer service bookings and platform usage.',
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
      title: 'About WBI Customer Platform',
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
      title: 'User Privacy Policy',
      subtitle: 'How we collect, protect, and process customer personal data.',
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
  },
  engineer: {
    'terms-services': {
      title: 'Engineer & TazkY Partner Terms',
      subtitle: 'Terms, obligations, and SLA requirements for field technicians and TazkY partners.',
      content: `
        <h1>Engineer TazkY Partner Terms</h1>
        <p>As a verified Engineer / TazkY Field Partner on the WBI Platform, you agree to fulfill assigned jobs professionally, punctually, and in adherence to platform service level standards.</p>
        <h2>1. Code of Conduct & Professionalism</h2>
        <p>Engineers must wear uniform badges where required, maintain standard tools, and complete check-in / check-out workflows accurately in the TazkY Mobile App.</p>
        <h2>2. Earnings & Commission Structure</h2>
        <p>Payouts for verified jobs are processed per weekly billing cycles. Any disputed or incomplete work may be subject to review before wallet settlement.</p>
        <h2>3. Safety & On-site Compliance</h2>
        <p>Safety equipment (PPE) must be used during technical procedures, ATM maintenance, or electrical installations.</p>
      `
    },
    'about-us': {
      title: 'About TazkY Partner Network',
      subtitle: 'Empowering engineers and field technicians across India.',
      content: `
        <h1>TazkY Partner Network</h1>
        <p>TazkY is WBI’s dedicated field engineer ecosystem. We empower certified technicians with flexible job allocations, fair earning models, and real-time digital routing.</p>
        <h2>Why Join TazkY?</h2>
        <ul>
          <li>Guaranteed weekly payouts and transparent commission tracking.</li>
          <li>Comprehensive safety and technical training modules.</li>
          <li>24/7 dedicated partner support helpline.</li>
        </ul>
      `
    },
    'privacy-policy': {
      title: 'Engineer Data & Privacy Policy',
      subtitle: 'Guidelines on technician location tracking, documents, and credentials.',
      content: `
        <h1>Engineer Privacy Policy</h1>
        <p>This policy explains how location data, background check documents, and payment details for field engineers are handled on the TazkY platform.</p>
        <h2>1. Location Data Collection</h2>
        <p>Background and foreground location permissions are collected while on duty to match nearby job requests and provide live tracking to end clients.</p>
        <h2>2. KYC & Document Protection</h2>
        <p>Identity documents, certification cards, and bank credentials are stored securely with strict access control and used solely for verification and payouts.</p>
      `
    }
  },
  b2b: {
    'terms-services': {
      title: 'B2B Enterprise Terms & SLA',
      subtitle: 'Terms governing corporate accounts, SLA guarantees, and bulk order fulfillment.',
      content: `
        <h1>B2B Enterprise Terms & SLA</h1>
        <p>These terms apply to corporate clients, enterprise accounts, and institutional partners utilizing WBI B2B multi-location service dispatch.</p>
        <h2>1. Service Level Agreements (SLA)</h2>
        <p>Dispatch times, emergency technician dispatch, and resolution windows are specified in your active corporate master service agreement.</p>
        <h2>2. Credit Facilities & Invoicing</h2>
        <p>Invoices are generated monthly per credit cycle terms (Net-15 / Net-30). Payment must be remitted via approved corporate bank transfer channels.</p>
      `
    },
    'about-us': {
      title: 'About WBI B2B Enterprise Solutions',
      subtitle: 'Turnkey facility maintenance, ATM servicing, and IT infra operations for businesses.',
      content: `
        <h1>WBI B2B Solutions</h1>
        <p>WBI Enterprise provides multi-city technical maintenance, ATM cassette repair, breakdown management, and infrastructure setups for banking, retail, and commercial facilities.</p>
      `
    },
    'privacy-policy': {
      title: 'B2B Corporate Privacy & NDA Standard',
      subtitle: 'Data confidentiality standards for corporate client operations and asset metadata.',
      content: `
        <h1>B2B Privacy Policy</h1>
        <p>All facility location data, equipment model identifiers, and corporate contact records are kept confidential under enterprise non-disclosure agreements.</p>
      `
    }
  },
  vendor: {
    'terms-services': {
      title: 'Vendor & Supplier Terms',
      subtitle: 'Rules, pricing schedules, and fulfillment terms for onboarded vendor partners.',
      content: `
        <h1>Vendor Partner Terms</h1>
        <p>These terms govern vendor onboarding, inventory submission, component dispatch, and payout terms for approved vendors on WBI.</p>
        <h2>1. Material & Part Compliance</h2>
        <p>All spare parts and service components supplied must meet OEM specs and carry standard warranty documentation.</p>
        <h2>2. Order Dispatch Timelines</h2>
        <p>Vendor orders must be acknowledged within 2 hours and dispatched according to agreed SLA windows.</p>
      `
    },
    'about-us': {
      title: 'About WBI Vendor Ecosystem',
      subtitle: 'Connecting material vendors and specialized service shops with enterprise demand.',
      content: `
        <h1>WBI Vendor Portal</h1>
        <p>The WBI Vendor Ecosystem enables regional suppliers, component distributors, and specialized workshops to partner with WBI for nationwide service fulfillment.</p>
      `
    },
    'privacy-policy': {
      title: 'Vendor Data & Commerce Privacy Policy',
      subtitle: 'Privacy practices regarding merchant business credentials and pricing catalogs.',
      content: `
        <h1>Vendor Privacy Policy</h1>
        <p>We protect vendor commercial data, catalog pricing, and banking credentials in strict compliance with commercial data guidelines.</p>
      `
    }
  }
};

const getFallbackPage = (panel, slug) => {
  const panelDefaults = DEFAULT_PAGES_BY_PANEL[panel] || DEFAULT_PAGES_BY_PANEL['user'];
  return panelDefaults[slug] || DEFAULT_PAGES_BY_PANEL['user'][slug] || {
    title: 'Content Policy',
    subtitle: '',
    content: ''
  };
};

/**
 * @desc Get CMS content by slug and targetPanel (Public)
 * @route GET /api/cms/public/:slug?targetPanel=user|engineer|b2b|vendor
 * @access Public
 */
exports.getCmsContentBySlug = async (req, res) => {
  try {
    const { slug } = req.params;
    const targetPanel = (req.query.targetPanel || req.query.target || req.query.panel || 'user').toLowerCase();
    
    if (!['about-us', 'terms-services', 'privacy-policy'].includes(slug)) {
      return res.status(404).json({
        success: false,
        message: 'Invalid CMS page requested'
      });
    }

    let cmsItem = await CmsContent.findOne({ slug, targetPanel, isActive: true });

    if (!cmsItem) {
      const defaultPage = getFallbackPage(targetPanel, slug);
      return res.status(200).json({
        success: true,
        data: {
          slug,
          targetPanel,
          title: defaultPage.title,
          subtitle: defaultPage.subtitle,
          content: defaultPage.content,
          isConfigured: true,
          updatedAt: null
        }
      });
    }

    const defaultPage = getFallbackPage(targetPanel, slug);
    return res.status(200).json({
      success: true,
      data: {
        slug: cmsItem.slug,
        targetPanel: cmsItem.targetPanel || targetPanel,
        title: cmsItem.title || defaultPage.title,
        subtitle: cmsItem.subtitle || defaultPage.subtitle || '',
        content: cmsItem.content || defaultPage.content,
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
 * @desc Get all CMS content items for a target panel (Admin)
 * @route GET /api/cms/admin?targetPanel=user|engineer|b2b|vendor
 * @access Admin
 */
exports.getAllCmsContents = async (req, res) => {
  try {
    const targetPanel = (req.query.targetPanel || req.query.target || 'user').toLowerCase();
    const cmsItems = await CmsContent.find({ targetPanel });
    
    const validSlugs = ['about-us', 'terms-services', 'privacy-policy'];
    const result = {};

    validSlugs.forEach((slug) => {
      const dbItem = cmsItems.find((item) => item.slug === slug);
      const defaultPage = getFallbackPage(targetPanel, slug);

      result[slug] = {
        slug,
        targetPanel,
        title: dbItem ? dbItem.title : defaultPage.title,
        subtitle: dbItem ? dbItem.subtitle : defaultPage.subtitle,
        content: dbItem ? dbItem.content : defaultPage.content,
        isActive: dbItem ? dbItem.isActive : true,
        updatedAt: dbItem ? dbItem.updatedAt : null
      };
    });

    return res.status(200).json({
      success: true,
      targetPanel,
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
 * @desc Update or create CMS content by slug & targetPanel (Admin)
 * @route PUT /api/cms/admin/:slug
 * @access Admin
 */
exports.updateCmsContent = async (req, res) => {
  try {
    const { slug } = req.params;
    const { title, subtitle, content, isActive, targetPanel: bodyPanel } = req.body;
    const targetPanel = (bodyPanel || req.query.targetPanel || req.query.target || 'user').toLowerCase();

    if (!['about-us', 'terms-services', 'privacy-policy'].includes(slug)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid CMS page slug'
      });
    }

    if (!['user', 'engineer', 'b2b', 'vendor'].includes(targetPanel)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid target panel'
      });
    }

    const adminId = req.user ? req.user._id || req.user.id : null;
    const defaultPage = getFallbackPage(targetPanel, slug);

    const updatedCms = await CmsContent.findOneAndUpdate(
      { slug, targetPanel },
      {
        slug,
        targetPanel,
        title: title || defaultPage.title,
        subtitle: subtitle !== undefined ? subtitle : defaultPage.subtitle,
        content: content !== undefined ? content : '',
        isActive: isActive !== undefined ? isActive : true,
        updatedBy: adminId
      },
      { new: true, upsert: true, runValidators: true }
    );

    return res.status(200).json({
      success: true,
      message: `${updatedCms.title} (${targetPanel.toUpperCase()} panel) saved successfully`,
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

