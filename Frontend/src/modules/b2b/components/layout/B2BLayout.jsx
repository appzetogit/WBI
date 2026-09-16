import React, { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  FiHome, FiUploadCloud, FiBriefcase, FiMap, FiCreditCard, 
  FiFileText, FiPieChart, FiHelpCircle, FiSettings, FiUser,
  FiMenu, FiX, FiBell, FiChevronDown, FiLogOut, FiUsers
} from 'react-icons/fi';
import Logo from '../../../../components/common/Logo';
import toast from 'react-hot-toast';
import PrefetchLink from '../../../../components/common/PrefetchLink';

const navItems = [
  { name: 'Dashboard', path: '/b2b/dashboard', icon: FiHome },
  { name: 'Enterprise Onboarding', path: '/b2b/onboarding', icon: FiFileText, onboardingOnly: true },
  { 
    name: 'Bulk Jobs', 
    path: '/b2b/bulk-jobs', 
    icon: FiUploadCloud,
    subItems: [
      { name: 'Upload Jobs', path: '/b2b/bulk-jobs/upload' },
      { name: 'Upload History', path: '/b2b/bulk-jobs/history' }
    ]
  },
  { name: 'My Jobs', path: '/b2b/jobs', icon: FiBriefcase },
  { name: 'Wallet & Payments', path: '/b2b/wallet', icon: FiCreditCard },
  { name: 'Reports', path: '/b2b/reports', icon: FiPieChart },
  { name: 'Notifications', path: '/b2b/notifications', icon: FiBell },
  { name: 'Company Profile', path: '/b2b/company-profile', icon: FiUser },
  { name: 'Settings', path: '/b2b/settings', icon: FiSettings },
  { name: 'Logout', path: '#logout', icon: FiLogOut }
];

const B2BLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [companyData, setCompanyData] = useState(null);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [unreadNotifs, setUnreadNotifs] = useState(0);
  const location = useLocation();
  const navigate = useNavigate();
  const [bulkJobsOpen, setBulkJobsOpen] = useState(location.pathname.startsWith('/b2b/bulk-jobs'));

  useEffect(() => {
    if (location.pathname.startsWith('/b2b/bulk-jobs')) {
      setBulkJobsOpen(true);
    }
  }, [location.pathname]);

  useEffect(() => {
    const data = localStorage.getItem('b2bData') || sessionStorage.getItem('b2bData');
    if (data) {
      setCompanyData(JSON.parse(data));
    } else {
      navigate('/b2b/login');
    }

    // Sync latest status from server
    let active = true;
    (async () => {
      try {
        const api = (await import('../../../../services/api')).default;
        const res = await api.get('/b2b/me');
        if (active && res.data?.company) {
          const fresh = res.data.company;
          setCompanyData((prev) => ({ ...prev, ...fresh }));
          if (localStorage.getItem('b2bData')) {
            const existing = JSON.parse(localStorage.getItem('b2bData') || '{}');
            localStorage.setItem('b2bData', JSON.stringify({ ...existing, ...fresh }));
          } else if (sessionStorage.getItem('b2bData')) {
            const existing = JSON.parse(sessionStorage.getItem('b2bData') || '{}');
            sessionStorage.setItem('b2bData', JSON.stringify({ ...existing, ...fresh }));
          }
        }
      } catch (err) {
        // Ignored if unauthenticated or error
      }
    })();

    return () => { active = false; };
  }, [navigate]);

  useEffect(() => {
    let cancelled = false;
    const loadUnread = async () => {
      try {
        const api = (await import('../../../../services/api')).default;
        const res = await api.get('/notifications/b2b', { params: { limit: 1 } });
        if (!cancelled) setUnreadNotifs(res.data?.unreadCount || 0);
      } catch {
        if (!cancelled) setUnreadNotifs(0);
      }
    };
    loadUnread();
    const onUpd = () => loadUnread();
    window.addEventListener('b2bNotificationsUpdated', onUpd);
    const t = setInterval(loadUnread, 60000);
    return () => {
      cancelled = true;
      window.removeEventListener('b2bNotificationsUpdated', onUpd);
      clearInterval(t);
    };
  }, [location.pathname]);

  // Close sidebar on mobile when route changes
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  const handleLogout = () => {
    localStorage.removeItem('b2bAccessToken');
    localStorage.removeItem('b2bRefreshToken');
    localStorage.removeItem('b2bData');
    sessionStorage.removeItem('b2bAccessToken');
    sessionStorage.removeItem('b2bRefreshToken');
    sessionStorage.removeItem('b2bData');
    toast.success('Logged out successfully');
    navigate('/b2b/login');
  };

  const isOnboardingDone = companyData?.lifecycleStatus === 'active' || (companyData?.status === 'active' && companyData?.onboardingStatus === 'completed');
  const visibleNavItems = navItems.filter((item) => {
    if (item.onboardingOnly && isOnboardingDone && !location.pathname.startsWith('/b2b/onboarding')) {
      return false;
    }
    return true;
  });

  return (
    <div className="flex h-screen bg-[#F0FDFA] overflow-hidden font-sans">
      
      {/* Mobile Sidebar Overlay */}
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
      <div className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-[#E6F4F2] flex flex-col transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:inset-auto ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        
        {/* Sidebar Header */}
        <div className="h-16 flex items-center px-6 border-b border-[#E6F4F2]">
          <Logo className="h-8" />
          <span className="ml-2 font-bold text-gray-800 text-base tracking-wide">B2B Platform</span>
        </div>

        {/* Sidebar Navigation */}
        <div className="flex-1 overflow-y-auto py-4 scrollbar-hide">
          <nav className="space-y-1 px-3">
            {visibleNavItems.map((item) => {
              if (item.path === '#logout') {
                return (
                  <button
                    key={item.name}
                    onClick={handleLogout}
                    className="w-full flex items-center px-4 py-2.5 rounded-xl transition-all text-red-600 hover:bg-red-50 text-left font-semibold cursor-pointer"
                  >
                    <item.icon className="w-5 h-5 mr-3 text-red-500" />
                    <span className="text-sm font-semibold">{item.name}</span>
                  </button>
                );
              }

              if (item.subItems) {
                const isParentActive = location.pathname.startsWith(item.path);
                return (
                  <div key={item.name} className="space-y-1">
                    <button
                      onClick={() => setBulkJobsOpen(!bulkJobsOpen)}
                      className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl transition-all group font-semibold cursor-pointer ${
                        isParentActive 
                          ? 'bg-[#10AFA5]/10 text-[#10AFA5]' 
                          : 'text-gray-600 hover:bg-[#F0FDFA] hover:text-[#10AFA5]'
                      }`}
                    >
                      <div className="flex items-center">
                        <item.icon className={`w-5 h-5 mr-3 transition-colors ${isParentActive ? 'text-[#10AFA5]' : 'text-gray-400 group-hover:text-[#10AFA5]'}`} />
                        <span className="text-sm font-semibold">{item.name}</span>
                      </div>
                      <FiChevronDown className={`w-4 h-4 transition-transform duration-200 ${bulkJobsOpen ? 'rotate-180' : ''}`} />
                    </button>
                    
                    <AnimatePresence initial={false}>
                      {bulkJobsOpen && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden pl-4 space-y-1"
                        >
                          {item.subItems.map((sub) => {
                            const isSubActive = location.pathname === sub.path || (sub.path === '/b2b/bulk-jobs/upload' && location.pathname === '/b2b/bulk-jobs');
                            return (
                              <PrefetchLink
                                key={sub.name}
                                to={sub.path}
                                className={`flex items-center px-4 py-2 rounded-lg transition-all text-xs font-semibold ${
                                  isSubActive 
                                    ? 'bg-[#10AFA5] text-white shadow-sm shadow-[#10AFA5]/10' 
                                    : 'text-gray-500 hover:bg-[#F0FDFA] hover:text-[#10AFA5]'
                                }`}
                              >
                                <span className="w-1.5 h-1.5 rounded-full mr-2 bg-current shrink-0" />
                                {sub.name}
                              </PrefetchLink>
                            );
                          })}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              }

              const isActive = location.pathname === item.path || (item.path !== '/b2b/dashboard' && location.pathname.startsWith(item.path));
              return (
                <PrefetchLink
                  key={item.name}
                  to={item.path}
                  className={`flex items-center justify-between px-4 py-2.5 rounded-xl transition-all group ${
                    isActive 
                      ? 'bg-[#10AFA5] text-white shadow-md shadow-[#10AFA5]/10' 
                      : 'text-gray-600 hover:bg-[#F0FDFA] hover:text-[#10AFA5]'
                  }`}
                >
                  <div className="flex items-center min-w-0">
                    <item.icon className={`w-5 h-5 mr-3 shrink-0 transition-colors ${isActive ? 'text-white' : 'text-gray-400 group-hover:text-[#10AFA5]'}`} />
                    <span className="text-sm font-semibold truncate">{item.name}</span>
                  </div>
                  {item.onboardingOnly && !isOnboardingDone && (
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ml-1.5 shrink-0 ${
                      isActive ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-700'
                    }`}>
                      Pending
                    </span>
                  )}
                </PrefetchLink>
              );
            })}
          </nav>
        </div>

        {/* Sidebar Footer (Profile Summary) */}
        <div className="p-4 border-t border-[#E6F4F2]">
          <div 
            onClick={() => navigate('/b2b/company-profile')}
            className="flex items-center border border-gray-100 rounded-xl p-3 cursor-pointer hover:border-[#10AFA5]/30 transition-colors bg-gray-50"
          >
            {companyData?.logoUrl ? (
              <img src={companyData.logoUrl} alt="Logo" className="h-10 w-10 rounded-xl object-cover border border-gray-200" />
            ) : (
              <div className="h-10 w-10 rounded-xl bg-[#10AFA5]/10 flex items-center justify-center text-[#10AFA5] font-bold text-base shrink-0">
                {companyData?.companyName?.charAt(0) || 'C'}
              </div>
            )}
            <div className="ml-3 overflow-hidden">
              <p className="text-sm font-bold text-gray-800 truncate">{companyData?.companyName || 'Company Name'}</p>
              <p className={`text-xs font-semibold mt-0.5 truncate ${
                companyData?.verificationStatus === 'approved' ? 'text-[#10AFA5]' :
                companyData?.verificationStatus === 'rejected' ? 'text-red-500' : 'text-amber-600'
              }`}>
                {companyData?.verificationStatus === 'approved' ? 'Approved Partner' :
                 companyData?.verificationStatus === 'rejected' ? 'Verification Rejected' :
                 'Pending Approval'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        
        {/* Top Header */}
        <header className="h-16 bg-white border-b border-[#E6F4F2] flex items-center justify-between px-6 lg:px-8 z-30 shrink-0">
          
          <div className="flex items-center">
            <button 
              className="lg:hidden p-2 -ml-2 text-gray-600 hover:text-[#10AFA5] rounded-md"
              onClick={() => setSidebarOpen(true)}
            >
              <FiMenu className="w-6 h-6" />
            </button>
            <h1 className="text-lg font-bold text-gray-800 ml-2 lg:ml-0">
              {navItems.find(item => item.path === location.pathname)?.name || 'B2B Panel'}
            </h1>
          </div>

          <div className="flex items-center gap-4">
            
            {/* Notification Icon */}
            <button
              type="button"
              onClick={() => navigate('/b2b/notifications')}
              className="relative p-2 text-gray-500 hover:bg-gray-100 rounded-xl transition-colors"
              aria-label="Notifications"
            >
              <FiBell className="w-5 h-5" />
              {unreadNotifs > 0 && (
                <span className="absolute top-1.5 right-1.5 min-w-[0.625rem] h-2.5 px-0.5 bg-red-500 rounded-full border-2 border-white" />
              )}
            </button>

            {/* Profile Dropdown */}
            <div className="relative">
              <button 
                className="flex items-center gap-2 hover:bg-gray-50 p-1.5 rounded-xl transition-colors border border-transparent hover:border-gray-200"
                onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
              >
                {companyData?.logoUrl ? (
                  <img src={companyData.logoUrl} alt="Logo" className="h-8 w-8 rounded-lg object-cover" />
                ) : (
                  <div className="h-8 w-8 rounded-lg bg-[#10AFA5]/10 flex items-center justify-center text-[#10AFA5] font-bold text-sm shrink-0">
                    {companyData?.companyName?.charAt(0) || 'C'}
                  </div>
                )}
                <div className="hidden md:block text-left max-w-[120px]">
                  <p className="text-sm font-bold text-gray-800 leading-tight truncate">{companyData?.authorizedPerson?.name || 'Contact'}</p>
                  <p className="text-xs text-gray-500 truncate">{companyData?.companyName}</p>
                </div>
                <FiChevronDown className="w-4 h-4 text-gray-400 hidden md:block" />
              </button>

              <AnimatePresence>
                {profileDropdownOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setProfileDropdownOpen(false)}></div>
                    <motion.div 
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      transition={{ duration: 0.15 }}
                      className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-xl border border-gray-100 py-1 z-50 origin-top-right"
                    >
                      <Link to="/b2b/company-profile" className="flex items-center px-4 py-2.5 text-sm text-gray-700 hover:bg-[#F0FDFA] hover:text-[#10AFA5]">
                        <FiUser className="mr-3 w-4 h-4" /> Company Profile
                      </Link>
                      <Link to="/b2b/settings" className="flex items-center px-4 py-2.5 text-sm text-gray-700 hover:bg-[#F0FDFA] hover:text-[#10AFA5]">
                        <FiSettings className="mr-3 w-4 h-4" /> Settings
                      </Link>
                      <div className="h-px bg-gray-100 my-1"></div>
                      <button 
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

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-6 scrollbar-hide">
          <Outlet />
        </main>
        
      </div>
    </div>
  );
};

export default B2BLayout;
