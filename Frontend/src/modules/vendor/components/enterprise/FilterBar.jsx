import React from 'react';
import {
  Search,
  SlidersHorizontal,
  MapPin,
  IndianRupee,
  Clock,
  Tag,
} from 'lucide-react';
import SortMenu from './SortMenu';
import ViewToggle from './ViewToggle';

const BUDGET_RANGES = [
  { label: 'All Budgets', min: '', max: '' },
  { label: 'Under ₹50K', min: '', max: '50000' },
  { label: '₹50K – ₹2L', min: '50000', max: '200000' },
  { label: '₹2L – ₹10L', min: '200000', max: '1000000' },
  { label: 'Above ₹10L', min: '1000000', max: '' },
];

/**
 * Shared enterprise filter bar.
 * Pass controlled state via props so any module can reuse it.
 */
const FilterBar = ({
  search = '',
  onSearchChange,
  filters = {},
  onFilterChange,
  categories = [],
  viewMode = 'grid',
  onViewModeChange,
  showAdvanced = false,
  onToggleAdvanced,
  onApply,
  onReset,
  searchPlaceholder = 'Search...',
}) => {
  const handleBudgetChange = (e) => {
    const range = BUDGET_RANGES.find((r) => r.label === e.target.value);
    if (range) {
      onFilterChange?.('minBudget', range.min);
      onFilterChange?.('maxBudget', range.max);
    }
  };

  const currentBudgetLabel =
    BUDGET_RANGES.find(
      (r) => r.min === (filters.minBudget || '') && r.max === (filters.maxBudget || '')
    )?.label || 'All Budgets';

  const handleSubmit = (e) => {
    e.preventDefault();
    onApply?.();
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
      <div className="p-4 space-y-3">
        <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => onSearchChange?.(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-gray-50/50"
            />
          </div>

          <select
            value={filters.category || ''}
            onChange={(e) => onFilterChange?.('category', e.target.value)}
            className="px-3 py-2.5 text-sm border border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 outline-none min-w-[140px]"
          >
            <option value="">All Categories</option>
            {categories.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>

          <select
            value={currentBudgetLabel}
            onChange={handleBudgetChange}
            className="px-3 py-2.5 text-sm border border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 outline-none min-w-[130px]"
          >
            {BUDGET_RANGES.map((r) => (
              <option key={r.label} value={r.label}>
                {r.label}
              </option>
            ))}
          </select>

          <div className="relative min-w-[130px]">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={filters.city || ''}
              onChange={(e) => onFilterChange?.('city', e.target.value)}
              placeholder="Location"
              className="w-full pl-8 pr-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          <button
            type="button"
            onClick={() => onToggleAdvanced?.(!showAdvanced)}
            className={`flex items-center gap-2 px-3 py-2.5 text-sm font-medium border rounded-lg transition-colors ${
              showAdvanced
                ? 'border-blue-300 bg-blue-50 text-blue-700'
                : 'border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            <SlidersHorizontal className="h-4 w-4" />
            Filters
          </button>

          <SortMenu value={filters.sort || 'createdAt'} onChange={(v) => onFilterChange?.('sort', v)} />

          <ViewToggle value={viewMode} onChange={onViewModeChange} />

          <button
            type="submit"
            className="px-4 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Apply
          </button>
        </form>

        {showAdvanced && (
          <div className="flex flex-wrap gap-3 pt-3 border-t border-gray-100">
            <div className="flex items-center gap-2">
              <Tag className="h-4 w-4 text-gray-400" />
              <select
                value={filters.priority || ''}
                onChange={(e) => onFilterChange?.('priority', e.target.value)}
                className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white"
              >
                <option value="">All Priorities</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-gray-400" />
              <select
                value={filters.status || 'open'}
                onChange={(e) => onFilterChange?.('status', e.target.value)}
                className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white"
              >
                <option value="open">Open</option>
                <option value="awarded">Awarded</option>
                <option value="closed">Closed</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <IndianRupee className="h-4 w-4 text-gray-400" />
              <input
                type="number"
                placeholder="Min budget"
                value={filters.minBudget || ''}
                onChange={(e) => onFilterChange?.('minBudget', e.target.value)}
                className="w-28 px-3 py-2 text-sm border border-gray-200 rounded-lg"
              />
              <span className="text-gray-400">–</span>
              <input
                type="number"
                placeholder="Max budget"
                value={filters.maxBudget || ''}
                onChange={(e) => onFilterChange?.('maxBudget', e.target.value)}
                className="w-28 px-3 py-2 text-sm border border-gray-200 rounded-lg"
              />
            </div>
            <button
              type="button"
              onClick={() => {
                onReset?.();
                onApply?.();
              }}
              className="text-sm text-gray-500 hover:text-gray-800 underline"
            >
              Reset all filters
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default FilterBar;
export { BUDGET_RANGES };
