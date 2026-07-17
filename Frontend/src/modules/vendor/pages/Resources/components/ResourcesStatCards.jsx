import React from 'react';
import { Link } from 'react-router-dom';
import { Package, Warehouse, Wrench, Box, AlertTriangle, ArrowUpRight } from 'lucide-react';
import useResourcesCounts from '../../../hooks/useResourcesCounts';

const Stat = ({ icon: Icon, label, value, color, href, loading }) => (
  <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm hover:shadow-md transition-shadow">
    <div className="flex justify-between items-start">
      <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${color}`}>
        <Icon className="h-5 w-5 text-white" />
      </div>
      {href && (
        <Link to={href} className="text-xs text-blue-600 font-medium flex items-center gap-0.5">
          View <ArrowUpRight className="h-3 w-3" />
        </Link>
      )}
    </div>
    <div className="mt-3">
      {loading ? <div className="h-7 w-12 bg-gray-100 rounded animate-pulse" /> : (
        <p className="text-2xl font-bold text-gray-900">{value ?? 0}</p>
      )}
      <p className="text-xs text-gray-500 mt-0.5 font-medium">{label}</p>
    </div>
  </div>
);

const ResourcesStatCards = () => {
  const { counts, loading } = useResourcesCounts();
  const b = '/vendor/dynamic/resources';
  const cards = [
    { icon: Package, label: 'Inventory SKUs', value: counts.inventoryItems, color: 'bg-blue-600', href: `${b}/inventory` },
    { icon: AlertTriangle, label: 'Low / Out Stock', value: counts.lowStock, color: 'bg-amber-500', href: `${b}/inventory` },
    { icon: Wrench, label: 'Tools Available', value: counts.toolsAvailable, color: 'bg-emerald-600', href: `${b}/tools` },
    { icon: Warehouse, label: 'Warehouses', value: counts.warehouses, color: 'bg-violet-600', href: `${b}/warehouses` },
    { icon: Box, label: 'Installed Assets', value: counts.installedAssets, color: 'bg-indigo-600', href: `${b}/assets` }
  ];
  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
      {cards.map((c) => <Stat key={c.label} {...c} loading={loading} />)}
    </div>
  );
};

export default ResourcesStatCards;
