import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { FiDownload, FiUploadCloud } from 'react-icons/fi';
import api from '../../../../services/api';
import { downloadFile } from '../../utils/download';
import {
  PageHeader, StatCard, Pagination, EmptyState, ErrorState, TableSkeleton, Badge,
  fmtDateTime, inputCls, btnSecondary, btnPrimary
} from '../../components/ui';

const STATUS_TONE = { INVALID: 'red', DUPLICATE: 'amber', FAILED: 'violet' };
const STATUS_LABEL = { INVALID: 'Invalid', DUPLICATE: 'Duplicate', FAILED: 'Failed to create' };

/**
 * Every problem row across the company's uploads — what was wrong, in which
 * file and row, and how to fix it.
 */
const ValidationErrors = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const batchId = searchParams.get('batchId') || '';
  const [status, setStatus] = useState('');
  const [field, setField] = useState('');
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [batchId, status, field]);

  const { data: history } = useQuery({
    queryKey: ['b2bBulkHistoryForFilter'],
    queryFn: async () => (await api.get('/b2b/bulk-jobs/history', { params: { limit: 50 } })).data,
    staleTime: 60_000
  });
  const batches = history?.data || history?.batches || [];

  const params = { batchId: batchId || undefined, status: status || undefined, field: field || undefined };
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['b2bValidationErrors', params, page],
    queryFn: async () => (await api.get('/b2b/bulk-jobs/validation-errors', { params: { ...params, page, limit: 25 } })).data,
    placeholderData: (prev) => prev
  });
  const rows = data?.data || [];
  const summary = data?.summary || { byStatus: {}, byField: [] };
  const p = data?.pagination;
  const total = Object.values(summary.byStatus).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-6 pb-10">
      <PageHeader
        title="Validation Errors"
        subtitle="Rows from your uploads that could not become jobs, and what to change."
        actions={
          <>
            {batchId && (
              <button type="button" className={btnSecondary}
                onClick={() => downloadFile(`/b2b/bulk-jobs/errors/${batchId}/download`, { fallbackName: 'error-report.csv', label: 'Preparing error report…' })}>
                <FiDownload /> Error report for this upload
              </button>
            )}
            <Link to="/b2b/bulk-jobs/upload" className={btnPrimary}><FiUploadCloud /> Upload corrected file</Link>
          </>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Problem rows" value={total.toLocaleString('en-IN')} tone={total ? 'danger' : 'default'} loading={isLoading} onClick={() => setStatus('')} active={!status} />
        {['INVALID', 'DUPLICATE', 'FAILED'].map((s) => (
          <StatCard key={s} label={STATUS_LABEL[s]} value={(summary.byStatus[s] || 0).toLocaleString('en-IN')} loading={isLoading}
            onClick={() => setStatus(status === s ? '' : s)} active={status === s} />
        ))}
      </div>

      {summary.byField.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs font-semibold text-gray-500 mb-2">Most common problem columns</p>
          <div className="flex flex-wrap gap-2">
            {summary.byField.map((f) => (
              <button key={f.field} type="button" onClick={() => setField(field === f.field ? '' : f.field)}
                className={`h-8 px-3 rounded-full border text-xs font-semibold ${field === f.field ? 'border-brand bg-brand text-white' : 'border-gray-200 text-gray-700 hover:border-brand'}`}>
                {f.field} · {f.count.toLocaleString('en-IN')}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
        <div className="flex flex-wrap items-center gap-3 p-4 border-b border-gray-50">
          <select
            value={batchId}
            onChange={(e) => setSearchParams(e.target.value ? { batchId: e.target.value } : {})}
            className={`${inputCls} min-w-[260px]`}
            aria-label="Upload"
          >
            <option value="">All uploads</option>
            {batches.map((b) => (
              <option key={b._id} value={b._id}>{b.batchId} · {b.fileName}</option>
            ))}
          </select>
          {(status || field || batchId) && (
            <button type="button" className="text-sm font-semibold text-brand hover:underline"
              onClick={() => { setStatus(''); setField(''); setSearchParams({}); }}>
              Clear filters
            </button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50/60 text-[11px] uppercase tracking-wider text-gray-500">
              <tr>
                <th className="py-3 px-4 whitespace-nowrap">Upload</th>
                <th className="py-3 px-4">Row</th>
                <th className="py-3 px-4">Customer</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Problems and fixes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 align-top">
              {isLoading ? <TableSkeleton cols={5} /> : error ? (
                <tr><td colSpan={5}><ErrorState error={error} onRetry={refetch} /></td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={5}><EmptyState title="No validation errors" message="Every row of your uploads passed validation." /></td></tr>
              ) : rows.map((r) => (
                <tr key={r._id}>
                  <td className="py-3 px-4 whitespace-nowrap">
                    {r.batch ? (
                      <Link to={`/b2b/bulk-jobs/${r.batch._id}`} className="font-semibold text-brand hover:underline">{r.batch.batchId}</Link>
                    ) : <span className="text-gray-500">{r.uploadId}</span>}
                    <p className="text-xs text-gray-500 max-w-[200px] truncate" title={r.batch?.fileName}>{r.batch?.fileName}</p>
                    <p className="text-[11px] text-gray-400">{fmtDateTime(r.createdAt)}</p>
                  </td>
                  <td className="py-3 px-4 tabular-nums font-semibold">{r.rowNumber}</td>
                  <td className="py-3 px-4">
                    <p className="text-gray-800">{r.normalized?.customerName || '—'}</p>
                    <p className="text-xs text-gray-500">{[r.normalized?.serviceType, r.normalized?.city].filter(Boolean).join(' · ')}</p>
                  </td>
                  <td className="py-3 px-4"><Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status] || r.status}</Badge></td>
                  <td className="py-3 px-4">
                    {r.status === 'DUPLICATE' && r.duplicateOf && (
                      <p className="text-xs text-amber-700 mb-1">Duplicate of {r.duplicateOf}</p>
                    )}
                    <ul className="space-y-1.5">
                      {(r.validationErrors || []).map((e, i) => (
                        <li key={i} className="text-xs">
                          <span className="font-semibold text-gray-800">{e.field || 'Row'}</span>
                          {e.value ? <span className="text-gray-500"> “{e.value}”</span> : null}
                          <span className="text-red-600">: {e.error}</span>
                          {e.suggestedFix && <p className="text-gray-600">Fix: {e.suggestedFix}</p>}
                        </li>
                      ))}
                      {!r.validationErrors?.length && r.status !== 'DUPLICATE' && <li className="text-xs text-gray-500">No detail recorded.</li>}
                    </ul>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {p && <Pagination page={p.page} totalPages={p.totalPages} total={p.total} limit={p.limit} onPage={setPage} />}
      </div>
    </div>
  );
};

export default ValidationErrors;
