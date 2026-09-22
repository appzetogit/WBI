import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FiHeadphones, FiLoader, FiSend, FiArrowLeft, FiPaperclip, FiSearch } from 'react-icons/fi';
import { toast } from 'react-hot-toast';
import api from '../../../../services/api';
import { useSocket } from '../../../../context/SocketContext';
import CardShell from '../UserCategories/components/CardShell';

/**
 * B2B support desk. Tickets raised in the B2B panel land here; replies and
 * status changes go back to the company in real time over the existing
 * support socket events. Internal notes are visible to admins only.
 */

const STATUSES = ['Open', 'In Progress', 'Resolved', 'Closed'];
const STATUS_STYLE = {
  Open: 'bg-orange-100 text-orange-700',
  'In Progress': 'bg-blue-100 text-blue-700',
  Resolved: 'bg-green-100 text-green-700',
  Closed: 'bg-gray-200 text-gray-600'
};
const PRIORITY_STYLE = { Urgent: 'text-red-600', High: 'text-orange-600', Medium: 'text-blue-600', Low: 'text-gray-500' };
const errMsg = (e, f) => e?.response?.data?.message || f;
const when = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');

const TicketDetail = ({ ticketId, onBack, onChanged }) => {
  const socket = useSocket();
  const [ticket, setTicket] = useState(null);
  const [message, setMessage] = useState('');
  const [internal, setInternal] = useState(false);
  const [sending, setSending] = useState(false);
  const endRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get(`/admin/b2b/support/tickets/${ticketId}`);
      setTicket(res.data?.data || null);
    } catch (e) {
      toast.error(errMsg(e, 'Failed to load ticket'));
    }
  }, [ticketId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [ticket?.conversation?.length, ticket?.messages?.length]);

  useEffect(() => {
    if (!socket) return undefined;
    const onMsg = (m) => { if (String(m?.ticketId) === String(ticketId)) load(); };
    socket.on('support:newMessage', onMsg);
    return () => socket.off('support:newMessage', onMsg);
  }, [socket, ticketId, load]);

  const send = async (e) => {
    e.preventDefault();
    if (!message.trim()) return;
    setSending(true);
    try {
      await api.post(`/admin/b2b/support/tickets/${ticketId}/messages`, { message: message.trim(), isInternalNote: internal });
      setMessage('');
      await load();
      onChanged();
    } catch (err) {
      toast.error(errMsg(err, 'Message not sent'));
    } finally {
      setSending(false);
    }
  };

  const setStatus = async (status) => {
    try {
      await api.patch(`/admin/b2b/support/tickets/${ticketId}/status`, { status });
      toast.success(`Ticket marked ${status}`);
      await load();
      onChanged();
    } catch (err) {
      toast.error(errMsg(err, 'Status not changed'));
    }
  };

  if (!ticket) return <div className="flex justify-center py-16"><FiLoader className="w-8 h-8 animate-spin text-gray-400" /></div>;
  const messages = ticket.conversation || ticket.messages || [];

  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="text-xs font-bold text-gray-500 hover:text-blue-600 flex items-center gap-1"><FiArrowLeft /> All tickets</button>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-mono text-gray-400">{ticket.ticketNumber}</p>
          <h3 className="text-base font-bold text-gray-900">{ticket.subject}</h3>
          <p className="text-xs text-gray-500 mt-1">
            {ticket.companyId?.companyName || '—'} · {ticket.category} · <span className={`font-bold ${PRIORITY_STYLE[ticket.priority] || ''}`}>{ticket.priority}</span>
            {ticket.relatedJobId?.jobId ? ` · Job ${ticket.relatedJobId.jobId}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${STATUS_STYLE[ticket.status] || ''}`}>{ticket.status}</span>
          <select value="" onChange={(e) => e.target.value && setStatus(e.target.value)} className="h-8 text-xs border border-gray-200 rounded-lg bg-white" aria-label="Change status">
            <option value="">Change status…</option>
            {STATUSES.filter((s) => s !== ticket.status).map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      <div className="border border-gray-100 rounded-xl bg-gray-50/50 p-4 space-y-3 max-h-[440px] overflow-y-auto">
        {messages.map((m) => {
          const admin = m.senderRole === 'admin';
          return (
            <div key={m._id} className={`flex ${admin ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${m.isInternalNote ? 'bg-amber-50 border border-amber-200 text-amber-900' : admin ? 'bg-blue-600 text-white' : 'bg-white border border-gray-100 text-gray-800'}`}>
                <p className={`text-[10px] font-bold mb-0.5 ${admin && !m.isInternalNote ? 'text-white/80' : 'text-gray-500'}`}>
                  {m.isInternalNote ? 'Internal note · ' : ''}{m.senderName || m.senderRole} · {when(m.createdAt)}
                </p>
                <p className="whitespace-pre-wrap break-words">{m.message}</p>
                {(m.attachments || []).map((a, i) => (
                  <a key={i} href={a.fileUrl} target="_blank" rel="noopener noreferrer" className="mt-1 flex items-center gap-1 text-xs underline"><FiPaperclip /> {a.fileName || 'Attachment'}</a>
                ))}
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      {ticket.status === 'Closed' ? (
        <p className="text-xs text-gray-500">Closed tickets cannot be replied to. Reopen it by changing the status.</p>
      ) : (
        <form onSubmit={send} className="space-y-2">
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} maxLength={5000}
            placeholder={internal ? 'Internal note — the company will not see this' : 'Reply to the company'}
            className="w-full border border-gray-200 text-sm rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/25" />
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-xs font-semibold text-gray-600">
              <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} /> Internal note
            </label>
            <button type="submit" disabled={sending || !message.trim()} className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 text-white text-xs font-bold px-4 py-2 rounded-xl flex items-center gap-1.5">
              <FiSend /> {sending ? 'Sending…' : internal ? 'Add note' : 'Send reply'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

const B2BSupport = () => {
  const socket = useSocket();
  const [loading, setLoading] = useState(true);
  const [tickets, setTickets] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/admin/b2b/support/tickets', { params: { page, limit: 20, status: status || undefined, search: query || undefined } });
      setTickets(res.data?.data || []);
      setPagination(res.data?.pagination || { page: 1, pages: 1, total: 0 });
    } catch (e) {
      toast.error(errMsg(e, 'Failed to load support tickets'));
    } finally {
      setLoading(false);
    }
  }, [page, status, query]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [status, query]);

  // New tickets from companies appear without a manual refresh.
  useEffect(() => {
    if (!socket) return undefined;
    const refresh = () => load();
    socket.on('admin:supportTicketCreated', refresh);
    socket.on('support:statusChanged', refresh);
    return () => {
      socket.off('admin:supportTicketCreated', refresh);
      socket.off('support:statusChanged', refresh);
    };
  }, [socket, load]);

  return (
    <CardShell icon={FiHeadphones} title="B2B support tickets">
      {selected ? (
        <TicketDetail ticketId={selected} onBack={() => setSelected(null)} onChanged={load} />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 mb-4">
            {['', ...STATUSES].map((s) => (
              <button key={s || 'all'} type="button" onClick={() => setStatus(s)}
                className={`text-xs font-bold px-3 py-1.5 rounded-xl ${status === s ? 'bg-blue-600 text-white' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'}`}>
                {s || 'All'}
              </button>
            ))}
            <form onSubmit={(e) => { e.preventDefault(); setQuery(search.trim()); }} className="relative ml-auto">
              <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Ticket number or subject"
                className="h-9 bg-gray-50 border border-gray-200 text-xs rounded-xl pl-9 pr-3 w-64" />
            </form>
          </div>

          {loading ? (
            <div className="flex justify-center py-16"><FiLoader className="w-8 h-8 animate-spin text-gray-400" /></div>
          ) : tickets.length === 0 ? (
            <p className="text-sm text-gray-500 py-8 text-center">No tickets{status ? ` with status ${status}` : ''}.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b">
                    <th className="py-3 pr-4">Ticket</th>
                    <th className="py-3 pr-4">Company</th>
                    <th className="py-3 pr-4">Category</th>
                    <th className="py-3 pr-4">Priority</th>
                    <th className="py-3 pr-4">Status</th>
                    <th className="py-3 pr-4">Last activity</th>
                  </tr>
                </thead>
                <tbody>
                  {tickets.map((t) => (
                    <tr key={t._id} onClick={() => setSelected(t._id)} className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer">
                      <td className="py-3 pr-4">
                        <p className="text-[11px] font-mono text-gray-400">{t.ticketNumber}</p>
                        <p className="font-medium text-gray-800">{t.subject || '—'}</p>
                      </td>
                      <td className="py-3 pr-4">{t.companyId?.companyName || t.companyName || '—'}</td>
                      <td className="py-3 pr-4">{t.category || '—'}</td>
                      <td className={`py-3 pr-4 font-semibold ${PRIORITY_STYLE[t.priority] || ''}`}>{t.priority || '—'}</td>
                      <td className="py-3 pr-4"><span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${STATUS_STYLE[t.status] || ''}`}>{t.status || '—'}</span></td>
                      <td className="py-3 pr-4 text-xs text-gray-500">{when(t.lastMessageAt || t.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {pagination.pages > 1 && (
                <div className="flex justify-between items-center pt-3 text-xs font-bold">
                  <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="text-blue-600 disabled:text-gray-300">Previous</button>
                  <span className="text-gray-500">Page {page} of {pagination.pages} · {pagination.total} tickets</span>
                  <button type="button" disabled={page >= pagination.pages} onClick={() => setPage((p) => p + 1)} className="text-blue-600 disabled:text-gray-300">Next</button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </CardShell>
  );
};

export default B2BSupport;
