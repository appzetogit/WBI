import React, { useEffect, useState } from 'react';
import { FiLoader } from 'react-icons/fi';
import { toast } from 'react-hot-toast';
import Modal from '../UserCategories/components/Modal';
import adminWorkerService from '../../../../services/adminWorkerService';

/**
 * A worker's money: wallet balance, what was earned, paid out and deducted,
 * and every transaction row behind it. Used by both worker payment screens.
 */

const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const TYPE_LABEL = {
  earnings_credit: 'Earnings', credit: 'Credit', worker_payment: 'Admin payment', withdrawal: 'Withdrawal',
  settlement: 'Settlement', commission: 'Commission', platform_fee: 'Platform fee', penalty: 'Penalty',
  tds_deduction: 'TDS', debit: 'Debit', cash_collected: 'Cash collected', refund: 'Refund'
};

const WorkerHistoryModal = ({ worker, onClose }) => {
  const [data, setData] = useState(null);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);

  useEffect(() => {
    if (!worker) return;
    let alive = true;
    setData(null);
    adminWorkerService.getWorkerEarnings(worker._id, { page })
      .then((res) => {
        if (!alive) return;
        setData(res.data);
        setPages(res.pagination?.pages || 1);
      })
      .catch((e) => {
        toast.error(e.response?.data?.message || 'Failed to load payment history');
        if (alive) setData({ error: true });
      });
    return () => { alive = false; };
  }, [worker, page]);

  return (
    <Modal isOpen={Boolean(worker)} onClose={onClose} title={`Payment history · ${worker?.name || ''}`} size="lg">
      {!data ? (
        <div className="flex justify-center py-12"><FiLoader className="w-7 h-7 animate-spin text-gray-400" /></div>
      ) : data.error ? (
        <p className="text-sm text-red-600 text-center py-8">Payment history could not be loaded.</p>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              ['Wallet balance', money(data.balance)],
              ['Total earned', money(data.totalEarnings)],
              ['Paid out', money(data.paidOut)],
              ['Completed jobs', data.completedJobs]
            ].map(([k, v]) => (
              <div key={k} className="p-3 rounded-xl bg-gray-50 border border-gray-100">
                <p className="text-[10px] font-bold uppercase text-gray-400">{k}</p>
                <p className="text-lg font-bold text-gray-900 mt-1">{v}</p>
              </div>
            ))}
          </div>
          {!data.transactions?.length ? (
            <p className="text-sm text-gray-500 text-center py-6">No transactions recorded for this worker yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b">
                    <th className="py-2 pr-4">Date</th>
                    <th className="py-2 pr-4">Type</th>
                    <th className="py-2 pr-4 text-right">Amount</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2 pr-4 text-right">Balance after</th>
                    <th className="py-2 pr-4">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {data.transactions.map((t) => (
                    <tr key={t._id} className="border-b border-gray-50">
                      <td className="py-2 pr-4 text-xs text-gray-600">{new Date(t.createdAt).toLocaleString('en-IN')}</td>
                      <td className="py-2 pr-4">{TYPE_LABEL[t.type] || t.type}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{money(t.amount)}</td>
                      <td className="py-2 pr-4 capitalize">{t.status}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{money(t.balanceAfter)}</td>
                      <td className="py-2 pr-4 text-xs text-gray-600">{t.description}{t.referenceId ? ` · Ref ${t.referenceId}` : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {pages > 1 && (
                <div className="flex justify-between items-center pt-3 text-xs font-bold">
                  <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="text-blue-600 disabled:text-gray-300">Previous</button>
                  <span className="text-gray-500">{page} / {pages}</span>
                  <button type="button" disabled={page >= pages} onClick={() => setPage((p) => p + 1)} className="text-blue-600 disabled:text-gray-300">Next</button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
};

export default WorkerHistoryModal;
