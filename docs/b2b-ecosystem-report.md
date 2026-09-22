# B2B Operational Ecosystem — implementation report

Written for: the WBI engineering and operations team.

Everything below is in the working tree and verified on an isolated local
harness (MongoDB replica set on 27400, Redis on 6390, the backend on 5055).
Nothing was run against the production database.

---

## 1. Architecture map

`docs/architecture-map.md` Part 2 records the pre-existing system: wallet and
payments, pricing, FCM/push, email, reporting, bulk upload, B2B identity, and
the panels. It names eight defects (B1–B8) found during discovery. This report
says what each one became.

The shape of the ecosystem as built:

```
B2B panel ─┐
Admin      ├─→ B2BJob (one central job) ─→ jobLifecycle.transitionJob ─→ state machine
Vendor     │        │                            │
TazkY      ┘        │                            ├─→ JobHistory (append-only)
                    │                            ├─→ sockets + notification catalog
                    │                            └─→ SLA deadlines (b2bSla.service)
                    │
                    ├─→ JobAssignment (append-only: one row per holding period)
                    ├─→ b2bWalletLedger (the only writer of company balances)
                    ├─→ b2bPricingEngine (contract → company → default)
                    └─→ routing: coverage → vendor offers → freelancer waves → UNASSIGNED
```

## 2. Database changes

**Extended**

| Model | What was added |
|---|---|
| `B2BJob` | `paymentMode` (REAL/DEMO), `paymentReference`, `walletReservationId`, `walletStatus`, a full `pricing` snapshot (base · geographic · priority · SLA · emergency · after-hours · additional · discount · tax · total · `source` · `ruleId` · `contractId`), `sla` (five thresholds, five due dates, `breaches[]`), `assignmentExpiresAt`, `unassignedReason`/`unassignedAt`, `customerRef`, `description`, `specialInstructions`, `requiredSkill`, `asset{assetId,model,serialNumber}`, `b2bCompanyId` virtual, `assignmentType: 'vendor'` |
| `B2BWallet` | `creditLimit`, `ledgerSequence`, `openingBalance`/`openingReserved`/`openingBalanceAt` |
| `B2BWalletTransaction` | `ledgerType` (TOP_UP · JOB_RESERVATION · JOB_CHARGE · RELEASE · REFUND · ADJUSTMENT · PAYOUT · REVERSAL), `paymentMode`, `paymentStatus`, `availableDelta`, `reservedDelta`, `balanceAfter{available,reserved,total}`, `sequence`, unique `idempotencyKey`, `reservationId`, `jobId`, `batchId`, `reversalOf`, `performedBy` |
| `B2BCompany` | `accountStatus` (PENDING/APPROVED/ACTIVE/SUSPENDED/REJECTED/INACTIVE) + `statusReason`/`statusChangedAt`, `billingMode` (LIVE/DEMO), `allowedServices[]`, `allowedLocations[]`, `pricingProfile`, `slaProfile`, `activeContractId`, `contactPerson` |
| `B2BUser` | `accessRole` (B2B_ADMIN / B2B_OPERATIONS / B2B_FINANCE / DISPATCHER) |
| `B2BPricingRule` | `level`, `contractId`, `pricingProfile`, `serviceKey`, `subServiceKey`, `priorityCharges{Low,Medium,High}`, `slaCharge`, `emergencyCharge`, `afterHoursCharge` |
| `B2BBatch` | `unknownColumns[]`, `totalCost`, `paymentStatus`, `processingStatus`, `reservationId`, `paymentMode`, `failedJobs`, `uploadedBy` |
| `JobAssignment` | `expired` status + `expiredAt` |
| `AuditLog` | `oldValue`, `newValue`, `reason`, `deviceId` |

**New**

| Model | Purpose |
|---|---|
| `B2BContract` | Commercial agreement: per-service prices, allowed services and locations, SLA, payment terms, assignment rules, validity. Top of the pricing chain. |
| `B2BBulkUploadRow` | One persisted row per uploaded spreadsheet line: raw data, normalized values, status, validation problems, price, and the job it became. |
| `DeviceToken` | One row per device for push: user, role, device id, token, platform, `lastSeen`, active flag. |
| `B2BPlatformConfig` | The single settings document: routing, SLA profiles, payments, business hours, bulk limits, notification channels. |

## 3. API changes

**New**

- `GET /api/b2b/bulk-jobs/:batchId/rows` — every row of an upload with its status, errors and price.
- `GET /api/admin/b2b/contracts`, `POST`, `GET/PUT /:id`, `POST /:id/status`, `DELETE /:id`.
- `GET /api/admin/b2b/settings`, `PATCH /api/admin/b2b/settings`.
- `GET /api/admin/b2b-wallets/:companyId/reconcile` — recompute balances from the ledger and report drift.
- `POST /api/admin/b2b-wallets/transactions/:transactionId/reverse` — post the inverse of a row, with a reason.
- `PATCH /api/admin/b2b-companies/:companyId/status` — operational status, reason required to suspend/reject/deactivate.
- `PATCH /api/admin/b2b-companies/:companyId/controls` — allowed services/locations, pricing and SLA profile, billing mode, credit limit.
- `GET /api/admin/b2b-companies/:companyId/activity` — the company's audit trail.

**Changed**

- `POST /api/b2b/bulk-jobs/confirm/:batchId` returns **402** with `required / available / shortfall` and the configured top-up methods when the wallet cannot cover the upload, and creates nothing.
- `GET /api/b2b/bulk-jobs/:batchId` also returns a `preview` (counts, unknown columns, cost, wallet position, processing/payment status).
- `GET /api/b2b/wallet/summary` returns available, reserved, total, credit limit, spendable, billing mode and the enabled top-up methods.
- `GET /api/b2b/bulk-jobs/errors/:batchId/download` is now one line per problem: Row · Field · Invalid Value · Error · Suggested Fix.
- Every B2B route is behind a permission key (see §13).

## 4. B2B panel changes

- **Wallet** shows available, **reserved**, credit line and spendable; the top-up methods come from platform settings instead of being hardcoded; a demo wallet says plainly that its money is simulated.
- **Bulk upload review** shows the backend's preview: valid/invalid/duplicate counts, the priced total, unknown columns that were not read, a per-row table (row, customer, city, service key, price, status, what to fix), and — when the wallet is short — required/available/shortfall with the top-up methods and a link to the wallet.

## 5. Admin changes

New screens under `/admin/b2b`:

- **Pricing** — the matrix, with level, service key, scope, base and each charge component, plus a preview that calls the same engine a job would.
- **Contracts** — list with in-force marker, create a draft, activate (supersedes the previous contract), terminate with a reason.
- **Transactions** — the wallet ledger per company: type, amount, signed deltas, balances after, reference, real vs demo, and a reversal action. A reconciliation badge says whether the ledger and the balances agree.
- **Settings** — routing mode and timeouts, fallback order, SLA profiles and check schedule, payment methods and wallet rules, bulk limits, business hours.

Existing screens keep working; the company controls (status, allowed services, profiles, billing mode, credit limit) are backed by the new endpoints.

## 6. Vendor integration changes

None of the vendor panel's contracts changed. Vendors receive B2B jobs through
the same coverage-based offers as before; what changed underneath is that a job
now carries its price, its SLA deadlines and an acceptance deadline, and an
assignment nobody answers expires instead of sitting in the vendor's queue.

## 7. Tasky integration changes

Engineer endpoints are unchanged. Two behaviours differ: an engineer who was
never offered a job is told "this job was not offered to you" instead of
receiving a 409 that revealed the job's state; and an assignment that is not
accepted before its deadline is closed as `expired` and re-routed.

## 8. Payment flow

```
Upload validated → priced per row → company confirms
      → wallet reserve (available −, reserved +)   [402 + shortfall if short]
      → jobs created (each carrying reservationId, paymentReference, price)
      → job closed → charge (reserved −, totalSpent +)
      → job cancelled → release (reserved −, available +)
```

Demo money never crosses into this: a company in `billingMode: DEMO`, or a
Razorpay **test-mode** top-up, posts `paymentMode: DEMO` /
`paymentStatus: SIMULATED_SUCCESS`, and no tax invoice is generated.

## 9. Wallet flow

`services/b2bWalletLedger.service.js` is the only writer of B2B balances. Each
call updates the wallet and writes its ledger row **inside one MongoDB
transaction**, with guards (`$expr` on balance + credit limit for debits,
`$gte` on reserved for releases) so a bucket can never go short, plus balance
snapshots, a per-wallet sequence and a unique idempotency key.

Refactored onto it: the escrow engine (hold/refund/release), bulk upload,
completion deduction, quote adjustments, engineer deductions, admin adjust and
refund, gateway top-up verification, and the site-testing enquiry flow — which
no longer pre-funds a wallet with ₹1,00,000 (**B1**).

## 10. Routing flow

```
VALIDATED → PRICED → PAYMENT_PENDING → PAYMENT_VERIFIED → ROUTING
   → vendor coverage match → vendor offers (deadline) → PENDING_ASSIGNMENT
        → engineer assigned (acceptance deadline) → ACCEPTED …
   → no vendor: freelancer waves (5→10→20→50→100 km)
   → nobody eligible: UNASSIGNED with a stated reason, money still reserved
   → rejection / expiry: next eligible provider, then the fallback order,
     then the unassigned queue
```

Timeouts, wave radii, capacity, fallback order and the escalation switch are
all settings, not code.

## 11. Notification flow

Twenty events were added to the notification catalog with their recipients and
channels: `B2B_UPLOAD_COMPLETED`, `B2B_VALIDATION_FAILED`, `PAYMENT_SUCCESS`,
`PAYMENT_FAILED`, `JOB_CREATED`, `JOB_ROUTED`, `VENDOR_ASSIGNED`,
`ENGINEER_ASSIGNED`, `FREELANCER_REQUEST`, `REQUEST_EXPIRED`,
`ENGINEER_ACCEPTED`, `ENGINEER_REJECTED`, `EN_ROUTE`, `ARRIVED`,
`WORK_STARTED`, `WORK_COMPLETED`, `JOB_CLOSED`, `SLA_BREACH`,
`SETTLEMENT_CREATED`, `PAYOUT_COMPLETED`.

Lifecycle transitions emit them automatically; the timeout sweeper emits
`REQUEST_EXPIRED` and `SLA_BREACH` with the reason and the delay. Push reads
the `DeviceToken` registry, and a token FCM rejects is deactivated on the spot.

## 12. Job state machine

States: `CREATED · VALIDATED · PRICED · PAYMENT_PENDING · PAYMENT_VERIFIED ·
ROUTING(stored ROUTED) · PENDING_ASSIGNMENT · ASSIGNED · ACCEPTED · EN_ROUTE ·
ARRIVED · IN_PROGRESS · COMPLETED · VERIFICATION · CLOSED`, with side states
`REJECTED · CANCELLED · ON_HOLD · REASSIGNED · FAILED · EXPIRED · UNASSIGNED`.

Transitions follow the table in the brief. Every transition goes through
`jobLifecycle.transitionJob`, which compare-and-sets on the state it validated
against, writes `JobHistory`, mirrors the legacy `status`/`trackingStatus`,
stamps SLA deadlines and announces the event. The model rejects any status
write that does not come through it.

## 13. Permission matrix

| Role | May |
|---|---|
| Admin | Everything, across all companies |
| B2B_ADMIN (and the company login) | Everything within its own company |
| B2B_OPERATIONS | Jobs (read/create/manage), uploads, tracking, engineers, reports, support — **no money, no user management** |
| B2B_FINANCE | Wallet, top-ups, invoices, reports, read-only jobs and uploads — **cannot raise or cancel jobs** |
| DISPATCHER | Jobs (read/create), uploads (read), tracking, engineers |
| Vendor | Only its own jobs, engineers and money |
| Engineer / Freelancer | Only jobs assigned to, or offered to, them |

Enforced by `checkB2BPermission` on every B2B route, resolving from
`config/b2bAccessRoles.js` plus per-user overrides. Before this, only
`users.routes` was guarded (**B4**). A company whose `accountStatus` is
SUSPENDED, REJECTED or INACTIVE is refused at the gate.

## 14. Testing results

| Suite | Result |
|---|---|
| `Backend/tests/e2e/b2bEcosystem.e2e.js` (spec scenarios 1–5) | **71/71** |
| `Backend/tests/e2e/vendorManagement.e2e.js` (regression) | **263/263** |
| Wallet ledger unit checks (harness) | **25/25** |
| Pricing resolution checks (harness) | **18/18** |
| Bulk upload v2 checks (harness) | **24/24** |
| Frontend build | passes |

Scenario coverage: a 25-row upload through validation, per-row pricing,
reservation, creation, routing, a full lifecycle to CLOSED seen identically by
B2B/Vendor/Admin, the charge and reconciliation; an upload the wallet cannot
cover (402, shortfall, top-up methods, zero jobs created, then success after a
top-up); routing eligibility including the unassigned queue; the freelancer
path including acceptance and expiry; and cross-tenant isolation plus role
permissions and company suspension.

Defects found by these tests and fixed: jobs created in bulk were not getting
SLA clocks; an engineer accepting a job they were never offered received a 409
that leaked the job's state; audit writes were failing silently because the
actor id was read under the wrong field name.

## 15. Remaining gaps

1. **Invoices and settlements** still run on the pre-existing flow. Settlement
   and payout rows are not yet generated from the new ledger, so
   `SETTLEMENT_CREATED` / `PAYOUT_COMPLETED` are declared but not emitted.
2. **Single-job B2B creation** has no API of its own; jobs enter through bulk
   upload. The pricing, reservation and SLA path is ready for one.
3. **`DeviceToken`** is written and read for B2B and admin; the user, vendor,
   worker and engineer apps still use their `fcmTokens[]` arrays, which the
   send path reads as a fallback.
4. **Reports** do not yet include SLA attainment, first-time-fix or the
   reconciliation statement; the data behind them now exists.
5. **B2B company detail tabs** in the admin panel (Overview, Jobs, Uploads,
   Wallet, …) are still the older screens plus the new pages beside them,
   rather than one tabbed detail view.
6. **Legacy wallet rows** written before the ledger carry no deltas. They are
   counted as an opening balance so reconciliation is honest, but they cannot
   be explained line by line.
7. **`b2bWalletService.pendingDeductions`** is still written outside the
   ledger. It moves no money — it is a memo of what could not be charged — but
   it is the one wallet field the ledger does not own.
