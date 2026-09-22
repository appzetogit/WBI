# Architecture Map — Vendor Management Upgrade

Discovery snapshot taken 2026-09-18 on `main` @ `632b14e`, before any code changes for this upgrade.
What was built from this map, and what is still open: [vendor-management-upgrade-report.md](vendor-management-upgrade-report.md).
Scope: everything that touches jobs, vendors, engineers, assignments, routing, payments, and the panels that show them.

Legend — **Reuse**: fit for purpose as-is · **Extend**: right place, needs fields/rules · **Missing**: nothing exists · **Defect**: exists but wrong/unsafe.

---

## 1. Frontend

| Area | What exists | Verdict |
|---|---|---|
| Stack | React 19 + Vite 7, Tailwind 4, React Router 7, TanStack Query 5, axios (`src/services/api.js`), socket.io-client, lucide-react, recharts, sonner/react-hot-toast | Reuse |
| Panels | `src/modules/{admin,b2b,engineer,user,vendor,worker,project-os,landing}` — one module per panel, each with `pages/ routes/ services/ components/` | Reuse |
| Vendor routing | `modules/vendor/routes/index.jsx` — service-slug portal `/vendor/:serviceSlug/*` wrapped in `DynamicVendorLayout` | Extend (new pages mount here) |
| Vendor sidebar | `modules/vendor/components/DynamicSidebar.jsx` — 5 pillars: Dashboard · My Jobs · Engineers · Finance · Notifications (dark `gray-900` rail, `blue-600` active) | Extend to the 13-item nav |
| Vendor state | Context providers: `VendorConfigContext`, `VendorCountsContext`, `VendorSocketContext`; pages mostly local `useState` + service calls | Reuse |
| Vendor jobs UI | `pages/MyJobs` (+ `JobDetailsModal`, `AssignJobEngineerModal`), `pages/Requests`, `pages/Engineers`, `pages/Finance` (Earnings / Wallet / Engineer Payments / Settlements / Payouts tabs) | Extend |
| Assign modal | Shows the raw workforce roster from `/vendor/workforce/engineers`; no skill/location/workload reasoning; can post a `VendorWorkforceEngineer._id` as `engineerId` | **Defect** → replace with server-computed eligibility |
| Fake numbers | `Finance/components/EarningDetailsModal.jsx:31` derives engineer payout as `vendorPayable * 0.7` | **Defect** |
| Admin | `modules/admin/pages/B2B/*` — Submissions QA page exists; **no Unassigned/Escalation queue page** although the API exists | Missing (UI only) |
| Engineer (TazkY web) | `modules/engineer/pages/{B2BJobs,B2BJobDetail,AssignedJobs,OpsJobs}` → `/api/engineers/b2b-jobs/*`. A native TazkY (Flutter) client also exists outside this repo | Reuse — API contract must stay backward compatible |

## 2. Backend

| Area | What exists | Verdict |
|---|---|---|
| Runtime | Express 4, Mongoose 8, Socket.IO 4 (+ Redis adapter), BullMQ 5 + ioredis, `server.js` mounts ~200 routers under `/api` (and `/api/v1` alias) | Reuse |
| Layout | `routes/<panel>-routes` → `controllers/<panel>Controllers` → `services/*` → `models/*`; `engines/` for Project OS | Reuse |
| Validation | Mostly ad-hoc in controllers; `express-validator` installed but rarely used | Reuse the in-controller style |
| Errors/pagination | `{ success, message, data, pagination:{page,limit,total,totalPages} }`; `infrastructure/pagination.js` | Reuse |
| Audit | `models/AuditLog.js` + `utils/auditLogger.js` (`logAudit`) | Reuse |

## 3. Database models (job-relevant)

There is **no single job collection**. Six job-shaped collections exist, each with its own status vocabulary:

| Model | Channel | Status vocabulary | Role in this upgrade |
|---|---|---|---|
| `B2BJob` | B2B portal / bulk upload → vendors → engineers (TazkY) | `pending, pending_wallet, searching_engineer, assigned, accepted, travelling, arrived, in_progress, completion_submitted, admin_review, on_hold, completed, cancelled, rejected, escalated, failed, closed, revision_required` | **Central Job/Work Order for the vendor pipeline** — Extend |
| `Booking` | User App → Workers (wave broadcast, `matchingService`) | `BOOKING_STATUS` (27 values) | Reuse as-is; enforce vendor isolation around it |
| `VendorOpsJob` / `VendorOpsProject` | Opportunity accepted by vendor → ops project → engineer | `pending_acceptance … completed` | Reuse for real projects; **stop forking B2B jobs into it** |
| `Opportunity` | Marketplace offer to vendors (also used as B2B fallback) | `open/closed/…` + `assignment.phase` | Reuse |
| `ServiceRequest`, `WorkOrder`, `DigitalJob` | Catalog requests, dynamic enquiries, digital projects | own enums | Out of scope |

Relationships already in place: `B2BJob.companyId→B2BCompany`, `batchId→B2BBatch`, `assignedTo→Engineer`, `assignedVendorId→Vendor`, `notifiedVendors[]/notifiedEngineers[]`, `invoiceId→B2BInvoice`; `Engineer.vendorId→Vendor`; `VendorWorkforceEngineer{vendorId, linkedEngineerId→Engineer}`.

| Spec entity | Closest existing | Verdict |
|---|---|---|
| Job.`source` | none (`B2BJob` implicitly B2B; UI invents `'USER PROJECT'`/`'B2B JOB'` labels) | **Missing** |
| Job.`serviceId/serviceKey` | free-text `B2BJob.service`; catalog = `ServiceCategory.categoryCode` + `SubService` + `ServiceConfig` | Extend (resolve + persist) |
| Job.`assignmentType` | `B2BJob.assignmentType ∈ {freelancer, vendor_engineer}` | Extend (+`WORKER`,`UNASSIGNED`) |
| Job SLA | `slaTarget` (hours) only | Extend (`slaDueAt`) |
| `JobAssignment` (append-only) | `EngineerAssignment`, `B2BEngineerAssignment` exist but are **mutated in place / upserted** by socket handlers; vendor/admin assignment overwrites `assignedTo` with no history row | **Missing** as an append-only record |
| Timeline | `JobHistory` (role enum excludes `vendor` → vendor rows silently fail), `JobStatusTimeline`, `JobStatusLog`, `B2BJobStatusLog` — four overlapping logs | Extend `JobHistory` as the single backend-sourced timeline |
| Engineer | `Engineer` (`engineerType ∈ {freelancer, vendor_engineer}`, `vendorId`, `vendorApprovalStatus`, skills/subServices, `geoLocation`, `workingDays`) + `VendorWorkforceEngineer` (vendor roster) | Reuse |
| `VendorServiceCoverage` | `Vendor.approvedServices[]{categoryCode,status}`, `Vendor.workingCities/operatingCities/operationalCities`, `serviceRadiusKm` — no per-service city/pincode coverage | **Missing** |
| `Service` | `ServiceCategory` (`categoryCode`), `SubService` (`requiredSkills`), `ServiceConfig` (payment rules, SLA) | Reuse |
| Job-level payment | `B2BJob.charge/paymentStatus/payoutStatus`, `EscrowLedger`, `computeSplit()` in `escrowReleaseEngine.service.js`, `VendorFinanceTransaction` (`escrow_release`, `projectCode=jobId`) | Reuse (read model only) |
| Settlement (period) | `Settlement` model = vendor paying **admin** to clear cash-collection debt — different concept | **Missing** (derive from ledger) |
| Parts | `VendorPartsCatalog`, `VendorResourceInventory`, `B2BJob.partsReplaced` (free text) | Reuse |
| Support | `SupportTicket`, `VendorGlobalSupportTicket`, `vendorSupportService` | Reuse |

## 4. Auth & roles

- JWT (`utils/tokenService.js`) → `middleware/authMiddleware.authenticate` loads the principal by `decoded.role` ∈ `USER|VENDOR|WORKER|ENGINEER|ADMIN|B2B`; B2B requests get `req.companyId`.
- Role gates: `middleware/roleMiddleware.js` (`isVendor`, `isAdmin`, `isEngineer`, `isApprovedB2B`, `checkB2BPermission`, `isSuperAdmin` reads DB).
- Ownership is checked **per controller by query scoping** (`{ assignedVendorId: vid }`, `{ assignedTo: engineerId }`, `{ companyId }`). There is no shared ownership helper. **Reuse the role gates; add a shared scope helper.**

## 5. Existing APIs touching jobs / vendors / engineers / assignments / payments

| Panel | Endpoints |
|---|---|
| Vendor | `GET/POST /api/vendor/requests[/:id][/accept|/reject|/assign-engineer]` · `GET/POST /api/vendor/my-jobs[/:id][/assign-engineer|/status]` · `GET/POST/PATCH /api/vendor/engineers[/:id][/assign-job|/status|/sync]`, `/assignable-jobs` · `/api/vendor/finance/*` · `/api/vendor/workforce/*` · `/api/vendors/bookings/*` |
| Engineer (TazkY) | `/api/engineers/b2b-jobs` (list, summary, `:id`, `accept`, `reject`, `start-travel`, `update-location`, `arrive`, `resend-otp`, `start`, `customer-unavailable`, `complete`) · `/api/engineers/ops-jobs/*` · `/api/engineers/freelancer-pool/*` |
| B2B | `/api/b2b/bulk-jobs/*` (upload → validate → preview → confirm → retry, error report download) · `/api/b2b/jobs/*` (incl. retry matching, approve-work) · `/api/b2b/live-tracking/*` |
| Admin | `/api/admin/b2b/jobs/escalations[/:id][/retry|/assign|/engineer-suggestions]` · `/api/admin/b2b/jobs/submissions[/:id][/approve|/reject]` · `/api/admin/settlements/*` · `/api/admin/*` engineer/vendor management |

## 6. Real-time layer

- `sockets/index.js`: auto-joins `vendor:<id>`, `engineer:<id>`/`worker:<id>`, `b2b:<userId>`, `admin`, `user:<id>` from the handshake token.
- Event names in use: `b2b:jobStatusUpdated`, `b2b:jobRequestReceived`, `b2b:jobAssigned`, `engineer:b2bJobOffer`, `engineer:jobAssigned`, `engineer:b2bJobOfferClosed`, `admin:matchingFailed`, `admin:matchingVendorFallback`, `b2b:validation*/creation*/upload*`.
- **Reuse** rooms + event names. Emission is copy-pasted across ~10 files; will centralise for job status.

## 7. TazkY (engineer app) integration

- Jobs reach engineers by socket offer (`engineer:b2bJobOffer`) + FCM (`engineerNotify.service`) and are pulled from `/api/engineers/b2b-jobs`. Identity = `B2BJob._id` (API) and `B2BJob.jobId` (human code, `JOB-B2B-<batch>-R<n>`).
- Execution guards (OTP on start, ≥1 before/after photo, transactions on complete) live in `engineerB2BJobController.js` — **Reuse**.

## 8. Routing / matching

- `b2bMatchingService.js`: BullMQ progressive geo waves (5→10→20→50→100 km), broadcast offer to freelancers, **parallel vendor discovery** (vendors with a skilled in-radius engineer get `b2b:jobRequestReceived`), fallback → vendor marketplace Opportunity → freelancer pool → admin escalation with a human-readable reason (`describeExhaustion`).
- `b2bEngineerEligibility.js`: mandatory skill gate (sub-service id → skill id → required-skill names → service names), schedule gate, workload cap (`MAX_ACTIVE_JOBS_PER_ENGINEER`), open-offer cap, least-loaded ordering, `findEligibleVendorsInRadius`. **Reuse — this is the scoring core.**
- `b2bJobRematch.service.js` (retry), admin `manualAssign` / `suggestEngineers` (suggestions are **not** skill-filtered). Assignment mode switch: `enterpriseB2BOrchestrator.getAssignmentMode`.
- Missing: vendor coverage by city/pincode, pincode-level "no vendor covers X in Y" reasons, server-side eligibility for the vendor's own assign screen.

## 9. Payments / settlement

- B2B: wallet → escrow hold on bulk confirm (`B2BWallet.escrowBalance`, `EscrowLedger`) → engineer completes → admin/B2B approval → `releaseB2BJobEscrowPayment` → `computeSplit(gross, ServiceConfig.paymentRules)` → vendor credited `net` in `VendorFinanceTransaction`, or engineer wallet for freelancers. Refund on cancel/escalate. **Reuse** — real, idempotent (`b2b_job_release:<jobId>`).
- Settlement per period does not exist; derive from `VendorFinanceTransaction` (`escrow_release`, `withdrawal`) + `EscrowLedger`.

---

## Defects found during discovery (must fix before building on top)

| # | Severity | Where | Problem |
|---|---|---|---|
| D1 | **Critical** | `sockets/index.js:~95` | Invalid/forged JWT falls back to `jwt.decode()` and trusts its `userId`/`role` → anyone can join `admin` or another vendor's room. |
| D2 | **Critical** | `sockets/index.js:598-835` | `engineer:jobAccepted/enRoute/reachedLocation/workStarted/jobCompleted` let **any socket (even anonymous)** set any B2B job to any status (incl. `completed`) — bypasses OTP, photos, verification, state machine. |
| D3 | High | `vendorRequestsController` | Any vendor can read (`GET /requests/:id`), claim (`/accept`), reject, or reassign **any User-App Booking** by id; opportunity detail readable by any vendor. |
| D4 | High | `vendorRequestsController.assignEngineerToRequest`, `vendorMyJobsController.assignEngineerToJob` | Engineer ownership not enforced — a vendor can assign another vendor's engineer or any freelancer; overwrites assignment with no history; no status check. |
| D5 | High | `vendorMyJobsController.updateJobStatus` | Accepts **any** status string from the frontend (e.g. `completed`). |
| D6 | High | `b2bJobEscalationController.js` | `JobStatusTimeline` used but never imported → detail/approve/reject throw; `approveCompletion` also approves (and releases escrow for) jobs never worked. |
| D7 | Medium | `engineerB2BJobController.acceptB2BJobOffer/rejectB2BJobOffer` | Accept allowed from `cancelled/escalated/closed…`, not atomic; one broadcast recipient's reject marks the whole job `rejected`, after which nothing re-routes it (silent drop). |
| D8 | Medium | `vendorRequestsController` | `JobHistory.create({role:'vendor'})` fails enum validation inside `catch(_){}` → vendor actions never reach the timeline. |
| D9 | Medium | `b2bBulkJobService.geocodeRow` | Unresolvable address silently geocoded to Mumbai and routed there. |
| D10 | Low | `vendorMyJobsController.getJobDetails`, `EarningDetailsModal` | Engineer payout fabricated as 70 % of charge. |
| D11 | Info | repo | `Backend/.qa/*.tok` (JWTs) committed; `Backend/.env` is production (`NODE_ENV=production`, Atlas `WBI`, live SMS key); `tests/*.js` `deleteMany` against `MONGODB_URI`. |

## Plan implied by this map

1. **Central job = `B2BJob`** (extend, no new collection, no copies). Persist `source`, `serviceKey`, `lifecycleStatus`, `assignmentType`, `slaDueAt`, `unassignedReason`. Legacy `status` stays in sync for TazkY/B2B clients.
2. **One state machine module** that every writer (engineer, vendor, admin, matcher, sockets) must call; it validates, writes `JobHistory`, and emits to every panel room.
3. **`JobAssignment`** append-only collection; assignment/reassignment/rejection always open/close rows, never overwrite.
4. **`VendorServiceCoverage`** + coverage-aware vendor eligibility with stated no-coverage reasons → unassigned queue.
5. Shared **job-scope helper** for RBAC; close D1–D8.
6. Vendor Panel: extend sidebar and pages on the existing layout; all numbers from APIs.

---

# Part 2 — B2B Operational Ecosystem (discovery, 2026-09-19)

Snapshot of the working tree *after* the Vendor Panel upgrade (central `B2BJob`, lifecycle state machine, `JobAssignment`, coverage routing, vendor/engineer sections). Scope: everything the B2B ecosystem touches — wallet/payments, pricing, push, email, reporting, bulk upload, B2B panel, admin B2B.

## 7. Wallet & payment

| Area | What exists | Verdict |
|---|---|---|
| Balance model | `B2BWallet { balance, escrowBalance, totalTopup, totalSpent, pendingDeductions }`; a second copy on `B2BCompany.walletBalance` | **Extend** — `balance` = available, `escrowBalance` = reserved; add `creditLimit`; `B2BCompany.walletBalance` becomes a mirror written only by the ledger service |
| Ledger | `B2BWalletTransaction { type: topup · job_deduction · refund · adjustment · failed · escrow_hold · escrow_release · escrow_refund, amount, status, razorpay*, relatedJobIds, invoiceId }` | **Extend** — canonical `ledgerType` (TOP_UP, JOB_RESERVATION, JOB_CHARGE, REFUND, ADJUSTMENT, RELEASE, PAYOUT, REVERSAL), balance snapshots, `paymentMode`, `paymentStatus`, `jobId`, `reservationId`, idempotency key |
| Escrow | `EscrowLedger` (per payment) + `escrowReleaseEngine` (hold / release / refund per job, vendor split) | **Reuse** behind the ledger service |
| Gateway | `razorpayService` (orders, signature verify); B2B top-up order + verify in `b2bWalletController` | **Reuse**; **Defect B3** — Razorpay *test* keys credit the wallet as real money |
| Payment methods | `PaymentMethodConfig` (platform/user app), `B2BPaymentMethod` (company saved methods) | **Extend** — B2B top-up methods admin-configurable |
| Credit | `B2BCreditProfile { approvedLimit, paymentTermsDays, escrowRequired }` | **Reuse** as the `creditLimit` source |
| Vendor side | `VendorFinanceTransaction` ledger, `VendorFinanceWallet`, `Settlement` (withdrawals), settlements read model | **Reuse** for payouts/settlements |

**Defects**
- **B1** `siteTestingEnquiry.controller` creates a B2B wallet pre-funded with ₹1,00,000 "for testing" and freezes ₹5,000 by mutating `balance`/`escrowBalance` directly — money with no ledger row, reachable from an enquiry flow.
- **B2** Balance writers that are read-modify-write and/or ledgered in a separate write: admin wallet adjust/refund, top-up verify, `b2bWalletService.deductWalletForCompletedJob`. A failure between writes leaves a balance change with no ledger row; concurrent writes can lose updates.
- **B3** Razorpay test-mode top-ups are indistinguishable from real revenue.

## 8. Pricing

| Area | What exists | Verdict |
|---|---|---|
| Rules | `B2BPricingRule { companyId?, service (free text), categoryCode, serviceTier, region{states,cities,pincodePrefixes}, baseAmount, serviceCharge, geographicSurcharge, additionalCharges[], volumeDiscounts[], taxPercent, vendorPayoutPercent, priority, effective dates }` | **Extend** — resolve by `serviceKey`; add priority / SLA / emergency / after-hours charges |
| Engine | `b2bPricingEngine.service` — specificity scoring across all rules; `B2BDeductionRule` flat fallback; batch pricing with breakdown | **Extend** — fixed order *contract override → company pricing profile → default matrix* |
| Admin API | `b2bPricingAdmin.routes` (CRUD + preview) | **Reuse**; admin UI **missing** |
| Contracts | none for B2B (`VendorContract`, `AmcContract` are other domains) | **Missing** `B2BContract` |

**Defect B6** pricing keys on free-text service names, not service keys.

## 9. Push / FCM

| Area | What exists | Verdict |
|---|---|---|
| Tokens | `fcmTokens[]` + `fcmTokenMobile[]` arrays on User/Vendor/Worker/Engineer/Admin/B2BUser; per-role register routes (`fcmTokenFactory`) | **Extend** — `DeviceToken` registry (userId, role, deviceId, token, platform, lastSeen, active) |
| Sending | `firebaseAdmin.sendNotificationTo{User,Vendor,Worker,Admin,B2B,Engineer}`; invalid tokens removed on send failure | **Reuse**, also read `DeviceToken` |
| Orchestration | `notification/notificationOrchestrator` + `eventCatalog` (typed events, channels in_app/push/email/sms, `b2b` company fan-out) + `NotificationDeliveryLog` + BullMQ worker | **Reuse**; **missing** the B2B job lifecycle events |

## 10. Email

`services/emailService` (nodemailer; `sendMailSafe`, `sendTemplatedNotification`, a few bespoke B2B mails) is the orchestrator's `email` channel. Templates are code. **Reuse**; admin-editable templates are a gap.

## 11. Reporting

B2B `reports.routes` (summary, service/engineer performance, expenses, job status, **Excel via xlsx, PDF via pdfkit**), B2B invoices (list, CSV, PDF), admin B2B reports/invoices, `misCronScheduler`. **Reuse/extend** with SLA, first-time-fix, response/resolution, reconciliation and vendor performance reports.

## 12. Bulk upload

`b2bBulkJobService` + `B2BBatch` + `B2BBatchErrors`: .xlsx/.xls/.csv, header aliases, validation, in-file duplicates, service → `serviceKey`, coverage preview, batch pricing, error report, confirm → batch escrow hold → job creation → dispatch. **Extend**:
- **B5** with insufficient balance, confirm *creates* the jobs (`pending_wallet`) before payment.
- **B8** unknown columns silently ignored; no `serviceKey`/`requiredSkill`/asset columns; no 1,000-row cap; rows not persisted individually (no `BulkUploadRow`).

## 13. B2B identity & RBAC

`B2BCompany` (company login = "Company Admin"), `B2BUser { companyId, role (free text), permissions[] }`, `B2BRole`, `checkB2BPermission`. **Defect B4**: only `users.routes` enforces permissions; all other B2B routes only check `isApprovedB2B`, so any sub-user can top up the wallet, create/cancel jobs or read invoices. **Extend** with access roles B2B_ADMIN / B2B_OPERATIONS / B2B_FINANCE / DISPATCHER enforced on every route.

`B2BCompany` has `verificationStatus`, `onboardingLifecycleStatus`, `isActive` but no single status, allowed services/locations, pricing profile or SLA profile — **Extend**.

## 14. Lifecycle, routing, SLA

Reuse the Vendor Panel state machine and routing. **Missing**: PRICED / PAYMENT_PENDING / PAYMENT_VERIFIED stages; an UNASSIGNED state (today ON_HOLD + `assignmentType: unassigned`); EXPIRED for engineer acceptance timeout (today an ASSIGNED job can wait forever); admin-configurable routing (timeouts, fallback order, capacity); SLA thresholds for assignment/acceptance/arrival/response/resolution with SLA_BREACH events (today only a resolution due date).

## 15. Panels

- **B2B panel** (`modules/b2b`): dashboard, bulk jobs, jobs, live tracking, wallet, invoices, reports, support, users, engineers, settings — **Extend**.
- **Admin B2B** (`modules/admin/pages/B2B`, `B2BManagement`): companies, onboarding, submissions, wallets, invoices, reports, support, unassigned queue — **Missing**: pricing, contracts, transactions, routing, SLA, settings, company detail tabs.

## Plan (B2B)

1. Schema: wallet ledger fields, `B2BContract`, pricing components, `B2BBulkUploadRow`, `DeviceToken`, `B2BPlatformConfig` (routing/SLA/payment settings), company status/allowed services/locations, B2B access roles, lifecycle states.
2. Wallet ledger service — the only writer of B2B balances; demo mode; reservation per upload; charge on close; release on cancel; reconciliation.
3. Pricing resolution order + contract overrides + admin UI.
4. Bulk upload v2 — template, 1,000 rows, unknown columns, row persistence, preview with pricing, payment gate before job creation.
5. Lifecycle + routing: payment stages, UNASSIGNED, EXPIRED, configurable routing/fallback, SLA tracking.
6. RBAC for B2B roles; cross-tenant tests.
7. Notifications (catalog events, DeviceToken), audit log fields.
8. B2B panel and Admin B2B control panel UI.
9. End-to-end scenarios 1–5, then the report.
