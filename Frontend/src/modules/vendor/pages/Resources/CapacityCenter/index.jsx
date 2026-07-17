import React, { useState, useEffect, useCallback } from 'react';
import { Gauge, Users, Package, Truck, Wrench } from 'lucide-react';
import { fetchCapacity, statusColors } from '../../../services/resourcesOpsService';
import { useResourcesOps } from '../context/ResourcesContext';
import EmptyState from '../../BusinessIntake/components/EmptyState';

const CapacityCenter = () => {
  const { refreshKey } = useResourcesOps();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchCapacity();
      setData(res.data.data || null);
    } catch { setData(null); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  if (loading) return <div className="h-64 bg-gray-100 rounded-xl animate-pulse" />;
  if (!data) return <EmptyState icon={Gauge} title="No capacity data" description="Capacity is calculated from workforce, inventory and tools." />;

  const statusCls = statusColors[data.capacityStatus] || statusColors.green;
  const cards = [
    { icon: Gauge, label: 'Total Capacity', value: `${data.totalCapacity}%`, color: 'bg-blue-600' },
    { icon: Gauge, label: 'Used', value: `${data.usedCapacity}%`, color: 'bg-indigo-600' },
    { icon: Gauge, label: 'Remaining', value: `${data.remainingCapacity}%`, color: 'bg-emerald-600' },
    { icon: Users, label: 'Engineers Available', value: data.engineersAvailable, color: 'bg-violet-600' },
    { icon: Users, label: 'Active Engineers', value: data.engineersActive, color: 'bg-amber-500' },
    { icon: Package, label: 'Inventory Availability', value: `${data.inventoryAvailability}%`, color: 'bg-teal-600' },
    { icon: Truck, label: 'Vehicles Available', value: data.vehiclesAvailable, color: 'bg-slate-600' },
    { icon: Wrench, label: 'Tools Available', value: data.toolsAvailable, color: 'bg-cyan-600' }
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <span className={`text-xs font-bold uppercase px-3 py-1.5 rounded-lg border ${statusCls}`}>
          Capacity {data.capacityStatus}
        </span>
        <span className="text-sm text-gray-500">Utilization {data.utilization}%</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {cards.map((c) => (
          <div key={c.label} className="border border-gray-200 rounded-xl p-4 shadow-sm">
            <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${c.color} mb-2`}>
              <c.icon className="h-4 w-4 text-white" />
            </div>
            <p className="text-xl font-bold text-gray-900">{c.value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{c.label}</p>
          </div>
        ))}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-gray-800 mb-3">Capacity vs Demand</h3>
        <div className="space-y-3">
          {(data.demandVsCapacity || []).map((row) => {
            const pct = row.capacity ? Math.min(100, Math.round((row.demand / row.capacity) * 100)) : 0;
            return (
              <div key={row.label}>
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span className="font-medium text-gray-700">{row.label}</span>
                  <span>{row.demand} / {row.capacity} ({pct}%)</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${pct >= 85 ? 'bg-red-500' : pct >= 65 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {(data.cityWise || []).length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-800 mb-3">Location-wise stock</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {data.cityWise.map((c) => (
              <div key={c.location} className="border border-gray-200 rounded-xl p-3">
                <p className="text-sm font-semibold text-gray-900 truncate">{c.location}</p>
                <p className="text-xs text-gray-500 mt-1">{c.items} SKUs · {c.qty} units</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default CapacityCenter;
