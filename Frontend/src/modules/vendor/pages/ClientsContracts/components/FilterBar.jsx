import React from 'react';
import { Search, MapPin } from 'lucide-react';
import { useClientsContracts } from '../context/ClientsContractsContext';
import { useVendorConfig } from '../../../context/VendorConfigContext';

const FilterBar = ({ onApply, showStatus = true }) => {
  const { search, setSearch, filters, updateFilter } = useClientsContracts();
  const { approvedServices = [] } = useVendorConfig() || {};

  const handleSubmit = (e) => {
    e.preventDefault();
    onApply?.();
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
      <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search clients, companies, cities..."
            className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-gray-50/50"
          />
        </div>

        <select
          value={filters.category}
          onChange={(e) => updateFilter('category', e.target.value)}
          className="px-3 py-2.5 text-sm border border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 outline-none min-w-[140px]"
        >
          <option value="">All Services</option>
          {approvedServices.map((s) => (
            <option key={s.categoryCode || s.code} value={s.categoryCode || s.code}>
              {s.categoryName || s.name}
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

        {showStatus && (
          <select
            value={filters.status}
            onChange={(e) => updateFilter('status', e.target.value)}
            className="px-3 py-2.5 text-sm border border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 outline-none"
          >
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="prospect">Prospect</option>
            <option value="inactive">Inactive</option>
          </select>
        )}

        <button
          type="submit"
          className="px-4 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
        >
          Apply
        </button>
      </form>
    </div>
  );
};

export default FilterBar;
