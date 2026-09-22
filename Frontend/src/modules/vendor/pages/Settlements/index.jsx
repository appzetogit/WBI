import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Download, Loader2 } from 'lucide-react';
import { PageHeader, RefreshButton, Skeleton, EmptyState, ErrorState } from '../../components/ops/OpsUi';
import { formatINR, formatDate } from '../../components/ops/opsFormat';
import { listSettlements, downloadSettlement, errorMessage } from '../../services/vendorJobsService';

const STATUS_CLS = {
  PAID: 'bg-emerald-50 text-emerald-700',
  PARTIALLY_PAID: 'bg-blue-50 text-blue-700',
  PENDING: 'bg-gray-100 text-gray-700',
  FAILED: 'bg-red-50 text-red-700',
  NOT_APPLICABLE: 'bg-gray-100 text-gray-500'
};

const Settlements = () => {
  const [period, setPeriod] = useState('month');
  const [state, setState] = useState({ loading: true, error: '', rows: [] });
  const [downloading, setDownloading] = useState(null);

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: '' }));
    try {
      const res = await listSettlements({ period });
      setState({ loading: false, error: '', rows: res.data || [] });
    } catch (err) {
      setState({ loading: false, error: errorMessage(err), rows: [] });
    }
  }, [period]);

  useEffect(() => { load(); }, [load]);

  const download = async (id) => {
    setDownloading(id);
    try {
      const blob = await downloadSettlement(id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${id}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(errorMessage(err, 'Download failed'));
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-5 max-w-[1400px] mx-auto">
      <PageHeader
        eyebrow="Settlements"
        title="Settlements"
        subtitle="Your closed jobs aggregated per period: gross, commission, adjustments and net payable, with payment status."
        actions={(
          <>
            <select value={period} onChange={(e) => setPeriod(e.target.value)} className="px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-bold" aria-label="Period">
              <option value="month">Monthly</option>
              <option value="week">Weekly</option>
            </select>
            <RefreshButton onClick={load} spinning={state.loading && state.rows.length > 0} />
          </>
        )}
      />
      {state.loading && !state.rows.length ? <Skeleton rows={5} /> : state.error ? <ErrorState message={state.error} onRetry={load} /> : !state.rows.length ? (
        <EmptyState title="No settlements yet" message="A settlement is created for each period in which your team closes jobs." />
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 text-[11px] uppercase tracking-wider text-gray-500 text-left">
              <tr><th className="px-4 py-3">Settlement ID</th><th className="px-3 py-3">Period</th><th className="px-3 py-3 text-right">Jobs</th><th className="px-3 py-3 text-right">Gross</th><th className="px-3 py-3 text-right">Commission</th><th className="px-3 py-3 text-right">Adjustments</th><th className="px-3 py-3 text-right">Net</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Payment date</th><th className="px-3 py-3" /></tr>
            </thead>
            <tbody>
              {state.rows.map((s) => (
                <tr key={s.settlementId} className="border-t border-gray-100">
                  <td className="px-4 py-2.5 font-mono font-bold">{s.settlementId}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">{formatDate(s.period.start)} – {formatDate(s.period.end)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{s.totalJobs}{s.refundedJobs ? <span className="text-gray-400"> (+{s.refundedJobs} refunded)</span> : ''}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{formatINR(s.grossAmount)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{formatINR(s.commission)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{formatINR(s.adjustments)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-bold">{formatINR(s.netAmount)}</td>
                  <td className="px-3 py-2.5"><span className={`px-2 py-0.5 rounded-full font-bold ${STATUS_CLS[s.status] || ''}`}>{s.status.replace('_', ' ')}</span></td>
                  <td className="px-3 py-2.5 whitespace-nowrap">{formatDate(s.paymentDate)}</td>
                  <td className="px-3 py-2.5">
                    <button type="button" onClick={() => download(s.settlementId)} disabled={downloading === s.settlementId} className="px-2.5 py-1.5 border border-gray-200 rounded-lg text-[11px] font-bold flex items-center gap-1 disabled:opacity-50">
                      {downloading === s.settlementId ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />} CSV
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default Settlements;
