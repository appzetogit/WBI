import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Lightbulb } from 'lucide-react';

/**
 * Right-side utility panel: Quick Actions + Activity Feed + Tips.
 */
const RightRail = ({
  quickActions = [],
  activity = [],
  tip,
  className = '',
}) => (
  <aside className={`hidden xl:flex flex-col gap-4 w-72 shrink-0 ${className}`}>
    {quickActions.length > 0 && (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Quick Actions</h3>
        <div className="space-y-1">
          {quickActions.map(({ icon: Icon, label, path, onClick }) => {
            const content = (
              <>
                <div className="h-8 w-8 rounded-lg bg-blue-50 flex items-center justify-center group-hover:bg-blue-100 transition-colors">
                  {Icon && <Icon className="h-4 w-4 text-blue-600" />}
                </div>
                {label}
              </>
            );
            const className =
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors group w-full text-left';
            return path ? (
              <Link key={label} to={path} className={className}>
                {content}
              </Link>
            ) : (
              <button key={label} type="button" onClick={onClick} className={className}>
                {content}
              </button>
            );
          })}
        </div>
      </div>
    )}

    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
      <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Activity Feed</h3>
      {activity.length === 0 ? (
        <p className="text-sm text-gray-400 py-2">No recent activity</p>
      ) : (
        <div className="space-y-3">
          {activity.map((item, i) => (
            <div key={item.id || i} className="flex items-start gap-3">
              <div
                className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${
                  item.color || 'bg-blue-100 text-blue-600'
                }`}
              >
                {item.icon && <item.icon className="h-3.5 w-3.5" />}
              </div>
              <div className="min-w-0">
                <p className="text-sm text-gray-800 leading-snug">{item.text}</p>
                <p className="text-xs text-gray-400 mt-0.5">{item.time}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>

    {tip && (
      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-100 p-4">
        <div className="flex items-start gap-2 mb-3">
          <Lightbulb className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
          <div>
            <h3 className="text-sm font-semibold text-gray-900">{tip.title}</h3>
            <p className="text-xs text-gray-600 mt-1 leading-relaxed">{tip.description}</p>
          </div>
        </div>
        {typeof tip.progress === 'number' && (
          <div className="mb-3">
            <div className="flex justify-between text-xs text-gray-600 mb-1">
              <span>{tip.progressLabel || 'Progress'}</span>
              <span className="font-semibold">{tip.progress}%</span>
            </div>
            <div className="h-2 bg-white/80 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-600 rounded-full transition-all"
                style={{ width: `${tip.progress}%` }}
              />
            </div>
          </div>
        )}
        {tip.ctaPath && (
          <Link
            to={tip.ctaPath}
            className="flex items-center justify-center gap-1.5 w-full py-2 text-xs font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
          >
            {tip.ctaLabel || 'Complete Now'} <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
    )}
  </aside>
);

export default RightRail;
