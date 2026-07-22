import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { HelpCircle, LifeBuoy, MessageSquare, Plus, Search, X } from 'lucide-react';
import { toast } from 'react-hot-toast';
import {
  createSupportTicket,
  fetchSupportTickets,
  updateSupportTicket,
  statusColors,
  badgeStyleFromColor
} from '../../services/globalModulesService';
import useVendorBasePath from '../../hooks/useVendorBasePath';
import EmptyState from '../BusinessIntake/components/EmptyState';
import Pagination from '../BusinessIntake/components/Pagination';

const PAGE = 10;

const Support = () => {
  const { categoryCode, categoryName } = useVendorBasePath() || {};
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ status: '', priority: '', category: '' });
  const [data, setData] = useState([]);
  const [stats, setStats] = useState([]);
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0, limit: PAGE });
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState(null);
  const [comment, setComment] = useState('');
  const [form, setForm] = useState({
    subject: '',
    description: '',
    category: '',
    priority: '',
    tags: [],
    customFields: {}
  });

  const categories = config?.categories || [];
  const priorities = config?.priorities || [];
  const statuses = config?.statuses || [];
  const knowledgeBase = config?.knowledgeBase || [];
  const workflow = config?.workflow || [];
  const customFields = config?.customFields || [];
  const statCodes = config?.dashboardStatStatusCodes?.length
    ? config.dashboardStatStatusCodes
    : statuses.slice(0, 4).map((s) => s.code);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchSupportTickets({
        page,
        limit: PAGE,
        search: search || undefined,
        status: filters.status || undefined,
        priority: filters.priority || undefined,
        category: filters.category || undefined,
        serviceCategoryCode: categoryCode || undefined
      });
      setData(res.data.data || []);
      setStats(res.data.stats || []);
      setPagination(res.data.pagination || { page: 1, pages: 1, total: 0, limit: PAGE });
      if (res.data.config) setConfig(res.data.config);
    } catch {
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [page, search, filters, categoryCode]);

  useEffect(() => {
    setPage(1);
  }, [search, filters, categoryCode]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!createOpen || !config) return;
    setForm((f) => ({
      ...f,
      category: f.category || categories[0]?.code || '',
      priority: f.priority || priorities.find((p) => p.code === 'medium')?.code || priorities[0]?.code || ''
    }));
  }, [createOpen, config, categories, priorities]);

  // Realtime refresh
  useEffect(() => {
    const onUpdate = () => load();
    window.addEventListener('support:ticketUpdated', onUpdate);
    window.addEventListener('support:ticketCreated', onUpdate);
    return () => {
      window.removeEventListener('support:ticketUpdated', onUpdate);
      window.removeEventListener('support:ticketCreated', onUpdate);
    };
  }, [load]);

  const count = (status) => stats.find((row) => row._id === status)?.count || 0;

  const labelFor = (list, code) => list.find((i) => i.code === code)?.label || String(code || '').replace(/_/g, ' ');
  const colorFor = (list, code) => list.find((i) => i.code === code)?.color;

  const vendorActionsFor = (ticket) =>
    workflow.filter(
      (t) =>
        t.from === ticket.status &&
        (t.allowedRoles || []).map((r) => String(r).toLowerCase()).includes('vendor')
    );

  const openCreate = () => {
    setForm({
      subject: '',
      description: '',
      category: categories[0]?.code || '',
      priority: priorities.find((p) => p.code === 'medium')?.code || priorities[0]?.code || '',
      tags: [],
      customFields: {}
    });
    setCreateOpen(true);
  };

  const submitCreate = async (e) => {
    e.preventDefault();
    if (!form.subject.trim()) return toast.error('Subject is required');
    setSaving(true);
    try {
      await createSupportTicket({
        ...form,
        serviceCategoryCode: categoryCode || '',
        serviceCategoryName: categoryName || ''
      });
      toast.success('Ticket created');
      setCreateOpen(false);
      load();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to create ticket');
    } finally {
      setSaving(false);
    }
  };

  const act = async (ticket, action, message) => {
    try {
      await updateSupportTicket(ticket._id, { action, message });
      toast.success('Ticket updated');
      load();
      if (selected?._id === ticket._id) {
        const refreshed = (await fetchSupportTickets({ page, limit: PAGE })).data.data?.find((t) => t._id === ticket._id);
        setSelected(refreshed || null);
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Action failed');
    }
  };

  const sendComment = async () => {
    if (!selected || !comment.trim()) return;
    try {
      await updateSupportTicket(selected._id, { action: 'comment', message: comment.trim() });
      setComment('');
      toast.success('Comment added');
      load();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to comment');
    }
  };

  const applicableFields = useMemo(() => {
    return customFields.filter((f) => {
      if (!f.appliesToCategories?.length) return true;
      return f.appliesToCategories.includes(form.category);
    });
  }, [customFields, form.category]);

  return (
    <div className="min-h-full p-6 bg-gray-50/80 lg:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <span className="flex items-center justify-center w-9 h-9 bg-blue-600 rounded-xl">
              <HelpCircle className="w-5 h-5 text-white" />
            </span>
            Support
          </h1>
          <p className="mt-1.5 ml-[46px] text-sm text-gray-500">
            Ticket workflow, comments, timelines and knowledge base for vendor help.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg"
        >
          <Plus className="w-4 h-4" /> Create Ticket
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-5 md:grid-cols-4">
        {statCodes.map((code) => (
          <div key={code} className="p-4 bg-white border border-gray-200 rounded-xl shadow-sm">
            <p className="text-2xl font-bold text-gray-900">{count(code)}</p>
            <p className="text-xs text-gray-500 capitalize">{labelFor(statuses, code)}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-4">
        <div className="xl:col-span-3">
          <div className="flex flex-wrap gap-3 p-4 mb-4 bg-white border border-gray-200 rounded-xl shadow-sm">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute w-4 h-4 text-gray-400 left-3 top-1/2 -translate-y-1/2" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search tickets..."
                className="w-full py-2.5 pl-9 pr-3 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <select
              value={filters.status}
              onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
              className="px-3 py-2.5 text-sm bg-white border border-gray-200 rounded-lg"
            >
              <option value="">All Status</option>
              {statuses.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.label}
                </option>
              ))}
            </select>
            <select
              value={filters.priority}
              onChange={(e) => setFilters((f) => ({ ...f, priority: e.target.value }))}
              className="px-3 py-2.5 text-sm bg-white border border-gray-200 rounded-lg"
            >
              <option value="">All Priority</option>
              {priorities.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.label}
                </option>
              ))}
            </select>
            <select
              value={filters.category}
              onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value }))}
              className="px-3 py-2.5 text-sm bg-white border border-gray-200 rounded-lg"
            >
              <option value="">All Categories</option>
              {categories.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-28 bg-gray-100 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : data.length === 0 ? (
            <EmptyState
              icon={LifeBuoy}
              title="No support tickets"
              description="Create tickets for technical, payment, project, quality or inventory issues."
            />
          ) : (
            <>
              <div className="space-y-3">
                {data.map((ticket) => (
                  <div
                    key={ticket._id}
                    className="p-4 bg-white border border-gray-200 rounded-xl shadow-sm cursor-pointer hover:border-blue-200"
                    onClick={() => setSelected(ticket)}
                  >
                    <div className="flex flex-wrap justify-between gap-3">
                      <div>
                        <p className="font-mono text-[11px] text-gray-400">{ticket.ticketCode}</p>
                        <h3 className="font-bold text-gray-900">{ticket.subject}</h3>
                        <p className="text-xs text-gray-500">
                          {labelFor(categories, ticket.category)} · {ticket.assignedTeam || 'Unassigned'} ·{' '}
                          {ticket.serviceCategoryName || 'Platform'}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span
                          className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-md border ${statusColors[ticket.status] || ''}`}
                          style={badgeStyleFromColor(colorFor(statuses, ticket.status))}
                        >
                          {labelFor(statuses, ticket.status)}
                        </span>
                        <span
                          className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-md border ${statusColors[ticket.priority] || ''}`}
                          style={badgeStyleFromColor(colorFor(priorities, ticket.priority))}
                        >
                          {labelFor(priorities, ticket.priority)}
                        </span>
                      </div>
                    </div>
                    <p className="mt-2 text-sm text-gray-600 line-clamp-2">{ticket.description}</p>
                    <p className="mt-1 text-xs text-gray-400">
                      {ticket.replies?.length || 0} comments · {ticket.attachmentsCount || 0} attachments
                      {ticket.slaBreached ? ' · SLA breached' : ''}
                    </p>
                    <div className="flex flex-wrap gap-2 mt-3" onClick={(e) => e.stopPropagation()}>
                      {vendorActionsFor(ticket).map((t) => (
                        <button
                          key={`${t.action}-${t.to}`}
                          type="button"
                          onClick={() => act(ticket, t.action, t.requiresComment ? window.prompt('Comment required') || '' : '')}
                          className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50"
                        >
                          {t.label || t.action}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <Pagination
                page={pagination.page}
                pages={pagination.pages}
                total={pagination.total}
                limit={pagination.limit}
                onPageChange={setPage}
                loading={loading}
              />
            </>
          )}
        </div>

        <div className="p-5 bg-white border border-gray-200 rounded-xl shadow-sm h-fit">
          <h2 className="flex items-center gap-2 mb-3 text-sm font-semibold text-gray-800">
            <MessageSquare className="w-4 h-4" /> Knowledge Base
          </h2>
          {knowledgeBase.length === 0 ? (
            <p className="text-sm text-gray-500">No articles published yet.</p>
          ) : (
            knowledgeBase.map((item) => (
              <div key={item.code} className="p-3 mb-2 text-sm font-medium text-gray-700 bg-gray-50 rounded-lg">
                <p>{item.title}</p>
                {item.summary && <p className="mt-0.5 text-xs font-normal text-gray-500">{item.summary}</p>}
              </div>
            ))
          )}
        </div>
      </div>

      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form onSubmit={submitCreate} className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">Create Support Ticket</h3>
              <button type="button" onClick={() => setCreateOpen(false)}>
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="space-y-3 text-sm">
              <label className="block">
                <span className="text-gray-600">Subject</span>
                <input
                  required
                  className="mt-1 w-full border rounded-lg px-3 py-2"
                  value={form.subject}
                  onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                />
              </label>
              <label className="block">
                <span className="text-gray-600">Description</span>
                <textarea
                  rows={4}
                  className="mt-1 w-full border rounded-lg px-3 py-2"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-gray-600">Category</span>
                  <select
                    className="mt-1 w-full border rounded-lg px-3 py-2"
                    value={form.category}
                    onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  >
                    {categories.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-gray-600">Priority</span>
                  <select
                    className="mt-1 w-full border rounded-lg px-3 py-2"
                    value={form.priority}
                    onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
                  >
                    {priorities.map((p) => (
                      <option key={p.code} value={p.code}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {applicableFields.map((field) => (
                <label key={field.key} className="block">
                  <span className="text-gray-600">
                    {field.label}
                    {field.required ? ' *' : ''}
                  </span>
                  {field.type === 'select' ? (
                    <select
                      required={field.required}
                      className="mt-1 w-full border rounded-lg px-3 py-2"
                      value={form.customFields[field.key] || ''}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          customFields: { ...f.customFields, [field.key]: e.target.value }
                        }))
                      }
                    >
                      <option value="">Select</option>
                      {(field.options || []).map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      required={field.required}
                      type={field.type === 'number' ? 'number' : 'text'}
                      placeholder={field.placeholder}
                      className="mt-1 w-full border rounded-lg px-3 py-2"
                      value={form.customFields[field.key] || ''}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          customFields: { ...f.customFields, [field.key]: e.target.value }
                        }))
                      }
                    />
                  )}
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button type="button" className="px-4 py-2 border rounded-lg" onClick={() => setCreateOpen(false)}>
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold disabled:opacity-50"
              >
                {saving ? 'Creating…' : 'Create Ticket'}
              </button>
            </div>
          </form>
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between gap-3 mb-3">
              <div>
                <p className="font-mono text-xs text-gray-400">{selected.ticketCode}</p>
                <h3 className="text-lg font-bold">{selected.subject}</h3>
              </div>
              <button type="button" onClick={() => setSelected(null)}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-gray-600 mb-4">{selected.description}</p>
            <div className="space-y-2 mb-4 max-h-48 overflow-y-auto">
              {(selected.replies || [])
                .filter((r) => !r.internal)
                .map((r, idx) => (
                  <div key={idx} className="p-2 bg-gray-50 rounded-lg text-sm">
                    <p className="text-xs text-gray-400">
                      {r.author} · {r.role}
                    </p>
                    <p>{r.message}</p>
                  </div>
                ))}
            </div>
            <div className="flex gap-2">
              <input
                className="flex-1 border rounded-lg px-3 py-2 text-sm"
                placeholder="Add a comment…"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
              <button type="button" onClick={sendComment} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold">
                Send
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Support;
