import React, { useMemo } from 'react';
import { FilterBar as EnterpriseFilterBar } from '../../../components/enterprise';
import { useBusinessIntake } from '../context/BusinessIntakeContext';
import { useVendorConfig } from '../../../context/VendorConfigContext';

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

  const categories = useMemo(
    () =>
      (approvedServices || [])
        .filter((s) => s.status !== 'suspended')
        .map((s) => ({
          value: s.categoryCode || s.code,
          label: `${s.categoryCode || s.code} · ${s.categoryName || s.name}`,
        })),
    [approvedServices]
  );

  return (
    <EnterpriseFilterBar
      search={search}
      onSearchChange={setSearch}
      filters={filters}
      onFilterChange={updateFilter}
      categories={categories}
      viewMode={viewMode}
      onViewModeChange={setViewMode}
      showAdvanced={showAdvancedFilters}
      onToggleAdvanced={setShowAdvancedFilters}
      onApply={onApply}
      onReset={resetFilters}
      searchPlaceholder="Search opportunities, clients, companies..."
    />
  );
};

export default FilterBar;
