import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useVendorConfig } from '../../context/VendorConfigContext';
import useVendorBasePath from '../../hooks/useVendorBasePath';
import api from '../../../../services/api';
import {
  Briefcase, CheckCircle, Wallet, Users, Shield, AlertCircle,
  Video, Activity, Wifi, Sun, MapPin, Gauge, ArrowRight, ListChecks
} from 'lucide-react';

const iconMap = {
  camera: Video,
  'map-pin': MapPin,
  wifi: Wifi,
  sun: Sun,
  zap: Sun,
  monitor: Activity,
  shield: Shield,
  activity: Activity,
  briefcase: Briefcase,
  default: Gauge
};

const colorMap = {
  blue: 'bg-blue-50 text-blue-600',
  green: 'bg-emerald-50 text-emerald-600',
  amber: 'bg-amber-50 text-amber-600',
  yellow: 'bg-yellow-50 text-yellow-600',
  indigo: 'bg-indigo-50 text-indigo-600',
  sky: 'bg-sky-50 text-sky-600',
  red: 'bg-red-50 text-red-600',
  violet: 'bg-violet-50 text-violet-600',
  emerald: 'bg-emerald-50 text-emerald-600',
  pink: 'bg-pink-50 text-pink-600',
  slate: 'bg-slate-50 text-slate-600'
};

const statusBadge = (status) => {
  if (status === 'active') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (status === 'pending') return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-gray-100 text-gray-600 border-gray-200';
};

const DynamicDashboard = () => {
  const {
    vendorProfile,
    companyName,
    approvedServices = [],
    extraKPIs = [],
    projectMilestones = {},
    activeProjectsCount,
    pendingOpportunitiesCount,
    alerts: configAlerts = []
  } = useVendorConfig() || {};
  const { path } = useVendorBasePath();

  const [kpis, setKpis] = useState({
    base: {
      activeProjects: activeProjectsCount || 0,
      availableEngineers: 0,
      walletBalance: vendorProfile?.walletBalance || 0,
      slaAdherence: 94
    },
    extra: []
  });
  const [alerts, setAlerts] = useState(configAlerts);
  const [loadingKpis, setLoadingKpis] = useState(true);

  const services = (approvedServices || []).filter((s) => s.status !== 'suspended');
  const serviceKey = services.map((s) => s.categoryCode).join(',');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoadingKpis(true);
      try {
        const [kpiRes, alertRes] = await Promise.allSettled([
          api.get('/vendor/dashboard/kpis'),
          api.get('/vendor/dashboard/alerts')
        ]);
        if (cancelled) return;
        if (kpiRes.status === 'fulfilled' && kpiRes.value.data?.success) {
          setKpis(kpiRes.value.data.data);
        }
        if (alertRes.status === 'fulfilled' && alertRes.value.data?.success) {
          setAlerts(alertRes.value.data.data || []);
        }
      } catch (err) {
        console.warn('[Dashboard] KPI fetch failed', err.message);
      } finally {
        if (!cancelled) setLoadingKpis(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [serviceKey]);

  const getIcon = (iconKey) => iconMap[iconKey] || iconMap.default;
  const base = kpis.base || {};
  const displayExtra = (kpis.extra || []).length ? kpis.extra : (extraKPIs || []).map((k) => ({ ...k, value: 0 }));

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500">
            Welcome back{companyName || vendorProfile?.companyName ? `, ${companyName || vendorProfile.companyName}` : ''}!
            {' '}Live metrics for your registered services.
          </p>
        </div>
        <Link
          to={path('settings')}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 hover:text-blue-700"
        >
          Manage services <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      {/* Registered services — always visible */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Your Registered Services</h2>
          <span className="text-xs text-gray-400">{services.length} active</span>
        </div>
        {services.length === 0 ? (
          <div className="p-5 bg-white border border-dashed border-gray-200 rounded-xl text-sm text-gray-500">
            No services on your profile yet. Complete registration service selection, or wait for admin approval.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {services.map((svc) => {
              const milestones = projectMilestones[svc.categoryCode] || [];
              return (
                <motion.div
                  key={svc.categoryCode}
                  whileHover={{ y: -2 }}
                  className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="h-10 w-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                        <Video className="h-5 w-5" />
                      </span>
                      <div className="min-w-0">
                        <h3 className="font-bold text-gray-900 truncate">{svc.categoryName}</h3>
                        <p className="text-xs font-mono text-gray-400">{svc.categoryCode}</p>
                      </div>
                    </div>
                    <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-md border shrink-0 ${statusBadge(svc.status)}`}>
                      {svc.status || 'pending'}
                    </span>
                  </div>
                  <ul className="mt-3 space-y-1 max-h-24 overflow-y-auto">
                    {(svc.subServices || []).slice(0, 5).map((sub) => (
                      <li key={sub} className="text-xs text-gray-600 flex items-center gap-1.5">
                        <span className="h-1 w-1 rounded-full bg-blue-500" /> {sub}
                      </li>
                    ))}
                    {(svc.subServices || []).length > 5 && (
                      <li className="text-[11px] text-gray-400">+{(svc.subServices || []).length - 5} more</li>
                    )}
                  </ul>
                  <p className="mt-3 text-[11px] text-gray-400 flex items-center gap-1">
                    <ListChecks className="h-3 w-3" />
                    {milestones.length} milestone template steps
                  </p>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {alerts?.length > 0 && (
        <div className="mb-6 space-y-3 max-w-5xl">
          {alerts.map((alert, idx) => (
            <motion.div
              key={`${alert.type}-${idx}`}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`border-l-4 p-4 rounded-md flex items-start shadow-sm ${
                alert.severity === 'warning' ? 'bg-yellow-50 border-yellow-400' : 'bg-blue-50 border-blue-400'
              }`}
            >
              <AlertCircle className={`w-5 h-5 mr-3 mt-0.5 ${alert.severity === 'warning' ? 'text-yellow-600' : 'text-blue-600'}`} />
              <div>
                <h3 className="text-sm font-medium text-gray-900">{alert.title}</h3>
                <p className="mt-1 text-sm text-gray-600">{alert.message}</p>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        {[
          { label: 'Active Projects', value: base.activeProjects ?? activeProjectsCount ?? 0, icon: Briefcase, tone: 'bg-blue-50 text-blue-600' },
          { label: 'Available Engineers', value: base.availableEngineers ?? 0, icon: Users, tone: 'bg-indigo-50 text-indigo-600' },
          { label: 'Wallet Balance', value: `₹${Number(base.walletBalance ?? vendorProfile?.walletBalance ?? 0).toLocaleString('en-IN')}`, icon: Wallet, tone: 'bg-emerald-50 text-emerald-600' },
          { label: 'SLA Adherence', value: `${base.slaAdherence ?? 94}%`, icon: Shield, tone: 'bg-amber-50 text-amber-600' }
        ].map((card) => (
          <motion.div key={card.label} whileHover={{ y: -4 }} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">{card.label}</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{loadingKpis && typeof card.value === 'number' ? '—' : card.value}</p>
            </div>
            <div className={`p-3 rounded-lg ${card.tone}`}>
              <card.icon className="w-6 h-6" />
            </div>
          </motion.div>
        ))}
      </div>

      {displayExtra.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Service KPIs
            {services[0] ? ` · ${services.map((s) => s.categoryName).join(', ')}` : ''}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {displayExtra.map((kpi) => {
              const Icon = getIcon(kpi.icon);
              const tone = colorMap[kpi.color] || colorMap.blue;
              return (
                <motion.div key={kpi.key} whileHover={{ y: -4 }} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-500">{kpi.label}</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">
                      {Number(kpi.value || 0).toLocaleString('en-IN')}
                      <span className="ml-1 text-xs font-medium text-gray-400">{kpi.unit}</span>
                    </p>
                  </div>
                  <div className={`p-3 rounded-lg ${tone}`}>
                    <Icon className="w-6 h-6" />
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
              <h2 className="text-lg font-semibold text-gray-900">Pipeline Snapshot</h2>
              <Link to={path('business-intake/all')} className="text-sm font-semibold text-blue-600">
                {pendingOpportunitiesCount || 0} open opportunities
              </Link>
            </div>
            {(base.activeProjects ?? activeProjectsCount ?? 0) === 0 ? (
              <div className="p-8 text-center">
                <CheckCircle className="mx-auto h-12 w-12 text-gray-300" />
                <h3 className="mt-2 text-sm font-medium text-gray-900">No active projects</h3>
                <p className="mt-1 text-sm text-gray-500">
                  Opportunities matching {services.map((s) => s.categoryName).join(', ') || 'your services'} will appear in Business Intake.
                </p>
              </div>
            ) : (
              <div className="p-6 text-sm text-gray-600">
                You have <strong>{base.activeProjects}</strong> active project(s) for{' '}
                <strong>{services.map((s) => s.categoryName).join(', ') || 'your services'}</strong>.
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-xl shadow-sm p-6 text-white">
            <h2 className="text-lg font-semibold mb-4 flex items-center">
              <Shield className="w-5 h-5 mr-2 text-blue-400" />
              Vendor Tier: {(vendorProfile?.vendorTier || 'bronze').toUpperCase()}
            </h2>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-300">SLA Adherence</span>
                  <span className="font-bold text-green-400">{base.slaAdherence ?? 94}%</span>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-2">
                  <div className="bg-green-400 h-2 rounded-full" style={{ width: `${Math.min(100, base.slaAdherence || 94)}%` }} />
                </div>
              </div>
              <div className="pt-4 border-t border-gray-700 flex justify-between items-center">
                <span className="text-sm text-gray-300">Avg Rating</span>
                <span className="font-bold text-yellow-400">{vendorProfile?.overallRating || '0'} ⭐</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DynamicDashboard;
