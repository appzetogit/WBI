/**
 * Cursor + offset pagination helpers for MongoDB list endpoints.
 * Target: consistent API shape, index-friendly queries, <200ms lists at scale.
 */

const DEFAULT_LIMIT = parseInt(process.env.API_DEFAULT_PAGE_SIZE, 10) || 20;
const MAX_LIMIT = parseInt(process.env.API_MAX_PAGE_SIZE, 10) || 100;

function parsePaginationQuery(query = {}) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  let limit = parseInt(query.limit, 10) || DEFAULT_LIMIT;
  limit = Math.min(Math.max(1, limit), MAX_LIMIT);
  const skip = (page - 1) * limit;
  const cursor = query.cursor || query.after || null;
  return { page, limit, skip, cursor };
}

function buildOffsetMeta({ page, limit, total }) {
  const totalPages = Math.ceil(total / limit) || 1;
  return {
    page,
    limit,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1
  };
}

function buildCursorMeta({ limit, items, idField = '_id' }) {
  const last = items.length ? items[items.length - 1] : null;
  return {
    limit,
    count: items.length,
    nextCursor: last ? String(last[idField]) : null,
    hasNext: items.length === limit
  };
}

/**
 * Apply cursor filter (ObjectId-safe string compare on _id descending lists).
 */
function applyCursorFilter(baseFilter, cursor, sortDirection = -1) {
  if (!cursor) return baseFilter;
  const mongoose = require('mongoose');
  if (!mongoose.Types.ObjectId.isValid(cursor)) return baseFilter;
  const oid = new mongoose.Types.ObjectId(cursor);
  return {
    ...baseFilter,
    _id: sortDirection === -1 ? { $lt: oid } : { $gt: oid }
  };
}

function paginatedResponse({ data, meta }) {
  return { success: true, data, pagination: meta };
}

module.exports = {
  DEFAULT_LIMIT,
  MAX_LIMIT,
  parsePaginationQuery,
  buildOffsetMeta,
  buildCursorMeta,
  applyCursorFilter,
  paginatedResponse
};
