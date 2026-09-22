import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { FiDownload, FiUploadCloud, FiSearch, FiCopy } from 'react-icons/fi';
import toast from 'react-hot-toast';
import api from '../../../../services/api';
import { downloadFile } from '../../utils/download';
import { PageHeader, Card, ErrorState, Badge, EmptyState, inputCls, btnPrimary, btnSecondary } from '../../components/ui';

/**
 * Upload templates — the official workbook plus the exact column contract the
 * parser applies, read from the server so it can never drift from the code.
 */
const Templates = () => {
  const [serviceQuery, setServiceQuery] = useState('');
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['b2bTemplateSpec'],
    queryFn: async () => (await api.get('/b2b/bulk-jobs/template-spec')).data.data,
    staleTime: 5 * 60_000
  });

  const services = useMemo(() => {
    const q = serviceQuery.trim().toLowerCase();
    const list = data?.services || [];
    return q ? list.filter((s) => `${s.name} ${s.key}`.toLowerCase().includes(q)) : list;
  }, [data, serviceQuery]);

  const downloadCsvHeader = () => {
    const cols = data?.columns || [];
    const csv = `${cols.map((c) => `"${c.header}"`).join(',')}\n`;
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'WBI_B2B_Bulk_Jobs_Template.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`Copied ${text}`);
    } catch {
      toast.error('Copy is not available in this browser');
    }
  };

  if (error) return <ErrorState error={error} onRetry={refetch} />;
  const limits = data?.limits;

  return (
    <div className="space-y-6 pb-10">
      <PageHeader
        title="Templates"
        subtitle="Start every upload from the official template so each row is read correctly."
        actions={
          <>
            <button type="button" className={btnSecondary} onClick={downloadCsvHeader} disabled={!data}>
              <FiDownload /> Blank CSV
            </button>
            <button type="button" className={btnSecondary}
              onClick={() => downloadFile('/b2b/bulk-jobs/sample', { fallbackName: 'WBI_B2B_Bulk_Jobs_Sample.xlsx', label: 'Preparing template…' })}>
              <FiDownload /> Excel template with examples
            </button>
            <Link to="/b2b/bulk-jobs/upload" className={btnPrimary}><FiUploadCloud /> Upload jobs</Link>
          </>
        }
      />

      <Card title="Upload limits" subtitle="Set by WBI for all accounts">
        {isLoading ? <div className="h-12 bg-gray-50 rounded animate-pulse" /> : (
          <dl className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
            <div><dt className="text-gray-500 text-xs">Rows per file</dt><dd className="font-semibold mt-0.5">up to {limits.maxRows.toLocaleString('en-IN')}</dd></div>
            <div><dt className="text-gray-500 text-xs">File size</dt><dd className="font-semibold mt-0.5">up to {limits.maxFileSizeMb} MB</dd></div>
            <div><dt className="text-gray-500 text-xs">File types</dt><dd className="font-semibold mt-0.5">{limits.allowedExtensions.join(', ')}</dd></div>
            <div>
              <dt className="text-gray-500 text-xs">Duplicate check</dt>
              <dd className="font-semibold mt-0.5">
                {limits.duplicateCheckEnabled ? `Same phone, address and service within ${limits.duplicateWindowDays} days` : 'Off'}
              </dd>
            </div>
          </dl>
        )}
        {limits?.rejectUnknownColumns && (
          <p className="text-xs text-amber-700 mt-3">Files with columns not listed below are rejected.</p>
        )}
      </Card>

      <Card title="Columns" subtitle="Required columns must be filled on every row. Header names are matched case-insensitively.">
        <div className="overflow-x-auto -m-5">
          <table className="w-full text-sm">
            <thead className="bg-gray-50/60 text-[11px] uppercase tracking-wider text-gray-500">
              <tr>
                <th className="py-3 px-5 text-left">Column header</th>
                <th className="py-3 px-5 text-left">Required</th>
                <th className="py-3 px-5 text-left">What to enter</th>
                <th className="py-3 px-5 text-left">Also accepted as</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 align-top">
              {isLoading ? (
                <tr><td colSpan={4} className="p-5"><div className="h-40 bg-gray-50 rounded animate-pulse" /></td></tr>
              ) : data.columns.map((c) => (
                <tr key={c.field}>
                  <td className="py-3 px-5 font-semibold text-gray-900 whitespace-nowrap">{c.header}</td>
                  <td className="py-3 px-5">{c.required ? <Badge tone="red">Required</Badge> : <Badge>Optional</Badge>}</td>
                  <td className="py-3 px-5 text-gray-600">
                    {c.note}
                    {c.field === 'priority' && <span className="text-gray-500"> ({data.priorities.join(', ')})</span>}
                  </td>
                  <td className="py-3 px-5 text-xs text-gray-500">{c.aliases.length ? c.aliases.join(', ') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card
        title="Service types and keys"
        subtitle={data?.servicesRestricted ? 'The services your account is allowed to raise jobs for' : 'Services available on the platform'}
        actions={
          <div className="relative">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input value={serviceQuery} onChange={(e) => setServiceQuery(e.target.value)} placeholder="Find a service" className={`${inputCls} pl-9`} />
          </div>
        }
      >
        {isLoading ? <div className="h-24 bg-gray-50 rounded animate-pulse" /> : services.length === 0 ? (
          <EmptyState title="No matching service" />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {services.map((s) => (
              <div key={s.key} className="flex items-center justify-between gap-2 border border-gray-100 rounded-lg px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm text-gray-800 truncate">{s.name}</p>
                  <p className="text-xs font-mono text-gray-500">{s.key}</p>
                </div>
                <button type="button" onClick={() => copy(s.key)} className="p-2 text-gray-400 hover:text-brand" aria-label={`Copy key ${s.key}`}>
                  <FiCopy className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
};

export default Templates;
