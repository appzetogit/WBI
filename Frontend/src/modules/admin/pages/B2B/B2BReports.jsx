import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FiBarChart2, FiLoader, FiDownload } from 'react-icons/fi';
import { toast } from 'react-hot-toast';
import api from '../../../../services/api';
import CardShell from '../UserCategories/components/CardShell';

/**
 * B2B reports for one company — the same figures that company sees in its
 * own panel (summary, SLA, money, services), from the admin report API.
 * The API is per company, so a company is always selected.
 */

const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const pct = (v) => (v === null || v === undefined ? '—' : `${v}%`);
const errMsg = (e, f) => e?.response?.data?.message || f;

const Stat = ({ label, value, hint }) => (
  <div className="p-4 rounded-xl bg-gray-50 border border-gray-100">
    <p className="text-[10px] font-bold uppercase text-gray-400 tracking-wide">{label}</p>
    <p className="text-xl font-black text-gray-900 mt-1">{value}</p>
    {hint && <p className="text-[10px] text-gray-500 mt-1">{hint}</p>}
  </div>
);

const B2BReports = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyId] = useState(searchParams.get('companyId') || '');
  const [range, setRange] = useState({ startDate: '', endDate: '' });
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get('/admin/b2b-companies', { params: { limit: 200 } })
      .then((res) => {
        const list = res.data?.data || [];
        setCompanies(list);
        setCompanyId((cur) => cur || list[0]?._id || '');
      })
      .catch((e) => toast.error(errMsg(e, 'Failed to load companies')));
  }, []);

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    const params = { companyId, ...Object.fromEntries(Object.entries(range).filter(([, v]) => v)) };
    try {
      const [summary, sla, financial, services] = await Promise.all([
        api.get('/admin/b2b/reports/summary', { params }),
        api.get('/admin/b2b/reports/sla', { params }),
        api.get('/admin/b2b/reports/financial', { params }),
        api.get('/admin/b2b/reports/service-performance', { params })
      ]);
      setData({
        summary: summary.data?.data,
        sla: sla.data?.data,
        financial: financial.data?.data,
        services: services.data?.data || []
      });
    } catch (e) {
      setData(null);
      toast.error(errMsg(e, 'Failed to load reports'));
    } finally {
      setLoading(false);
    }
  }, [companyId, range]);

  useEffect(() => { load(); }, [load]);

  const choose = (id) => {
    setCompanyId(id);
    setSearchParams(id ? { companyId: id } : {});
  };

  const download = async (kind) => {
    const id = toast.loading('Preparing export…');
    try {
      const res = await api.get(`/admin/b2b/reports/export/${kind}`, {
        params: { companyId, ...Object.fromEntries(Object.entries(range).filter(([, v]) => v)) },
        responseType: 'blob'
      });
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      const company = companies.find((c) => c._id === companyId);
      a.download = `B2B_Report_${(company?.companyName || 'company').replace(/\W+/g, '_')}.${kind === 'excel' ? 'xlsx' : 'pdf'}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success('Export ready', { id });
    } catch (e) {
      let msg = 'Export failed';
      if (e?.response?.data instanceof Blob) {
        try { msg = JSON.parse(await e.response.data.text()).message || msg; } catch { /* keep default */ }
      }
      toast.error(msg, { id });
    }
  };

  const s = data?.summary;
  const sla = data?.sla;
  const fin = data?.financial;

  return (
    <CardShell icon={FiBarChart2} title="B2B reports">
      <div className="flex flex-wrap items-end gap-3 mb-6">
        <div className="min-w-[240px]">
          <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">Company</label>
          <select value={companyId} onChange={(e) => choose(e.target.value)} className="w-full h-9 border border-gray-200 rounded-xl px-3 text-sm bg-white">
            {!companies.length && <option value="">No companies</option>}
            {companies.map((c) => <option key={c._id} value={c._id}>{c.companyName}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">From</label>
          <input type="date" value={range.startDate} onChange={(e) => setRange((r) => ({ ...r, startDate: e.target.value }))} className="h-9 border border-gray-200 rounded-xl px-3 text-sm" />
        </div>
        <div>
          <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">To</label>
          <input type="date" value={range.endDate} onChange={(e) => setRange((r) => ({ ...r, endDate: e.target.value }))} className="h-9 border border-gray-200 rounded-xl px-3 text-sm" />
        </div>
        <div className="flex gap-2 ml-auto">
          <button type="button" disabled={!companyId} onClick={() => download('excel')} className="h-9 px-3 rounded-xl border border-gray-200 text-xs font-bold text-gray-700 hover:bg-gray-50 flex items-center gap-1.5 disabled:opacity-40"><FiDownload /> Excel</button>
          <button type="button" disabled={!companyId} onClick={() => download('pdf')} className="h-9 px-3 rounded-xl border border-gray-200 text-xs font-bold text-gray-700 hover:bg-gray-50 flex items-center gap-1.5 disabled:opacity-40"><FiDownload /> PDF</button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><FiLoader className="w-8 h-8 animate-spin text-gray-400" /></div>
      ) : !companyId ? (
        <p className="text-sm text-gray-500 py-8 text-center">No B2B companies yet.</p>
      ) : !data ? (
        <div className="text-center py-8">
          <p className="text-sm text-red-600">Reports could not be loaded.</p>
          <button type="button" onClick={load} className="text-sm font-bold text-blue-600 mt-2">Retry</button>
        </div>
      ) : (
        <div className="space-y-6">
          <div>
            <h4 className="text-xs font-bold text-gray-500 uppercase mb-2">Jobs</h4>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Stat label="Total jobs" value={(s?.totalJobs?.value ?? 0).toLocaleString('en-IN')} hint={s?.totalJobs?.changeText} />
              <Stat label="Completed" value={(s?.completedJobs?.value ?? 0).toLocaleString('en-IN')} hint={s?.completedJobs?.changeText} />
              <Stat label="Pending" value={(s?.pendingJobs?.value ?? 0).toLocaleString('en-IN')} />
              <Stat label="Cancelled" value={(s?.cancelledJobs?.value ?? 0).toLocaleString('en-IN')} />
              <Stat label="First-time fix" value={pct(s?.firstTimeFixRate?.value)} />
              <Stat label="Avg. rating" value={s?.averageRating?.value != null ? `${s.averageRating.value} / 5` : '—'} />
              <Stat label="Total spend" value={money(s?.totalSpend?.value)} />
              <Stat label="SLA compliance (legacy)" value={pct(s?.slaCompliance?.value)} />
            </div>
          </div>

          <div>
            <h4 className="text-xs font-bold text-gray-500 uppercase mb-2">SLA</h4>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
              <Stat label="Attainment" value={pct(sla?.summary?.attainment)} hint={`${sla?.summary?.jobsWithSla ?? 0} jobs tracked`} />
              <Stat label="Breached jobs" value={sla?.summary?.breachedJobs ?? 0} />
              <Stat label="Overdue, open" value={sla?.summary?.overdueOpen ?? 0} />
              <Stat label="Due in next hour" value={sla?.summary?.atRiskNextHour ?? 0} />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-gray-500 border-b"><th className="py-2 pr-4">Stage</th><th className="py-2 pr-4">Tracked</th><th className="py-2 pr-4">Breaches</th><th className="py-2 pr-4">Attainment</th><th className="py-2 pr-4">Avg delay</th></tr></thead>
                <tbody>
                  {(sla?.metrics || []).map((m) => (
                    <tr key={m.metric} className="border-b border-gray-50">
                      <td className="py-2 pr-4 capitalize">{m.metric}</td>
                      <td className="py-2 pr-4">{m.tracked}</td>
                      <td className="py-2 pr-4">{m.breaches}</td>
                      <td className="py-2 pr-4">{pct(m.attainment)}</td>
                      <td className="py-2 pr-4">{m.avgDelayMinutes == null ? '—' : `${m.avgDelayMinutes} min`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h4 className="text-xs font-bold text-gray-500 uppercase mb-2">Money (wallet ledger)</h4>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Stat label="Available" value={money(fin?.balance?.available)} hint={`${money(fin?.balance?.reserved)} reserved`} />
              <Stat label="Top-ups" value={money(fin?.summary?.topUps)} />
              <Stat label="Charged for jobs" value={money(fin?.summary?.charged)} hint={`${fin?.summary?.chargedJobs ?? 0} jobs`} />
              <Stat label="Net spend" value={money(fin?.summary?.netSpend)} hint="Charges less refunds" />
            </div>
          </div>

          <div>
            <h4 className="text-xs font-bold text-gray-500 uppercase mb-2">Services</h4>
            {!data.services.length ? <p className="text-sm text-gray-500">No jobs in this period.</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-gray-500 border-b"><th className="py-2 pr-4">Service</th><th className="py-2 pr-4">Jobs</th><th className="py-2 pr-4">Completed</th><th className="py-2 pr-4">Completion</th><th className="py-2 pr-4">Avg time</th></tr></thead>
                  <tbody>
                    {data.services.map((r) => (
                      <tr key={r.serviceName} className="border-b border-gray-50">
                        <td className="py-2 pr-4 font-medium">{r.serviceName}</td>
                        <td className="py-2 pr-4">{r.totalJobs}</td>
                        <td className="py-2 pr-4">{r.completed}</td>
                        <td className="py-2 pr-4">{r.completionRate}</td>
                        <td className="py-2 pr-4">{r.averageCompletionTime}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </CardShell>
  );
};

export default B2BReports;
