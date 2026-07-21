export const formatCurrency = (value) => {
  const n = Number(value || 0);
  return `₹${n.toLocaleString('en-IN')}`;
};

/** Amount with explicit + / − for ledger rows */
export const formatSignedCurrency = (value) => {
  const n = Number(value || 0);
  const abs = Math.abs(n).toLocaleString('en-IN');
  if (n > 0) return `+₹${abs}`;
  if (n < 0) return `−₹${abs}`;
  return `₹0`;
};

export const formatEngineerServiceLabel = (engineer) => {
  if (!engineer) return '—';
  if (engineer.serviceLabel) return engineer.serviceLabel;
  const cats = (engineer.serviceCategories || []).filter(Boolean);
  if (cats.length) {
    const shown = cats.slice(0, 2).join(', ');
    return cats.length > 2 ? `${shown} +${cats.length - 2}` : shown;
  }
  return engineer.primaryCategory || engineer.serviceCategory || '—';
};

export const formatDate = (dateStr, options = {}) => {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-IN', options);
};

export const getDateRange = (period) => {
  const end = new Date();
  const start = new Date();
  if (period === 'today') {
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }
  if (period === 'week') start.setDate(end.getDate() - 7);
  else if (period === 'month') start.setDate(end.getDate() - 30);
  else if (period === 'year') start.setDate(end.getDate() - 365);
  else start.setDate(end.getDate() - 30);
  return { start, end };
};

export const filterByDateRange = (data, start, end) => {
  const s = start instanceof Date ? start : new Date(start);
  const e = end instanceof Date ? end : new Date(end);
  return (data || []).filter((item) => {
    const d = new Date(item.date);
    return !Number.isNaN(d.getTime()) && d >= s && d <= e;
  });
};


