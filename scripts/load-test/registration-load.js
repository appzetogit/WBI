/**
 * Registration / OTP load probe (run from a machine allowed to hit the API).
 *
 *   API_BASE=https://api.wbinfs.com CONCURRENCY=100 DURATION_SEC=60 node scripts/load-test/registration-load.js
 *
 * Does NOT send real OTP verify — measures send-otp / health throughput only.
 * For 100k+ simulation use k6 or Artillery on EC2 in the same VPC as the API.
 */
const API_BASE = (process.env.API_BASE || 'http://127.0.0.1:5000').replace(/\/$/, '');
const CONCURRENCY = parseInt(process.env.CONCURRENCY, 10) || 50;
const DURATION_SEC = parseInt(process.env.DURATION_SEC, 10) || 30;

const stats = { ok: 0, fail: 0, latencies: [] };

async function oneRequest(i) {
  const phone = `9${String(100000000 + (i % 900000000)).slice(-9)}`;
  const t0 = performance.now();
  try {
    const r = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(15000) });
    const ms = performance.now() - t0;
    stats.latencies.push(ms);
    if (r.ok) stats.ok++;
    else stats.fail++;
  } catch {
    stats.fail++;
  }
}

async function run() {
  console.log(`Load test: ${API_BASE} concurrency=${CONCURRENCY} duration=${DURATION_SEC}s`);
  const end = Date.now() + DURATION_SEC * 1000;
  let n = 0;
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (Date.now() < end) {
      await oneRequest(n++);
    }
  });
  await Promise.all(workers);
  const l = stats.latencies.sort((a, b) => a - b);
  const p50 = l[Math.floor(l.length * 0.5)] || 0;
  const p95 = l[Math.floor(l.length * 0.95)] || 0;
  const total = stats.ok + stats.fail;
  console.log(JSON.stringify({
    total,
    ok: stats.ok,
    fail: stats.fail,
    failureRate: total ? (stats.fail / total).toFixed(4) : 0,
    latencyMs: { p50: Math.round(p50), p95: Math.round(p95) },
    rps: (total / DURATION_SEC).toFixed(1)
  }, null, 2));
}

run();
