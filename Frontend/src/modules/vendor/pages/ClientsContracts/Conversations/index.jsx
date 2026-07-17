import React, { useState, useEffect, useCallback } from 'react';
import { MessageSquare, Send, Pin } from 'lucide-react';
import {
  fetchConversations, fetchConversationById, sendConversationMessage, timeAgo
} from '../../../services/clientsContractsService';
import { useClientsContracts } from '../context/ClientsContractsContext';
import EmptyState from '../../BusinessIntake/components/EmptyState';

const CHANNELS = [
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'Unread' },
  { key: 'project', label: 'Projects' },
  { key: 'contract', label: 'Contracts' },
  { key: 'payment', label: 'Payments' },
  { key: 'support', label: 'Support' }
];

const Conversations = () => {
  const { refreshKey } = useClientsContracts();
  const [channel, setChannel] = useState('all');
  const [threads, setThreads] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [active, setActive] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const loadThreads = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (channel === 'unread') params.unread = 'true';
      else if (channel !== 'all') params.channel = channel;
      const res = await fetchConversations(params);
      const list = res.data.data || [];
      setThreads(list);
      if (list.length && !activeId) setActiveId(list[0]._id);
    } catch {
      setThreads([]);
    } finally {
      setLoading(false);
    }
  }, [channel, activeId]);

  useEffect(() => { setActiveId(null); }, [channel, refreshKey]);
  useEffect(() => { loadThreads(); }, [loadThreads, refreshKey]);

  useEffect(() => {
    if (!activeId) { setActive(null); return; }
    (async () => {
      try {
        const res = await fetchConversationById(activeId);
        setActive(res.data.data);
        setThreads((prev) => prev.map((t) => (t._id === activeId ? { ...t, unreadCount: 0 } : t)));
      } catch { /* ignore */ }
    })();
  }, [activeId]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!message.trim() || !activeId) return;
    setSending(true);
    try {
      await sendConversationMessage(activeId, { text: message.trim() });
      setMessage('');
      const res = await fetchConversationById(activeId);
      setActive(res.data.data);
      loadThreads();
    } catch {
      alert('Failed to send message');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col md:flex-row gap-4 min-h-[480px]">
      <div className="w-full md:w-80 shrink-0 flex flex-col border border-gray-200 rounded-xl overflow-hidden">
        <div className="flex gap-1 p-2 overflow-x-auto border-b border-gray-100 bg-gray-50">
          {CHANNELS.map((c) => (
            <button
              key={c.key}
              onClick={() => setChannel(c.key)}
              className={`px-2.5 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap ${
                channel === c.key ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto max-h-[420px]">
          {loading ? (
            <div className="p-4 space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-16 bg-gray-100 rounded-lg animate-pulse" />)}</div>
          ) : threads.length === 0 ? (
            <div className="p-6 text-center text-sm text-gray-500">No conversations</div>
          ) : (
            threads.map((t) => (
              <button
                key={t._id}
                onClick={() => setActiveId(t._id)}
                className={`w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors ${
                  activeId === t._id ? 'bg-blue-50' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-gray-900 line-clamp-1 flex items-center gap-1">
                    {t.pinned && <Pin className="h-3 w-3 text-blue-500" />}
                    {t.subject}
                  </p>
                  {t.unreadCount > 0 && (
                    <span className="min-w-[18px] h-[18px] text-[10px] font-bold rounded-full bg-blue-600 text-white flex items-center justify-center">
                      {t.unreadCount}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-0.5">{t.clientId?.company || t.clientId?.name || 'Client'}</p>
                <p className="text-xs text-gray-400 mt-1 line-clamp-1">{t.lastMessage?.text || '—'}</p>
                <p className="text-[10px] text-gray-400 mt-1">{timeAgo(t.lastMessageAt)}</p>
              </button>
            ))
          )}
        </div>
      </div>

      <div className="flex-1 border border-gray-200 rounded-xl flex flex-col min-h-[400px]">
        {!active ? (
          <div className="flex-1 flex items-center justify-center">
            <EmptyState icon={MessageSquare} title="Select a conversation" description="Choose a thread to view messages." />
          </div>
        ) : (
          <>
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="font-bold text-gray-900">{active.subject}</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                {active.clientId?.company || active.clientId?.name} · {active.channel}
              </p>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-3 max-h-[320px]">
              {(active.messages || []).map((m, i) => (
                <div
                  key={m._id || i}
                  className={`flex ${m.sender === 'vendor' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
                      m.sender === 'vendor'
                        ? 'bg-blue-600 text-white rounded-br-md'
                        : 'bg-gray-100 text-gray-800 rounded-bl-md'
                    }`}
                  >
                    <p>{m.text}</p>
                    <p className={`text-[10px] mt-1 ${m.sender === 'vendor' ? 'text-blue-100' : 'text-gray-400'}`}>
                      {timeAgo(m.createdAt)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <form onSubmit={handleSend} className="p-4 border-t border-gray-100 flex gap-2">
              <input
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Type a message..."
                className="flex-1 px-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
              />
              <button
                type="submit"
                disabled={sending || !message.trim()}
                className="px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
};

export default Conversations;
