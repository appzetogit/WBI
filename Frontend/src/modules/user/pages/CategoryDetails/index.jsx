import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { FiChevronLeft, FiHeart, FiShare2, FiArrowRight, FiHeadphones, FiCheckCircle, FiClock, FiMapPin, FiMessageCircle, FiAlertCircle, FiCode, FiSmartphone, FiPenTool, FiSpeaker, FiMonitor, FiServer, FiArchive, FiPrinter, FiDollarSign, FiCreditCard, FiWifi, FiShield, FiSettings, FiVideo, FiLock, FiUserCheck, FiBell, FiFileText, FiZap, FiBattery, FiBatteryCharging, FiActivity, FiCpu, FiCheckSquare, FiTool, FiHome, FiGrid, FiLink, FiAlertTriangle, FiCrosshair, FiMap, FiUsers } from 'react-icons/fi';
import { publicCatalogService } from '../../../../services/catalogService';
import { toast } from 'react-hot-toast';

const CategoryDetails = () => {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState(null);
  const [services, setServices] = useState([]);
  const [isWishlisted, setIsWishlisted] = useState(false);

  useEffect(() => {
    fetchCategoryDetails();
  }, [slug]);

  const fetchCategoryDetails = async () => {
    try {
      setLoading(true);
      const slugLower = (slug || '').toLowerCase();

      // Force fallback only for Digital Solutions (custom enquiry pages)
      const coreCategories = ['digital-solutions', 'digital'];

      if (coreCategories.includes(slugLower)) {
        handleFallbackData();
        setLoading(false);
        return;
      }

      // If category has categoryCode from API, load form-schemas
      try {
        const catProbe = await publicCatalogService.getCategoryBySlug(slug);
        const code = catProbe?.data?.categoryCode;
        if (code && /^C\d{2}$/i.test(code)) {
          const { default: api } = await import('../../../../services/api');
          const res = await api.get(`/public/form-schemas/category/${String(code).toUpperCase()}`);
          if (res.data?.success && res.data.data?.length) {
            const first = res.data.data[0];
            setCategory({
              title: first.categoryName || catProbe.data.name,
              description: catProbe.data.description || `${first.categoryName} services`,
              iconName: catProbe.data.icon || 'FiGrid',
              tags: catProbe.data.trustPoints || ['Verified Pros', 'Same-day Visit', 'PAN India']
            });
            setServices(
              res.data.data.map((row) => ({
                ...row,
                _id: row.subCatCode || row._id,
                name: row.subCategoryName || row.name || row.title,
                title: row.subCategoryName || row.title || row.name,
                iconName: row.iconName || row.icon || 'FiCheckCircle',
                basePrice: row.basePrice || row.startingPrice || 999,
                startingPrice: row.basePrice || row.startingPrice || 999,
                rating: row.rating || 4.8,
                reviews: row.reviewCount || row.reviews || 48,
                description: row.description || `${row.subCategoryName || row.name} — book a verified engineer`
              }))
            );
            setLoading(false);
            return;
          }
        }
      } catch {
        /* continue to normal fetch */
      }

      // Fetch category data
      const catResponse = await publicCatalogService.getCategoryBySlug(slug);
      if (catResponse && catResponse.data) {
        const cat = catResponse.data;
        setCategory({
          title: cat.name || cat.title,
          description: cat.description || cat.shortDescription || '',
          iconName: cat.icon || cat.iconName || 'FiMonitor',
          tags: cat.trustPoints || cat.tags || []
        });
      } else {
        handleFallbackData();
        return;
      }

      // Fetch services for this category
      const srvResponse = await publicCatalogService.getCategorySubServices(slug);
      if (srvResponse && srvResponse.success) {
        const rows = (srvResponse.data || []).map((s) => ({
          ...s,
          title: s.title || s.name || s.subCategoryName,
          name: s.name || s.title || s.subCategoryName,
          iconName: s.iconName || s.icon,
          basePrice: s.basePrice || s.startingPrice
        }));
        setServices(rows);
        if (!rows.length) handleFallbackData();
      }
    } catch (error) {
      console.error("Error fetching category details:", error);
      handleFallbackData();
    } finally {
      setLoading(false);
    }
  };

  const handleFallbackData = () => {
    if (slug === 'digital-solutions' || slug === 'digital') {
      setCategory({
        title: "Digital Solutions",
        description: "We provide end-to-end digital solutions to help your business grow online.",
        iconName: "FiMonitor",
        tags: ["Expert Team", "On-time Delivery", "Quality Service"]
      });
      setServices([
        { _id: '1', title: 'Web Development', description: 'Custom websites built with modern technologies for your business.', rating: 4.8, reviews: 128, basePrice: 4999, iconName: 'FiCode' },
        { _id: '2', title: 'App Development', description: 'High-performance mobile apps for iOS and Android platforms.', rating: 4.7, reviews: 96, basePrice: 7999, iconName: 'FiSmartphone' },
        { _id: '3', title: 'Web Design', description: 'Creative and responsive designs that make your brand stand out.', rating: 4.8, reviews: 74, basePrice: 3499, iconName: 'FiPenTool' },
        { _id: '4', title: 'Digital Marketing', description: 'Boost your online presence and reach your target audience effectively.', rating: 4.6, reviews: 112, basePrice: 2999, iconName: 'FiSpeaker' },
        { _id: '5', title: 'CRM', description: 'Streamline your customer relationships and grow your business.', rating: 4.7, reviews: 61, basePrice: 5999, iconName: 'FiMonitor' },
      ]);
    } else if (slug === 'banking-solutions' || slug === 'banking') {
      setCategory({
        title: "Banking Solutions",
        description: "Secure ATM, cash management & banking infrastructure services",
        iconName: "FiCreditCard",
        tags: ["Certified Experts", "24/7 Support", "PAN India Service"]
      });
      setServices([
        { _id: 'C05-01', title: 'ATM Maintenance', description: 'ATM installation, FLM/SLM & AMC support', rating: 4.8, reviews: 128, basePrice: 4999, iconName: 'FiServer', subCatCode: 'C05-01' },
        { _id: 'C05-02', title: 'POS Machine Installation & Repair', description: 'POS terminal deployment & repair', rating: 4.7, reviews: 53, basePrice: 1999, iconName: 'FiCreditCard', subCatCode: 'C05-02' },
        { _id: 'C05-03', title: 'Biometric Device Setup', description: 'Bank biometric / attendance device setup', rating: 4.8, reviews: 64, basePrice: 2499, iconName: 'FiUserCheck', subCatCode: 'C05-03' },
        { _id: 'C05-04', title: 'Cash Recycler / Kiosk Support', description: 'CDM, cash recycler & kiosk service', rating: 4.9, reviews: 61, basePrice: 5999, iconName: 'FiDollarSign', subCatCode: 'C05-04' },
        { _id: 'C05-05', title: 'Passbook Printer Service', description: 'Passbook printer setup & repair', rating: 4.8, reviews: 74, basePrice: 3499, iconName: 'FiPrinter', subCatCode: 'C05-05' },
        { _id: 'C05-06', title: 'Currency Counting Machine Repair', description: 'Note counting machine repair & calibration', rating: 4.7, reviews: 42, basePrice: 2999, iconName: 'FiCpu', subCatCode: 'C05-06' },
      ]);
    } else if (slug === 'security-solutions' || slug === 'security') {
      setCategory({
        title: "Security Solutions",
        description: "Advanced security & surveillance systems you can trust",
        iconName: "FiShield",
        tags: ["Security Experts", "24/7 Monitoring", "Trusted Service"]
      });
      setServices([
        { _id: '1', title: 'Installation & Dismantle', description: 'Setup new equipment or remove old systems', rating: 4.8, reviews: 156, basePrice: 4999, iconName: 'FiTool' },
        { _id: '2', title: 'Preventive Maintenance', description: 'Routine health checks and AMC services', rating: 4.9, reviews: 210, basePrice: 2999, iconName: 'FiCheckSquare' },
        { _id: '3', title: 'Breakdown Calls', description: 'Emergency repairs and system troubleshooting', rating: 4.7, reviews: 185, basePrice: 1999, iconName: 'FiAlertTriangle' },
        { _id: '4', title: 'Site Testing', description: 'Comprehensive site assessment & testing', rating: 4.8, reviews: 64, basePrice: 3499, iconName: 'FiCrosshair' },
        { _id: '5', title: 'Panel Installation', description: 'Advanced security panel setup', rating: 4.7, reviews: 53, basePrice: 8999, iconName: 'FiServer' },
        { _id: '6', title: 'Automated Power Monitoring', description: 'Smart power tracking & alerts', rating: 4.8, reviews: 45, basePrice: 5999, iconName: 'FiActivity' },
      ]);
    } else if (slug === 'energy-solutions' || slug === 'energy') {
      setCategory({
        title: "Energy Solutions",
        description: "Reliable power & energy infrastructure services for every need",
        iconName: "FiZap",
        tags: ["Energy Experts", "Fast Response", "Industry Certified"]
      });
      setServices([
        { _id: '1', title: 'Diesel Generator Service', description: 'DG installation, repair & maintenance', rating: 4.9, reviews: 128, basePrice: 7999, iconName: 'FiSettings' },
        { _id: '2', title: 'Battery Service', description: 'Industrial battery maintenance & replacement', rating: 4.8, reviews: 112, basePrice: 2999, iconName: 'FiBatteryCharging' },
        { _id: '3', title: 'UPS Battery Service', description: 'UPS maintenance & battery replacement', rating: 4.8, reviews: 76, basePrice: 3999, iconName: 'FiBattery' },
        { _id: '4', title: 'EV Service', description: 'EV charging installation & maintenance', rating: 4.7, reviews: 64, basePrice: 4999, iconName: 'FiZap' },
        { _id: '5', title: 'AC Power System Service', description: 'AC power system installation & maintenance', rating: 4.8, reviews: 58, basePrice: 5999, iconName: 'FiActivity' },
        { _id: '6', title: 'DC Power System Service', description: 'DC power system installation & maintenance', rating: 4.8, reviews: 45, basePrice: 5499, iconName: 'FiCpu' },
      ]);
    } else if (slug === 'networking-internet' || slug === 'networking') {
      setCategory({
        title: 'Networking & Internet',
        description: 'Network setup, WiFi, cabling & troubleshooting services',
        iconName: 'FiWifi',
        tags: ['Certified Engineers', 'Same-day Visit', 'PAN India']
      });
      setServices([
        { _id: 'C03-01', subCatCode: 'C03-01', title: 'Router & Modem Setup', description: 'ISP router/modem installation and configuration', rating: 4.8, reviews: 64, basePrice: 799, iconName: 'FiWifi' },
        { _id: 'C03-02', subCatCode: 'C03-02', title: 'WiFi Range Extension', description: 'Extend WiFi coverage across rooms and floors', rating: 4.7, reviews: 52, basePrice: 999, iconName: 'FiWifi' },
        { _id: 'C03-03', subCatCode: 'C03-03', title: 'Structured Cabling (LAN)', description: 'CAT6/fiber structured cabling for offices', rating: 4.8, reviews: 48, basePrice: 2499, iconName: 'FiLink' },
        { _id: 'C03-04', subCatCode: 'C03-04', title: 'Switch & Access Point Installation', description: 'Managed switches and WiFi AP deployment', rating: 4.8, reviews: 41, basePrice: 1999, iconName: 'FiServer' },
        { _id: 'C03-05', subCatCode: 'C03-05', title: 'Network Troubleshooting', description: 'Diagnose and fix network outages / slow speeds', rating: 4.9, reviews: 88, basePrice: 699, iconName: 'FiTool' },
        { _id: 'C03-06', subCatCode: 'C03-06', title: 'VPN Setup', description: 'Site-to-site or remote VPN configuration', rating: 4.7, reviews: 36, basePrice: 1499, iconName: 'FiLock' },
        { _id: 'C03-07', subCatCode: 'C03-07', title: 'CCTV-Network Integration', description: 'Integrate CCTV cameras with existing LAN/WiFi', rating: 4.8, reviews: 55, basePrice: 1799, iconName: 'FiVideo' },
        { _id: 'C03-08', subCatCode: 'C03-08', title: 'Office Network Setup', description: 'End-to-end office LAN + WiFi setup', rating: 4.9, reviews: 72, basePrice: 4999, iconName: 'FiMonitor' }
      ]);
    } else if (slug === 'healthcare-solutions' || slug === 'healthcare') {
      setCategory({
        title: "Healthcare Solutions",
        description: "Medical equipment & healthcare infrastructure support services",
        iconName: "FiHeart",
        tags: ["Certified Technicians", "Healthcare Compliance", "Fast Resolution"]
      });
      setServices([
        { _id: '1', title: 'Medical Equipment Services', description: 'Equipment installation & repair service', rating: 4.9, reviews: 128, basePrice: 6999, iconName: 'FiActivity' },
        { _id: '2', title: 'Quality Control Test', description: 'Equipment quality & performance testing', rating: 4.8, reviews: 96, basePrice: 3999, iconName: 'FiCheckSquare' },
        { _id: '3', title: 'Electrical Safety Test', description: 'Electrical safety & compliance testing', rating: 4.8, reviews: 74, basePrice: 2999, iconName: 'FiShield' },
        { _id: '4', title: 'Preventive Maintenance', description: 'Regular preventive maintenance service', rating: 4.9, reviews: 64, basePrice: 4999, iconName: 'FiTool' },
        { _id: '5', title: 'Annual Maintenance Contract', description: 'Comprehensive AMC for healthcare equipment', rating: 4.9, reviews: 53, basePrice: 9999, iconName: 'FiFileText' },
      ]);
    } else if (slug === 'automation-solutions' || slug === 'automation') {
      setCategory({
        title: "Automation Solutions",
        description: "Smart automation for homes & industries to simplify operations",
        iconName: "FiCpu",
        tags: ["Smart Technology", "Expert Team", "Reliable Support"]
      });
      setServices([
        { _id: '1', title: 'Smart Home Automation', description: 'Smart home automation solutions', rating: 4.8, reviews: 128, basePrice: 6999, iconName: 'FiHome' },
        { _id: '2', title: 'Industrial Automation', description: 'Industrial automation systems & solutions', rating: 4.9, reviews: 96, basePrice: 12999, iconName: 'FiSettings' },
        { _id: '3', title: 'IoT Solutions', description: 'IoT integration & custom solutions', rating: 4.8, reviews: 76, basePrice: 5999, iconName: 'FiWifi' },
        { _id: '4', title: 'Control Panels', description: 'Control panel design & installation', rating: 4.7, reviews: 64, basePrice: 4999, iconName: 'FiGrid' },
        { _id: '5', title: 'Monitoring Systems', description: 'Automation monitoring & management', rating: 4.8, reviews: 58, basePrice: 3999, iconName: 'FiMonitor' },
        { _id: '6', title: 'Integration Services', description: 'System integration & automation support', rating: 4.8, reviews: 45, basePrice: 6999, iconName: 'FiLink' },
      ]);
    } else if (slug === 'fire-and-safety' || slug === 'fire-safety') {
      setCategory({
        title: "Fire and Safety",
        description: "Complete fire safety solutions for protection & compliance",
        iconName: "FiAlertTriangle",
        tags: ["Safety First", "Certified Experts", "Quick Support"]
      });
      setServices([
        { _id: '1', title: 'Fire Alarm System', description: 'Fire alarm installation & maintenance', rating: 4.8, reviews: 128, basePrice: 4999, iconName: 'FiBell' },
        { _id: '2', title: 'Fire Extinguisher Service', description: 'Fire extinguisher installation & servicing', rating: 4.9, reviews: 96, basePrice: 1999, iconName: 'FiCrosshair' },
        { _id: '3', title: 'Safety Audit', description: 'Fire & safety audit & assessment', rating: 4.9, reviews: 76, basePrice: 3999, iconName: 'FiFileText' },
        { _id: '4', title: 'Emergency Systems', description: 'Emergency system installation & maintenance', rating: 4.7, reviews: 64, basePrice: 4999, iconName: 'FiAlertCircle' },
        { _id: '5', title: 'Evacuation Plan', description: 'Evacuation planning & safety training', rating: 4.8, reviews: 58, basePrice: 2999, iconName: 'FiMap' },
        { _id: '6', title: 'Fire Training', description: 'Fire safety training & awareness programs', rating: 4.8, reviews: 45, basePrice: 2499, iconName: 'FiUsers' },
      ]);
    } else {
      setCategory({
        title: slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
        description: "Professional services and solutions for your business needs.",
        iconName: "FiMonitor",
        tags: ["Expert Service", "On-time Delivery", "Quality Guaranteed"]
      });
      setServices([]);
    }
  };

  const handleShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({
          title: category?.title || 'WBI Services',
          text: `Check out ${category?.title} on WBI!`,
          url: window.location.href,
        });
      } else {
        navigator.clipboard.writeText(window.location.href);
        toast.success('Link copied to clipboard!');
      }
    } catch (error) {
      console.log('Error sharing:', error);
    }
  };

  const toggleWishlist = () => {
    setIsWishlisted(!isWishlisted);
    toast.success(isWishlisted ? 'Removed from wishlist' : 'Added to wishlist');
  };

  const handleContactSupport = () => {
    window.open('https://wa.me/911234567890?text=Hi, I need help choosing a service.', '_blank');
  };

  const handleServiceClick = (svc) => {
    const serviceName = (svc.name || svc.title || '').trim().toLowerCase();
    const isDigital = slug.toLowerCase().includes('digital');

    // SMS dynamic forms (any Cxx-yy) — always prefer DynamicServiceRequest
    if (svc.subCatCode || /^C\d{2}-\d{2}$/i.test(String(svc._id || ''))) {
      const code = svc.subCatCode || svc._id;
      navigate(`/user/service-request/${code}`);
      return;
    }

    // Legacy digital enquiry pages (no FormSchema codes yet)
    if (isDigital && serviceName === 'web development') {
      navigate('/user/web-development-enquiry');
      return;
    }
    if (isDigital && serviceName === 'app development') {
      navigate('/user/app-development-enquiry');
      return;
    }
    if (isDigital && serviceName === 'crm') {
      navigate('/user/crm-enquiry');
      return;
    }
    if (isDigital && serviceName === 'digital marketing') {
      navigate('/user/marketing-enquiry');
      return;
    }
    if (isDigital && (serviceName.includes('design') || serviceName.includes('ui/ux'))) {
      navigate('/user/design-enquiry');
      return;
    }

    // Generic catalog fallback
    navigate(`/user/service/${svc.slug || svc._id || svc.id}`);
  };

  const renderIcon = (iconName, className) => {
    const icons = {
      FiCode: <FiCode className={className} />,
      FiSmartphone: <FiSmartphone className={className} />,
      FiPenTool: <FiPenTool className={className} />,
      FiSpeaker: <FiSpeaker className={className} />,
      FiMonitor: <FiMonitor className={className} />,
      FiServer: <FiServer className={className} />,
      FiArchive: <FiArchive className={className} />,
      FiPrinter: <FiPrinter className={className} />,
      FiDollarSign: <FiDollarSign className={className} />,
      FiCreditCard: <FiCreditCard className={className} />,
      FiWifi: <FiWifi className={className} />,
      FiVideo: <FiVideo className={className} />,
      FiLock: <FiLock className={className} />,
      FiUserCheck: <FiUserCheck className={className} />,
      FiBell: <FiBell className={className} />,
      FiFileText: <FiFileText className={className} />,
      FiZap: <FiZap className={className} />,
      FiBattery: <FiBattery className={className} />,
      FiBatteryCharging: <FiBatteryCharging className={className} />,
      FiActivity: <FiActivity className={className} />,
      FiCpu: <FiCpu className={className} />,
      FiCheckSquare: <FiCheckSquare className={className} />,
      FiTool: <FiTool className={className} />,
      FiHome: <FiHome className={className} />,
      FiGrid: <FiGrid className={className} />,
      FiLink: <FiLink className={className} />,
      FiAlertTriangle: <FiAlertTriangle className={className} />,
      FiCrosshair: <FiCrosshair className={className} />,
      FiAlertCircle: <FiAlertCircle className={className} />,
      FiMap: <FiMap className={className} />,
      FiUsers: <FiUsers className={className} />,
      FiShield: <FiShield className={className} />
    };
    return icons[iconName] || <FiCheckCircle className={className} />;
  };

  if (loading) {
    return (
      <div className="bg-[#F8FCFC] min-h-screen pb-[80px]">
        <header className="px-4 py-4 flex items-center justify-between">
          <div className="w-10 h-10 bg-gray-200 rounded-full animate-pulse"></div>
          <div className="w-32 h-6 bg-gray-200 rounded-md animate-pulse"></div>
          <div className="flex gap-2">
            <div className="w-10 h-10 bg-gray-200 rounded-full animate-pulse"></div>
            <div className="w-10 h-10 bg-gray-200 rounded-full animate-pulse"></div>
          </div>
        </header>
        <div className="px-4 mt-2">
          <div className="h-48 bg-gray-200 rounded-3xl animate-pulse mb-8"></div>
          <div className="w-32 h-6 bg-gray-200 rounded-md animate-pulse mb-4"></div>
          <div className="flex flex-col gap-3">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-24 bg-gray-200 rounded-[24px] animate-pulse mb-3"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#F8FCFC] relative overflow-x-hidden min-h-screen pb-[80px]">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-[#F8FCFC]/90 backdrop-blur-md px-4 py-4 flex items-center justify-between">
        <button 
          onClick={() => navigate(-1)}
          className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-sm border border-gray-100 active:scale-95 transition-transform"
        >
          <FiChevronLeft className="w-5 h-5 text-gray-800" />
        </button>
        <h1 className="text-[17px] font-bold text-[#0F172A] truncate px-2">{category?.title}</h1>
        <div className="flex items-center gap-2">
          <button 
            onClick={toggleWishlist}
            className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-sm border border-gray-100 active:scale-95 transition-transform"
          >
            <FiHeart className={`w-4 h-4 ${isWishlisted ? 'fill-[#10AFA5] text-[#10AFA5]' : 'text-gray-600'}`} />
          </button>
          <button 
            onClick={handleShare}
            className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-sm border border-gray-100 active:scale-95 transition-transform"
          >
            <FiShare2 className="w-4 h-4 text-gray-600" />
          </button>
        </div>
      </header>

      <div className="px-4 mt-2">
        {/* HERO BANNER CARD */}
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-br from-[#E8F8F7] to-[#F1FAF9] rounded-3xl p-5 mb-8 relative overflow-hidden"
        >
          <div className="relative z-10 w-[60%]">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-[#10AFA5] shadow-sm">
                {renderIcon(category?.iconName || "FiMonitor", "w-4 h-4")}
              </div>
              <h2 className="text-[16px] font-bold text-[#0F172A]">{category?.title}</h2>
            </div>
            
            <p className="text-[11px] text-[#64748B] leading-relaxed mb-4">
              {category?.description}
            </p>

            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {category?.tags?.map((tag, idx) => (
                <div key={idx} className="flex items-center gap-1">
                  {idx === 0 && <FiCheckCircle className="text-[#10AFA5] w-3.5 h-3.5" />}
                  {idx === 1 && <FiClock className="text-[#10AFA5] w-3.5 h-3.5" />}
                  {idx === 2 && <FiShield className="text-[#10AFA5] w-3.5 h-3.5" />}
                  <span className="text-[10px] font-medium text-gray-700">{tag}</span>
                </div>
              ))}
            </div>
          </div>
          
          {/* Banner Graphic - Abstract digital representation */}
          <div className="absolute right-0 bottom-4 w-[40%] h-[120px] flex items-end justify-end pr-2">
            <div className="relative w-full h-full">
              <div className="absolute right-6 bottom-4 w-24 h-16 bg-[#10AFA5] rounded-md border-[3px] border-[#10AFA5] flex items-center justify-center overflow-hidden">
                 <div className="w-full h-full bg-[#E8F8F7] flex flex-col pt-1">
                   <div className="w-full h-2 bg-[#10AFA5]/10 flex gap-1 px-1 mb-1">
                     <div className="w-1 h-1 rounded-full bg-gray-300"></div>
                     <div className="w-1 h-1 rounded-full bg-gray-300"></div>
                   </div>
                   <div className="flex-1 flex items-center justify-center">
                     <FiCode className="w-6 h-6 text-[#10AFA5]" />
                   </div>
                 </div>
              </div>
              <div className="absolute right-14 bottom-2 w-8 h-2 bg-[#0C8F87] rounded-sm"></div>
              <div className="absolute right-2 bottom-0 w-10 h-16 bg-white rounded-lg border-2 border-[#10AFA5] shadow-md flex items-center justify-center">
                <div className="w-full h-full flex flex-col">
                  <div className="w-full h-2 flex justify-center pt-1"><div className="w-3 h-[2px] bg-gray-200 rounded-full"></div></div>
                  <div className="flex-1 flex items-center justify-center">
                    <div className="w-5 h-5 rounded bg-[#E8F8F7]"></div>
                  </div>
                </div>
              </div>
              <div className="absolute top-2 right-12 text-[#10AFA5]/30"><FiSettings className="w-6 h-6" /></div>
            </div>
          </div>
        </motion.div>

        {/* Services List */}
        <div className="mb-6">
          <h3 className="text-[20px] font-bold text-[#0F172A] mb-4">Our Services</h3>
          
          <div className="flex flex-col">
            <AnimatePresence>
              {services.length === 0 ? (
                <motion.div 
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className="bg-white rounded-[24px] p-8 flex flex-col items-center justify-center text-center border border-gray-100 shadow-sm"
                >
                  <FiAlertCircle className="w-10 h-10 text-gray-300 mb-3" />
                  <p className="text-[14px] font-bold text-gray-800 mb-1">No Services Available</p>
                  <p className="text-[12px] text-gray-500">We are adding services to this category soon.</p>
                </motion.div>
              ) : (
                services.map((svc, index) => (
                  <motion.div 
                    key={svc._id || index}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    onClick={() => handleServiceClick(svc)}
                    className="bg-white rounded-[24px] p-4 mb-3 flex items-center gap-4 shadow-sm border border-gray-100 cursor-pointer active:scale-[0.98] transition-transform"
                  >
                    {/* Icon Container */}
                    <div className="w-14 h-14 rounded-2xl bg-[#F8FCFC] border border-gray-100 flex items-center justify-center text-[#10AFA5] shrink-0">
                      {renderIcon(svc.icon || svc.iconName || 'FiCheckCircle', 'w-6 h-6')}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <h4 className="text-[15px] font-bold text-[#0F172A] mb-1 leading-tight truncate">{svc.name || svc.title || svc.subCategoryName}</h4>
                      <p className="text-[11px] text-[#64748B] leading-[1.4] mb-2 line-clamp-2 pr-2">
                        {svc.description}
                      </p>
                      
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1">
                          <span className="text-[13px]">⭐</span>
                          <span className="text-[12px] font-bold text-[#0F172A]">{svc.rating || 4.8}</span>
                          <span className="text-[11px] text-[#64748B]">({svc.reviewCount || svc.reviews || 128})</span>
                        </div>
                        <span className="text-gray-300">|</span>
                        <span className="text-[11px] text-[#64748B]">
                          From <span className="font-bold text-[#0F172A]">₹{(svc.startingPrice || svc.basePrice || 4999).toLocaleString('en-IN')}</span>
                        </span>
                      </div>
                    </div>
                    
                    {/* Right Arrow Button */}
                    <button className="w-8 h-8 rounded-full bg-[#10AFA5] flex items-center justify-center text-white shrink-0 shadow-md">
                      <FiArrowRight className="w-4 h-4" />
                    </button>
                  </motion.div>
                ))
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Support Banner */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-gradient-to-br from-[#E8F8F7] to-[#F1FAF9] rounded-2xl p-5 relative overflow-hidden border border-[#10AFA5]/10 shadow-sm mb-4"
        >
          <div className="flex items-center justify-between relative z-10">
            <div className="flex items-center gap-3 w-[60%]">
              <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-[#10AFA5] shrink-0 shadow-sm">
                <FiHeadphones className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-[14px] font-bold text-[#0F172A] mb-0.5 leading-tight">Need Help Choosing a Service?</h3>
                <p className="text-[10px] text-[#64748B] leading-tight">
                  Talk to our experts and get the<br/>best solution for your business.
                </p>
              </div>
            </div>
            
            <div className="flex flex-col items-end gap-2 shrink-0">
              <button 
                onClick={handleContactSupport}
                className="px-4 py-2 bg-[#10AFA5] text-white text-[11px] font-bold rounded-lg flex items-center gap-1.5 active:scale-95 transition-transform"
              >
                <FiMessageCircle className="w-3.5 h-3.5" />
                Contact Support
              </button>
              <div className="flex items-center gap-1 text-[10px] font-medium text-[#10AFA5]">
                <FiHeadphones className="w-3 h-3" />
                <span>Call Us: +91 12345 67890</span>
              </div>
            </div>
          </div>
        </motion.div>

      </div>
    </div>
  );
};

export default CategoryDetails;
