# TazkY B2B Portal — Production Gaps Plan

Direct B2B → Engineer path only. Vendor-in-the-middle is a **future decision**, not in scope.

## Phase 1 (this pass) — must work end-to-end

| # | Gap | Acceptance criteria | Primary files |
|---|-----|---------------------|---------------|
| A | Progressive geo waves `5→10→20→50→100` km | Matching expands by wave with configurable timeout; notifies new engineers only; fails after last wave | `services/b2bMatchingService.js`, `models/B2BJob.js` |
| B | Start OTP + before-photo + timer | Cannot `in_progress` without matching `startOtp` + ≥1 before photo; `startedAt` set | `engineerB2BJobController.js`, `models/B2BJob.js`, engineer FE |
| C | Wallet / pending activation gate | Dashboard shows pending_wallet cost vs balance; top-up auto-activates when funded; matching blocked until activated | `b2bWalletService.js`, `b2bWalletController.js`, `b2bDashboardController.js`, B2B Dashboard FE |
| D | Spare Parts incomplete | Deduct/adjust wallet, close with remarks, `requiresNewJob` blocks reopen | `engineerB2BJobController.js`, `models/B2BJob.js` |

## Phase 2 (next)

5. Accept-time job brief + tools checklist from `ServiceConfig`
6. QuoteApproval **create** path (approve/reject already exist)
7. Jobs UI 4-param rating submit (API exists)
8. Lightweight digital sign-off artifact on complete

## Out of scope

- Rebuilding Vendor middle layer
- Full B2B UI redesign
