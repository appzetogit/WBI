# Vendor Support & Ticketing (Dynamic)

Admin-driven support module for the Vendor Portal. Categories, priorities, statuses, workflow, SLA, assignment, escalation, departments, tags, knowledge base, notification templates, permissions, ticket numbering, custom fields, and attachment rules are stored in MongoDB (`SupportModuleConfig`) — not hardcoded in the UI.

## Key collections
- `SupportModuleConfig` — platform / per-service configuration
- `VendorGlobalSupportTicket` — tickets with links (vendor, service, project, client, engineer, worker, branch, company)
- `SupportTicketAudit` — immutable audit trail

## APIs
### Vendor (`/api/vendor/global`)
- `GET /support/config` — public config for forms / KB / filters
- `GET /support` — paginated tickets + stats + config
- `GET /support/:id` — ticket detail (no internal notes)
- `POST /support` — create (validated against config)
- `PATCH /support/:id` — workflow action or comment

### Admin (`/api/admin/vendor-support`)
- `GET|PUT /config` — full configuration CRUD
- `GET /tickets`, `GET /tickets/:id`, `GET /tickets/export`
- `POST /tickets/:id/transition`, `POST /tickets/:id/comments`
- `GET /analytics`, `POST /jobs/sla`

## UI
- Vendor: `/vendor/:serviceSlug/support`
- Admin: `/admin/vendors/support`

## Runtime
- Default config is seeded on server start (`ensureDefaultSupportConfig`)
- SLA / escalation job every 5 minutes on PM2 leader
- Socket events: `support:ticketCreated|Updated|Commented|slaBreach`
