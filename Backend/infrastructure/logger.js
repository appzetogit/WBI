/**
 * Structured JSON logger — production-ready, no external deps.
 * Compatible with CloudWatch / ELK / Loki ingestion.
 */
const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const MIN_LEVEL = LEVELS[process.env.LOG_LEVEL] ?? (process.env.NODE_ENV === 'production' ? LEVELS.info : LEVELS.debug);

function serialize(meta) {
  if (!meta || typeof meta !== 'object') return meta;
  const out = { ...meta };
  if (meta.err instanceof Error) {
    out.err = { message: meta.err.message, stack: meta.err.stack, name: meta.err.name };
  }
  return out;
}

function log(level, message, meta = {}) {
  if (LEVELS[level] > MIN_LEVEL) return;
  const entry = {
    ts: new Date().toISOString(),
    level,
    msg: message,
    service: 'wbi-api',
    env: process.env.NODE_ENV || 'development',
    pid: process.pid,
    ...serialize(meta)
  };
  const line = JSON.stringify(entry);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

module.exports = {
  error: (msg, meta) => log('error', msg, meta),
  warn: (msg, meta) => log('warn', msg, meta),
  info: (msg, meta) => log('info', msg, meta),
  debug: (msg, meta) => log('debug', msg, meta),
  child: (bindings) => ({
    error: (msg, meta) => log('error', msg, { ...bindings, ...meta }),
    warn: (msg, meta) => log('warn', msg, { ...bindings, ...meta }),
    info: (msg, meta) => log('info', msg, { ...bindings, ...meta }),
    debug: (msg, meta) => log('debug', msg, { ...bindings, ...meta })
  })
};
