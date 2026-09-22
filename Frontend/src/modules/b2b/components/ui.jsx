import React from 'react';
import { NavLink } from 'react-router-dom';
import { FiAlertCircle, FiInbox, FiRefreshCw } from 'react-icons/fi';

/** Shared building blocks for B2B panel pages. */

export const PageHeader = ({ title, subtitle, actions }) => (
  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
    <div className="min-w-0">
      <h2 className="text-2xl font-bold text-gray-900 tracking-tight">{title}</h2>
      {subtitle && <p className="text-sm text-gray-500 mt-1">{subtitle}</p>}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
  </div>
);

export const Card = ({ title, subtitle, actions, children, className = '' }) => (
  <section className={`bg-white rounded-2xl border border-gray-100 shadow-sm ${className}`}>
    {(title || actions) && (
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5 pb-3 border-b border-gray-50">
        <div>
          {title && <h3 className="text-sm font-bold text-gray-900">{title}</h3>}
          {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
        {actions}
      </div>
    )}
    <div className="p-5">{children}</div>
  </section>
);

const TONES = {
  default: 'text-gray-900',
  brand: 'text-brand',
  warn: 'text-amber-600',
  danger: 'text-red-600',
  good: 'text-green-600'
};

export const StatCard = ({ label, value, hint, tone = 'default', icon: Icon, loading, onClick, active }) => {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`text-left bg-white rounded-2xl p-4 border shadow-sm transition-colors ${
        active ? 'border-brand ring-1 ring-brand' : 'border-gray-100'
      } ${onClick ? 'hover:border-brand/40 cursor-pointer' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold text-gray-500">{label}</p>
        {Icon && <Icon className="w-4 h-4 text-gray-400 shrink-0" />}
      </div>
      <p className={`text-2xl font-bold mt-2 tabular-nums ${TONES[tone] || TONES.default}`}>
        {loading ? <span className="inline-block h-7 w-16 bg-gray-100 rounded animate-pulse" /> : value}
      </p>
      {hint && <p className="text-[11px] text-gray-500 mt-1">{hint}</p>}
    </Tag>
  );
};

/** Section tabs that are real routes, so each view has its own URL. */
export const RouteTabs = ({ tabs }) => (
  <div className="flex border-b border-gray-200 gap-5 px-1 overflow-x-auto no-scrollbar">
    {tabs.map((t) => (
      <NavLink
        key={t.to}
        to={t.to}
        end={t.end}
        className={({ isActive }) =>
          `py-3 text-sm font-semibold border-b-2 whitespace-nowrap transition-colors flex items-center gap-2 ${
            isActive ? 'border-brand text-brand' : 'border-transparent text-gray-500 hover:text-gray-900'
          }`
        }
      >
        {t.label}
        {t.count !== undefined && t.count !== null && (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600">{t.count}</span>
        )}
      </NavLink>
    ))}
  </div>
);

export const Pagination = ({ page, totalPages, total, limit, onPage }) => {
  if (!total) return null;
  const from = (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-gray-100 text-sm text-gray-600">
      <span>Showing {from.toLocaleString('en-IN')}–{to.toLocaleString('en-IN')} of {total.toLocaleString('en-IN')}</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          className="h-8 px-3 rounded-lg border border-gray-200 hover:border-brand hover:text-brand disabled:opacity-40 disabled:hover:border-gray-200 disabled:hover:text-gray-600"
        >
          Previous
        </button>
        <span className="font-semibold tabular-nums">{page} / {Math.max(totalPages, 1)}</span>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPage(page + 1)}
          className="h-8 px-3 rounded-lg border border-gray-200 hover:border-brand hover:text-brand disabled:opacity-40 disabled:hover:border-gray-200 disabled:hover:text-gray-600"
        >
          Next
        </button>
      </div>
    </div>
  );
};

export const EmptyState = ({ title = 'Nothing here yet', message, action }) => (
  <div className="text-center py-14 px-6">
    <FiInbox className="w-8 h-8 text-gray-300 mx-auto" />
    <p className="text-sm font-semibold text-gray-700 mt-3">{title}</p>
    {message && <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">{message}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>
);

export const ErrorState = ({ error, onRetry }) => (
  <div className="text-center py-12 px-6">
    <FiAlertCircle className="w-7 h-7 text-red-400 mx-auto" />
    <p className="text-sm font-semibold text-red-600 mt-3">
      {error?.response?.data?.message || error?.message || 'Something went wrong'}
    </p>
    {onRetry && (
      <button type="button" onClick={onRetry} className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-brand hover:underline">
        <FiRefreshCw className="w-3.5 h-3.5" /> Retry
      </button>
    )}
  </div>
);

export const TableSkeleton = ({ rows = 6, cols = 6 }) => (
  <>
    {Array.from({ length: rows }).map((_, i) => (
      <tr key={i} className="border-b border-gray-50">
        {Array.from({ length: cols }).map((__, j) => (
          <td key={j} className="py-3 px-4"><div className="h-3 bg-gray-100 rounded animate-pulse w-3/4" /></td>
        ))}
      </tr>
    ))}
  </>
);

export const Badge = ({ children, tone = 'gray' }) => {
  const map = {
    gray: 'bg-gray-50 text-gray-600 border-gray-200',
    brand: 'bg-brand/10 text-brand border-brand/20',
    blue: 'bg-blue-50 text-blue-700 border-blue-100',
    violet: 'bg-violet-50 text-violet-700 border-violet-100',
    amber: 'bg-amber-50 text-amber-700 border-amber-100',
    green: 'bg-green-50 text-green-700 border-green-100',
    red: 'bg-red-50 text-red-700 border-red-100'
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border whitespace-nowrap ${map[tone] || map.gray}`}>
      {children}
    </span>
  );
};

/** Visual tone for each job view key. */
export const VIEW_TONE = {
  pending: 'amber',
  dispatched: 'violet',
  en_route: 'blue',
  in_progress: 'blue',
  resolved: 'green',
  cancelled: 'gray',
  failed: 'red',
  sla_breached: 'red'
};

export const VIEW_LABEL = {
  all: 'All Jobs',
  pending: 'Pending',
  dispatched: 'Dispatched',
  en_route: 'En Route',
  in_progress: 'In Progress',
  resolved: 'Resolved',
  cancelled: 'Cancelled',
  failed: 'Failed',
  sla_breached: 'SLA Breached',
  active: 'Active Jobs'
};

export const inr = (n, digits = 0) =>
  `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: 2 })}`;

export const fmtDateTime = (d) =>
  d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

export const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export const fmtMinutes = (m) => {
  if (m === null || m === undefined) return '—';
  const abs = Math.abs(m);
  const h = Math.floor(abs / 60);
  const min = abs % 60;
  return `${m < 0 ? '-' : ''}${h ? `${h}h ` : ''}${min}m`;
};

export const inputCls =
  'h-10 px-3 border border-gray-200 text-sm rounded-lg outline-none focus:ring-1 focus:ring-brand focus:border-brand bg-white text-gray-700';

export const btnPrimary =
  'h-10 px-4 rounded-lg bg-brand hover:opacity-90 text-white text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50';

export const btnSecondary =
  'h-10 px-4 rounded-lg border border-gray-200 bg-white hover:border-brand hover:text-brand text-gray-700 text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50';
