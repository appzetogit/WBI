# User App Soft-Launch Gate (→ 85–90 readiness)

Run these **before** flipping production traffic. Pass = Conditional Go → Soft Launch.

## 0. Prerequisites

```bash
# Backend
cd Backend
# Ensure .env has:
# NODE_ENV=production (or staging)
# REDIS_ENABLED=true
# MONGODB_URI=...
# RAZORPAY_KEY_ID=rzp_test_...   # use test keys first
# RAZORPAY_KEY_SECRET=...
# RAZORPAY_WEBHOOK_SECRET=...    # REQUIRED — integrity script fails in production without it
# ALLOW_OTP_BYPASS must be unset/false in staging/prod

npm run check:deps
npm run verify:razorpay
npm run verify:indexes
```

**Blocker found on this machine:** `RAZORPAY_WEBHOOK_SECRET` is unset while `NODE_ENV=production`.  
Add the webhook secret from Razorpay Dashboard → Webhooks, then re-run `npm run verify:razorpay`.

## 1. Ops probes

```bash
curl -s http://127.0.0.1:5000/live   # 200
curl -s http://127.0.0.1:5000/ready  # 200, checks.mongo=ok, redis=ok
curl -s http://127.0.0.1:5000/health # 200
```

## 2. Load / smoke

### Without k6 (Node)

```bash
# From repo root — API must be running
node scripts/load-test/user-app-smoke.js

# Staging with auth
BASE_URL=https://api.YOUR_HOST ACCESS_TOKEN=<user_jwt> CONCURRENCY=20 DURATION_SEC=30 node scripts/load-test/user-app-smoke.js
```

**Pass:** exit 0 · failRate &lt; 1% · home p95 &lt; 500ms · ready always 200

### With k6 (preferred)

```bash
k6 run scripts/load-test/k6/user-app-smoke.js
k6 run -e BASE_URL=https://api.YOUR_HOST -e VUS=50 -e DURATION=2m -e ACCESS_TOKEN=<jwt> scripts/load-test/k6/user-app-smoke.js
```

**Pass:** thresholds green (`http_req_failed&lt;1%`, p95&lt;500ms)

## 3. Razorpay E2E checklist (test mode)

Use **rzp_test_** keys. Do **not** skip webhook.

| # | Step | Expected |
|---|------|----------|
| 1 | Dashboard webhook → `POST /api/webhooks/razorpay/payments` (raw body) | Events accepted |
| 2 | User login OTP (real SMS or staging allowlist only) | Tokens issued |
| 3 | Manage Payment Methods → Add card | ₹1 verify + auto-refund; method saved |
| 4 | Checkout → Pay Online | Order created; Checkout opens with backend `key` |
| 5 | Complete test payment | Booking `paymentStatus=success` |
| 6 | Forge verify (`order_` + bad signature) via API | **400** Invalid signature |
| 7 | Another user `POST /payments/refund` on this booking | **403** |
| 8 | Owner cancel unpaid searching booking | Waves stop; status cancelled |
| 9 | Help & Support form submit | Ticket number returned |
| 10 | Refresh mid-checkout / back from SearchingTechnician | No orphan paid booking; search cancelled |

## 4. Security spot-checks

```bash
# Booking draft without token → 401
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:5000/api/booking-draft/000000000000000000000000/review

# OTP bypass phones without ALLOW_OTP_BYPASS → real OTP required
```

## 5. Soft-launch score band

| Result | Score guidance |
|--------|----------------|
| Integrity script + smoke PASS + Razorpay E2E 1–10 | **~85–88** Soft Launch |
| + 48h soak, error budget &lt;0.1%, p95 home &lt;200ms | **~90–92** Full launch candidate |
| Device matrix + Lighthouse 95 + pen test | **95–100** |

## 6. Go / No-Go

- **GO (soft):** All sections 0–4 green on staging; feature flag for payments if needed  
- **NO-GO:** Any Critical regression, `/ready` failing, forged payment accepted, refund IDOR  

Record date, BASE_URL, k6/smoke JSON output, and Razorpay payment ids in the release ticket.
