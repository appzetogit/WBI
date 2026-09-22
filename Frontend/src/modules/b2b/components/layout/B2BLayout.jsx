import React, { useState, useEffect, useMemo } from 'react';
import { Outlet, useNavigate, useLocation, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  FiMenu, FiBell, FiChevronDown, FiLogOut, FiUser, FiSettings, FiUsers
} from 'react-icons/fi';
import Logo from '../../../../components/common/Logo';
import toast from 'react-hot-toast';
import PrefetchLink from '../../../../components/common/PrefetchLink';
import api from '../../../../services/api';
import { useSocket } from '../../../../context/SocketContext';
import useB2BSession from '../../hooks/useB2BSession';
import { B2B_NAV, filterNav, isLeafActive, titleFor } from '../../config/navigation';

const formatCount = (n) => (n > 999 ? `${Math.floor(n / 1000)}k` : String(n));

const B2BLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const socket = useSocket();
  const { company: companyData, principal, can } = useB2BSession();

  // No stored session at all → back to login.
  useEffect(() => {
    const hasSession = localStorage.getItem('b2bData') || sessionStorage.getItem('b2bData');
    if (!hasSession) navigate('/b2b/login');
  }, [navigate]);

  const isOnboardingDone =
    companyData?.lifecycleStatus === 'active' ||
    (companyData?.status === 'active' && companyData?.onboardingStatus === 'completed');
  const isApproved = companyData?.verificationStatus === 'approved';

  const nav = useMemo(() => {
    const visible = filterNav(B2B_NAV, can);
    return visible.filter((item) =>
      !(item.onboardingOnly && isOnboardingDone && !location.pathname.startsWith('/b2b/onboarding'))
    );
  }, [can, isOnboardingDone, location.pathname]);

  // Which group is expanded: the one holding the current page, plus any the user opened.
  const [openGroups, setOpenGroups] = useState(() => new Set());
  useEffect(() => {
    const current = nav.find((item) => item.children?.some((c) => isLeafActive(location.pathname, c)));
    if (current) setOpenGroups((prev) => (prev.has(current.name) ? prev : new Set(prev).add(current.name)));
  }, [location.pathname, nav]);
  const toggleGroup = (name) =>
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  // Live job-view counts for the sidebar badges (same query the Jobs page uses).
  const { data: statsRes } = useQuery({
    queryKey: ['b2bJobsStats'],
    queryFn: async () => (await api.get('/b2b/jobs/stats')).data,
    enabled: isApproved && can('jobs.read'),
    refetchInterval: 30000,
    staleTime: 15000
  });
  const viewCounts = useMemo(
    () => Object.fromEntries((statsRes?.views || []).map((v) => [v.key, v.count])),
    [statsRes]
  );

  const { data: unreadNotifs = 0 } = useQuery({
    queryKey: ['b2bUnreadNotifications'],
    queryFn: async () => (await api.get('/notifications/b2b', { params: { limit: 1 } })).data?.unreadCount || 0,
    refetchInterval: 60000
  });

  useEffect(() => {
    const onUpd = () => queryClient.invalidateQueries({ queryKey: ['b2bUnreadNotifications'] });
    window.addEventListener('b2bNotificationsUpdated', onUpd);
    return () => window.removeEventListener('b2bNotificationsUpdated', onUpd);
  }, [queryClient]);

  // Job events move the sidebar counts too.
  useEffect(() => {
    if (!socket) return undefined;
    const refresh = () => queryClient.invalidateQueries({ queryKey: ['b2bJobsStats'] });
    const events = ['job_updated', 'job_cancelled', 'engineer_assigned', 'b2b:batchCreated', 'job:statusChanged'];
    events.forEach((e) => socket.on(e, refresh));
    return () => events.forEach((e) => socket.off(e, refresh));
  }, [socket, queryClient]);

  useEffect(() => {
    setSidebarOpen(false);
    setProfileDropdownOpen(false);
  }, [location.pathname]);

  const handleLogout = () => {
    ['b2bAccessToken', 'b2bRefreshToken', 'b2bData'].forEach((k) => {
      localStorage.removeItem(k);
      sessionStorage.removeItem(k);
    });
    queryClient.clear();
    toast.success('Logged out successfully');
    navigate('/b2b/login');
  };

  const renderBadge = (countKey, active, tone) => {
    if (!countKey || viewCounts[countKey] === undefined) return null;
    const n = viewCounts[countKey];
    if (!n && countKey !== 'all') return null;
    const danger = tone === 'danger' && n > 0;
    return (
      <span
        className={`ml-2 min-w-[1.5rem] text-center text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${
          active ? 'bg-white/25 text-white' : danger ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'
        }`}
      >
        {formatCount(n)}
      </span>
    );
  };

  const displayName = principal?.name || companyData?.authorizedPerson?.name || 'Contact';

  return (
    <div className="flex h-screen bg-[#F0FDFA] overflow-hidden font-sans">
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 z-40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-[#E6F4F2] flex flex-col transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:inset-auto ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
        aria-label="B2B navigation"
      >
        <div className="h-16 flex items-center px-6 border-b border-[#E6F4F2] shrink-0">
          <Logo className="h-8" />
          <span className="ml-2 font-bold text-gray-800 text-base tracking-wide">B2B Platform</span>
        </div>

        <div className="flex-1 overflow-y-auto py-4 scrollbar-hide">
          <nav className="space-y-1 px-3">
            {nav.map((item) => {
              if (item.children) {
                const groupActive = item.children.some((c) => isLeafActive(location.pathname, c));
                const open = openGroups.has(item.name);
                return (
                  <div key={item.name} className="space-y-1">
                    <button
                      type="button"
                      onClick={() => toggleGroup(item.name)}
                      aria-expanded={open}
                      className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl transition-all group font-semibold cursor-pointer ${
                        groupActive ? 'bg-[#10AFA5]/10 text-[#10AFA5]' : 'text-gray-600 hover:bg-[#F0FDFA] hover:text-[#10AFA5]'
                      }`}
                    >
                      <span className="flex items-center min-w-0">
                        <item.icon className={`w-5 h-5 mr-3 shrink-0 transition-colors ${groupActive ? 'text-[#10AFA5]' : 'text-gray-400 group-hover:text-[#10AFA5]'}`} />
                        <span className="text-sm font-semibold truncate">{item.name}</span>
                      </span>
                      <FiChevronDown className={`w-4 h-4 shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
                    </button>

                    <AnimatePresence initial={false}>
                      {open && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden pl-4 space-y-0.5"
                        >
                          {item.children.map((sub) => {
                            const active = isLeafActive(location.pathname, sub);
                            return (
                              <PrefetchLink
                                key={sub.path}
                                to={sub.path}
                                className={`flex items-center justify-between px-4 py-2 rounded-lg transition-all text-xs font-semibold ${
                                  active
                                    ? 'bg-[#10AFA5] text-white shadow-sm shadow-[#10AFA5]/10'
                                    : 'text-gray-500 hover:bg-[#F0FDFA] hover:text-[#10AFA5]'
                                }`}
                              >
                                <span className="flex items-center min-w-0">
                                  <span className="w-1.5 h-1.5 rounded-full mr-2 bg-current shrink-0" />
                                  <span className="truncate">{sub.name}</span>
                                </span>
                                {renderBadge(sub.countKey, active, sub.tone)}
                              </PrefetchLink>
                            );
                          })}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              }

              const active = isLeafActive(location.pathname, item);
              return (
                <PrefetchLink
                  key={item.path}
                  to={item.path}
                  className={`flex items-center justify-between px-4 py-2.5 rounded-xl transition-all group ${
                    active ? 'bg-[#10AFA5] text-white shadow-md shadow-[#10AFA5]/10' : 'text-gray-600 hover:bg-[#F0FDFA] hover:text-[#10AFA5]'
                  }`}
                >
                  <span className="flex items-center min-w-0">
                    <item.icon className={`w-5 h-5 mr-3 shrink-0 transition-colors ${active ? 'text-white' : 'text-gray-400 group-hover:text-[#10AFA5]'}`} />
                    <span className="text-sm font-semibold truncate">{item.name}</span>
                  </span>
                  {item.onboardingOnly && !isOnboardingDone && (
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ml-1.5 shrink-0 ${active ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-700'}`}>
                      Pending
                    </span>
                  )}
                </PrefetchLink>
              );
            })}

            <button
              type="button"
              onClick={handleLogout}
              className="w-full flex items-center px-4 py-2.5 rounded-xl transition-all text-red-600 hover:bg-red-50 text-left font-semibold cursor-pointer"
            >
              <FiLogOut className="w-5 h-5 mr-3 text-red-500" />
              <span className="text-sm font-semibold">Logout</span>
            </button>
          </nav>
        </div>

        <div className="p-4 border-t border-[#E6F4F2] shrink-0">
          <button
            type="button"
            onClick={() => navigate('/b2b/company-profile')}
            className="w-full flex items-center border border-gray-100 rounded-xl p-3 cursor-pointer hover:border-[#10AFA5]/30 transition-colors bg-gray-50 text-left"
          >
            {companyData?.logoUrl ? (
              <img src={companyData.logoUrl} alt="" className="h-10 w-10 rounded-xl object-cover border border-gray-200" />
            ) : (
              <div className="h-10 w-10 rounded-xl bg-[#10AFA5]/10 flex items-center justify-center text-[#10AFA5] font-bold text-base shrink-0">
                {companyData?.companyName?.charAt(0) || 'C'}
              </div>
            )}
            <div className="ml-3 overflow-hidden">
              <p className="text-sm font-bold text-gray-800 truncate">{companyData?.companyName || 'Company'}</p>
              <p className={`text-xs font-semibold mt-0.5 truncate ${
                companyData?.verificationStatus === 'approved' ? 'text-[#10AFA5]'
                  : companyData?.verificationStatus === 'rejected' ? 'text-red-500' : 'text-amber-600'
              }`}>
                {companyData?.verificationStatus === 'approved' ? 'Approved Partner'
                  : companyData?.verificationStatus === 'rejected' ? 'Verification Rejected' : 'Pending Approval'}
              </p>
            </div>
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-16 bg-white border-b border-[#E6F4F2] flex items-center justify-between px-4 sm:px-6 lg:px-8 z-30 shrink-0">
          <div className="flex items-center min-w-0">
            <button
              type="button"
              className="lg:hidden p-2 -ml-2 text-gray-600 hover:text-[#10AFA5] rounded-md"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open menu"
            >
              <FiMenu className="w-6 h-6" />
            </button>
            <h1 className="text-lg font-bold text-gray-800 ml-2 lg:ml-0 truncate">{titleFor(location.pathname)}</h1>
          </div>

          <div className="flex items-center gap-3 sm:gap-4">
            <button
              type="button"
              onClick={() => navigate('/b2b/notifications')}
              className="relative p-2 text-gray-500 hover:bg-gray-100 rounded-xl transition-colors"
              aria-label={unreadNotifs ? `Notifications, ${unreadNotifs} unread` : 'Notifications'}
            >
              <FiBell className="w-5 h-5" />
              {unreadNotifs > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[1.1rem] h-[1.1rem] px-1 bg-red-500 text-white text-[10px] font-bold rounded-full border-2 border-white flex items-center justify-center">
                  {unreadNotifs > 99 ? '99+' : unreadNotifs}
                </span>
              )}
            </button>

            <div className="relative">
              <button
                type="button"
                className="flex items-center gap-2 hover:bg-gray-50 p-1.5 rounded-xl transition-colors border border-transparent hover:border-gray-200"
                onClick={() => setProfileDropdownOpen((o) => !o)}
                aria-expanded={profileDropdownOpen}
              >
                {companyData?.logoUrl ? (
                  <img src={companyData.logoUrl} alt="" className="h-8 w-8 rounded-lg object-cover" />
                ) : (
                  <div className="h-8 w-8 rounded-lg bg-[#10AFA5]/10 flex items-center justify-center text-[#10AFA5] font-bold text-sm shrink-0">
                    {companyData?.companyName?.charAt(0) || 'C'}
                  </div>
                )}
                <div className="hidden md:block text-left max-w-[160px]">
                  <p className="text-sm font-bold text-gray-800 leading-tight truncate">{displayName}</p>
                  <p className="text-xs text-gray-500 truncate">
                    {principal?.accessRoleLabel ? `${principal.accessRoleLabel} · ` : ''}{companyData?.companyName}
                  </p>
                </div>
                <FiChevronDown className="w-4 h-4 text-gray-400 hidden md:block" />
              </button>

              <AnimatePresence>
                {profileDropdownOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setProfileDropdownOpen(false)} />
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      transition={{ duration: 0.15 }}
                      className="absolute right-0 mt-2 w-52 bg-white rounded-xl shadow-xl border border-gray-100 py-1 z-50 origin-top-right"
                    >
                      {can('company.manage') && (
                        <Link to="/b2b/company-profile" className="flex items-center px-4 py-2.5 text-sm text-gray-700 hover:bg-[#F0FDFA] hover:text-[#10AFA5]">
                          <FiUser className="mr-3 w-4 h-4" /> Company Profile
                        </Link>
                      )}
                      {can('users.manage') && (
                        <Link to="/b2b/users" className="flex items-center px-4 py-2.5 text-sm text-gray-700 hover:bg-[#F0FDFA] hover:text-[#10AFA5]">
                          <FiUsers className="mr-3 w-4 h-4" /> Users & Roles
                        </Link>
                      )}
                      <Link to="/b2b/notifications" className="flex items-center px-4 py-2.5 text-sm text-gray-700 hover:bg-[#F0FDFA] hover:text-[#10AFA5]">
                        <FiBell className="mr-3 w-4 h-4" /> Notifications
                      </Link>
                      {can('company.manage') && (
                        <Link to="/b2b/settings" className="flex items-center px-4 py-2.5 text-sm text-gray-700 hover:bg-[#F0FDFA] hover:text-[#10AFA5]">
                          <FiSettings className="mr-3 w-4 h-4" /> Settings
                        </Link>
                      )}
                      <div className="h-px bg-gray-100 my-1" />
                      <button
                        type="button"
                        onClick={handleLogout}
                        className="flex items-center w-full px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 text-left font-semibold"
                      >
                        <FiLogOut className="mr-3 w-4 h-4" /> Logout
                      </button>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 scrollbar-hide">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default B2BLayout;
