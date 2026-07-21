import React from 'react';
import { LayoutGrid, List } from 'lucide-react';

const ViewToggle = ({ value = 'grid', onChange }) => (
  <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
    <button
      type="button"
      onClick={() => onChange?.('grid')}
      className={`p-2.5 transition-colors ${
        value === 'grid' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-50'
      }`}
      aria-label="Grid view"
    >
      <LayoutGrid className="h-4 w-4" />
    </button>
    <button
      type="button"
      onClick={() => onChange?.('list')}
      className={`p-2.5 transition-colors ${
        value === 'list' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-50'
      }`}
      aria-label="List view"
    >
      <List className="h-4 w-4" />
    </button>
  </div>
);

export default ViewToggle;
