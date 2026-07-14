import React, { useState } from 'react';
import { Routes, Route, useParams, useNavigate } from 'react-router-dom';
import { FiRefreshCw, FiArrowLeft, FiExternalLink } from 'react-icons/fi';
import { useProjectDashboard } from '../../hooks/useProjectDashboard';
import Sidebar from './Sidebar';
import WidgetRenderer, { StatusBadge } from '../../components/WidgetRenderer';

// ── Lazy-loaded module pages ──────────────────────────────────────────────────
import OverviewPage from '../Overview';
import SitesPage from '../Sites';
import TasksPage from '../Tasks';
import MilestonesPage from '../Milestones';
import IssuesPage from '../Issues';
import ActivityPage from '../Activity';
import FinancePage from '../Finance';

// Loading skeleton
function DashboardSkeleton() {
  return (
    <div className="min-h-screen bg-[#F8FAFC] flex">
      <div className="w-64 bg-slate-900 animate-pulse shrink-0 h-screen" />
      <div className="flex-1 p-8 space-y-6">
        <div className="h-24 bg-white rounded-xl animate-pulse border border-slate-100" />
        <div className="grid grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-28 bg-white rounded-xl animate-pulse border border-slate-100" />)}
        </div>
        <div className="grid grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => <div key={i} className="h-52 bg-white rounded-xl animate-pulse border border-slate-100" />)}
        </div>
      </div>
    </div>
  );
}

// ─── Main Dashboard Shell ─────────────────────────────────────────────────────
export default function ProjectDashboard() {
  const { id: projectId } = useParams();
  const navigate = useNavigate();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const { data, loading, error, refresh, refreshMetrics } = useProjectDashboard(projectId);

  if (loading) return <DashboardSkeleton />;

  if (error) return (
    <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center">
      <div className="text-center">
        <p className="text-slate-500 text-sm mb-4">Failed to load project dashboard.</p>
        <p className="text-red-500 text-xs mb-6">{error}</p>
        <button onClick={refresh} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold">Retry</button>
      </div>
    </div>
  );

  const { project, modules, widgets, milestones, recentActivity } = data || {};

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col">
      {/* ── Top Header Bar ─────────────────────────────────────────────────── */}
      <header className="bg-white border-b border-slate-200 h-14 flex items-center px-6 gap-4 shrink-0 z-30 shadow-sm">
        <button onClick={() => navigate(-1)} className="p-1.5 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors">
          <FiArrowLeft size={16} />
        </button>
        <div className="w-px h-5 bg-slate-200" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded font-semibold">{project?.projectCode}</span>
            <h1 className="text-sm font-bold text-slate-800 truncate">{project?.title}</h1>
            <StatusBadge status={project?.status} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 hidden md:block">{project?.category}</span>
          <button
            onClick={refreshMetrics}
            title="Refresh metrics"
            className="p-1.5 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <FiRefreshCw size={14} />
          </button>
        </div>
      </header>

      {/* ── Body: Sidebar + Content ────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          project={project}
          modules={modules}
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(s => !s)}
        />

        {/* ── Page Content ───────────────────────────────────────────────── */}
        <main className="flex-1 overflow-y-auto">
          <Routes>
            <Route index element={
              <OverviewPage
                project={project}
                widgets={widgets}
                milestones={milestones}
                recentActivity={recentActivity}
                onRefresh={refreshMetrics}
              />
            } />
            <Route path="sites/*" element={<SitesPage projectId={projectId} />} />
            <Route path="tasks/*" element={<TasksPage projectId={projectId} />} />
            <Route path="milestones" element={<MilestonesPage projectId={projectId} milestones={milestones} onRefresh={refresh} />} />
            <Route path="issues/*" element={<IssuesPage projectId={projectId} />} />
            <Route path="activity" element={<ActivityPage projectId={projectId} />} />
            <Route path="finance" element={<FinancePage projectId={projectId} project={project} />} />
            <Route path="*" element={
              <div className="flex items-center justify-center h-64">
                <p className="text-slate-400 text-sm">This module is coming soon.</p>
              </div>
            } />
          </Routes>
        </main>
      </div>
    </div>
  );
}
