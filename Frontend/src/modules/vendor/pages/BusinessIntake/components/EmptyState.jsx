import React from 'react';
import { InboxIcon } from 'lucide-react';

const EmptyState = ({ title = 'Nothing here yet', description = '', icon: Icon = InboxIcon, action }) => (
  <div className="flex flex-col items-center justify-center py-20 text-center">
    <div className="h-16 w-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
      <Icon className="h-8 w-8 text-gray-400" />
    </div>
    <h3 className="text-base font-semibold text-gray-700 mb-1">{title}</h3>
    {description && <p className="text-sm text-gray-500 max-w-xs mb-4">{description}</p>}
    {action && (
      <button onClick={action.onClick} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">
        {action.label}
      </button>
    )}
  </div>
);

export default EmptyState;
