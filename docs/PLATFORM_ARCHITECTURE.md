# WBI Platform Architecture

Enterprise blueprint for 5M+ users — stateless API, event-driven workers, Redis cache/queues, MongoDB replica set, horizontal scale.

## Target SLOs

| Metric | Target |
|--------|--------|
| API p95 latency | < 200ms (read), < 500ms (write) |
| Availability | 99.9% |
| Payment integrity | Zero forged captures |
| Data durability | MongoDB majority writes + daily backups |

## Layer diagram

```
Clients (Web/PWA) → CDN → ALB/Nginx → API (stateless, PM2/K8s)
                              ↓
                    Redis (cache, rate limit, sockets, idempotency)
                              ↓
                    MongoDB Atlas (replica set, secondaryPreferred reads)
                              ↓
                    BullMQ workers (notifications, matching, SLA, dispatch)
                              ↓
                    Razorpay / SMS / FCM / Cloudinary
```

## Backend modules

| Path | Purpose |
|------|---------|
| `Backend/infrastructure/logger.js` | Structured JSON logs (ELK/Loki ready) |
| `Backend/infrastructure/health.js` | `/live`, `/ready`, `/health` |
| `Backend/infrastructure/gracefulShutdown.js` | SIGTERM drain (K8s rolling updates) |
| `Backend/infrastructure/circuitBreaker.js` | Upstream failure isolation |
| `Backend/infrastructure/pagination.js` | Consistent list pagination |
| `Backend/middleware/idempotency.js` | `Idempotency-Key` dedup |
| `Backend/middleware/rateLimiter.js` | Redis-backed limits |
| `Backend/jobs/*` | BullMQ async processing |

## API versioning

- Canonical: `/api/*`
- Version alias: `/api/v1/*` (rewrite to `/api/*`, header `X-API-Version: 1`)
- Gateway can route `/v1` to this service without duplicating handlers

## Security baseline

- JWT + refresh rotation, deactivated user rejection on every request
- RBAC via `roleMiddleware`
- `mongo-sanitize`, Helmet, CORS allowlist
- Server-side cart/booking pricing (never trust client amounts)
- OTP bypass **disabled in production**; requires `ALLOW_OTP_BYPASS=true` in dev
- Payment verify: HMAC + Razorpay capture check (fail closed)
- Notification/tracking ownership enforced

## Database

- Connection pool: `MONGODB_MAX_POOL_SIZE` (default 25)
- Read preference: `secondaryPreferred` for list endpoints
- Indexes: run `node scripts/ensureIndexes.js` (see script)
- Soft delete + audit: `PaymentAuditLog`, booking events

## Caching strategy

| Data | TTL | Store |
|------|-----|-------|
| Home catalog | 60–120s | Redis |
| User session OTP | 5m | Redis |
| Idempotency responses | 24h | Redis |
| Live tracking | 2h | Redis geo |

## Real-time

- Socket.io + Redis adapter (multi-instance)
- Rooms: `user_{id}`, `booking_{id}` (ownership checked on join)
- FCM for offline push

## DevOps

| Artifact | Path |
|----------|------|
| Docker API image | `Backend/Dockerfile` |
| Local stack | `docker-compose.yml` |
| PM2 cluster | `Backend/ecosystem.config.js` |

### Environment (production)

```env
NODE_ENV=production
REDIS_ENABLED=true
MONGODB_URI=mongodb+srv://...
RAZORPAY_KEY_ID=...
RAZORPAY_KEY_SECRET=...
RAZORPAY_WEBHOOK_SECRET=...
LOG_LEVEL=info
SHUTDOWN_TIMEOUT_MS=30000
API_DEFAULT_PAGE_SIZE=20
API_MAX_PAGE_SIZE=100
```

## Frontend (User app)

- React Query for server state + stale-while-revalidate
- Lazy routes + skeleton loaders
- Optimistic cart with server-authoritative pricing
- Registration/booking draft persistence (`useRegistrationDraft`)
- Checkout payment dedup guard

## Rollout phases

1. **Foundation** (this pass): health probes, graceful shutdown, security fixes, cart pricing, API v1 alias
2. **Scale**: Redis cache on hot reads, cursor pagination on all lists, CDN for assets
3. **Observability**: Pino → Loki, Prometheus metrics, Sentry errors
4. **K8s**: HPA on CPU + request rate, blue/green via `/ready`
5. **Hardening**: load tests (k6), chaos drills, pen test

## Out of scope (future)

- Kafka event bus (BullMQ sufficient at current scale)
- Multi-region active-active
- Stripe/Cashfree adapters
