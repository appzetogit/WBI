import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';

export default function AdminHubTabs({ basePath, tabs }) {
  const location = useLocation();

  const isTabActive = (tab) => {
    const path = `${basePath}/${tab.to}`.replace(/\/+/g, '/');
    if (tab.activePrefix) {
      return location.pathname.includes(`${basePath}/${tab.activePrefix}`);
    }
    if (tab.end) {
      return location.pathname === path || location.pathname === `${path}/`;
    }
    return location.pathname === path || location.pathname.startsWith(`${path}/`);
  };

  const linkClass = (tab) => {
    const active = isTabActive(tab);
    return `px-3 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors ${
      active
        ? 'bg-primary-600 text-white shadow-sm'
        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
    }`;
  };

  return (
    <nav
      className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1"
      aria-label="Section navigation"
    >
      {tabs.map((tab) => (
        <NavLink key={tab.to} to={`${basePath}/${tab.to}`} className={() => linkClass(tab)}>
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}
