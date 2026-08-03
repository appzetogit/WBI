import React, { Suspense, useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import PageSkeleton from '../components/common/PageSkeleton';
import PublicRoute from '../components/auth/PublicRoute';

// Static import for customer portal to ensure instant loading without initial skeletons
import UserRoutes from '../modules/user/routes';

// Lazy loaded routes for bundle optimization
const AdminRoutes = React.lazy(() => import('../modules/admin/routes'));
const LandingPage = React.lazy(() => import('../modules/landing/pages/LandingPage'));
const VendorRoutes = React.lazy(() => import('../modules/vendor/routes'));
const WorkerRoutes = React.lazy(() => import('../modules/worker/routes'));
const EngineerRoutes = React.lazy(() => import('../modules/engineer/routes'));
const B2BRoutes = React.lazy(() => import('../modules/b2b/routes'));
const WorkerSignup = React.lazy(() => import('../modules/worker/pages/signup'));
const EngineerSignup = React.lazy(() => import('../modules/engineer/pages/signup'));

const signupPage = (userType, Component) => (
  <Suspense fallback={<PageSkeleton />}>
    <PublicRoute userType={userType}>
      <Component />
    </PublicRoute>
  </Suspense>
);

const AppRoutes = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const handleAuthRedirect = (e) => {
      if (e.detail && e.detail.path) {
        navigate(e.detail.path, { replace: true });
      }
    };

    window.addEventListener('auth:redirect', handleAuthRedirect);
    
    return () => window.removeEventListener('auth:redirect', handleAuthRedirect);
  }, [navigate]);

  return (
    <Routes>
      <Route path="/Home" element={<Suspense fallback={<PageSkeleton />}><LandingPage /></Suspense>} />
      <Route path="/" element={<Navigate to="/user" replace />} />
      <Route path="/user/*" element={<UserRoutes />} />
      <Route path="/vendor/*" element={<Suspense fallback={<PageSkeleton />}><VendorRoutes /></Suspense>} />
      <Route path="/worker/signup" element={signupPage('worker', WorkerSignup)} />
      <Route path="/engineer/signup" element={signupPage('engineer', EngineerSignup)} />
      <Route path="/worker/*" element={<Suspense fallback={<PageSkeleton />}><WorkerRoutes /></Suspense>} />
      <Route path="/engineer/*" element={<Suspense fallback={<PageSkeleton />}><EngineerRoutes /></Suspense>} />
      <Route path="/admin/*" element={<Suspense fallback={<PageSkeleton />}><AdminRoutes /></Suspense>} />
      <Route path="/b2b/*" element={<Suspense fallback={<PageSkeleton />}><B2BRoutes /></Suspense>} />

      {/* Typo catchers */}
      <Route path="/engineers/*" element={<Navigate to="/engineer" replace />} />
      <Route path="/workers/*" element={<Navigate to="/worker" replace />} />
      <Route path="/vendors/*" element={<Navigate to="/vendor" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export default AppRoutes;
