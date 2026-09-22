# Vendor Management Upgrade: Final Report

Branch: `main` (uncommitted working tree), based on `632b14e`. The discovery snapshot is in [architecture-map.md](architecture-map.md).
Nothing has been committed or deployed. All tests ran against an isolated local stack: MongoDB replica set on :27400, Redis on :6390, backend on :5055, and test-only JWT secrets. None of them touched the production `.env` database or the dev server on :5000.

---

## 1. Architecture summary

- **One job record.** `B2BJob` is now the central Job/Work Order. The vendor panel, B2B portal, admin, engineer app (TazkY) and routing all read and write this one document. The vendor-side copy (`Opportunity` → `VendorOpsJob`) that B2B jobs used to fork into is gone for new jobs.
- **A server-side state machine owns status.** A canonical `lifecycleStatus` is enforced by `services/jobStateMachine.js` and changed only through `services/jobLifecycle.service.js`. Each change is a compare-and-set on the primary, a `JobHistory` row, and a socket event. Legacy `status`/`trackingStatus` stay in sync so the TazkY app, B2B portal and old admin screens keep working unchanged.
- **Model-level guard.** Any direct `B2BJob` update that touches `status`/`trackingStatus`/`lifecycleStatus` without the lifecycle service's `lifecycleManaged` flag is rejected (`UNMANAGED_STATUS_WRITE`). A `doc.save()` that changes status must be a legal transition.
- **Append-only assignment history.** `JobAssignment` records every assignment. A job has at most one open row (a partial unique index enforces this). Closed rows are immutable, and deletes and bulk updates are refused. `assignedTo`/`assignedVendorId` on the job always mirror the open row.
- **Coverage-based routing.** `VendorServiceCoverage` (vendor × service × cities/pincodes) plus skill, availability and workload rank vendors. Each ranking carries stated reasons. Jobs no vendor can take go to an unassigned queue with a human-readable reason.
- **Isolation in the query layer.** `services/jobScope.service.js` builds every read and write filter from the caller's role and id: admin sees all; B2B its `companyId`; vendor jobs it holds plus open offers; engineer assigned jobs plus open offers. This applies to REST, sockets and payments alike.
- **Payments as a read model.** Per-job payments and per-period settlements are computed from the existing split rules (`computeSplit`) and the vendor finance ledger (`VendorFinanceTransaction`). There is no parallel payment store.

## 2. Existing functionality reused

| Reused | How |
|---|---|
| `B2BJob`, `JobHistory`, `Engineer`, `Vendor`, `ServiceConfig`, `B2BCompany`/wallet, `VendorFinanceTransaction` | Extended (fields, hooks), not replaced |
| Auth (`authMiddleware`, `roleMiddleware`, `tokenService`), roles USER/VENDOR/WORKER/ENGINEER/ADMIN/B2B | Unchanged; new routes use `authenticate` + role checks in the service layer |
| Engineer skill matching (`b2bEngineerEligibility.engineerMatchesJob`), roster/leave, workload cap | Used by vendor ranking and engineer eligibility |
| Matching waves + BullMQ worker (`b2bMatchingService`) | Kept for freelancer waves; wave 0 now offers to coverage vendors; new `vendorOfferTimeout` job |
| Escrow / release engine, wallet holds | Kept; fixed vendor payee resolution (D16) and refund-on-completion (D15) |
| Socket.IO rooms (`admin`, `job:<id>`, `vendor:<id>`, `engineer:<id>`) | Same rooms, now access-checked; added `b2b:<companyId>` |
| Vendor panel layout, `DynamicSidebar` styling, contexts (`VendorConfig`, `VendorCounts`, `VendorSocket`), axios client, toasts, recharts, lucide | New pages mount inside the existing `/vendor/:serviceSlug/*` layout |
| Existing pages: Resources (inventory), MyJobs, Support, Compliance, Finance, old Engineers page | Mapped to Parts, Bookings, Support, Documents, Payments/Settlements sub-items, and Engineers → Roster & Leave |
| Admin B2B module (react-query, react-icons, toast) | New Unassigned Queue page follows the same conventions |

## 3. New functionality added

- **Lifecycle engine:** state machine, guards, legacy mapping, transitions with history and events, and legal multi-step paths (`transitionJobPath`).
- **Assignment service:** eligibility with reasons (skill, city/distance, roster/leave, workload, availability); assign, reassign (reason required), accept, reject, cancel; vendor claim; field progress (en route / arrived / started); every change is a new `JobAssignment` row.
- **Routing engine:** automatic, manual or hybrid mode; vendor ranking by coverage, skill, availability, workload and SLA; offers to the top N vendors; offer timeout → escalation to the unassigned queue with a reason; retry with an expanded radius; manual vendor pick; audited admin eligibility override.
- **Vendor panel:** Dashboard ops overview, Jobs, Engineers (with Add/Edit), Assignments (history and bulk assign), Services (coverage editor), Payments, Settlements (CSV), Analytics. Bookings, Parts, Support and Documents reuse existing pages.
- **Admin:** Unassigned Jobs Queue (retry, expand radius, route to vendor, assign freelancer, recent history).
- **B2B bulk upload:** per-row service key, SLA and pincode validation; coverage preview on the batch; a `routing-summary` endpoint.
- **Migration:** `scripts/migrations/backfillJobLifecycle.js` (dry run by default, `--apply` to write).
- **E2E suite:** `tests/e2e/vendorManagement.e2e.js` covers the 5 required scenarios, the Jobs sections (6) and the Engineers sections (7), the Assignments/Services/Parts sections (8), plus regression: 263 checks. It only runs against localhost.

**Security and correctness defects fixed along the way** (full detail in the architecture map):

| # | Defect | Fix |
|---|---|---|
| D1 | Socket accepted unverified (forged) JWTs via `jwt.decode` fallback | Unverified → GUEST |
| D2 | Anonymous sockets could drive job lifecycle events | Lifecycle socket events go through services; start/complete via socket refused |
| D3 | Vendor could read, claim or reject any booking (IDOR) | Scoped reads, atomic claim, ownership checks |
| D4 | Vendor could assign another vendor's engineer; no history | Ownership and eligibility checks; `JobAssignment` rows |
| D5 | Vendor could write arbitrary job statuses | Only hold/resume for vendors, validated by the state machine |
| D6 | Missing `JobStatusTimeline` import; admin approve without a submission | Import fixed; approve requires COMPLETED/VERIFICATION |
| D7 | Engineer accept/reject semantics wrong (reject of unassigned job, etc.) | Rewritten through the assignment service |
| D8 | `JobHistory` role `vendor` not in enum → history silently lost | Enum extended |
| D9 | Bulk upload geocoded unknown addresses to Mumbai | Row rejected as invalid location |
| D10 | Fabricated 70% engineer payout (backend and vendor earnings modal) | Real split / ledger values; "Not recorded" when absent |
| D11 | Committed `.qa/*.tok` tokens, production `.env`, tests running `deleteMany` against `MONGODB_URI` | **Reported only.** See Remaining gaps |
| D12 | B2B `PATCH /jobs/:id` mass assignment | Field whitelist |
| D13 | B2B reassign unscoped plus a global `io.emit` | Scoped; room emits only |
| D14 | B2B approve-work without a state check | Requires COMPLETED/VERIFICATION |
| D15 | Escrow refunded on every completion | Refund only on cancel/fail paths |
| D16 | Vendor payout paid to the engineer instead of the vendor | Payee = `assignedVendorId` first |
| D17 | Worker booking accept/reject open to any role | `isFieldWorker` guard |
| D18 | Upload rate limiter mounted with `router.use` on `/api`, throttling unrelated routes (429s) | Per-route limiter |
| D19 | Cash collection unscoped; OTP step could be skipped | Participant middleware; confirm requires an issued OTP |
| — | Engineer list showed duplicated skills; editing skills left old service categories matchable (found by the UI contract check) | Skills de-duplicated; edit syncs `serviceCategories` |
| — | "Decline" on a job the vendor had accepted (Pending Assignment) always failed with 409 | Hand back (`POST /api/jobs/:id/release`); `/decline` on a held job hands it back |
| — | A handed-back job with other vendors' offers still open got no new deadline and could sit in ROUTED indefinitely; those vendors were not told it reopened | Re-offer with a stored deadline (`vendorOfferExpiresAt`) and a live `b2b:jobRequestReceived` (`reopened: true`); escalate if nobody is left |
| — | An offer timer from an earlier round could escalate a re-offered job early | Timer ignored when a newer deadline is stored |
| — | A job put on hold while the engineer was travelling or on site could never resume (only IN_PROGRESS, which needs started work) | Resume returns to the state it was paused in (`onHoldFrom`: EN_ROUTE / ARRIVED / IN_PROGRESS) |
| — | Dashboard "Active jobs" counted assigned→on hold but linked to In Progress; numbers disagreed | Cards and sections share one definition; card opens All Jobs filtered to active |
| — | **Vendor approving an invite-link join request also set `approvalStatus = approved` — the WBI verification flag — so any vendor could make an unverified engineer job-eligible.** Rejecting a join request marked the engineer rejected platform-wide | Vendor approval now only accepts the engineer into the team; WBI verification stays with admin (`POST /api/admin/engineers/:id/approve`). Rejection leaves WBI status untouched |
| — | The roster sync (run on every load of the old engineers page) reset the roster status to `active`, silently re-activating engineers the vendor had suspended/deactivated — and routing reads that status | Sync never overwrites the vendor's status; it is only set when a roster row is created |
| — | Vendor ranking ignored the roster: a vendor whose only skilled engineer was deactivated or on leave still got offers it could not staff | Deactivated/suspended engineers are excluded; engineers on leave count as skilled but not available |
| — | Old roster status endpoint wrote any `status`/`availability` value sent, and allowed deactivating an engineer who was on a job | Whitelisted actions; same rules as the Engineers section (reason, no deactivation while holding jobs) |
| — | New Engineers page showed engineers deactivated by the vendor or on leave as Active/Available (it ignored roster and leave), while routing refused them | One team-state model (`vendorEngineers.service.js`) used by the pages, dashboard and routing |

## 4. Database / model changes

| Model | Change |
|---|---|
| `B2BJob` | `source` (USER_APP · B2B · ADMIN · VENDOR · SYSTEM, required on create), `createdBy{actorId,role}`, `serviceKey`, `subServiceKey`, `serviceConfigId`, `lifecycleStatus`, `lifecycleUpdatedAt`, `routingMode` (auto/manual/hybrid), `routingMaxRadiusKm`, `slaDueAt`, `currentAssignmentId`, `declinedEngineers`. `assignmentType` adds `unassigned` (default). New indexes. Hooks: derive the lifecycle on create, validate unmanaged status changes on save, reject unmanaged status writes in query updates |
| `JobAssignment` (new) | jobId, jobCode, assignmentType, vendorId, engineerId/name, assignedBy, routingMode, reason, eligibility snapshot, previous/next links, status, `isOpen`, per-event timestamps, closeReason/closedBy. Unique partial index `{jobId}` where `isOpen:true`. Immutable/append-only guards |
| `VendorServiceCoverage` (new) | vendorId, serviceKey (uppercase), serviceName, serviceConfigId, coverageCities (normalised), coveragePincodes (6-digit), active, updatedBy. Unique `{vendorId, serviceKey}` |
| `JobHistory` | role enum + `vendor`; `fromStatus`, `toStatus`, `event`, `meta` |
| `B2BBatch` | `routingPreview {coveredRows, uncoveredRows, uncoveredSamples}` |
| `Engineer`, `Service`/`ServiceConfig`, payments | No schema change. Settlements and payments are computed views |

**Migration (required before deploy):**

```
cd Backend
node scripts/migrations/backfillJobLifecycle.js          # dry run — prints what would change
node scripts/migrations/backfillJobLifecycle.js --apply  # writes
```

It backfills `source`, `lifecycleStatus` (derived from legacy status), `serviceKey`, `slaDueAt` and `assignmentType`. It opens a `JobAssignment` for every job currently held by an engineer or vendor. It seeds `VendorServiceCoverage` from approved vendors' services × cities. It is idempotent: a re-run verified 0 changes. **Without it, coverage is empty and every new B2B job lands in the unassigned queue.**

## 5. API changes

New routes (all `authenticate`, role and scope enforced in the service layer):

| Method & path | Who | Purpose |
|---|---|---|
| `GET /api/vendors/:vendorId/jobs` | Vendor (self), Admin | Tabs (all, new, pending_assignment, assigned, accepted, in_progress, completed, cancelled, rejected, unassigned, overdue) with counts, filters, sort, pagination |
| `GET /api/vendors/:vendorId/engineers` | Vendor (self), Admin | Status tabs + counts, availability, skills, coverage, workload, current jobs, rating |
| `GET /api/vendors/:vendorId/dashboard` · `/analytics` · `/assignments` · `/payments` · `/settlements` · `/settlements/:id/download` | Vendor (self), Admin | Computed from job, assignment and ledger data |
| `GET` / `PUT /api/vendors/:vendorId/service-coverage[/:serviceKey]` | Vendor (self), Admin | Coverage editor (vendor must be approved for the service) |
| `GET /api/jobs/:id` · `/timeline` · `/assignments` · `/eligible-engineers` | Scoped by role | Job detail with masked contact for offers, milestones and events, history, eligibility with reasons |
| `POST /api/jobs/:id/assign` · `/reassign` · `/accept` · `/decline` · `/transition` · `POST /api/jobs/bulk-assign` | Vendor/Admin (assign), Vendor (offers), role targets (transition) | Every write goes through the state machine; reassign needs a reason |
| `POST /api/jobs/:id/release` | Vendor holding the job | Hand back an accepted job before an engineer is on it (reason required); it re-routes or escalates |
| `GET /api/vendors/:vendorId/engineers?tab=all\|pending\|active\|inactive` (+ `pendingOn`, `availability`, `skill`, `search`) | Vendor (self), Admin | Team with status + reason, availability, skills, coverage, schedule, current jobs, allowed actions; section counts |
| `GET /api/vendors/:vendorId/engineers/:engineerId` · `/engineers/skills` · `/engineers/performance?from&to` | Vendor (self), Admin | Profile (verification, schedule, leave, assignment history, 90-day performance); skills matrix against the vendor's services using the routing matcher; per-engineer performance |
| `POST /api/vendors/:vendorId/engineers/:engineerId/deactivate` (reason) · `/activate` · `/approve` · `/reject` (reason) | Vendor (self), Admin | Team status and join requests; deactivation refused while the engineer holds a job |
| `POST /api/vendor/engineers` · `PATCH /api/vendor/engineers/:id` | Vendor | Add engineer (PENDING until WBI verification); edit skills, coverage, working days |
| `POST /api/routing/jobs/:id` · `POST /api/routing/retry` | Admin | Re-run routing (optional `expandRadiusKm`); bulk retry (≤100) |
| `GET /api/routing/jobs/:id/candidates` | Admin (full), B2B (own jobs, reduced fields) | Ranked vendors plus rejected vendors with reasons |
| `POST /api/routing/jobs/:id/vendor` | Admin (+override), B2B (eligible only) | Manual routing, reason required, audited |
| `GET /api/routing/unassigned` | Admin, B2B (own) | Unassigned queue with stated reasons |
| `GET /api/b2b/bulk-jobs/:batchId/routing-summary` | B2B | Per-batch routing outcome |
| `GET /api/admin/b2b/jobs/escalations/:id/vendor-candidates` · `POST …/route-to-vendor` | Admin | Escalation screen helpers |

Differences from the requested contract: engineer create/edit sit under the existing vendor router (`/api/vendor/engineers`) rather than a new top-level `/engineers`. Settlements and payments are vendor-scoped (`/api/vendors/:id/settlements`, `/payments`) instead of top-level.

Changed behaviour on existing routes: vendor `my-jobs` status updates are limited to hold/resume; B2B `PATCH /jobs/:id` is whitelisted; B2B reassign is scoped; engineer B2B accept/reject/travel/arrive/start/complete run through the assignment service; admin escalation approve/reject check state; cash-collection routes require a participant and an OTP.

## 6. Frontend changes

**Vendor panel** (`Frontend/src/modules/vendor`), inside the existing layout:

- **Sidebar** (`components/DynamicSidebar.jsx`), same visual style: Dashboard · Jobs · Engineers · Assignments · Services · Parts · Bookings · Payments · Settlements · Support · Analytics · Documents · Settings · Notifications. Jobs badges come from live job counts (`hooks/useJobCounts.js`, refreshed on socket events). Sub-item highlighting now respects `?tab=`.
- **Routes** (`routes/index.jsx`): `jobs/*`, `engineers/*` (new page), `engineers/roster/*` (old page), `assignments/*`, `services/*`, `bookings/*` (→ MyJobs), `parts/*` (→ Resources › Inventory), `resources/*`, `payments/*`, `settlements/*`, `analytics/*`, `support/*`, `documents/*` (→ Compliance). Flat aliases `/vendor/jobs` etc. resolve to the vendor's service portal. `my-jobs` still works.
- **Assignments** (Assign Job · Bulk Assignment · Assignment History · Reassignment): a dispatch queue of jobs needing an engineer with each job's top eligible engineers (server-checked) and one-click assign; bulk assign by "best match" (server picks per job, re-checking workload after each) or per-job choice, with a result per job; full history with outcome counts, engineer/date/job filters and CSV; a reassignment board that flags jobs not accepted within `JOB_ENGINEER_ACCEPT_WAIT_MINUTES` (default 30), engineers on leave or inactive, and SLA risk, plus recent reassignments with reasons.
- **Services** (My Services · Service Coverage · Service Keys · Service Areas): per approved service whether routing can send work and what is missing (coverage, skilled engineer, WBI status), live job counts and SLA; the per-service coverage editor; the keys, aliases, sub-service keys and SLA rules routing and bulk uploads use, with a "check a service name" resolver; an area-first view (city/pincode → services, engineers there, your jobs in 30 days) with add/remove across several services in one step.
- **Parts** (Parts · Inventory · Required Parts · Used Parts): the WBI parts catalog with your stock of each; inventory with add, restock, count correction, damage write-off, reorder level/cost and a per-item movement log; parts required per job (reserve from stock, shortfall shown, cancel returns stock) and parts used (stock deducted, value, CSV, plus parts engineers noted as text). A cancelled or failed job returns its reserved parts automatically; stock changes are atomic, so the last unit cannot be reserved twice.
- **Engineers sections** (sidebar and pages): All Engineers · Add Engineer · Pending Engineers · Active Engineers · Inactive Engineers · Engineer Skills · Engineer Availability · Engineer Performance. Pending / Active / Inactive partition the team, each with the reason (e.g. "Needs your approval", "Waiting for WBI to verify documents", "Deactivated by you"). Add Engineer picks services from the vendor's approved services so skills match routing, captures coverage and schedule, and offers the company code / invite link. Skills shows, per service, which engineers match (routing's own matcher), who can work now and the gaps that stop routing sending work. Availability shows available / on a job / on leave / off today / offline with workload and schedule editing. Performance: assigned, acceptance, response time, completed, SLA, on-site time, turnaround, rework, closed value, rating — for any period, with CSV. The old roster page stays at Engineers → Availability → Roster & leave.
- **Jobs sections** (sidebar and page, same order and counts): All Jobs · New Requests → Pending Assignment → Assigned → Accepted → In Progress → Completed · Cancelled · Rejected. The six stage sections are exclusive and together cover every job the vendor holds; New Requests is open offers; Rejected is history (offers declined, jobs handed back, engineer rejections). Each section explains what it means and what to do next, has sub-status filters where it spans several states (e.g. In Progress: en route / on site / working / on hold), and each row says why the job is there (offer deadline, which engineer rejected and why, hold reason, who cancelled and why). Overdue and Active are quick filters. Old links `?tab=unassigned` and `?tab=overdue` still resolve.
- **New pages:** `pages/Jobs` (the sections above, filters, table on desktop and cards on mobile, detail drawer with timeline, accept → assign in one step, assign/reassign dialog showing eligibility reasons, decline / hand back / hold with a required reason, resume to the paused state, live socket refresh), `pages/VendorEngineers` (status tabs, availability, Add/Edit engineer), `pages/Assignments` (history + bulk assign), `pages/Services` (coverage), `pages/Payments`, `pages/Settlements` (CSV), `pages/Analytics`.
- **Dashboard:** `JobOpsOverview` (10 cards and 6 charts) inserted into the existing `DynamicDashboard`. Charts use a colour-blind-validated palette, a table view toggle and tooltips. SLA is a single "% met" line; a red/green pair failed the CVD check.
- **Shared UI:** `components/ops/OpsUi.jsx` (badges, skeleton/empty/error states, modal, confirm, pagination, stat card), `OpsCharts.jsx`, `opsFormat.js`, and `services/vendorJobsService.js`.
- **Fixes:** the earnings modal no longer invents a 70/30 engineer/vendor split; the dashboard card no longer claims "100% verified".

**Admin:** `pages/B2B/UnassignedQueue.jsx` at `/admin/b2b/unassigned`, added to the B2B menu (`adminMenu.json`, `AdminSidebar.jsx`). New `b2bAdminService` methods.

Build: `vite build` passes. All new and edited files lint clean except 4 unused-variable errors that were already in `DynamicDashboard.jsx`. The repo baseline has about 470 lint errors in vendor/admin.

## 7. Role / permission matrix (as implemented)

| Capability | Admin | Vendor | Engineer | B2B | User |
|---|---|---|---|---|---|
| Read job | All | Held jobs + open offers (customer contact masked) | Assigned + open offers | Own company | No access to B2B jobs |
| Assignment history | All | Held jobs | Own assignments | Own jobs | — |
| Accept/decline vendor offer | — | Own offers | — | — | — |
| Assign engineer | Freelancers on vendor-less jobs | Own engineers on held jobs | — | — | — |
| Reassign (reason required) | Yes | Own engineers | — | Freelancer jobs only; not vendor-held jobs | — |
| Accept/reject assignment, field progress | — | — | Own assignment | — | — |
| Transition | ON_HOLD, CANCELLED (reason); resume IN_PROGRESS; back to PENDING_ASSIGNMENT | ON_HOLD (from field states, reason); resume | Via field actions only | CANCELLED (reason) | — |
| Approve / reject completed work | Yes | — | — | Own jobs | — |
| Routing re-run / retry | Yes | — | — | — | — |
| Vendor candidates / manual routing | Full + override (audited) | — | — | Own jobs, eligible vendors only | — |
| Unassigned queue | All | — | — | Own | — |
| Vendor jobs/engineers/dashboard/analytics/payments/settlements/coverage | Any vendor id | Own id only (403 otherwise) | — | — | — |
| Add/edit engineers | — | Own (new ones stay PENDING until WBI approval) | — | — | — |
| Approve/decline join requests, deactivate/reactivate engineers | Any vendor's | Own team only (never grants WBI verification) | — | — | — |
| Socket rooms | admin | `vendor:<self>`, jobs it can read | `engineer:<self>`, jobs it can read | `b2b:<company>`, own jobs | own bookings |

Unauthenticated or forged socket tokens connect as GUEST and cannot join job rooms or emit lifecycle events.

## 8. Job lifecycle / state machine

| From | Allowed to |
|---|---|
| CREATED | VALIDATED, CANCELLED |
| VALIDATED | ROUTED, PENDING_ASSIGNMENT, CANCELLED |
| ROUTED | PENDING_ASSIGNMENT, ASSIGNED, ON_HOLD, CANCELLED |
| PENDING_ASSIGNMENT | ASSIGNED, ON_HOLD, ROUTED, CANCELLED |
| ASSIGNED | ACCEPTED, REJECTED, REASSIGNED, CANCELLED |
| ACCEPTED | EN_ROUTE, REASSIGNED, CANCELLED |
| EN_ROUTE | ARRIVED, ON_HOLD, REASSIGNED |
| ARRIVED | IN_PROGRESS, ON_HOLD, REASSIGNED |
| IN_PROGRESS | COMPLETED, ON_HOLD, FAILED |
| COMPLETED | VERIFICATION, CLOSED |
| VERIFICATION | CLOSED, IN_PROGRESS (revision) |
| ON_HOLD | ROUTED, PENDING_ASSIGNMENT, EN_ROUTE, ARRIVED, IN_PROGRESS, REASSIGNED, CANCELLED |
| REJECTED | PENDING_ASSIGNMENT |
| REASSIGNED | ASSIGNED |
| FAILED | PENDING_ASSIGNMENT |
| CANCELLED, CLOSED | terminal |

Guards: a held job resumes only to the state it was paused in (`onHoldFrom`, recorded on every move to ON_HOLD). ON_HOLD → IN_PROGRESS requires that work had started; ON_HOLD → EN_ROUTE / ARRIVED require an engineer and no started work. Any → ASSIGNED requires an engineer. FAILED → PENDING_ASSIGNMENT is blocked when reopening is disabled. An illegal move returns `409 INVALID_TRANSITION`. A concurrent change loses the compare-and-set and returns 409 instead of overwriting.

Legacy mapping, kept for TazkY and older screens: for example PENDING_ASSIGNMENT ↔ `accepted` (vendor holds) or `pending`, EN_ROUTE ↔ `travelling`, VERIFICATION ↔ `completion_submitted`, CLOSED ↔ `completed`, ON_HOLD ↔ `on_hold`/`escalated`.

## 9. Routing logic

1. **Validate** on creation: service → `serviceKey` (ServiceConfig category), pincode format, geocode (no silent fallback), SLA due date from the ServiceConfig SLA rules by priority. Unfunded jobs wait at VALIDATED (`pending_wallet`).
2. **Find eligible vendors:** there must be an active coverage row for the `serviceKey` that includes the job's pincode or city. The vendor must be approved, active and not suspended for the service, and must have at least one engineer skilled for the job. Every excluded vendor carries its reasons.
3. **Rank:** pincode match 20 / city match 10, + 10 × available skilled engineers (online, on roster today, under the workload cap), + 2 × skilled engineers, − 2 × active jobs, + SLA compliance × 0.2 (5 if no history).
4. **Offer (auto/hybrid):** the top `JOB_VENDOR_OFFER_LIMIT` (5) vendors are notified: job → ROUTED, socket event, notification. The first vendor to accept claims the job atomically → PENDING_ASSIGNMENT, and the others get `vendor:jobOfferClosed`.
5. **Assign:** the vendor picks from server-computed eligible engineers (skill, city or distance ≤ max(50 km, the engineer's radius), leave/roster, workload < `B2B_MAX_ACTIVE_JOBS_PER_ENGINEER` (3), availability). If the engineer rejects, the job goes back to the vendor (REJECTED → PENDING_ASSIGNMENT) and the vendor is notified.
6. **Freelancer waves** still run for jobs no vendor holds, excluding engineers who declined.
7. **Escalate:** no covering vendor, no eligible engineer, or offers unanswered after `JOB_VENDOR_OFFER_TIMEOUT_MS` (30 min) → ON_HOLD, `assignmentType: unassigned`, escrow released back to the company, and a stated reason such as "No vendor covers AC_REPAIR in pincode 474001". The job then appears in the admin (and B2B) unassigned queue.
8. **Manual:** admin or B2B picks an eligible vendor (reason required). Admin can override eligibility (audited). Admin can retry with an expanded radius or assign a freelancer directly.

## 10. Cross-panel integration flow

```
B2B portal: bulk upload ─► rows validated (serviceKey, pincode, SLA) ─► B2BJob {source:B2B, VALIDATED}
     │                                   └─ coverage preview on batch / routing-summary
     ▼
Routing ─► coverage vendors ranked ─► offers ─► socket b2b:jobRequestReceived ─► Vendor panel "New Requests"
     │        └─ none / timeout ─► ON_HOLD + reason ─► Admin "Unassigned Jobs Queue" (retry · route · assign)
     ▼
Vendor accepts (atomic claim, others get vendor:jobOfferClosed) ─► PENDING_ASSIGNMENT
     ▼
Vendor assigns engineer (eligibility shown) ─► JobAssignment row ─► engineer:jobAssigned ─► TazkY app
     ▼
Engineer accept → EN_ROUTE → ARRIVED → IN_PROGRESS → submit (COMPLETED → VERIFICATION)
     │   every step: JobHistory + job:statusChanged / b2b:jobStatusUpdated to admin, job, company, vendor, engineer rooms
     ▼
B2B/Admin approve ─► CLOSED ─► escrow release to vendor ledger ─► Vendor Payments / Settlements / Dashboard
         reject  ─► IN_PROGRESS (revision, no refund)
```

User App bookings stay on the `Booking` model and flow to freelancers/workers as before. They are scoped and protected (D3, D17, D19) and appear in the vendor panel under Bookings.

## 11. Testing performed

Isolated stack only. E2E: `tests/e2e/vendorManagement.e2e.js`. Last run **263/263 passed**, with 0 unhandled errors, TypeErrors or ReferenceErrors in the backend log.

| Scenario | Checks | Result |
|---|---|---|
| 1. B2B bulk upload → coverage vendor → engineer Rahul → field steps → CLOSED → vendor payment and settlement | 52 | Pass |
| 2. User App booking → freelancer (TazkY flow) → completed; vendor cannot see or claim it; cash OTP enforced | 18 | Pass |
| 3. No vendor covers the job → ON_HOLD with stated reason → admin assigns → CLOSED | 17 | Pass |
| 4. Engineer rejects → back to vendor → reassigned; full assignment history kept | 13 | Pass |
| 5. Vendor A vs Vendor B isolation (jobs, engineers, payments, sockets) + arbitrary status writes refused | 30 | Pass |
| 6. Vendor Jobs sections: one job through New → Pending → Assigned → Accepted → In Progress (hold + resume to the paused state) → Completed → Closed; declined offer and hand-back in Rejected (history only, 403 on detail); hand-back re-offered to the other vendor with a deadline, then escalated; client cancel in Cancelled with reason; sections partition held jobs; counts = lists = dashboard; overdue/active filters; old links; pre-migration job healed into its section | 43 | Pass |
| 7. Vendor Engineers sections: sections partition the team; add engineer (validation, schedule stored, lands in Pending/WBI); invite join request approved (stays pending WBI — bypass closed) or declined (removed, WBI status untouched); WBI verification → Active; deactivate refused while on a job, needs a reason, 403 across vendors; deactivated engineer ineligible for jobs with the reason, survives the roster sync, eligible again after reactivation; vendor ranking drops a vendor whose only skilled engineer is deactivated; leave → on leave, non-working day → off today, busy with job count; counts = filters = dashboard; skills matrix with routing matcher and unmatched skills; performance metrics and totals; detail private per vendor | 33 | Pass |
| 8. Assignments · Services · Parts: queue = pending jobs, best eligible engineers (not on leave), SLA order; auto-assign 3 jobs to eligible engineers, refuses a job not held, 403 across vendors; reassignment board flags not-accepted and engineer-on-leave jobs, records from/to/reason; history outcome filter, counts, job search, privacy; My Services readiness/coverage/engineers/jobs/SLA; service keys aliases + sub-keys; resolver (alias → key, not-yours, empty 400); areas list, invalid pincode 400, unapproved service 403, add/remove updates routing coverage; catalog with category; inventory create from catalog/free, duplicate 409, wrong service 400; required parts reserve / short / not stocked; use consumes reservation, refuses short stock; cancel needs reason; restock/correct/damage with movement log; concurrent reservation of the last unit — exactly one wins; cancelled job releases reserved parts; used parts value; job detail parts hidden from the client | 36 | Pass |
| Regression: existing endpoints (vendor my-jobs/requests/engineers, B2B jobs + bulk history, admin escalations/submissions, engineer B2B jobs) + no fabricated payout + unverified engineer not eligible | 21 | Pass |

Also run:
- Model guard sanity (18/18)
- Migration dry run and `--apply` on seeded legacy documents (correct ROUTED / IN_PROGRESS / ON_HOLD / CLOSED mapping, open assignment created, coverage seeded, idempotent re-run)
- Backend `npm run verify` (237 route files load)
- Frontend production build
- A UI contract check: every field the new vendor and admin pages read exists in the real API responses, and the Add/Edit engineer round-trip works

Not done: no browser-based UI test. Pages were verified by build, lint and API contract only, not clicked through in a browser.

## 12. Remaining gaps

**Before deploy**
- Run the migration against production after reviewing the dry-run output. Without it, B2B routing finds no coverage.
- D11, not fixed (needs owner action): committed `.qa/*.tok` tokens should be revoked and removed from history; `Backend/.env` with production credentials is in the repo; some existing tests call `deleteMany` against `MONGODB_URI` and would wipe whatever database is configured.
- `REDIS_ENABLED=true` crashes boot (rate limiter builds its Redis store before Redis initialises). This bug existed before this work; the harness ran with it off.
- Ops scripts `scripts/repairB2BOpportunityRouting.js`, `repairStuckB2BJobs.js` and `verifyB2BAllocationFlow.js` write status directly. The model guard now rejects them loudly; port them to `transitionJob` if still needed.

**Behaviour changes to communicate**
- B2B/admin rejection of submitted work now means revision (back to IN_PROGRESS) instead of refund.
- Vendor-added engineers start PENDING and cannot take jobs until WBI verifies them. The same now applies to engineers who join with the invite link: vendor approval no longer grants WBI verification, so they appear in the admin engineer verification queue.
- Deactivating an engineer is refused while they hold any of the vendor's jobs; reassign first.
- Parts: the TazkY engineer app still reports parts only as free text at completion (shown under Used Parts for the vendor to record); engineers cannot yet record or see required parts in the app. The older Resources → Inventory screen still adjusts stock with its own non-atomic endpoint; the new Parts pages use atomic updates on the same stock. Parts value is shown to the vendor but is not added to client invoices.
- Services: routing treats a vendor service as usable unless it is `suspended` (existing convention); `pending` services are shown as "Pending WBI approval" in My Services but are not blocked. Adding a new service is done by WBI (vendors raise a support ticket).
- Vendors can no longer set arbitrary statuses; only hold/resume, with other steps driven by the engineer app.

**Not covered / follow-ups**
- The TazkY Flutter app is not in this repo. Compatibility rests on unchanged endpoints and legacy status mirroring, confirmed by API tests, not on the app itself.
- In-flight legacy B2B jobs that already forked into `Opportunity`/`VendorOpsJob`, and the `freelancerAcceptProject` path, still exist for old data. New jobs no longer use them.
- User App bookings remain on the `Booking` model rather than `B2BJob`. The single-record rule holds for B2B/admin/vendor work orders; bookings are a separate, pre-existing flow.
- Parts, Documents and Support reuse the existing Resources, Compliance and Support pages; they were not redesigned.
- The B2B portal's Bulk Jobs page does not yet display the new `routingPreview` / `routing-summary`. The API is ready.
- `pages/BookingDetails` (digital-solution portal) still has a 70% / ₹49 / 18% fallback for plan-benefit bookings when the backend omits amounts. It was left in place because blanking it would show ₹0; it needs the real values from the booking API.
- The digital-solution vendor portal (`/vendor/digital-solution/*`) keeps its own layout and did not get the new pages.
- Pre-existing uncommitted admin "platform overview" files in the working tree were not part of this work and were left untouched.
