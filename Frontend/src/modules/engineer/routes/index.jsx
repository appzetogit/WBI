import React, { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';

import BottomNav from '../components/layout/BottomNav';
import ErrorBoundary from '../components/common/ErrorBoundary';
import ProtectedRoute from '../../../components/auth/ProtectedRoute';
import PublicRoute from '../../../components/auth/PublicRoute';
import LogoLoader from '../../../components/common/LogoLoader';
import GlobalWorkerJobAlert from '../components/common/GlobalWorkerJobAlert';

const Login = lazy(() => import('../pages/login'));
const ForgotPassword = lazy(() => import('../pages/ForgotPassword'));
const Dashboard = lazy(() => import('../pages/Dashboard'));
const AssignedJobs = lazy(() => import('../pages/AssignedJobs'));
const JobDetails = lazy(() => import('../pages/JobDetails'));
const JobProgress = lazy(() => import('../pages/JobProgress'));
const Profile = lazy(() => import('../pages/Profile'));
const EditProfile = lazy(() => import('../pages/Profile/EditProfile'));
const PersonalInfo = lazy(() => import('../pages/Profile/PersonalInfo'));
const BankDetails = lazy(() => import('../pages/Profile/BankDetails'));
const Documents = lazy(() => import('../pages/Profile/Documents'));
const WorkLocations = lazy(() => import('../pages/Profile/WorkLocations'));
const Skills = lazy(() => import('../pages/Profile/Skills'));
const SubServices = lazy(() => import('../pages/Profile/SubServices'));
const NotificationSettings = lazy(() => import('../pages/Profile/NotificationSettings'));
const Support = lazy(() => import('../pages/Profile/Support'));
const Settings = lazy(() => import('../pages/Settings'));
const Notifications = lazy(() => import('../pages/Notifications'));
const JobMap = lazy(() => import('../pages/JobMap'));
const JobTimeline = lazy(() => import('../pages/JobTimeline'));
const JobSuccess = lazy(() => import('../pages/JobSuccess'));
const Projects = lazy(() => import('../pages/Projects'));
const ProjectDetails = lazy(() => import('../pages/ProjectDetails'));
const ProjectMilestones = lazy(() => import('../pages/ProjectMilestones'));
const SubmitMilestone = lazy(() => import('../pages/SubmitMilestone'));
const ProjectUnderReview = lazy(() => import('../pages/ProjectUnderReview'));
const Wallet = lazy(() => import('../pages/Wallet'));
const BillingPage = lazy(() => import('../pages/BillingPage'));
const Schedule = lazy(() => import('../pages/Schedule'));
const Proposals = lazy(() => import('../pages/Proposals'));
const B2BJobs = lazy(() => import('../pages/B2BJobs'));
const OpsJobs = lazy(() => import('../pages/OpsJobs'));
const OpsJobDetail = lazy(() => import('../pages/OpsJobs/OpsJobDetail'));
const FreelancerPool = lazy(() => import('../pages/FreelancerPool'));

const PageLoader = () => (
  <div className="min-h-[60vh] flex items-center justify-center">
    <LogoLoader />
  </div>
);

const withSuspense = (element) => (
  <Suspense fallback={<PageLoader />}>
    {element}
  </Suspense>
);

const publicPage = (Component) => withSuspense(
  <PublicRoute userType="engineer"><Component /></PublicRoute>
);

const protectedPage = (Component) => withSuspense(
  <ProtectedRoute userType="engineer"><Component /></ProtectedRoute>
);

const EngineerRoutes = () => {
  const location = useLocation();

  // Enable global notifications for worker
  // Global notifications are now handled by SocketProvider at App level
  // useAppNotifications('worker');

  const shouldHideBottomNav =
    location.pathname === '/engineer/login' ||
    location.pathname === '/engineer/signup' ||
    location.pathname === '/engineer/forgot-password' ||
    location.pathname.endsWith('/map') ||
    location.pathname.endsWith('/success') ||
    location.pathname.includes('/billing') ||
    location.pathname.includes('/progress');

  const shouldShowBottomNav = !shouldHideBottomNav;

  return (
    <ErrorBoundary>
      {/* Main content area - leaves space for bottom nav when needed */}
      <div className={shouldShowBottomNav ? "pb-24" : ""}>
            <Routes>
              {/* Public routes — signup lives at App level (/engineer/signup) for smooth role switch */}
              <Route path="/login" element={publicPage(Login)} />
              <Route path="/forgot-password" element={publicPage(ForgotPassword)} />

              {/* Protected routes (auth required) */}
              <Route path="/" element={<ProtectedRoute userType="engineer"><Navigate to="dashboard" replace /></ProtectedRoute>} />
              <Route path="/dashboard" element={protectedPage(Dashboard)} />
              <Route path="/jobs" element={protectedPage(AssignedJobs)} />
              <Route path="/b2b-jobs" element={protectedPage(B2BJobs)} />
              <Route path="/ops-jobs" element={protectedPage(OpsJobs)} />
              <Route path="/ops-jobs/:id" element={protectedPage(OpsJobDetail)} />
              <Route path="/freelancer-pool" element={protectedPage(FreelancerPool)} />
              <Route path="/job/:id" element={protectedPage(JobDetails)} />
              <Route path="/job/:id/progress" element={protectedPage(JobProgress)} />
              <Route path="/job/:id/map" element={protectedPage(JobMap)} />
              <Route path="/job/:id/timeline" element={protectedPage(JobTimeline)} />
              <Route path="/job/:id/billing" element={protectedPage(BillingPage)} />
              <Route path="/job/:id/success" element={protectedPage(JobSuccess)} />
              <Route path="/projects" element={protectedPage(Projects)} />
              <Route path="/projects/:projectId" element={protectedPage(ProjectDetails)} />
              <Route path="/projects/:projectId/milestones" element={protectedPage(ProjectMilestones)} />
              <Route path="/projects/:projectId/milestones/:milestoneId/submit" element={protectedPage(SubmitMilestone)} />
              <Route path="/projects/:projectId/milestones/:milestoneId/review" element={protectedPage(ProjectUnderReview)} />
              <Route path="/profile" element={protectedPage(Profile)} />
              <Route path="/profile/edit" element={protectedPage(EditProfile)} />
              <Route path="/profile/personal-info" element={protectedPage(PersonalInfo)} />
              <Route path="/profile/bank-details" element={protectedPage(BankDetails)} />
              <Route path="/profile/documents" element={protectedPage(Documents)} />
              <Route path="/profile/work-locations" element={protectedPage(WorkLocations)} />
              <Route path="/profile/skills" element={protectedPage(Skills)} />
              <Route path="/profile/sub-services" element={protectedPage(SubServices)} />

              <Route path="/profile/notifications" element={protectedPage(NotificationSettings)} />
              <Route path="/profile/support" element={protectedPage(Support)} />
              <Route path="/settings" element={protectedPage(Settings)} />
              <Route path="/notifications" element={protectedPage(Notifications)} />
              <Route path="/wallet" element={protectedPage(Wallet)} />
              <Route path="/schedule" element={protectedPage(Schedule)} />
              <Route path="/proposals" element={protectedPage(Proposals)} />
            </Routes>
            </div>

      {/* BottomNav is OUTSIDE Suspense so it persists during page loads */}
      {shouldShowBottomNav && <BottomNav />}

      <GlobalWorkerJobAlert />
    </ErrorBoundary>
  );
};

export default EngineerRoutes;


