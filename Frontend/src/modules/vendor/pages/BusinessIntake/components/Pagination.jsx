import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const Pagination = ({ page, pages, total, limit, onPageChange, loading = false }) => {
  if (!pages || pages <= 1) return null;

  const start = (page - 1) * limit + 1;
  const end = Math.min(page * limit, total);

  const getPageNumbers = () => {
    const nums = [];
    const maxVisible = 5;
    let startPage = Math.max(1, page - Math.floor(maxVisible / 2));
    let endPage = Math.min(pages, startPage + maxVisible - 1);
    if (endPage - startPage + 1 < maxVisible) {
      startPage = Math.max(1, endPage - maxVisible + 1);
    }
    for (let i = startPage; i <= endPage; i++) nums.push(i);
    return nums;
  };

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 border-t border-gray-100 mt-6">
      <p className="text-sm text-gray-500">
        Showing <span className="font-medium text-gray-700">{start}</span> to{' '}
        <span className="font-medium text-gray-700">{end}</span> of{' '}
        <span className="font-medium text-gray-700">{total}</span> opportunities
      </p>

      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1 || loading}
          className="p-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        {getPageNumbers()[0] > 1 && (
          <>
            <button
              onClick={() => onPageChange(1)}
              className="min-w-[36px] h-9 px-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
            >
              1
            </button>
            {getPageNumbers()[0] > 2 && <span className="px-1 text-gray-400">…</span>}
          </>
        )}

        {getPageNumbers().map((n) => (
          <button
            key={n}
            onClick={() => onPageChange(n)}
            disabled={loading}
            className={`min-w-[36px] h-9 px-2 text-sm rounded-lg border transition-colors ${
              n === page
                ? 'bg-blue-600 border-blue-600 text-white font-semibold'
                : 'border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {n}
          </button>
        ))}

        {getPageNumbers().at(-1) < pages && (
          <>
            {getPageNumbers().at(-1) < pages - 1 && <span className="px-1 text-gray-400">…</span>}
            <button
              onClick={() => onPageChange(pages)}
              className="min-w-[36px] h-9 px-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
            >
              {pages}
            </button>
          </>
        )}

        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= pages || loading}
          className="p-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

export default Pagination;
