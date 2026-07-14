import React from 'react';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, Legend } from 'recharts';
import { FiAlertCircle, FiLoader, FiTrendingUp, FiCheckCircle, FiAlertTriangle } from 'react-icons/fi';

// ─── Color palette ─────────────────────────────────────────────────────────
const PALETTE = ['#10B981', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4'];

// ─── Helper: Format metric values ──────────────────────────────────────────
function formatValue(value, unit, currency) {
  if (value === null || value === undefined) return '—';
  if (currency === 'INR') return `₹${Number(value).toLocaleString('en-IN')}`;
  if (unit === '%') return `${value}%`;
  if (typeof value === 'number') return value.toLocaleString('en-IN');
  return String(value);
}

// ─── Status badge ──────────────────────────────────────────────────────────
export function StatusBadge({ status }) {
  const map = {
    ON_TRACK: { cls: 'bg-emerald-100 text-emerald-700', label: 'On Track' },
    AT_RISK: { cls: 'bg-amber-100 text-amber-700', label: 'At Risk' },
    BREACHED: { cls: 'bg-red-100 text-red-700', label: 'Breached' },
    GREEN: { cls: 'bg-emerald-100 text-emerald-700', label: 'Healthy' },
    AMBER: { cls: 'bg-amber-100 text-amber-700', label: 'Attention' },
    RED: { cls: 'bg-red-100 text-red-700', label: 'Critical' },
    IN_PROGRESS: { cls: 'bg-blue-100 text-blue-700', label: 'In Progress' },
    COMPLETED: { cls: 'bg-emerald-100 text-emerald-700', label: 'Completed' },
    PENDING: { cls: 'bg-slate-100 text-slate-600', label: 'Pending' },
    BLOCKED: { cls: 'bg-red-100 text-red-700', label: 'Blocked' },
    CANCELLED: { cls: 'bg-slate-100 text-slate-500', label: 'Cancelled' },
  };
  const s = map[status] || { cls: 'bg-slate-100 text-slate-600', label: status };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${s.cls}`}>{s.label}</span>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// WIDGET: KPI_CARD
// ═══════════════════════════════════════════════════════════════════════════════
function KpiCard({ widget }) {
  const { title, subtitle, resolvedMetric } = widget;
  const { value, unit, currency, error } = resolvedMetric || {};

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-col gap-2 hover:shadow-md transition-shadow">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">{title}</p>
      {error
        ? <span className="text-sm text-red-400 flex items-center gap-1"><FiAlertCircle size={14} /> {error}</span>
        : <p className="text-3xl font-bold text-slate-800 leading-none">{formatValue(value, unit, currency)}</p>
      }
      {subtitle && <p className="text-xs text-slate-400 mt-1">{subtitle}</p>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// WIDGET: LINE_CHART
// ═══════════════════════════════════════════════════════════════════════════════
function LineChartWidget({ widget }) {
  const data = widget.resolvedMetric?.data || [
    { name: 'Week 1', value: 10 }, { name: 'Week 2', value: 35 }, { name: 'Week 3', value: 55 }, { name: 'Week 4', value: 72 }
  ];
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <p className="text-sm font-semibold text-slate-700 mb-4">{widget.title}</p>
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={data}><CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="name" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} />
          <Tooltip /><Line type="monotone" dataKey="value" stroke="#10B981" strokeWidth={2} dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// WIDGET: BAR_CHART
// ═══════════════════════════════════════════════════════════════════════════════
function BarChartWidget({ widget }) {
  const data = widget.resolvedMetric?.data || [
    { name: 'Pending', value: 12 }, { name: 'In Progress', value: 8 }, { name: 'Completed', value: 24 }, { name: 'Blocked', value: 3 }
  ];
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <p className="text-sm font-semibold text-slate-700 mb-4">{widget.title}</p>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data}><CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="name" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} />
          <Tooltip /><Bar dataKey="value" fill="#3B82F6" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// WIDGET: DONUT_CHART
// ═══════════════════════════════════════════════════════════════════════════════
function DonutChartWidget({ widget }) {
  const data = widget.resolvedMetric?.data || [
    { name: 'Completed', value: 60 }, { name: 'In Progress', value: 25 }, { name: 'Pending', value: 15 }
  ];
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <p className="text-sm font-semibold text-slate-700 mb-2">{widget.title}</p>
      <ResponsiveContainer width="100%" height={180}>
        <PieChart>
          <Pie data={data} cx="50%" cy="50%" innerRadius={50} outerRadius={75} paddingAngle={3} dataKey="value">
            {data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
          </Pie>
          <Tooltip /><Legend iconType="circle" iconSize={10} wrapperStyle={{ fontSize: 11 }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// WIDGET: MILESTONE_TIMELINE
// ═══════════════════════════════════════════════════════════════════════════════
function MilestoneTimeline({ widget, milestones = [] }) {
  if (!milestones.length) return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <p className="text-sm font-semibold text-slate-700 mb-2">{widget.title || 'Milestones'}</p>
      <p className="text-xs text-slate-400">No milestones configured</p>
    </div>
  );
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <p className="text-sm font-semibold text-slate-700 mb-4">{widget.title || 'Project Timeline'}</p>
      <div className="relative">
        <div className="absolute left-3 top-0 bottom-0 w-0.5 bg-slate-200"></div>
        <div className="space-y-4">
          {milestones.map((m, i) => (
            <div key={m._id || i} className="flex items-start gap-4 pl-8 relative">
              <div className={`absolute left-0 w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-bold z-10 ${
                m.status === 'COMPLETED' ? 'bg-emerald-500 border-emerald-500 text-white' :
                m.status === 'IN_PROGRESS' ? 'bg-blue-500 border-blue-500 text-white' :
                'bg-white border-slate-300 text-slate-400'
              }`}>{m.status === 'COMPLETED' ? '✓' : m.order}</div>
              <div className="flex-1 pb-1">
                <p className={`text-sm font-medium ${m.status === 'COMPLETED' ? 'text-slate-400 line-through' : 'text-slate-700'}`}>{m.title}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <StatusBadge status={m.status} />
                  {m.plannedDate && <span className="text-xs text-slate-400">{new Date(m.plannedDate).toLocaleDateString('en-IN')}</span>}
                  {m.completionPercentage > 0 && m.status !== 'COMPLETED' && (
                    <div className="flex-1 bg-slate-100 rounded-full h-1.5 max-w-24">
                      <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${m.completionPercentage}%` }}></div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// WIDGET: ACTIVITY_FEED
// ═══════════════════════════════════════════════════════════════════════════════
function ActivityFeed({ widget, activity = [] }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <p className="text-sm font-semibold text-slate-700 mb-4">{widget.title || 'Recent Activity'}</p>
      {activity.length === 0
        ? <p className="text-xs text-slate-400">No activity yet</p>
        : <div className="space-y-3">
          {activity.slice(0, 8).map((a, i) => (
            <div key={i} className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-xs text-slate-600 font-bold shrink-0">
                {(a.actorName || 'S').charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-slate-700 leading-snug">{a.description}</p>
                <p className="text-xs text-slate-400 mt-0.5">{a.actorName} · {new Date(a.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
              </div>
            </div>
          ))}
        </div>
      }
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// WIDGET: SLA_MONITOR
// ═══════════════════════════════════════════════════════════════════════════════
function SLAMonitor({ widget }) {
  const compliance = widget.resolvedMetric?.value ?? 100;
  const color = compliance >= 90 ? '#10B981' : compliance >= 70 ? '#F59E0B' : '#EF4444';
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-col items-center justify-center gap-2">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">{widget.title || 'SLA Compliance'}</p>
      <div className="relative w-24 h-24">
        <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
          <circle cx="18" cy="18" r="15.9" fill="none" stroke="#f1f5f9" strokeWidth="3" />
          <circle cx="18" cy="18" r="15.9" fill="none" stroke={color} strokeWidth="3"
            strokeDasharray={`${compliance} ${100 - compliance}`} strokeLinecap="round" />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xl font-bold text-slate-800">{compliance}%</span>
        </div>
      </div>
      <p className="text-xs text-slate-400">SLA Compliance Rate</p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// WIDGET: FINANCE_SUMMARY
// ═══════════════════════════════════════════════════════════════════════════════
function FinanceSummary({ widget }) {
  const m = widget.resolvedMetric || {};
  const rows = [
    { label: 'Contract Value', key: 'PROJECT_VALUE' },
    { label: 'Invoiced', key: 'INVOICED_AMOUNT' },
    { label: 'Received', key: 'RECEIVED_AMOUNT' },
    { label: 'Outstanding', key: 'OUTSTANDING_AMOUNT' }
  ];
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <p className="text-sm font-semibold text-slate-700 mb-4">{widget.title || 'Finance Summary'}</p>
      <div className="space-y-2">
        {rows.map(r => (
          <div key={r.key} className="flex justify-between text-sm">
            <span className="text-slate-500">{r.label}</span>
            <span className="font-semibold text-slate-800">{formatValue(m[r.key]?.value, null, 'INR')}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MASTER: WidgetRenderer
// Maps widgetType (from approved registry) to the correct component.
// Any unknown widgetType is rejected silently with a placeholder.
// ═══════════════════════════════════════════════════════════════════════════════
const WIDGET_MAP = {
  KPI_CARD: KpiCard,
  LINE_CHART: LineChartWidget,
  BAR_CHART: BarChartWidget,
  DONUT_CHART: DonutChartWidget,
  MILESTONE_TIMELINE: MilestoneTimeline,
  ACTIVITY_FEED: ActivityFeed,
  SLA_MONITOR: SLAMonitor,
  FINANCE_SUMMARY: FinanceSummary,
  // Additional widgets — render placeholder until fully implemented
  DATA_TABLE: ({ widget }) => <WidgetPlaceholder label={widget.title || 'Data Table'} />,
  SITE_MAP: ({ widget }) => <WidgetPlaceholder label={widget.title || 'Site Map'} />,
  GANTT_CHART: ({ widget }) => <WidgetPlaceholder label={widget.title || 'Gantt Chart'} />,
  TASK_BOARD: ({ widget }) => <WidgetPlaceholder label={widget.title || 'Task Board'} />,
  APPROVAL_QUEUE: ({ widget }) => <WidgetPlaceholder label={widget.title || 'Approval Queue'} />,
  ISSUE_LIST: ({ widget }) => <WidgetPlaceholder label={widget.title || 'Issue List'} />,
  INVENTORY_SUMMARY: ({ widget }) => <WidgetPlaceholder label={widget.title || 'Inventory'} />,
};

function WidgetPlaceholder({ label }) {
  return (
    <div className="bg-white rounded-xl border border-dashed border-slate-300 p-5 flex items-center justify-center min-h-24">
      <span className="text-xs text-slate-400 font-medium">{label}</span>
    </div>
  );
}

/**
 * WidgetRenderer — the central renderer
 * @param {Object} widget - widget config from template (widgetType, metricKey, title, etc.)
 * @param {Array}  milestones - passed through to timeline widget
 * @param {Array}  activity - passed through to activity feed widget
 */
export default function WidgetRenderer({ widget, milestones, activity }) {
  const Component = WIDGET_MAP[widget?.widgetType];

  if (!Component) {
    console.warn(`[WidgetRenderer] Unknown widgetType: "${widget?.widgetType}"`);
    return <WidgetPlaceholder label={`Unknown: ${widget?.widgetType}`} />;
  }

  return <Component widget={widget} milestones={milestones} activity={activity} />;
}
