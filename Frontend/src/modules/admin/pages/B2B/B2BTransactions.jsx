import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FiActivity, FiLoader, FiRotateCcw, FiCheckCircle, FiAlertTriangle } from 'react-icons/fi';
import { toast } from 'react-hot-toast';
import api from '../../../../services/api';
import CardShell from '../UserCategories/components/CardShell';

/**
 * The B2B wallet ledger, per company.
 *
 * Every row here is a balance change: what moved, which buckets it moved
 * between, and what the balances were afterwards. A row can be reversed (with
 * a reason) but never edited or deleted, and reconciliation recomputes the
 * balances from these rows to show any drift.
 */

const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const when = (d) => (d ? new Date(d).toLocaleString('en-IN') : '—');

const TYPE_STYLE = {
  TOP_UP: 'bg-emerald-50 text-emerald-700',
  JOB_RESERVATION: 'bg-blue-50 text-blue-700',
  JOB_CHARGE: 'bg-gray-100 text-gray-700',
  RELEASE: 'bg-amber-50 text-amber-700',
  REFUND: 'bg-emerald-50 text-emerald-700',
  ADJUSTMENT: 'bg-purple-50 text-purple-700',
  PAYOUT: 'bg-gray-100 text-gray-700',
  REVERSAL: 'bg-red-50 text-red-600'
};

const B2BTransactions = () => {
  const [searchParams] = useSearchParams();
  const [companies, setCompanies] = useState([]);
  // A company can be preselected from its detail panel (?companyId=…).
  const [companyId, setCompanyId] = useState(searchParams.get('companyId') || '');
  const [rows, setRows] = useState([]);
  const [reconcile, setReconcile] = useState(null);
  const [loading, setLoading] = useState(false);

  // The company list loads once; choosing a company must not refetch it.
  const loadCompanies = useCallback(async () => {
    try {
      const res = await api.get('/admin/b2b-companies', { params: { limit: 200 } });
      const list = res.data?.companies || res.data?.data || [];
      setCompanies(list);
      setCompanyId((current) => current || (list[0]?._id || list[0]?.id || ''));
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to load companies');
    }
  }, []);

  const loadLedger = useCallback(async () => {
    if (!companyId) return;
    try {
      setLoading(true);
      const [wallet, rec] = await Promise.all([
        api.get(`/admin/b2b-wallets/${companyId}`),
        api.get(`/admin/b2b-wallets/${companyId}/reconcile`)
      ]);
      setRows(wallet.data?.transactions || wallet.data?.data?.transactions || []);
      setReconcile(rec.data?.data || null);
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to load the ledger');
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    const t = setTimeout(loadCompanies, 0);
    return () => clearTimeout(t);
  }, [loadCompanies]);

  useEffect(() => {
    const t = setTimeout(loadLedger, 0);
    return () => clearTimeout(t);
  }, [loadLedger]);

  const reverse = async (row) => {
    const reason = window.prompt('Why is this transaction being reversed?') || '';
    if (!reason.trim()) return;
    try {
      await api.post(`/admin/b2b-wallets/transactions/${row._id}/reverse`, { reason });
      toast.success('Transaction reversed');
      loadLedger();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Could not reverse the transaction');
    }
  };

  return (
    <CardShell icon={FiActivity} title="B2B wallet ledger">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <select
          value={companyId}
          onChange={(e) => setCompanyId(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
        >
          {companies.map((c) => (
            <option key={c._id || c.id} value={c._id || c.id}>{c.companyName}</option>
          ))}
        </select>

        {reconcile && (
          <span
            className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full ${
              reconcile.balanced ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
            }`}
          >
            {reconcile.balanced ? <FiCheckCircle /> : <FiAlertTriangle />}
            {reconcile.balanced
              ? 'Ledger and balances agree'
              : `Drift: available ${money(reconcile.drift.available)}, reserved ${money(reconcile.drift.reserved)}`}
          </span>
        )}
        {reconcile?.opening && (reconcile.opening.available || reconcile.opening.reserved) ? (
          <span className="text-[11px] text-gray-500">
            Opening balance before the ledger: {money(reconcile.opening.available)} available
          </span>
        ) : null}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <FiLoader className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-500 py-8 text-center">No transactions for this company yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="py-3 pr-4">When</th>
                <th className="py-3 pr-4">Type</th>
                <th className="py-3 pr-4">Amount</th>
                <th className="py-3 pr-4">Available Δ</th>
                <th className="py-3 pr-4">Reserved Δ</th>
                <th className="py-3 pr-4">Balances after</th>
                <th className="py-3 pr-4">Reference</th>
                <th className="py-3 pr-4">Mode</th>
                <th className="py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t._id} className="border-b last:border-0">
                  <td className="py-3 pr-4 text-gray-500">{when(t.createdAt || t.date)}</td>
                  <td className="py-3 pr-4">
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${TYPE_STYLE[t.ledgerType] || 'bg-gray-100 text-gray-600'}`}>
                      {t.ledgerType || t.type}
                    </span>
                    {t.status === 'reversed' && (
                      <span className="ml-2 text-[10px] font-bold text-red-500">reversed</span>
                    )}
                  </td>
                  <td className="py-3 pr-4">{money(t.amount)}</td>
                  <td className="py-3 pr-4">{t.availableDelta ? money(t.availableDelta) : '—'}</td>
                  <td className="py-3 pr-4">{t.reservedDelta ? money(t.reservedDelta) : '—'}</td>
                  <td className="py-3 pr-4 text-gray-500">
                    {t.balanceAfter
                      ? `${money(t.balanceAfter.available)} / ${money(t.balanceAfter.reserved)}`
                      : '—'}
                  </td>
                  <td className="py-3 pr-4 text-gray-500">{t.reservationId || t.transactionId}</td>
                  <td className="py-3 pr-4">
                    {t.paymentMode === 'DEMO' ? (
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700">
                        demo
                      </span>
                    ) : (
                      <span className="text-gray-400 text-[11px]">real</span>
                    )}
                  </td>
                  <td className="py-3">
                    {t.ledgerType && t.status !== 'reversed' && (
                      <button
                        type="button"
                        onClick={() => reverse(t)}
                        className="text-gray-500 hover:text-red-600"
                        title="Reverse this transaction"
                      >
                        <FiRotateCcw />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </CardShell>
  );
};

export default B2BTransactions;
