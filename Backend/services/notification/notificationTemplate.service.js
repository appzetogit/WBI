/** Cached admin overrides for notification events + {{var}} rendering. */
const NotificationTemplate = require('../../models/NotificationTemplate');

const CACHE_MS = 60 * 1000;
let cache = { at: 0, map: null };

const getOverrides = async () => {
  if (cache.map && Date.now() - cache.at < CACHE_MS) return cache.map;
  const rows = await NotificationTemplate.find({}).lean();
  cache = { at: Date.now(), map: new Map(rows.map((r) => [r.eventKey, r])) };
  return cache.map;
};

const clearTemplateCache = () => { cache = { at: 0, map: null }; };

const render = (text, data = {}) => String(text).replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, path) => {
  const v = path.split('.').reduce((o, k) => (o == null ? o : o[k]), data);
  return v === undefined || v === null ? '' : String(v);
});

/** Catalog text with {{placeholders}} in place of the data it reads (for the admin editor). */
const describeDefault = (fn) => {
  if (typeof fn !== 'function') return fn || '';
  const probe = new Proxy({}, { get: (_, key) => (typeof key === 'string' ? `{{${key}}}` : undefined) });
  try { return fn(probe); } catch (_) { return '(dynamic)'; }
};

module.exports = { getOverrides, clearTemplateCache, render, describeDefault };
