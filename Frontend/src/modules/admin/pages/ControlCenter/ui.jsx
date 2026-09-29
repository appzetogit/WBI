import React from 'react';
import { FiLoader, FiX } from 'react-icons/fi';

/* Shared building blocks for the Control Center pages. */

export const Page = ({ title, subtitle, actions, children }) => (
  <div className="space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-extrabold text-gray-900">{title}</h1>
        {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
    {children}
  </div>
);

export const Card = ({ title, children, className = '', right }) => (
  <div className={`bg-white rounded-xl border border-gray-200 shadow-sm ${className}`}>
    {title && (
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <h2 className="text-sm font-bold text-gray-800">{title}</h2>
        {right}
      </div>
    )}
    <div className="p-4">{children}</div>
  </div>
);

const TONES = {
  gray: 'bg-gray-100 text-gray-700', green: 'bg-green-50 text-green-700', red: 'bg-red-50 text-red-700',
  amber: 'bg-amber-50 text-amber-700', blue: 'bg-blue-50 text-blue-700', teal: 'bg-teal-50 text-teal-700'
};
export const Badge = ({ children, tone = 'gray' }) => (
  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold ${TONES[tone] || TONES.gray}`}>{children}</span>
);

export const Button = ({ children, variant = 'primary', className = '', ...props }) => {
  const styles = {
    primary: 'bg-[#10AFA5] hover:bg-[#0d9a91] text-white',
    ghost: 'border border-gray-200 text-gray-700 hover:bg-gray-50 bg-white',
    danger: 'bg-red-600 hover:bg-red-700 text-white'
  };
  return (
    <button type="button" className={`h-9 px-3 rounded-lg text-xs font-bold disabled:opacity-40 inline-flex items-center gap-1.5 ${styles[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
};

export const Field = ({ label, children }) => (
  <label className="block">
    <span className="text-[10px] font-bold text-gray-400 uppercase block mb-1">{label}</span>
    {children}
  </label>
);

export const Loading = () => (
  <div className="flex justify-center py-12"><FiLoader className="w-7 h-7 animate-spin text-gray-400" /></div>
);
export const Empty = ({ children = 'Nothing here yet.' }) => (
  <p className="text-sm text-gray-500 py-10 text-center">{children}</p>
);
export const ErrorBox = ({ error, onRetry }) => (
  <div className="text-center py-8">
    <p className="text-sm text-red-600">{error}</p>
    {onRetry && <button type="button" onClick={onRetry} className="text-sm font-bold text-blue-600 mt-2">Retry</button>}
  </div>
);

/** Simple table: columns = [{ key, label, render?(row) }] */
export const Table = ({ columns, rows, onRowClick, rowKey = (r) => r._id || r.id }) => (
  <div className="overflow-x-auto">
    <table className="min-w-full text-sm">
      <thead>
        <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
          {columns.map((c) => <th key={c.key} className="py-2 pr-4 font-bold whitespace-nowrap">{c.label}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={rowKey(r)} onClick={onRowClick ? () => onRowClick(r) : undefined}
            className={`border-b border-gray-50 ${onRowClick ? 'cursor-pointer hover:bg-gray-50' : ''}`}>
            {columns.map((c) => (
              <td key={c.key} className="py-2.5 pr-4 align-top text-gray-700">{c.render ? c.render(r) : (r[c.key] ?? '—')}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

export const Modal = ({ title, onClose, children, wide = false }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
    <div className={`bg-white rounded-xl shadow-xl w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} max-h-[90vh] overflow-y-auto`} onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
        <h3 className="font-bold text-gray-900">{title}</h3>
        <button type="button" onClick={onClose} className="p-1 rounded hover:bg-gray-100" aria-label="Close"><FiX /></button>
      </div>
      <div className="p-5">{children}</div>
    </div>
  </div>
);

export const Pager = ({ page, pages, onPage }) => (pages > 1 ? (
  <div className="flex items-center justify-end gap-2 pt-3 text-xs text-gray-500">
    <Button variant="ghost" disabled={page <= 1} onClick={() => onPage(page - 1)}>Prev</Button>
    <span>Page {page} of {pages}</span>
    <Button variant="ghost" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</Button>
  </div>
) : null);
