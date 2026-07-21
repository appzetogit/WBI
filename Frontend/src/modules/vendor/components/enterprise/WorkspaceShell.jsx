import React from 'react';

/**
 * Enterprise module workspace shell.
 * Layout: header → KPI cards → filter bar → tabs → (content | right rail)
 */
const WorkspaceShell = ({
  title,
  subtitle,
  headerExtra,
  headerActions,
  kpiCards,
  filterBar,
  tabs,
  children,
  rightRail,
  className = '',
}) => (
  <div className={`min-h-full bg-gray-50/80 ${className}`}>
    <div className="p-6 lg:p-8">
      {(title || headerActions) && (
        <div className="flex items-center justify-between mb-6">
          <div>
            {title && (
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2.5">
                {title}
              </h1>
            )}
            {subtitle && (
              <p className="text-sm text-gray-500 mt-1.5">{subtitle}</p>
            )}
            {headerExtra}
          </div>
          {headerActions}
        </div>
      )}

      {kpiCards && <div className="mb-6">{kpiCards}</div>}
      {filterBar && <div className="mb-4">{filterBar}</div>}

      {tabs && (
        <div className="bg-white rounded-t-xl border border-gray-200 border-b-0">
          {tabs}
        </div>
      )}

      <div
        className={`flex gap-6 bg-white border border-gray-200 p-5 lg:p-6 ${
          tabs ? 'rounded-b-xl border-t-0' : 'rounded-xl'
        }`}
      >
        <div className="flex-1 min-w-0">{children}</div>
        {rightRail}
      </div>
    </div>
  </div>
);

export default WorkspaceShell;
