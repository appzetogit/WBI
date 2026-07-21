import React from 'react';

const DEFAULT_OPTIONS = [
  { value: 'createdAt', label: 'Newest' },
  { value: 'deadline', label: 'Deadline Soon' },
  { value: 'budget.max', label: 'Highest Budget' },
];

const SortMenu = ({ value, onChange, options = DEFAULT_OPTIONS, className = '' }) => (
  <select
    value={value}
    onChange={(e) => onChange?.(e.target.value)}
    className={`px-3 py-2.5 text-sm border border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 outline-none ${className}`}
  >
    {options.map((opt) => (
      <option key={opt.value} value={opt.value}>
        Sort: {opt.label}
      </option>
    ))}
  </select>
);

export default SortMenu;
export { DEFAULT_OPTIONS as SORT_OPTIONS };
