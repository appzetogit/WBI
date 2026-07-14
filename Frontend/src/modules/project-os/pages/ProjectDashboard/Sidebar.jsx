import React, { useState } from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import {
  FiGrid, FiMapPin, FiFlag, FiCheckSquare, FiUsers,
  FiPackage, FiFileText, FiThumbsUp, FiAlertCircle,
  FiDollarSign, FiBarChart2, FiActivity, FiSettings,
  FiChevronLeft, FiRefreshCw, FiExternalLink
} from 'react-icons/fi';
import { useProjectDashboard } from '../../hooks/useProjectDashboard';
import { StatusBadge } from '../../components/WidgetRenderer';

// ─── Module key → icon + path mapping ────────────────────────────────────────
const MODULE_CONFIG = {
  OVERVIEW:    { label: 'Overview',    icon: FiGrid,        path: '' },
  SITES:       { label: 'Sites',       icon: FiMapPin,      path: '/sites' },
  MILESTONES:  { label: 'Milestones',  icon: FiFlag,        path: '/milestones' },
  TASKS:       { label: 'Tasks',       icon: FiCheckSquare, path: '/tasks' },
  TEAM:        { label: 'Team',        icon: FiUsers,       path: '/team' },
  INVENTORY:   { label: 'Inventory',   icon: FiPackage,     path: '/inventory' },
  ASSETS:      { label: 'Assets',      icon: FiPackage,     path: '/assets' },
  DOCUMENTS:   { label: 'Documents',   icon: FiFileText,    path: '/documents' },
  APPROVALS:   { label: 'Approvals',   icon: FiThumbsUp,    path: '/approvals' },
  ISSUES:      { label: 'Issues',      icon: FiAlertCircle, path: '/issues' },
  FINANCE:     { label: 'Finance',     icon: FiDollarSign,  path: '/finance' },
  SLA:         { label: 'SLA',         icon: FiBarChart2,   path: '/sla' },
  REPORTS:     { label: 'Reports',     icon: FiBarChart2,   path: '/reports' },
  ACTIVITY:    { label: 'Activity',    icon: FiActivity,    path: '/activity' },
  SETTINGS:    { label: 'Settings',    icon: FiSettings,    path: '/settings' },
};

export default function ProjectSidebar({ project, modules, collapsed, onToggle }) {
  const { id: projectId } = useParams();
  const location = useLocation();
  const basePath = `/vendor/project-os/${projectId}`;

  const isActive = (path) => {
    const fullPath = `${basePath}${path}`;
    if (path === '') return location.pathname === basePath || location.pathname === `${basePath}/`;
    return location.pathname.startsWith(fullPath);
  };

  return (
    <aside className={`flex flex-col bg-slate-900 text-white transition-all duration-300 ${collapsed ? 'w-16' : 'w-64'} shrink-0 h-full overflow-hidden`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 h-14 shrink-0">
        {!collapsed && (
          <div className="min-w-0">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest truncate">Project</p>
            <p className="text-sm font-semibold text-white truncate leading-tight">{project?.title || '...'}</p>
          </div>
        )}
        <button
          onClick={onToggle}
          className="p-1.5 rounded-md hover:bg-slate-800 text-slate-400 hover:text-white transition-colors shrink-0 ml-auto"
        >
          <FiChevronLeft size={16} className={`transition-transform duration-300 ${collapsed ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {/* Project Code Badge */}
      {!collapsed && project?.projectCode && (
        <div className="px-4 py-2 border-b border-slate-800">
          <span className="inline-flex items-center gap-1.5 text-xs font-mono text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            {project.projectCode}
          </span>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-2 custom-scrollbar">
        {(modules?.length ? modules : [{ key: 'OVERVIEW' }]).map((mod) => {
          const cfg = MODULE_CONFIG[mod.key];
          if (!cfg) return null;
          const Icon = cfg.icon;
          const active = isActive(cfg.path);

          return (
            <Link
              key={mod.key}
              to={`${basePath}${cfg.path}`}
              title={collapsed ? cfg.label : undefined}
              className={`flex items-center gap-3 px-4 py-2.5 mx-2 rounded-lg text-sm transition-all duration-150 group ${
                active
                  ? 'bg-emerald-600 text-white font-semibold shadow-sm'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Icon size={16} className="shrink-0" />
              {!collapsed && <span className="truncate">{mod.label || cfg.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Footer: project health */}
      {!collapsed && project && (
        <div className="px-4 py-3 border-t border-slate-800 shrink-0">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-500">Health</span>
            <StatusBadge status={project.health || 'GREEN'} />
          </div>
          <div className="mt-2">
            <div className="flex justify-between text-xs text-slate-500 mb-1">
              <span>Progress</span>
              <span className="text-slate-300 font-medium">{project.progress || 0}%</span>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-1.5">
              <div className="bg-emerald-500 h-1.5 rounded-full transition-all duration-500"
                style={{ width: `${project.progress || 0}%` }} />
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
