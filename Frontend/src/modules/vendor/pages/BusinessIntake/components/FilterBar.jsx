import React from 'react';
import {
  Search,
  SlidersHorizontal,
  LayoutGrid,
  List,
  MapPin,
  IndianRupee,
  Clock,
  Tag,
} from 'lucide-react';
import { useBusinessIntake } from '../context/BusinessIntakeContext';
import { useVendorConfig } from '../../../context/VendorConfigContext';

const BUDGET_RANGES = [
  { label: 'All Budgets', min: '', max: '' },
  { label: 'Under ₹50K', min: '', max: '50000' },
  { label: '₹50K – ₹2L', min: '50000', max: '200000' },
  { label: '₹2L – ₹10L', min: '200000', max: '1000000' },
  { label: 'Above ₹10L', min: '1000000', max: '' },
];

const SORT_OPTIONS = [
  { value: 'createdAt', label: 'Newest' },
  { value: 'deadline', label: 'Deadline Soon' },
  { value: 'budget.max', label: 'Highest Budget' },
];

const FilterBar = ({ onApply }) => {
  const {
    search,
    setSearch,
    filters,
    updateFilter,
    viewMode,
    setViewMode,
    showAdvancedFilters,
    setShowAdvancedFilters,
    resetFilters,
  } = useBusinessIntake();
  const { approvedServices = [] } = useVendorConfig() || {};

  const handleBudgetChange = (e) => {
    const range = BUDGET_RANGES.find((r) => r.label === e.target.value);
    if (range) {
      updateFilter('minBudget', range.min);
      updateFilter('maxBudget', range.max);
    }
  };

  const currentBudgetLabel =
    BUDGET_RANGES.find(
      (r) => r.min === filters.minBudget && r.max === filters.maxBudget
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
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search opportunities, clients, companies..."
              className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-gray-50/50"
            />
          </div>

          <select
            value={filters.category}
            onChange={(e) => updateFilter('category', e.target.value)}
            className="px-3 py-2.5 text-sm border border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 outline-none min-w-[140px]"
          >
            <option value="">All Categories</option>
            {approvedServices.map((s) => (
              <option key={s.categoryCode || s.code} value={s.categoryCode || s.code}>
                {s.categoryName || s.name}
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
              value={filters.city}
              onChange={(e) => updateFilter('city', e.target.value)}
              placeholder="Location"
              className="w-full pl-8 pr-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          <button
            type="button"
            onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
            className={`flex items-center gap-2 px-3 py-2.5 text-sm font-medium border rounded-lg transition-colors ${
              showAdvancedFilters
                ? 'border-blue-300 bg-blue-50 text-blue-700'
                : 'border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            <SlidersHorizontal className="h-4 w-4" />
            Filters
          </button>

          <select
            value={filters.sort}
            onChange={(e) => updateFilter('sort', e.target.value)}
            className="px-3 py-2.5 text-sm border border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 outline-none"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                Sort: {opt.label}
              </option>
            ))}
          </select>

          <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`p-2.5 transition-colors ${
                viewMode === 'grid' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-50'
              }`}
              aria-label="Grid view"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`p-2.5 transition-colors ${
                viewMode === 'list' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-50'
              }`}
              aria-label="List view"
            >
              <List className="h-4 w-4" />
            </button>
          </div>

          <button
            type="submit"
            className="px-4 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Apply
          </button>
        </form>

        {showAdvancedFilters && (
          <div className="flex flex-wrap gap-3 pt-3 border-t border-gray-100">
            <div className="flex items-center gap-2">
              <Tag className="h-4 w-4 text-gray-400" />
              <select
                value={filters.priority}
                onChange={(e) => updateFilter('priority', e.target.value)}
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
                value={filters.status}
                onChange={(e) => updateFilter('status', e.target.value)}
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
                value={filters.minBudget}
                onChange={(e) => updateFilter('minBudget', e.target.value)}
                className="w-28 px-3 py-2 text-sm border border-gray-200 rounded-lg"
              />
              <span className="text-gray-400">–</span>
              <input
                type="number"
                placeholder="Max budget"
                value={filters.maxBudget}
                onChange={(e) => updateFilter('maxBudget', e.target.value)}
                className="w-28 px-3 py-2 text-sm border border-gray-200 rounded-lg"
              />
            </div>
            <button
              type="button"
              onClick={() => {
                resetFilters();
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
