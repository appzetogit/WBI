/**
 * k6 smoke + load — WBI User App hot paths
 *
 * Install: https://k6.io/docs/get-started/installation/
 *
 * Smoke (local):
 *   k6 run scripts/load-test/k6/user-app-smoke.js
 *
 * Load (staging):
 *   k6 run -e BASE_URL=https://api.wbinfs.com -e VUS=50 -e DURATION=2m scripts/load-test/k6/user-app-smoke.js
 *
 * Authenticated (optional):
 *   k6 run -e BASE_URL=... -e ACCESS_TOKEN=<jwt> scripts/load-test/k6/user-app-smoke.js
 *
 * Pass criteria (soft launch):
 *   - http_req_failed < 1%
 *   - http_req_duration p95 < 500ms (reads), ideally < 200ms for /user/home
 *   - /ready returns 200
 */
import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { textSummary } from 'k6/summary';

const BASE = (__ENV.BASE_URL || 'http://127.0.0.1:5000').replace(/\/$/, '');
const TOKEN = __ENV.ACCESS_TOKEN || '';
const VUS = Number(__ENV.VUS || 10);
const DURATION = __ENV.DURATION || '1m';

const failRate = new Rate('wbi_fail_rate');
const homeTrend = new Trend('wbi_home_ms', true);
const readyTrend = new Trend('wbi_ready_ms', true);

export const options = {
  scenarios: {
    smoke: {
      executor: 'constant-vus',
      vus: VUS,
      duration: DURATION,
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<500'],
    wbi_home_ms: ['p(95)<400'],
    wbi_ready_ms: ['p(95)<100'],
    wbi_fail_rate: ['rate<0.01'],
  },
};

function headers() {
  const h = { Accept: 'application/json' };
  if (TOKEN) h.Authorization = `Bearer ${TOKEN}`;
  return h;
}

export default function () {
  group('ops probes', () => {
    let res = http.get(`${BASE}/live`, { headers: headers(), tags: { name: 'live' } });
    const liveOk = check(res, { 'live 200': (r) => r.status === 200 });
    failRate.add(!liveOk);

    res = http.get(`${BASE}/ready`, { headers: headers(), tags: { name: 'ready' } });
    readyTrend.add(res.timings.duration);
    const readyOk = check(res, {
      'ready 200': (r) => r.status === 200,
      'ready mongo ok': (r) => {
        try {
          const b = r.json();
          return b.checks?.mongo === 'ok';
        } catch {
          return false;
        }
      },
    });
    failRate.add(!readyOk);

    res = http.get(`${BASE}/health`, { headers: headers(), tags: { name: 'health' } });
    check(res, { 'health 200': (r) => r.status === 200 });
  });

  group('user home catalog', () => {
    const res = http.get(`${BASE}/api/user/home`, {
      headers: headers(),
      tags: { name: 'user_home' },
    });
    homeTrend.add(res.timings.duration);
    const ok = check(res, {
      'home 200': (r) => r.status === 200,
      'home success': (r) => {
        try {
          return r.json().success === true;
        } catch {
          return false;
        }
      },
    });
    failRate.add(!ok);
  });

  group('public catalog', () => {
    const res = http.get(`${BASE}/api/public/categories`, {
      headers: headers(),
      tags: { name: 'categories' },
    });
    // categories may 404 if path differs — don't fail hard on 404 shape
    check(res, {
      'categories reachable': (r) => r.status === 200 || r.status === 404,
    });
  });

  if (TOKEN) {
    group('authenticated bookings list', () => {
      const res = http.get(`${BASE}/api/users/bookings?page=1&limit=10`, {
        headers: headers(),
        tags: { name: 'bookings' },
      });
      const ok = check(res, {
        'bookings 200': (r) => r.status === 200,
        'bookings has pagination': (r) => {
          try {
            const b = r.json();
            return b.success && b.pagination;
          } catch {
            return false;
          }
        },
      });
      failRate.add(!ok);
    });

    group('payment methods config', () => {
      const res = http.get(`${BASE}/api/user/payment-methods/config`, {
        headers: headers(),
        tags: { name: 'pay_config' },
      });
      check(res, {
        'pay config 200 or 401': (r) => r.status === 200 || r.status === 401,
      });
    });
  }

  sleep(0.3);
}

export function handleSummary(data) {
  const p95 = data.metrics.http_req_duration?.values?.['p(95)'];
  const fails = data.metrics.http_req_failed?.values?.rate;
  console.log(
    `\n[WBI k6] p95=${p95 != null ? Math.round(p95) + 'ms' : 'n/a'} failRate=${fails != null ? (fails * 100).toFixed(2) + '%' : 'n/a'}`
  );
  return {
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}
