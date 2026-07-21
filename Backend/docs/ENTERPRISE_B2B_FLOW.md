# Enterprise B2B Project Flow + Escrow Architecture

Maps the production prompt to WBI/TazkY code. **Goal:** new services (Solar, ATM, CCTV, etc.) ship via Admin config — not new hardcoded routes.

## Flow diagram → implementation

| Prompt stage | Status / engine | Primary code |
|--------------|-----------------|--------------|
| B2B portal / bulk requirement | `Opportunity` types `b2b_opportunity`, `bulk_requirement` | B2B controllers, `createOpportunityFromEnquiry.js` |
| Excel / CSV / API intake | Bulk job admin + validation | `b2bBulkJobController`, admin bulk routes |
| Dynamic service mapping | `ServiceConfig` + `FormSchema` + publish pipeline | `adminServiceManagement.controller.js`, `publishServiceCatalog.service.js` |
| Budget / quote | `ServiceConfig.pricingRules`, opportunity `budget` | Service Management UI, intake |
| Admin + customer approval | `EnterpriseProjectFlow` timeline + `approvalFlow` on config | `enterpriseB2BOrchestrator.service.js` |
| Escrow lock | `escrowReleaseEngine.lockEscrowForProject`, `ServiceRequest.payment`, `EscrowLedger` | `escrowReleaseEngine.service.js`, `serviceRequestPayment.service.js` |
| Dynamic assignment | Vendor queue → timeout → freelancer pool → admin escalation | `projectAssignmentEngine.service.js` |
| Vendor accept / ops project | `businessIntakeController`, `createOpsProjectFromOpportunity` | Wired to enterprise flow hooks |
| Engineer execution | `VendorOpsJob`, `engineerOpsJobController`, Project OS `workflowEngine` | Task states TRAVELLING → QA_REVIEW |
| OTP / evidence / forms | B2B job execution, `FormTemplate`, `DynamicForm` | Engineer + vendor modules |
| Milestone + QA release | `releaseMilestoneEscrow` (% from config) | Vendor `POST .../milestones/:id/qa-approve`, Admin/B2B sign-off APIs |
| Wallets / ledger | Vendor finance, B2B wallet, engineer payout | `vendorFinanceLedger`, `b2bWalletService`, `opsJobPayout` |
| Project closed | `VendorOpsProject.status`, flow `closed` | Orchestrator + milestone engine |

## Configuration surfaces (no code deploy)

| Admin configures | Model / API |
|------------------|-------------|
| Services C01–C24 | `ServiceConfig` — `/api/admin/service-config` (SMS) |
| Milestone % (20/40/20/20) | `ServiceConfig.projectMilestones[].paymentPercent` or `MilestoneTemplate.milestones[].invoicePercentage` |
| Payment split | `ServiceConfig.paymentRules`, `commissionRules` |
| Project template / modules | `ProjectTemplate` — `/api/project-os/templates` |
| Workflow transitions | `WorkflowTemplate` — used by `engines/workflowEngine.js` (Project OS tasks) |
| Assignment SLA | `ProjectAssignmentConfig` — assignment admin |
| Registration / dashboards | `RegistrationTemplate`, `DashboardConfiguration` |

### Example `paymentRules` (JSON on ServiceConfig)

```json
{
  "platformCommissionPercent": 1,
  "gstPercent": 18,
  "engineerSharePercent": 40,
  "vendorSharePercent": 60,
  "releaseTrigger": "qa_passed"
}
```

### Example milestones on ServiceConfig

```json
"projectMilestones": [
  { "order": 1, "title": "Mobilization", "paymentPercent": 20, "defaultDays": 3 },
  { "order": 2, "title": "Execution", "paymentPercent": 40, "defaultDays": 14 },
  { "order": 3, "title": "QA", "paymentPercent": 20, "defaultDays": 2 },
  { "order": 4, "title": "Handover", "paymentPercent": 20, "defaultDays": 1 }
]
```

### Example `approvalFlow` (gates before milestone / job escrow release)

```json
"approvalFlow": {
  "requireQaBeforeRelease": true,
  "customerSignoffRequired": true,
  "b2bSignoffRequired": true
}
```

When enabled on `ServiceConfig`, milestones get `customerSignoff` / `b2bSignoff` / `qaStatus` initialized in `createOpsProjectFromOpportunity`. `releaseMilestoneEscrow` returns `APPROVAL_PENDING` until all required parties approve. B2B direct field jobs use `EnterpriseProjectFlow.jobSignoffs` and defer escrow close until sign-offs complete.

## HTTP APIs (sign-off + flow)

| Actor | Method | Path |
|-------|--------|------|
| Admin | GET | `/api/admin/enterprise-b2b/flows`, `/flow` |
| Admin | POST | `/api/admin/enterprise-b2b/projects/:projectId/milestones/:milestoneId/qa-approve` |
| Admin | POST | `.../customer-signoff`, `.../b2b-signoff` |
| Vendor | POST | `/api/vendor/project-ops/milestones/:id/qa-approve` |
| B2B | GET | `/api/b2b/jobs/:id/enterprise-flow` |
| B2B | POST | `/api/b2b/jobs/:id/approve-work` (job-level B2B client) |
| B2B | POST | `/api/b2b/jobs/projects/:projectId/milestones/:milestoneId/b2b-signoff` |
| Customer (public) | POST | `/api/public/service-requests/:requestCode/milestones/:milestoneId/customer-signoff` |
| End customer (public) | POST | `/api/public/b2b-jobs/:jobRef/customer-signoff` body `{ phone, approved }` |

Engineer B2B completion payout uses `computeB2BEngineerPayout(job)` from `ServiceConfig.paymentRules` (not a hardcoded %).

## New spine (this implementation)

- **`EnterpriseProjectFlow`** — lifecycle + timeline + escrow snapshot per opportunity/project.
- **`enterpriseB2BOrchestrator.service.js`** — bootstrap on opportunity create; vendor project + escrow lock; engineer assigned; admin escalation.
- **`escrowReleaseEngine.service.js`** — config-driven milestone release to vendor wallet + finance ledger.
- **Admin APIs** — `/api/admin/enterprise-b2b/flows`, `flow`, `template-bundle/:categoryCode`, milestone `qa-approve` / `customer-signoff` / `b2b-signoff`.

## Honest completion estimate

| Area | ~% | Notes |
|------|-----|------|
| Catalog / SMS dynamics | 75% | User + vendor registration mostly config-driven |
| Assignment engine | 80% | Vendor/freelancer; certifications/inventory partial |
| Escrow (user SR) | 55% | Hold + full release on complete; milestone slice added for ops projects |
| B2B bulk → field flow | 50% | B2B jobs parallel path; enterprise flow unifies opportunity-led ops |
| Project OS (multi-site) | 65% | Templates exist; VendorOps is lighter sibling |
| Notifications (SMS/email/WhatsApp) | 60% | FCM + partial marketplace notify |
| Milestone escrow (all channels) | ~85% | Sign-off gates + config payout; UI surfaces still thin |
| B2B bulk → enterprise flow | ~90% | Flow bootstrap + approve-work + milestone B2B sign-off |

## Next engineering passes

1. Vendor/B2B/customer UIs for pending sign-offs and timeline.
2. Vendor dashboard: read `EnterpriseProjectFlow` timeline + SLA from config snapshot.
3. Extend `workflowEngine.transitionTask` to load `WorkflowTemplate` when `projectTemplateId` present (reduce default hardcoding).
4. Stronger customer auth on public B2B job sign-off (OTP tied to completion).
5. WhatsApp matrix, counter-quote/advance, full GST ledger (out of scope for spine).

## Ops

- Restart API after deploy.
- Seed milestones on `ServiceConfig` via Service Management or `seedServiceConfigs.js`.
- Monitor assignment escalations: socket `enterprise:assignment_escalation` on admin room.
