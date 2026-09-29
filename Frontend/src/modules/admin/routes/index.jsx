import React, { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import AdminLayout from '../components/layout/AdminLayout';
import ProtectedRoute from '../../../components/auth/ProtectedRoute';
import PublicRoute from '../../../components/auth/PublicRoute';
import useAppNotifications from '../../../hooks/useAppNotifications.jsx';
import { AnimatePresence } from 'framer-motion';
import AnimatedPage from '../../../components/common/AnimatedPage';

// Login page (not lazy loaded for faster initial access)
import Login from '../pages/login';
import ForgotPassword from '../pages/ForgotPassword';

// Lazy load admin pages for code splitting
const Dashboard = lazy(() => import('../pages/Dashboard'));
const Settings = lazy(() => import('../pages/Settings'));
const ControlCenter = lazy(() => import('../pages/ControlCenter'));
const UserCategories = lazy(() => import('../pages/UserCategories'));
const ServiceCategories = lazy(() => import('../pages/ServiceCategories'));
const OneTimeServices = lazy(() => import('../pages/OneTimeServices'));
const OneTimeServiceDetail = lazy(() => import('../pages/OneTimeServices/OneTimeServiceDetail'));
const Banners = lazy(() => import('../pages/Banners'));
const SubServices = lazy(() => import('../pages/SubServices'));
const Users = lazy(() => import('../pages/Users'));
const Vendors = lazy(() => import('../pages/Vendors'));
const Workers = lazy(() => import('../pages/Workers'));
const Engineers = lazy(() => import('../pages/Engineers'));
const Bookings = lazy(() => import('../pages/Bookings'));
const BookingTracking = lazy(() => import('../pages/Bookings/Tracking'));
const BookingNotifications = lazy(() => import('../pages/Bookings/BookingNotifications'));
const Payments = lazy(() => import('../pages/Payments'));
const Reports = lazy(() => import('../pages/Reports'));
const Notifications = lazy(() => import('../pages/Notifications'));
const B2BAdmin = lazy(() => import('../pages/B2B'));

const Plans = lazy(() => import('../pages/Plans/Plans'));
const Scrap = lazy(() => import('../pages/Scrap'));
const Reviews = lazy(() => import('../pages/Reviews'));
const TrustVideos = lazy(() => import('../pages/TrustVideos'));
const HomeContentManagement = lazy(() => import('../pages/HomeContent'));
const CmsContentManagement = lazy(() => import('../pages/CmsContent'));
const WebEnquiries = lazy(() => import('../pages/WebEnquiries'));
const AppEnquiries = lazy(() => import('../pages/AppEnquiries'));
const CrmEnquiries = lazy(() => import('../pages/CrmEnquiries'));
const MarketingEnquiries = lazy(() => import('../pages/MarketingEnquiries'));
const DesignEnquiries = lazy(() => import('../pages/DesignEnquiries'));
const BankingEnquiries = lazy(() => import('../pages/BankingEnquiries'));
const InstallationEnquiries = lazy(() => import('../pages/InstallationEnquiries'));
const MaintenanceEnquiries = lazy(() => import('../pages/MaintenanceEnquiries'));
const BreakdownEnquiries = lazy(() => import('../pages/BreakdownEnquiries'));
const SiteTestingEnquiries = lazy(() => import('../pages/SiteTestingEnquiries'));
const PowerMonitoringEnquiries = lazy(() => import('../pages/PowerMonitoringEnquiries'));
const MultipleServicesEnquiries = lazy(() => import('../pages/MultipleServicesEnquiries'));
const AtmServiceEnquiries = lazy(() => import('../pages/AtmServiceEnquiries'));
const AtmCassetteServices = lazy(() => import('../pages/AtmCassetteServices'));
const PassbookPrinterServices = lazy(() => import('../pages/PassbookPrinterServices'));
const CdmServices = lazy(() => import('../pages/CdmServices'));
const PosServices = lazy(() => import('../pages/PosServices'));
const VsatServices = lazy(() => import('../pages/VsatServices'));
const BarcodeReaderServices = lazy(() => import('../pages/BarcodeReaderServices'));

// Energy Solutions
const DgServices = lazy(() => import('../pages/DgServices'));
const BatteryServices = lazy(() => import('../pages/BatteryServices'));
const UpsBatteryServices = lazy(() => import('../pages/UpsBatteryServices'));
const EvServices = lazy(() => import('../pages/EvServices'));
const AcPowerServices = lazy(() => import('../pages/AcPowerServices'));
const DcPowerServices = lazy(() => import('../pages/DcPowerServices'));
const PowerTestingServices = lazy(() => import('../pages/PowerTestingServices'));

// Healthcare
const MedicalEquipmentEnquiries = lazy(() => import('../pages/MedicalEquipmentEnquiries'));
const QualityControlTestEnquiries = lazy(() => import('../pages/QualityControlTestEnquiries'));
const ElectricalSafetyTestEnquiries = lazy(() => import('../pages/ElectricalSafetyTestEnquiries'));
const HcPreventiveMaintenanceEnquiries = lazy(() => import('../pages/HcPreventiveMaintenanceEnquiries'));
const HcAmcEnquiries = lazy(() => import('../pages/HcAmcEnquiries'));

const LoadingFallback = () => (
  <div className="min-h-screen bg-[#F8FCFC]" />
);

/** Preserve sub-path when moving legacy admin URLs into hub sections */
const LegacyAdminRedirect = ({ fromPrefix, toPrefix }) => {
  const { pathname } = useLocation();
  if (!pathname.startsWith(fromPrefix)) {
    return <Navigate to={toPrefix} replace />;
  }
  const suffix = pathname.slice(fromPrefix.length);
  return <Navigate to={`${toPrefix}${suffix}`} replace />;
};

const AdminRoutes = () => {
  const location = useLocation();
  // Enable global notifications for admin
  // Global notifications are now handled by SocketProvider at App level
  // useAppNotifications('admin');

  return (
    <AnimatePresence mode="wait">
      <Routes location={location || undefined}>
        {/* Login route - outside of layout (public) */}
        <Route path="/login" element={<AnimatedPage><PublicRoute userType="admin"><Login /></PublicRoute></AnimatedPage>} />
        <Route path="/forgot-password" element={<AnimatedPage><PublicRoute userType="admin"><ForgotPassword /></PublicRoute></AnimatedPage>} />

        {/* Protected routes - inside layout */}
        <Route path="/" element={
          <ProtectedRoute userType="admin">
            <AdminLayout />
          </ProtectedRoute>
        }>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<AnimatedPage><Dashboard /></AnimatedPage>} />
          <Route path="users/*" element={<AnimatedPage><Users /></AnimatedPage>} />
          <Route path="vendors/*" element={<AnimatedPage><Vendors /></AnimatedPage>} />
          <Route path="workers/*" element={<AnimatedPage><Workers /></AnimatedPage>} />
          <Route path="engineers/*" element={<AnimatedPage><Engineers /></AnimatedPage>} />
          <Route path="bookings" element={<AnimatedPage><Bookings /></AnimatedPage>} />
          <Route path="bookings/tracking" element={<AnimatedPage><BookingTracking /></AnimatedPage>} />
          <Route path="bookings/notifications" element={<AnimatedPage><BookingNotifications /></AnimatedPage>} />
          <Route path="user-categories/*" element={<AnimatedPage><UserCategories /></AnimatedPage>} />
          <Route path="service-categories/*" element={<AnimatedPage><ServiceCategories /></AnimatedPage>} />
          <Route path="one-time-services" element={<AnimatedPage><OneTimeServices /></AnimatedPage>} />
          <Route path="one-time-services/:id" element={<AnimatedPage><OneTimeServiceDetail /></AnimatedPage>} />
          <Route path="banners" element={<AnimatedPage><Banners /></AnimatedPage>} />
          <Route path="sub-services/*" element={<AnimatedPage><SubServices /></AnimatedPage>} />
          <Route path="payments/*" element={<AnimatedPage><Payments /></AnimatedPage>} />
          <Route path="reports/*" element={<AnimatedPage><Reports /></AnimatedPage>} />
          <Route path="notifications/*" element={<AnimatedPage><Notifications /></AnimatedPage>} />
          <Route path="scrap" element={<AnimatedPage><Scrap /></AnimatedPage>} />
          <Route path="plans" element={<AnimatedPage><Plans /></AnimatedPage>} />
          <Route path="reviews" element={<AnimatedPage><Reviews /></AnimatedPage>} />
          <Route path="trust-videos" element={<AnimatedPage><TrustVideos /></AnimatedPage>} />
          <Route path="home-content" element={<AnimatedPage><HomeContentManagement /></AnimatedPage>} />
          <Route path="cms-content" element={<AnimatedPage><CmsContentManagement /></AnimatedPage>} />
          <Route path="web-enquiries" element={<AnimatedPage><WebEnquiries /></AnimatedPage>} />
          <Route path="app-enquiries" element={<AnimatedPage><AppEnquiries /></AnimatedPage>} />
          <Route path="crm-enquiries" element={<AnimatedPage><CrmEnquiries /></AnimatedPage>} />
          <Route path="marketing-enquiries" element={<AnimatedPage><MarketingEnquiries /></AnimatedPage>} />
          <Route path="design-enquiries" element={<AnimatedPage><DesignEnquiries /></AnimatedPage>} />
          <Route path="banking-enquiries" element={<AnimatedPage><BankingEnquiries /></AnimatedPage>} />
          
          <Route path="security-solutions/installation" element={<AnimatedPage><InstallationEnquiries /></AnimatedPage>} />
          <Route path="security-solutions/maintenance" element={<AnimatedPage><MaintenanceEnquiries /></AnimatedPage>} />
          <Route path="security-solutions/breakdown" element={<AnimatedPage><BreakdownEnquiries /></AnimatedPage>} />
          <Route path="security-solutions/testing" element={<AnimatedPage><SiteTestingEnquiries /></AnimatedPage>} />
          <Route path="security-solutions/panel-installation" element={<AnimatedPage><MultipleServicesEnquiries /></AnimatedPage>} />
          <Route path="security-solutions/monitoring" element={<AnimatedPage><PowerMonitoringEnquiries /></AnimatedPage>} />
          <Route path="banking-solutions/atm-service" element={<AnimatedPage><AtmServiceEnquiries /></AnimatedPage>} />
          <Route path="banking-solutions/atm-cassette-service" element={<AnimatedPage><AtmCassetteServices /></AnimatedPage>} />
          <Route path="banking-solutions/passbook-printer-service" element={<AnimatedPage><PassbookPrinterServices /></AnimatedPage>} />
          <Route path="banking-solutions/cdm-service" element={<AnimatedPage><CdmServices /></AnimatedPage>} />
          <Route path="banking-solutions/pos-service" element={<AnimatedPage><PosServices /></AnimatedPage>} />
          <Route path="banking-solutions/vsat-service" element={<AnimatedPage><VsatServices /></AnimatedPage>} />
          <Route path="banking-solutions/barcode-reader-service" element={<AnimatedPage><BarcodeReaderServices /></AnimatedPage>} />

          <Route path="energy-solutions/dg-services" element={<AnimatedPage><DgServices /></AnimatedPage>} />
          <Route path="energy-solutions/battery-services" element={<AnimatedPage><BatteryServices /></AnimatedPage>} />
          <Route path="energy-solutions/ups-battery-services" element={<AnimatedPage><UpsBatteryServices /></AnimatedPage>} />
          <Route path="energy-solutions/ev-services" element={<AnimatedPage><EvServices /></AnimatedPage>} />
          <Route path="energy-solutions/ac-power-services" element={<AnimatedPage><AcPowerServices /></AnimatedPage>} />
          <Route path="energy-solutions/dc-power-services" element={<AnimatedPage><DcPowerServices /></AnimatedPage>} />
          <Route path="energy-solutions/power-testing-services" element={<AnimatedPage><PowerTestingServices /></AnimatedPage>} />

          <Route path="healthcare-solutions/medical-equipment" element={<AnimatedPage><MedicalEquipmentEnquiries /></AnimatedPage>} />
          <Route path="healthcare-solutions/qc-test" element={<AnimatedPage><QualityControlTestEnquiries /></AnimatedPage>} />
          <Route path="healthcare-solutions/safety-test" element={<AnimatedPage><ElectricalSafetyTestEnquiries /></AnimatedPage>} />
          <Route path="healthcare-solutions/preventive-maintenance" element={<AnimatedPage><HcPreventiveMaintenanceEnquiries /></AnimatedPage>} />
          <Route path="healthcare-solutions/amc" element={<AnimatedPage><HcAmcEnquiries /></AnimatedPage>} />

          <Route path="b2b/*" element={<AnimatedPage><B2BAdmin /></AnimatedPage>} />
          <Route path="b2b-companies" element={<Navigate to="/admin/b2b/companies" replace />} />
          <Route path="verifications/*" element={<Navigate to="/admin/workers/verifications" replace />} />
          <Route path="project-templates/*" element={<LegacyAdminRedirect fromPrefix="/admin/project-templates" toPrefix="/admin/vendors/project-templates" />} />
          <Route path="form-builder" element={<Navigate to="/admin/vendors/form-builder" replace />} />
          <Route path="form-builder/*" element={<Navigate to="/admin/vendors/form-builder" replace />} />
          <Route path="assignment-config" element={<Navigate to="/admin/vendors/assignment-engine" replace />} />
          <Route path="settlements/*" element={<LegacyAdminRedirect fromPrefix="/admin/settlements" toPrefix="/admin/vendors/settlements" />} />
          <Route path="user-categories/vendor-services" element={<Navigate to="/admin/vendors/services-catalog" replace />} />
          <Route path="user-categories/vendor-parts" element={<Navigate to="/admin/vendors/parts-catalog" replace />} />
          <Route path="payments/workers" element={<Navigate to="/admin/workers/payments" replace />} />
          <Route path="payments/vendors" element={<Navigate to="/admin/vendors/payments" replace />} />
          <Route path="settings/*" element={<AnimatedPage><Settings /></AnimatedPage>} />
          <Route path="control-center/*" element={<AnimatedPage><ControlCenter /></AnimatedPage>} />
        </Route>
      </Routes>
    </AnimatePresence>
  );
};

export default AdminRoutes;


