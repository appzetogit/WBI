/**
 * Lightweight circuit breaker for external HTTP / payment / SMS gateways.
 * States: closed → open (after threshold failures) → half-open (probe).
 */
const logger = require('./logger');

const DEFAULTS = {
  failureThreshold: parseInt(process.env.CB_FAILURE_THRESHOLD, 10) || 5,
  resetTimeoutMs: parseInt(process.env.CB_RESET_TIMEOUT_MS, 10) || 30000,
  halfOpenSuccesses: parseInt(process.env.CB_HALF_OPEN_SUCCESSES, 10) || 2
};

const circuits = new Map();

function getCircuit(name, options = {}) {
  const cfg = { ...DEFAULTS, ...options };
  if (!circuits.has(name)) {
    circuits.set(name, {
      name,
      state: 'closed',
      failures: 0,
      successes: 0,
      openedAt: null,
      cfg
    });
  }
  return circuits.get(name);
}

async function execute(name, fn, options = {}) {
  const circuit = getCircuit(name, options);
  const now = Date.now();

  if (circuit.state === 'open') {
    if (now - circuit.openedAt >= circuit.cfg.resetTimeoutMs) {
      circuit.state = 'half-open';
      circuit.successes = 0;
      logger.info('circuit.half_open', { circuit: name });
    } else {
      const err = new Error(`Circuit "${name}" is open — upstream unavailable`);
      err.code = 'CIRCUIT_OPEN';
      err.retryAfterMs = circuit.cfg.resetTimeoutMs - (now - circuit.openedAt);
      throw err;
    }
  }

  try {
    const result = await fn();
    if (circuit.state === 'half-open') {
      circuit.successes += 1;
      if (circuit.successes >= circuit.cfg.halfOpenSuccesses) {
        circuit.state = 'closed';
        circuit.failures = 0;
        logger.info('circuit.closed', { circuit: name });
      }
    } else {
      circuit.failures = 0;
    }
    return result;
  } catch (err) {
    circuit.failures += 1;
    if (circuit.state === 'half-open' || circuit.failures >= circuit.cfg.failureThreshold) {
      circuit.state = 'open';
      circuit.openedAt = now;
      logger.warn('circuit.opened', { circuit: name, failures: circuit.failures, err: err.message });
    }
    throw err;
  }
}

function getStatus(name) {
  const c = circuits.get(name);
  if (!c) return { state: 'closed', failures: 0 };
  return { state: c.state, failures: c.failures, openedAt: c.openedAt };
}

module.exports = { execute, getStatus, getCircuit };
