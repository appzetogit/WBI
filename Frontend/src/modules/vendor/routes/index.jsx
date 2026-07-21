import React, { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import AnimatedPage from '../../../components/common/AnimatedPage';
import VendorLayout from '../components/layout/VendorLayout';
import DigitalVendorLayout from '../components/layout/DigitalVendorLayout';
import ErrorBoundary from '../components/common/ErrorBoundary';
import ProtectedRoute from '../../../components/auth/ProtectedRoute';
import PublicRoute from '../../../components/auth/PublicRoute';
import CashLimitModal from '../components/common/CashLimitModal'; // Import
import GlobalBookingAlert from '../components/common/GlobalBookingAlert';
// import useAppNotifications from '../../../hooks/useAppNotifications.jsx'; // Handled globally

// Lazy load wrapper with retry for Vite chunk/HMR failures
const lazyLoad = (importFunc) => {
  return lazy(() => {
    return Promise.resolve(importFunc())
      .catch(async (error) => {
        console.error('Failed to load vendor page (retrying once):', error);
        // One retry helps after HMR / renamed modules
        try {
          await new Promise((r) => setTimeout(r, 300));
          return await importFunc();
        } catch (retryError) {
          console.error('Failed to load vendor page:', retryError);
          const message = retryError?.message || error?.message || 'Unknown load error';
          return {
            default: () => (
              <div className="flex items-center justify-center min-h-screen bg-white">
                <div className="text-center p-6 max-w-md">
                  <h2 className="text-xl font-bold text-gray-800 mb-2">Failed to load page</h2>
                  <p className="text-gray-600 mb-2">Please refresh the page or try again later.</p>
                  <p className="text-xs text-gray-400 mb-4 break-all">{message}</p>
                  <button
                    onClick={() => {
                      sessionStorage.removeItem('chunk_load_reloaded');
                      window.location.reload();
                    }}
                    className="px-6 py-3 rounded-xl text-white font-semibold transition-all duration-300 hover:opacity-90"
                    style={{ backgroundColor: '#347989' }}
                  >
                    Refresh Page
                  </button>
                </div>
              </div>
            ),
          };
        }
      });
  });
};

// Lazy load vendor pages for code splitting
const Login = lazyLoad(() => import('../pages/login'));
const Signup = lazyLoad(() => import('../pages/signup'));
const ForgotPassword = lazyLoad(() => import('../pages/ForgotPassword'));
const PendingApproval = lazyLoad(() => import('../pages/PendingApproval'));
const Dashboard = lazyLoad(() => import('../pages/Dashboard'));
const BookingAlert = lazyLoad(() => import('../pages/BookingAlert'));
const BookingAlerts = lazyLoad(() => import('../pages/BookingAlerts'));
const BookingDetails = lazyLoad(() => import('../pages/BookingDetails'));
const BookingTimeline = lazyLoad(() => import('../pages/BookingTimeline'));
const ActiveJobs = lazyLoad(() => import('../pages/ActiveJobs'));
const WorkersList = lazyLoad(() => import('../pages/WorkersList'));
const AddEditWorker = lazyLoad(() => import('../pages/AddEditWorker'));
const AssignWorker = lazyLoad(() => import('../pages/AssignWorker'));
const Earnings = lazyLoad(() => import('../pages/Earnings'));
const Wallet = lazyLoad(() => import('../pages/Wallet'));
const WithdrawalRequest = lazyLoad(() => import('../pages/WithdrawalRequest'));
const Profile = lazyLoad(() => import('../pages/Profile'));
const ProfileDetails = lazyLoad(() => import('../pages/Profile/ProfileDetails'));
const EditProfile = lazyLoad(() => import('../pages/Profile/EditProfile'));
const BookingMap = lazyLoad(() => import('../pages/BookingMap'));
const Settings = lazyLoad(() => import('../pages/Settings'));
const AddressManagement = lazyLoad(() => import('../pages/AddressManagement'));
const Notifications = lazyLoad(() => import('../pages/Notifications'));
const SettlementRequest = lazyLoad(() => import('../pages/Wallet/SettlementRequest'));
const SettlementHistory = lazyLoad(() => import('../pages/Wallet/SettlementHistory'));
const MyRatings = lazyLoad(() => import('../pages/MyRatings'));
const AboutWBI = lazyLoad(() => import('../pages/AboutWBI'));
const BillingPage = lazyLoad(() => import('../pages/BillingPage'));
const Projects = lazyLoad(() => import('../pages/Projects'));
const WorkOrders = lazyLoad(() => import('../pages/WorkOrders'));
const AmcContracts = lazyLoad(() => import('../pages/AmcContracts'));
const DigitalProfile = lazyLoad(() => import('../pages/Profile/DigitalProfile'));
const DigitalTeamEngineers = lazyLoad(() => import('../pages/WorkersList/DigitalTeamEngineers'));
const DigitalServices = lazyLoad(() => import('../pages/DigitalServices/DigitalServices'));

// ── WBI Project OS (standalone fullscreen — has its own sidebar) ───────────────
const ProjectOSList = lazyLoad(() => import('../../project-os/pages/ProjectList'));
const ProjectOSDashboard = lazyLoad(() => import('../../project-os/pages/ProjectDashboard'));

// ── NEW DYNAMIC PANEL ENGINE COMPONENTS ───────────────
const DynamicVendorLayout = lazyLoad(() => import('../components/layout/DynamicVendorLayout'));
const VendorHomeRedirect = lazyLoad(() => import('../components/VendorHomeRedirect'));
const LegacyDynamicRedirect = lazyLoad(() => import('../components/LegacyDynamicRedirect'));
const DynamicDashboard = lazyLoad(() => import('../pages/Dashboard/DynamicDashboard'));
const BusinessIntake = lazyLoad(() => import('../pages/BusinessIntake/BusinessIntake'));
const ClientsContracts = lazyLoad(() => import('../pages/ClientsContracts/ClientsContracts'));
const ProjectOperations = lazyLoad(() => import('../pages/ProjectOperations/ProjectOperations'));
const ProjectList = lazyLoad(() => import('../pages/ProjectOS/ProjectList'));
const ProjectDetails = lazyLoad(() => import('../pages/ProjectOS/ProjectDetails'));
const Workforce = lazyLoad(() => import('../pages/Workforce/Workforce'));
const Resources = lazyLoad(() => import('../pages/Resources/Resources'));
const QualityControl = lazyLoad(() => import('../pages/QualityControl/QualityControl'));
const Finance = lazyLoad(() => import('../pages/Finance/Finance'));
const Performance = lazyLoad(() => import('../pages/Performance/Performance'));
const Compliance = lazyLoad(() => import('../pages/Compliance/Compliance'));
const Support = lazyLoad(() => import('../pages/Support/Support'));

const LoadingFallback = () => (
  <div className="min-h-screen bg-[#F8FCFC]" />
);

const VendorRoutes = () => {
  const location = useLocation();
  return (
    <ErrorBoundary>
      <Suspense fallback={<LoadingFallback />}>
          <AnimatePresence mode="sync">
            <Routes location={location || undefined}>
            {/* Public routes */}
            <Route path="login" element={<AnimatedPage><PublicRoute userType="vendor"><Login /></PublicRoute></AnimatedPage>} />
            <Route path="signup" element={<AnimatedPage><PublicRoute userType="vendor"><Signup /></PublicRoute></AnimatedPage>} />
            <Route path="forgot-password" element={<AnimatedPage><PublicRoute userType="vendor"><ForgotPassword /></PublicRoute></AnimatedPage>} />
            <Route path="pending-approval" element={<AnimatedPage><PendingApproval /></AnimatedPage>} />

            {/* Base Redirect — resolve registered service slug from API */}
            <Route path="/" element={<VendorHomeRedirect suffix="dashboard" />} />

            {/* Digital Solution specific routes (Main Vendor Layout now) */}
            <Route element={<ProtectedRoute userType="vendor"><DigitalVendorLayout /></ProtectedRoute>}>
              <Route path="digital-solution/dashboard" element={<VendorHomeRedirect suffix="dashboard" />} />
              <Route path="digital-solution/my-profile" element={<AnimatedPage><DigitalProfile /></AnimatedPage>} />
              <Route path="digital-solution/booking-alerts" element={<AnimatedPage><BookingAlerts /></AnimatedPage>} />
              <Route path="digital-solution/booking-alert/:id" element={<AnimatedPage><BookingAlert /></AnimatedPage>} />
              <Route path="digital-solution/booking/:id" element={<AnimatedPage><BookingDetails /></AnimatedPage>} />
              <Route path="digital-solution/booking/:id/map" element={<AnimatedPage><BookingMap /></AnimatedPage>} />
              <Route path="digital-solution/booking/:id/billing" element={<AnimatedPage><BillingPage /></AnimatedPage>} />
              <Route path="digital-solution/booking/:id/timeline" element={<AnimatedPage><BookingTimeline /></AnimatedPage>} />
              <Route path="digital-solution/jobs" element={<AnimatedPage><ActiveJobs /></AnimatedPage>} />
              <Route path="digital-solution/engineers" element={<AnimatedPage><DigitalTeamEngineers /></AnimatedPage>} />
              <Route path="digital-solution/services" element={<AnimatedPage><DigitalServices /></AnimatedPage>} />
              <Route path="digital-solution/workers" element={<AnimatedPage><WorkersList /></AnimatedPage>} />
              <Route path="digital-solution/projects" element={<AnimatedPage><Projects /></AnimatedPage>} />
              <Route path="digital-solution/work-orders" element={<AnimatedPage><WorkOrders /></AnimatedPage>} />
              <Route path="digital-solution/amc" element={<AnimatedPage><AmcContracts /></AnimatedPage>} />
              <Route path="digital-solution/workers/add" element={<AnimatedPage><AddEditWorker /></AnimatedPage>} />
              <Route path="digital-solution/workers/:id/edit" element={<AnimatedPage><AddEditWorker /></AnimatedPage>} />
              <Route path="digital-solution/booking/:id/assign-worker" element={<AnimatedPage><AssignWorker /></AnimatedPage>} />
              <Route path="digital-solution/earnings" element={<AnimatedPage><Earnings /></AnimatedPage>} />
              <Route path="digital-solution/wallet" element={<AnimatedPage><Wallet /></AnimatedPage>} />
              <Route path="digital-solution/wallet/withdraw" element={<AnimatedPage><WithdrawalRequest /></AnimatedPage>} />
              <Route path="digital-solution/wallet/settle" element={<AnimatedPage><SettlementRequest /></AnimatedPage>} />
              <Route path="digital-solution/wallet/settlements" element={<AnimatedPage><SettlementHistory /></AnimatedPage>} />
              <Route path="digital-solution/profile" element={<AnimatedPage><Profile /></AnimatedPage>} />
              <Route path="digital-solution/profile/details" element={<AnimatedPage><ProfileDetails /></AnimatedPage>} />
              <Route path="digital-solution/profile/edit" element={<AnimatedPage><EditProfile /></AnimatedPage>} />
              <Route path="digital-solution/settings" element={<AnimatedPage><Settings /></AnimatedPage>} />
              <Route path="digital-solution/address-management" element={<AnimatedPage><AddressManagement /></AnimatedPage>} />
              <Route path="digital-solution/notifications" element={<AnimatedPage><Notifications /></AnimatedPage>} />
              <Route path="digital-solution/my-ratings" element={<AnimatedPage><MyRatings /></AnimatedPage>} />
              <Route path="digital-solution/reviews" element={<AnimatedPage><MyRatings /></AnimatedPage>} />
              <Route path="digital-solution/support" element={<AnimatedPage><AboutWBI /></AnimatedPage>} />
              <Route path="digital-solution/about-wbi" element={<AnimatedPage><AboutWBI /></AnimatedPage>} />
              <Route path="digital-solution/*" element={<VendorHomeRedirect suffix="dashboard" />} />
            </Route>

            {/* ── Project OS — standalone (no VendorLayout wrapper) ─────── */}
            <Route path="project-os" element={<ProtectedRoute userType="vendor"><ProjectOSList /></ProtectedRoute>} />
            <Route path="project-os/:id/*" element={<ProtectedRoute userType="vendor"><ProjectOSDashboard /></ProtectedRoute>} />

            {/* Legacy /vendor/dynamic/* → service-slug portal */}
            <Route path="dynamic/*" element={<ProtectedRoute userType="vendor"><LegacyDynamicRedirect /></ProtectedRoute>} />

            {/* ── Service-specific portal: /vendor/:serviceSlug/... ─────── */}
            <Route path=":serviceSlug" element={<ProtectedRoute userType="vendor"><DynamicVendorLayout /></ProtectedRoute>}>
              <Route index element={<Navigate to="dashboard" replace />} />
              <Route path="dashboard" element={<AnimatedPage><DynamicDashboard /></AnimatedPage>} />
              <Route path="business-intake/*" element={<AnimatedPage><BusinessIntake /></AnimatedPage>} />
              <Route path="clients/*" element={<AnimatedPage><ClientsContracts /></AnimatedPage>} />
              <Route path="projects/*" element={<AnimatedPage><ProjectOperations /></AnimatedPage>} />
              <Route path="workforce/*" element={<AnimatedPage><Workforce /></AnimatedPage>} />
              <Route path="resources/*" element={<AnimatedPage><Resources /></AnimatedPage>} />
              <Route path="quality/*" element={<AnimatedPage><QualityControl /></AnimatedPage>} />
              <Route path="finance/*" element={<AnimatedPage><Finance /></AnimatedPage>} />
              <Route path="performance/*" element={<AnimatedPage><Performance /></AnimatedPage>} />
              <Route path="compliance/*" element={<AnimatedPage><Compliance /></AnimatedPage>} />
              <Route path="notifications/*" element={<AnimatedPage><Notifications /></AnimatedPage>} />
              <Route path="support/*" element={<AnimatedPage><Support /></AnimatedPage>} />
              <Route path="settings/*" element={<AnimatedPage><Settings /></AnimatedPage>} />
            </Route>

            {/* Fallbacks for old flat routes */}
            <Route path="dashboard" element={<VendorHomeRedirect suffix="dashboard" />} />
            <Route path="projects" element={<VendorHomeRedirect suffix="projects" />} />
            <Route path="engineers" element={<VendorHomeRedirect suffix="workforce" />} />
            <Route path="work-orders" element={<VendorHomeRedirect suffix="projects" />} />
            <Route path="earnings" element={<VendorHomeRedirect suffix="finance" />} />
            <Route path="settings" element={<VendorHomeRedirect suffix="settings" />} />
            <Route path="notifications" element={<VendorHomeRedirect suffix="notifications" />} />
            <Route path="reviews" element={<VendorHomeRedirect suffix="performance" />} />
            <Route path="support" element={<VendorHomeRedirect suffix="support" />} />
            <Route path="*" element={<VendorHomeRedirect suffix="dashboard" />} />
          </Routes>
            </AnimatePresence>
      </Suspense>
    </ErrorBoundary>
  );
};

export default VendorRoutes;
