import React from 'react';
import { Search } from 'lucide-react';
import { useResourcesOps } from '../context/ResourcesContext';
import { useVendorConfig } from '../../../context/VendorConfigContext';

const FilterBar = ({ onApply }) => {
  const { search, setSearch, filters, updateFilter } = useResourcesOps();
  const { approvedServices = [] } = useVendorConfig() || {};

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
      <form
        onSubmit={(e) => { e.preventDefault(); onApply?.(); }}
        className="flex flex-wrap gap-3 items-center"
      >
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search SKU, tools, warehouses, assets..."
            className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-gray-50/50"
          />
        </div>
        <select
          value={filters.category}
          onChange={(e) => updateFilter('category', e.target.value)}
          className="px-3 py-2.5 text-sm border border-gray-200 rounded-lg bg-white"
        >
          <option value="">All Services</option>
          {approvedServices.map((s) => (
            <option key={s.categoryCode || s.code} value={s.categoryCode || s.code}>
              {s.categoryName || s.name}
            </option>
          ))}
        </select>
        <select
          value={filters.status}
          onChange={(e) => updateFilter('status', e.target.value)}
          className="px-3 py-2.5 text-sm border border-gray-200 rounded-lg bg-white"
        >
          <option value="">All Status</option>
          <option value="in_stock">In Stock</option>
          <option value="low_stock">Low Stock</option>
          <option value="reserved">Reserved</option>
          <option value="allocated">Allocated</option>
          <option value="out_of_stock">Out of Stock</option>
          <option value="available">Available</option>
          <option value="assigned">Assigned</option>
          <option value="maintenance">Maintenance</option>
          <option value="installed">Installed</option>
          <option value="active">Active</option>
        </select>
        <button type="submit" className="px-4 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700">
          Apply
        </button>
      </form>
    </div>
  );
};

export default FilterBar;
