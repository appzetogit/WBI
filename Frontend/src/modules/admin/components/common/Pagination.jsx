import React from 'react';

/**
 * Shared numbered pagination footer for Admin tables.
 */
const Pagination = ({
  page = 1,
  totalPages = 1,
  totalItems = 0,
  limit = 10,
  currentCount = 0,
  onPageChange,
  onLimitChange,
  limitOptions = [10, 20, 50],
  label = 'entries',
  activeClass = 'bg-green-600 text-white shadow-xs',
}) => {
  const safeTotalPages = Math.max(1, totalPages || 1);
  const displayTotal = totalItems || currentCount;
  const startItem = displayTotal === 0 ? 0 : (page - 1) * limit + 1;
  const endItem = Math.min(page * limit, displayTotal);

  const getPageNumbers = () => {
    if (safeTotalPages <= 7) {
      return Array.from({ length: safeTotalPages }, (_, i) => i + 1);
    }
    const pages = [1];
    const left = Math.max(2, page - 1);
    const right = Math.min(safeTotalPages - 1, page + 1);
    if (left > 2) pages.push('...');
    for (let i = left; i <= right; i++) pages.push(i);
    if (right < safeTotalPages - 1) pages.push('...');
    pages.push(safeTotalPages);
    return pages;
  };

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-gray-100 bg-gray-50/40">
      <div className="flex items-center gap-3 text-xs text-gray-500 font-medium">
        <span>
          Showing <strong className="text-gray-800">{startItem}–{endItem}</strong> of{' '}
          <strong className="text-gray-800">{displayTotal}</strong> {label}
        </span>
        {onLimitChange && (
          <select
            value={limit}
            onChange={(e) => onLimitChange(Number(e.target.value))}
            aria-label="Rows per page"
            className="px-2 py-1 bg-white border border-gray-200 rounded-lg text-xs text-gray-700 font-semibold focus:outline-none focus:border-green-500 cursor-pointer"
          >
            {limitOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt} / page
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          className="px-2.5 py-1.5 border border-gray-200 bg-white rounded-lg text-xs font-semibold text-gray-600 disabled:opacity-40 hover:bg-gray-50 transition-all cursor-pointer disabled:cursor-not-allowed"
        >
          Prev
        </button>

        {getPageNumbers().map((p, idx) =>
          p === '...' ? (
            <span key={`ellipsis-${idx}`} className="px-2 py-1 text-xs text-gray-400">
              ...
            </span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => onPageChange(p)}
              className={`min-w-[30px] px-2 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                page === p
                  ? activeClass
                  : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              {p}
            </button>
          )
        )}

        <button
          type="button"
          onClick={() => onPageChange(Math.min(safeTotalPages, page + 1))}
          disabled={page >= safeTotalPages}
          className="px-2.5 py-1.5 border border-gray-200 bg-white rounded-lg text-xs font-semibold text-gray-600 disabled:opacity-40 hover:bg-gray-50 transition-all cursor-pointer disabled:cursor-not-allowed"
        >
          Next
        </button>
      </div>
    </div>
  );
};

export default Pagination;
