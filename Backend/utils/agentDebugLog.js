const fs = require('fs');
const path = require('path');

const LOG_PATH = path.join(__dirname, '..', '..', 'debug-7d825b.log');
const ENDPOINT = 'http://127.0.0.1:7577/ingest/6011d822-6630-4485-85a2-a11dfd06147b';

/** Dual-write debug NDJSON (file + ingest). Never log secrets/PII. */
function agentDebugLog({ hypothesisId, location, message, data = {}, runId = 'pre-fix' }) {
  const payload = {
    sessionId: '7d825b',
    runId,
    hypothesisId,
    location,
    message,
    data,
    timestamp: Date.now()
  };
  try {
    fs.appendFileSync(LOG_PATH, `${JSON.stringify(payload)}\n`);
  } catch (_) {
    /* ignore */
  }
  try {
    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '7d825b' },
      body: JSON.stringify(payload)
    }).catch(() => {});
  } catch (_) {
    /* ignore */
  }
}

module.exports = { agentDebugLog, LOG_PATH };
