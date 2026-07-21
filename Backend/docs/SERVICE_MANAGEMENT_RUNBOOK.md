# Service Management System — Admin Runbook

## Goal

Add a completely new service (e.g. Drone Inspection) from the Admin panel so User, Vendor, Engineer, and search surfaces update **without** code changes.

## Canonical IDs

- Parent: `categoryCode` — `C01`, `C25`, …
- Child: `subCatCode` — `C25-01`, `C25-02`, …
- Browse layer: `ServiceCategory` + `SubService` (ObjectIds) always linked via those codes

## Admin UI

Path: **Vendors → Service Mgmt** (`/admin/vendors/service-management`)

Tabs:

1. **Overview** — name, type, icon, color, tags, description  
2. **Sub-services** — unlimited children  
3. **User Forms** — FormSchema fields per `subCatCode`  
4. **Ops Config** — milestones, checklist, inventory, KPIs  
5. **Registration** — documents / certifications / skills for vendor wizard  
6. **Dashboard** — sidebar modules + widgets for vendor panel  
7. **Publish** — dual-write + audit trail  

## Create + publish (happy path)

1. Click **New Service**
2. Enter name (optional code; auto-allocates next `Cxx` if blank)
3. Add at least one sub-service name
4. Keep **Publish immediately** checked (or Publish later from the Publish tab)
5. Soft lifecycle only: Activate / Deactivate / Archive — never hard-delete

## What Publish does

In a Mongo transaction:

1. Upserts `ServiceCategory` (`showOnApp` / `isActive`)
2. Upserts `SubService` rows (`subCatCode` linked)
3. Upserts `FormSchema` stubs (keeps existing custom fields)
4. Ensures `RegistrationTemplate` + `DashboardConfiguration` defaults
5. Bumps `ServiceConfig.version`, writes `ServiceConfigAudit`
6. Invalidates Redis catalog / vendor config caches

## APIs

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/admin/service-management` | List / search / paginate |
| POST | `/api/admin/service-management` | Create |
| GET/PUT | `/api/admin/service-management/:code` | Read / update |
| PATCH | `/api/admin/service-management/:code/status` | active / inactive / archived |
| DELETE | `/api/admin/service-management/:code` | Soft archive |
| POST | `/api/admin/service-management/:code/publish` | Publish |
| POST | `/api/admin/service-management/:code/rollback` | Restore snapshot |
| PUT | `/api/admin/service-management/forms/:subCatCode` | Form CRUD |
| GET | `/api/public/service-configs` | Vendor picker |
| GET | `/api/public/registration-templates?codes=` | Dynamic registration |
| GET | `/api/public/dashboard-configurations?codes=` | Dashboard modules |
| GET | `/api/public/form-schemas/search?q=` | User search |

## Project OS

Link a published `ProjectTemplate` by setting `categoryCode` on the template. Awarded opportunities use ServiceConfig milestones first, then Project OS milestone template when present.

## Rollback

Publish tab → Recent audit → use API `POST .../rollback` with `auditId` (or last-but-one snapshot).

## RBAC

All `/api/admin/service-management*` routes require `authenticate` + `isAdmin`.

## After publish — verify

1. User **Services** search finds new sub-service  
2. Category page lists subs → opens `/user/service-request/Cxx-yy`  
3. Vendor registration shows the service in Project Expertise  
4. Vendor dashboard sidebar reflects DashboardConfiguration when approved  

## Bootstrap (optional)

Legacy Excel sync scripts remain for one-time import only:

- `npm run seed:master-catalog`
- `npm run seed:master-user-catalog`

New services should be created only via Admin SMS after go-live.
