import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useDebounce } from 'react-use';
import {
  FiSearch, FiChevronRight, FiAlertCircle, FiHeadphones, FiMonitor,
  FiShield, FiBriefcase, FiZap, FiHeart, FiSettings, FiCpu, FiGrid, FiX, FiCheckCircle
} from 'react-icons/fi';
import Header from '../../components/layout/Header';
import { publicCatalogService } from '../../../../services/catalogService';
import { OptimizedImage } from '../../../../components/common';

const toAssetUrl = (url) => {
  if (!url) return '';
  const clean = url.replace('/api/upload', '/upload');
  if (clean.startsWith('http')) return clean;
  const base = (import.meta.env.VITE_API_BASE_URL || 'https://app.wbinfs.com').replace(/\/api$/, '');
  return `${base}${clean.startsWith('/') ? '' : '/'}${clean}`;
};

const defaultCategories = [
  { id: 'digital', title: 'Digital Solutions', description: 'IT services, computer repair, networking & more', iconName: 'FiMonitor', slug: 'digital-solutions' },
  { id: 'security', title: 'Security Solutions', description: 'CCTV installation, access control, security systems', iconName: 'FiShield', slug: 'security-solutions' },
  { id: 'banking', title: 'Banking Solutions', description: 'ATM installation, maintenance, cash handling', iconName: 'FiBriefcase', slug: 'banking-solutions' },
  { id: 'energy', title: 'Energy Solutions', description: 'Solar installation, power backup, energy audit', iconName: 'FiZap', slug: 'energy-solutions' },
  { id: 'healthcare', title: 'Healthcare Solutions', description: 'Medical equipment, maintenance, support', iconName: 'FiHeart', slug: 'healthcare-solutions' },
  { id: 'appliance', title: 'Appliance Solutions', description: 'Home appliance repair, installation & service', iconName: 'FiSettings', slug: 'appliance-solutions' },
  { id: 'automation', title: 'Automation Solutions', description: 'Smart home, industrial automation, IoT', iconName: 'FiCpu', slug: 'automation-solutions' },
  { id: 'fire', title: 'Fire and Safety', description: 'Fire extinguisher, alarm systems, safety audits', iconName: 'FiAlertCircle', slug: 'fire-and-safety' }
];

const categoryIconMap = {
  FiMonitor, FiShield, FiBriefcase, FiZap, FiHeart, FiSettings, FiCpu, FiAlertCircle, FiGrid, FiCheckCircle
};

const formatPrice = (n) => {
  const num = Number(n);
  if (!Number.isFinite(num) || num <= 0) return null;
  return `₹${num.toLocaleString('en-IN')}`;
};

const Services = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [services, setServices] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [subResults, setSubResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [visibleCount, setVisibleCount] = useState(20);
  const abortRef = useRef(null);
  const searchInputRef = useRef(null);

  const fetchCategories = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await publicCatalogService.getServiceCategories();

      if (response.success && response.categories && response.categories.length > 0) {
        const mapped = response.categories.map((cat) => ({
          id: cat._id,
          title: cat.name,
          description: cat.description || 'Professional service for your needs',
          iconUrl: cat.image,
          iconName: cat.icon,
          slug: cat.slug
        }));
        setServices(mapped);
      } else {
        setServices(defaultCategories);
      }
    } catch (err) {
      console.error('Failed to fetch services:', err);
      setServices(defaultCategories);
    } finally {
      setTimeout(() => setLoading(false), 400);
    }
  };

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
    fetchCategories();
  }, []);

  useDebounce(
    () => {
      setDebouncedSearch(searchQuery.trim());
    },
    300,
    [searchQuery]
  );

  // Live sub-service search against production catalog (FormSchema C01–C24)
  useEffect(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }

    if (debouncedSearch.length < 2) {
      setSubResults([]);
      setSearchLoading(false);
      setSearchError(null);
      return undefined;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    let cancelled = false;

    (async () => {
      setSearchLoading(true);
      setSearchError(null);
      try {
        const res = await publicCatalogService.searchSubServices(debouncedSearch, {
          limit: 40,
          signal: controller.signal
        });
        if (cancelled || controller.signal.aborted) return;
        if (res?.success) {
          setSubResults(Array.isArray(res.data) ? res.data : []);
        } else {
          setSubResults([]);
          setSearchError(res?.message || 'Search failed');
        }
      } catch (err) {
        if (err?.name === 'CanceledError' || err?.name === 'AbortError' || controller.signal.aborted) {
          return;
        }
        console.error('Sub-service search failed:', err);
        if (!cancelled) {
          setSubResults([]);
          setSearchError('Could not search services. Please try again.');
        }
      } finally {
        if (!cancelled && !controller.signal.aborted) {
          setSearchLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [debouncedSearch]);

  const filteredCategories = services.filter(
    (service) =>
      service.title.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
      (service.description || '').toLowerCase().includes(debouncedSearch.toLowerCase())
  );

  useEffect(() => {
    const handleScroll = () => {
      if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 500) {
        setVisibleCount((prev) => prev + 20);
      }
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    setVisibleCount(20);
  }, [debouncedSearch]);

  const displayedCategories = filteredCategories.slice(0, visibleCount);
  const isSearching = debouncedSearch.length >= 2;
  const hasNoResults =
    isSearching &&
    !searchLoading &&
    subResults.length === 0 &&
    filteredCategories.length === 0;

  const clearSearch = () => {
    setSearchQuery('');
    setDebouncedSearch('');
    setSubResults([]);
    setSearchError(null);
    searchInputRef.current?.focus();
  };

  const handleSubServiceClick = (item) => {
    const code = item.subCatCode || item._id;
    if (code) {
      navigate(`/user/service-request/${code}`);
      return;
    }
    if (item.categorySlug) {
      navigate(`/user/categories/${item.categorySlug}`);
    }
  };

  const resolveCategoryIcon = (iconName) => categoryIconMap[iconName] || FiGrid;

  return (
    <div className="bg-[#F8FCFC] relative overflow-x-hidden pb-0 mb-0">
      <Header />

      <div className="px-4 mt-4 pb-0 mb-0">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative flex items-center mb-6"
        >
          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
            <FiSearch className="w-5 h-5" />
          </div>
          <input
            ref={searchInputRef}
            type="search"
            inputMode="search"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="Search ATM, CCTV, AC repair..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search sub-services"
            className="w-full bg-white h-14 pl-12 pr-12 rounded-[20px] text-[15px] shadow-[0_2px_15px_rgba(0,0,0,0.04)] border border-gray-100 focus:outline-none focus:ring-2 focus:ring-[#10AFA5]/20 focus:border-[#10AFA5]/30 transition-all placeholder:text-gray-400"
          />
          {searchQuery ? (
            <button
              type="button"
              onClick={clearSearch}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 text-gray-400 hover:text-gray-600 rounded-full flex items-center justify-center"
            >
              <FiX className="w-4 h-4" />
            </button>
          ) : null}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          className="mb-6"
        >
          <h1 className="text-[22px] font-bold text-[#0F172A] tracking-tight">
            {isSearching ? 'Search results' : 'All Services'}
          </h1>
          <p className="text-[13px] text-[#64748B] mt-1">
            {isSearching
              ? `Showing matches for "${debouncedSearch}"`
              : 'Professional services for your home and business'}
          </p>
        </motion.div>

        {loading ? (
          <div className="grid grid-cols-2 gap-3 mb-8">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="bg-white rounded-[24px] p-5 border border-gray-100 shadow-sm animate-pulse">
                <div className="w-10 h-10 bg-slate-100 rounded-full mb-4" />
                <div className="h-4 bg-slate-100 rounded w-3/4 mb-2" />
                <div className="h-3 bg-slate-100 rounded w-full mb-1" />
                <div className="h-3 bg-slate-100 rounded w-5/6" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-100 rounded-2xl p-6 text-center mb-8">
            <FiAlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
            <h3 className="font-bold text-red-800 mb-1">Failed to load services</h3>
            <p className="text-sm text-red-600 mb-4">We encountered a problem while fetching the services.</p>
            <button
              type="button"
              onClick={() => fetchCategories()}
              className="px-6 py-2 bg-red-100 text-red-700 font-medium rounded-full text-sm active:scale-95 transition-transform"
            >
              Try Again
            </button>
          </div>
        ) : (
          <>
            {/* Direct sub-service hits */}
            {isSearching && (
              <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-[14px] font-bold text-[#0F172A]">Services</h2>
                  {searchLoading ? (
                    <span className="text-[11px] text-[#10AFA5] font-medium">Searching…</span>
                  ) : (
                    <span className="text-[11px] text-[#64748B]">{subResults.length} found</span>
                  )}
                </div>

                {searchError && (
                  <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 mb-3 text-sm text-amber-800">
                    {searchError}
                  </div>
                )}

                {searchLoading && subResults.length === 0 ? (
                  <div className="space-y-2 mb-2">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="h-[72px] bg-white border border-gray-100 rounded-2xl animate-pulse" />
                    ))}
                  </div>
                ) : subResults.length > 0 ? (
                  <div className="space-y-2 mb-2">
                    {subResults.map((item, index) => {
                      const Icon = resolveCategoryIcon(item.iconName);
                      const price = formatPrice(item.basePrice);
                      return (
                        <motion.button
                          key={item.subCatCode || item._id}
                          type="button"
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: Math.min(index * 0.03, 0.3) }}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => handleSubServiceClick(item)}
                          className="w-full text-left bg-white rounded-2xl px-4 py-3.5 border border-gray-100 shadow-[0_2px_12px_rgba(0,0,0,0.03)] flex items-center gap-3 active:bg-[#F8FCFC]"
                        >
                          <div className="w-11 h-11 rounded-full bg-[#10AFA5]/10 text-[#10AFA5] flex items-center justify-center shrink-0">
                            <Icon className="w-5 h-5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <h3 className="text-[14px] font-bold text-[#0F172A] truncate">
                                {item.title || item.name}
                              </h3>
                              {item.subCatCode ? (
                                <span className="text-[10px] font-semibold text-[#10AFA5] bg-[#10AFA5]/10 px-1.5 py-0.5 rounded shrink-0">
                                  {item.subCatCode}
                                </span>
                              ) : null}
                            </div>
                            <p className="text-[11px] text-[#64748B] mt-0.5 truncate">
                              {item.categoryName || 'Service'}
                              {price ? ` · from ${price}` : ''}
                            </p>
                          </div>
                          <FiChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
                        </motion.button>
                      );
                    })}
                  </div>
                ) : !searchLoading ? (
                  <p className="text-[12px] text-[#94A3B8] mb-2 px-1">No matching sub-services</p>
                ) : null}
              </div>
            )}

            {hasNoResults ? (
              <div className="bg-white border border-gray-100 shadow-sm rounded-2xl p-8 text-center mb-8">
                <FiGrid className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <h3 className="font-bold text-gray-800 mb-1">No services found</h3>
                <p className="text-sm text-gray-500 mb-4">
                  We couldn&apos;t find any services matching &quot;{debouncedSearch}&quot;
                </p>
                <button
                  type="button"
                  onClick={clearSearch}
                  className="px-5 py-2 bg-[#10AFA5]/10 text-[#0F766E] font-medium rounded-full text-sm"
                >
                  Clear search
                </button>
              </div>
            ) : (
              <div className="mb-8">
                {isSearching && filteredCategories.length > 0 && (
                  <h2 className="text-[14px] font-bold text-[#0F172A] mb-3">Categories</h2>
                )}
                {!isSearching || filteredCategories.length > 0 ? (
                  <div className="grid grid-cols-2 gap-3">
                    {displayedCategories.map((service, index) => {
                      const IconComponent = resolveCategoryIcon(service.iconName);
                      return (
                        <motion.div
                          key={service.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.05 }}
                          whileTap={{ scale: 0.96 }}
                          onClick={() => navigate(service.slug ? `/user/categories/${service.slug}` : '#')}
                          className="bg-white rounded-[24px] p-5 border border-gray-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] flex flex-col relative group cursor-pointer"
                        >
                          <div className="w-[42px] h-[42px] rounded-full bg-[#10AFA5]/10 flex items-center justify-center mb-4 text-[#10AFA5] group-hover:bg-[#10AFA5] group-hover:text-white transition-colors duration-300 overflow-hidden">
                            {service.iconUrl ? (
                              <OptimizedImage
                                src={toAssetUrl(service.iconUrl)}
                                alt={service.title}
                                className="w-full h-full object-contain filter group-hover:brightness-0 group-hover:invert transition-all duration-300 p-2"
                              />
                            ) : (
                              <IconComponent className="w-5 h-5" />
                            )}
                          </div>
                          <h3 className="text-[14px] font-bold text-[#0F172A] leading-tight mb-1.5 pr-4 tracking-tight">
                            {service.title}
                          </h3>
                          <p className="text-[11px] text-[#64748B] leading-[1.5] line-clamp-2">
                            {service.description}
                          </p>
                          <div className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-300 group-hover:text-[#10AFA5] transition-colors">
                            <FiChevronRight className="w-4 h-4" />
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            )}
          </>
        )}

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mb-0 bg-gradient-to-br from-[#E8F8F7] to-[#F1FAF9] rounded-2xl p-5 relative overflow-hidden border border-[#10AFA5]/10 shadow-sm"
        >
          <div className="absolute right-0 bottom-0 w-32 h-32 bg-[#10AFA5]/5 rounded-full blur-2xl -mr-10 -mb-10" />

          <div className="relative z-10 w-2/3">
            <h3 className="text-[15px] font-bold text-[#0F172A] mb-1.5 leading-tight">Need Help Choosing a Service?</h3>
            <p className="text-[11px] text-[#64748B] mb-4 leading-relaxed">
              Our experts are here to help you find the right solution
            </p>
            <button
              type="button"
              className="bg-[#10AFA5] text-white px-4 py-2.5 rounded-xl text-[12px] font-semibold flex items-center gap-2 active:scale-95 transition-transform shadow-[0_4px_10px_rgba(16,175,165,0.25)]"
              onClick={() => navigate('/user/help-support')}
            >
              <FiHeadphones className="w-4 h-4" />
              Contact Support
            </button>
          </div>

          <div className="absolute right-[-10px] bottom-0 w-1/3 h-[110%] flex items-end">
            <div className="relative w-full h-full">
              <motion.div
                animate={{ y: [0, -5, 0] }}
                transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
                className="absolute right-6 top-4 w-6 h-6 bg-[#10AFA5] rounded-xl rounded-br-sm flex items-center justify-center opacity-90"
              >
                <div className="w-3 h-0.5 bg-white rounded-full" />
              </motion.div>
              <motion.div
                animate={{ y: [0, 5, 0] }}
                transition={{ repeat: Infinity, duration: 4, ease: 'easeInOut', delay: 1 }}
                className="absolute right-2 top-14 w-8 h-8 bg-[#0F172A] rounded-xl rounded-tl-sm flex items-center justify-center opacity-90"
              >
                <div className="flex flex-col gap-1 items-center">
                  <div className="w-4 h-0.5 bg-white rounded-full" />
                  <div className="w-2 h-0.5 bg-white rounded-full mr-2" />
                </div>
              </motion.div>
              <img
                fetchPriority="low"
                loading="lazy"
                src="https://res.cloudinary.com/dcbcojo24/image/upload/v1731518018/uploads/x69wz81p8t08er78ssli.png"
                alt="Support Expert"
                className="absolute bottom-0 right-0 w-[120px] object-contain drop-shadow-md z-10"
                style={{ objectPosition: 'bottom' }}
                onError={(e) => {
                  e.target.style.display = 'none';
                }}
              />
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default Services;
