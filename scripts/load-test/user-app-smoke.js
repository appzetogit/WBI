/**
 * Node smoke (no k6 required) — probes ops + User App read paths.
 *
 *   node scripts/load-test/user-app-smoke.js
 *   BASE_URL=https://api.wbinfs.com ACCESS_TOKEN=eyJ... CONCURRENCY=20 DURATION_SEC=30 node scripts/load-test/user-app-smoke.js
 *
 * Exit 0 if failureRate < 1% and ready=200 and home p95 < 500ms.
 */
const BASE = (process.env.BASE_URL || process.env.API_BASE || 'http://127.0.0.1:5000').replace(/\/$/, '');
const TOKEN = process.env.ACCESS_TOKEN || '';
const CONCURRENCY = parseInt(process.env.CONCURRENCY, 10) || 5;
const DURATION_SEC = parseInt(process.env.DURATION_SEC, 10) || 15;

const stats = {
  ok: 0,
  fail: 0,
  byName: {},
  home: [],
  ready: [],
};

function record(name, ok, ms) {
  if (!stats.byName[name]) stats.byName[name] = { ok: 0, fail: 0, latencies: [] };
  if (ok) {
    stats.ok++;
    stats.byName[name].ok++;
  } else {
    stats.fail++;
    stats.byName[name].fail++;
  }
  stats.byName[name].latencies.push(ms);
  if (name === 'home') stats.home.push(ms);
  if (name === 'ready') stats.ready.push(ms);
}

function pXX(arr, q) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return Math.round(s[Math.min(s.length - 1, Math.floor(s.length * q))]);
}

async function hit(name, path, { auth = false } = {}) {
  const headers = { Accept: 'application/json' };
  if (auth && TOKEN) headers.Authorization = `Bearer ${TOKEN}`;
  const t0 = performance.now();
  try {
    const r = await fetch(`${BASE}${path}`, { headers, signal: AbortSignal.timeout(15000) });
    const ms = performance.now() - t0;
    let ok = r.ok;
    if (name === 'ready' || name === 'live' || name === 'health') ok = r.status === 200;
    if (name === 'home' && r.ok) {
      try {
        const j = await r.json();
        ok = j.success === true;
      } catch {
        ok = false;
      }
    }
    record(name, ok, ms);
  } catch {
    record(name, false, performance.now() - t0);
  }
}

async function oneLoop(i) {
  await hit('live', '/live');
  await hit('ready', '/ready');
  await hit('health', '/health');
  await hit('home', '/api/user/home');
  await hit('home_v1', '/api/v1/user/home');
  if (TOKEN) {
    await hit('bookings', '/api/users/bookings?page=1&limit=10', { auth: true });
    await hit('pay_config', '/api/user/payment-methods/config', { auth: true });
  }
}

async function run() {
  console.log(`[smoke] ${BASE} concurrency=${CONCURRENCY} duration=${DURATION_SEC}s token=${TOKEN ? 'yes' : 'no'}`);
  const end = Date.now() + DURATION_SEC * 1000;
  let n = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (Date.now() < end) {
        await oneLoop(n++);
      }
    })
  );

  const total = stats.ok + stats.fail;
  const failureRate = total ? stats.fail / total : 1;
  const report = {
    base: BASE,
    total,
    ok: stats.ok,
    fail: stats.fail,
    failureRate: Number(failureRate.toFixed(4)),
    rps: Number((total / DURATION_SEC).toFixed(1)),
    latencyMs: {
      home_p50: pXX(stats.home, 0.5),
      home_p95: pXX(stats.home, 0.95),
      ready_p95: pXX(stats.ready, 0.95),
    },
    byName: Object.fromEntries(
      Object.entries(stats.byName).map(([k, v]) => [
        k,
        { ok: v.ok, fail: v.fail, p95: pXX(v.latencies, 0.95) },
      ])
    ),
  };

  console.log(JSON.stringify(report, null, 2));

  const pass =
    failureRate < 0.01 &&
    report.latencyMs.home_p95 < 500 &&
    report.latencyMs.ready_p95 < 200 &&
    (stats.byName.ready?.fail || 0) === 0;

  if (!pass) {
    console.error('[smoke] FAIL — see thresholds: failRate<1%, home p95<500ms, ready always 200');
    process.exit(1);
  }
  console.log('[smoke] PASS');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
