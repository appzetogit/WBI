import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FiPlus, FiSend, FiPaperclip, FiX, FiPhone, FiMail, FiMessageCircle, FiSearch, FiArrowLeft } from 'react-icons/fi';
import toast from 'react-hot-toast';
import api from '../../../../services/api';
import { useSocket } from '../../../../context/SocketContext';
import {
  PageHeader, StatCard, Pagination, EmptyState, ErrorState, TableSkeleton, Badge, Card,
  fmtDateTime, inputCls, btnPrimary, btnSecondary
} from '../../components/ui';

// Mirrors SupportTicket's enums on the server.
const CATEGORIES = ['Job Related', 'Engineer', 'Payment', 'Wallet', 'Invoice', 'Bulk Upload', 'Reports', 'Account', 'Other'];
const PRIORITIES = ['Low', 'Medium', 'High', 'Urgent'];
const STATUSES = ['Open', 'In Progress', 'Resolved', 'Closed'];
const STATUS_TONE = { Open: 'amber', 'In Progress': 'blue', Resolved: 'green', Closed: 'gray' };
const PRIORITY_TONE = { Low: 'gray', Medium: 'blue', High: 'amber', Urgent: 'red' };

/* ───────────── New ticket ───────────── */
const NewTicketForm = ({ prefill, onCreated, onCancel }) => {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    subject: prefill.jobCode ? `Job ${prefill.jobCode}` : '',
    category: prefill.jobId ? 'Job Related' : '',
    priority: 'Medium',
    description: ''
  });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const create = useMutation({
    mutationFn: async () => (await api.post('/b2b/support/tickets', {
      ...form,
      subject: form.subject.trim(),
      description: form.description.trim(),
      relatedJobId: prefill.jobId || undefined
    })).data,
    onSuccess: (res) => {
      toast.success(`Ticket ${res.data?.ticketNumber || ''} raised`);
      queryClient.invalidateQueries({ queryKey: ['b2bSupportTickets'] });
      queryClient.invalidateQueries({ queryKey: ['b2bSupportSummary'] });
      onCreated(res.data?._id);
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Could not raise the ticket')
  });

  const valid = form.subject.trim().length >= 3 && form.category && form.description.trim().length >= 10;

  return (
    <Card title="Raise a ticket" actions={<button type="button" onClick={onCancel} className="p-1 text-gray-400 hover:text-gray-700" aria-label="Close"><FiX /></button>}>
      <form onSubmit={(e) => { e.preventDefault(); if (valid) create.mutate(); }} className="space-y-4">
        {prefill.jobCode && (
          <p className="text-xs text-gray-600 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">Linked to job <strong>{prefill.jobCode}</strong></p>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label htmlFor="t-subject" className="block text-xs font-semibold text-gray-600 mb-1">Subject</label>
            <input id="t-subject" value={form.subject} onChange={set('subject')} maxLength={200} className={`${inputCls} w-full`} placeholder="What is the issue about?" required />
          </div>
          <div>
            <label htmlFor="t-category" className="block text-xs font-semibold text-gray-600 mb-1">Category</label>
            <select id="t-category" value={form.category} onChange={set('category')} className={`${inputCls} w-full`} required>
              <option value="">Select a category</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="t-priority" className="block text-xs font-semibold text-gray-600 mb-1">Priority</label>
            <select id="t-priority" value={form.priority} onChange={set('priority')} className={`${inputCls} w-full`}>
              {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="t-desc" className="block text-xs font-semibold text-gray-600 mb-1">Description</label>
            <textarea id="t-desc" value={form.description} onChange={set('description')} maxLength={5000} rows={5}
              className="w-full px-3 py-2 border border-gray-200 text-sm rounded-lg outline-none focus:ring-1 focus:ring-brand focus:border-brand resize-y"
              placeholder="Describe what happened, what you expected, and any job, invoice or upload IDs." required />
            <p className="text-[11px] text-gray-400 mt-1">At least 10 characters. You can attach files after the ticket is raised.</p>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className={btnSecondary}>Cancel</button>
          <button type="submit" disabled={!valid || create.isPending} className={btnPrimary}>
            <FiSend /> {create.isPending ? 'Raising…' : 'Raise ticket'}
          </button>
        </div>
      </form>
    </Card>
  );
};

/* ───────────── Ticket conversation ───────────── */
const TicketDetail = ({ ticketId, onBack }) => {
  const queryClient = useQueryClient();
  const socket = useSocket();
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState([]); // uploaded, not yet sent
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);
  const endRef = useRef(null);

  const { data: ticket, isLoading, error, refetch } = useQuery({
    queryKey: ['b2bSupportTicket', ticketId],
    queryFn: async () => (await api.get(`/b2b/support/tickets/${ticketId}`)).data.data
  });

  useEffect(() => {
    if (!socket) return undefined;
    const onMsg = (m) => {
      if (String(m?.ticketId) === String(ticketId)) queryClient.invalidateQueries({ queryKey: ['b2bSupportTicket', ticketId] });
    };
    const onStatus = (t) => {
      if (String(t?._id) === String(ticketId)) queryClient.invalidateQueries({ queryKey: ['b2bSupportTicket', ticketId] });
      queryClient.invalidateQueries({ queryKey: ['b2bSupportTickets'] });
    };
    socket.on('support:newMessage', onMsg);
    socket.on('support:statusChanged', onStatus);
    return () => {
      socket.off('support:newMessage', onMsg);
      socket.off('support:statusChanged', onStatus);
    };
  }, [socket, ticketId, queryClient]);

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [ticket?.conversation?.length]);

  const send = useMutation({
    mutationFn: async () => (await api.post(`/b2b/support/tickets/${ticketId}/messages`, { message: message.trim(), attachments: pending })).data,
    onSuccess: () => {
      setMessage('');
      setPending([]);
      queryClient.invalidateQueries({ queryKey: ['b2bSupportTicket', ticketId] });
      queryClient.invalidateQueries({ queryKey: ['b2bSupportTickets'] });
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Message not sent')
  });

  const close = useMutation({
    mutationFn: async () => (await api.patch(`/b2b/support/tickets/${ticketId}/close`)).data,
    onSuccess: () => {
      toast.success('Ticket closed');
      queryClient.invalidateQueries({ queryKey: ['b2bSupportTicket', ticketId] });
      queryClient.invalidateQueries({ queryKey: ['b2bSupportTickets'] });
      queryClient.invalidateQueries({ queryKey: ['b2bSupportSummary'] });
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Could not close the ticket')
  });

  const upload = async (file) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Attachments can be up to 10 MB');
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await api.post(`/b2b/support/tickets/${ticketId}/attachments`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setPending((p) => [...p, res.data.data]);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Upload failed');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  if (isLoading) return <div className="h-64 bg-white rounded-2xl border border-gray-100 animate-pulse" />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  const closed = ticket.status === 'Closed';

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-col min-h-[520px]">
      <div className="p-5 border-b border-gray-50 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <button type="button" onClick={onBack} className="text-xs font-semibold text-gray-500 hover:text-brand inline-flex items-center gap-1 mb-2"><FiArrowLeft /> All tickets</button>
          <p className="text-xs font-mono text-gray-500">{ticket.ticketNumber}</p>
          <h3 className="text-lg font-bold text-gray-900 break-words">{ticket.subject}</h3>
          <div className="flex flex-wrap gap-2 mt-2">
            <Badge tone={STATUS_TONE[ticket.status]}>{ticket.status}</Badge>
            <Badge tone={PRIORITY_TONE[ticket.priority]}>{ticket.priority}</Badge>
            <Badge>{ticket.category}</Badge>
            {ticket.relatedJobId?.jobId && <Badge tone="brand">Job {ticket.relatedJobId.jobId}</Badge>}
            {ticket.relatedInvoiceId?.invoiceNumber && <Badge tone="brand">Invoice {ticket.relatedInvoiceId.invoiceNumber}</Badge>}
          </div>
        </div>
        {!closed && (
          <button type="button" className={btnSecondary} disabled={close.isPending}
            onClick={() => { if (window.confirm('Close this ticket? You will need a new ticket to continue the conversation.')) close.mutate(); }}>
            Close ticket
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-gray-50/40 max-h-[520px]">
        {(ticket.conversation || []).map((m) => {
          const mine = m.senderRole === 'b2b';
          return (
            <div key={m._id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${mine ? 'bg-brand text-white rounded-tr-sm' : 'bg-white border border-gray-100 text-gray-800 rounded-tl-sm'}`}>
                <p className={`text-[11px] font-semibold mb-1 ${mine ? 'text-white/80' : 'text-gray-500'}`}>
                  {mine ? 'You' : (m.senderName || 'WBI Support')} · {fmtDateTime(m.createdAt)}
                </p>
                {m.message && <p className="whitespace-pre-wrap break-words">{m.message}</p>}
                {(m.attachments || []).map((a, i) => (
                  <a key={i} href={a.fileUrl} target="_blank" rel="noopener noreferrer"
                    className={`mt-2 flex items-center gap-1.5 text-xs underline ${mine ? 'text-white' : 'text-brand'}`}>
                    <FiPaperclip /> {a.fileName || 'Attachment'}
                  </a>
                ))}
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      {closed ? (
        <p className="p-4 text-sm text-gray-500 border-t border-gray-100">This ticket is closed. Raise a new ticket to continue.</p>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); if (message.trim() || pending.length) send.mutate(); }} className="p-4 border-t border-gray-100 space-y-2">
          {pending.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {pending.map((a, i) => (
                <span key={i} className="inline-flex items-center gap-1 text-xs bg-gray-100 rounded-full px-2 py-1">
                  <FiPaperclip /> {a.fileName}
                  <button type="button" onClick={() => setPending((p) => p.filter((_, j) => j !== i))} aria-label={`Remove ${a.fileName}`}><FiX /></button>
                </span>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <input type="file" ref={fileRef} className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
            <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className={btnSecondary} aria-label="Attach a file">
              <FiPaperclip /> {uploading ? '…' : ''}
            </button>
            <input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Write a reply" className={`${inputCls} flex-1`} maxLength={5000} />
            <button type="submit" disabled={send.isPending || (!message.trim() && !pending.length)} className={btnPrimary}>
              <FiSend /> Send
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

/* ───────────── Page ───────────── */
const Support = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const prefill = { jobId: searchParams.get('jobId') || '', jobCode: searchParams.get('jobCode') || '' };
  const [creating, setCreating] = useState(Boolean(prefill.jobId));
  const [selected, setSelected] = useState(searchParams.get('ticket') || null);
  const [filters, setFilters] = useState({ status: '', category: '', priority: '' });
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(1);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 400);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => setPage(1), [filters, debounced]);

  const { data: summary, isLoading: loadingSummary } = useQuery({
    queryKey: ['b2bSupportSummary'],
    queryFn: async () => (await api.get('/b2b/support/summary')).data.data
  });
  const { data: contact } = useQuery({
    queryKey: ['publicConfig'],
    queryFn: async () => (await api.get('/public/config')).data.settings,
    staleTime: 10 * 60_000
  });

  const params = { ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)), search: debounced || undefined };
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['b2bSupportTickets', params, page],
    queryFn: async () => (await api.get('/b2b/support/tickets', { params: { ...params, page, limit: 15 } })).data,
    placeholderData: (prev) => prev
  });
  const tickets = data?.data || [];
  const p = data?.pagination;

  const openTicket = (id) => {
    setSelected(id);
    setCreating(false);
    setSearchParams(id ? { ticket: id } : {});
  };

  const statusCard = (key, label, s) => (
    <StatCard key={key} label={label} value={summary?.[key] ?? 0} loading={loadingSummary}
      onClick={() => setFilters((f) => ({ ...f, status: f.status === s ? '' : s }))} active={filters.status === s} />
  );

  return (
    <div className="space-y-6 pb-10">
      <PageHeader
        title="Support"
        subtitle="Raise and follow tickets with WBI support."
        actions={!creating && <button type="button" className={btnPrimary} onClick={() => { setCreating(true); setSelected(null); }}><FiPlus /> New ticket</button>}
      />

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatCard label="All tickets" value={summary?.total ?? 0} loading={loadingSummary}
          onClick={() => setFilters((f) => ({ ...f, status: '' }))} active={!filters.status} />
        {statusCard('open', 'Open', 'Open')}
        {statusCard('in_progress', 'In progress', 'In Progress')}
        {statusCard('resolved', 'Resolved', 'Resolved')}
        {statusCard('closed', 'Closed', 'Closed')}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
        <div className="xl:col-span-2 space-y-6">
          {creating && (
            <NewTicketForm
              prefill={prefill}
              onCreated={(id) => openTicket(id)}
              onCancel={() => { setCreating(false); setSearchParams({}); }}
            />
          )}

          {selected && !creating ? (
            <TicketDetail ticketId={selected} onBack={() => openTicket(null)} />
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
              <div className="flex flex-wrap items-center gap-3 p-4 border-b border-gray-50">
                <div className="relative flex-1 min-w-[200px]">
                  <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Ticket number or subject" className={`${inputCls} w-full pl-9`} />
                </div>
                <select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))} className={inputCls} aria-label="Status">
                  <option value="">All statuses</option>
                  {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <select value={filters.category} onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value }))} className={inputCls} aria-label="Category">
                  <option value="">All categories</option>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <select value={filters.priority} onChange={(e) => setFilters((f) => ({ ...f, priority: e.target.value }))} className={inputCls} aria-label="Priority">
                  <option value="">All priorities</option>
                  {PRIORITIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50/60 text-[11px] uppercase tracking-wider text-gray-500">
                    <tr>
                      <th className="py-3 px-4">Ticket</th>
                      <th className="py-3 px-4">Category</th>
                      <th className="py-3 px-4">Priority</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 whitespace-nowrap">Last activity</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {isLoading ? <TableSkeleton cols={5} /> : error ? (
                      <tr><td colSpan={5}><ErrorState error={error} onRetry={refetch} /></td></tr>
                    ) : tickets.length === 0 ? (
                      <tr><td colSpan={5}><EmptyState title="No tickets" message="Raise a ticket and WBI support will reply here." /></td></tr>
                    ) : tickets.map((t) => (
                      <tr key={t._id} onClick={() => openTicket(t._id)} className="hover:bg-gray-50/60 cursor-pointer">
                        <td className="py-3 px-4">
                          <p className="text-xs font-mono text-gray-500">{t.ticketNumber}</p>
                          <p className="font-semibold text-gray-900">{t.subject}</p>
                        </td>
                        <td className="py-3 px-4 text-gray-700">{t.category}</td>
                        <td className="py-3 px-4"><Badge tone={PRIORITY_TONE[t.priority]}>{t.priority}</Badge></td>
                        <td className="py-3 px-4"><Badge tone={STATUS_TONE[t.status]}>{t.status}</Badge></td>
                        <td className="py-3 px-4 text-xs text-gray-600 whitespace-nowrap">{fmtDateTime(t.lastMessageAt || t.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {p && <Pagination page={p.page} totalPages={p.pages} total={p.total} limit={p.limit} onPage={setPage} />}
            </div>
          )}
        </div>

        <Card title="Contact WBI support">
          {contact?.supportPhone || contact?.supportEmail || contact?.supportWhatsapp ? (
            <ul className="space-y-3 text-sm">
              {contact.supportPhone && (
                <li><a href={`tel:${contact.supportPhone}`} className="flex items-center gap-2 text-gray-800 hover:text-brand"><FiPhone className="text-brand" /> {contact.supportPhone}</a></li>
              )}
              {contact.supportEmail && (
                <li><a href={`mailto:${contact.supportEmail}`} className="flex items-center gap-2 text-gray-800 hover:text-brand break-all"><FiMail className="text-brand" /> {contact.supportEmail}</a></li>
              )}
              {contact.supportWhatsapp && (
                <li>
                  <a href={`https://wa.me/${String(contact.supportWhatsapp).replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-gray-800 hover:text-brand">
                    <FiMessageCircle className="text-brand" /> WhatsApp {contact.supportWhatsapp}
                  </a>
                </li>
              )}
            </ul>
          ) : (
            <p className="text-sm text-gray-500">Raise a ticket and the support team will respond here.</p>
          )}
        </Card>
      </div>
    </div>
  );
};

export default Support;
