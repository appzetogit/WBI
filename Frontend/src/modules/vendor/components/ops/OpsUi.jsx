import React, { useState } from 'react';
import { AlertCircle, Inbox, Loader2, RefreshCw, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { JOB_STATUS_META } from './opsFormat';


export const StatusBadge = ({ status, isOffer = false }) => {
  const meta = isOffer ? JOB_STATUS_META.ROUTED : JOB_STATUS_META[status] || { label: status || '—', cls: 'bg-gray-100 text-gray-700 border-gray-200' };
  const live = ['EN_ROUTE', 'ARRIVED', 'IN_PROGRESS'].includes(status);
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-bold whitespace-nowrap ${meta.cls}`}>
      {live && <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />}
      {meta.label}
    </span>
  );
};

const SLA_META = {
  on_track: { label: 'On track', cls: 'text-emerald-700 bg-emerald-50' },
  at_risk: { label: 'At risk', cls: 'text-amber-800 bg-amber-50' },
  breached: { label: 'Breached', cls: 'text-red-700 bg-red-50' },
  met: { label: 'Met', cls: 'text-emerald-700 bg-emerald-50' },
  none: { label: '—', cls: 'text-gray-500 bg-gray-50' }
};

export const SlaBadge = ({ sla }) => {
  if (!sla || !sla.dueAt) return <span className="text-xs text-gray-400">—</span>;
  const meta = SLA_META[sla.state] || SLA_META.none;
  const left = typeof sla.minutesLeft === 'number'
    ? sla.minutesLeft >= 0
      ? sla.minutesLeft >= 120 ? `${Math.round(sla.minutesLeft / 60)}h left` : `${sla.minutesLeft}m left`
      : `${Math.round(Math.abs(sla.minutesLeft) / 60)}h over`
    : null;
  return (
    <span className={`inline-flex flex-col px-2 py-0.5 rounded-md text-[11px] font-bold ${meta.cls}`} title={`Due ${new Date(sla.dueAt).toLocaleString()}`}>
      {meta.label}
      {left && <span className="font-medium opacity-80">{left}</span>}
    </span>
  );
};

export const PriorityBadge = ({ priority }) => {
  const p = String(priority || '').toLowerCase();
  const cls = p === 'high' || p === 'urgent' ? 'bg-red-100 text-red-700' : p === 'low' ? 'bg-gray-100 text-gray-600' : 'bg-amber-50 text-amber-800';
  return <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${cls}`}>{priority || 'Medium'}</span>;
};

export const SourceBadge = ({ source }) => {
  const s = String(source || 'B2B').toUpperCase();
  const cls = s === 'B2B' ? 'bg-purple-100 text-purple-800' : s === 'USER_APP' ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-700';
  return <span className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wide ${cls}`}>{s.replace('_', ' ')}</span>;
};

export const PageHeader = ({ eyebrow, title, subtitle, actions }) => (
  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 sm:p-6 rounded-2xl border border-gray-200/80 shadow-sm">
    <div className="min-w-0">
      {eyebrow && (
        <span className="px-2.5 py-1 bg-blue-50 text-blue-700 text-[11px] font-bold rounded-lg border border-blue-200 uppercase tracking-wider">
          {eyebrow}
        </span>
      )}
      <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 mt-2">{title}</h1>
      {subtitle && <p className="text-sm text-gray-500 mt-1">{subtitle}</p>}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
  </div>
);

export const RefreshButton = ({ onClick, spinning }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={spinning}
    className="px-4 py-2.5 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-xl text-xs font-bold flex items-center gap-2 border border-gray-200 shadow-sm disabled:opacity-50"
  >
    <RefreshCw className={`w-3.5 h-3.5 ${spinning ? 'animate-spin text-blue-600' : ''}`} /> Refresh
  </button>
);

export const Skeleton = ({ rows = 6 }) => (
  <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3" aria-busy="true" aria-label="Loading">
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="h-12 rounded-xl bg-gray-100 animate-pulse" />
    ))}
  </div>
);

export const EmptyState = ({ title = 'Nothing here yet', message, action }) => (
  <div className="py-16 px-6 text-center bg-white rounded-2xl border border-dashed border-gray-300">
    <Inbox className="w-10 h-10 text-gray-300 mx-auto mb-3" />
    <h3 className="text-base font-bold text-gray-900 mb-1">{title}</h3>
    {message && <p className="text-xs text-gray-500 max-w-sm mx-auto">{message}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>
);

export const ErrorState = ({ message, onRetry }) => (
  <div className="py-12 px-6 text-center bg-white rounded-2xl border border-red-200">
    <AlertCircle className="w-9 h-9 text-red-400 mx-auto mb-3" />
    <h3 className="text-base font-bold text-gray-900 mb-1">Could not load this data</h3>
    <p className="text-xs text-gray-500 max-w-sm mx-auto">{message}</p>
    {onRetry && (
      <button type="button" onClick={onRetry} className="mt-4 px-4 py-2 bg-gray-900 text-white text-xs font-bold rounded-lg">
        Try again
      </button>
    )}
  </div>
);

export const Modal = ({ title, subtitle, onClose, children, footer, wide = false }) => (
  <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm" role="dialog" aria-modal="true">
    <div className={`relative w-full ${wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'} bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl border border-gray-100 flex flex-col max-h-[92vh]`}>
      <div className="px-5 py-4 bg-gradient-to-r from-gray-900 to-gray-800 text-white flex items-start justify-between gap-3 rounded-t-2xl shrink-0">
        <div className="min-w-0">
          <h3 className="text-base font-bold">{title}</h3>
          {subtitle && <p className="text-xs text-gray-400 truncate">{subtitle}</p>}
        </div>
        <button type="button" onClick={onClose} className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-white/10" aria-label="Close">
          <X className="w-5 h-5" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-5">{children}</div>
      {footer && <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-end gap-2 shrink-0">{footer}</div>}
    </div>
  </div>
);

/** Confirmation dialog; `requireReason` collects a mandatory reason. */
export const ConfirmDialog = ({ title, message, confirmLabel = 'Confirm', danger = false, requireReason = false, reasonLabel = 'Reason', onConfirm, onCancel }) => {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const disabled = busy || (requireReason && reason.trim().length < 3);
  return (
    <Modal
      title={title}
      onClose={onCancel}
      footer={(
        <>
          <button type="button" onClick={onCancel} className="px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
          <button
            type="button"
            disabled={disabled}
            onClick={async () => {
              setBusy(true);
              try { await onConfirm(reason.trim()); } finally { setBusy(false); }
            }}
            className={`px-5 py-2 rounded-lg text-xs font-bold text-white flex items-center gap-2 disabled:opacity-50 ${danger ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}
          >
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} {confirmLabel}
          </button>
        </>
      )}
    >
      {message && <p className="text-sm text-gray-600">{message}</p>}
      {requireReason && (
        <label className="block mt-4">
          <span className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">{reasonLabel}</span>
          <textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
            placeholder="Required"
          />
        </label>
      )}
    </Modal>
  );
};

export const Pagination = ({ page, totalPages, total, onPage }) => {
  if (!totalPages || totalPages <= 1) return total ? <p className="text-xs text-gray-500 px-1">{total} result{total === 1 ? '' : 's'}</p> : null;
  return (
    <div className="flex items-center justify-between px-1">
      <p className="text-xs text-gray-500">{total} results · page {page} of {totalPages}</p>
      <div className="flex items-center gap-1">
        <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} className="p-2 rounded-lg border border-gray-200 bg-white disabled:opacity-40" aria-label="Previous page">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <button type="button" disabled={page >= totalPages} onClick={() => onPage(page + 1)} className="p-2 rounded-lg border border-gray-200 bg-white disabled:opacity-40" aria-label="Next page">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export const StatCard = ({ label, value, hint, icon: Icon, tone = 'blue', onClick }) => {
  const tones = {
    blue: 'bg-blue-50 text-blue-600',
    amber: 'bg-amber-50 text-amber-600',
    red: 'bg-red-50 text-red-600',
    green: 'bg-emerald-50 text-emerald-600',
    purple: 'bg-purple-50 text-purple-600',
    gray: 'bg-gray-100 text-gray-600'
  };
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`text-left bg-white rounded-2xl border border-gray-200/80 p-4 shadow-sm ${onClick ? 'hover:border-blue-400 transition-colors' : ''}`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">{label}</p>
        {Icon && <span className={`p-1.5 rounded-lg ${tones[tone] || tones.blue}`}><Icon className="w-4 h-4" /></span>}
      </div>
      <p className="text-2xl font-extrabold text-gray-900 mt-2 tabular-nums">{value ?? '—'}</p>
      {hint && <p className="text-[11px] text-gray-500 mt-0.5">{hint}</p>}
    </Tag>
  );
};

