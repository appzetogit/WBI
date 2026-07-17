import React from 'react';

/**
 * A generic skeleton loader component that replaces spinning loaders.
 * It provides an instant layout structure while data is being fetched.
 * 
 * @param {string} type - 'card', 'list', 'profile', 'stats'
 * @param {number} count - number of skeleton items to render
 * @param {string} className - extra tailwind classes for the container
 */
const SkeletonLoader = ({ type = 'card', count = 1, className = '' }) => {
  const renderSkeleton = () => {
    switch (type) {
      case 'card':
        return (
          <div className={`bg-white rounded-2xl p-5 border border-gray-100 shadow-sm animate-pulse ${className}`}>
            <div className="flex gap-4 mb-4">
              <div className="w-12 h-12 bg-gray-200 rounded-xl"></div>
              <div className="flex-1 space-y-2 py-1">
                <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                <div className="h-3 bg-gray-200 rounded w-1/2"></div>
              </div>
            </div>
            <div className="space-y-2">
              <div className="h-3 bg-gray-200 rounded w-full"></div>
              <div className="h-3 bg-gray-200 rounded w-5/6"></div>
            </div>
            <div className="mt-4 flex gap-2">
              <div className="h-8 bg-gray-200 rounded-lg w-1/3"></div>
              <div className="h-8 bg-gray-200 rounded-lg w-1/3"></div>
            </div>
          </div>
        );
      
      case 'list':
        return (
          <div className={`flex items-center gap-4 py-3 border-b border-gray-100 animate-pulse ${className}`}>
            <div className="w-10 h-10 bg-gray-200 rounded-full"></div>
            <div className="flex-1 space-y-2">
              <div className="h-3 bg-gray-200 rounded w-1/3"></div>
              <div className="h-2 bg-gray-200 rounded w-1/4"></div>
            </div>
            <div className="h-4 bg-gray-200 rounded w-16"></div>
          </div>
        );

      case 'stats':
        return (
          <div className={`bg-white rounded-2xl p-5 border border-gray-100 shadow-sm animate-pulse ${className}`}>
            <div className="flex items-center justify-between mb-3">
              <div className="w-8 h-8 bg-gray-200 rounded-lg"></div>
              <div className="w-16 h-4 bg-gray-200 rounded-full"></div>
            </div>
            <div className="h-8 bg-gray-200 rounded w-1/2 mb-2"></div>
            <div className="h-3 bg-gray-200 rounded w-3/4"></div>
          </div>
        );

      case 'profile':
        return (
          <div className={`animate-pulse ${className}`}>
            <div className="bg-white rounded-2xl p-5 border border-gray-100 mb-4 flex items-center gap-5">
              <div className="w-20 h-20 bg-gray-200 rounded-full"></div>
              <div className="flex-1 space-y-3">
                <div className="h-5 bg-gray-200 rounded w-1/2"></div>
                <div className="h-3 bg-gray-200 rounded w-1/3"></div>
                <div className="h-3 bg-gray-200 rounded w-1/4"></div>
              </div>
            </div>
          </div>
        );

      default:
        return (
          <div className={`h-24 bg-gray-200 rounded-xl animate-pulse ${className}`}></div>
        );
    }
  };

  return (
    <div className={`flex flex-col gap-4 ${className}`}>
      {Array.from({ length: count }).map((_, idx) => (
        <React.Fragment key={idx}>
          {renderSkeleton()}
        </React.Fragment>
      ))}
    </div>
  );
};

export default SkeletonLoader;
