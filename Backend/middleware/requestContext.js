const crypto = require('crypto');

/**
 * Attach requestId + structured access log (production-safe, no body dumps).
 */
function requestContext(req, res, next) {
  const requestId = req.headers['x-request-id'] || crypto.randomUUID();
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);

  const start = process.hrtime.bigint();
  res.on('finish', () => {
    if (process.env.REQUEST_LOG_ENABLED !== 'true') return;
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      requestId,
      method: req.method,
      path: req.originalUrl?.split('?')[0],
      status: res.statusCode,
      latencyMs: Math.round(ms * 100) / 100,
      ip: req.ip,
      ua: (req.get('user-agent') || '').slice(0, 120)
    });
    console.log(`[access] ${line}`);
  });
  next();
}

module.exports = requestContext;
