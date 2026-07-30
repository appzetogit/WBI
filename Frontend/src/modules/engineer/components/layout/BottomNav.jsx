import React, { useRef, useEffect, useState, memo, useMemo } from 'react';
import { motion, useScroll, useMotionValueEvent } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { FiHome, FiBriefcase, FiUser, FiDollarSign, FiFolder } from 'react-icons/fi';
import { HiHome, HiBriefcase, HiUser, HiFolder } from 'react-icons/hi';
import { gsap } from 'gsap';
import { workerTheme as themeColors } from '../../../../theme';
import engineerService from '../../../../services/engineerService';

const BottomNav = memo(() => {
  // Hide-on-scroll removed to fix empty bottom space issue

  const navigate = useNavigate();
  const location = useLocation();
  const iconRefs = useRef({});
  const activeAnimations = useRef({});
  const [pendingJobsCount, setPendingJobsCount] = useState(0);

  const queryClient = useQueryClient();

  // Load pending job count from engineer API cache / fetch (not worker localStorage)
  useEffect(() => {
    let cancelled = false;

    const updatePendingCount = async () => {
      try {
        const cached = queryClient.getQueryData(['engineerAssignedJobs', 1, 'all']);
        const jobs = cached?.data?.jobs || cached?.jobs || [];
        if (Array.isArray(jobs) && jobs.length) {
          const pending = jobs.filter((job) =>
            ['PENDING', 'pending', 'pending_acceptance', 'ASSIGNED'].includes(job.workerStatus || job.status)
          ).length;
          if (!cancelled) setPendingJobsCount(pending);
          return;
        }

        const res = await engineerService.getAssignedJobs({ page: 1, limit: 20, status: 'pending' });
        const list = res?.data?.jobs || res?.jobs || [];
        if (!cancelled) {
          setPendingJobsCount(Array.isArray(list) ? list.length : 0);
        }
      } catch {
        // Non-blocking — badge stays at last known value
      }
    };

    updatePendingCount();
    window.addEventListener('storage', updatePendingCount);
    window.addEventListener('engineerJobsUpdated', updatePendingCount);

    // Background Prefetching for Sub-1-second loading
    const prefetchTabs = async () => {
      try {
        queryClient.prefetchQuery({
          queryKey: ['engineerDashboardStats'],
          queryFn: () => engineerService.getDashboardStats(),
          staleTime: 60 * 1000
        });

        queryClient.prefetchQuery({
          queryKey: ['engineerProfile'],
          queryFn: () => engineerService.getProfile(),
          staleTime: 60 * 1000
        });

        queryClient.prefetchQuery({
          queryKey: ['engineerAssignedJobs', 1, 'all'],
          queryFn: () => engineerService.getAssignedJobs({ page: 1, limit: 10, status: 'all' }),
          staleTime: 60 * 1000
        });
      } catch {
        // Silently ignore prefetch errors
      }
    };

    const prefetchTimer = setTimeout(prefetchTabs, 500);

    return () => {
      cancelled = true;
      window.removeEventListener('storage', updatePendingCount);
      window.removeEventListener('engineerJobsUpdated', updatePendingCount);
      clearTimeout(prefetchTimer);
    };
  }, [queryClient]);

  const navItems = useMemo(() => {
    return [
      { path: '/engineer/dashboard', icon: FiHome, activeIcon: HiHome, label: 'Home' },
      { path: '/engineer/jobs', icon: FiBriefcase, activeIcon: HiBriefcase, label: 'Jobs', badge: pendingJobsCount },
      { path: '/engineer/projects', icon: FiFolder, activeIcon: HiFolder, label: 'Projects' },
      { path: '/engineer/wallet', icon: FiDollarSign, activeIcon: FiDollarSign, label: 'Wallet' },
      { path: '/engineer/profile', icon: FiUser, activeIcon: HiUser, label: 'Profile' },
    ];
  }, [pendingJobsCount]);

  const handleNavClick = (path) => {
    if (location.pathname !== path) {
      navigate(path);
    }
  };



  return (
    <motion.nav
      className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-white/95 backdrop-blur-xl border-t border-slate-200/80 shadow-[0_-4px_24px_rgba(0,0,0,0.06)] z-50"
      style={{
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      <div className="flex items-center justify-around px-2 py-1">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path ||
            (item.path === '/engineer/dashboard' && location.pathname === '/engineer');
          const IconComponent = isActive ? item.activeIcon : item.icon;

          return (
            <button
              key={item.path}
              onClick={() => handleNavClick(item.path)}
              className="flex flex-col items-center justify-center relative w-16 h-12 rounded-xl transition-all duration-200 group active:scale-95"
              onMouseEnter={(e) => {
                if (!isActive) {
                  gsap.to(e.currentTarget, { scale: 1.05, duration: 0.2 });
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  gsap.to(e.currentTarget, { scale: 1.0, duration: 0.2 });
                }
              }}
            >
              {/* Active Indicator Bar - Gradient Accent */}
              {isActive && (
                <div
                  className="absolute top-0 w-8 h-1 rounded-b-full"
                  style={{
                    background: themeColors.gradient,
                    boxShadow: `0 2px 8px ${themeColors.brand.teal}4D`,
                  }}
                />
              )}

              {/* Active Background - Very Subtle Teal Tint */}
              {isActive && (
                <div
                  className="absolute inset-0 rounded-xl scale-90"
                  style={{ backgroundColor: `${themeColors.brand.teal}0A` }}
                />
              )}

              <div className="relative z-10 flex flex-col items-center justify-center pt-0.5">
                <div className="relative mb-0.5">
                  <IconComponent
                    ref={(el) => {
                      iconRefs.current[item.path] = el;
                    }}
                    className={`w-5 h-5 transition-all duration-200 ${isActive ? 'scale-110' : 'text-gray-400 group-hover:text-gray-600'}`}
                    style={{
                      color: isActive ? themeColors.button : '#9CA3AF',
                      filter: isActive ? `drop-shadow(0 2px 4px ${themeColors.brand.teal}1A)` : 'none'
                    }}
                  />
                  {item.badge !== undefined && item.badge > 0 && (
                    <span
                      className="absolute bg-gradient-to-br from-red-500 to-red-600 text-white text-xs font-bold rounded-full flex items-center justify-center"
                      style={{
                        top: '-5px',
                        right: '-8px',
                        minWidth: '16px',
                        height: '16px',
                        padding: '0 3px',
                        fontSize: '9px',
                        lineHeight: '16px',
                        border: '2px solid white',
                        boxShadow: '0 2px 5px rgba(239, 68, 68, 0.4)',
                        zIndex: 50,
                      }}
                    >
                      {item.badge > 9 ? '9+' : item.badge}
                    </span>
                  )}
                </div>
                <span
                  className={`text-[10px] leading-tight transition-colors duration-200 ${isActive ? 'font-bold' : 'font-medium text-gray-500'}`}
                  style={{
                    color: isActive ? themeColors.button : '#6B7280',
                  }}
                >
                  {item.label}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </motion.nav>
  );
});

BottomNav.displayName = 'BottomNav';
export default BottomNav;

