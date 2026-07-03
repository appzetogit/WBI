import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { FiChevronLeft, FiHeart, FiClock, FiCheck, FiX, FiSearch, FiAlertCircle } from 'react-icons/fi';
import api from '../../../../services/api';
import toast from 'react-hot-toast';

// Loading Skeleton
const DetailSkeleton = () => (
  <div className="bg-white min-h-screen pb-28 px-5 pt-4 space-y-6">
    <div className="h-10 w-full flex justify-between items-center">
      <div className="h-9 w-9 bg-gray-50 rounded-full animate-pulse border border-gray-100"></div>
      <div className="h-9 w-9 bg-gray-50 rounded-full animate-pulse border border-gray-100"></div>
    </div>
    <div className="flex justify-between items-start">
      <div className="flex-1 space-y-2 pr-4">
        <div className="h-7 bg-gray-100 rounded-lg animate-pulse w-3/4"></div>
        <div className="h-4 bg-gray-100 rounded-lg animate-pulse w-5/6"></div>
        <div className="h-5 bg-gray-100 rounded-lg animate-pulse w-1/4"></div>
      </div>
      <div className="w-[100px] h-[75px] bg-gray-100 rounded-xl animate-pulse"></div>
    </div>
    <div className="space-y-3">
      <div className="h-5 bg-gray-100 rounded-lg animate-pulse w-1/3"></div>
      <div className="h-20 bg-gray-100 rounded-2xl animate-pulse w-full"></div>
    </div>
    <div className="space-y-3">
      <div className="h-5 bg-gray-100 rounded-lg animate-pulse w-1/3"></div>
      <div className="grid grid-cols-2 gap-3">
        <div className="h-12 bg-gray-100 rounded-2xl animate-pulse"></div>
        <div className="h-12 bg-gray-100 rounded-2xl animate-pulse"></div>
        <div className="h-12 bg-gray-100 rounded-2xl animate-pulse"></div>
        <div className="h-12 bg-gray-100 rounded-2xl animate-pulse"></div>
      </div>
    </div>
  </div>
);

// Brand Chip component supporting image shimmers and fallback text
const BrandChip = ({ brand, isSelected, onClick }) => {
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);

  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2.5 rounded-full border transition-all shrink-0 snap-start snap-always ${
        isSelected
          ? 'border-[#10AFA5] bg-[#F0FDFA] text-[#10AFA5] font-bold shadow-xs'
          : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
      }`}
      style={{ height: '42px' }}
    >
      {brand.logo && !imgError && (
        <div className="relative h-5 w-5 flex items-center justify-center shrink-0">
          {!imgLoaded && <div className="absolute inset-0 bg-gray-100 rounded-full animate-pulse" />}
          <img
            src={brand.logo}
            alt={brand.brandName}
            onLoad={() => setImgLoaded(true)}
            onError={() => setImgError(true)}
            className={`h-full w-full object-contain ${imgLoaded ? 'block' : 'hidden'}`}
          />
        </div>
      )}
      <span className="text-[12px] font-bold tracking-tight">{brand.brandName}</span>
    </button>
  );
};

// Issues Radio/Checkbox Chip
const IssueChip = ({ issue, isSelected, onClick }) => {
  return (
    <button
      onClick={onClick}
      className={`w-full p-3.5 rounded-2xl border text-left transition-all flex items-center justify-between gap-2 shadow-xs ${
        isSelected
          ? 'border-[#10AFA5] bg-[#10AFA5] text-white font-bold'
          : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
      }`}
    >
      <span className="text-[12px] tracking-tight">{issue.title || issue.issueLabel}</span>
      <div className={`h-4 w-4 rounded-full flex items-center justify-center shrink-0 border ${
        isSelected ? 'bg-white border-white text-[#10AFA5]' : 'border-gray-300'
      }`}>
        {isSelected ? (
          <span className="text-[9px] font-black leading-none">✓</span>
        ) : (
          <div className="w-1.5 h-1.5 bg-transparent rounded-full" />
        )}
      </div>
    </button>
  );
};

const OneTimeServiceDetail = () => {
  const { slug } = useParams();
  const navigate = useNavigate();

  // State Definitions
  const [loading, setLoading] = useState(true);
  const [service, setService] = useState(null);
  const [brands, setBrands] = useState([]);
  const [issues, setIssues] = useState([]);
  
  const [selectedBrand, setSelectedBrand] = useState(null);
  const [selectedIssues, setSelectedIssues] = useState([]);
  const [customText, setCustomText] = useState('');
  
  const [estimate, setEstimate] = useState({ startingPrice: 0, estimatedTime: '--' });
  const [isWishlisted, setIsWishlisted] = useState(false);

  // Error States
  const [errorStates, setErrorStates] = useState({ service: false, brands: false, issues: false });

  // View All Modal
  const [showAllBrands, setShowAllBrands] = useState(false);
  const [brandSearch, setBrandSearch] = useState('');

  // Auto-expand ref
  const textareaRef = useRef(null);

  useEffect(() => {
    fetchData();
  }, [slug]);

  // Handle dynamic text area sizing
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(Math.max(textareaRef.current.scrollHeight, 80), 160)}px`;
    }
  }, [customText, selectedIssues]);

  const fetchData = async () => {
    try {
      setLoading(true);
      setErrorStates({ service: false, brands: false, issues: false });

      // Fetch dynamic service detail including brands and problems in one request
      const detailRes = await api.get(`/one-time-services/${slug}/detail`);
      if (!detailRes.data.success) {
        setErrorStates(prev => ({ ...prev, service: true }));
        setLoading(false);
        return;
      }

      const srv = detailRes.data.service;
      setService(srv);
      setBrands(detailRes.data.brands || []);
      
      const problemsData = detailRes.data.problems || [];
      setIssues(problemsData);

      // Auto-preselect 'other' if problems list is empty
      if (problemsData.length === 0 && srv.allowsOtherProblem !== false) {
        setSelectedIssues(['other']);
      }

      // Fetch Wishlist status (if logged in, fail silently if guest)
      try {
        const favRes = await api.get(`/users/one-time-services/${srv._id}/wishlist-status`);
        if (favRes.data.success) {
          setIsWishlisted(favRes.data.isWishlisted);
        }
      } catch (err) {
        console.log('Wishlist status check skipped:', err.message);
      }

      // Initial Pricing and duration estimates
      setEstimate({
        startingPrice: srv.startingPrice || 299,
        estimatedTime: srv.estimatedTime || '45-60 mins'
      });

    } catch (err) {
      console.error('Error fetching service detail dataset:', err);
      setErrorStates({ service: true, brands: true, issues: true });
    } finally {
      setLoading(false);
    }
  };

  const fetchIssuesForBrand = async (brandId) => {
    if (!service) return;
    try {
      setErrorStates(prev => ({ ...prev, issues: false }));
      const url = brandId && brandId !== 'other'
        ? `/one-time-services/${service._id}/problems?brandId=${brandId}`
        : `/one-time-services/${service._id}/problems`;
      const res = await api.get(url);
      if (res.data.success) {
        const issuesData = res.data.data || [];
        setIssues(issuesData);
        if (issuesData.length === 0 && service.allowsOtherProblem !== false) {
          setSelectedIssues(['other']);
        }
      } else {
        setErrorStates(prev => ({ ...prev, issues: true }));
      }
    } catch (err) {
      console.error('Error loading brand-specific issues:', err);
      setErrorStates(prev => ({ ...prev, issues: true }));
    }
  };

  const fetchEstimate = async (serviceId, brandId, selectedIssueIds) => {
    try {
      let url = `/one-time-services/${serviceId}/estimate?`;
      if (brandId && brandId !== 'other') url += `brandId=${brandId}&`;
      
      const filteredIssues = selectedIssueIds.filter(id => id !== 'other');
      if (filteredIssues.length > 0) {
        url += `issueIds=${filteredIssues.join(',')}`;
      }

      const res = await api.get(url);
      if (res.data.success) {
        const { startingPrice, estimatedDurationMins } = res.data.data;
        setEstimate({
          startingPrice: startingPrice || service.startingPrice || 299,
          estimatedTime: estimatedDurationMins ? `${estimatedDurationMins} mins` : (service.estimatedTime || '45-60 mins')
        });
      }
    } catch (err) {
      console.error('Error loading pricing estimate:', err);
    }
  };

  const toggleWishlist = async () => {
    if (!service) return;
    const currentStatus = isWishlisted;
    setIsWishlisted(!currentStatus); // Optimistic Update

    try {
      const res = await api.post(`/users/one-time-services/${service._id}/wishlist`);
      if (res.data.success) {
        setIsWishlisted(res.data.isWishlisted);
        toast.success(res.data.isWishlisted ? 'Added to favorites' : 'Removed from favorites');
      } else {
        setIsWishlisted(currentStatus); // Rollback
      }
    } catch (err) {
      setIsWishlisted(currentStatus); // Rollback
      toast.error('Failed to update favorites list');
    }
  };

  const handleBrandSelect = (brand) => {
    setSelectedBrand(brand);
    // Reset selected issues upon brand change
    setSelectedIssues([]);
    setCustomText('');
    
    const brandParam = brand._id === 'other' ? null : brand._id;
    fetchIssuesForBrand(brandParam);
    fetchEstimate(service._id, brandParam, []);
  };

  const handleIssueSelect = (issue) => {
    let updatedSelection = [...selectedIssues];

    if (updatedSelection.includes(issue._id)) {
      updatedSelection = updatedSelection.filter(id => id !== issue._id);
      if (issue._id === 'other') {
        setCustomText(''); // clear on deselect
      }
    } else {
      updatedSelection.push(issue._id);
    }

    setSelectedIssues(updatedSelection);
    fetchEstimate(service._id, selectedBrand?._id, updatedSelection);
  };

  const handleContinue = () => {
    const hasBrandSelect = service.requiresBrand && brands.length > 0;
    if (hasBrandSelect && !selectedBrand) {
      toast.error('Please select a brand to continue');
      return;
    }
    const hasProblemSelect = service.requiresProblem;
    if (hasProblemSelect && selectedIssues.length === 0) {
      toast.error('Please select at least one issue');
      return;
    }
    if (selectedIssues.includes('other') && !customText.trim()) {
      toast.error('Please specify your issue in the text box');
      return;
    }

    const brandParam = selectedBrand ? `brandId=${selectedBrand._id}&` : '';
    const issueIdsParam = selectedIssues.length > 0 ? `issueIds=${selectedIssues.join(',')}&` : '';
    const customTextParam = selectedIssues.includes('other') ? `customIssueText=${encodeURIComponent(customText.trim())}` : '';

    navigate(`/user/service/${slug}/packages?${brandParam}${issueIdsParam}${customTextParam}`);
  };

  // Filtered brands for "View all" search
  const filteredBrands = brands.filter(b => 
    b.brandName.toLowerCase().includes(brandSearch.toLowerCase())
  );

  // Validate state to toggle Continue
  const isContinueEnabled = 
    (!(service?.requiresBrand && brands?.length > 0) || selectedBrand) && 
    (!service?.requiresProblem || selectedIssues.length > 0) &&
    (!selectedIssues.includes('other') || customText.trim().length > 0);

  if (loading) return <DetailSkeleton />;

  if (errorStates.service || !service) {
    return (
      <div className="min-h-screen bg-white p-6 flex flex-col items-center justify-center text-center space-y-6">
        <div className="h-16 w-16 bg-red-50 rounded-full flex items-center justify-center text-red-500">
          <FiAlertCircle size={32} />
        </div>
        <div>
          <h3 className="text-lg font-black text-gray-800">Service Not Available</h3>
          <p className="text-xs text-gray-400 font-bold mt-1">This service details could not be loaded or is invalid.</p>
        </div>
        <button
          onClick={() => navigate(-1)}
          className="px-6 py-3 bg-gray-900 hover:bg-black text-white font-bold text-xs rounded-2xl transition-all"
        >
          Go Back
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white min-h-screen pb-28 relative">
      {/* Header Bar */}
      <header className="px-4 py-4 flex items-center justify-between sticky top-0 bg-white/95 backdrop-blur-md z-10">
        <button 
          onClick={() => navigate(-1)}
          className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-xs border border-gray-100 active:scale-95 transition-all"
        >
          <FiChevronLeft className="w-5 h-5 text-gray-800" />
        </button>
        <button 
          onClick={toggleWishlist}
          className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-xs border border-gray-100 active:scale-95 transition-all"
        >
          <FiHeart className={`w-5 h-5 transition-colors ${isWishlisted ? 'fill-[#10AFA5] text-[#10AFA5]' : 'text-gray-800'}`} />
        </button>
      </header>

      {/* Main Container */}
      <div className="px-5 space-y-6">
        {/* Service Hero Card */}
        <div className="flex justify-between items-start pt-2 gap-4">
          <div className="flex-1 space-y-2">
            <h1 className="text-2xl font-black text-gray-900 tracking-tight leading-tight">{service.name}</h1>
            <p className="text-[12px] text-gray-400 font-bold leading-normal">
              {service.description || 'Professional home troubleshooting & fix.'}
            </p>
            <div className="flex items-center gap-1 bg-[#F0FDFA] w-max px-2.5 py-1 rounded-lg border border-[#10AFA5]/10">
              <span className="text-[#10AFA5] text-xs">★</span>
              <span className="text-xs font-black text-[#10AFA5]">{service.rating || '4.8'}</span>
              <span className="text-[10px] font-bold text-[#10AFA5]/70">
                ({service.reviewCount > 1000 ? `${(service.reviewCount / 1000).toFixed(0)}K+` : service.reviewCount} reviews)
              </span>
            </div>
          </div>
          {/* Floating style Hero Image */}
          <div className="w-[110px] h-[85px] rounded-2xl overflow-hidden shrink-0 shadow-sm border border-gray-100 bg-gray-50 flex items-center justify-center">
            {service.imageUrl || service.iconUrl ? (
              <img 
                src={service.imageUrl || service.iconUrl} 
                alt={service.name} 
                className="w-full h-full object-cover"
                onError={(e) => {
                  e.target.onerror = null;
                  e.target.src = 'https://images.unsplash.com/photo-1581094288338-2314dddb7eed?w=200&q=80'; // fallback
                }} 
              />
            ) : (
              <div className="text-teal-600 text-[10px] font-bold p-2 text-center flex flex-col items-center justify-center">
                <span className="text-2xl">🛠️</span>
                <span className="truncate w-full">{service.name}</span>
              </div>
            )}
          </div>
        </div>

        {/* Section 1 — Select Brand */}
        {service.requiresBrand && brands.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-[14px] font-black text-gray-800">1. Select Brand</h2>
              {brands.length > 5 && (
                <button 
                  onClick={() => setShowAllBrands(true)}
                  className="text-xs font-bold text-[#10AFA5] hover:text-[#0E9B92]"
                >
                  View all
                </button>
              )}
            </div>

            {errorStates.brands ? (
              <div className="p-4 bg-gray-50 rounded-2xl text-center border border-gray-100 flex items-center justify-between">
                <span className="text-xs text-gray-400 font-bold">Failed to load brands list</span>
                <button onClick={fetchData} className="text-xs font-black text-[#10AFA5]">Retry</button>
              </div>
            ) : (
              /* Horizontally scrollable 2-row brand grid showing brand logo + name chips */
              <div 
                className="grid grid-rows-2 grid-flow-col gap-3 overflow-x-auto pb-2 scrollbar-none snap-x snap-mandatory -mx-5 px-5" 
                style={{ height: '100px', gridAutoColumns: 'max-content', scrollbarWidth: 'none', msOverflowStyle: 'none' }}
              >
                {brands.map(brand => (
                  <BrandChip
                    key={brand._id}
                    brand={brand}
                    isSelected={selectedBrand?._id === brand._id}
                    onClick={() => handleBrandSelect(brand)}
                  />
                ))}
                
                {/* Others Chip option */}
                <button
                  onClick={() => handleBrandSelect({ _id: 'other', brandName: 'Others' })}
                  className={`flex items-center justify-center px-6 py-2.5 rounded-full border transition-all shrink-0 snap-start snap-always ${
                    selectedBrand?._id === 'other'
                      ? 'border-[#10AFA5] bg-[#F0FDFA] text-[#10AFA5] font-bold shadow-xs'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-gray-200'
                  }`}
                  style={{ height: '42px' }}
                >
                  <span className="text-[12px] font-bold">Others</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Section 2 — What's the issue? */}
        {service.requiresProblem && (
          <div className="space-y-3">
            <div>
              <h2 className="text-[14px] font-black text-gray-800">
                {(service.requiresBrand && brands.length > 0) ? "2. What's the issue?" : "1. What's the issue?"}
              </h2>
              <p className="text-[10px] text-gray-400 font-bold mt-0.5">Select one or more problems</p>
            </div>

            {errorStates.issues ? (
              <div className="p-4 bg-gray-50 rounded-2xl text-center border border-gray-100 flex items-center justify-between">
                <span className="text-xs text-gray-400 font-bold">Failed to load issues list</span>
                <button onClick={fetchData} className="text-xs font-black text-[#10AFA5]">Retry</button>
              </div>
            ) : (!(service.requiresBrand && brands.length > 0) || selectedBrand) ? (
              <div className="space-y-4">
                {/* Issues rendered as multi-select pills in a 2-column grid layout */}
                <div className="grid grid-cols-2 gap-3">
                  {issues.map(issue => (
                    <IssueChip
                      key={issue._id}
                      issue={issue}
                      isSelected={selectedIssues.includes(issue._id)}
                      onClick={() => handleIssueSelect(issue)}
                    />
                  ))}
                  
                  {/* Others (specify) Option — Always Present */}
                  {service.allowsOtherProblem !== false && (
                    <button
                      onClick={() => handleIssueSelect({ _id: 'other', title: 'Others (specify)' })}
                      className={`w-full p-3.5 rounded-2xl border text-left transition-all flex items-center justify-between gap-2 shadow-xs ${
                        selectedIssues.includes('other')
                          ? 'border-[#10AFA5] bg-[#10AFA5] text-white font-bold'
                          : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                      }`}
                    >
                      <span className="text-[12px] tracking-tight">Others (specify)</span>
                      <div className={`h-4 w-4 rounded-full flex items-center justify-center shrink-0 border ${
                        selectedIssues.includes('other') ? 'bg-white border-white text-[#10AFA5]' : 'border-gray-300'
                      }`}>
                        {selectedIssues.includes('other') ? (
                          <span className="text-[9px] font-black leading-none">✓</span>
                        ) : (
                          <div className="w-1.5 h-1.5 bg-transparent rounded-full" />
                        )}
                      </div>
                    </button>
                  )}
                </div>

                {/* Animated expandable custom issue specification block */}
                <AnimatePresence>
                  {selectedIssues.includes('other') && service.allowsOtherProblem !== false && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden space-y-1.5"
                    >
                      <textarea
                        ref={textareaRef}
                        autoFocus
                        maxLength={200}
                        value={customText}
                        onChange={(e) => setCustomText(e.target.value)}
                        placeholder="Describe your issue in detail..."
                        className="w-full p-3.5 border border-[#10AFA5]/30 focus:border-[#10AFA5] bg-[#F0FDFA]/30 rounded-2xl text-xs font-semibold outline-none transition-all resize-none min-h-[80px]"
                      />
                      <div className="flex justify-between items-center text-[9px] text-gray-400 font-extrabold px-1 uppercase tracking-wider">
                        <span>Provide details of issue</span>
                        <span>{customText.length}/200</span>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              <div className="bg-gray-50 rounded-2xl py-8 px-4 text-center border border-gray-100">
                <p className="text-gray-400 text-xs font-bold">Please select a brand above to view issues.</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Sticky Bottom Pricing & Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 shadow-[0_-4px_20px_rgba(0,0,0,0.04)] px-4 pt-3 pb-6 z-20 max-w-[480px] mx-auto space-y-3">
        <div className="flex items-center justify-between bg-[#F8FCFC] p-3 rounded-2xl border border-[#E6F4F2]">
          <div className="flex items-center gap-2">
            <FiClock className="text-gray-400 w-4 h-4" />
            <div>
              <p className="text-[9px] text-gray-400 uppercase font-black tracking-wider">Estimated Time</p>
              <p className="text-[12px] font-extrabold text-gray-800">{estimate.estimatedTime}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[9px] text-gray-400 uppercase font-black tracking-wider">Starts from</p>
            <p className="text-[15px] font-black text-gray-800">₹{estimate.startingPrice}</p>
          </div>
        </div>
        
        <button
          onClick={handleContinue}
          disabled={!isContinueEnabled}
          className={`w-full py-4 rounded-2xl font-black text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${
            isContinueEnabled
              ? 'bg-[#10AFA5] text-white shadow-md shadow-[#10AFA5]/15 active:scale-[0.98]'
              : 'bg-gray-100 text-gray-400 cursor-not-allowed'
          }`}
        >
          <span>Continue</span>
          <span>→</span>
        </button>
      </div>

      {/* View All Brands Modal Bottom Sheet */}
      <AnimatePresence>
        {showAllBrands && (
          <div className="fixed inset-0 z-50 overflow-hidden flex items-end justify-center">
            {/* Overlay */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/40 backdrop-blur-xs" 
              onClick={() => setShowAllBrands(false)} 
            />
            {/* Sheet */}
            <motion.div 
              initial={{ translateY: '100%' }}
              animate={{ translateY: '0%' }}
              exit={{ translateY: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 220 }}
              className="relative bg-white rounded-t-3xl w-full max-w-[480px] h-[70vh] flex flex-col shadow-2xl z-10"
            >
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-black text-gray-800">Select Brand</h3>
                  <p className="text-[10px] text-gray-400 font-bold mt-0.5">Choose manufacturer to load issues</p>
                </div>
                <button 
                  onClick={() => setShowAllBrands(false)} 
                  className="p-2 text-gray-400 hover:text-gray-600 rounded-xl hover:bg-gray-50 transition-colors"
                >
                  <FiX size={18} />
                </button>
              </div>

              {/* Search input in modal */}
              <div className="px-5 py-3 border-b border-gray-100">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search brands..."
                    value={brandSearch}
                    onChange={(e) => setBrandSearch(e.target.value)}
                    className="w-full pl-9 pr-4 py-2.5 bg-gray-50 border border-gray-100 focus:border-[#10AFA5] rounded-xl text-xs font-semibold outline-none transition-all"
                  />
                  <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                </div>
              </div>

              {/* Scrollable Brands Grid */}
              <div className="flex-1 overflow-y-auto p-5 grid grid-cols-3 gap-3">
                {filteredBrands.map(br => {
                  const isSelected = selectedBrand?._id === br._id;
                  return (
                    <button
                      key={br._id}
                      onClick={() => {
                        handleBrandSelect(br);
                        setShowAllBrands(false);
                      }}
                      className={`flex flex-col items-center justify-center p-3 rounded-2xl border transition-all ${
                        isSelected 
                          ? 'border-[#10AFA5] bg-[#F0FDFA] ring-1 ring-[#10AFA5]/10 shadow-xs' 
                          : 'border-gray-100 bg-white hover:border-gray-200'
                      }`}
                      style={{ height: '78px' }}
                    >
                      {br.logo ? (
                        <img src={br.logo} alt={br.brandName} className="h-6 object-contain mb-1.5" />
                      ) : null}
                      <span className="text-[11px] font-bold text-gray-700 text-center leading-tight truncate w-full">{br.brandName}</span>
                    </button>
                  );
                })}
                {/* Others */}
                <button
                  onClick={() => {
                    handleBrandSelect({ _id: 'other', brandName: 'Others' });
                    setShowAllBrands(false);
                  }}
                  className={`flex flex-col items-center justify-center p-3 rounded-2xl border transition-all ${
                    selectedBrand?._id === 'other' ? 'border-[#10AFA5] bg-[#F0FDFA]' : 'border-gray-100 bg-white hover:border-gray-200'
                  }`}
                  style={{ height: '78px' }}
                >
                  <span className="text-[11px] font-bold text-gray-700">Others</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default OneTimeServiceDetail;
