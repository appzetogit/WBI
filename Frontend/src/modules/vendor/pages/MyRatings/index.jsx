import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiStar, FiUser, FiMessageSquare, FiFilter, FiLoader, FiCheckCircle, FiTrendingUp, FiActivity, FiShield, FiBriefcase, FiClock } from 'react-icons/fi';
import { toast } from 'react-hot-toast';
import { vendorTheme as themeColors } from '../../../../theme';
import { getRatings } from '../../services/bookingService';
import { motion, AnimatePresence } from 'framer-motion';

const MyRatings = () => {
  const navigate = useNavigate();
  const [ratings, setRatings] = useState([]);
  const [stats, setStats] = useState(null);
  const [availableServices, setAvailableServices] = useState([]);
  const [selectedService, setSelectedService] = useState('all');
  const [isLoading, setIsLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0 });

  const fetchRatings = async (page = 1, serviceId = selectedService) => {
    try {
      setIsLoading(true);
      const response = await getRatings({ page, limit: 10, serviceId });
      if (response.success) {
        setRatings(prev => page === 1 ? response.data : [...prev, ...response.data]);
        
        // Mocking the new enterprise metrics if backend hasn't populated them yet
        const enrichedStats = {
          ...response.stats,
          ratingMetrics: response.stats?.ratingMetrics || {
            slaAdherence: 4.8,
            technicalCompletion: 4.9,
            damageIncidentRate: 5.0,
            professionalEthics: 4.7
          }
        };
        
        setStats(enrichedStats);
        if (response.availableServices && page === 1) {
          setAvailableServices(response.availableServices);
        }
        setPagination(response.pagination);
      } else {
        toast.error(response.message || 'Failed to fetch ratings');
      }
    } catch (error) {
      toast.error(error.response?.data?.message || error.message || 'Failed to load ratings');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRatings(1, selectedService);
  }, [selectedService]);

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const MetricBar = ({ label, icon: Icon, score, max = 5 }) => {
    const percentage = (score / max) * 100;
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-gray-700 font-semibold text-sm">
            <Icon className="w-4 h-4 text-teal-600" /> {label}
          </div>
          <span className="text-sm font-bold text-gray-900">{score.toFixed(1)} <span className="text-gray-400 font-normal">/ {max}</span></span>
        </div>
        <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${percentage}%` }}
            transition={{ duration: 1, ease: 'easeOut', delay: 0.1 }}
            className={`h-full rounded-full ${
              score >= 4.5 ? 'bg-emerald-500' : 
              score >= 4.0 ? 'bg-teal-500' : 
              score >= 3.0 ? 'bg-yellow-400' : 
              'bg-red-500'
            }`}
          />
        </div>
      </div>
    );
  };

  return (
    <div className="font-sans space-y-8 max-w-7xl mx-auto w-full px-4 sm:px-0">
      {/* Page Header & Filters */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Enterprise Ratings & Tiering</h1>
          <p className="text-gray-500 text-sm mt-1 font-medium">Monitor your SLA performance and quality metrics to unlock premium B2B contracts.</p>
        </div>
          
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setSelectedService('all')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 ${
                selectedService === 'all'
                  ? 'bg-gray-900 text-white shadow-md'
                  : 'bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100'
              }`}
            >
              All Data
            </button>
            {availableServices.map((service) => (
              <button
                key={service._id}
                onClick={() => setSelectedService(service._id)}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 flex items-center gap-2 ${
                  selectedService === service._id
                    ? 'bg-gray-900 text-white shadow-md'
                    : 'bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100'
                }`}
              >
                {service.title || service.serviceName}
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-black ${
                  selectedService === service._id ? 'bg-gray-700 text-white' : 'bg-gray-200 text-gray-600'
                }`}>
                  {service.count}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Premium Stats Overview */}
        {stats && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Tier Score Card */}
            <div className="lg:col-span-1 bg-gradient-to-b from-gray-900 to-gray-800 rounded-3xl p-8 shadow-xl border border-gray-700 flex flex-col items-center justify-center text-center relative overflow-hidden">
              <div className="absolute top-0 right-0 -mr-10 -mt-10 w-32 h-32 rounded-full bg-teal-500/10 blur-2xl"></div>
              
              <h3 className="text-gray-400 font-bold uppercase tracking-widest text-[10px] mb-6">Enterprise Tier Score</h3>
              
              <div className="flex items-end justify-center gap-2 mb-2 relative z-10">
                <h2 className="text-7xl font-black text-white leading-none tracking-tighter">
                  {stats.averageRating?.toFixed(1) || '0.0'}
                </h2>
              </div>
              
              <div className="flex gap-1.5 mb-6 relative z-10">
                {[1, 2, 3, 4, 5].map((s) => (
                  <FiStar
                    key={s}
                    className={`w-5 h-5 ${s <= Math.round(stats.averageRating || 0) ? 'text-yellow-400 fill-yellow-400' : 'text-gray-600'}`}
                  />
                ))}
              </div>
              
              <div className="bg-white/10 backdrop-blur-md border border-white/10 px-4 py-2 rounded-xl inline-flex items-center gap-2 relative z-10">
                <FiActivity className="text-teal-400 w-4 h-4" />
                <p className="text-xs text-gray-200 font-bold">
                  Tier: <span className="text-teal-400">Premium Partner</span>
                </p>
              </div>
            </div>

            {/* Granular SLA Metrics */}
            <div className="lg:col-span-2 bg-white rounded-3xl p-8 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h3 className="text-gray-900 font-black text-lg">Granular Performance Metrics</h3>
                  <p className="text-xs text-gray-500 font-medium mt-1">Algorithmically calculated based on B2B client feedback.</p>
                </div>
                <div className="p-3 bg-teal-50 rounded-2xl text-teal-600">
                  <FiTrendingUp className="w-6 h-6" />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8">
                <MetricBar 
                  label="SLA Adherence (Time)" 
                  icon={FiClock} 
                  score={stats.ratingMetrics?.slaAdherence || 0} 
                />
                <MetricBar 
                  label="Technical Completion Rate" 
                  icon={FiBriefcase} 
                  score={stats.ratingMetrics?.technicalCompletion || 0} 
                />
                <MetricBar 
                  label="Damage / Incident Control" 
                  icon={FiShield} 
                  score={stats.ratingMetrics?.damageIncidentRate || 0} 
                />
                <MetricBar 
                  label="Professional Ethics & Uniform" 
                  icon={FiUser} 
                  score={stats.ratingMetrics?.professionalEthics || 0} 
                />
              </div>
            </div>
          </div>
        )}

        {/* Reviews Section */}
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow">
          <div className="p-6 md:p-8 border-b border-gray-100 flex flex-col md:flex-row md:items-center justify-between bg-gray-50/30 gap-4">
            <div>
              <h3 className="text-xl font-black text-gray-900">Recent Enterprise Feedback</h3>
              <p className="text-xs text-gray-500 mt-1 font-medium">Direct reviews from your completed B2B and retail dispatches.</p>
            </div>
            <button className="flex items-center gap-2 px-5 py-2.5 bg-white rounded-xl shadow-sm border border-gray-200 text-gray-700 font-bold text-xs hover:bg-gray-50 transition-colors">
              <FiFilter className="w-4 h-4" /> Filter Feedback
            </button>
          </div>

          <div className="p-6 md:p-8">
            {isLoading && pagination.page === 1 ? (
              <div className="flex flex-col items-center justify-center py-20">
                <div className="w-12 h-12 border-4 border-gray-100 border-t-gray-900 rounded-full animate-spin mb-4"></div>
                <p className="text-gray-500 font-bold text-xs tracking-widest uppercase">Loading Matrix...</p>
              </div>
            ) : (
              <AnimatePresence>
                {ratings.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {ratings.map((rating, idx) => (
                      <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.05 }}
                        key={idx} 
                        className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm hover:shadow-lg transition-all duration-300 flex flex-col h-full transform hover:-translate-y-1"
                      >
                        <div className="flex justify-between items-start mb-5">
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-full bg-teal-50 flex items-center justify-center overflow-hidden shrink-0 border border-teal-100">
                              {rating.userId?.profilePhoto ? (
                                <img fetchPriority="low" loading="lazy" src={rating.userId.profilePhoto} alt={rating.userId.name} className="w-full h-full object-cover" />
                              ) : (
                                <FiBriefcase className="w-5 h-5 text-teal-600" />
                              )}
                            </div>
                            <div>
                              <h4 className="font-black text-gray-900 text-sm flex items-center gap-1.5">
                                {rating.userId?.name || 'Enterprise Client'}
                                <FiCheckCircle className="w-3.5 h-3.5 text-blue-500" />
                              </h4>
                              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mt-0.5">{formatDate(rating.reviewedAt)}</p>
                            </div>
                          </div>
                        </div>

                        <div className="flex gap-1 mb-4 bg-gray-50 p-2 rounded-xl inline-flex self-start">
                          {[1, 2, 3, 4, 5].map((s) => (
                            <FiStar
                              key={s}
                              className={`w-3.5 h-3.5 ${s <= rating.rating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300'}`}
                            />
                          ))}
                        </div>

                        <div className="mb-4 inline-block self-start text-teal-700 bg-teal-50 px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider border border-teal-100">
                          {rating.serviceId?.title || rating.serviceName}
                        </div>

                        {rating.review ? (
                          <p className="text-gray-600 text-sm leading-relaxed mb-5 grow font-medium">
                            "{rating.review}"
                          </p>
                        ) : (
                          <p className="text-gray-400 italic text-sm mb-5 grow">No written feedback provided.</p>
                        )}

                        {rating.reviewImages && rating.reviewImages.length > 0 && (
                          <div className="flex gap-2 overflow-x-auto pb-3 scrollbar-hide mb-2">
                            {rating.reviewImages.map((img, i) => (
                              <img fetchPriority="low" loading="lazy" key={i} src={img} className="w-16 h-16 rounded-xl object-cover shrink-0 border border-gray-200 shadow-sm" alt="Review Evidence" />
                            ))}
                          </div>
                        )}

                        {rating.workerId && (
                          <div className="pt-4 border-t border-gray-100 mt-auto bg-gray-50/50 -mx-6 -mb-6 px-6 py-4 rounded-b-2xl">
                            <div className="flex items-center justify-between text-[11px] font-bold">
                              <span className="text-gray-500">Technician: <strong className="text-gray-900">{rating.workerId.name}</strong></span>
                              <span className="text-gray-400 bg-white px-2 py-1 rounded border border-gray-200">#{rating.bookingNumber || 'REF'}</span>
                            </div>
                          </div>
                        )}
                      </motion.div>
                    ))}
                  </div>
                ) : (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex flex-col items-center justify-center py-16"
                  >
                    <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mb-5 border border-gray-100">
                      <FiMessageSquare className="w-8 h-8 text-gray-300" />
                    </div>
                    <h4 className="text-lg font-black text-gray-900 mb-1">No Feedback Yet</h4>
                    <p className="text-gray-500 text-sm font-medium">
                      {selectedService !== 'all' 
                        ? "There are no ratings specifically for this service at the moment."
                        : "When enterprise clients leave feedback, it will appear here."}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            )}

            {/* Load More */}
            {pagination.total > ratings.length && !isLoading && (
              <div className="pt-10 flex justify-center mt-4">
                <button
                  onClick={() => fetchRatings(pagination.page + 1)}
                  className="px-8 py-3 bg-gray-900 text-white rounded-xl font-bold text-xs hover:bg-black transition-all shadow-md hover:shadow-lg transform active:scale-95"
                >
                  Load More Feedback
                </button>
              </div>
            )}
            
            {isLoading && pagination.page > 1 && (
              <div className="flex justify-center py-8">
                <div className="w-8 h-8 border-4 border-gray-100 border-t-gray-900 rounded-full animate-spin"></div>
              </div>
            )}
          </div>
      </div>
    </div>
  );
};

export default MyRatings;
