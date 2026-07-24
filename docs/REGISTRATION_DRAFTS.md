# Registration Drafts & KYC Persistence

Stops multi-step signup/KYC from resetting on step-back, refresh, or remount.

## Architecture

```
Signup wizard → useRegistrationDraft (localStorage draftKey + debounced POST)
             → /api/registration-drafts
KYCVerificationStep → GET /api/kyc/status?role&entityId
                   → skip re-verify if verified + not expired
```

## Env

```
KYC_VERIFICATION_TTL_DAYS=365   # after this, Verified docs can require re-check
```

## APIs

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/registration-drafts` | Upsert draft (`role`, `draftKey`, `payload`, `currentStep`, `entityId`) |
| GET | `/api/registration-drafts/:draftKey?role=` | Restore |
| GET | `/api/registration-drafts/by-phone?role=&phone=` | Resume by phone |
| DELETE | `/api/registration-drafts/:draftKey?role=` | Mark submitted on success |
| GET | `/api/kyc/status?role=&entityId=` | Hydrate verification map |

Draft payload strips `password` / OTP fields. Store upload **URLs** only.

## Frontend

- Hook: `Frontend/src/hooks/useRegistrationDraft.js`
- Keys: `wbi_reg_draft_${role}`, `wbi_reg_draft_cache_${role}`
- Wired: Engineer, Worker, Vendor signup; B2B classic LoginRegister
- `KYCVerificationStep`: loads server status; shows **Verified** + “Update document” instead of forcing re-entry

## Re-verify rule

Skip when `status === 'verified'`, `verifiedAt` within TTL, and document hash/number unchanged. Changing PAN/Aadhaar/bank or clicking **Update document** forces a new verification.

## Checklist

1. Engineer signup → complete Aadhaar/PAN → go back → still Verified  
2. Refresh mid-wizard → step + form + file URLs restored  
3. Change PAN → must verify again  
4. Submit registration → draft cleared (`status: submitted`)  
5. Vendor documents step uploads real Cloudinary/API URLs (not filenames)  
6. B2B classic KYC receives stable `entityId` and hydrates on remount  

## Out of scope (already OK)

- B2B Enterprise onboarding (server steps)  
- Vendor PendingApproval (`initialVerifications`)  
- Admin review queues  
