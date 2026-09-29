# TASKY Admin — Gap Analysis & End-to-End Test Report

**Date:** 29 Sep 2026 · **Environment:** local backend (`:5000`) + Vite frontend (`:5173`) against the **dev** Atlas DB, Redis local, Razorpay **test mode**, `USE_MOCK_KYC=true`.

## 1. Summary

| | |
|---|---|
| Automated checks run | **265** (API + real browser UI via headless Chrome) |
| Passing | **251** |
| Open findings from the run | **6** (+ design gaps listed in §4) |
| Expected / by-design | 8 (per-company B2B report endpoints need `companyId`) |
| Bugs found **and fixed** during testing | **14** (10 of them money- or security-critical) |

Every flow asked for was exercised end to end, through the API **and** the UI:
onboarding (user, vendor, vendor-engineer, freelancer engineer, worker, B2B company), B2C service booking (book → dispatch → accept → OTP visit → complete → cash with OTP → rating), B2B (wallet → bulk upload → validation → pricing → reserve/escrow → dispatch → engineer → completion → admin approval → release; plus the vendor route B2B → Vendor → Engineer), withdrawals (engineer and vendor, incl. admin approve / reject / mark-paid), a real Razorpay test-mode payment, and admin controls/RBAC.

**Before these fixes, the core B2C flow was broken:** every instant one-time booking was auto-cancelled with "No nearby technicians", and a worker could complete any job at any stage and get paid without the customer paying.

---

## 2. Spec coverage (16 sections)

Legend: ✅ built & working · 🟡 partial · ❌ missing

| # | Section | Status | What exists | What is missing / wrong |
|---|---|---|---|---|
| 1 | Dashboard | 🟡 | Users/vendors/workers/bookings counts, revenue, commission, pending withdrawals & settlements, B2B overview (companies, jobs by status, wallet, escrow), engineers split vendor/freelancer, SLA & first-time-fix, recent bookings | Pending-KYC count, refunds, disputes, recent transactions feed, system alerts; B2C and B2B jobs are separate numbers, not one "Active/Pending/Completed" view |
| 2 | User management | 🟡 | List/search, details (profile, bookings, wallet), block/unblock (enforced on live sessions), delete | No pending-verification / approve / reject state for users, no documents, addresses, refunds or activity tabs, admin cannot edit profile, **block/unblock is not audit-logged** |
| 3 | B2B management | ✅ | Status tabs, approve/reject, document & bank verification, suspend, controls (services, locations, pricing profile, SLA profile, credit limit, billing mode), company users, activity, wallets (adjust, refund, reconcile, reverse), pricing rules, contracts, invoices, reports, support, escalations, bulk-job admin view | Service/location access was **not enforced** (fixed). Unknown service codes are still accepted in controls. Bulk upload limit is global only (not per company). No wallet spend limits other than credit limit. No platform-wide B2B report |
| 3b | B2B bulk pipeline | ✅ | Upload → validation → pricing → wallet reserve → escrow → dispatch (vendor marketplace or freelancer waves) → engineer → completion → admin approval → release; visible to admin at each stage | Per-job escrow amount was wrong (fixed). Captured top-ups could be lost if the tab closed (fixed) |
| 4 | Vendor management | 🟡 | Status tabs, details (docs, bank, stats), approve/reject/suspend, KYC & bank status, service approval, coverage (city/pincode), bookings, earnings, settlements ledger, cash limit, block, withdrawals | No per-vendor commission, no admin-side engineer assignment control, no performance scorecard. `VendorServiceOffering` has **no admin approval endpoint** (feature can't complete). Two vendor wallets in parallel (`Vendor.wallet` and `VendorFinanceWallet`) |
| 5 | Engineers & workers | 🟡 | Separate sections; engineer type freelancer / vendor-engineer; approve/reject/suspend (now enforced on sessions); selfie, video & vehicle review; jobs; earnings; pay; joining-fee coupons; registration config | No "Offline" filter or availability control, no admin assign/change of vendor, skills, service eligibility or location. Withdrawal rules (min, OTP, daily limit) are not applied to engineer/worker (they are for vendors). Dispatch ignores the online session, and workers with no coordinates match any city |
| 6 | Services | 🟡 | Categories, services, sub-services, skills, 24 service configs (C01–C24) with forms/registration/dashboard/permissions/audit/rollback, assignment configs, one-time services, brands, plans | **Several parallel catalogs** (Category, Service, UserService, OneTimeService, ServiceCategory, ServiceConfig) with duplicates ("Electrical" vs "Electrical Services"; empty "AC / HVAC", "Networking"…) — this caused the dispatch bug. Hardcoded pricing fallbacks (commission 20%, platform fee ₹29, visit ₹49; service page shows ₹49 fee, review charges ₹30 + ₹20). Assignment config is overridden in code (radius floors, mode forced to broadcast) |
| 7 | Job management | 🟡 | B2C: list, detail, timeline, matching, assign/reassign, cancel, status, notes, payment, logs. B2B: escalations, submissions approve/reject, manual assign, route to vendor | No unified Jobs list across B2C/B2B/project jobs; 3+ overlapping state machines; **no dispute workflow** (only enum values); B2C timeline records 2 events for a full job |
| 8 | Payments | 🟡 | Overview, GST/TDS/COD/revenue reports, transactions, payment config + audit, settlements | No B2C refunds screen, no failed-payments view, no unified escrow view |
| 9 | Wallet & escrow | 🟡 | B2B ledger with reserve/charge/release/refund and reconciliation (drift 0 in tests); engineer, worker, vendor wallets | Money stored as floats (₹1646.3600000000004). Wallet logic duplicated per role |
| 10 | Location & assignment | 🟡 | Cities CRUD, vendor coverage (city/pincode), B2B allowed locations (now enforced), wave/radius matching | No country/state/pincode master, service areas, engineer coverage management; matching rules not admin-controllable in practice |
| 11 | Verification / KYC | ✅ | GST & CIN verification, DigiLocker, PAN/Aadhaar/bank, admin verification queue (approve/reject/re-upload), config, logs | KYC endpoints were unauthenticated (fixed). Registration-time KYC/penny-drop queue jobs are simulated placeholders (`setTimeout`) |
| 12 | Notifications | 🟡 | Orchestrator (in-app, push, email, SMS), delivery logs, event list, announcements | Templates and channels hardcoded in `eventCatalog.js` (not admin-editable). Worker/engineer withdrawal alerts went to non-existent roles (fixed). Workers get each offer 4× over the socket |
| 13 | System settings | 🟡 | Fees, GST, payout %, TDS, cash limit, cancellation penalty, search/wave, withdrawal rules, company & invoice, B2B platform config, vendor settings, payment config | Payment-gateway/Cloudinary secrets are stored in the settings document and returned to any admin (currently empty). Any admin can change settings. Rules not applied consistently |
| 14 | Roles & permissions | ❌ | Only `super_admin` / `admin`; admin-management is super-admin only | No Operations/Finance/Support/Verification roles, no permission keys (`users.read`, `wallet.manage`, …). Any admin can move B2B money and change platform settings. Most `/api/admin/*` routes are protected only because `b2bManagement.routes.js` happens to run `router.use(authenticate, isAdmin)` for the whole prefix. The B2B side already has a real permission model (`checkB2BPermission`) to copy |
| 15 | Reports & analytics | 🟡 | Bookings, vendors, workers, engineers, revenue, customers, payment reports, per-company B2B reports + Excel/PDF export | Refund, withdrawal and commission reports; platform-wide B2B report; B2C service performance |
| 16 | Audit logs | 🟡 | `AuditLog` model with actor, old/new value and reason; used by B2B wallet, escrow, onboarding, payment config, service config | No central audit viewer; user/vendor/worker/engineer status changes, settings and admin-role changes are not (or inconsistently) logged |

---

## 3. Bugs found and fixed

### Money & dispatch (critical)
| # | Bug | Fix | File |
|---|---|---|---|
| 1 | Every instant one-time booking auto-cancelled ("No nearby technicians"): `Booking.serviceId` refs `Service`, but one-time bookings store a `OneTimeService` id → populate returned `null` → matcher found no workers | Stop populating `serviceId` in the matcher; eligibility resolves the service itself | `Backend/services/matchingService.js` |
| 2 | Worker could complete a job from **any** status (no OTP) and a merely *notified* worker could complete someone else's job | Only the assigned worker/engineer; only after visit OTP (`visited`/`service_started`/`in_progress`/`work_done`) | `Backend/controllers/bookingControllers/workerBookingController.js` |
| 3 | Every one-time booking counted as "prepaid" (`paymentMethod==='razorpay'` is set at booking time) → booking marked completed and worker wallet credited with **no payment collected** | Prepaid only when `paymentStatus` is paid/success | same |
| 4 | Cash collection rejected every one-time booking (`razorpay` not an allowed method) | Allow `razorpay` (unpaid) bookings to switch to cash | `Backend/controllers/bookingControllers/cashCollectionController.js` |
| 5 | B2B escrow held the **batch average** per job, so a ₹1,231.80 job was charged ₹963.41 and a ₹695.02 job was over-charged | Hold each job's own price | `Backend/services/b2bBulkJobService.js` |
| 6 | Engineer/worker withdrawals: **3 parallel requests withdrew ₹930 from a ₹310 balance**; rejecting them later minted money | Atomic balance hold (`findOneAndUpdate` with `$gte`) | `Backend/services/fieldWithdrawalGuard.service.js` (new), both wallet controllers |
| 7 | Engineer/worker withdrawals paid out to **any bank/UPI in the request body**; any well-formed UPI skipped bank verification | Payout goes to the verified `BankAccount` or the UPI saved on the profile | same |
| 8 | Razorpay-captured B2B top-up never credited if the browser closed before the verify call | Payments webhook now credits pending top-ups (idempotent with the verify call) | `Backend/controllers/paymentControllers/razorpayPaymentsWebhook.controller.js` |

### Security & access
| # | Bug | Fix | File |
|---|---|---|---|
| 9 | `/api/kyc/*` had **no auth**: anyone could mark any real account's PAN/Aadhaar/bank verified, read its KYC status, or change admin KYC document rules | Real accounts need the owner (or admin); draft registrations (temp ids) stay public; `/admin/document-rules` is admin-only | `Backend/routes/kyc.routes.js`, `Backend/middleware/authMiddleware.js` |
| 10 | Suspended workers/engineers kept full API access on existing sessions | `authenticate` rejects `isActive:false` workers/engineers | `Backend/middleware/authMiddleware.js` |
| 11 | B2B company "allowed services / locations" controls were stored but **not enforced** (a C12/Indore-only company could book CCTV jobs in Mumbai) | Enforced during bulk validation | `Backend/services/b2bBulkJobService.js` |

### Data integrity & UX
| # | Bug | Fix | File |
|---|---|---|---|
| 12 | `EngineerPayment` unique index (duplicate joining-fee credit guard) could never be built (`sparse` + `partialFilterExpression`) | Removed `sparse`; index built on dev DB | `Backend/models/EngineerPayment.js` |
| 13 | `PATCH /admin/b2b-companies/:id/verify` set `verificationStatus:'verified'`, so the company vanished from every admin tab and the B2B app kept sending it to onboarding | Same end state as `/approve` | `Backend/controllers/adminControllers/b2bManagementController.js` |
| 14 | Customer app showed **invented technician stats** for every new technician (★4.9, "2.1K+ reviews", "6+ years", "1250+ jobs"; 4.8 on the track screen) | Show real values or "New" | `TechnicianFound`, `BookingTrack`, `VendorSearchModal` |

Also: generic `sendSMS` now skips QA/bypass phones (no real SMS to test numbers), and worker/engineer withdrawal alerts now reach real admin roles.

---

## 4. Open issues (not fixed) — recommended order

**P0 — money / security**
1. **Admin RBAC** (§14): add roles + permission keys and enforce them on routes (wallet adjustment, settings, refunds, approvals). Today any `admin` can move B2B money and change platform settings.
2. Protect every admin router explicitly instead of relying on `router.use` inside `b2bManagement.routes.js` (reordering mounts would expose category CRUD, uploads and `/banners/debug-db` publicly).
3. Apply withdrawal rules (min/max, daily limit, OTP) to engineer/worker withdrawals like the vendor flow does.
4. Dispatch: honour the online session in `isWorkerOnline`, and stop matching workers without coordinates to every city.
5. Engineer resend-OTP returns the customer OTP (`debugOtp`) whenever `NODE_ENV !== 'production'` — and `.env` has `NODE_ENV=devlopment` (typo). Make sure production is exactly `production`.
6. Notified-but-not-assigned workers can still add notes/media/materials/expenses to a job.
7. Payment & Cloudinary secrets are stored in `Settings` and returned by `GET /admin/settings`.

**P1 — business correctness**
8. Freelancer payout: with no vendor, the 60% "vendor share" silently stays with the platform (engineer got ₹312 of a ₹1,231.80 job; a vendor got 81%). Needs an explicit business rule.
9. Pricing shown ≠ charged: service page says platform fee ₹49; review charges ₹30 + ₹20 visit. `completeService` (other code path) also drops platform fee & visit charge from the final bill.
10. Single catalog: consolidate the parallel service catalogs; remove empty/duplicate categories.
11. Audit: log every admin status/settings/role/finance change with old/new/reason, and add an audit viewer.
12. Dispute workflow, refunds screen, unified Jobs list.
13. Two vendor wallets (`Vendor.wallet` vs `VendorFinanceWallet`) — pick one.
14. Money as floats — store paise (integers) or round at write.
15. `VendorServiceOffering` has no admin approval endpoint.
16. Company controls accept non-existent service codes.

**P2 — polish**
17. Malformed ids return 500 across admin details endpoints (should be 400).
18. Validation errors on B2B register return 500 with raw Mongoose messages.
19. `GET /b2b/bulk-jobs/:batchId` with the human batch id returns 500 (only Mongo `_id` works); `uploadedBy` is empty and the absolute server file path is exposed.
20. Vendor portal crashes on `/vendor/digital-solution/*` deep links for non-digital vendors (`useVendorSocket must be used within a VendorSocketProvider`).
21. Checkout doesn't preselect the default address; B2B upload page claims "No row limit" (limit is 1,000); payment OTP card falls back to "0000".
22. Rate limits: admin 200 req/min/IP and the general API limit are easy to hit from one office IP (all B2B staff behind one NAT).
23. Engineer `register` leaks Mongo sessions on early returns; KYC/penny-drop queue jobs are placeholders.
24. Dev DB data: duplicate rows block the unique indexes on `B2BEnterpriseOnboarding.companyId` and `VendorTeamMember(vendorId, employeeId)`.

---

## 5. E2E results by module

| Module | Pass | Fail | Notes |
|---|---:|---:|---|
| Admin auth + 104 admin list endpoints | 3 | 0 | 8 B2B report endpoints need `companyId` (by design) |
| Onboarding — user | 10 | 0 | OTP, register, refresh token, admin view |
| Onboarding — vendor | 12 | 0 | Pending login blocked, approve, reject, suspend |
| Onboarding — engineer | 14 | 1 | Coupon 100% joining fee, freelancer + vendor-engineer (company code); fail = 500 on malformed id |
| Onboarding — worker | 7 | 0 | |
| Onboarding — B2B company | 11 | 0 | GST verify (mock), duplicate GST blocked, approval |
| Service booking (B2C) | 32 | 0 | Price tamper blocked (server recalculates ₹234.82), full lifecycle, OTPs not leaked to worker |
| B2B wallet + bulk upload | 15 | 1 | Access controls enforced; fail = unknown service code accepted |
| B2B jobs → escrow → engineer → release | 21 | 0 | Reconciliation drift 0 |
| B2B vendor route | 13 | 0 | Vendor coverage, request, assign own engineer, payout to vendor |
| KYC security | 7 | 0 | |
| Withdrawals — engineer | 11 | 0 | Race & payout-hijack now blocked |
| Withdrawals — vendor | 12 | 0 | OTP, verified bank, fees/TDS, admin approve → paid → receipt |
| Admin controls & RBAC | 13 | 3 | Fails = no audit on user block; any admin can adjust wallets / change settings |
| UI — admin panel | 30 | 0 | Login, 28 pages, approve vendor from table |
| UI — customer booking | 5 | 0 | OTP login → service → package → address → review → book → live "technician found" → start code |
| UI — worker / engineer / vendor / B2B | 35 | 1 | Razorpay test payment (netbanking) credits wallet; bulk upload via file picker creates job; fail = vendor deep-link crash |

---

## 6. Test environment notes

- **`Backend/.env` changes:** added `ALLOW_OTP_BYPASS=true` and `OTP_BYPASS_PHONES=9000000101…9000000140` (dev-only QA numbers: OTP `123456`, no SMS sent). `USE_DEFAULT_OTP` was temporarily `true` during the run and is back to `false`.
- **QA data in the dev DB** (all named `QA-E2E …`, phones `90000001xx`, emails `qa-e2e-*@wbi.test`): super admin `qa-e2e-admin@wbi.test`, ops admin `qa-e2e-opsadmin@wbi.test`, user, 3 vendors, 2 engineers, 1 worker, B2B company "ACME ENTERPRISES PRIVATE LIMITED", coupon `QAE2E100`, bookings, B2B jobs (all closed or cancelled), withdrawals. Deactivate the QA admin accounts before this DB is ever promoted.
- **Indexes created on the dev DB:** `B2BWalletTransaction.idempotencyKey`, `EngineerCoupon.code`, `EngineerPayment.razorpayPaymentId`, `B2BBulkUploadRow(batchId,rowNumber)`, `DigiLockerSession.transactionId`. Run `npm run verify:indexes` against production too.
- Pre-existing lint errors (unused variables, hook deps) in the touched frontend files were left as-is.
