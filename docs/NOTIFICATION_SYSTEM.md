# WBI Enterprise Notification System

Centralized, event-driven notifications across Admin, Vendor, B2B, TazkY (Engineer), and User apps.

## Architecture

```
Business event → notificationOrchestrator.emit(eventKey, opts)
  → Event catalog (channels, priority, templates, deep links)
  → NotificationDeliveryLog (audit / dedupe)
  → BullMQ notification-queue (retry + fallback)
  → Channel adapters: in_app | push | email | sms | whatsapp(stub)
```

### Key files

| Layer | Path |
|-------|------|
| Catalog | `Backend/services/notification/eventCatalog.js` |
| Orchestrator | `Backend/services/notification/notificationOrchestrator.service.js` |
| Adapters | `Backend/services/notification/channelAdapters.js` |
| Worker | `Backend/jobs/notificationWorker.js` |
| Delivery log | `Backend/models/NotificationDeliveryLog.js` |
| Role helpers | `userNotify` / `adminNotify` / `b2bNotify` / existing `vendorNotify` / `engineerNotify` |

**Public API for domain code:** only `emit` / `emitAsync` from the orchestrator. Do not call raw FCM or `Notification.create` for new product alerts.

## Event keys

- `user_registered`, `vendor_registered`, `b2b_registered`
- `vendor_approved`, `vendor_rejected`
- `engineer_approved`, `engineer_vendor_approved`
- `project_assigned_vendor`, `project_assigned_engineer`
- `quote_submitted`, `quote_approved`
- `milestone_completed`, `project_status_changed`
- `payment_released`, `invoice_generated`
- `compliance_expiry`, `document_reupload_required`
- `leave_updated`, `attendance_updated`
- `support_ticket_updated`
- `system_announcement`, `opportunity_new`

## Channels

| Channel | Behavior |
|---------|----------|
| `in_app` | Vendor → `VendorGlobalNotification`; others → classic `Notification` (incl. `b2bUserId`) |
| `push` | FCM via `firebaseAdmin` (User/Vendor/Worker/Engineer/Admin/B2B) |
| `email` | `emailService.sendTemplatedNotification` |
| `sms` | Only when env DLT template id is set (`SMS_DLT_*`); otherwise `skipped_no_dlt` |
| `whatsapp` | Stub — logged as skipped (`whatsapp_future`) |

High-priority push failure triggers email then SMS fallback when catalog sets `fallbackOnPushFail`.

## Env

```
REDIS_URL=redis://127.0.0.1:6379
NOTIF_INLINE_FALLBACK=true          # deliver inline if queue/Redis down (default true)
NOTIF_WORKER_CONCURRENCY=5
NOTIF_WORKER_RATE=100
NOTIF_ALLOW_TEST_EMIT=false         # allow POST /api/admin/notifications/test-emit in prod
SMS_DLT_VENDOR_APPROVED=            # optional DLT template ids
SMS_DLT_VENDOR_REJECTED=
FIREBASE_CONFIG=                    # or FIREBASE_SERVICE_ACCOUNT_PATH
EMAIL_USER / EMAIL_PASS
```

## APIs

| Method | Path | Role |
|--------|------|------|
| GET | `/api/notifications/{user,vendor,worker,engineer,admin,b2b}` | inbox |
| PUT | `/api/notifications/:id/read` | mark read |
| PUT | `/api/notifications/read-all` | mark all |
| POST | `/api/{users,vendors,workers,engineers,admin,b2b}/fcm-tokens/save` | FCM |
| GET | `/api/admin/notifications/delivery-logs` | audit |
| GET | `/api/admin/notifications/events` | catalog keys |
| POST | `/api/admin/notifications/announce` | broadcast |
| POST | `/api/admin/notifications/test-emit` | staging test |

### Announce body

```json
{
  "title": "Maintenance window",
  "message": "Platform downtime Sunday 2–4 AM IST",
  "actionUrl": "/status",
  "roles": ["vendor", "user", "engineer", "b2b"],
  "channels": ["in_app", "push"]
}
```

## Emit example

```js
const { emitAsync } = require('./services/notification/notificationOrchestrator.service');

emitAsync('vendor_approved', {
  targets: { vendorId },
  data: { vendorId, businessName, email, phone },
  actorId: adminId
});
```

## Verification checklist

1. Restart backend — log shows `[Server] Notification Worker initialized`
2. Register a vendor → admin inbox receives `vendor_registered`
3. Approve vendor → vendor Notification Center + push/email
4. Assign engineer on project ops → vendor + engineer notifications
5. Submit opportunity bid → `quote_submitted` to admins (+ B2B company if linked)
6. Award bid / approve B2B quote → `quote_approved`
7. Complete ops milestone → `milestone_completed`
8. Generate finance invoice → `invoice_generated` delivery log `status=sent|queued`
9. B2B portal `/b2b/notifications` loads and badge updates
10. Admin `/admin/notifications` → Announce + Delivery logs tabs
11. Admin `GET /api/admin/notifications/delivery-logs?eventKey=vendor_approved`
12. Confirm no free-text SMS for product alerts without DLT env ids
13. With Redis stopped and `NOTIF_INLINE_FALLBACK=true`, approvals still deliver in-app

## Preferences

- Vendor: `Vendor.settings.notificationPreferences` + `VendorGlobalSetting`
- Engineer: `Engineer.settings.notificationPreferences`
- User: master `settings.notifications`
- B2B: `B2BUser.notificationPreferences`
- SMS/WhatsApp gated by channel prefs where configured
