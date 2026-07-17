import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';

const StatCard = ({ icon: Icon, label, value, color, href, loading = false }) => (
  <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm hover:shadow-md transition-shadow">
    <div className="flex items-start justify-between">
      <div className={`h-11 w-11 rounded-xl flex items-center justify-center ${color}`}>
        <Icon className="h-5 w-5 text-white" />
      </div>
      {href && (
        <Link
          to={href}
          className="text-xs font-medium text-blue-600 hover:text-blue-700 flex items-center gap-0.5"
        >
          View all <ArrowUpRight className="h-3 w-3" />
        </Link>
      )}
    </div>
    <div className="mt-4">
      {loading ? (
        <div className="h-8 w-16 bg-gray-100 rounded animate-pulse" />
      ) : (
        <p className="text-2xl font-bold text-gray-900 tracking-tight">{value ?? 0}</p>
      )}
      <p className="text-xs text-gray-500 mt-1 font-medium">{label}</p>
    </div>
  </div>
);

export default StatCard;
