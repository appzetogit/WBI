# TASKY Admin — Spec Coverage, Fixes & Testing Guide

**Updated:** 29 Sep 2026 · **Tested on:** local backend `:5000` + Vite frontend `:5173`, dev Atlas DB, local Redis, Razorpay **test mode**, `USE_MOCK_KYC=true`.

**Result:** 351 automated checks (API + real browser). **336 pass, 0 fail**; 8 are expected (per-company report endpoints that need `companyId`), 7 are earlier failing checks replaced by passing re-tests after the fixes.

Legend: ✅ present & tested · 🟡 partial · ❌ not built · ➖ not applicable · **NEW** = added in this round

---

## Part A — Section-by-section checklist

### 1. Dashboard  (`/admin/dashboard`)
| Item | Status | Where |
|---|---|---|
| Total Users / Vendors / Workers | ✅ | stat cards (`/admin/dashboard/stats`) |
| Total B2B, Engineers (vendor vs freelancer) | ✅ | Platform overview section |
| Active / Pending / Completed / Cancelled jobs | ✅ | stat cards + **NEW** All Jobs buckets |
| Revenue, Commission | ✅ | stat cards, revenue chart |
| Escrow balance, Vendor wallet, Engineer earnings | ✅ | Platform overview |
| Pending withdrawals | ✅ | **NEW** tile (count, amount, >24h) |
| Pending verification | ✅ **NEW** | tile: vendors / engineers / workers / B2B / documents |
| Refunds | ✅ **NEW** | tile (last 30 days) |
| Disputes | ✅ **NEW** | tile (open / in review) |
| Recent transactions | ✅ **NEW** | B2C + B2B feed |
| Recent jobs | 🟡 | recent B2C bookings only (B2B via All Jobs) |
| System alerts | ✅ **NEW** | escalated B2B jobs, auto-assign failures, stale withdrawals, stuck uploads, open disputes |

### 2. User management  (`/admin/users`)
| Item | Status | Notes |
|---|---|---|
| All / Active / Blocked users | ✅ | status filter |
| Pending verification, Approve, Reject | ➖ | customers have no verification step (OTP sign-up) |
| Details → Profile | ✅ **NEW** | 👁 View → Profile tab |
| Details → Documents | ➖ | customers don't upload documents |
| Details → Addresses, Refunds, Activity | ✅ **NEW** | tabs in user details |
| Details → Service history, Wallet | ✅ | Bookings / Wallet tabs |
| Details → Payments | 🟡 | payment status per booking + wallet transactions; no separate list |
| Block / Unblock | ✅ | asks a reason; blocks live sessions; audit-logged |
| Edit | ✅ **NEW** | name, email |

### 3. B2B management  (`/admin/b2b`, `/admin/b2b-companies`)
| Item | Status | Notes |
|---|---|---|
| All / Pending / Active / Suspended companies | ✅ | tabs |
| Company profile, GST, CIN, Documents, Contacts | ✅ | inspect company |
| Locations, Allowed services | ✅ | controls — **now enforced** at bulk validation |
| Pricing | ✅ | pricing rules, contracts, pricing profile |
| Wallet, Transactions, Bulk jobs, Active jobs, Job history | ✅ | Corporate Wallets, Transactions, bulk jobs, All Jobs |
| Wallet: balance, add money, locked, escrow, transactions | ✅ | admin adjustment (reason, audit), Razorpay top-up (webhook-safe) |
| Controls: approve, suspend, service access, location access, pricing | ✅ | company operations panel |
| Controls: wallet limits | 🟡 | credit limit only |
| Controls: bulk upload limit | ✅ **NEW** | per company, overrides platform default |
| Bulk pipeline (upload → validation → pricing → wallet check → lock → escrow → dispatch → vendor → engineer) | ✅ | every stage visible; admin can act on batches, escalations (retry / assign / route to vendor), submissions |

### 4. Vendor management  (`/admin/vendors`)
| Item | Status | Notes |
|---|---|---|
| All / Pending / Active / Suspended | ✅ | |
| Profile, GST/KYC, Documents | ✅ | vendor details |
| Services, Locations, Pincodes | ✅ | approve service + coverage (city / pincode) |
| Subservices | 🟡 | via vendor catalog / offerings |
| Engineers, Jobs, Wallet, Earnings, Withdrawals | ✅ | details, bookings, earnings, settlements |
| Commission | ✅ **NEW** | per-vendor override (reason required, audit) — applied to B2B payouts |
| Performance | ✅ **NEW** | completion / cancellation rate, SLA, avg time, rating, engineers |
| Approve / Reject / Suspend / Service access | ✅ | |
| Location access | 🟡 | API (`PUT /api/vendors/:id/service-coverage/:serviceKey`, admin token); no admin form |
| Pricing | 🟡 | vendor catalog prices; no per-vendor price book |
| Engineer assignment | ✅ **NEW** | assign / remove vendor from engineer controls |
| Service offerings review | ✅ **NEW** | Control Center → Vendor Offerings (approve / changes / reject) |

### 5. Engineers & workers  (`/admin/engineers`, `/admin/workers`)
| Item | Status | Notes |
|---|---|---|
| Vendor engineers / Freelancers | ✅ **NEW** filter | |
| Workers | ✅ | own section |
| Pending / Active / Suspended | ✅ | status tabs |
| Offline | ✅ **NEW** filter | online / offline |
| Details: profile, documents, skills, services, location, availability, vendor, jobs, earnings, withdrawals | ✅ | details modal + **NEW** admin controls |
| Pincodes | 🟡 | single service pincode + work locations |
| Performance | 🟡 | rating & completed jobs; no scorecard |
| Approve / reject, block / unblock | ✅ | suspension now ends live sessions |
| Assign vendor, change skills, change location, change availability, force offline | ✅ **NEW** | admin controls panel |
| Change service eligibility | 🟡 | API (`serviceCategories`, `subServices`); panel edits skills only |
| View jobs / earnings, manage withdrawals | ✅ | |

### 6. Services  (User Catalog, One-Time Services, Service Management)
| Item | Status | Notes |
|---|---|---|
| Categories, Services, Subservices, Service types, Skills | ✅ | create / update / disable from admin |
| Pricing | ✅ | packages + per-service pricing rule — **now applied at checkout** |
| SLA, Tax/GST, Commission | ✅ | service config, settings, category commission, vendor override |
| Locations | ✅ | cities + **NEW** service areas |
| Assignment rules | 🟡 | assignment config page; matcher still enforces minimum radius / broadcast mode in code |
| "Not hardcoded" | 🟡 | several parallel catalogs (Category, Service, OneTimeService, ServiceConfig…) — consolidation still open |

### 7. Job management  (**NEW** Control Center → All Jobs)
| Item | Status |
|---|---|
| All / New / Pending / Assigned / Accepted / En Route / Checked In / In Progress / Completed / Cancelled / Disputed / Failed | ✅ **NEW** — one list over B2C bookings + B2B jobs with counts |
| Job details: customer, B2B/vendor, service, location, pricing, assignment, engineer, photos/proof, payment, escrow, commission | ✅ (in the B2C booking and B2B job screens) |
| Timeline | ✅ — **now records every status change** |
| Activity log | ✅ booking logs + audit log |
| Reassign / cancel / intervene | ✅ B2C (assign, reassign, cancel, refund); B2B (retry, assign, route to vendor, approve / reject submission) · 🟡 no admin "cancel B2B job" button (company or escrow refund) |
| Single unified job detail page | 🟡 list is unified; clicking opens the module's own screen |

### 8. Payments  (`/admin/payments`, Control Center → Refunds)
| Item | Status |
|---|---|
| All / successful / pending / failed payments, transactions | ✅ |
| Refunds | ✅ **NEW** — real refunds (Razorpay for online, customer wallet for cash), partial allowed, reason required, listed with totals |
| Escrow, Commission, Vendor payments, Engineer earnings, Withdrawals | ✅ |

### 9. Wallet & escrow
| Item | Status |
|---|---|
| B2B, vendor, engineer wallets; escrow; transactions; deposits; withdrawals; refunds; commission | ✅ |
| Flow: B2B wallet → lock → escrow → completion → admin release → commission → vendor / engineer | ✅ tested end to end, reconciliation drift 0 |
| Rules configurable | ✅ service payment rules, platform %, vendor override, **NEW** freelancer payout % |
| Single vendor wallet | 🟡 `Vendor.wallet` (B2C) and `VendorFinanceWallet` (B2B) both exist |

### 10. Location & assignment  (**NEW** Control Center → Locations)
| Item | Status |
|---|---|
| Countries, States | ✅ **NEW** (one-click India seed) |
| Cities | ✅ |
| Pincodes, Service areas | ✅ **NEW** |
| Vendor coverage | ✅ |
| Engineer coverage | 🟡 coverage lookup lists engineers by city / pincode; no radius editor |
| Coverage lookup (who serves pincode X for service Y) | ✅ **NEW** |
| Matching inputs: service, pincode, location, skill, availability, vendor coverage | ✅ |

### 11. Verification / KYC  (`/admin/verifications`, GST / CIN screens)
| Item | Status |
|---|---|
| B2B, vendors, engineers, workers | ✅ |
| Users | ➖ |
| Aadhaar / PAN / bank, GST, CIN, business docs, skill documents | ✅ |
| Pending → review → approve / reject with reason | ✅ |

### 12. Notifications  (`/admin/notifications`, **NEW** Control Center → Notification Templates)
| Item | Status |
|---|---|
| Push / FCM, SMS, email, events, delivery logs | ✅ |
| Templates | ✅ **NEW** — per event: on/off, channels, title & message with `{{variables}}` |

### 13. System settings  (`/admin/settings`)
| Item | Status |
|---|---|
| General, payment gateway (secrets now masked), tax/GST, commission, wallet, withdrawal rules, notification, service, platform | ✅ |
| SLA, assignment rules | ✅ (service config, assignment config) |
| Escrow | 🟡 release trigger lives in service payment rules |
| Job rules | 🟡 search / wave settings |
| Cancellation rules | 🟡 penalty amount only |
| Refund rules | ❌ refunds are manual (admin / dispute), no automatic policy |
| **NEW** fields | one-time platform fee, B2B freelancer payout % |

### 14. Roles & permissions  (**NEW** Control Center → Roles & Permissions)
| Item | Status |
|---|---|
| Super Admin, Operations, Finance, Support, Verification Admin (+ legacy Admin) | ✅ **NEW** |
| Permissions (`users.read/update`, `vendors.read/approve`, `b2b.read/approve`, `jobs.read/assign`, `payments.read/refund`, `wallet.read/manage`, `services.create/update/disable`, …40 keys) | ✅ **NEW** |
| Enforced on the backend (not just hidden buttons) | ✅ **NEW** — one guard on every `/api/admin` route |
| Editable per role + extra grants per admin | ✅ **NEW** |

### 15. Reports  (`/admin/reports`, **NEW** Control Center → Finance & B2B Reports)
| Item | Status |
|---|---|
| User, vendor, engineer, job, revenue, payment | ✅ |
| B2B | ✅ per company + **NEW** all companies |
| Commission, refund, withdrawal | ✅ **NEW** |
| Service performance | 🟡 B2B per company; B2C top services on dashboard |

### 16. Audit logs  (**NEW** Control Center → Audit Logs)
| Item | Status |
|---|---|
| Admin → action → entity → old value → new value → timestamp → reason | ✅ **NEW** — every admin write; before/after snapshots for users, vendors, workers, engineers, B2B companies, wallets, admins, withdrawals, bookings, disputes, settings |
| Financial & permission changes | ✅ wallet adjustments, commission, roles, settings |

---

## Part B — How to test each flow

### Setup (once)
1. `Backend/.env` already has `ALLOW_OTP_BYPASS=true` and `OTP_BYPASS_PHONES=9000000101…9000000140`. Those numbers always use OTP **123456** and never receive SMS. Use them for test accounts.
2. Start: `cd Backend && npm run dev` · `cd Frontend && npm run dev` · Redis must be running.
3. Admin: log in at `http://localhost:5173/admin/login` with a super admin.
4. Razorpay test mode: pick **Netbanking → any bank → Success** in the checkout.
5. `USE_MOCK_KYC=true` makes GST / PAN / bank checks return test data. A GSTIN ending in `Z0` = "not found", `Z1` = cancelled, `Z2` = suspended.

### 1. Onboarding
| Who | UI steps | Check |
|---|---|---|
| Customer | `/user/login` → phone → OTP → name | Admin → Users shows them; 👁 View opens details |
| Vendor | `/vendor/signup` (or `POST /api/vendors/auth/register`) | login says "under review" → Admin → Vendors → approve → vendor logs in; reject / suspend block login |
| Freelancer engineer | `/engineer/signup` (joining fee: pay via Razorpay test, or 100 % coupon from Admin → Engineers → Coupons) | Admin → Engineers → approve |
| Vendor engineer | signup with the vendor's company code (vendor panel → Engineers) | vendor approves → admin approves |
| Worker | `/worker/signup`, choose a one-time service | Admin → Workers → approve |
| B2B company | `/b2b/login` → Register → verify GST → details (TAN required) | Admin → B2B → Company Approvals → approve → set controls (services, locations, credit, bulk limit) |

### 2. B2C service booking
1. Worker app open (logged in) = online. Set a location via Admin → Workers → View → Admin controls if needed.
2. Customer: `/user/service/electrical` → problem → package → address → **Book Now** → review (price = package + visit + platform fee + GST) → **Book Service**.
3. Worker: accept → Start journey → Reached. The customer sees the **start code** on *Track*. The worker enters it.
4. Worker completes (photo) → bill → collects cash; the customer shares the payment OTP. (Or the customer pays online from Booking Details.)
5. Customer rates. Admin → Bookings shows the timeline (every status) and payment.
6. Negative checks: completing before the OTP → blocked; a tampered price → recalculated; another user can't open the booking.

### 3. B2B bulk jobs
1. Admin credits the wallet (B2B → Corporate Wallets → adjust, reason required) **or** the company tops up (Wallet & Billing → Add Funds → Razorpay test).
2. Company: Bulk Operations → Upload (CSV/XLSX from Templates) → validation (rows outside allowed services / cities / bad phones are rejected) → Review & Confirm.
3. Check escrow: Wallet shows *reserved*; each job holds its own price.
4. Dispatch: a freelancer (engineer app online, located nearby, matching skills) gets the offer, **or** a vendor with coverage gets it under Requests → accept → assign own engineer.
5. Engineer: accept → travel → arrive (the customer gets the start OTP by SMS) → start with OTP + before photo → complete with after photo.
6. Admin → B2B → Submissions → approve → payout (freelancer wallet or vendor finance wallet). The company wallet reconciliation shows drift 0.
7. Cancel a pending job → escrow returns to available.

### 4. Withdrawals
- **Engineer / worker:** verify bank (profile → bank → verify) → withdraw ≥ minimum (Settings). The payout always goes to the verified account. Admin → Settlements → approve → mark paid (UTR). Reject returns the exact amount.
- **Vendor:** Finance → add bank → verify → request OTP → withdraw (fees and TDS shown) → admin approve → mark paid → receipt.
- Negative checks: below minimum / over the daily limit / unverified UPI → rejected; parallel requests can't overdraw.

### 5. Disputes & refunds (NEW)
- Customer: Booking Details → **Report a problem**. B2B: Jobs → job → Support tab → Report a problem.
- Admin → Control Center → Disputes → open → add note (in review) → **Resolve** (full / partial refund, rework, no action) or Reject.
- Refund goes to: Razorpay (online B2C), customer wallet (cash B2C), company wallet (B2B). See Control Center → Refunds.
- Direct refund: Admin → Bookings → booking → Payment → Refund (amount + reason).

### 6. Admin controls & RBAC (NEW)
- Control Center → Roles & Permissions: change an admin to *Support Admin* → log in as them → Settings, Plans, Audit Logs are hidden; opening them by URL is refused; the API returns `403 PERMISSION_DENIED`.
- Every change you make appears in Control Center → Audit Logs (old → new, reason).

### 7. API test harness
All flows above are scripted (`qa/*.js`, using the same endpoints as the apps) and were run for this report. Ask to have them moved into `Backend/tests/e2e/` if you want them in the repo and CI.

---

## Part C — What changed (this round and the previous one)

**Security & money:** admin RBAC + central guard (auth no longer depends on route order) · audit log for all admin writes · KYC endpoints need the owner or an admin for real accounts · suspended workers / engineers lose live sessions · withdrawal double-spend and payout-to-any-account fixed · withdrawal min / max / daily limit for engineers & workers · per-job escrow amount · B2B top-up credited by webhook if the tab closes · wallet balances rounded to paise · payment / Cloudinary secrets masked · the engineer resend-OTP no longer echoes the customer OTP unless dev OTPs are explicitly on · notified-but-unassigned workers can't edit jobs · workers with no location no longer match every city.

**Business correctness:** instant bookings no longer auto-cancel (matcher bug) · completion requires the visit OTP and real payment · cash collection works for online-created bookings · one pricing source for the service page and checkout (per-service rule → settings) · the final bill keeps platform fee + visit charge · B2B company service / location access enforced, unknown service codes rejected, per-company bulk limit · vendors can't self-approve offerings; admin review queue added · configurable freelancer payout % and one-time platform fee · per-vendor commission.

**Features:** Control Center (All Jobs, Disputes, Refunds, Finance & B2B reports, Vendor Offerings, Locations, Notification Templates, Audit Logs, Roles) · dashboard alerts & queues · user details (profile edit, addresses, activity, refunds) · engineer / worker admin controls · vendor commission & performance · real refunds · disputes for customers and B2B · complete booking timeline · real technician ratings (no invented stats).

**Smaller:** malformed ids → 400 · B2B register validation → 400 · batch lookup by human id, uploader recorded, server paths hidden · vendor digital-solution pages no longer crash · default address preselected · no "0000" OTP placeholder · rate limits per signed-in user instead of per office IP · engineer register closes its DB transaction · empty categories hidden in engineer signup.

---

## Part D — Still open (recommended next)

1. **Catalog consolidation** — merge the parallel service catalogs (biggest structural debt).
2. **One vendor wallet** — merge `Vendor.wallet` and `VendorFinanceWallet`.
3. **Refund & cancellation rules** — automatic policy (time windows, penalties) instead of manual refunds only.
4. **Assignment rules** — let the admin config fully control radius / mode (the matcher still applies minimums).
5. Unified job detail page; admin cancel for B2B jobs; engineer performance scorecard; admin form for vendor location coverage.
6. Registration KYC / penny-drop queue jobs are still placeholders (real checks happen in the signup KYC step).
7. `NODE_ENV=devlopment` typo in `Backend/.env`; set production to exactly `production`.
8. Dev-DB duplicates block two unique indexes (`B2BEnterpriseOnboarding.companyId`, `VendorTeamMember(vendorId, employeeId)`); run `npm run verify:indexes` on production.
9. Cosmetic: workers receive each offer 4× over the socket; the first "searching" timeline entry can appear twice.

**QA data** in the dev DB is named `QA-E2E…` (phones `90000001xx`, emails `qa-e2e-*@wbi.test`), including admins `qa-e2e-admin@wbi.test` (super admin) and `qa-e2e-opsadmin@wbi.test`. Deactivate these before the DB is ever promoted.
