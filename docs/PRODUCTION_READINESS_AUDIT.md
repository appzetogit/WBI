# TazkY / WBI — Production Readiness Audit (Engineer & Worker Focus)

**Date:** 2026-07-22  
**Scope:** Frontend, Backend, MongoDB, Redis, PM2, auth, APIs, scalability (no business-logic changes unless stability-critical).

---

## Executive summary

| Area | Status | Notes |
|------|--------|--------|
| Aadhaar OTP (v10) | Fixed | CGPE `{ sessionId, otp, aadhaarNumber }` on production |
| Rate limiting | Improved | Redis-backed limits aligned to Phase 9; user/worker/vendor/B2B/admin wired |
| PM2 cluster | Improved | Cron/schedulers on leader worker only; booking-dispatch worker started |
| Mongo pool | Improved | Default `maxPoolSize=25` (env override) to avoid N×100 connection storm |
| Health endpoint | Secured | No OTP bypass / internal config on production `/health` |
| Frontend hot paths | Partial | JobMap duplicate socket effects removed; engineer milestone URLs fixed |
| 100k load test | Not run here | Harness + methodology below; run from VPC with k6/Artillery |

---

## Phase 1 — System audit (findings)

### Critical (fixed in this pass)

1. **`GET /health` exposed OTP bypass phones** — `server.js` (production payload trimmed).
2. **`booking-dispatch` BullMQ worker never started** — jobs could stall; now `require('./jobs/bookingDispatchQueue')`.
3. **PM2 cluster duplicate crons** — all workers ran MIS/booking schedulers; now `utils/clusterLeader.js` (instance `0` only).

### High (fixed or mitigated)

4. **User/worker auth had no OTP/register/login limiters** — added in `user-routes/auth.routes.js`, `worker-routes/auth.routes.js`.
5. **Global API 300/min** — default **100/min** (`middleware/rateLimiter.js`, env `RATE_LIMIT_MAX`).
6. **OTP phone limit fail-open** — production fail-closed when `REDIS_ENABLED=true` (`utils/redisOtp.util.js`, default 5/hour).
7. **Mongo `maxPoolSize: 100` × PM2 `instances: max`** — risk of Atlas exhaustion; default **25** (`config/db.js`).

### High (remaining — plan, no logic change)

8. **JWT refresh rotation / admin refresh route** — stateless 30d refresh; add rotation + `/admin/auth/refresh-token` when product approves.
9. **B2B `loginSessionId` not persisted** — concurrent device policy incomplete (`authMiddleware.js`, `b2bAuthController.js`).
10. **N+1 in admin/vendor reports** — e.g. `verificationAdminController`, `reportController.getCODReport` (batch queries).
11. **Unbounded enquiry list endpoints** — ~25 enquiry controllers `find().sort()` without pagination.
12. **Notification queue worker** — queue defined; worker not started (same pattern as booking-dispatch was).

### Medium

13. Nested `QueryClientProvider` in `App.jsx` / `main.jsx` — consolidate.
14. Google Maps loaded at App root — load only on map routes.
15. Duplicate `/api/admin` route mounts — confusing but intentional aliases in places.
16. `readPreference: secondaryPreferred`** on default connection — auth reads may lag; consider `primary` for auth paths.
17. Debug booking body logger — gated to non-production.

### Infrastructure (AWS — verify on EC2)

- **Required:** `REDIS_ENABLED=true`, Redis URL, ALB health on `/health`, Nginx `proxy_read_timeout`, SSL, security groups (443/80 only public).
- **Recommended:** ALB + 2+ EC2 API instances, MongoDB Atlas M10+, Redis ElastiCache, CloudWatch alarms (CPU > 70%, 5xx rate, Mongo connections).
- **PM2:** Prefer `instances: 2–4` on medium EC2 until Redis + pool tuned; `max` only with connection math: `instances × MONGODB_MAX_POOL_SIZE < Atlas limit`.

---

## Phase 2 — Registration load test

**Cannot claim 100–100k concurrent capacity without running tests on your VPC.** Use:

```bash
# Smoke (health RPS)
API_BASE=https://api.wbinfs.com CONCURRENCY=100 DURATION_SEC=60 node scripts/load-test/registration-load.js

# Full OTP/register (k6 recommended on EC2)
# Scenarios: 100, 500, 1k, 5k, 10k, 25k, 50k, 100k virtual users — ramping stages
```

**Metrics to capture:** p50/p95 latency, error %, 429 %, Mongo `currentOp`, Redis memory, PM2 CPU/RAM, Atlas connections.

**Expected bottlenecks at scale:** OTP SMS provider rate, Mongo write on registration, Redis OTP counters, CGPE KYC (already serialized by verification limiter).

---

## Phase 3 — API audit (summary)

- **Duplicate fetches:** Engineer profile sub-pages each call `getProfile()` — use shared React Query key `engineerProfile`.
- **Worker JobMap:** duplicate `join_tracking` / `update_location` — **removed**.
- **Engineer SubmitMilestone:** wrong `/api/workers/...` — **fixed** to `/engineers/projects/...`.
- **Worker JobDetails:** duplicate `booking_updated` listeners — still recommended merge (see explore report).

---

## Phase 4 — Authentication

| Check | Status |
|-------|--------|
| Engineer/worker password login | OK + `loginLimiter` |
| User OTP login | OK + limiters |
| JWT + `loginSessionId` single device | User/vendor/worker/engineer |
| Admin session in DB | Weak — JWT only |
| B2B session | Weak — no DB session check |
| OTP expiry / hashing | Redis + SHA-256 (`redisOtp.util.js`) |

---

## Phase 5 — Database

Run after deploy:

```bash
cd Backend && node scripts/ensureProductionIndexes.js
```

Priority indexes: User.email, Opportunity, CrmEnquiry, VendorKYC, KYC/DigiLocker sessions, ServiceRequest, Worker/Engineer approval.

---

## Phase 6 — Redis

| Use | Key pattern |
|-----|-------------|
| Rate limits | `wbi:rl:*` |
| OTP | `rate:otp:{phone}`, OTP hashes |
| Aadhaar session | `kyc:aadhaar:otp:{entityId}` |
| Socket adapter | When enabled |

**Production:** `REDIS_ENABLED=true` mandatory for correct limits across PM2 cluster.

---

## Phase 7–8 — AWS & scalability

Implemented toward horizontal scale: stateless API, Redis limits, compression, cluster leader crons, smaller DB pools, request IDs (`REQUEST_LOG_ENABLED=true`).

**Still manual:** ALB, auto-scaling group, multi-AZ Redis/Mongo, CDN for frontend static assets, S3 lifecycle for uploads.

---

## Phase 9 — Rate limits (implemented defaults)

| Surface | Limit |
|---------|--------|
| Registration | 5 / minute / IP |
| OTP HTTP | 5 / hour / IP |
| OTP phone (Redis) | 5 / hour / phone |
| Login | 10 / minute / IP |
| General API | 100 / minute / IP |
| Admin API | 200 / minute / IP |

Env overrides: `REGISTRATION_RATE_LIMIT_MAX`, `OTP_HTTP_RATE_LIMIT_MAX`, `LOGIN_RATE_LIMIT_MAX`, `RATE_LIMIT_MAX`, `ADMIN_RATE_LIMIT_MAX`.

---

## Phase 10–15 — Frontend, errors, logging, security, QA, targets

- **Errors:** Global handler in `server.js`; avoid stack in production responses.
- **Logging:** Enable `REQUEST_LOG_ENABLED=true`; consider pino + CloudWatch agent next.
- **Security:** helmet, mongo-sanitize, CORS allowlist — review `.vercel.app` wildcard for production.
- **QA matrix:** Engineer/worker registration, OTP, login, KYC, jobs, wallet — manual + device sizes (Android/tablet) per your Phase 14 list.
- **Targets:** Sub-200ms average requires caching + indexes + CDN; measure after load test baseline.

---

## Phase 16 — Changes in this audit (code)

| File | Change |
|------|--------|
| `middleware/rateLimiter.js` | Enterprise limits + login/admin limiters |
| `routes/*/auth.routes.js` | Limiters on user/worker/vendor/B2B/admin/engineer login |
| `server.js` | Request context, health hardening, leader crons, booking-dispatch worker, debug gated |
| `config/db.js` | Pool size from env |
| `utils/redisOtp.util.js` | 5/hour default, prod fail-closed |
| `utils/clusterLeader.js` | PM2 leader election |
| `middleware/requestContext.js` | Request ID + access log |
| `scripts/ensureProductionIndexes.js` | Priority indexes |
| `scripts/load-test/registration-load.js` | Smoke load harness |
| `Frontend/.../JobMap` | Remove duplicate socket sync |
| `Frontend/.../SubmitMilestone` | Correct engineer API paths |

---

## Deploy checklist

1. Set production env (see `ecosystem.config.js` `env_production`).
2. `scripts/deploy-backend.sh` on EC2.
3. `node Backend/scripts/ensureProductionIndexes.js`.
4. Confirm `/health` returns only `checks` in production.
5. Run load smoke then scale tests from VPC.
6. Deploy frontend (milestone + JobMap fixes).

---

## Regression note

Business logic unchanged except stability fixes (workers, limits, health, pool). Re-run engineer/worker signup, OTP login, and one active job map session after deploy.
