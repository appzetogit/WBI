import React from 'react';
import WidgetRenderer from '../../components/WidgetRenderer';
import { FiTrendingUp, FiAlertTriangle, FiCheckCircle, FiClock } from 'react-icons/fi';

// ─── Health colour map ────────────────────────────────────────────────────────
const healthConfig = {
  GREEN: { label: 'On Track', cls: 'bg-emerald-50 border-emerald-200 text-emerald-700', dot: 'bg-emerald-500' },
  AMBER: { label: 'Needs Attention', cls: 'bg-amber-50 border-amber-200 text-amber-700', dot: 'bg-amber-500' },
  RED: { label: 'Critical', cls: 'bg-red-50 border-red-200 text-red-700', dot: 'bg-red-500' },
};

// ─── Smart widget grid layout ─────────────────────────────────────────────────
// KPI_CARDs go in a 4-col row. Charts go 2-col. Timeline/Activity go full width or halves.
function buildWidgetGrid(widgets) {
  const kpiCards = widgets?.filter(w => w.widgetType === 'KPI_CARD') || [];
  const others   = widgets?.filter(w => w.widgetType !== 'KPI_CARD') || [];
  return { kpiCards, others };
}

export default function OverviewPage({ project, widgets = [], milestones = [], recentActivity = [], onRefresh }) {
  const { kpiCards, others } = buildWidgetGrid(widgets);
  const health = healthConfig[project?.health || 'GREEN'];

  return (
    <div className="p-6 lg:p-8 space-y-8 max-w-[1600px] mx-auto">

      {/* ── Project Summary Banner ───────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex flex-col lg:flex-row">
          {/* Left: Project info */}
          <div className="flex-1 p-6 lg:p-8 border-b lg:border-b-0 lg:border-r border-slate-100">
            <div className="flex items-start justify-between mb-4">
              <div>
                <span className={`inline-flex items-center gap-2 text-xs font-semibold px-3 py-1 rounded-full border ${health.cls} mb-3`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${health.dot} animate-pulse`}></span>
                  {health.label}
                </span>
                <h2 className="text-xl font-bold text-slate-800">{project?.title}</h2>
                <p className="text-slate-500 text-sm mt-1 flex items-center gap-3">
                  <span>{project?.category}</span>
                  {project?.subcategory && <><span>·</span><span>{project.subcategory}</span></>}
                  {project?.executionType && <><span>·</span><span className="text-xs bg-slate-100 px-2 py-0.5 rounded font-medium">{project.executionType.replace(/_/g,' ')}</span></>}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
              {[
                { label: 'Client', value: project?.clientName || '—' },
                { label: 'Vendor', value: project?.vendorName || '—' },
                { label: 'Start Date', value: project?.startDate ? new Date(project.startDate).toLocaleDateString('en-IN') : '—' },
                { label: 'Expected End', value: project?.expectedEndDate ? new Date(project.expectedEndDate).toLocaleDateString('en-IN') : '—' },
              ].map(item => (
                <div key={item.label}>
                  <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">{item.label}</p>
                  <p className="text-sm font-semibold text-slate-700 mt-0.5 truncate">{item.value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Progress ring */}
          <div className="flex flex-col items-center justify-center p-6 lg:p-8 lg:w-48 shrink-0 gap-2">
            <div className="relative w-28 h-28">
              <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="#f1f5f9" strokeWidth="2.5" />
                <circle cx="18" cy="18" r="15.9" fill="none"
                  stroke={project?.health === 'RED' ? '#EF4444' : project?.health === 'AMBER' ? '#F59E0B' : '#10B981'}
                  strokeWidth="2.5"
                  strokeDasharray={`${project?.progress || 0} ${100 - (project?.progress || 0)}`}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold text-slate-800">{project?.progress || 0}%</span>
                <span className="text-xs text-slate-400">Overall</span>
              </div>
            </div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Completion</p>
          </div>
        </div>
      </div>

      {/* ── KPI Cards Row ────────────────────────────────────────────────── */}
      {kpiCards.length > 0 && (
        <div>
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Key Metrics</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {kpiCards.map(w => <WidgetRenderer key={w.widgetId || w.metricKey} widget={w} />)}
          </div>
        </div>
      )}

      {/* ── Other Widgets (Charts, Timeline, Activity, Finance, SLA) ─────── */}
      {others.length > 0 && (
        <div>
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Analytics & Timeline</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {others.map(w => (
              <div key={w.widgetId || w.widgetType}
                className={w.size === 'XL' ? 'md:col-span-2 xl:col-span-3' : w.size === 'LG' ? 'md:col-span-2' : ''}>
                <WidgetRenderer widget={w} milestones={milestones} activity={recentActivity} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Fallback if no widgets configured ────────────────────────────── */}
      {!widgets?.length && (
        <div>
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Analytics & Timeline</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {/* Default widgets when no template configured */}
            {[
              { widgetType: 'MILESTONE_TIMELINE', title: 'Project Timeline', widgetId: 'd1' },
              { widgetType: 'ACTIVITY_FEED', title: 'Recent Activity', widgetId: 'd2' },
              { widgetType: 'SLA_MONITOR', title: 'SLA Compliance', widgetId: 'd3', resolvedMetric: { value: 100 } }
            ].map(w => (
              <WidgetRenderer key={w.widgetId} widget={w} milestones={milestones} activity={recentActivity} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
