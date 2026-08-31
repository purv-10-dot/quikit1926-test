# QuikScale — API Contract

The complete HTTP contract for `apps/quikscale`. Everything below the
[Endpoint index](#endpoint-index) is **generated from the route files** — the auth
wrapper, the Zod schema, and the `NextResponse.json(...)` calls in each handler are
the source of truth, so this document cannot silently drift from the code.

```bash
cd apps/quikscale
npm run docs:api          # rewrite docs/API_CONTRACT.md
npm run docs:api:check    # CI / pre-push: exit 1 if the doc is stale
```

Any PR that adds a route, changes a Zod schema, moves a permission gate or
changes a status code should re-run `npm run docs:api` and commit the result.

This prose section is hand-maintained in `docs/api-contract-preamble.md`.
Edit that file; the generator prepends it verbatim.

**Reading the generated sections**

- `{id}` is a dynamic segment (`[id]`), `{...key}` a catch-all (`[...key]`).
- **Auth / Module gate / Permission** come from the wrapper the handler is
  bound to, not from a hand-written note.
- **Responses** lists every status the handler itself returns. Statuses the
  wrapper can return before the handler runs are folded into the
  `_standard_` row — see [Error model](#error-model).
- Response bodies marked _inferred_ were read off the object literal the
  handler builds. When a handler returns a Prisma record directly, the row says
  so and the Prisma model is the shape — see `prisma/schema.prisma`.

---

## Base URL and transport

| Environment | Base URL |
|---|---|
| Local (`next dev`) | `http://localhost:3003` |
| Local (`npm start`) | `http://localhost:3002` |
| Production | the app's own Vercel domain (`main` is the only branch that deploys) |

All endpoints live under `/api`. Requests and responses are `application/json;
charset=utf-8` unless the endpoint is documented as returning binary (the
`export/*` routes stream XLSX/DOCX/PDF attachments).

## Response envelope

Every JSON endpoint returns the same two-shape envelope. Clients should branch
on `success`, never on the HTTP status alone.

```jsonc
// success
{ "success": true, "data": <payload>, "message": "Optional human string" }

// failure — every non-2xx JSON response
{ "success": false, "error": "Human-readable message" }
```

- `data` is an object for detail/create/update endpoints and an array for list
  endpoints. It is omitted on pure-acknowledgement responses (some DELETEs
  return `{ success: true, message }` only).
- `error` is always a **single** string — the first Zod issue message for a 400,
  the thrown `Error.message` for a 500. There is no field-level error map; a
  form that needs per-field errors must validate client-side with the same
  schema.
- A handful of pre-envelope endpoints (`/api/health`, `/api/metrics`,
  `/api/auth/*`) predate this rule and are documented individually.

### Paginated lists

List endpoints built on `lib/api/pagination.ts` add a `meta` sidecar and keep
`data` a flat array, so older consumers that only read `data` still work.

```jsonc
{
  "success": true,
  "data": [ /* rows */ ],
  "meta": { "page": 1, "limit": 50, "total": 214, "totalPages": 5, "hasMore": true }
}
```

| Param | Default | Notes |
|---|---|---|
| `page` | `1` | 1-based; values `< 1` are clamped to `1`. |
| `limit` | `1000` (`parsePagination`) / `10` (`parseListParams`) | Hard cap `MAX_LIMIT = 1000`. `pageSize` is accepted as an alias. |
| `search` | — | Free-text; each route decides which columns it spans. |
| `sortBy` | per route | **Allow-listed per route.** An unlisted column falls back to the route default rather than erroring. |
| `sortOrder` | `asc` or `desc` | Anything else falls back to the route default. |

Ordering always appends an `id` tie-breaker so a row cannot appear on two pages
or be skipped between them.

## Authentication

QuikScale has no API keys and no bearer tokens for user traffic. There are three
callers:

1. **Browser / user session (the default).** A NextAuth session cookie, issued by
   the QuikIT auth app. Every wrapped route resolves the caller's *active* org
   membership via `getOrgId(userId)` and scopes every query by that `orgId`.
   No session → `401`. Session but no active QuikScale membership → `403`.
2. **Service-to-service (`/api/internal/*`).** No session. The caller sends
   `x-internal-secret: <INTERNAL_SECRET>` and passes `orgId` + `actorId`
   explicitly in the body (the org's automation principal). Used by QuikFlow
   action executors. A missing or mismatched secret → `401`.
3. **Public share links (`/api/s/{token}`) and infra probes (`/api/health`).**
   Unauthenticated by design; the opaque token in the URL is the only credential.

Tenant isolation is not optional: `orgId` is applied as a `where` filter on
every query, so a valid session for org A cannot read org B's rows even with a
correct row id — those requests return `404`, not `403`.

## Authorization

Two independent gates run, in this order, before any handler body:

**1. Module gate (feature flags).** `moduleKey` on the wrapper, e.g. `kpi`,
`orgSetup.teams`, `clientMeetings`. If the org has that module — or any
ancestor of it — disabled, the request returns **`404`**, not `403`. A disabled
module is indistinguishable from a route that does not exist.

**2. RBAC v2 permission.** `resource:action`, e.g. `KPI:view`,
`Priority:update`. Checked with `userCan(userId, orgId, resource, action)`
against `RolePermission` (role grants) plus `UserPermissionExtra` (per-user
overrides). **There is no admin bypass** — an org admin without the grant is
denied like anyone else. Failure returns `403` with
`"You do not have permission to perform this action"`.

Verb → action mapping is fixed by the wrapper: `GET → view`, `POST → create`,
`PUT`/`PATCH` → `update`, `DELETE → delete`. Endpoints that deviate (a POST that
is really an update, e.g. `/reorder` → `:update`) are shown per endpoint.

Beyond these gates, several modules apply **row-level** rules inside the handler
— ownership, team headship, visibility scope. Those are noted per endpoint and
surface as `403` or as rows silently filtered out of a list.

The full `resource:action` vocabulary is in
[Appendix A](#appendix-a--permission-resources).

## Error model

| Status | When | Body |
|---|---|---|
| `400` | Zod validation failed, or a business rule rejected the input | `{ success: false, error: "<first issue message>" }` |
| `401` | No session (or bad `x-internal-secret` on an internal route) | `{ success: false, error: "Unauthorized" }` |
| `403` | Session valid but no active org membership, or the RBAC gate denied the action | `{ success: false, error: "No active membership" }` / `"You do not have permission to perform this action"` |
| `404` | Row not found, not in the caller's org, or the module is disabled for the org | `{ success: false, error: "..." }` |
| `409` | Duplicate / conflicting state (unit in use, duplicate KPI name, category rename conflict) | `{ success: false, error: "..." }` |
| `429` | Rate limit exceeded — also sends `Retry-After` (seconds) | `{ success: false, error: "Too many requests. Please try again shortly." }` |
| `500` | Unhandled exception; the wrapper's `catch` returns the message | `{ success: false, error: "<Error.message or the route's fallback>" }` |

Success statuses: **`201`** for creation, **`200`** for everything else
(including deletes, which return an acknowledgement rather than `204`).

## Rate limiting

Applied by the wrapper *after* auth, keyed on `orgId:userId`, so a throttled
request never reaches the database. Redis-backed when `REDIS_URL` is set,
in-memory otherwise (per-instance — a serverless fleet then limits per lambda).

| Bucket | Limit | Applies to |
|---|---|---|
| `mutation` | 60 / 60s | Every `POST` / `PUT` / `PATCH` / `DELETE` on a wrapped route |
| `kpiWrite` | 30 / 60s | KPI create + weekly-value writes (handler's own tighter bucket) |
| `login` | 10 / 15min | Auth app, not QuikScale routes |

`GET`s are unthrottled unless an endpoint opts in. Endpoints that replace the
shared bucket with their own are marked **Rate limit** in their table.

## Cross-cutting conventions

These patterns repeat across modules; the per-endpoint sections below do not
restate them.

**Soft delete and trash.** Deletable resources set `deletedAt` instead of
removing the row. List endpoints hide soft-deleted rows by default;
`?includeDeleted=true` returns **only** the deleted rows (the trash view), not a
union. Restore is `POST /{resource}/{id}/restore`, and
`POST /{resource}/bulk-restore` takes `{ ids: string[] }`.

**Row order.** Grids with drag-reordering expose
`POST /{resource}/reorder` with body `{ id, beforeId, afterId }` — the two
neighbours that will sandwich the moved row, either of which may be `null` at
the top or bottom of the list — and respond
`{ success: true, data: { id, position } }` — `position` is a `Float`, shared
org-wide. `404` when the row is not in the caller's org.

**Audit trail.** Two read endpoints per audited resource:
`GET /{resource}/{id}/logs` (flat CREATE/UPDATE/DELETE history) and
`GET /{resource}/{id}/audit` (field-level before/after diff for the timeline UI).
Both are read-only; entries are written as a side effect of the mutating routes.

**Exports.** `POST /api/**/export/*` routes return a **binary attachment**
(XLSX, DOCX or PDF), not the JSON envelope. Errors from those routes still
return JSON. Check `Content-Type` before parsing.

**Notes.** `GET`/`POST /{resource}/{id}/notes` follow the standard envelope;
`DELETE /{resource}/{id}/notes/{noteId}` where present is note-author-scoped.

## Stability

There is no `/v1` prefix and no version header — QuikScale's API is consumed by
its own Next.js frontend and by QuikFlow over the internal secret, both deployed
from this monorepo. Treat every route as **internal and unversioned**: it may
change in the same PR as its caller. External consumers should go through the
platform OpenAPI document (`GET /api/docs` redirects to it) rather than
hard-coding these paths.

## Endpoint index

`241` route files · `339` endpoints · `34` modules.

| Module | Endpoints | Verbs |
|---|---:|---|
| [`apps`](#module-apps) | 2 | GET |
| [`audit`](#module-audit) | 2 | GET, POST |
| [`audit-logs`](#module-audit-logs) | 1 | GET |
| [`auth`](#module-auth) | 4 | GET, POST |
| [`categories`](#module-categories) | 8 | GET, POST, PUT, DELETE |
| [`client-meetings`](#module-client-meetings) | 93 | GET, POST, PUT, PATCH, DELETE |
| [`critical-numbers`](#module-critical-numbers) | 12 | GET, POST, PATCH, DELETE |
| [`dashboard`](#module-dashboard) | 1 | GET |
| [`demo-data`](#module-demo-data) | 3 | GET, POST |
| [`docs`](#module-docs) | 1 | GET |
| [`face`](#module-face) | 4 | GET, POST, PUT, DELETE |
| [`feature-flags`](#module-feature-flags) | 1 | GET |
| [`habits`](#module-habits) | 12 | GET, POST, PUT, DELETE |
| [`health`](#module-health) | 2 | GET |
| [`internal`](#module-internal) | 12 | POST |
| [`kpi`](#module-kpi) | 20 | GET, POST, PUT, DELETE |
| [`me`](#module-me) | 4 | GET, POST, DELETE |
| [`metrics`](#module-metrics) | 1 | GET |
| [`opsp`](#module-opsp) | 19 | GET, POST, PUT, PATCH |
| [`org`](#module-org) | 37 | GET, POST, PUT, PATCH, DELETE |
| [`pace`](#module-pace) | 4 | GET, POST, PUT, DELETE |
| [`performance`](#module-performance) | 24 | GET, POST, PUT, DELETE |
| [`pillars`](#module-pillars) | 1 | GET |
| [`priority`](#module-priority) | 17 | GET, POST, PUT, DELETE |
| [`s`](#module-s) | 2 | GET, POST |
| [`session`](#module-session) | 1 | GET |
| [`settings`](#module-settings) | 8 | GET, PATCH |
| [`support`](#module-support) | 5 | GET, POST |
| [`surveys`](#module-surveys) | 7 | GET, POST, PUT, DELETE |
| [`swt`](#module-swt) | 4 | GET, POST, PUT, DELETE |
| [`teams`](#module-teams) | 2 | GET, POST |
| [`units`](#module-units) | 7 | GET, POST, PUT, DELETE |
| [`users`](#module-users) | 2 | GET |
| [`www`](#module-www) | 16 | GET, POST, PUT, PATCH, DELETE |
| **Total** | **339** | |

Method mix: `GET` 147 · `POST` 120 · `PUT` 30 · `PATCH` 11 · `DELETE` 31

---

## Module `apps` <a id="module-apps"></a>

_2 endpoints_

| Endpoint | Permission | Module gate |
|---|---|---|
| `GET /api/apps` | — | — |
| `GET /api/apps/switcher` | — | — |

### `/api/apps`

#### `GET /api/apps`

GET /api/apps?orgId=xxx Returns apps the current user has access to for the given tenant.

| | |
|---|---|
| **Auth** | Hand-rolled `getServerSession` check |
| **Permission** | _none beyond auth_ |
| **Source** | [app/api/apps/route.ts](../app/api/apps/route.ts) |

**Query** — `orgId`

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data }<br/>`data` inferred from `.map()` projection: `appId`, `name`, `slug`, `description`, `iconUrl`, `baseUrl`, `status`, `role` |
| `400` | { success: false, error } |
| `401` | { success: false, error } |

### `/api/apps/switcher`

#### `GET /api/apps/switcher`

GET /api/apps/switcher Returns the list of apps the current user can see in the in-app AppSwitcher (the grid dropdown in the header). This MUST match what the QuikIT launcher (`/apps` page → apps/quikit/app/api/apps/launcher/route.ts) shows for the same user + active org, so the switcher and the portal never disagree. Queries the shared database directly (no cross-origin needed). Visibility rule (post 2026-05-04 role refactor — mirrors the launcher): 1. The org must have OrgAppAccess.enabled = true for the app (provisioning) 2. If App.requiresOrgAdmin = true, the caller's membership role must be in ADMIN_TIER_ROLES (super_admin/org_admin) OR they're a platform super admin 3. Org Admin / Super Admin see EVERY provisioned app; everyone else needs an explicit UserAppAccess row (UserAppAccess is an optional override, not a blanket gate) 4. `quikit` itself is excluded — it's the launcher, not a switch target NOTE: inside consumer apps `session.user.isSuperAdmin` is forced to false (apps don't inherit super-admin), so the admin path is driven by `membershipRole` via ADMIN_TIER_ROLES.

| | |
|---|---|
| **Auth** | Hand-rolled `getServerSession` check |
| **Permission** | _none beyond auth_ |
| **Source** | [app/api/apps/switcher/route.ts](../app/api/apps/switcher/route.ts) |

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data, quikitUrl }<br/>`data` inferred from `.map()` projection: `...app`, `baseUrl`, `installed` |
| `401` | { success: false, error } |

---

## Module `audit` <a id="module-audit"></a>

_2 endpoints_

| Endpoint | Permission | Module gate |
|---|---|---|
| `POST /api/audit/mark-read` | — | `kpi` |
| `GET /api/audit/unread-count` | — | `kpi` |

### `/api/audit/mark-read`

#### `POST /api/audit/mark-read`

POST /api/audit/mark-read body: { entityType, entityId } Upserts the current user's high-water read mark for an entity's audit timeline to "now". Idempotent per (user, entityType, entityId). Gated by KPI module access (KPI-only scope for now).

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `kpi` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/audit/mark-read/route.ts](../app/api/audit/mark-read/route.ts) |

**Request body** — JSON, not validated by a Zod schema (see route).

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: { lastReadAt } } |
| `400` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/audit/unread-count`

#### `GET /api/audit/unread-count`

GET /api/audit/unread-count ?entityType=KPI&entityId=<id> → unread count for one entity (badge) ?moduleKey=KPI → unread count across the module (sidebar dot) Unread = events created after the user's read mark AND not authored by them (editors implicitly read their own actions). Gated by KPI module access.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `kpi` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Source** | [app/api/audit/unread-count/route.ts](../app/api/audit/unread-count/route.ts) |

**Query** — `entityId`, `entityIds`, `entityType`, `moduleKey`

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: { counts } } |
| `200` | { success: true, data: { unread } } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

---

## Module `audit-logs` <a id="module-audit-logs"></a>

_1 endpoint_

| Endpoint | Permission | Module gate |
|---|---|---|
| `GET /api/audit-logs` | — | — |

### `/api/audit-logs`

#### `GET /api/audit-logs`

GET /api/audit-logs?entityType=Review&entityId=xxx&extra=quarter|rowIndex=0 Generic audit-history endpoint backing <AuditLogDrawer />. Returns the normalized shape the drawer renders (id / action / oldValue / newValue / changedByName / reason / createdAt) for any allowlisted entity type. `extra` is an optional substring filter against AuditLog.reason — used by OPSP Review to scope a single OPSP row's audit log to a specific (horizon, rowIndex) cell, matching the reason strings the write endpoints record (see opsp/review/*.ts).

| | |
|---|---|
| **Auth** | Org-admin guard (`requireAdmin`) |
| **Permission** | _none beyond auth_ |
| **Source** | [app/api/audit-logs/route.ts](../app/api/audit-logs/route.ts) |

**Query** — `entityId`, `entityType`, `extra`

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data } |
| `400` | { success: false, error } |
| `500` | { success: false, error } |

---

## Module `auth` <a id="module-auth"></a>

_4 endpoints_

| Endpoint | Permission | Module gate |
|---|---|---|
| `GET /api/auth/{...nextauth}` | — | — |
| `POST /api/auth/{...nextauth}` | — | — |
| `GET /api/auth/impersonate/{token}` | — | — |
| `POST /api/auth/impersonate/exit` | — | — |

### `/api/auth/{...nextauth}`

#### `GET /api/auth/{...nextauth}`

| | |
|---|---|
| **Auth** | NextAuth.js handler — sign-in, callbacks, session endpoints |
| **Permission** | _none beyond auth_ |
| **Source** | [app/api/auth/[...nextauth]/route.ts](../app/api/auth/[...nextauth]/route.ts) |

**Path params** — `nextauth`

**Responses**

| Status | Body |
|---|---|
| `200` | delegated to `handler` |

#### `POST /api/auth/{...nextauth}`

| | |
|---|---|
| **Auth** | NextAuth.js handler — sign-in, callbacks, session endpoints |
| **Permission** | _none beyond auth_ |
| **Source** | [app/api/auth/[...nextauth]/route.ts](../app/api/auth/[...nextauth]/route.ts) |

**Path params** — `nextauth`

**Responses**

| Status | Body |
|---|---|
| `200` | delegated to `handler` |

### `/api/auth/impersonate/{token}`

#### `GET /api/auth/impersonate/{token}`

SA-D.3 — Impersonation accept endpoint (QuikScale side). GET /api/auth/impersonate/:token Called by the super admin's browser (redirect from the launcher's start endpoint). Validates the one-time token, creates a NextAuth session as the target user with impersonation flags set, and redirects to the landing path on success. Security model: - Token is single-use; accepting it sets Impersonation.acceptedAt. Replay attempts return 410 Gone. - Token expires after 2h (hard deadline in the DB row). - Session cookie inherits the Impersonation's expiresAt, so even if the super admin doesn't explicitly exit, the session dies at the deadline. - A SessionEvent ("impersonation_start") is recorded so analytics distinguish real user activity from customer-support activity. Config requirement: NEXTAUTH_SECRET must be the SAME across quikit and quikscale (they already share it for the OAuth flow).

| | |
|---|---|
| **Auth** | Custom (see route) |
| **Permission** | _none beyond auth_ |
| **Rate limit** | handler bucket `auth:impersonate:accept` (limit ACCEPT_LIMIT) |
| **Headers read** | `user-agent`, `x-forwarded-for` |
| **Source** | [app/api/auth/impersonate/[token]/route.ts](../app/api/auth/impersonate/[token]/route.ts) |

**Path params** — `token`

**Query** — `landing`

**Responses**

| Status | Body |
|---|---|
| `307` | redirect (`Location` header) |
| `400` | { success: false, error } |
| `403` | { success: false, error } |
| `404` | { success: false, error } |
| `410` | { success: false, error } |
| `429` | { success: false, error } |
| `500` | { success: false, error } |

### `/api/auth/impersonate/exit`

#### `POST /api/auth/impersonate/exit`

SA-D.5 — Exit impersonation. POST /api/auth/impersonate/exit Records a SessionEvent, stamps Impersonation.exitedAt if we can match it, clears the session cookie, and redirects back to the QuikIT launcher so the super admin is in their own session again.

| | |
|---|---|
| **Auth** | Hand-rolled `getServerSession` check |
| **Permission** | _none beyond auth_ |
| **Headers read** | `user-agent`, `x-forwarded-for` |
| **Source** | [app/api/auth/impersonate/exit/route.ts](../app/api/auth/impersonate/exit/route.ts) |

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: { redirectUrl } } |
| `429` | { success: false, error } |
| `500` | { success: false, error } |

---

## Module `categories` <a id="module-categories"></a>

_8 endpoints_

| Endpoint | Permission | Module gate |
|---|---|---|
| `GET /api/categories` | `OPSP.Categories:view` | `opsp.categories` |
| `POST /api/categories` | `OPSP.Categories:create` | `opsp.categories` |
| `PUT /api/categories/{id}` | `OPSP.Categories:update` | `opsp.categories` |
| `DELETE /api/categories/{id}` | `OPSP.Categories:delete` | `opsp.categories` |
| `POST /api/categories/{id}/restore` | `OPSP.Categories:delete` | `opsp.categories` |
| `POST /api/categories/bulk-restore` | `OPSP.Categories:delete` | `opsp.categories` |
| `GET /api/categories/logs` | `OPSP.Categories:view` | `opsp.categories` |
| `POST /api/categories/reorder` | `OPSP.Categories:update` | `opsp.categories` |

### `/api/categories`

#### `GET /api/categories`

GET /api/categories — list categories for the tenant. Supports search, dataType filter, server pagination, sort, and the Trash view (includeDeleted).

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `opsp.categories` — 404 when the org has the module disabled |
| **Permission** | `OPSP.Categories:view` |
| **Source** | [app/api/categories/route.ts](../app/api/categories/route.ts) |

**Query** — `dataType`, `includeDeleted`, `search`, `sortBy`, `sortOrder`

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: [...], meta: PaginationMeta } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

#### `POST /api/categories`

POST /api/categories — create a new category Duplicate rule: (orgId, lowercased name, dataType, currency) must be unique. A P2002 from Prisma surfaces as a friendly 409.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `opsp.categories` — 404 when the org has the module disabled |
| **Permission** | `OPSP.Categories:create` |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/categories/route.ts](../app/api/categories/route.ts) |

**Request body** — `createCategorySchema` (`lib/schemas/categorySchema.ts`)

| Field | Type | Required |
|---|---|---|
| `name` | string — min 1 | ✓ |
| `dataType` | enum: Number \| Percentage \| Currency | ✓ |
| `currency` | string — max 10, nullable |  |
| `description` | string — nullable |  |
| `categoryType` | unknown |  |
| `breakdownType` | unknown |  |

**Responses**

| Status | Body |
|---|---|
| `201` | { success: true, data }<br/>`data` — Prisma `categoryMaster.create` result |
| `409` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/categories/{id}`

#### `PUT /api/categories/{id}`

PUT /api/categories/[id] — update a category Enforces the same (orgId, nameKey, dataType, currency) uniqueness as create.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `opsp.categories` — 404 when the org has the module disabled |
| **Permission** | `OPSP.Categories:update` |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/categories/[id]/route.ts](../app/api/categories/[id]/route.ts) |

**Path params** — `id`

**Request body** — `updateCategorySchema` (`lib/schemas/categorySchema.ts`)

| Field | Type | Required |
|---|---|---|
| `name` | string — min 1 |  |
| `dataType` | enum: Number \| Percentage \| Currency |  |
| `currency` | string — max 10, nullable |  |
| `description` | string — nullable |  |
| `categoryType` | unknown |  |
| `breakdownType` | unknown |  |

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data }<br/>`data` — Prisma `categoryMaster.update` result |
| `404` | { success: false, error } |
| `409` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

#### `DELETE /api/categories/{id}`

DELETE /api/categories/[id] — SOFT delete (moves the category to Trash). The row is retained with a `deletedAt` tombstone so it can be restored; the list endpoint hides it by default and surfaces it under the Trash view. Mirrors the KPI/Priority/WWW soft-delete convention.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `opsp.categories` — 404 when the org has the module disabled |
| **Permission** | `OPSP.Categories:delete` |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/categories/[id]/route.ts](../app/api/categories/[id]/route.ts) |

**Path params** — `id`

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, message } |
| `200` | { success: true } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/categories/{id}/restore`

#### `POST /api/categories/{id}/restore`

POST /api/categories/[id]/restore — clear the soft-delete tombstone.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `opsp.categories` — 404 when the org has the module disabled |
| **Permission** | `OPSP.Categories:delete` |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/categories/[id]/restore/route.ts](../app/api/categories/[id]/restore/route.ts) |

**Path params** — `id`

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, message } |
| `200` | { success: true, data }<br/>`data` — Prisma `categoryMaster.update` result |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/categories/bulk-restore`

#### `POST /api/categories/bulk-restore`

POST /api/categories/bulk-restore — restore many soft-deleted categories.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `opsp.categories` — 404 when the org has the module disabled |
| **Permission** | `OPSP.Categories:delete` |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/categories/bulk-restore/route.ts](../app/api/categories/bulk-restore/route.ts) |

**Request body** — JSON, not validated by a Zod schema (see route).

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: { restored } } |
| `400` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/categories/logs`

#### `GET /api/categories/logs`

GET /api/categories/logs — org-wide Category Mgmt audit trail (CREATE / UPDATE / DELETE). Module-scoped (NOT admin-only) so category managers can view it.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `opsp.categories` — 404 when the org has the module disabled |
| **Permission** | `OPSP.Categories:view` |
| **Source** | [app/api/categories/logs/route.ts](../app/api/categories/logs/route.ts) |

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/categories/reorder`

#### `POST /api/categories/reorder`

POST /api/categories/reorder — move a category to a new manual position (org-shared drag order). Uses the shared fractional-position reorder util.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `opsp.categories` — 404 when the org has the module disabled |
| **Permission** | `OPSP.Categories:update` |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/categories/reorder/route.ts](../app/api/categories/reorder/route.ts) |

**Request body** — `reorderRowSchema` (`lib/schemas/reorderSchema.ts`)

| Field | Type | Required |
|---|---|---|
| `id` | string — min 1 | ✓ |
| `beforeId` | string — min 1, nullable | ✓ |
| `afterId` | string — min 1, nullable | ✓ |

**Responses**

_Handler delegates to `handleReorder()`._

| Status | Body |
|---|---|
| `200` | { success: true, data: { id, position } } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

---

## Module `client-meetings` <a id="module-client-meetings"></a>

_93 endpoints_

| Endpoint | Permission | Module gate |
|---|---|---|
| `GET /api/client-meetings/automation-status` | `ClientMaster:view` | `clientMeetings.clients` |
| `GET /api/client-meetings/calendar` | `ClientMaster:view` | `clientMeetings.clients` |
| `GET /api/client-meetings/clients` | `ClientMaster:view` | `clientMeetings.clients` |
| `POST /api/client-meetings/clients` | `ClientMaster:create` | `clientMeetings.clients` |
| `GET /api/client-meetings/clients/{id}` | `ClientMaster:view` | `clientMeetings.clients` |
| `PUT /api/client-meetings/clients/{id}` | `ClientMaster:update` | `clientMeetings.clients` |
| `DELETE /api/client-meetings/clients/{id}` | `ClientMaster:delete` | `clientMeetings.clients` |
| `GET /api/client-meetings/clients/{id}/audit` | — | `clientMeetings.clients` |
| `GET /api/client-meetings/clients/{id}/logs` | — | `clientMeetings.clients` |
| `POST /api/client-meetings/clients/{id}/restore` | `ClientMaster:delete` | `clientMeetings.clients` |
| `POST /api/client-meetings/clients/{id}/schedule-meetings` | `ClientMaster:update` | `clientMeetings.clients` |
| `POST /api/client-meetings/clients/bulk-restore` | — | `clientMeetings.clients` |
| `POST /api/client-meetings/clients/reorder` | `ClientMaster:update` | `clientMeetings.clients` |
| `GET /api/client-meetings/daily-huddles` | — | `clientMeetings.dailyHuddle` |
| `POST /api/client-meetings/daily-huddles` | — | `clientMeetings.dailyHuddle` |
| `GET /api/client-meetings/daily-huddles/{id}` | — | `clientMeetings.dailyHuddle` |
| `PUT /api/client-meetings/daily-huddles/{id}` | — | `clientMeetings.dailyHuddle` |
| `DELETE /api/client-meetings/daily-huddles/{id}` | — | `clientMeetings.dailyHuddle` |
| `GET /api/client-meetings/daily-huddles/{id}/audit` | — | `clientMeetings.dailyHuddle` |
| `GET /api/client-meetings/daily-huddles/{id}/logs` | — | `clientMeetings.dailyHuddle` |
| `POST /api/client-meetings/daily-huddles/{id}/restore` | — | `clientMeetings.dailyHuddle` |
| `POST /api/client-meetings/daily-huddles/bulk-restore` | — | `clientMeetings.dailyHuddle` |
| `GET /api/client-meetings/daily-huddles/export` | — | `clientMeetings.dailyHuddle` |
| `POST /api/client-meetings/daily-huddles/reorder` | — | `clientMeetings.dailyHuddle` |
| `GET /api/client-meetings/dashboard` | — | `clientMeetings.dashboard` |
| `POST /api/client-meetings/export/daily` | — | `clientMeetings.dashboard` |
| `POST /api/client-meetings/export/daily-detail` | — | `clientMeetings.dailyHuddle` |
| `POST /api/client-meetings/export/punch` | — | `clientMeetings.dashboard` |
| `POST /api/client-meetings/export/transcript` | — | `clientMeetings.dashboard` |
| `POST /api/client-meetings/export/weekly` | — | `clientMeetings.dashboard` |
| `POST /api/client-meetings/export/weekly-detail` | — | `clientMeetings.weeklyMeeting` |
| `GET /api/client-meetings/facts` | `ClientMeetings.Report:view` | `clientMeetings.dashboard` |
| `GET /api/client-meetings/members` | — | `clientMeetings.members` |
| `POST /api/client-meetings/members` | — | `clientMeetings.members` |
| `GET /api/client-meetings/members/{id}` | — | `clientMeetings.members` |
| `PUT /api/client-meetings/members/{id}` | — | `clientMeetings.members` |
| `DELETE /api/client-meetings/members/{id}` | — | `clientMeetings.members` |
| `GET /api/client-meetings/members/{id}/audit` | — | `clientMeetings.members` |
| `GET /api/client-meetings/members/{id}/logs` | — | `clientMeetings.members` |
| `POST /api/client-meetings/members/{id}/restore` | — | `clientMeetings.members` |
| `POST /api/client-meetings/members/bulk-restore` | — | `clientMeetings.members` |
| `POST /api/client-meetings/members/reorder` | — | `clientMeetings.members` |
| `GET /api/client-meetings/reports/metrics` | `ClientMeetings.Report:view` | `clientMeetings.dashboard` |
| `GET /api/client-meetings/reports/monthly` | `ClientMeetings.Report:view` | `clientMeetings.dashboard` |
| `PUT /api/client-meetings/reports/monthly` | `ClientMeetings.Report:update` | `clientMeetings.dashboard` |
| `DELETE /api/client-meetings/reports/monthly` | `ClientMeetings.Report:delete` | `clientMeetings.dashboard` |
| `GET /api/client-meetings/reports/monthly/coverage` | `ClientMeetings.Report:view` | `clientMeetings.dashboard` |
| `POST /api/client-meetings/reports/monthly/export` | `ClientMeetings.Report:view` | `clientMeetings.dashboard` |
| `POST /api/client-meetings/reports/monthly/generate` | `ClientMeetings.Report:update` | `clientMeetings.dashboard` |
| `GET /api/client-meetings/reports/week-rollup` | `ClientMeetings.Report:view` | `clientMeetings.dashboard` |
| `PUT /api/client-meetings/reports/week-rollup` | `ClientMeetings.Report:update` | `clientMeetings.dashboard` |
| `DELETE /api/client-meetings/reports/week-rollup` | `ClientMeetings.Report:delete` | `clientMeetings.dashboard` |
| `POST /api/client-meetings/reports/week-rollup/export` | `ClientMeetings.Report:view` | `clientMeetings.dashboard` |
| `POST /api/client-meetings/reports/week-rollup/generate` | `ClientMeetings.Report:update` | `clientMeetings.dashboard` |
| `GET /api/client-meetings/reports/weekly` | `ClientMeetings.Report:view` | `clientMeetings.dashboard` |
| `PUT /api/client-meetings/reports/weekly` | `ClientMeetings.Report:update` | `clientMeetings.dashboard` |
| `DELETE /api/client-meetings/reports/weekly` | `ClientMeetings.Report:delete` | `clientMeetings.dashboard` |
| `GET /api/client-meetings/reports/weekly-meeting` | `ClientMeetings.Report:view` | `clientMeetings.dashboard` |
| `PUT /api/client-meetings/reports/weekly-meeting` | `ClientMeetings.Report:update` | `clientMeetings.dashboard` |
| `DELETE /api/client-meetings/reports/weekly-meeting` | `ClientMeetings.Report:delete` | `clientMeetings.dashboard` |
| `POST /api/client-meetings/reports/weekly-meeting/export` | `ClientMeetings.Report:view` | `clientMeetings.dashboard` |
| `POST /api/client-meetings/reports/weekly-meeting/generate` | `ClientMeetings.Report:update` | `clientMeetings.dashboard` |
| `POST /api/client-meetings/reports/weekly/export` | `ClientMeetings.Report:view` | `clientMeetings.dashboard` |
| `POST /api/client-meetings/reports/weekly/generate` | `ClientMeetings.Report:update` | `clientMeetings.dashboard` |
| `GET /api/client-meetings/transcript-workflow-status` | — | `clientMeetings.dashboard` |
| `GET /api/client-meetings/transcripts` | — | `clientMeetings.dashboard` |
| `DELETE /api/client-meetings/transcripts/{id}` | `ClientMeetings.Report:delete` | `clientMeetings.dashboard` |
| `GET /api/client-meetings/transcripts/{id}/chunk-plan` | `ClientMeetings.Report:view` | `clientMeetings.dashboard` |
| `POST /api/client-meetings/transcripts/{id}/extract` | `ClientMeetings.Report:update` | `clientMeetings.dashboard` |
| `GET /api/client-meetings/transcripts/{id}/facts` | `ClientMeetings.Report:view` | `clientMeetings.dashboard` |
| `GET /api/client-meetings/transcripts/{id}/new-www` | `ClientMeetings.Report:view` | `clientMeetings.dashboard` |
| `POST /api/client-meetings/transcripts/{id}/new-www` | `ClientMeetings.Report:update` | `clientMeetings.dashboard` |
| `POST /api/client-meetings/transcripts/{id}/prepare` | `ClientMeetings.Report:update` | `clientMeetings.dashboard` |
| `GET /api/client-meetings/transcripts/{id}/report` | `ClientMeetings.Report:view` | `clientMeetings.dashboard` |
| `PUT /api/client-meetings/transcripts/{id}/report` | `ClientMeetings.Report:update` | `clientMeetings.dashboard` |
| `DELETE /api/client-meetings/transcripts/{id}/report` | `ClientMeetings.Report:delete` | `clientMeetings.dashboard` |
| `POST /api/client-meetings/transcripts/{id}/report/generate` | `ClientMeetings.Report:view` | `clientMeetings.dashboard` |
| `GET /api/client-meetings/transcripts/{id}/segments` | `ClientMeetings.Report:view` | `clientMeetings.dashboard` |
| `GET /api/client-meetings/transcripts/{id}/www-review` | `ClientMeetings.Report:view` | `clientMeetings.dashboard` |
| `POST /api/client-meetings/transcripts/upload` | — | `clientMeetings.dashboard` |
| `GET /api/client-meetings/weekly-meetings` | — | `clientMeetings.weeklyMeeting` |
| `POST /api/client-meetings/weekly-meetings` | — | `clientMeetings.weeklyMeeting` |
| `GET /api/client-meetings/weekly-meetings/{id}` | — | `clientMeetings.weeklyMeeting` |
| `PUT /api/client-meetings/weekly-meetings/{id}` | — | `clientMeetings.weeklyMeeting` |
| `DELETE /api/client-meetings/weekly-meetings/{id}` | — | `clientMeetings.weeklyMeeting` |
| `GET /api/client-meetings/weekly-meetings/{id}/audit` | — | `clientMeetings.weeklyMeeting` |
| `GET /api/client-meetings/weekly-meetings/{id}/logs` | — | `clientMeetings.weeklyMeeting` |
| `POST /api/client-meetings/weekly-meetings/{id}/restore` | — | `clientMeetings.weeklyMeeting` |
| `PATCH /api/client-meetings/weekly-meetings/{id}/scores/{userId}` | — | `clientMeetings.weeklyMeeting` |
| `POST /api/client-meetings/weekly-meetings/bulk-restore` | — | `clientMeetings.weeklyMeeting` |
| `GET /api/client-meetings/weekly-meetings/export` | — | `clientMeetings.weeklyMeeting` |
| `POST /api/client-meetings/weekly-meetings/reorder` | — | `clientMeetings.weeklyMeeting` |
| `POST /api/client-meetings/www-candidates/{factId}/dismiss` | `ClientMeetings.Report:update` | `clientMeetings.dashboard` |

### `/api/client-meetings/automation-status`

#### `GET /api/client-meetings/automation-status`

GET /api/client-meetings/automation-status Tells the Client Master form (a) whether a Microsoft Teams calendar is CONNECTED — which enables the "Create Teams meetings" model + button — and (b) whether an active QuikFlow calendar workflow exists (auto-on-save). OAuth + workflow state live in QuikFlow, so this proxies there with the shared secret. Always degrades to all-false — it must never break the form.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `clientMeetings.clients` — 404 when the org has the module disabled |
| **Permission** | `ClientMaster:view` |
| **Source** | [app/api/client-meetings/automation-status/route.ts](../app/api/client-meetings/automation-status/route.ts) |

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data }<br/>`data` inferred from object literal: `calendarConnected`, `calendarAutomation` |
| `200` | { success: true, data: { calendarConnected, calendarAutomation } } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/client-meetings/calendar`

#### `GET /api/client-meetings/calendar`

GET /api/client-meetings/calendar?start=<ISO>&end=<ISO> The Client Master calendar icon reads the org's connected Microsoft (Teams) calendar. The OAuth connection + Graph access live in QuikFlow, so this route (org-authed for the user) proxies server-side to QuikFlow's internal calendar-view endpoint with the shared INTERNAL_SECRET. When QuikFlow isn't configured / no calendar is connected, it returns `connected: false` so the UI degrades to "connect a calendar" rather than erroring.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `clientMeetings.clients` — 404 when the org has the module disabled |
| **Permission** | `ClientMaster:view` |
| **Source** | [app/api/client-meetings/calendar/route.ts](../app/api/client-meetings/calendar/route.ts) |

**Query** — `end`, `start`

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data }<br/>`data` inferred from object literal: `connected`, `organizer`, `events` |
| `500` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/client-meetings/clients`

#### `GET /api/client-meetings/clients`

GET /api/client-meetings/clients ?includeDeleted=true → return ONLY soft-deleted rows (trash view). ?sortBy=<col>&sortOrder=<asc|desc> → server-side sort (whitelist enforced). Falls back to `createdAt desc` (newest first) when omitted/invalid.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `clientMeetings.clients` — 404 when the org has the module disabled |
| **Permission** | `ClientMaster:view` |
| **Source** | [app/api/client-meetings/clients/route.ts](../app/api/client-meetings/clients/route.ts) |

**Query** — `clientId`, `includeDeleted`, `search`, `status`

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: [...], meta: PaginationMeta }<br/>row shape inferred from `.map()` projection: `id`, `displayId`, `name`, `description`, `isActive`, `startDate`, `weeklyStartTime`, `weeklyEndTime`, `dailyStartTime`, `dailyEndTime`, `weeklyDay`, `dailyDays`, `meetingUntil`, `teamMembers`, `userMemberCount`, `createdAt`, `updatedAt`, `createdBy`, `createdByName`, `createdByInitials`, `updatedBy`, `updatedByName`, `updatedByInitials` |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

#### `POST /api/client-meetings/clients`

POST /api/client-meetings/clients — gated by `ClientMaster.create`. Body accepts teamMemberIds[] to populate the client's roster at create time.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `clientMeetings.clients` — 404 when the org has the module disabled |
| **Permission** | `ClientMaster:create` |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/client-meetings/clients/route.ts](../app/api/client-meetings/clients/route.ts) |

**Request body** — `createClientSchema` (`lib/schemas/clientMeetingsSchema.ts`)

| Field | Type | Required |
|---|---|---|
| `name` | string — min 1 | ✓ |
| `description` | string — nullable |  |
| `isActive` | boolean — default true |  |
| `startDate` | string — nullable |  |
| `weeklyStartTime` | string | ✓ |
| `weeklyEndTime` | string | ✓ |
| `dailyStartTime` | string | ✓ |
| `dailyEndTime` | string | ✓ |
| `weeklyDay` | unknown — nullable |  |
| `dailyDays` | array — default [] |  |
| `meetingUntil` | string — nullable |  |
| `teamMemberIds` | string[] — default [] |  |
| `teamMemberTypes` | enum: REQUIRED \| OPTIONAL \| EXTERNAL |  |

**Responses**

| Status | Body |
|---|---|
| `201` | { success: true, data: { id } } |
| `400` | { success: false, error } |
| `409` | { success: false, error } |
| `500` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/client-meetings/clients/{id}`

#### `GET /api/client-meetings/clients/{id}`

GET /api/client-meetings/clients/[id] — detail including team-member list.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `clientMeetings.clients` — 404 when the org has the module disabled |
| **Permission** | `ClientMaster:view` |
| **Source** | [app/api/client-meetings/clients/[id]/route.ts](../app/api/client-meetings/clients/[id]/route.ts) |

**Path params** — `id`

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: { id, name, description, isActive, startDate, weeklyStartTime, weeklyEndTime, dailyStartTime, dailyEndTime, teamMembers, members } } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

#### `PUT /api/client-meetings/clients/{id}`

PUT /api/client-meetings/clients/[id] — gated by `ClientMaster.update`.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `clientMeetings.clients` — 404 when the org has the module disabled |
| **Permission** | `ClientMaster:update` |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/client-meetings/clients/[id]/route.ts](../app/api/client-meetings/clients/[id]/route.ts) |

**Path params** — `id`

**Request body** — `updateClientSchema` (`lib/schemas/clientMeetingsSchema.ts`)

| Field | Type | Required |
|---|---|---|
| `name` | string — min 1 | ✓ |
| `description` | string — nullable |  |
| `isActive` | boolean — default true |  |
| `startDate` | string — nullable |  |
| `weeklyStartTime` | string | ✓ |
| `weeklyEndTime` | string | ✓ |
| `dailyStartTime` | string | ✓ |
| `dailyEndTime` | string | ✓ |
| `weeklyDay` | unknown — nullable |  |
| `dailyDays` | array — default [] |  |
| `meetingUntil` | string — nullable |  |
| `teamMemberIds` | string[] — default [] |  |
| `teamMemberTypes` | enum: REQUIRED \| OPTIONAL \| EXTERNAL |  |

- derived from `createClientSchema`
- all fields optional (`.partial()`)

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true } |
| `400` | { success: false, error } |
| `404` | { success: false, error } |
| `500` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

#### `DELETE /api/client-meetings/clients/{id}`

DELETE /api/client-meetings/clients/[id] — gated by `ClientMaster.delete`. Soft delete.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `clientMeetings.clients` — 404 when the org has the module disabled |
| **Permission** | `ClientMaster:delete` |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/client-meetings/clients/[id]/route.ts](../app/api/client-meetings/clients/[id]/route.ts) |

**Path params** — `id`

**Request body** — JSON, not validated by a Zod schema (see route).

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true } |
| `404` | { success: false, error } |
| `500` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/client-meetings/clients/{id}/audit`

#### `GET /api/client-meetings/clients/{id}/audit`

GET /api/client-meetings/clients/[id]/audit — full Change History timeline for one Client. Reads the centralized AuditEvent + AuditChange tables, mirroring the KPI/Priority/WWW audit routes. findUnique so soft-deleted clients can still have their history viewed.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `clientMeetings.clients` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Source** | [app/api/client-meetings/clients/[id]/audit/route.ts](../app/api/client-meetings/clients/[id]/audit/route.ts) |

**Path params** — `id`

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data, meta }<br/>`data` — Prisma `auditEvent.findMany` result |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/client-meetings/clients/{id}/logs`

#### `GET /api/client-meetings/clients/{id}/logs`

GET /api/client-meetings/clients/[id]/logs — audit history for one Client.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `clientMeetings.clients` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Source** | [app/api/client-meetings/clients/[id]/logs/route.ts](../app/api/client-meetings/clients/[id]/logs/route.ts) |

**Path params** — `id`

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/client-meetings/clients/{id}/restore`

#### `POST /api/client-meetings/clients/{id}/restore`

POST /api/client-meetings/clients/[id]/restore — gated by `ClientMaster.delete`.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `clientMeetings.clients` — 404 when the org has the module disabled |
| **Permission** | `ClientMaster:delete` |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/client-meetings/clients/[id]/restore/route.ts](../app/api/client-meetings/clients/[id]/restore/route.ts) |

**Path params** — `id`

**Request body** — JSON, not validated by a Zod schema (see route).

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/client-meetings/clients/{id}/schedule-meetings`

#### `POST /api/client-meetings/clients/{id}/schedule-meetings`

POST /api/client-meetings/clients/[id]/schedule-meetings The "Create Teams meetings" button. Loads the saved client, then asks QuikFlow (where the calendar connection lives) to create/update BOTH the Daily Huddle and Weekly Meeting recurring Teams events for it — the direct path that needs no QuikFlow workflow. Idempotent (QuikFlow pins each by kind), so re-clicking updates the same events. Returns { connected: false } when no calendar is connected instead of erroring.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `clientMeetings.clients` — 404 when the org has the module disabled |
| **Permission** | `ClientMaster:update` |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/client-meetings/clients/[id]/schedule-meetings/route.ts](../app/api/client-meetings/clients/[id]/schedule-meetings/route.ts) |

**Path params** — `id`

**Request body** — JSON, not validated by a Zod schema (see route).

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: { connected } } |
| `200` | { success: true, data } |
| `404` | { success: false, error } |
| `500` | { success: false, error } |
| `502` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/client-meetings/clients/bulk-restore`

#### `POST /api/client-meetings/clients/bulk-restore`

POST /api/client-meetings/clients/bulk-restore — undo soft delete in bulk.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `clientMeetings.clients` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/client-meetings/clients/bulk-restore/route.ts](../app/api/client-meetings/clients/bulk-restore/route.ts) |

**Request body** — JSON, not validated by a Zod schema (see route).

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: { restored } } |
| `400` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/client-meetings/clients/reorder`

#### `POST /api/client-meetings/clients/reorder`

POST /api/client-meetings/clients/reorder — move a Client row to a new position.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `clientMeetings.clients` — 404 when the org has the module disabled |
| **Permission** | `ClientMaster:update` |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/client-meetings/clients/reorder/route.ts](../app/api/client-meetings/clients/reorder/route.ts) |

**Request body** — `reorderRowSchema` (`lib/schemas/reorderSchema.ts`)

| Field | Type | Required |
|---|---|---|
| `id` | string — min 1 | ✓ |
| `beforeId` | string — min 1, nullable | ✓ |
| `afterId` | string — min 1, nullable | ✓ |

**Responses**

_Handler delegates to `handleReorder()`._

| Status | Body |
|---|---|
| `200` | { success: true, data: { id, position } } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/client-meetings/daily-huddles`

#### `GET /api/client-meetings/daily-huddles`

GET /api/client-meetings/daily-huddles ?clientId=…&from=YYYY-MM-DD&to=YYYY-MM-DD&includeDeleted=true ?sortBy=<col>&sortOrder=<asc|desc> → server-side sort (whitelist enforced). Falls back to the historical `meetingDate desc` when omitted/invalid. Returns rows with creator/updater name + initials + absence-member ids (both legacy User-based and new ClientMember-based).

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `clientMeetings.dailyHuddle` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Source** | [app/api/client-meetings/daily-huddles/route.ts](../app/api/client-meetings/daily-huddles/route.ts) |

**Query** — `clientId`, `from`, `includeDeleted`, `search`, `status`, `to`

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: [...], meta: PaginationMeta }<br/>row shape inferred from `.map()` projection: `id`, `displayId`, `clientId`, `clientName`, `meetingDate`, `callStatus`, `actualStartTime`, `actualEndTime`, `yesterdaysAchievements`, `todaysPriority`, `stuckIssues`, `punctualityOverride`, `totalMembers`, `notes`, `notesKPDashboard`, `otherNotes`, `absentUserIds`, `absentClientMemberIds`, `absentTeamMemberNames`, `createdAt`, `updatedAt`, `createdBy`, `createdByName`, `createdByInitials`, `updatedBy`, `updatedByName`, `updatedByInitials` |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

#### `POST /api/client-meetings/daily-huddles`

POST — create a daily huddle. Any active tenant member may call.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `clientMeetings.dailyHuddle` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/client-meetings/daily-huddles/route.ts](../app/api/client-meetings/daily-huddles/route.ts) |

**Request body** — `createDailyHuddleSchema` (`lib/schemas/clientMeetingsSchema.ts`)

| Field | Type | Required |
|---|---|---|
| `clientId` | string — min 1 | ✓ |
| `meetingDate` | string | ✓ |
| `callStatus` | unknown — default "HELD" |  |
| `actualStartTime` | string — nullable |  |
| `actualEndTime` | string — nullable |  |
| `format1Status` | unknown — default "NA" |  |
| `format2Status` | unknown — default "NA" |  |
| `stuckCallStatus` | unknown — default "NA" |  |
| `punctualityOverride` | unknown — default "NA" |  |
| `totalMembers` | number — min 0, default 0 |  |
| `notes` | string — nullable |  |
| `notesKPDashboard` | string — nullable |  |
| `otherNotes` | string — nullable |  |
| `absentUserIds` | string[] — default [] |  |
| `absentClientMemberIds` | string[] — default [] |  |

- has cross-field `.refine()` rules

**Responses**

| Status | Body |
|---|---|
| `201` | { success: true, data: { id } } |
| `400` | { success: false, error } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/client-meetings/daily-huddles/{id}`

#### `GET /api/client-meetings/daily-huddles/{id}`

PUT — full update. Absence sets (both kinds) and notes fields replace atomically.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `clientMeetings.dailyHuddle` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Source** | [app/api/client-meetings/daily-huddles/[id]/route.ts](../app/api/client-meetings/daily-huddles/[id]/route.ts) |

**Path params** — `id`

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: { ...row, meetingDate, absentUserIds, absentClientMemberIds } } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

#### `PUT /api/client-meetings/daily-huddles/{id}`

PUT — full update. Absence sets (both kinds) and notes fields replace atomically.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `clientMeetings.dailyHuddle` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/client-meetings/daily-huddles/[id]/route.ts](../app/api/client-meetings/daily-huddles/[id]/route.ts) |

**Path params** — `id`

**Request body** — `updateDailyHuddleSchema` (`lib/schemas/clientMeetingsSchema.ts`)

| Field | Type | Required |
|---|---|---|
| `clientId` | string — min 1 |  |
| `meetingDate` | string |  |
| `callStatus` | unknown — default "HELD" |  |
| `actualStartTime` | string — nullable |  |
| `actualEndTime` | string — nullable |  |
| `format1Status` | unknown — default "NA" |  |
| `format2Status` | unknown — default "NA" |  |
| `stuckCallStatus` | unknown — default "NA" |  |
| `punctualityOverride` | unknown — default "NA" |  |
| `totalMembers` | number — min 0, default 0 |  |
| `notes` | string — nullable |  |
| `notesKPDashboard` | string — nullable |  |
| `otherNotes` | string — nullable |  |
| `absentUserIds` | string[] — default [] |  |
| `absentClientMemberIds` | string[] — default [] |  |

- all fields optional (`.partial()`)
- has cross-field `.refine()` rules

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true } |
| `400` | { success: false, error } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

#### `DELETE /api/client-meetings/daily-huddles/{id}`

PUT — full update. Absence sets (both kinds) and notes fields replace atomically.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `clientMeetings.dailyHuddle` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/client-meetings/daily-huddles/[id]/route.ts](../app/api/client-meetings/daily-huddles/[id]/route.ts) |

**Path params** — `id`

**Request body** — JSON, not validated by a Zod schema (see route).

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/client-meetings/daily-huddles/{id}/audit`

#### `GET /api/client-meetings/daily-huddles/{id}/audit`

GET /api/client-meetings/daily-huddles/[id]/audit — full Change History timeline for one Daily Huddle. Reads the centralized AuditEvent + AuditChange tables, mirroring the other entities' audit routes.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `clientMeetings.dailyHuddle` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Source** | [app/api/client-meetings/daily-huddles/[id]/audit/route.ts](../app/api/client-meetings/daily-huddles/[id]/audit/route.ts) |

**Path params** — `id`

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data, meta }<br/>`data` — Prisma `auditEvent.findMany` result |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/client-meetings/daily-huddles/{id}/logs`

#### `GET /api/client-meetings/daily-huddles/{id}/logs`

GET /api/client-meetings/daily-huddles/[id]/logs — audit history.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `clientMeetings.dailyHuddle` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Source** | [app/api/client-meetings/daily-huddles/[id]/logs/route.ts](../app/api/client-meetings/daily-huddles/[id]/logs/route.ts) |

**Path params** — `id`

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/client-meetings/daily-huddles/{id}/restore`

#### `POST /api/client-meetings/daily-huddles/{id}/restore`

POST /api/client-meetings/daily-huddles/[id]/restore — undo soft delete.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `clientMeetings.dailyHuddle` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/client-meetings/daily-huddles/[id]/restore/route.ts](../app/api/client-meetings/daily-huddles/[id]/restore/route.ts) |

**Path params** — `id`

**Request body** — JSON, not validated by a Zod schema (see route).

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/client-meetings/daily-huddles/bulk-restore`

#### `POST /api/client-meetings/daily-huddles/bulk-restore`

POST /api/client-meetings/daily-huddles/bulk-restore — undo soft delete in bulk.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `clientMeetings.dailyHuddle` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/client-meetings/daily-huddles/bulk-restore/route.ts](../app/api/client-meetings/daily-huddles/bulk-restore/route.ts) |

**Request body** — JSON, not validated by a Zod schema (see route).

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: { restored } } |
| `400` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/client-meetings/daily-huddles/export`

#### `GET /api/client-meetings/daily-huddles/export`

GET /api/client-meetings/daily-huddles/export — Global Export for Daily Huddle. Date-based interval: from/to ("YYYY-MM-DD") filter `meetingDate`. One row per huddle. Scope shared with the list route via `buildClientMeetingWhere`. This is the row-per-record export; the aggregate monthly metrics report (/api/client-meetings/export/daily*) is a separate, preserved feature. Node runtime (ExcelJS + @react-pdf/renderer).

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `clientMeetings.dailyHuddle` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Source** | [app/api/client-meetings/daily-huddles/export/route.ts](../app/api/client-meetings/daily-huddles/export/route.ts) |

**Query** — `clientId`, `includeDeleted`, `status`

**Validated query params** — `exportBaseSchema` (`lib/exports/exportParams.ts`)

| Field | Type | Required |
|---|---|---|
| `columns` | unknown |  |

**Validated query params** — `dateRangeSchema` (`lib/exports/exportParams.ts`)

| Field | Type | Required |
|---|---|---|
| `from` | unknown |  |
| `to` | unknown |  |

**Responses**

| Status | Body |
|---|---|
| `400` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/client-meetings/daily-huddles/reorder`

#### `POST /api/client-meetings/daily-huddles/reorder`

POST /api/client-meetings/daily-huddles/reorder — move a ClientDailyHuddle row.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `clientMeetings.dailyHuddle` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/client-meetings/daily-huddles/reorder/route.ts](../app/api/client-meetings/daily-huddles/reorder/route.ts) |

**Request body** — `reorderRowSchema` (`lib/schemas/reorderSchema.ts`)

| Field | Type | Required |
|---|---|---|
| `id` | string — min 1 | ✓ |
| `beforeId` | string — min 1, nullable | ✓ |
| `afterId` | string — min 1, nullable | ✓ |

**Responses**

_Handler delegates to `handleReorder()`._

| Status | Body |
|---|---|
| `200` | { success: true, data: { id, position } } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/client-meetings/dashboard`

#### `GET /api/client-meetings/dashboard`

GET /api/client-meetings/dashboard ?clientId=...&mode=daily|weekly&monthsBack=6 (optional) &punchInUserId=... → returns per-member weekly punch-in rows Returns up to 6 months of monthly aggregates + overall totals.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `clientMeetings.dashboard` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Source** | [app/api/client-meetings/dashboard/route.ts](../app/api/client-meetings/dashboard/route.ts) |

**Query** — `clientId`, `mode`, `monthsBack`, `punchInUserId`, `punchMonth`, `punchYear`

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: { client, mode, months, monthlyStats, overallStats, totalCallsAssessed, roster, punchIn, punchInOverallAverage } } |
| `400` | { success: false, error } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/client-meetings/export/daily`

#### `POST /api/client-meetings/export/daily`

POST /api/client-meetings/export/daily Body: { clientId, monthsBack? } Returns: xlsx blob with 6 metric rows × N month columns + Total Avg.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `clientMeetings.dashboard` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/client-meetings/export/daily/route.ts](../app/api/client-meetings/export/daily/route.ts) |

**Request body** — JSON, not validated by a Zod schema (see route).

**Responses**

| Status | Body |
|---|---|
| `200` | binary — `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`<br/>attachment: `${filename}` |
| `400` | { success: false, error } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/client-meetings/export/daily-detail`

#### `POST /api/client-meetings/export/daily-detail`

POST /api/client-meetings/export/daily-detail Body: { clientId: string, from: "YYYY-MM-DD", to: "YYYY-MM-DD" } Returns: xlsx blob — one row per daily huddle in the date range, with Client Master roster size driving the Total / Present / Absent counts.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `clientMeetings.dailyHuddle` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/client-meetings/export/daily-detail/route.ts](../app/api/client-meetings/export/daily-detail/route.ts) |

**Request body** — JSON, not validated by a Zod schema (see route).

**Responses**

| Status | Body |
|---|---|
| `200` | binary — `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`<br/>attachment: `${filename}` |
| `400` | { success: false, error } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/client-meetings/export/punch`

#### `POST /api/client-meetings/export/punch`

POST /api/client-meetings/export/punch Body: { clientId, year, month } — single-month member punch-in report. For every member on the client roster, emits meeting-date rows with 5 KPI scores + a per-member Total row. Finishes with an overall "Total Average of All Members" row (spec §7.9).

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `clientMeetings.dashboard` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/client-meetings/export/punch/route.ts](../app/api/client-meetings/export/punch/route.ts) |

**Request body** — JSON, not validated by a Zod schema (see route).

**Responses**

| Status | Body |
|---|---|
| `200` | binary — `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`<br/>attachment: `${filename}` |
| `400` | { success: false, error } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/client-meetings/export/transcript`

#### `POST /api/client-meetings/export/transcript`

POST /api/client-meetings/export/transcript { id } — download one saved meeting transcript as a Word (.docx) document. Org-scoped. Mirrors the other client-meetings export routes (blob response the client saves via <a download>), but uses `docx` (not exceljs) since a transcript is prose, not a grid.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `clientMeetings.dashboard` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/client-meetings/export/transcript/route.ts](../app/api/client-meetings/export/transcript/route.ts) |

**Request body** — JSON, not validated by a Zod schema (see route).

**Responses**

| Status | Body |
|---|---|
| `200` | binary — `application/vnd.openxmlformats-officedocument.wordprocessingml.document`<br/>attachment: `${safeName}.docx` |
| `400` | { success: false, error } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/client-meetings/export/weekly`

#### `POST /api/client-meetings/export/weekly`

POST /api/client-meetings/export/weekly Body: { clientId, monthsBack? } Returns: xlsx blob with 9 metric rows (spec §7.10) × months + Total Avg.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `clientMeetings.dashboard` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/client-meetings/export/weekly/route.ts](../app/api/client-meetings/export/weekly/route.ts) |

**Request body** — JSON, not validated by a Zod schema (see route).

**Responses**

| Status | Body |
|---|---|
| `200` | binary — `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`<br/>attachment: `${filename}` |
| `400` | { success: false, error } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/client-meetings/export/weekly-detail`

#### `POST /api/client-meetings/export/weekly-detail`

POST /api/client-meetings/export/weekly-detail Body: { clientId: string, from: "YYYY-MM-DD", to: "YYYY-MM-DD" } Returns: xlsx blob — one row per weekly meeting in the date range, with Client Master roster size driving the Total / Present / Absent counts.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `clientMeetings.weeklyMeeting` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/client-meetings/export/weekly-detail/route.ts](../app/api/client-meetings/export/weekly-detail/route.ts) |

**Request body** — JSON, not validated by a Zod schema (see route).

**Responses**

| Status | Body |
|---|---|
| `200` | binary — `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`<br/>attachment: `${filename}` |
| `400` | { success: false, error } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/client-meetings/facts`

#### `GET /api/client-meetings/facts`

GET /api/client-meetings/facts?clientId&from&to[&cadence] Period-scoped facts, plus the deterministic figures derived from them. This is the endpoint report generators consume, and the reason the pipeline never re-reads a transcript: a week's adherence, quality mix, No-Stuck rates and recurring blockers all come from here, computed in TypeScript, for zero tokens. THE REPORTING WINDOW IS ENFORCED IN SQL. `from`/`to` bound `meetingDate` in the query itself, so a caller cannot reach outside its period. The client doc forbids the DH Weekly Report from comparing against previous weeks, and that rule is kept by making the data unreachable rather than by asking a prompt not to look at it. The range is capped at 400 days: long enough for an annual view, short enough that an unbounded query cannot pull an org's entire history in one request. See `docs/17-ai-meeting-rhythm-architecture.md` §D.9, §J, §G lever 3.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `clientMeetings.dashboard` — 404 when the org has the module disabled |
| **Permission** | `ClientMeetings.Report:view` |
| **Source** | [app/api/client-meetings/facts/route.ts](../app/api/client-meetings/facts/route.ts) |

**Validated query params** — `querySchema` (inline)

| Field | Type | Required |
|---|---|---|
| `clientId` | string — min 1 | ✓ |
| `from` | string | ✓ |
| `to` | string | ✓ |
| `cadence` | enum: DAILY \| WEEKLY |  |
| `summaryOnly` | boolean (coerced) |  |

- has cross-field `.refine()` rules

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: { client, period, coverage, adherence, recurringStucks, ...(summaryOnly ? {} : { facts }) } } |
| `400` | { success: false, error } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/client-meetings/members`

#### `GET /api/client-meetings/members`

GET /api/client-meetings/members ?includeDeleted=true → return ONLY soft-deleted rows (trash view) ?sortBy=<col>&sortOrder=<asc|desc> → server-side sort (whitelist enforced). Falls back to `createdAt desc` (newest first) when omitted/invalid.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `clientMeetings.members` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Source** | [app/api/client-meetings/members/route.ts](../app/api/client-meetings/members/route.ts) |

**Query** — `clientId`, `includeDeleted`, `memberId`, `search`

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: [...], meta: PaginationMeta }<br/>row shape inferred from `.map()` projection: `id`, `displayId`, `name`, `email`, `createdAt`, `updatedAt`, `createdBy`, `createdByName`, `createdByInitials`, `updatedBy`, `updatedByName`, `updatedByInitials` |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

#### `POST /api/client-meetings/members`

POST — create. Any tenant member.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `clientMeetings.members` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/client-meetings/members/route.ts](../app/api/client-meetings/members/route.ts) |

**Request body** — `createClientMemberSchema` (`lib/schemas/clientMeetingsSchema.ts`)

| Field | Type | Required |
|---|---|---|
| `name` | string — min 1 | ✓ |
| `email` | string — max 254, email | ✓ |

**Responses**

| Status | Body |
|---|---|
| `201` | { success: true, data: { id } } |
| `400` | { success: false, error } |
| `409` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/client-meetings/members/{id}`

#### `GET /api/client-meetings/members/{id}`

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `clientMeetings.members` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Source** | [app/api/client-meetings/members/[id]/route.ts](../app/api/client-meetings/members/[id]/route.ts) |

**Path params** — `id`

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: { id, name, email, createdAt, updatedAt } } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

#### `PUT /api/client-meetings/members/{id}`

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `clientMeetings.members` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/client-meetings/members/[id]/route.ts](../app/api/client-meetings/members/[id]/route.ts) |

**Path params** — `id`

**Request body** — `updateClientMemberSchema` (`lib/schemas/clientMeetingsSchema.ts`)

| Field | Type | Required |
|---|---|---|
| `name` | string — min 1 | ✓ |
| `email` | string — max 254, email | ✓ |

- derived from `createClientMemberSchema`
- all fields optional (`.partial()`)

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true } |
| `400` | { success: false, error } |
| `404` | { success: false, error } |
| `409` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

#### `DELETE /api/client-meetings/members/{id}`

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `clientMeetings.members` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/client-meetings/members/[id]/route.ts](../app/api/client-meetings/members/[id]/route.ts) |

**Path params** — `id`

**Request body** — JSON, not validated by a Zod schema (see route).

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/client-meetings/members/{id}/audit`

#### `GET /api/client-meetings/members/{id}/audit`

GET /api/client-meetings/members/[id]/audit — full Change History timeline for one Client Member. Reads the centralized AuditEvent + AuditChange tables, mirroring the other entities' audit routes.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `clientMeetings.members` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Source** | [app/api/client-meetings/members/[id]/audit/route.ts](../app/api/client-meetings/members/[id]/audit/route.ts) |

**Path params** — `id`

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data, meta }<br/>`data` — Prisma `auditEvent.findMany` result |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/client-meetings/members/{id}/logs`

#### `GET /api/client-meetings/members/{id}/logs`

GET /api/client-meetings/members/[id]/logs Read-only history of CREATE/UPDATE/DELETE audit events for one member. Mirrors the shape consumed by the Individual-KPI logs modal so the same component can render it.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `clientMeetings.members` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Source** | [app/api/client-meetings/members/[id]/logs/route.ts](../app/api/client-meetings/members/[id]/logs/route.ts) |

**Path params** — `id`

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/client-meetings/members/{id}/restore`

#### `POST /api/client-meetings/members/{id}/restore`

POST /api/client-meetings/members/[id]/restore — undo soft delete.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `clientMeetings.members` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/client-meetings/members/[id]/restore/route.ts](../app/api/client-meetings/members/[id]/restore/route.ts) |

**Path params** — `id`

**Request body** — JSON, not validated by a Zod schema (see route).

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/client-meetings/members/bulk-restore`

#### `POST /api/client-meetings/members/bulk-restore`

POST /api/client-meetings/members/bulk-restore — undo soft delete in bulk.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `clientMeetings.members` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/client-meetings/members/bulk-restore/route.ts](../app/api/client-meetings/members/bulk-restore/route.ts) |

**Request body** — JSON, not validated by a Zod schema (see route).

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: { restored } } |
| `400` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/client-meetings/members/reorder`

#### `POST /api/client-meetings/members/reorder`

POST /api/client-meetings/members/reorder — move a ClientMember row.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `clientMeetings.members` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/client-meetings/members/reorder/route.ts](../app/api/client-meetings/members/reorder/route.ts) |

**Request body** — `reorderRowSchema` (`lib/schemas/reorderSchema.ts`)

| Field | Type | Required |
|---|---|---|
| `id` | string — min 1 | ✓ |
| `beforeId` | string — min 1, nullable | ✓ |
| `afterId` | string — min 1, nullable | ✓ |

**Responses**

_Handler delegates to `handleReorder()`._

| Status | Body |
|---|---|
| `200` | { success: true, data: { id, position } } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/client-meetings/reports/metrics`

#### `GET /api/client-meetings/reports/metrics`

GET /api/client-meetings/reports/metrics?days=30[&clientId=…] Cost and cache observability for the AI meeting pipeline. WHY THIS EXISTS The whole architecture is built to avoid paying the model twice for the same work: extract once, cache the report, read from Postgres. None of that is trustworthy unless it is measured, and before this endpoint there was no token accounting for QuikScale's AI at all — `usageMetadata` was discarded on every call. The headline number is REPORT CACHE HIT RATE: the share of report views served from storage rather than regenerated. Target > 95%. If it falls, the fingerprint is too sensitive (see `lib/reports/fingerprint.ts`) or something is regenerating on a read path, and either is a live cost incident. This endpoint NEVER calls a model — it only aggregates `AiUsageLog`. See `docs/17-ai-meeting-rhythm-architecture.md` §O.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `clientMeetings.dashboard` — 404 when the org has the module disabled |
| **Permission** | `ClientMeetings.Report:view` |
| **Source** | [app/api/client-meetings/reports/metrics/route.ts](../app/api/client-meetings/reports/metrics/route.ts) |

**Validated query params** — `querySchema` (inline)

| Field | Type | Required |
|---|---|---|
| `days` | number (coerced) — min 1, max 365, default 30 |  |
| `clientId` | string — min 1 |  |

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: { window, cache, tokens, cost, calls, health, jobs, rateLimiter } } |
| `400` | { success: false, error } |
| `403` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/client-meetings/reports/monthly`

#### `GET /api/client-meetings/reports/monthly`

GET /api/client-meetings/reports/monthly?clientId=…&period=yyyy-mm Returns the saved Monthly Report, or `report: null` when none exists. **ZERO model calls. ZERO transcript reads.** This is the read path the whole architecture is built around: a month costs ~5k tokens to GENERATE once, and nothing at all to view, however many times it is opened. See `docs/17-ai-meeting-rhythm-architecture.md` section H.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `clientMeetings.dashboard` — 404 when the org has the module disabled |
| **Permission** | `ClientMeetings.Report:view` |
| **Source** | [app/api/client-meetings/reports/monthly/route.ts](../app/api/client-meetings/reports/monthly/route.ts) |

**Validated query params** — `querySchema` (inline)

| Field | Type | Required |
|---|---|---|
| `clientId` | string — min 1 | ✓ |
| `period` | string | ✓ |

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: { client, period, report, metrics, validation, confidence, generatedAt, generatedBy, validatedAt, validatedBy, version, missingSources, sourceReportIds, canEdit, canGenerate } } |
| `400` | { success: false, error } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

#### `PUT /api/client-meetings/reports/monthly`

PUT /api/client-meetings/reports/monthly Sign-off, and only sign-off. The report body is not editable through this route: every figure in a monthly report is computed from the weekly snapshots, so an edited number would no longer match the weeks it came from. Regeneration is the way to change a monthly report. PERMISSION — `ClientMeetings.Report: update`, the same gate as generating.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `clientMeetings.dashboard` — 404 when the org has the module disabled |
| **Permission** | `ClientMeetings.Report:update` |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/client-meetings/reports/monthly/route.ts](../app/api/client-meetings/reports/monthly/route.ts) |

**Request body** — `validateSchema` (inline)

| Field | Type | Required |
|---|---|---|
| `clientId` | string — min 1 | ✓ |
| `period` | string | ✓ |
| `validated` | boolean | ✓ |

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data } |
| `400` | { success: false, error } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

#### `DELETE /api/client-meetings/reports/monthly`

DELETE /api/client-meetings/reports/monthly?clientId=…&period=yyyy-mm Soft-delete the Monthly Report for one client-month. The weekly rollups and weekly meeting reports it trends are untouched — this is the cheapest report in the system to rebuild (one ~5k-token call over already-computed metrics), so deleting it discards a summary, never data. A signed-off report requires `confirmValidated: true`. PERMISSION — `ClientMeetings.Report: delete`.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `clientMeetings.dashboard` — 404 when the org has the module disabled |
| **Permission** | `ClientMeetings.Report:delete` |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/client-meetings/reports/monthly/route.ts](../app/api/client-meetings/reports/monthly/route.ts) |

**Validated query params** — `querySchema` (inline)

| Field | Type | Required |
|---|---|---|
| `clientId` | string — min 1 | ✓ |
| `period` | string | ✓ |

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: { id } } |
| `400` | { success: false, error } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/client-meetings/reports/monthly/coverage`

#### `GET /api/client-meetings/reports/monthly/coverage`

GET /api/client-meetings/reports/monthly/coverage?clientId=…&period=yyyy-mm Which weeks of the month already have a Daily Huddle Weekly Report, before anyone spends anything on generating the month. WHY THIS IS A SEPARATE ROUTE The monthly report's `missingWeeks` only exists AFTER a generation. Showing coverage only in hindsight means a facilitator finds out a month was built from two of five weeks once it is already written and paid for. This answers the same question up front, from one indexed read of the weekly report table — no context load, no facts, and certainly no model. The week list is produced by the same `weeksInMonth` helper the monthly report uses, so what this screen counts and what the report counts cannot drift apart.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `clientMeetings.dashboard` — 404 when the org has the module disabled |
| **Permission** | `ClientMeetings.Report:view` |
| **Source** | [app/api/client-meetings/reports/monthly/coverage/route.ts](../app/api/client-meetings/reports/monthly/coverage/route.ts) |

**Validated query params** — `querySchema` (inline)

| Field | Type | Required |
|---|---|---|
| `clientId` | string — min 1 | ✓ |
| `period` | string | ✓ |

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: { client, period, weeks, weeksTotal, weeksReported } } |
| `400` | { success: false, error } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/client-meetings/reports/monthly/export`

#### `POST /api/client-meetings/reports/monthly/export`

POST /api/client-meetings/reports/monthly/export { clientId, period } Download the saved Monthly Report as a Word (.docx) document. READ FROM STORAGE, NEVER FROM THE REQUEST BODY. A caller cannot post arbitrary content and have the server hand it back as an official-looking deliverable — the download can only ever contain what was generated and validated. This mirrors the weekly export deliberately. **No model is called.** Exporting a report costs nothing, however many times it is downloaded.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `clientMeetings.dashboard` — 404 when the org has the module disabled |
| **Permission** | `ClientMeetings.Report:view` |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/client-meetings/reports/monthly/export/route.ts](../app/api/client-meetings/reports/monthly/export/route.ts) |

**Request body** — `bodySchema` (inline)

| Field | Type | Required |
|---|---|---|
| `clientId` | string — min 1 | ✓ |
| `period` | string | ✓ |

**Request body** — `storedMonthlyReportSchema` (`lib/reports/monthlyCompose.ts`)

| Field | Type | Required |
|---|---|---|
| `reportType` | literal "MONTHLY" | ✓ |
| `clientName` | string | ✓ |
| `period` | string | ✓ |
| `periodLabel` | string | ✓ |
| `overallConfidence` | number | ✓ |
| `coverage` | string[] | ✓ |
| `trends` | array | ✓ |
| `materialTrends` | string[] | ✓ |
| `www` | object — nullable | ✓ |
| `recurringStucks` | object[] — nullable | ✓ |
| `noStuckOutliers` | object[] | ✓ |
| `keyObservations` | string[] | ✓ |
| `wwwObservation` | string — nullable | ✓ |
| `recommendations` | string[] | ✓ |

**Responses**

| Status | Body |
|---|---|
| `200` | binary — `application/vnd.openxmlformats-officedocument.wordprocessingml.document`<br/>attachment: `${safeName}.docx` |
| `400` | { success: false, error } |
| `404` | { success: false, error } |
| `422` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/client-meetings/reports/monthly/generate`

#### `POST /api/client-meetings/reports/monthly/generate`

POST /api/client-meetings/reports/monthly/generate Build and persist the Monthly Report for one client-month. THE CHEAPEST REPORT IN THE SYSTEM A month is roughly 20 daily huddles and 4 weekly meetings — about 1.4M tokens of transcript. This reads four `ClientDailyHuddleWeeklyReport.metrics` snapshots, the WWW lifecycle and SQL aggregates over the fact layer, then makes ONE model call over the resulting tables: ~5k tokens. Every number in the report is computed here in TypeScript. The model contributes observations and recommendations only — it never produces a figure, and the prompt says so explicitly. CACHED. A stored report whose sources have not been regenerated is returned as-is, with no model call at all, unless `force` is set. PERMISSION — `ClientMeetings.Report: update`. Generating spends money and overwrites the stored row, clearing any sign-off.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `clientMeetings.dashboard` — 404 when the org has the module disabled |
| **Permission** | `ClientMeetings.Report:update` |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/client-meetings/reports/monthly/generate/route.ts](../app/api/client-meetings/reports/monthly/generate/route.ts) |

**Request body** — `bodySchema` (inline)

| Field | Type | Required |
|---|---|---|
| `clientId` | string — min 1 | ✓ |
| `period` | string | ✓ |
| `force` | boolean |  |

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: { noData, weeks, message } } |
| `200` | { success: true, data: { report, metrics, version, cacheHit, tokensSpent } } |
| `200` | { success: true, data: { aiUnavailable } } |
| `200` | { success: true, data: { reportError } } |
| `200` | { success: true, data: { report, metrics, version, cacheHit, generatedAt, missingWeeks, tokensSpent, costUsd } } |
| `400` | { success: false, error } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/client-meetings/reports/week-rollup`

#### `GET /api/client-meetings/reports/week-rollup`

GET /api/client-meetings/reports/week-rollup?clientId=…&weekStart=yyyy-mm-dd Returns the saved Week Rollup, or `report: null` when none exists. **ZERO model calls. ZERO transcript reads. ZERO fact reads.** Generating a week costs one small analysis pass over stored digests; viewing it costs nothing, however many times it is opened. Staleness is reported, never acted on — auto-regenerating on read is the token bomb doc 17 §L exists to prevent, and it would silently invalidate a sign-off.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `clientMeetings.dashboard` — 404 when the org has the module disabled |
| **Permission** | `ClientMeetings.Report:view` |
| **Source** | [app/api/client-meetings/reports/week-rollup/route.ts](../app/api/client-meetings/reports/week-rollup/route.ts) |

**Validated query params** — `querySchema` (inline)

| Field | Type | Required |
|---|---|---|
| `clientId` | string — min 1 | ✓ |
| `weekStart` | string | ✓ |

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: { client, weekStart, report, metrics, validation, confidence, missingSources, sourceReportIds, generatedAt, generatedBy, validatedAt, validatedBy, version, stale, staleReasons, canEdit, canGenerate } } |
| `400` | { success: false, error } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

#### `PUT /api/client-meetings/reports/week-rollup`

PUT /api/client-meetings/reports/week-rollup Sign-off, and only sign-off. Every figure in a rollup is computed from the reports beneath it, so an edited number would no longer match its sources — regeneration is the way to change a rollup.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `clientMeetings.dashboard` — 404 when the org has the module disabled |
| **Permission** | `ClientMeetings.Report:update` |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/client-meetings/reports/week-rollup/route.ts](../app/api/client-meetings/reports/week-rollup/route.ts) |

**Request body** — `validateSchema` (inline)

| Field | Type | Required |
|---|---|---|
| `clientId` | string — min 1 | ✓ |
| `weekStart` | string | ✓ |
| `validated` | boolean | ✓ |

- derived from `querySchema`.extend()

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data } |
| `400` | { success: false, error } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

#### `DELETE /api/client-meetings/reports/week-rollup`

DELETE /api/client-meetings/reports/week-rollup?clientId=…&weekStart=… Soft-delete the rollup. The reports it was built from are untouched — this is the cheapest artefact in the system to rebuild (one small call over digests that already exist), so deleting it discards a summary, never data. A signed-off rollup requires `confirmValidated: true`. PERMISSION — `ClientMeetings.Report: delete`.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `clientMeetings.dashboard` — 404 when the org has the module disabled |
| **Permission** | `ClientMeetings.Report:delete` |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/client-meetings/reports/week-rollup/route.ts](../app/api/client-meetings/reports/week-rollup/route.ts) |

**Validated query params** — `querySchema` (inline)

| Field | Type | Required |
|---|---|---|
| `clientId` | string — min 1 | ✓ |
| `weekStart` | string | ✓ |

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: { id } } |
| `400` | { success: false, error } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/client-meetings/reports/week-rollup/export`

#### `POST /api/client-meetings/reports/week-rollup/export`

POST /api/client-meetings/reports/week-rollup/export { clientId, weekStart } Download the saved Week Rollup as a Word (.docx) document. READ FROM STORAGE, NEVER FROM THE REQUEST BODY. A caller cannot post arbitrary content and have the server hand it back as an official-looking deliverable. **No model is called.** Exporting costs nothing, however many times it happens.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `clientMeetings.dashboard` — 404 when the org has the module disabled |
| **Permission** | `ClientMeetings.Report:view` |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/client-meetings/reports/week-rollup/export/route.ts](../app/api/client-meetings/reports/week-rollup/export/route.ts) |

**Request body** — `bodySchema` (inline)

| Field | Type | Required |
|---|---|---|
| `clientId` | string — min 1 | ✓ |
| `weekStart` | string | ✓ |

**Request body** — `storedWeekRollupReportSchema` (`lib/reports/weekRollupCompose.ts`)

| Field | Type | Required |
|---|---|---|
| `reportType` | literal "WEEK_ROLLUP" | ✓ |
| `clientName` | string | ✓ |
| `weekStart` | string | ✓ |
| `weekEnd` | string | ✓ |
| `label` | string | ✓ |
| `overallConfidence` | number | ✓ |
| `coverage` | string[] | ✓ |
| `sources` | object[] | ✓ |
| `trends` | array | ✓ |
| `materialTrends` | string[] | ✓ |
| `blockers` | object[] — nullable | ✓ |
| `www` | object — nullable | ✓ |
| `topics` | string[] | ✓ |
| `weekSummary` | string | ✓ |
| `keyObservations` | string[] | ✓ |
| `blockerObservation` | string — nullable | ✓ |
| `wwwObservation` | string — nullable | ✓ |
| `recommendations` | string[] | ✓ |

**Responses**

| Status | Body |
|---|---|
| `200` | binary — `application/vnd.openxmlformats-officedocument.wordprocessingml.document`<br/>attachment: `${safeName}.docx` |
| `400` | { success: false, error } |
| `404` | { success: false, error } |
| `422` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/client-meetings/reports/week-rollup/generate`

#### `POST /api/client-meetings/reports/week-rollup/generate`

POST /api/client-meetings/reports/week-rollup/generate Build and persist the cross-meeting Week Rollup for one client-week. THE ONLY VIEW THAT SPANS BOTH RHYTHMS The daily-huddle report sees only huddles; the weekly-meeting report sees only one meeting. A blocker raised in Tuesday's huddle and again in Thursday's weekly meeting is invisible in both — and is exactly what this rollup surfaces. IT READS REPORTS, NOT FACTS. Every input is a stored `metrics` or `factSet` column (doc 17 §R2), so the cost is the number of source reports rather than the number of facts — the same property that makes the monthly report cheap. CACHED on `(sourceFingerprint, promptVersion, schemaVersion)`. PERMISSION — `ClientMeetings.Report: update`. Generating spends money and overwrites the stored row, clearing any sign-off.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `clientMeetings.dashboard` — 404 when the org has the module disabled |
| **Permission** | `ClientMeetings.Report:update` |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/client-meetings/reports/week-rollup/generate/route.ts](../app/api/client-meetings/reports/week-rollup/generate/route.ts) |

**Request body** — `bodySchema` (inline)

| Field | Type | Required |
|---|---|---|
| `clientId` | string — min 1 | ✓ |
| `weekStart` | string | ✓ |
| `force` | boolean |  |

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: { noData, weekStart, message } } |
| `200` | { success: true, data: { report, metrics, version, cacheHit, tokensSpent } } |
| `200` | { success: true, data: { aiUnavailable } } |
| `200` | { success: true, data: { reportError } } |
| `200` | { success: true, data: { report, metrics, version, cacheHit, generatedAt, missingSources, tokensSpent, costUsd } } |
| `400` | { success: false, error } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/client-meetings/reports/weekly`

#### `GET /api/client-meetings/reports/weekly`

GET /api/client-meetings/reports/weekly?clientId=…&weekStart=yyyy-mm-dd Returns the saved weekly report for a client-week (or `report: null`), plus the per-day `sources` list so the page can render the huddle checklist and show which days still need a daily report generated — one round trip for the whole screen. `weekStart` is snapped to the Monday of its ISO week, so any date in the week resolves to the same stored row.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `clientMeetings.dashboard` — 404 when the org has the module disabled |
| **Permission** | `ClientMeetings.Report:view` |
| **Source** | [app/api/client-meetings/reports/weekly/route.ts](../app/api/client-meetings/reports/weekly/route.ts) |

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: { report, metrics, validation, confidence, generatedAt, generatedBy, validatedAt, validatedBy, weekStart, weekEnd, rosterSize, sources, canEdit, version, coveragePct, cache } } |
| `400` | { success: false, error } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

#### `PUT /api/client-meetings/reports/weekly`

PUT /api/client-meetings/reports/weekly Persist an edited weekly report and/or its sign-off state. This is the edit gate — requires `ClientMeetings.Report` update. The metrics snapshot is recomputed from the submitted report rather than taken from the body, so a hand-edited report can never desync the flat numbers the Monthly Report will trend. The stored `validation` result is left as generated — re-running it belongs to the generate route, and a reviewer's edits are exactly what sign-off is for.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `clientMeetings.dashboard` — 404 when the org has the module disabled |
| **Permission** | `ClientMeetings.Report:update` |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/client-meetings/reports/weekly/route.ts](../app/api/client-meetings/reports/weekly/route.ts) |

**Request body** — `putSchema` (inline)

| Field | Type | Required |
|---|---|---|
| `clientId` | string — min 1 | ✓ |
| `weekStart` | string | ✓ |
| `report` | unknown | ✓ |
| `validated` | boolean |  |

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: { report, metrics, validatedAt, validatedBy } } |
| `400` | { success: false, error } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

#### `DELETE /api/client-meetings/reports/weekly`

DELETE /api/client-meetings/reports/weekly?clientId=…&weekStart=yyyy-mm-dd Soft-delete the Daily Huddle Weekly Report for one client-week. The per-day daily reports the rollup was built from are NOT touched: they belong to their transcripts, cost money to produce, and are what a regeneration reuses. Deleting the rollup throws away only the composed week-level document, so regenerating it costs one model call, not five. A signed-off week requires `confirmValidated: true` — see `deleteGuard`. PERMISSION — `ClientMeetings.Report: delete`.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `clientMeetings.dashboard` — 404 when the org has the module disabled |
| **Permission** | `ClientMeetings.Report:delete` |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/client-meetings/reports/weekly/route.ts](../app/api/client-meetings/reports/weekly/route.ts) |

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: { id } } |
| `400` | { success: false, error } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/client-meetings/reports/weekly-meeting`

#### `GET /api/client-meetings/reports/weekly-meeting`

GET /api/client-meetings/reports/weekly-meeting?weeklyMeetingId=… Returns the saved Weekly Meeting Report, or `report: null` when none exists. **ZERO model calls. ZERO transcript reads. ZERO chunking.** A three-hour meeting costs one extraction and one small analysis pass to GENERATE, and nothing at all to view, however many times it is opened. A test asserts the model mock is never invoked on this path. Staleness is REPORTED, never acted on: a report whose prompt or schema version has moved on is still served, with `stale: true` and the reasons, so the facilitator decides whether spending money is worth it. Auto-regenerating on read is the token bomb doc 17 §L exists to prevent — and it would silently invalidate a sign-off.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `clientMeetings.dashboard` — 404 when the org has the module disabled |
| **Permission** | `ClientMeetings.Report:view` |
| **Source** | [app/api/client-meetings/reports/weekly-meeting/route.ts](../app/api/client-meetings/reports/weekly-meeting/route.ts) |

**Validated query params** — `querySchema` (inline)

| Field | Type | Required |
|---|---|---|
| `weeklyMeetingId` | string — min 1 | ✓ |

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: { meeting, client, report, metrics, validation, confidence, completeness, coveragePct, processingLimitations, generatedAt, generatedBy, validatedAt, validatedBy, version, stale, staleReasons, canEdit, canGenerate, canValidate } } |
| `400` | { success: false, error } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

#### `PUT /api/client-meetings/reports/weekly-meeting`

PUT /api/client-meetings/reports/weekly-meeting Sign-off, and only sign-off. The report body is not editable through this route: every number in it is computed, so an edited figure would no longer match its evidence — regeneration is the way to change a report. A PARTIAL report is refused. `completeness` is set from extraction coverage, so this is the gate that stops "92% of the meeting" being validated as if it were all of it.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `clientMeetings.dashboard` — 404 when the org has the module disabled |
| **Permission** | `ClientMeetings.Report:update` |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/client-meetings/reports/weekly-meeting/route.ts](../app/api/client-meetings/reports/weekly-meeting/route.ts) |

**Request body** — `validateSchema` (inline)

| Field | Type | Required |
|---|---|---|
| `weeklyMeetingId` | string — min 1 | ✓ |
| `validated` | boolean | ✓ |

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data } |
| `400` | { success: false, error } |
| `404` | { success: false, error } |
| `409` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

#### `DELETE /api/client-meetings/reports/weekly-meeting`

DELETE /api/client-meetings/reports/weekly-meeting?weeklyMeetingId=… Soft-delete the Weekly Meeting Report. The extracted facts and segments the report was computed from stay exactly where they are: extraction is the expensive half of the pipeline (a three-hour meeting is chunked and read once), and a regeneration reuses it for a single small model call. Deleting the report therefore costs nothing to undo by regenerating. A signed-off report requires `confirmValidated: true`. PERMISSION — `ClientMeetings.Report: delete`.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `clientMeetings.dashboard` — 404 when the org has the module disabled |
| **Permission** | `ClientMeetings.Report:delete` |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/client-meetings/reports/weekly-meeting/route.ts](../app/api/client-meetings/reports/weekly-meeting/route.ts) |

**Validated query params** — `querySchema` (inline)

| Field | Type | Required |
|---|---|---|
| `weeklyMeetingId` | string — min 1 | ✓ |

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: { id } } |
| `400` | { success: false, error } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/client-meetings/reports/weekly-meeting/export`

#### `POST /api/client-meetings/reports/weekly-meeting/export`

POST /api/client-meetings/reports/weekly-meeting/export { weeklyMeetingId } Download the saved Weekly Meeting Report as a Word (.docx) document. READ FROM STORAGE, NEVER FROM THE REQUEST BODY. A caller cannot post arbitrary content and have the server hand it back as an official-looking deliverable — the download can only ever contain what was generated. **No model is called.** Exporting costs nothing, however many times it happens.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `clientMeetings.dashboard` — 404 when the org has the module disabled |
| **Permission** | `ClientMeetings.Report:view` |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/client-meetings/reports/weekly-meeting/export/route.ts](../app/api/client-meetings/reports/weekly-meeting/export/route.ts) |

**Request body** — `bodySchema` (inline)

| Field | Type | Required |
|---|---|---|
| `weeklyMeetingId` | string — min 1 | ✓ |

**Request body** — `storedWmReportSchema` (`lib/reports/wmCompose.ts`)

| Field | Type | Required |
|---|---|---|
| `reportType` | literal "WEEKLY_MEETING" | ✓ |
| `clientName` | string | ✓ |
| `meetingDate` | string | ✓ |
| `callHeld` | boolean | ✓ |
| `callStatus` | string | ✓ |
| `overallConfidence` | number | ✓ |
| `coverage` | enum: COMPLETE \| PARTIAL — nullable | ✓ |
| `reduction` | string[] — nullable | ✓ |
| `attendance` | object — nullable | ✓ |
| `agenda` | object — nullable | ✓ |
| `kpDashboard` | object[] — nullable | ✓ |
| `gaps` | object[] — nullable, default null |  |
| `wwwReview` | unknown | ✓ |
| `newWww` | unknown | ✓ |
| `discussions` | record[] | ✓ |
| `scorecard` | object | ✓ |
| `meetingSummary` | string | ✓ |
| `keyObservations` | string[] | ✓ |
| `recommendations` | string[] | ✓ |

**Responses**

| Status | Body |
|---|---|
| `200` | binary — `application/vnd.openxmlformats-officedocument.wordprocessingml.document`<br/>attachment: `${safeName}.docx` |
| `400` | { success: false, error } |
| `404` | { success: false, error } |
| `422` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/client-meetings/reports/weekly-meeting/generate`

#### `POST /api/client-meetings/reports/weekly-meeting/generate`

POST /api/client-meetings/reports/weekly-meeting/generate Build and persist the Weekly Meeting Report for one meeting. THE TRANSCRIPT IS NEVER READ HERE A weekly meeting runs three to six hours. Extraction (P5) already turned it into facts; this route reads those rows, computes every number in TypeScript, and makes ONE model call over the finished tables. The prompt is the same ~3k tokens whether the meeting ran ninety minutes or eight. CACHED on `(sourceFingerprint, promptVersion, schemaVersion)`. All three matching means nothing has changed, so nothing is spent. PARTIAL COVERAGE IS REPORTED, NOT HIDDEN. When extraction did not read the whole meeting the report is marked PARTIAL, names the exact windows it missed, and cannot be signed off. PERMISSION — `ClientMeetings.Report: update`. Generating spends money and overwrites the stored row, clearing any sign-off.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `clientMeetings.dashboard` — 404 when the org has the module disabled |
| **Permission** | `ClientMeetings.Report:update` |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/client-meetings/reports/weekly-meeting/generate/route.ts](../app/api/client-meetings/reports/weekly-meeting/generate/route.ts) |

**Request body** — `bodySchema` (inline)

| Field | Type | Required |
|---|---|---|
| `weeklyMeetingId` | string — min 1 | ✓ |
| `force` | boolean |  |

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: { report, metrics, version, completeness, cacheHit, tokensSpent } } |
| `200` | { success: true, data: { aiUnavailable } } |
| `200` | { success: true, data: { reportError } } |
| `200` | { success: true, data: { report, metrics, version, completeness, coveragePct, missingWindows, cacheHit, generatedAt, tokensSpent, costUsd } } |
| `202` | { success: true, data: { pending, runId, status, message } } |
| `400` | { success: false, error } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/client-meetings/reports/weekly/export`

#### `POST /api/client-meetings/reports/weekly/export`

POST /api/client-meetings/reports/weekly/export { clientId, weekStart } Download the saved Daily Huddle Weekly Report as a Word (.docx) document. The report is read from storage rather than accepted in the request body, so the download can only ever contain what was generated and validated — a client cannot post arbitrary content and have the server hand it back as an official-looking deliverable.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `clientMeetings.dashboard` — 404 when the org has the module disabled |
| **Permission** | `ClientMeetings.Report:view` |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/client-meetings/reports/weekly/export/route.ts](../app/api/client-meetings/reports/weekly/export/route.ts) |

**Request body** — `bodySchema` (inline)

| Field | Type | Required |
|---|---|---|
| `clientId` | string — min 1 | ✓ |
| `weekStart` | string | ✓ |

**Request body** — `storedWeeklyReportSchema` (`lib/ai/weeklyHuddleCompose.ts`)

| Field | Type | Required |
|---|---|---|
| `reportType` | literal "DH_WEEKLY" | ✓ |
| `title` | string | ✓ |
| `clientName` | string | ✓ |
| `weekStart` | string | ✓ |
| `weekEnd` | string | ✓ |
| `weekLabel` | string | ✓ |
| `overallConfidence` | number | ✓ |
| `meetingDetails` | object — nullable | ✓ |
| `executive` | string[] — nullable | ✓ |
| `attendance` | unknown | ✓ |
| `heatMap` | unknown | ✓ |
| `stucks` | enum: OPEN \| IN_PROGRESS \| RESOLVED | ✓ |
| `facilitatorObservations` | object | ✓ |
| `wwwSuggestions` | array | ✓ |
| `sourceDays` | object[] — nullable | ✓ |

**Responses**

| Status | Body |
|---|---|
| `200` | binary — `application/vnd.openxmlformats-officedocument.wordprocessingml.document`<br/>attachment: `${safeName}.docx` |
| `400` | { success: false, error } |
| `404` | { success: false, error } |
| `422` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/client-meetings/reports/weekly/generate`

#### `POST /api/client-meetings/reports/weekly/generate`

POST /api/client-meetings/reports/weekly/generate Build and persist the Daily Huddle Weekly Report for one client-week. Pipeline: 1. Load the week's huddles, roster and saved daily reports. 2. Backfill: for selected days with a transcript but no saved report, generate one. It is PERSISTED when the caller also holds `ClientMeetings.Report` update; otherwise it is used in-memory only and reported in `notes` — generating is never silently destructive. 3. Compute §4.1–§4.5A deterministically (no AI). 4. One AI pass for prose only, over the computed tables. 5. Validate, compose, and upsert. Responses (all 200 unless noted): { report, metrics, validation, … } — success { aiUnavailable: true } — every Gemini key failed { reportError: string } — model output unparseable { noData: true, sources } — nothing to aggregate PERMISSION — `ClientMeetings.Report: update`, not `view` (doc 17 D14). Generating spends money on the model AND overwrites the stored row for the week, clearing any facilitator sign-off. Both are writes in every sense that matters, so gating them on read access was wrong: a view-only user could run up cost and destroy a validated report. Viewing the result stays on `view`, via the sibling GET route, which never calls the model.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `clientMeetings.dashboard` — 404 when the org has the module disabled |
| **Permission** | `ClientMeetings.Report:update` |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/client-meetings/reports/weekly/generate/route.ts](../app/api/client-meetings/reports/weekly/generate/route.ts) |

**Request body** — `bodySchema` (inline)

| Field | Type | Required |
|---|---|---|
| `clientId` | string — min 1 | ✓ |
| `weekStart` | string | ✓ |
| `dates` | string[] |  |
| `backfillMissing` | boolean |  |

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: { noData, sources } } |
| `200` | { success: true, data: { aiUnavailable } } |
| `200` | { success: true, data: { reportError } } |
| `200` | { success: true, data: { report, metrics, validation, notes, generatedAt, canEdit, version, sourceFingerprint, coveragePct } } |
| `400` | { success: false, error } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/client-meetings/transcript-workflow-status`

#### `GET /api/client-meetings/transcript-workflow-status`

GET /api/client-meetings/transcript-workflow-status Tells the Meeting Rhythm dashboard whether an Active QuikFlow workflow triggers off a Fathom meeting event, so the "Export Transcript" button only shows once QuikFlow will actually produce a transcript to export. Workflow state lives in QuikFlow, so this proxies there with the shared secret. Always degrades to false — it must never break the dashboard.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `clientMeetings.dashboard` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Source** | [app/api/client-meetings/transcript-workflow-status/route.ts](../app/api/client-meetings/transcript-workflow-status/route.ts) |

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: { hasWorkflow } } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/client-meetings/transcripts`

#### `GET /api/client-meetings/transcripts`

GET /api/client-meetings/transcripts ?clientId=&type=DAILY|WEEKLY&date=YYYY-MM-DD (single-day) ?clientId=&type=WEEKLY&from=YYYY-MM-DD&to=YYYY-MM-DD (range: week / month) ?status=unassigned (Unassigned bucket) Returns saved Fathom meeting transcripts for the Export Transcript viewer. Org-scoped; soft-deletes excluded. Newest first.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `clientMeetings.dashboard` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Source** | [app/api/client-meetings/transcripts/route.ts](../app/api/client-meetings/transcripts/route.ts) |

**Query** — `clientId`, `date`, `from`, `status`, `to`, `type`

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data }<br/>`data` inferred from `.map()` projection: `...r`, `clientName`, `client` |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/client-meetings/transcripts/{id}`

#### `DELETE /api/client-meetings/transcripts/{id}`

DELETE /api/client-meetings/transcripts/[id] Soft-delete one meeting transcript — the row keeps its `rawText`, its extracted facts and any generated report, and simply stops being listed. SOFT, deliberately. A transcript is the evidence every downstream number is traceable to: the daily report quotes it, the weekly rollup aggregates those reports, and the monthly report trends the rollups. Hard-deleting one would leave signed-off reports citing evidence that no longer exists, and re-import from Fathom is not always possible. `deletedAt` removes it from every read path (all of them already filter `deletedAt: null`) while keeping the audit trail whole and a restore route cheap to add later. PERMISSION — `ClientMeetings.Report: delete`. Body (optional): `{ reason?: string }` — shown in the audit timeline.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `clientMeetings.dashboard` — 404 when the org has the module disabled |
| **Permission** | `ClientMeetings.Report:delete` |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/client-meetings/transcripts/[id]/route.ts](../app/api/client-meetings/transcripts/[id]/route.ts) |

**Path params** — `id`

**Request body** — JSON, not validated by a Zod schema (see route).

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: { id, hadReport } } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/client-meetings/transcripts/{id}/chunk-plan`

#### `GET /api/client-meetings/transcripts/{id}/chunk-plan`

GET /api/client-meetings/transcripts/[id]/chunk-plan The chunk plan for a transcript: how it would be split, what each chunk costs, and how much of the meeting is covered — **computed without writing anything and without calling a model**. This is the Phase 1 deliverable in one endpoint. Point it at any transcript, including a 6-hour Weekly Meeting, and it answers "what will extraction actually do, and what will it cost?" before a single token is spent. It also makes today's defect visible and measurable: `lib/ai/meetingReport.ts` truncates at `RAW_TEXT_CAP = 60_000` characters — about 65 minutes of speech — so a 4-hour meeting currently loses roughly three quarters of its content with no marker in the output. Compare `contentTokens` here against that cap to see exactly how much is being dropped for a given meeting. Read-only and side-effect free: `dryRun` is forced, so no run, segments or chunks are persisted. Use `POST .../prepare` to persist. See `docs/17-ai-meeting-rhythm-architecture.md` §D.2, §D.3.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `clientMeetings.dashboard` — 404 when the org has the module disabled |
| **Permission** | `ClientMeetings.Report:view` |
| **Source** | [app/api/client-meetings/transcripts/[id]/chunk-plan/route.ts](../app/api/client-meetings/transcripts/[id]/chunk-plan/route.ts) |

**Path params** — `id`

**Validated query params** — `querySchema` (inline)

| Field | Type | Required |
|---|---|---|
| `softTargetTokens` | number (coerced) — min 500, max 100 |  |
| `hardMaxTokens` | number (coerced) — min 500, max 200 |  |
| `overlapMs` | number (coerced) — min 0, max 600 |  |
| `chairSpeaker` | string — min 1, max 120 |  |

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: { transcriptId, idempotencyKey, summary, normalization, chunks } } |
| `400` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/client-meetings/transcripts/{id}/extract`

#### `POST /api/client-meetings/transcripts/{id}/extract`

POST /api/client-meetings/transcripts/[id]/extract Prepare (if needed) and extract facts from a transcript. IDEMPOTENT. Preparation is keyed on the transcript plus every toolchain version, so calling this twice on unchanged input reuses the existing run; and within a run, COMPLETED chunks are never re-extracted. Re-running after a partial failure therefore costs only the chunks that actually failed — not the meeting. PARTIAL RESULTS ARE REPORTED, NOT HIDDEN. A chunk that fails permanently lowers coverage rather than failing the run. Coverage is time-weighted, and the response always carries `coveragePct` plus the exact `missingWindows`, so a caller can never mistake an incomplete extraction for a complete one. PERMISSION — `ClientMeetings.Report: update`. This spends money on the model and writes facts that reports are built from. See `docs/17-ai-meeting-rhythm-architecture.md` §D.5, §D.10, §J.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `clientMeetings.dashboard` — 404 when the org has the module disabled |
| **Permission** | `ClientMeetings.Report:update` |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/client-meetings/transcripts/[id]/extract/route.ts](../app/api/client-meetings/transcripts/[id]/extract/route.ts) |

**Path params** — `id`

**Request body** — `bodySchema` (inline)

| Field | Type | Required |
|---|---|---|
| `force` | boolean |  |
| `retryFailed` | boolean |  |
| `maxChunks` | number — min 1, max 200 |  |

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: { ...result, reusedPreparation, timingSource, minCoveragePct, reportable } } |
| `200` | { success: false, error, code } |
| `400` | { success: false, error } |
| `422` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/client-meetings/transcripts/{id}/facts`

#### `GET /api/client-meetings/transcripts/{id}/facts`

GET /api/client-meetings/transcripts/[id]/facts Everything extracted from one transcript, grouped by fact type, with the merge lineage that produced it. Reads only. **No model is called**, so inspecting what was extracted costs nothing — which is what makes this usable as a review surface rather than something to be careful about opening. The merge audit is included because a consolidated fact is the one most worth questioning: it asserts a recurrence, and a reviewer needs to see which rule decided that and whether a model was involved. See `docs/17-ai-meeting-rhythm-architecture.md` §D.7, §J.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `clientMeetings.dashboard` — 404 when the org has the module disabled |
| **Permission** | `ClientMeetings.Report:view` |
| **Source** | [app/api/client-meetings/transcripts/[id]/facts/route.ts](../app/api/client-meetings/transcripts/[id]/facts/route.ts) |

**Path params** — `id`

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: { transcript, run, coverage, facts, merges } } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/client-meetings/transcripts/{id}/new-www`

#### `GET /api/client-meetings/transcripts/{id}/new-www`

GET /api/client-meetings/transcripts/[id]/new-www Commitments made in THIS meeting that are not yet in the business record. Deliberately separate from WWW Review: that section looks backwards at items that already exist, this one answers "did we capture what we just committed to?". Merging them would blur exactly that question. Nothing is created here. These are candidates with their gaps named — `missingFields` says what a human must still supply, and a missing date is reported as missing rather than guessed. The requirement doc's example: *"Rahul will complete API integration"* with no date stated shows **When: Not specified** — not Friday. **No model is called.**

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `clientMeetings.dashboard` — 404 when the org has the module disabled |
| **Permission** | `ClientMeetings.Report:view` |
| **Source** | [app/api/client-meetings/transcripts/[id]/new-www/route.ts](../app/api/client-meetings/transcripts/[id]/new-www/route.ts) |

**Path params** — `id`

**Query** — `includeDismissed`

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: { transcriptId, clientId, ...result } } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

#### `POST /api/client-meetings/transcripts/{id}/new-www`

POST /api/client-meetings/transcripts/[id]/new-www Create a real WWW item from a candidate. DELEGATES TO `POST /api/www` RATHER THAN WRITING DIRECTLY. That route owns the Zod schema, the 409 duplicate guard, the `www.created` QuikFlow event, the audit trail and the assignment notification. A parallel insert here would silently skip every one of them, and the divergence would only surface later as "why didn't this WWW notify anyone?". PERMISSION — `ClientMeetings.Report: update` **AND** `WWW: create` (doc 17 D13). Creating from a report is both a report action and a WWW write, and holding one permission should not confer the other. The owner (`who`) is required in the body. The bridge resolves a speaker to a user, but rungs 3 and 4 need human confirmation, and this route does not accept a guess in place of a decision.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `clientMeetings.dashboard` — 404 when the org has the module disabled |
| **Permission** | `ClientMeetings.Report:update` |
| **Rate limit** | shared mutation bucket |
| **Headers read** | `cookie` |
| **Source** | [app/api/client-meetings/transcripts/[id]/new-www/route.ts](../app/api/client-meetings/transcripts/[id]/new-www/route.ts) |

**Path params** — `id`

**Request body** — `createSchema` (inline)

| Field | Type | Required |
|---|---|---|
| `factId` | string — min 1 | ✓ |
| `who` | string — min 1 | ✓ |
| `what` | string — min 1, max 1000 | ✓ |
| `when` | string |  |
| `dueDateTBD` | boolean |  |
| `category` | string — max 120, nullable |  |
| `notes` | string — max 5000, nullable |  |

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: { wwwItemId, alreadyCreated } } |
| `200` | { success: false, error } |
| `400` | { success: false, error } |
| `400` | { success: false, error, code } |
| `403` | { success: false, error } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/client-meetings/transcripts/{id}/prepare`

#### `POST /api/client-meetings/transcripts/{id}/prepare`

POST /api/client-meetings/transcripts/[id]/prepare Normalise a transcript into speaker turns, plan its chunks, and persist both under an idempotent extraction run. **Deterministic — no model is called, so this spends nothing.** Idempotent by construction: a second call with the same transcript and the same toolchain versions returns the existing run and rewrites nothing (`reused: true`). Rewriting would be actively harmful — segment ids are the evidence anchors that extracted facts cite, so they must stay stable. PERMISSION — `ClientMeetings.Report: update`, not `view`. Preparation writes segments, chunks and a run row, and can supersede a previous plan. It costs no tokens, but it is unambiguously a write. See `docs/17-ai-meeting-rhythm-architecture.md` §D.1, §D.8.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `clientMeetings.dashboard` — 404 when the org has the module disabled |
| **Permission** | `ClientMeetings.Report:update` |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/client-meetings/transcripts/[id]/prepare/route.ts](../app/api/client-meetings/transcripts/[id]/prepare/route.ts) |

**Path params** — `id`

**Request body** — `bodySchema` (inline)

| Field | Type | Required |
|---|---|---|
| `force` | boolean |  |
| `softTargetTokens` | number — min 500, max 100 |  |
| `hardMaxTokens` | number — min 500, max 200 |  |
| `overlapMs` | number — min 0, max 600 |  |
| `chairSpeaker` | string — min 1, max 120 |  |

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: { runId, reused, idempotencyKey, segments, chunks, contentTokens, promptTokens, overlapOverheadPct, durationMs, timingSource, degraded, normalization } } |
| `200` | { success: false, error, code } |
| `400` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/client-meetings/transcripts/{id}/report`

#### `GET /api/client-meetings/transcripts/{id}/report`

GET /api/client-meetings/transcripts/[id]/report Return the saved report for a transcript (or `report: null` if none saved yet), plus `canEdit` so the viewer knows whether to expose editing + Save. Requires `ClientMeetings.Report` view.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `clientMeetings.dashboard` — 404 when the org has the module disabled |
| **Permission** | `ClientMeetings.Report:view` |
| **Source** | [app/api/client-meetings/transcripts/[id]/report/route.ts](../app/api/client-meetings/transcripts/[id]/report/route.ts) |

**Path params** — `id`

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: { report, confidence, generatedAt, generatedBy, updatedAt, updatedBy, canEdit } } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

#### `PUT /api/client-meetings/transcripts/{id}/report`

PUT /api/client-meetings/transcripts/[id]/report Persist a (possibly edited) report. This is the "Edit Report" gate — requires `ClientMeetings.Report` update. Body: `{ report: StoredMeetingReport }`. Creating the accepted KPI/Priority/WWW records happens separately via the existing POST routes (so their own permissions + dedup + audit apply); this route only stores the report document, including the `createdRecordId` annotations the client sets on items it created.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `clientMeetings.dashboard` — 404 when the org has the module disabled |
| **Permission** | `ClientMeetings.Report:update` |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/client-meetings/transcripts/[id]/report/route.ts](../app/api/client-meetings/transcripts/[id]/report/route.ts) |

**Path params** — `id`

**Request body** — `storedMeetingReportSchema` (`lib/ai/meetingReport.ts`)

| Field | Type | Required |
|---|---|---|
| `kpis` | array | ✓ |
| `priorities` | array | ✓ |
| `wwws` | array | ✓ |

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: { report } } |
| `400` | { success: false, error } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

#### `DELETE /api/client-meetings/transcripts/{id}/report`

DELETE /api/client-meetings/transcripts/[id]/report Discard the generated report for a transcript, keeping the transcript itself. The report columns are cleared (`report`, confidence, generated/updated stamps) so the viewer falls back to "not generated yet" and the report can be regenerated from scratch. Deliberately does NOT touch extracted facts or segments — those are the expensive part of the pipeline and are reusable; only the composed document is thrown away. Any KPI / Priority / WWW records already created from this report are real records with their own lifecycle and are left alone. PERMISSION — `ClientMeetings.Report: delete`.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `clientMeetings.dashboard` — 404 when the org has the module disabled |
| **Permission** | `ClientMeetings.Report:delete` |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/client-meetings/transcripts/[id]/report/route.ts](../app/api/client-meetings/transcripts/[id]/report/route.ts) |

**Path params** — `id`

**Request body** — JSON, not validated by a Zod schema (see route).

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: { id } } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/client-meetings/transcripts/{id}/report/generate`

#### `POST /api/client-meetings/transcripts/{id}/report/generate`

POST /api/client-meetings/transcripts/[id]/report/generate Generate (do NOT persist) an AI meeting report for one transcript, with each extracted KPI/Priority/WWW candidate tagged against existing QuikScale records. Requires `ClientMeetings.Report` view. `canEdit` reflects whether the caller also has `update` (the Edit Report gate) so the UI knows whether to allow editing + Save. Responses (all 200): { report, canEdit } — generated report with duplicate tags { aiUnavailable: true } — every Gemini key failed { reportError: string } — model output could not be parsed

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `clientMeetings.dashboard` — 404 when the org has the module disabled |
| **Permission** | `ClientMeetings.Report:view` |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/client-meetings/transcripts/[id]/report/generate/route.ts](../app/api/client-meetings/transcripts/[id]/report/generate/route.ts) |

**Path params** — `id`

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: { aiUnavailable } } |
| `200` | { success: true, data: { reportError } } |
| `200` | { success: true, data: { report, canEdit } } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/client-meetings/transcripts/{id}/segments`

#### `GET /api/client-meetings/transcripts/{id}/segments`

GET /api/client-meetings/transcripts/[id]/segments?from&to&limit Paged access to a transcript's normalised speaker turns. This is the read side of the evidence anchor: every extracted fact cites `transcriptSegmentIds`, and this resolves those ids back to real text by primary key — no search, no model, no cost. It is what the evidence drawer calls when a reviewer asks "where did this claim come from?". Paged deliberately. A 6-hour meeting normalises to roughly 3,000 segments; returning them all would be a multi-megabyte response for a UI that shows a handful at a time. Every query is scoped by `orgId` AND `transcriptId`, so a segment id from another tenant resolves to nothing rather than to someone else's meeting. See `docs/17-ai-meeting-rhythm-architecture.md` §D.9, §E.3.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `clientMeetings.dashboard` — 404 when the org has the module disabled |
| **Permission** | `ClientMeetings.Report:view` |
| **Source** | [app/api/client-meetings/transcripts/[id]/segments/route.ts](../app/api/client-meetings/transcripts/[id]/segments/route.ts) |

**Path params** — `id`

**Validated query params** — `querySchema` (inline)

| Field | Type | Required |
|---|---|---|
| `from` | number (coerced) — min 0 |  |
| `to` | number (coerced) — min 0 |  |
| `limit` | number (coerced) — min 1, default 200 |  |
| `chunkIdx` | number (coerced) — min 0 |  |
| `runId` | string — min 1 |  |

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: { transcriptId, timingSource, total, returned, hasMore, nextFrom, segments } } |
| `400` | { success: false, error } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/client-meetings/transcripts/{id}/www-review`

#### `GET /api/client-meetings/transcripts/{id}/www-review`

GET /api/client-meetings/transcripts/[id]/www-review What happened to the commitments made in PREVIOUS meetings. Answers the requirement doc's question from the BUSINESS RECORD, not from this meeting's transcript: statuses come from `WWWItem` and `WWWStatusHistory`. Anything the meeting said about an item is attached as an annotation beside the stored status, never as a replacement — so when a coach says an item is done and the record disagrees, the report shows the discrepancy (`closureDisputed`) instead of quietly picking a side. Row-level visibility is enforced via `buildWwwScopeWhere`, the same helper `GET /api/www` uses. Without it this endpoint would be a way to read the whole org's action list through a report. `scopeLimited` tells the UI when a non-admin is seeing only their own items, so the section can say so rather than implying the team committed to this little. **No model is called.** See `docs/17-ai-meeting-rhythm-architecture.md` section I.3.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `clientMeetings.dashboard` — 404 when the org has the module disabled |
| **Permission** | `ClientMeetings.Report:view` |
| **Source** | [app/api/client-meetings/transcripts/[id]/www-review/route.ts](../app/api/client-meetings/transcripts/[id]/www-review/route.ts) |

**Path params** — `id`

**Validated query params** — `querySchema` (inline)

| Field | Type | Required |
|---|---|---|
| `periodStart` | string |  |
| `periodEnd` | string |  |
| `includeHistoricClosed` | boolean (coerced) |  |

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: { transcriptId, clientId, asOf, ...withEvidence } } |
| `400` | { success: false, error } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/client-meetings/transcripts/upload`

#### `POST /api/client-meetings/transcripts/upload`

POST /api/client-meetings/transcripts/upload — manually add a meeting transcript from a `.docx` file (multipart form: file, clientId, type, meetingDate, title?, attendeeIds?, startTime?, endTime?) when no Fathom recording exists for a meeting. The resulting row is a normal `ClientMeetingTranscript` (`source: "manual"`) so the existing viewer, export, and Gemini report-generation routes work on it unchanged. WHY `attendeeIds` MATTERS A `.docx` carries no participant list, so without this the attendance ladder has nothing but "who spoke" — and silence is not evidence of absence, so every quiet attendee lands on UNKNOWN and no absentee is ever named. A human ticking who attended is the strongest signal there is: it is authoritative in BOTH directions (`attendeesSource: "manual"`), so anyone on the roster and not on the list reads ABSENT. That is what puts absentees back in the report. It stays OPTIONAL. Omitting it reproduces the old behaviour exactly — the list is then empty, `attendeesSource` is null, and the ladder falls back to transcript evidence — so an integration that only posts a file still works.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `clientMeetings.dashboard` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/client-meetings/transcripts/upload/route.ts](../app/api/client-meetings/transcripts/upload/route.ts) |

**Request body** — JSON, not validated by a Zod schema (see route).

**Responses**

| Status | Body |
|---|---|
| `201` | { success: true, data: { ...row, clientName } } |
| `400` | { success: false, error } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/client-meetings/weekly-meetings`

#### `GET /api/client-meetings/weekly-meetings`

GET /api/client-meetings/weekly-meetings?clientId=&from=&to=&includeDeleted= &sortBy=<col>&sortOrder=<asc|desc> Ordered newest first by default. By default soft-deleted rows are hidden. When `includeDeleted=true` ONLY soft-deleted rows are returned — trash view. `sortBy` is whitelist-enforced; unknown keys fall through to the legacy `meetingDate desc` order.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `clientMeetings.weeklyMeeting` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Source** | [app/api/client-meetings/weekly-meetings/route.ts](../app/api/client-meetings/weekly-meetings/route.ts) |

**Query** — `clientId`, `from`, `includeDeleted`, `search`, `status`, `to`

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: [...], meta: PaginationMeta }<br/>row shape inferred from `.map()` projection: `id`, `clientId`, `clientName`, `meetingDate`, `callStatus`, `callStatusOther`, `actualStartTime`, `actualEndTime`, `segmentTime1`, `segmentTime2`, `segmentTime3`, `segmentTime4`, `segmentTime5`, `segmentTime6`, `segmentTime7`, `punctualityOverride`, `goodNewsSharing`, `kpDashboard`, `gaps`, `www`, `feedback`, `collectiveIntelligence`, `opspReview`, `notesKPDashboard`, `otherNotes`, `absentUserIds`, `dashboardNAUserIds`, `absentClientMemberIds`, `absentClientMemberNames`, `dashboardNAClientMemberIds`, `dashboardNAClientMemberNames`, `createdAt`, `updatedAt`, `createdBy`, `createdByName`, `createdByInitials`, `updatedBy`, `updatedByName`, `updatedByInitials` |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

#### `POST /api/client-meetings/weekly-meetings`

POST — create weekly meeting with absence + dashboardNA links + per-member scores.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `clientMeetings.weeklyMeeting` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/client-meetings/weekly-meetings/route.ts](../app/api/client-meetings/weekly-meetings/route.ts) |

**Request body** — `createWeeklyMeetingSchema` (`lib/schemas/clientMeetingsSchema.ts`)

| Field | Type | Required |
|---|---|---|
| `clientId` | string — min 1 | ✓ |
| `meetingDate` | string | ✓ |
| `callStatus` | unknown — default "HELD" |  |
| `callStatusOther` | string — max 200, nullable |  |
| `actualStartTime` | string — nullable |  |
| `actualEndTime` | string — nullable |  |
| `segmentTime1` | string — nullable |  |
| `segmentTime2` | string — nullable |  |
| `segmentTime3` | string — nullable |  |
| `segmentTime4` | string — nullable |  |
| `segmentTime5` | string — nullable |  |
| `segmentTime6` | string — nullable |  |
| `segmentTime7` | string — nullable |  |
| `punctualityOverride` | unknown — default "NA" |  |
| `goodNewsSharing` | unknown — default "NA" |  |
| `kpDashboard` | unknown — default "NA" |  |
| `gaps` | unknown — default "NA" |  |
| `www` | unknown — default "NA" |  |
| `feedback` | unknown — default "NA" |  |
| `collectiveIntelligence` | unknown — default "NA" |  |
| `opspReview` | unknown — default "NA" |  |
| `notesKPDashboard` | string — nullable |  |
| `otherNotes` | string — nullable |  |
| `absentUserIds` | string[] — default [] |  |
| `dashboardNAUserIds` | string[] — default [] |  |
| `absentClientMemberIds` | string[] — default [] |  |
| `dashboardNAClientMemberIds` | string[] — default [] |  |

- has cross-field `.refine()` rules

**Responses**

| Status | Body |
|---|---|
| `201` | { success: true, data: { id } } |
| `400` | { success: false, error } |
| `404` | { success: false, error } |
| `409` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/client-meetings/weekly-meetings/{id}`

#### `GET /api/client-meetings/weekly-meetings/{id}`

Project a meeting record + its member-id arrays into the audited shape.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `clientMeetings.weeklyMeeting` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Source** | [app/api/client-meetings/weekly-meetings/[id]/route.ts](../app/api/client-meetings/weekly-meetings/[id]/route.ts) |

**Path params** — `id`

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: { ...row, meetingDate, absentUserIds, dashboardNAUserIds, absentClientMemberIds, dashboardNAClientMemberIds, memberScores } } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

#### `PUT /api/client-meetings/weekly-meetings/{id}`

PUT — replaces absence + dashboardNA links atomically.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `clientMeetings.weeklyMeeting` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/client-meetings/weekly-meetings/[id]/route.ts](../app/api/client-meetings/weekly-meetings/[id]/route.ts) |

**Path params** — `id`

**Request body** — `updateWeeklyMeetingSchema` (`lib/schemas/clientMeetingsSchema.ts`)

| Field | Type | Required |
|---|---|---|
| `clientId` | string — min 1 |  |
| `meetingDate` | string |  |
| `callStatus` | unknown — default "HELD" |  |
| `callStatusOther` | string — max 200, nullable |  |
| `actualStartTime` | string — nullable |  |
| `actualEndTime` | string — nullable |  |
| `segmentTime1` | string — nullable |  |
| `segmentTime2` | string — nullable |  |
| `segmentTime3` | string — nullable |  |
| `segmentTime4` | string — nullable |  |
| `segmentTime5` | string — nullable |  |
| `segmentTime6` | string — nullable |  |
| `segmentTime7` | string — nullable |  |
| `punctualityOverride` | unknown — default "NA" |  |
| `goodNewsSharing` | unknown — default "NA" |  |
| `kpDashboard` | unknown — default "NA" |  |
| `gaps` | unknown — default "NA" |  |
| `www` | unknown — default "NA" |  |
| `feedback` | unknown — default "NA" |  |
| `collectiveIntelligence` | unknown — default "NA" |  |
| `opspReview` | unknown — default "NA" |  |
| `notesKPDashboard` | string — nullable |  |
| `otherNotes` | string — nullable |  |
| `absentUserIds` | string[] — default [] |  |
| `dashboardNAUserIds` | string[] — default [] |  |
| `absentClientMemberIds` | string[] — default [] |  |
| `dashboardNAClientMemberIds` | string[] — default [] |  |

- all fields optional (`.partial()`)
- has cross-field `.refine()` rules

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true } |
| `400` | { success: false, error } |
| `404` | { success: false, error } |
| `409` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

#### `DELETE /api/client-meetings/weekly-meetings/{id}`

Project a meeting record + its member-id arrays into the audited shape.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `clientMeetings.weeklyMeeting` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/client-meetings/weekly-meetings/[id]/route.ts](../app/api/client-meetings/weekly-meetings/[id]/route.ts) |

**Path params** — `id`

**Request body** — JSON, not validated by a Zod schema (see route).

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/client-meetings/weekly-meetings/{id}/audit`

#### `GET /api/client-meetings/weekly-meetings/{id}/audit`

GET /api/client-meetings/weekly-meetings/[id]/audit — full Change History timeline for one Weekly Meeting. Reads the centralized AuditEvent + AuditChange tables, mirroring the other entities' audit routes.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `clientMeetings.weeklyMeeting` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Source** | [app/api/client-meetings/weekly-meetings/[id]/audit/route.ts](../app/api/client-meetings/weekly-meetings/[id]/audit/route.ts) |

**Path params** — `id`

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data, meta }<br/>`data` — Prisma `auditEvent.findMany` result |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/client-meetings/weekly-meetings/{id}/logs`

#### `GET /api/client-meetings/weekly-meetings/{id}/logs`

GET /api/client-meetings/weekly-meetings/[id]/logs — audit trail

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `clientMeetings.weeklyMeeting` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Source** | [app/api/client-meetings/weekly-meetings/[id]/logs/route.ts](../app/api/client-meetings/weekly-meetings/[id]/logs/route.ts) |

**Path params** — `id`

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/client-meetings/weekly-meetings/{id}/restore`

#### `POST /api/client-meetings/weekly-meetings/{id}/restore`

POST /api/client-meetings/weekly-meetings/[id]/restore — undo soft delete.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `clientMeetings.weeklyMeeting` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/client-meetings/weekly-meetings/[id]/restore/route.ts](../app/api/client-meetings/weekly-meetings/[id]/restore/route.ts) |

**Path params** — `id`

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/client-meetings/weekly-meetings/{id}/scores/{userId}`

#### `PATCH /api/client-meetings/weekly-meetings/{id}/scores/{userId}`

PATCH /api/client-meetings/weekly-meetings/[id]/scores/[userId] Upserts one member's scores. Used by the per-row "Update" button in the Update tab (image 1).

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `clientMeetings.weeklyMeeting` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/client-meetings/weekly-meetings/[id]/scores/[userId]/route.ts](../app/api/client-meetings/weekly-meetings/[id]/scores/[userId]/route.ts) |

**Path params** — `id`, `userId`

**Request body** — `updateMemberScoreSchema` (`lib/schemas/clientMeetingsSchema.ts`)

| Field | Type | Required |
|---|---|---|
| `userId` | string — min 1 | ✓ |
| `kpiWeeklyQTD` | number — min 0, max 100, default 0 |  |
| `kpiCoding` | number — min 0, max 100, default 0 |  |
| `priorityNotes` | number — min 0, max 100, default 0 |  |
| `priorityStartEndDate` | number — min 0, max 100, default 0 |  |
| `priorityColor` | number — min 0, max 100, default 0 |  |

- derived from `weeklyMemberScoreSchema`
- all fields optional (`.partial()`)

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: { userId, kpiWeeklyQTD, kpiCoding, priorityNotes, priorityStartEndDate, priorityColor } } |
| `400` | { success: false, error } |
| `404` | { success: false, error } |
| `409` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/client-meetings/weekly-meetings/bulk-restore`

#### `POST /api/client-meetings/weekly-meetings/bulk-restore`

POST /api/client-meetings/weekly-meetings/bulk-restore — undo soft delete in bulk.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `clientMeetings.weeklyMeeting` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/client-meetings/weekly-meetings/bulk-restore/route.ts](../app/api/client-meetings/weekly-meetings/bulk-restore/route.ts) |

**Request body** — JSON, not validated by a Zod schema (see route).

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: { restored } } |
| `400` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/client-meetings/weekly-meetings/export`

#### `GET /api/client-meetings/weekly-meetings/export`

GET /api/client-meetings/weekly-meetings/export — Global Export for Weekly Meeting. Date-based interval: from/to ("YYYY-MM-DD") filter `meetingDate`. One row per meeting. Scope shared with the list route via `buildClientMeetingWhere`. Row-per-record export; the aggregate monthly metrics report (/api/client-meetings/export/weekly*) is a separate, preserved feature. Node runtime (ExcelJS + @react-pdf/renderer).

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `clientMeetings.weeklyMeeting` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Source** | [app/api/client-meetings/weekly-meetings/export/route.ts](../app/api/client-meetings/weekly-meetings/export/route.ts) |

**Query** — `clientId`, `includeDeleted`, `status`

**Validated query params** — `exportBaseSchema` (`lib/exports/exportParams.ts`)

| Field | Type | Required |
|---|---|---|
| `columns` | unknown |  |

**Validated query params** — `dateRangeSchema` (`lib/exports/exportParams.ts`)

| Field | Type | Required |
|---|---|---|
| `from` | unknown |  |
| `to` | unknown |  |

**Responses**

| Status | Body |
|---|---|
| `400` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/client-meetings/weekly-meetings/reorder`

#### `POST /api/client-meetings/weekly-meetings/reorder`

POST /api/client-meetings/weekly-meetings/reorder — move a ClientWeeklyMeeting row.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `clientMeetings.weeklyMeeting` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/client-meetings/weekly-meetings/reorder/route.ts](../app/api/client-meetings/weekly-meetings/reorder/route.ts) |

**Request body** — `reorderRowSchema` (`lib/schemas/reorderSchema.ts`)

| Field | Type | Required |
|---|---|---|
| `id` | string — min 1 | ✓ |
| `beforeId` | string — min 1, nullable | ✓ |
| `afterId` | string — min 1, nullable | ✓ |

**Responses**

_Handler delegates to `handleReorder()`._

| Status | Body |
|---|---|
| `200` | { success: true, data: { id, position } } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/client-meetings/www-candidates/{factId}/dismiss`

#### `POST /api/client-meetings/www-candidates/{factId}/dismiss`

POST /api/client-meetings/www-candidates/[factId]/dismiss Reject a suggested WWW. The dismissal PERSISTS, which is the whole point. Extraction is idempotent but regeneration is not rare, and a suggestion that reappeared after every regenerate would make the facilitator re-reject the same thing every week — and then stop reading the section at all. Idempotent: dismissing an already-dismissed candidate reports `alreadyDismissed` rather than failing, so a double-click is harmless and the original reason and dismisser are preserved. PERMISSION — `ClientMeetings.Report: update`. Dismissing changes what the report shows, so it is an edit.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `clientMeetings.dashboard` — 404 when the org has the module disabled |
| **Permission** | `ClientMeetings.Report:update` |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/client-meetings/www-candidates/[factId]/dismiss/route.ts](../app/api/client-meetings/www-candidates/[factId]/dismiss/route.ts) |

**Path params** — `factId`

**Request body** — `bodySchema` (inline)

| Field | Type | Required |
|---|---|---|
| `reason` | string — max 500, nullable |  |

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: { factId, dismissed, alreadyDismissed } } |
| `400` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

---

## Module `critical-numbers` <a id="module-critical-numbers"></a>

_12 endpoints_

| Endpoint | Permission | Module gate |
|---|---|---|
| `GET /api/critical-numbers` | `CriticalNumber:view` | `criticalNumbers` |
| `POST /api/critical-numbers` | `CriticalNumber:create` | `criticalNumbers` |
| `GET /api/critical-numbers/{id}` | `CriticalNumber:view` | `criticalNumbers` |
| `PATCH /api/critical-numbers/{id}` | `CriticalNumber:update` | `criticalNumbers` |
| `DELETE /api/critical-numbers/{id}` | `CriticalNumber:delete` | `criticalNumbers` |
| `GET /api/critical-numbers/{id}/updates` | `CriticalNumber:view` | `criticalNumbers` |
| `POST /api/critical-numbers/{id}/updates` | `CriticalNumber:update` | `criticalNumbers` |
| `POST /api/critical-numbers/categories` | `CriticalNumber:create` | `criticalNumbers` |
| `GET /api/critical-numbers/options` | `CriticalNumber:view` | `criticalNumbers` |
| `GET /api/critical-numbers/sub-categories` | `CriticalNumber:view` | `criticalNumbers` |
| `POST /api/critical-numbers/sub-categories` | `CriticalNumber:create` | `criticalNumbers` |
| `GET /api/critical-numbers/team-members` | `CriticalNumber:view` | `criticalNumbers` |

### `/api/critical-numbers`

#### `GET /api/critical-numbers`

GET /api/critical-numbers?teamId=… Returns the org's Critical Numbers, optionally narrowed to one team. No pagination: the per-team cap of 5 bounds the list to a size that never needs paging. Tier resolution is deliberately NOT done here — `resolveTargetTier` is a pure client-side function, so the gauge stays live as the user edits without a round-trip.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `criticalNumbers` — 404 when the org has the module disabled |
| **Permission** | `CriticalNumber:view` |
| **Source** | [app/api/critical-numbers/route.ts](../app/api/critical-numbers/route.ts) |

**Query** — `categoryId`, `teamId`

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data }<br/>`data` inferred from `.map()` projection: `...item`, `updates` |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

#### `POST /api/critical-numbers`

POST /api/critical-numbers Create one Critical Number. Server-side gates, in order: 1. Zod — shape + enums (measurementUnit, frequency) + currency required when measurementUnit is "Currency" 2. team — exists and belongs to this org 3. owner — is a member (or head) of that team 4. category — exists in this org and isn't trashed 5. subCat — if given, belongs to the CHOSEN category 6. cap — the team is under 5 `currentValue` is not accepted from the client: it's a denormalised cache of the newest row in the append-only history, so it only ever moves when an update is recorded. A new metric starts at null ("no data"), which is what lets the gauge distinguish "nothing recorded" from a genuine zero.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `criticalNumbers` — 404 when the org has the module disabled |
| **Permission** | `CriticalNumber:create` |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/critical-numbers/route.ts](../app/api/critical-numbers/route.ts) |

**Request body** — `createCriticalNumberSchema` (`lib/schemas/criticalNumberSchema.ts`)

| Field | Type | Required |
|---|---|---|
| `title` | string — min 1, max 200 | ✓ |
| `teamId` | string — min 1 | ✓ |
| `ownerId` | string — min 1 | ✓ |
| `categoryId` | string — min 1 | ✓ |
| `subCategoryId` | string — min 1, nullable |  |
| `measurementUnit` | enum: Number \| Percentage \| Currency | ✓ |
| `unit` | string — max 60, nullable |  |
| `currency` | string — nullable |  |
| `targetScale` | string — nullable |  |
| `frequency` | enum: weekly \| monthly \| quarterly | ✓ |
| `targetValue` | unknown | ✓ |

- has cross-field `.refine()` rules

**Responses**

| Status | Body |
|---|---|
| `201` | { success: true, data }<br/>`data` — Prisma `criticalNumber.create` result |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/critical-numbers/{id}`

#### `GET /api/critical-numbers/{id}`

GET /api/critical-numbers/[id] One record plus its full history (oldest first), so the detail view can draw the gauge and the trend from a single round-trip.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `criticalNumbers` — 404 when the org has the module disabled |
| **Permission** | `CriticalNumber:view` |
| **Source** | [app/api/critical-numbers/[id]/route.ts](../app/api/critical-numbers/[id]/route.ts) |

**Path params** — `id`

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data }<br/>`data` — Prisma `criticalNumber.findFirst` result |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

#### `PATCH /api/critical-numbers/{id}`

PATCH /api/critical-numbers/[id] Edit the definition. `currentValue` is deliberately NOT accepted — it is derived from the append-only history and only moves via `POST /[id]/updates`. Every re-validation is conditional on the relevant field actually changing, so a partial PATCH doesn't pay for checks it can't invalidate. One exception: the currency-required-for-Currency check always runs (cheap, no DB call) since it depends on the merged state, not a single field delta.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `criticalNumbers` — 404 when the org has the module disabled |
| **Permission** | `CriticalNumber:update` |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/critical-numbers/[id]/route.ts](../app/api/critical-numbers/[id]/route.ts) |

**Path params** — `id`

**Request body** — `updateCriticalNumberSchema` (`lib/schemas/criticalNumberSchema.ts`)

| Field | Type | Required |
|---|---|---|
| `title` | unknown |  |
| `teamId` | unknown |  |
| `ownerId` | unknown |  |
| `categoryId` | unknown |  |
| `subCategoryId` | unknown | ✓ |
| `measurementUnit` | enum: Number \| Percentage \| Currency |  |
| `unit` | unknown | ✓ |
| `currency` | unknown | ✓ |
| `targetScale` | unknown | ✓ |
| `frequency` | enum: weekly \| monthly \| quarterly |  |
| `targetValue` | unknown |  |

- has cross-field `.refine()` rules

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data }<br/>`data` — Prisma `criticalNumber.update` result |
| `400` | { success: false, error } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

#### `DELETE /api/critical-numbers/{id}`

DELETE /api/critical-numbers/[id] Hard delete — v1 has no trash/restore by design. The history rows go with it via the FK's ON DELETE CASCADE, and the team's cap slot frees up immediately.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `criticalNumbers` — 404 when the org has the module disabled |
| **Permission** | `CriticalNumber:delete` |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/critical-numbers/[id]/route.ts](../app/api/critical-numbers/[id]/route.ts) |

**Path params** — `id`

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: { id } } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/critical-numbers/{id}/updates`

#### `GET /api/critical-numbers/{id}/updates`

GET /api/critical-numbers/[id]/updates Full history, oldest first — the order a trend line wants to plot.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `criticalNumbers` — 404 when the org has the module disabled |
| **Permission** | `CriticalNumber:view` |
| **Source** | [app/api/critical-numbers/[id]/updates/route.ts](../app/api/critical-numbers/[id]/updates/route.ts) |

**Path params** — `id`

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data }<br/>`data` — Prisma `criticalNumberUpdate.findMany` result |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

#### `POST /api/critical-numbers/{id}/updates`

POST /api/critical-numbers/[id]/updates Append one reading and re-derive the parent's `currentValue`. `currentValue` is recomputed as the value of the LATEST row BY DATE, not simply set to whatever was just posted. Updates can be backdated ("we forgot to log last Tuesday"), and blindly assigning the incoming value would let a backdated entry overwrite the gauge with a stale number. Ties on the same date fall back to insert order, so a same-day correction wins. Both writes run in one transaction: a history row that didn't move the cache, or a cache that moved without a history row, would each be a silent inconsistency in the append-only record.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `criticalNumbers` — 404 when the org has the module disabled |
| **Permission** | `CriticalNumber:update` |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/critical-numbers/[id]/updates/route.ts](../app/api/critical-numbers/[id]/updates/route.ts) |

**Path params** — `id`

**Request body** — `createCriticalNumberUpdateSchema` (`lib/schemas/criticalNumberSchema.ts`)

| Field | Type | Required |
|---|---|---|
| `date` | unknown — ISO date-time | ✓ |
| `value` | number | ✓ |
| `comment` | string — max 1000, nullable |  |

- has cross-field `.refine()` rules

**Responses**

| Status | Body |
|---|---|
| `201` | { success: true, data } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/critical-numbers/categories`

#### `POST /api/critical-numbers/categories`

POST /api/critical-numbers/categories `categoryType` and `breakdownType` are omitted from the write rather than hardcoded here, so the new row gets the SAME defaults (`Cumulative` / `Automatic`) straight from the Prisma column — if OPSP's own default ever changes, this follows without a second place to update. No `currency` is collected on this form, so Currency categories are created with `currency: null` — a valid, if incomplete, OPSP category; matches what OPSP's own create form allows before a currency is chosen.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `criticalNumbers` — 404 when the org has the module disabled |
| **Permission** | `CriticalNumber:create` |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/critical-numbers/categories/route.ts](../app/api/critical-numbers/categories/route.ts) |

**Request body** — `createCategoryFromCriticalNumberSchema` (`lib/schemas/criticalNumberSchema.ts`)

| Field | Type | Required |
|---|---|---|
| `name` | string — min 1, max 200 | ✓ |
| `measurementUnit` | enum: Number \| Percentage \| Currency | ✓ |

**Responses**

| Status | Body |
|---|---|
| `201` | { success: true, data }<br/>`data` — Prisma `categoryMaster.create` result |
| `409` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/critical-numbers/options`

#### `GET /api/critical-numbers/options`

GET /api/critical-numbers/options One round-trip for the whole form. Sub-categories come back unfiltered so the form can narrow them client-side as the category changes.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `criticalNumbers` — 404 when the org has the module disabled |
| **Permission** | `CriticalNumber:view` |
| **Source** | [app/api/critical-numbers/options/route.ts](../app/api/critical-numbers/options/route.ts) |

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: { categories, subCategories, units } } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/critical-numbers/sub-categories`

#### `GET /api/critical-numbers/sub-categories`

GET /api/critical-numbers/sub-categories?categoryId=… Without `categoryId` this returns every sub-category in the org, which is what the create form wants: it caches the full set once and filters client side as the user switches category, instead of refetching per selection.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `criticalNumbers` — 404 when the org has the module disabled |
| **Permission** | `CriticalNumber:view` |
| **Source** | [app/api/critical-numbers/sub-categories/route.ts](../app/api/critical-numbers/sub-categories/route.ts) |

**Query** — `categoryId`

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data }<br/>`data` — Prisma `subCategory.findMany` result |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

#### `POST /api/critical-numbers/sub-categories`

POST /api/critical-numbers/sub-categories Backs the form's inline "+ New Sub Category". Guarded by `auth.create` on CriticalNumber — anyone who can create a metric can create the label it files under; a separate permission for a two-field lookup row would be friction without a matching risk.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `criticalNumbers` — 404 when the org has the module disabled |
| **Permission** | `CriticalNumber:create` |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/critical-numbers/sub-categories/route.ts](../app/api/critical-numbers/sub-categories/route.ts) |

**Request body** — `createSubCategorySchema` (`lib/schemas/criticalNumberSchema.ts`)

| Field | Type | Required |
|---|---|---|
| `categoryId` | string — min 1 | ✓ |
| `name` | string — min 1, max 120 | ✓ |

**Responses**

| Status | Body |
|---|---|
| `201` | { success: true, data }<br/>`data` — Prisma `subCategory.create` result |
| `409` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/critical-numbers/team-members`

#### `GET /api/critical-numbers/team-members`

GET /api/critical-numbers/team-members?teamId=…

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `criticalNumbers` — 404 when the org has the module disabled |
| **Permission** | `CriticalNumber:view` |
| **Source** | [app/api/critical-numbers/team-members/route.ts](../app/api/critical-numbers/team-members/route.ts) |

**Query** — `teamId`

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: [] } |
| `200` | { success: true, data }<br/>`data` — Prisma `user.findMany` result |
| `400` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

---

## Module `dashboard` <a id="module-dashboard"></a>

_1 endpoint_

| Endpoint | Permission | Module gate |
|---|---|---|
| `GET /api/dashboard/summary` | — | `dashboard` |

### `/api/dashboard/summary`

#### `GET /api/dashboard/summary`

GET /api/dashboard/summary?year=<n>&quarter=Q1|Q2|Q3|Q4 Consolidated dashboard payload — replaces 6 separate client queries (individual KPIs, team KPIs, priorities, WWW items, teams, users) with a single server round-trip using Promise.all.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `dashboard` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Source** | [app/api/dashboard/summary/route.ts](../app/api/dashboard/summary/route.ts) |

**Query** — `quarter`, `year`

**Validated query params** — `querySchema` (inline)

| Field | Type | Required |
|---|---|---|
| `year` | number (coerced) — min 1900, max 9999 | ✓ |
| `quarter` | enum: Q1 \| Q2 \| Q3 \| Q4 | ✓ |

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: { individualKPIs, teamKPIs, priorities, wwwItems, teams, users } } |
| `400` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

---

## Module `demo-data` <a id="module-demo-data"></a>

_3 endpoints_

| Endpoint | Permission | Module gate |
|---|---|---|
| `POST /api/demo-data/clear` | — | — |
| `POST /api/demo-data/seed` | — | — |
| `GET /api/demo-data/status` | — | — |

### `/api/demo-data/clear`

#### `POST /api/demo-data/clear`

POST /api/demo-data/clear — permanently deletes every isDemoData row for this org across every seeded module. Admin-only, irreversible.

| | |
|---|---|
| **Auth** | Org-admin guard (`requireAdmin`) |
| **Permission** | _none beyond auth_ |
| **Source** | [app/api/demo-data/clear/route.ts](../app/api/demo-data/clear/route.ts) |

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data } |
| `500` | { success: false, error } |

### `/api/demo-data/seed`

#### `POST /api/demo-data/seed`

POST /api/demo-data/seed — idempotently seeds org-specific demo data. Admin-only; the dashboard fires this once on an admin's first load. A no-op if already seeded or previously cleared (see DemoDataState).

| | |
|---|---|
| **Auth** | Org-admin guard (`requireAdmin`) |
| **Permission** | _none beyond auth_ |
| **Source** | [app/api/demo-data/seed/route.ts](../app/api/demo-data/seed/route.ts) |

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data } |
| `500` | { success: false, error } |

### `/api/demo-data/status`

#### `GET /api/demo-data/status`

GET /api/demo-data/status — whether this org currently has seeded demo data.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Permission** | _none beyond auth_ |
| **Source** | [app/api/demo-data/status/route.ts](../app/api/demo-data/status/route.ts) |

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: { hasDemoData } } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

---

## Module `docs` <a id="module-docs"></a>

_1 endpoint_

| Endpoint | Permission | Module gate |
|---|---|---|
| `GET /api/docs` | — | — |

### `/api/docs`

#### `GET /api/docs`

GET /api/docs QuikScale routes are documented in the platform-wide combined OpenAPI spec hosted by the QuikIT launcher. This endpoint redirects there with the `app:quikscale` filter pre-applied. The platform spec covers all 5 apps; filter by tag to scope. URL resolution: - Production: QUIKIT_URL env var (set in Vercel) - Local dev: defaults to http://localhost:3000

| | |
|---|---|
| **Auth** | Custom (see route) |
| **Permission** | _none beyond auth_ |
| **Source** | [app/api/docs/route.ts](../app/api/docs/route.ts) |

**Responses**

| Status | Body |
|---|---|
| `307` | redirect (`Location` header) |

---

## Module `face` <a id="module-face"></a>

_4 endpoints_

| Endpoint | Permission | Module gate |
|---|---|---|
| `GET /api/face` | — | `face` |
| `POST /api/face` | — | `face` |
| `PUT /api/face/{id}` | — | `face` |
| `DELETE /api/face/{id}` | — | `face` |

### `/api/face`

#### `GET /api/face`

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `face` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Source** | [app/api/face/route.ts](../app/api/face/route.ts) |

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: { functions, insights } } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

#### `POST /api/face`

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `face` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/face/route.ts](../app/api/face/route.ts) |

**Request body** — `createAccountabilityFunctionSchema` (`lib/schemas/accountabilitySchema.ts`)

| Field | Type | Required |
|---|---|---|
| `chartType` | enum: face \| pace | ✓ |
| `name` | string — min 1, max 120 | ✓ |
| `description` | string — max 500, nullable |  |
| `leadingIndicators` | string — max 2000, nullable |  |
| `expectedOutcomes` | string — max 2000, nullable |  |
| `assignedToUserId` | string — nullable |  |
| `teamId` | string — nullable |  |
| `parentFunctionId` | string — nullable |  |
| `sortOrder` | number — min 0 |  |

**Responses**

| Status | Body |
|---|---|
| `201` | { success: true, data }<br/>`data` — Prisma `accountabilityFunction.create` result |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/face/{id}`

#### `PUT /api/face/{id}`

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `face` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/face/[id]/route.ts](../app/api/face/[id]/route.ts) |

**Path params** — `id`

**Request body** — `updateAccountabilityFunctionSchema` (`lib/schemas/accountabilitySchema.ts`)

| Field | Type | Required |
|---|---|---|
| `chartType` | enum: face \| pace | ✓ |
| `name` | string — min 1, max 120 | ✓ |
| `description` | string — max 500, nullable |  |
| `leadingIndicators` | string — max 2000, nullable |  |
| `expectedOutcomes` | string — max 2000, nullable |  |
| `assignedToUserId` | string — nullable |  |
| `teamId` | string — nullable |  |
| `parentFunctionId` | string — nullable |  |
| `sortOrder` | number — min 0 |  |

- derived from `createAccountabilityFunctionSchema`
- all fields optional (`.partial()`)

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data }<br/>`data` — Prisma `accountabilityFunction.update` result |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

#### `DELETE /api/face/{id}`

Soft-delete: stamp deletedAt so the row stays in the DB for audit/restore. Cascades to child functions (so deleting a parent hides its sub-functions too).

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `face` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/face/[id]/route.ts](../app/api/face/[id]/route.ts) |

**Path params** — `id`

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

---

## Module `feature-flags` <a id="module-feature-flags"></a>

_1 endpoint_

| Endpoint | Permission | Module gate |
|---|---|---|
| `GET /api/feature-flags/me` | — | — |

### `/api/feature-flags/me`

#### `GET /api/feature-flags/me`

GET /api/feature-flags/me Returns the set of disabled moduleKeys for the current user's tenant on THIS app (hard-coded to "quikscale"). Used by the sidebar to filter the nav tree. Safe to call freely — response dedupes via React.cache on the server and is cached in Redis for 5 minutes per (orgId, appSlug). Response: { success: true, data: { appSlug, disabledKeys: string[] } }

| | |
|---|---|
| **Auth** | Hand-rolled `getServerSession` check |
| **Permission** | _none beyond auth_ |
| **Source** | [app/api/feature-flags/me/route.ts](../app/api/feature-flags/me/route.ts) |

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: { appSlug, disabledKeys } } |
| `401` | { success: false, error } |
| `500` | { success: false, error } |

---

## Module `habits` <a id="module-habits"></a>

_12 endpoints_

| Endpoint | Permission | Module gate |
|---|---|---|
| `GET /api/habits` | — | `habits` |
| `POST /api/habits` | — | `habits` |
| `GET /api/habits/{id}` | — | `habits` |
| `PUT /api/habits/{id}` | — | `habits` |
| `DELETE /api/habits/{id}` | — | `habits` |
| `POST /api/habits/{id}/close` | — | `habits` |
| `GET /api/habits/{id}/export` | — | `habits` |
| `POST /api/habits/{id}/launch` | — | `habits` |
| `GET /api/habits/{id}/my-response` | — | `habits` |
| `PUT /api/habits/{id}/my-response` | — | `habits` |
| `GET /api/habits/{id}/participation` | — | `habits` |
| `GET /api/habits/trends` | — | `habits` |

### `/api/habits`

#### `GET /api/habits`

GET /api/habits Admin (Habits:view): returns the full History — every campaign for the org, including drafts and legacy single-user rows. Supports ?year/?quarter filters. Member (no Habits:view): returns *at most one* active campaign and a `hasSubmitted` flag so the member UI can render either the empty-state or the fill form. No scores, no draft visibility, no list.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `habits` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Source** | [app/api/habits/route.ts](../app/api/habits/route.ts) |

**Query** — `quarter`, `year`

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data, role }<br/>`data` inferred from `.map()` projection: `quarter`, `year` |
| `200` | { success: true, data: [], role } |
| `200` | { success: true, role, data } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

#### `POST /api/habits`

POST /api/habits (admin only — system admin role) Creates a new draft campaign for (quarter, year). Multiple campaigns per quarter are allowed (a quarter can have several "rounds" / pulse-checks), but only one can be open (draft or active) at a time — the admin must close the current one before opening the next. Closed rounds stay in History as their own row.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `habits` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/habits/route.ts](../app/api/habits/route.ts) |

**Request body** — `launchCampaignSchema` (`lib/schemas/habitSchema.ts`)

| Field | Type | Required |
|---|---|---|
| `quarter` | string | ✓ |
| `year` | number — min 2020, max 2035 | ✓ |
| `deadline` | string — ISO date-time |  |
| `notes` | string — nullable |  |
| `teamId` | string — nullable |  |
| `participantUserIds` | string — min 1 | ✓ |

**Responses**

| Status | Body |
|---|---|
| `201` | { success: true, data }<br/>`data` — Prisma `habitAssessment.create` result |
| `403` | { success: false, error } |
| `409` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/habits/{id}`

#### `GET /api/habits/{id}`

GET /api/habits/[id] System admins only. Returns the campaign metadata plus the *aggregated* view — never individual responses. For legacy single-user rows (isLegacy=true) it returns the original per-habit scores so the History panel can still render them with the old AssessmentDetail shape. Members hit this route → 403. Their UI uses /api/habits (which only exposes the one active campaign) and PUT /my-response. The check uses `isOrgAdmin` (system "admin" role only) — per-user `Habits:view` extras cannot bypass this, by design: aggregate scores would leak otherwise.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `habits` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Source** | [app/api/habits/[id]/route.ts](../app/api/habits/[id]/route.ts) |

**Path params** — `id`

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: { campaign, legacy } } |
| `200` | { success: true, data: { campaign, legacy, aggregate, round, totalRounds, previousPct } } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

#### `PUT /api/habits/{id}`

PUT /api/habits/[id] (admin only — system admin role) Update deadline / notes on an existing campaign. Quarter/year are immutable after creation. Legacy rows are read-only — they can be deleted but not edited.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `habits` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/habits/[id]/route.ts](../app/api/habits/[id]/route.ts) |

**Path params** — `id`

**Request body** — `updateCampaignSchema` (`lib/schemas/habitSchema.ts`)

| Field | Type | Required |
|---|---|---|
| `deadline` | string — ISO date-time, nullable |  |
| `notes` | string — nullable |  |
| `teamId` | string — nullable |  |
| `participantUserIds` | string[] — min 1 |  |

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data }<br/>`data` — Prisma `habitAssessment.update` result |
| `400` | { success: false, error } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

#### `DELETE /api/habits/{id}`

DELETE /api/habits/[id] (admin only — system admin role) Cascades to HabitAssessmentResponse via the FK ON DELETE CASCADE.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `habits` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/habits/[id]/route.ts](../app/api/habits/[id]/route.ts) |

**Path params** — `id`

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/habits/{id}/close`

#### `POST /api/habits/{id}/close`

POST /api/habits/[id]/close (admin only — system admin role) Mark an active campaign as closed. Members can no longer submit / update their response after this. Idempotent if already closed; rejects draft.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `habits` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/habits/[id]/close/route.ts](../app/api/habits/[id]/close/route.ts) |

**Path params** — `id`

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data }<br/>`data` — Prisma `habitAssessment.findFirst` result |
| `400` | { success: false, error } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/habits/{id}/export`

#### `GET /api/habits/{id}/export`

GET /api/habits/[id]/export System admins only (same guard as GET /api/habits/[id]). Streams the Rockefeller Habits Checklist as a colour-coded .xlsx — the % cells use the same green → lime → amber → red ramp as the dashboard table. Legacy single-user assessments are not exportable (no sub-item bits to aggregate) → 400.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `habits` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Source** | [app/api/habits/[id]/export/route.ts](../app/api/habits/[id]/export/route.ts) |

**Path params** — `id`

**Responses**

| Status | Body |
|---|---|
| `200` | binary — `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`<br/>attachment: `${filename}` |
| `400` | { success: false, error } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/habits/{id}/launch`

#### `POST /api/habits/{id}/launch`

POST /api/habits/[id]/launch (admin only — system admin role) Flip a draft campaign to active and stamp publishedAt. Idempotent if the campaign is already active. Closed/legacy campaigns can't be re-launched.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `habits` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/habits/[id]/launch/route.ts](../app/api/habits/[id]/launch/route.ts) |

**Path params** — `id`

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data }<br/>`data` — Prisma `habitAssessment.findFirst` result |
| `400` | { success: false, error } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/habits/{id}/my-response`

#### `GET /api/habits/{id}/my-response`

GET /api/habits/[id]/my-response Any member with the Habits module enabled. Returns the caller's own response so the fill form can pre-fill if they reopen it. 404 if they haven't submitted yet. Never returns anyone else's data.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `habits` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Source** | [app/api/habits/[id]/my-response/route.ts](../app/api/habits/[id]/my-response/route.ts) |

**Path params** — `id`

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data }<br/>`data` — Prisma `habitAssessmentResponse.findUnique` result |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

#### `PUT /api/habits/{id}/my-response`

PUT /api/habits/[id]/my-response Create the caller's own response. ONE-SHOT — once submitted, the response is locked (no edit, no delete). Returns 409 if a response already exists. Rejects when the campaign is not "active" or when the deadline has passed. Admins can extend the deadline via PUT /api/habits/[id] to reopen the window for members who haven't submitted yet.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `habits` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/habits/[id]/my-response/route.ts](../app/api/habits/[id]/my-response/route.ts) |

**Path params** — `id`

**Request body** — `submitResponseSchema` (`lib/schemas/habitSchema.ts`)

| Field | Type | Required |
|---|---|---|
| `subItemBits` | unknown | ✓ |

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data }<br/>`data` — Prisma `habitAssessmentResponse.create` result |
| `400` | { success: false, error } |
| `404` | { success: false, error } |
| `409` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/habits/{id}/participation`

#### `GET /api/habits/{id}/participation`

GET /api/habits/[id]/participation (admin only — system admin role) Returns participation breakdown for a campaign: { total, submitted, pending, members: [{ id, name, email, hasSubmitted, submittedAt }] } Privacy: the admin sees WHO has submitted (and when), but NOT what they answered. Individual scores remain pseudonymous — exposed only as the aggregate via GET /api/habits/[id].

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `habits` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Source** | [app/api/habits/[id]/participation/route.ts](../app/api/habits/[id]/participation/route.ts) |

**Path params** — `id`

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: { total, submitted, pending, members } } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/habits/trends`

#### `GET /api/habits/trends`

GET /api/habits/trends (admin only — system admin role) Returns the chronologically-ordered list of every non-legacy campaign with its aggregate overall %, respondent count and round label. Powers the Q-over-Q trend chart on the admin dashboard so executives can answer the "are we improving?" question at a glance. Closed campaigns are the meaningful data points; draft campaigns are excluded (no responses yet); active ones are included with their current partial aggregate so admins see live progress mid-round.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `habits` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Source** | [app/api/habits/trends/route.ts](../app/api/habits/trends/route.ts) |

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

---

## Module `health` <a id="module-health"></a>

_2 endpoints_

| Endpoint | Permission | Module gate |
|---|---|---|
| `GET /api/health` | — | — |
| `GET /api/health/ready` | — | — |

### `/api/health`

#### `GET /api/health`

GET /api/health — liveness probe Returns 200 if the process is running. No auth, no DB check. Used by load balancers and orchestrators (ECS, K8s) to decide whether to route traffic to this instance.

| | |
|---|---|
| **Auth** | **Public** — infrastructure probe, no auth |
| **Permission** | _none beyond auth_ |
| **Source** | [app/api/health/route.ts](../app/api/health/route.ts) |

**Responses**

| Status | Body |
|---|---|
| `200` | { status, timestamp, uptime } |

### `/api/health/ready`

#### `GET /api/health/ready`

GET /api/health/ready — readiness probe Checks that both critical dependencies are reachable: 1. PostgreSQL (via Prisma `$queryRaw`) 2. Redis (via PING, if configured) Returns 200 when all checks pass, 503 when any check fails. Detailed check info only exposed with HEALTH_TOKEN auth header.

| | |
|---|---|
| **Auth** | Custom (see route) |
| **Permission** | _none beyond auth_ |
| **Headers read** | `authorization` |
| **Source** | [app/api/health/ready/route.ts](../app/api/health/ready/route.ts) |

**Responses**

| Status | Body |
|---|---|
| `200` | { status, timestamp, ...(showDetails ? { checks } : {}) } |

---

## Module `internal` <a id="module-internal"></a>

_12 endpoints_

| Endpoint | Permission | Module gate |
|---|---|---|
| `POST /api/internal/actions/bulk-create-www` | — | — |
| `POST /api/internal/actions/create-kpi` | — | — |
| `POST /api/internal/actions/create-priority` | — | — |
| `POST /api/internal/actions/create-www` | — | — |
| `POST /api/internal/actions/enter-kpi-value` | — | — |
| `POST /api/internal/actions/notify` | — | — |
| `POST /api/internal/actions/save-transcript` | — | — |
| `POST /api/internal/actions/set-opsp-status` | — | — |
| `POST /api/internal/actions/update-kpi` | — | — |
| `POST /api/internal/actions/update-priority` | — | — |
| `POST /api/internal/actions/update-record` | — | — |
| `POST /api/internal/provision-roles` | — | — |

### `/api/internal/actions/bulk-create-www`

#### `POST /api/internal/actions/bulk-create-www`

POST /api/internal/actions/bulk-create-www — service-to-service only. Called by QuikFlow's `www.bulk.import` executor (e.g. turning AI-extracted meeting to-dos into WWW action items). Creates many WWW rows in one call. Same INTERNAL_SECRET convention; org + actor supplied in the body.

| | |
|---|---|
| **Auth** | Service-to-service — `x-internal-secret` header must equal `INTERNAL_SECRET` |
| **Permission** | _none beyond auth_ |
| **Headers read** | `x-internal-secret` |
| **Source** | [app/api/internal/actions/bulk-create-www/route.ts](../app/api/internal/actions/bulk-create-www/route.ts) |

**Request body** — `bodySchema` (inline)

| Field | Type | Required |
|---|---|---|
| `orgId` | string — min 1 | ✓ |
| `actorId` | string — min 1 | ✓ |
| `items` | array — min 1, max 200 | ✓ |

**Responses**

| Status | Body |
|---|---|
| `201` | { success: true, data: { count } } |
| `400` | { success: false, error } |
| `401` | { success: false, error } |
| `500` | { success: false, error } |

### `/api/internal/actions/create-kpi`

#### `POST /api/internal/actions/create-kpi`

POST /api/internal/actions/create-kpi — service-to-service only. Called by QuikFlow's `kpi.create` executor. Creates an INDIVIDUAL KPI on behalf of an automation. Derived fields (progressPercent / qtdAchieved / healthStatus) are left to their model defaults and recomputed once weekly values are entered — the automation never sets them. Same auth convention as the sibling internal routes.

| | |
|---|---|
| **Auth** | Service-to-service — `x-internal-secret` header must equal `INTERNAL_SECRET` |
| **Permission** | _none beyond auth_ |
| **Headers read** | `x-internal-secret` |
| **Source** | [app/api/internal/actions/create-kpi/route.ts](../app/api/internal/actions/create-kpi/route.ts) |

**Request body** — `bodySchema` (inline)

| Field | Type | Required |
|---|---|---|
| `orgId` | string — min 1 | ✓ |
| `actorId` | string — min 1 | ✓ |
| `name` | string — min 1, max 200 | ✓ |
| `owner` | string — min 1 | ✓ |
| `target` | number — nullable |  |
| `measurementUnit` | string — min 1, max 60, default "Number" |  |
| `quarter` | enum: Q1 \| Q2 \| Q3 \| Q4 — default "Q1" |  |
| `year` | number — min 2020, max 2099 | ✓ |
| `frequency` | string — min 1, max 30, default "weekly" |  |
| `kpiType` | string — min 1, max 30, default "NA" |  |
| `divisionType` | string — min 1, max 30, default "Cumulative" |  |
| `teamId` | string — nullable |  |
| `description` | string — max 1000, nullable |  |

**Responses**

| Status | Body |
|---|---|
| `201` | { success: true, data: { id } } |
| `400` | { success: false, error } |
| `401` | { success: false, error } |
| `500` | { success: false, error } |

### `/api/internal/actions/create-priority`

#### `POST /api/internal/actions/create-priority`

POST /api/internal/actions/create-priority — service-to-service only. Called by QuikFlow's `create_priority` action executor to create a real Priority on behalf of an automation. There is no user session here, so this mirrors the `/api/internal/provision-roles` convention: shared INTERNAL_SECRET via `x-internal-secret`, with an explicit `orgId` + `actorId` in the body (the org's automation principal). Never widens the user-facing `POST /api/priority` route's auth.

| | |
|---|---|
| **Auth** | Service-to-service — `x-internal-secret` header must equal `INTERNAL_SECRET` |
| **Permission** | _none beyond auth_ |
| **Headers read** | `x-internal-secret` |
| **Source** | [app/api/internal/actions/create-priority/route.ts](../app/api/internal/actions/create-priority/route.ts) |

**Request body** — `bodySchema` (inline)

| Field | Type | Required |
|---|---|---|
| `orgId` | string — min 1 | ✓ |
| `actorId` | string — min 1 | ✓ |
| `name` | string — min 1, max 200 | ✓ |
| `owner` | string — min 1 | ✓ |
| `quarter` | enum: Q1 \| Q2 \| Q3 \| Q4 | ✓ |
| `year` | number — min 2020, max 2099 | ✓ |
| `teamId` | string — nullable |  |
| `description` | string — nullable |  |
| `relatedKpiId` | string — nullable |  |

**Responses**

| Status | Body |
|---|---|
| `201` | { success: true, data: { id } } |
| `400` | { success: false, error } |
| `401` | { success: false, error } |
| `500` | { success: false, error } |

### `/api/internal/actions/create-www`

#### `POST /api/internal/actions/create-www`

POST /api/internal/actions/create-www — service-to-service only. Called by QuikFlow's `create_www` action executor to create a real WWW action item on behalf of an automation. No user session: shared INTERNAL_SECRET via `x-internal-secret`, explicit orgId/actorId in the body (the org's automation principal). Mirrors create-priority / provision-roles.

| | |
|---|---|
| **Auth** | Service-to-service — `x-internal-secret` header must equal `INTERNAL_SECRET` |
| **Permission** | _none beyond auth_ |
| **Headers read** | `x-internal-secret` |
| **Source** | [app/api/internal/actions/create-www/route.ts](../app/api/internal/actions/create-www/route.ts) |

**Request body** — `bodySchema` (inline)

| Field | Type | Required |
|---|---|---|
| `orgId` | string — min 1 | ✓ |
| `actorId` | string — min 1 | ✓ |
| `who` | string — min 1 | ✓ |
| `what` | string — min 1, max 500 | ✓ |
| `when` | string — ISO date-time | ✓ |
| `category` | string — nullable |  |
| `notes` | string — nullable |  |

**Responses**

| Status | Body |
|---|---|
| `201` | { success: true, data: { id } } |
| `400` | { success: false, error } |
| `401` | { success: false, error } |
| `500` | { success: false, error } |

### `/api/internal/actions/enter-kpi-value`

#### `POST /api/internal/actions/enter-kpi-value`

POST /api/internal/actions/enter-kpi-value — service-to-service only. Called by QuikFlow's `kpi.value.enter` action executor to record a weekly KPI reading on behalf of an automation. Reuses the SAME `upsertAndRecalc` the user-facing weekly route uses, so an automation-entered value re-aggregates qtdAchieved → progress% → healthStatus identically (RAG stays derived; the endpoint never writes it directly). Auth mirrors the other internal routes: shared INTERNAL_SECRET via `x-internal-secret`, explicit orgId + actorId in the body (no user session). userId (whose weekly cell) defaults to the KPI owner for an individual KPI. Deliberately does NOT enforce the UI's week-lock — an automation may backfill or forward-fill any week.

| | |
|---|---|
| **Auth** | Service-to-service — `x-internal-secret` header must equal `INTERNAL_SECRET` |
| **Permission** | _none beyond auth_ |
| **Headers read** | `x-internal-secret` |
| **Source** | [app/api/internal/actions/enter-kpi-value/route.ts](../app/api/internal/actions/enter-kpi-value/route.ts) |

**Request body** — `bodySchema` (inline)

| Field | Type | Required |
|---|---|---|
| `orgId` | string — min 1 | ✓ |
| `actorId` | string — min 1 | ✓ |
| `kpiId` | string — min 1 | ✓ |
| `weekNumber` | number — min 1, max 53 | ✓ |
| `value` | number — nullable |  |
| `userId` | string — min 1 |  |
| `notes` | string — max 500, nullable |  |

**Responses**

| Status | Body |
|---|---|
| `201` | { success: true, data: { kpiId, weekNumber, value } } |
| `400` | { success: false, error } |
| `401` | { success: false, error } |
| `404` | { success: false, error } |
| `500` | { success: false, error } |

### `/api/internal/actions/notify`

#### `POST /api/internal/actions/notify`

POST /api/internal/actions/notify — service-to-service only. Called by QuikFlow's `notify_owner` action executor to write a real in-app Notification on behalf of an automation. Same auth convention as the other internal routes: shared INTERNAL_SECRET via `x-internal-secret`, explicit orgId + userId in the body (no user session).

| | |
|---|---|
| **Auth** | Service-to-service — `x-internal-secret` header must equal `INTERNAL_SECRET` |
| **Permission** | _none beyond auth_ |
| **Headers read** | `x-internal-secret` |
| **Source** | [app/api/internal/actions/notify/route.ts](../app/api/internal/actions/notify/route.ts) |

**Request body** — `bodySchema` (inline)

| Field | Type | Required |
|---|---|---|
| `orgId` | string — min 1 | ✓ |
| `userId` | string — min 1 | ✓ |
| `title` | string — min 1, max 200 | ✓ |
| `message` | string — min 1, max 1000 | ✓ |
| `relatedEntityId` | string — nullable |  |
| `relatedEntityType` | string — nullable |  |

**Responses**

| Status | Body |
|---|---|
| `201` | { success: true, data: { id } } |
| `400` | { success: false, error } |
| `401` | { success: false, error } |
| `500` | { success: false, error } |

### `/api/internal/actions/save-transcript`

#### `POST /api/internal/actions/save-transcript`

POST /api/internal/actions/save-transcript — service-to-service only. Called by QuikFlow's `quikscale.save_transcript` action executor when a Fathom meeting is transcribed. This endpoint owns the MATCHING business logic: given the recording's attendees + start time + title, it resolves which QuikScale client, which cadence (DAILY / WEEKLY) and which date the meeting was, links it to the concrete meeting row if one exists, and upserts a ClientMeetingTranscript. Idempotent on (orgId, fathomRecordingId). Nothing is ever dropped: an unresolved transcript is still stored with matchStatus UNMATCHED/AMBIGUOUS (clientId null) for the "Unassigned" bucket.

| | |
|---|---|
| **Auth** | Service-to-service — `x-internal-secret` header must equal `INTERNAL_SECRET` |
| **Permission** | _none beyond auth_ |
| **Headers read** | `x-internal-secret` |
| **Source** | [app/api/internal/actions/save-transcript/route.ts](../app/api/internal/actions/save-transcript/route.ts) |

**Request body** — `bodySchema` (inline)

| Field | Type | Required |
|---|---|---|
| `orgId` | string — min 1 | ✓ |
| `actorId` | string — min 1 | ✓ |
| `recordingId` | string — min 1 | ✓ |
| `title` | string — nullable |  |
| `startedAt` | string — nullable |  |
| `endedAt` | string — nullable |  |
| `durationMinutes` | number — nullable |  |
| `attendees` | array — default [] |  |
| `recordingUrl` | string — nullable |  |
| `rawText` | string — nullable |  |
| `rawSegments` | any[] — nullable |  |
| `summary` | string — nullable |  |
| `actionItems` | any[] — default [] |  |
| `clientId` | string |  |
| `type` | enum: DAILY \| WEEKLY |  |
| `meetingDate` | string |  |

**Responses**

| Status | Body |
|---|---|
| `201` | { success: true, data }<br/>`data` — Prisma `clientMeetingTranscript.upsert` result |
| `400` | { success: false, error } |
| `401` | { success: false, error } |
| `500` | { success: false, error } |

### `/api/internal/actions/set-opsp-status`

#### `POST /api/internal/actions/set-opsp-status`

POST /api/internal/actions/set-opsp-status — service-to-service only. Backs QuikFlow's `opsp.finalize` (→ finalized) and `opsp.review.mark` (→ reviewed) executors. The OPSP lifecycle is a forward-only state machine draft → finalized → reviewed; this endpoint only advances it (never backward) and emits the same `emitOpspStatusChanged` signal the UI path uses so downstream workflows fire. It does NOT touch section content — see the (still-simulated) opsp.update.section action for that. Org-scoped.

| | |
|---|---|
| **Auth** | Service-to-service — `x-internal-secret` header must equal `INTERNAL_SECRET` |
| **Permission** | _none beyond auth_ |
| **Headers read** | `x-internal-secret` |
| **Source** | [app/api/internal/actions/set-opsp-status/route.ts](../app/api/internal/actions/set-opsp-status/route.ts) |

**Request body** — `bodySchema` (inline)

| Field | Type | Required |
|---|---|---|
| `orgId` | string — min 1 | ✓ |
| `actorId` | string — min 1 | ✓ |
| `opspId` | string — min 1 | ✓ |
| `target` | enum: finalized \| reviewed | ✓ |

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: { id, status } } |
| `400` | { success: false, error } |
| `401` | { success: false, error } |
| `404` | { success: false, error } |
| `409` | { success: false, error } |
| `500` | { success: false, error } |

### `/api/internal/actions/update-kpi`

#### `POST /api/internal/actions/update-kpi`

POST /api/internal/actions/update-kpi — service-to-service only. Called by QuikFlow's `kpi.update` + `kpi.archive` executors. WHITELISTED fields only — deliberately EXCLUDES every derived column (healthStatus / progressPercent / qtdAchieved / qtdGoal): those are computed from weekly values and must never be written by an automation (keeps the traffic-light semantics intact). `target` respects the org's "Add Past Week Data" lock, the same rule the KPI edit panel enforces. `archived:true` soft-archives (status → "archived"). Org-scoped via findFirst + updateMany(where:{id,orgId}).

| | |
|---|---|
| **Auth** | Service-to-service — `x-internal-secret` header must equal `INTERNAL_SECRET` |
| **Permission** | _none beyond auth_ |
| **Headers read** | `x-internal-secret` |
| **Source** | [app/api/internal/actions/update-kpi/route.ts](../app/api/internal/actions/update-kpi/route.ts) |

**Request body** — `bodySchema` (inline)

| Field | Type | Required |
|---|---|---|
| `orgId` | string — min 1 | ✓ |
| `actorId` | string — min 1 | ✓ |
| `kpiId` | string — min 1 | ✓ |
| `patch` | string — min 1, max 200, nullable |  |

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: { id, updated } } |
| `400` | { success: false, error } |
| `401` | { success: false, error } |
| `404` | { success: false, error } |
| `409` | { success: false, error } |
| `500` | { success: false, error } |

### `/api/internal/actions/update-priority`

#### `POST /api/internal/actions/update-priority`

POST /api/internal/actions/update-priority — service-to-service only. Called by QuikFlow's `priority.update` executor. Whitelisted Rock fields only (name / description / status / owner / notes); `progressPct` and `dueDate` are derived and never written. Org-scoped via updateMany(where:{id,orgId}). Same INTERNAL_SECRET convention as the sibling internal routes.

| | |
|---|---|
| **Auth** | Service-to-service — `x-internal-secret` header must equal `INTERNAL_SECRET` |
| **Permission** | _none beyond auth_ |
| **Headers read** | `x-internal-secret` |
| **Source** | [app/api/internal/actions/update-priority/route.ts](../app/api/internal/actions/update-priority/route.ts) |

**Request body** — `bodySchema` (inline)

| Field | Type | Required |
|---|---|---|
| `orgId` | string — min 1 | ✓ |
| `actorId` | string — min 1 | ✓ |
| `priorityId` | string — min 1 | ✓ |
| `patch` | string — min 1, max 200, nullable |  |

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: { id, updated } } |
| `400` | { success: false, error } |
| `401` | { success: false, error } |
| `404` | { success: false, error } |
| `500` | { success: false, error } |

### `/api/internal/actions/update-record`

#### `POST /api/internal/actions/update-record`

POST /api/internal/actions/update-record — service-to-service only. Generic, WHITELISTED record mutation for QuikFlow actions (priority.complete, www.complete, priority.reassign, …). Only status/owner on Priority / WWW / Goal — deliberately NOT KPI, whose RAG is derived (writing it would corrupt the traffic-light semantics). Org-scoped via updateMany(where:{id,orgId}). Shared INTERNAL_SECRET auth, explicit orgId/actorId (mirrors create-priority).

| | |
|---|---|
| **Auth** | Service-to-service — `x-internal-secret` header must equal `INTERNAL_SECRET` |
| **Permission** | _none beyond auth_ |
| **Headers read** | `x-internal-secret` |
| **Source** | [app/api/internal/actions/update-record/route.ts](../app/api/internal/actions/update-record/route.ts) |

**Request body** — `bodySchema` (inline)

| Field | Type | Required |
|---|---|---|
| `orgId` | string — min 1 | ✓ |
| `actorId` | string — min 1 | ✓ |
| `module` | enum: priority \| www \| goal | ✓ |
| `recordId` | string — min 1 | ✓ |
| `patch` | string — min 1 |  |

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: { id, updated } } |
| `400` | { success: false, error } |
| `401` | { success: false, error } |
| `404` | { success: false, error } |
| `500` | { success: false, error } |

### `/api/internal/provision-roles`

#### `POST /api/internal/provision-roles`

POST /api/internal/provision-roles — service-to-service only. Eagerly seeds this org's default QuikScale roles (system "admin" with full permissions + the default "Member" role). Called by the launcher's super-admin "grant app access" flow the moment QuikScale is enabled for an org, so the admin panel's role dropdown shows "admin" immediately instead of "No roles available" until someone first opens QuikScale. Optionally accepts `adminUserIds: string[]` — for each user id, an `app_quikscale.UserAppRole` row is upserted linking them to the seeded admin AppRole. Used by the super-admin "create org with admin" flow so the freshly-invited Org Admin has the admin role assigned the moment they accept the invite — no lazy-seed gap. The lazy seed in GET /api/me/permissions remains as the fallback — this endpoint just removes the provisioning-order gap. Idempotent (the seeder is in-process cached + only fills grants when empty; ensureUserOnRole skips on existing rows). Auth: shared INTERNAL_SECRET via `x-internal-secret` (mirrors verify-token-remote). Not a user session — no withOrgAuth.

| | |
|---|---|
| **Auth** | Service-to-service — `x-internal-secret` header must equal `INTERNAL_SECRET` |
| **Permission** | _none beyond auth_ |
| **Headers read** | `x-internal-secret` |
| **Source** | [app/api/internal/provision-roles/route.ts](../app/api/internal/provision-roles/route.ts) |

**Request body** — JSON, not validated by a Zod schema (see route).

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, adminRoleId, userRoleId, assignedAdminUserIds } |
| `400` | { success: false, error } |
| `401` | { success: false, error } |
| `500` | { success: false, error } |

---

## Module `kpi` <a id="module-kpi"></a>

_20 endpoints_

| Endpoint | Permission | Module gate |
|---|---|---|
| `GET /api/kpi` | `KPI:view` | `kpi` |
| `POST /api/kpi` | `KPI:create` | `kpi` |
| `GET /api/kpi/{id}` | `KPI:view` | `kpi` |
| `PUT /api/kpi/{id}` | `KPI:update` | `kpi` |
| `DELETE /api/kpi/{id}` | `KPI:delete` | `kpi` |
| `GET /api/kpi/{id}/audit` | — | `kpi` |
| `GET /api/kpi/{id}/logs` | — | `kpi` |
| `GET /api/kpi/{id}/notes` | — | `kpi` |
| `POST /api/kpi/{id}/notes` | — | `kpi` |
| `POST /api/kpi/{id}/restore` | — | `kpi` |
| `GET /api/kpi/{id}/summary` | — | `kpi` |
| `GET /api/kpi/{id}/weekly` | — | `kpi` |
| `POST /api/kpi/{id}/weekly` | — | `kpi` |
| `POST /api/kpi/{id}/weekly/batch` | — | `kpi` |
| `POST /api/kpi/bulk-restore` | — | `kpi` |
| `POST /api/kpi/duplicate-check` | `KPI:create` | `kpi` |
| `GET /api/kpi/export` | `KPI:view` | `kpi` |
| `GET /api/kpi/exported-lookup` | `KPI:view` | `kpi` |
| `POST /api/kpi/reorder` | `KPI:update` | `kpi` |
| `GET /api/kpi/years` | — | `kpi` |

### `/api/kpi`

#### `GET /api/kpi`

GET /api/kpi - List KPIs with filters and pagination

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `kpi` — 404 when the org has the module disabled |
| **Permission** | `KPI:view` |
| **Source** | [app/api/kpi/route.ts](../app/api/kpi/route.ts) |

**Query** — `includeDeleted`, `kpiLevel`, `limit`, `owner`, `page`, `pageSize`, `parentKPIId`, `quarter`, `scope`, `search`, `sortBy`, `sortOrder`, `status`, `teamId`, `teamIds`, `year`

**Validated query params** — `kpiListParamsSchema` (`lib/schemas/kpiSchema.ts`)

| Field | Type | Required |
|---|---|---|
| `page` | number — min 1, default 1 |  |
| `pageSize` | number — min 1, max 100, default 20 |  |
| `status` | enum: active \| paused \| completed |  |
| `kpiLevel` | enum: individual \| team |  |
| `scope` | enum: mine |  |
| `owner` | string |  |
| `teamId` | string |  |
| `parentKPIId` | string |  |
| `quarter` | enum: Q1 \| Q2 \| Q3 \| Q4 |  |
| `year` | number |  |
| `search` | string |  |
| `sortBy` | unknown — default "createdAt" |  |
| `sortOrder` | enum: asc \| desc — default "desc" |  |

**Responses**

| Status | Body |
|---|---|
| `200` | { success, data } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

#### `POST /api/kpi`

POST /api/kpi - Create KPI

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `kpi` — 404 when the org has the module disabled |
| **Permission** | `KPI:create` |
| **Rate limit** | handler bucket `kpi:create` (limit LIMITS.kpiWrite.limit) |
| **Source** | [app/api/kpi/route.ts](../app/api/kpi/route.ts) |

**Request body** — `createKPISchema` (`lib/schemas/kpiSchema.ts`)

| Field | Type | Required |
|---|---|---|
| `name` | string — min 1 | ✓ |
| `description` | string — nullable |  |
| `kpiLevel` | enum: individual \| team — default "individual" |  |
| `owner` | string — nullable |  |
| `ownerIds` | string[] |  |
| `ownerContributions` | record — min 0, max 100, nullable |  |
| `teamId` | string — nullable |  |
| `parentKPIId` | string — nullable |  |
| `quarter` | enum: Q1 \| Q2 \| Q3 \| Q4 | ✓ |
| `year` | number — min 2020, max 2099 | ✓ |
| `measurementUnit` | enum: Number \| Percentage \| Currency \| Ratio | ✓ |
| `target` | number — nullable |  |
| `quarterlyGoal` | number — nullable |  |
| `qtdGoal` | number — nullable |  |
| `status` | enum: active \| paused \| completed — default "active" |  |
| `divisionType` | enum: Cumulative \| Standalone — default "Cumulative" |  |
| `weeklyTargets` | record — nullable |  |
| `weeklyOwnerTargets` | record — nullable |  |
| `ownerKpiNames` | record — min 1, nullable |  |
| `currency` | string — nullable |  |
| `targetScale` | string — nullable |  |
| `unit` | string — nullable |  |
| `scaledDisplay` | boolean |  |
| `reverseColor` | boolean |  |
| `frequency` | enum: daily \| weekly \| monthly \| yearly — default "weekly" |  |
| `kpiType` | enum: NA \| Leading \| Lagging — default "NA" |  |
| `importedFromOpsp` | boolean |  |

- has cross-field `.refine()` rules

**Responses**

| Status | Body |
|---|---|
| `201` | { success: true, data, message }<br/>`data` — Prisma `kPI.create` result |
| `400` | { success: false, error } |
| `429` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/kpi/{id}`

#### `GET /api/kpi/{id}`

Push target / weekly-target changes from a Team KPI down to every child Individual KPI it created. Each child's `target` is `team.target × pct/100` and each child's `weeklyTargets` come from `weeklyOwnerTargets[owner]` (or scaled `weeklyTargets`).

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `kpi` — 404 when the org has the module disabled |
| **Permission** | `KPI:view` |
| **Source** | [app/api/kpi/[id]/route.ts](../app/api/kpi/[id]/route.ts) |

**Path params** — `id`

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data }<br/>`data` — Prisma `kPI.findUnique` result |
| `403` | { success: false, error } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

#### `PUT /api/kpi/{id}`

Push target / weekly-target changes from a Team KPI down to every child Individual KPI it created. Each child's `target` is `team.target × pct/100` and each child's `weeklyTargets` come from `weeklyOwnerTargets[owner]` (or scaled `weeklyTargets`).

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `kpi` — 404 when the org has the module disabled |
| **Permission** | `KPI:update` |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/kpi/[id]/route.ts](../app/api/kpi/[id]/route.ts) |

**Path params** — `id`

**Request body** — `updateKPISchema` (`lib/schemas/kpiSchema.ts`)

| Field | Type | Required |
|---|---|---|
| `name` | string — min 1 | ✓ |
| `description` | string — nullable |  |
| `kpiLevel` | enum: individual \| team |  |
| `owner` | string — nullable |  |
| `ownerIds` | string[] |  |
| `ownerContributions` | record — min 0, max 100, nullable |  |
| `teamId` | string — nullable |  |
| `parentKPIId` | string — nullable |  |
| `quarter` | enum: Q1 \| Q2 \| Q3 \| Q4 |  |
| `year` | number — min 2020, max 2099 |  |
| `measurementUnit` | enum: Number \| Percentage \| Currency \| Ratio |  |
| `target` | number — nullable |  |
| `quarterlyGoal` | number — nullable |  |
| `qtdGoal` | number — nullable |  |
| `status` | enum: active \| paused \| completed |  |
| `divisionType` | enum: Cumulative \| Standalone |  |
| `weeklyTargets` | record — nullable |  |
| `weeklyOwnerTargets` | record — nullable |  |
| `ownerKpiNames` | record — min 1, nullable |  |
| `currency` | string — nullable |  |
| `targetScale` | string — nullable |  |
| `unit` | string — nullable |  |
| `scaledDisplay` | boolean |  |
| `reverseColor` | boolean |  |
| `frequency` | enum: daily \| weekly \| monthly \| yearly |  |
| `kpiType` | enum: NA \| Leading \| Lagging |  |
| `resetWeeklyData` | boolean |  |
| `notifyReplacement` | boolean |  |

- has cross-field `.refine()` rules

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data, message }<br/>`data` — Prisma `kPI.update` result |
| `400` | { success: false, error } |
| `403` | { success: false, error } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

#### `DELETE /api/kpi/{id}`

Push target / weekly-target changes from a Team KPI down to every child Individual KPI it created. Each child's `target` is `team.target × pct/100` and each child's `weeklyTargets` come from `weeklyOwnerTargets[owner]` (or scaled `weeklyTargets`).

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `kpi` — 404 when the org has the module disabled |
| **Permission** | `KPI:delete` |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/kpi/[id]/route.ts](../app/api/kpi/[id]/route.ts) |

**Path params** — `id`

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, message } |
| `403` | { success: false, error } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/kpi/{id}/audit`

#### `GET /api/kpi/{id}/audit`

GET /api/kpi/[id]/audit — full Change History timeline for one KPI. Reads the centralized AuditEvent + AuditChange tables (the new system). Returns the complete per-entity timeline newest-first; the Change History panel does its own client-side filtering (All/Create/Update/Delete tabs), search, and tab counts, so the API stays a simple, cacheable read. `actorName` is denormalized on the event, so no user join is needed — the name reflects who acted AT THE TIME of the event. Uses findUnique (NOT findFirst) for the KPI existence check so soft-deleted KPIs can still have their history viewed (the soft-delete middleware only filters findMany/findFirst/count).

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `kpi` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Source** | [app/api/kpi/[id]/audit/route.ts](../app/api/kpi/[id]/audit/route.ts) |

**Path params** — `id`

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data, meta }<br/>`data` — Prisma `auditEvent.findMany` result |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/kpi/{id}/logs`

#### `GET /api/kpi/{id}/logs`

GET /api/kpi/[id]/logs - Get audit logs for a KPI

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `kpi` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Source** | [app/api/kpi/[id]/logs/route.ts](../app/api/kpi/[id]/logs/route.ts) |

**Path params** — `id`

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data }<br/>`data` inferred from `.map()` projection: `...l`, `changedByName` |
| `403` | { success: false, error } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/kpi/{id}/notes`

#### `GET /api/kpi/{id}/notes`

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `kpi` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Source** | [app/api/kpi/[id]/notes/route.ts](../app/api/kpi/[id]/notes/route.ts) |

**Path params** — `id`

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data }<br/>`data` — Prisma `kPINote.findMany` result |
| `403` | { success: false, error } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

#### `POST /api/kpi/{id}/notes`

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `kpi` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/kpi/[id]/notes/route.ts](../app/api/kpi/[id]/notes/route.ts) |

**Path params** — `id`

**Request body** — `kpiNoteSchema` (`lib/schemas/kpiSchema.ts`)

| Field | Type | Required |
|---|---|---|
| `content` | string — min 1 | ✓ |

**Responses**

| Status | Body |
|---|---|
| `201` | { success: true, data, message }<br/>`data` — Prisma `kPINote.create` result |
| `400` | { success: false, error } |
| `403` | { success: false, error } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/kpi/{id}/restore`

#### `POST /api/kpi/{id}/restore`

POST /api/kpi/[id]/restore — unset deletedAt, bring row back into active set.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `kpi` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/kpi/[id]/restore/route.ts](../app/api/kpi/[id]/restore/route.ts) |

**Path params** — `id`

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, message } |
| `200` | { success: true, data }<br/>`data` — Prisma `kPI.update` result |
| `400` | { success: false, error } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/kpi/{id}/summary`

#### `GET /api/kpi/{id}/summary`

GET /api/kpi/[id]/summary — compact KPI projection for AI Runtime context. Distinct from GET /api/kpi/[id] which returns the full row (~25 fields, verbose for LLM input). This endpoint returns only the fields agents need to reason about a KPI: identity, ownership, current quarter targets vs achieved, health, last 8 weekly entries, and a deep-link URL. PII: owner_user select is restricted to id/firstName/lastName — email is never read from the DB, so it cannot leak into logs or error messages. Deeper PII scrubbing (e.g. of user-authored `lastNotes`) is the AI Runtime layer's responsibility per v3.0 handoff §7.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `kpi` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Source** | [app/api/kpi/[id]/summary/route.ts](../app/api/kpi/[id]/summary/route.ts) |

**Path params** — `id`

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: { id, name, kpiLevel, owner_user, quarter, year, measurementUnit, target, qtdAchieved, progressPercent, healthStatus, lastNotes, weeklyValues, url } } |
| `403` | { success: false, error } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/kpi/{id}/weekly`

#### `GET /api/kpi/{id}/weekly`

GET /api/kpi/[id]/weekly For individual KPIs: returns each weekly row as-is (one per week, already aggregated). For team KPIs: returns per-owner weekly rows (each owner's row per week) — the caller is expected to aggregate by weekNumber if they want the total. The GET /api/kpi (list) endpoint handles aggregation automatically for table display.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `kpi` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Source** | [app/api/kpi/[id]/weekly/route.ts](../app/api/kpi/[id]/weekly/route.ts) |

**Path params** — `id`

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data }<br/>`data` — Prisma `kPIWeeklyValue.findMany` result |
| `403` | { success: false, error } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

#### `POST /api/kpi/{id}/weekly`

POST /api/kpi/[id]/weekly Upserts a weekly value for a specific (kpiId, userId, weekNumber) triple. Body: { weekNumber, value, notes, userId? } userId handling: - Individual KPI: userId is inferred from kpi.owner if omitted - Team KPI: userId is required (must be one of kpi.ownerIds) Authorization: handled exclusively by the RBAC v2 `KPI:update` / `TeamKPI:update` gate enforced by the route wrapper. No in-handler owner/role check. On success, re-aggregates qtdAchieved as the SUM of all weekly values for the KPI and recomputes progressPercent + healthStatus. The upsert + recompute core lives in `@/lib/services/kpiWeeklyValue` so the automation endpoint (internal/actions/enter-kpi-value) shares it verbatim.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `kpi` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/kpi/[id]/weekly/route.ts](../app/api/kpi/[id]/weekly/route.ts) |

**Path params** — `id`

**Request body** — `weeklyValueSchema` (`lib/schemas/kpiSchema.ts`)

| Field | Type | Required |
|---|---|---|
| `weekNumber` | number — min 1 | ✓ |
| `value` | number — nullable |  |
| `notes` | string — nullable |  |
| `userId` | string — nullable |  |

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data }<br/>`data` — Prisma `kPIWeeklyValue.findFirst` result |
| `400` | { success: false, error } |
| `403` | { success: false, error } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/kpi/{id}/weekly/batch`

#### `POST /api/kpi/{id}/weekly/batch`

POST /api/kpi/[id]/weekly/batch Body: { inputs: WeeklyValueInput[] } Performs all upserts for (kpiId, userId, weekNumber) triples in a single request. Per-input permission check + past-week gate; failures don't abort the batch — they're reported back per-input. KPI aggregate (progressPercent, healthStatus, currentWeekValue) recomputed ONCE after all upserts. Linked Team ↔ Individual KPI sync mirrors the single-week route: for each applied input, write to both the primary KPI and its linked partner.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `kpi` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/kpi/[id]/weekly/batch/route.ts](../app/api/kpi/[id]/weekly/batch/route.ts) |

**Path params** — `id`

**Request body** — `weeklyValueBatchSchema` (`lib/schemas/kpiSchema.ts`)

| Field | Type | Required |
|---|---|---|
| `inputs` | array — min 1 | ✓ |

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: { applied, failed, results } } |
| `400` | { success: false, error } |
| `403` | { success: false, error } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/kpi/bulk-restore`

#### `POST /api/kpi/bulk-restore`

POST /api/kpi/bulk-restore body: { ids: string[] }

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `kpi` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/kpi/bulk-restore/route.ts](../app/api/kpi/bulk-restore/route.ts) |

**Request body** — JSON, not validated by a Zod schema (see route).

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: { restored } } |
| `400` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/kpi/duplicate-check`

#### `POST /api/kpi/duplicate-check`

POST /api/kpi/duplicate-check Similarity warning for the OPSP "Export → Create KPIs" flow. Uses Gemini to flag a KPI whose name means the SAME thing as one that already exists — ACROSS USERS, not just the current owner — so people don't unknowingly recreate a metric a teammate already tracks. This is an advisory warning, never a hard block: the client decides (Cancel / Skip / Replace). Flow: 1. DB pre-filter — same quarter + year, org-wide (all owners). 2. Gemini semantic name comparison across the candidates. 3. Return the matched existing KPI (with its owner's name). The AI step NEVER blocks creation. If every Gemini key fails (expired / quota), the route returns `{ aiUnavailable: true }` and the client shows the "we couldn't check — export anyway?" confirm. Responses (all 200, `{ success: true, data }`): - `{ match: <kpi+ownerName> }` — a similar KPI exists; warn the user. - `{ match: null }` — nothing similar; safe to create. - `{ aiUnavailable: true }` — AI check could not run.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `kpi` — 404 when the org has the module disabled |
| **Permission** | `KPI:create` |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/kpi/duplicate-check/route.ts](../app/api/kpi/duplicate-check/route.ts) |

**Request body** — `duplicateCheckSchema` (`lib/schemas/duplicateCheckSchema.ts`)

| Field | Type | Required |
|---|---|---|
| `name` | string — min 1 | ✓ |
| `owner` | string — min 1 | ✓ |
| `quarter` | enum: Q1 \| Q2 \| Q3 \| Q4 | ✓ |
| `year` | number — min 2020, max 2099 | ✓ |
| `frequency` | enum: daily \| weekly \| monthly \| yearly | ✓ |
| `measurementUnit` | enum: Number \| Percentage \| Currency \| Ratio | ✓ |
| `target` | number — nullable |  |
| `divisionType` | enum: Cumulative \| Standalone | ✓ |
| `reverseColor` | boolean |  |

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: { match } } |
| `200` | { success: true, data: { aiUnavailable } } |
| `400` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/kpi/export`

#### `GET /api/kpi/export`

GET /api/kpi/export — Global Export for Individual + Team KPI. Query params: format "xlsx" | "pdf" (default xlsx) columns comma-separated col keys (empty → all) level "individual" | "team" (default individual) year fiscal year (required) quarters "Q1" or "Q1,Q2,Q3,Q4" (required — one per exported sheet) owner, teamId, teamIds, includeDeleted standard KPI filters The interval is a fiscal YEAR + one or more QUARTERS. Each quarter becomes its OWN sheet (xlsx tab) / section (pdf), with that quarter's own Week 1..N columns (week count resolved per-quarter from QuarterSetting). Full-year = all four quarters. Rows are scoped + visibility-filtered per quarter via the SAME `buildKpiScopeWhere` the list route uses. Node runtime.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `kpi` — 404 when the org has the module disabled |
| **Permission** | `KPI:view` |
| **Source** | [app/api/kpi/export/route.ts](../app/api/kpi/export/route.ts) |

**Query** — `includeDeleted`, `level`, `owner`, `teamId`, `teamIds`

**Validated query params** — `exportBaseSchema` (`lib/exports/exportParams.ts`)

| Field | Type | Required |
|---|---|---|
| `columns` | unknown |  |

**Validated query params** — `quarterRangeSchema` (`lib/exports/exportParams.ts`)

| Field | Type | Required |
|---|---|---|
| `year` | number (coerced) — min 2000, max 3000 | ✓ |
| `quarters` | enum: Q1 \| Q2 \| Q3 \| Q4 — min 1 |  |

**Responses**

| Status | Body |
|---|---|
| `400` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/kpi/exported-lookup`

#### `GET /api/kpi/exported-lookup`

GET /api/kpi/exported-lookup?owner=&quarter=&year= Lightweight, DB-level lookup powering the OPSP "Export → Create KPIs" Previously-Exported / New tabs. Returns ONLY the columns categorization needs, for every individual KPI this owner has in the quarter — a single indexed query with NO pagination cap (unlike the heavy list endpoint, which caps pageSize at 100 and decorates audit/weekly data we don't need here).

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `kpi` — 404 when the org has the module disabled |
| **Permission** | `KPI:view` |
| **Source** | [app/api/kpi/exported-lookup/route.ts](../app/api/kpi/exported-lookup/route.ts) |

**Query** — `owner`, `quarter`, `year`

**Validated query params** — `paramsSchema` (inline)

| Field | Type | Required |
|---|---|---|
| `owner` | string — min 1 | ✓ |
| `quarter` | enum: Q1 \| Q2 \| Q3 \| Q4 | ✓ |
| `year` | number (coerced) — min 2020, max 2099 | ✓ |

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: { items } } |
| `400` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/kpi/reorder`

#### `POST /api/kpi/reorder`

POST /api/kpi/reorder — move a KPI row to a new manual position (org-shared).

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `kpi` — 404 when the org has the module disabled |
| **Permission** | `KPI:update` |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/kpi/reorder/route.ts](../app/api/kpi/reorder/route.ts) |

**Request body** — `reorderRowSchema` (`lib/schemas/reorderSchema.ts`)

| Field | Type | Required |
|---|---|---|
| `id` | string — min 1 | ✓ |
| `beforeId` | string — min 1, nullable | ✓ |
| `afterId` | string — min 1, nullable | ✓ |

**Responses**

_Handler delegates to `handleReorder()`._

| Status | Body |
|---|---|
| `200` | { success: true, data: { id, position } } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/kpi/years`

#### `GET /api/kpi/years`

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `kpi` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Source** | [app/api/kpi/years/route.ts](../app/api/kpi/years/route.ts) |

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

---

## Module `me` <a id="module-me"></a>

_4 endpoints_

| Endpoint | Permission | Module gate |
|---|---|---|
| `GET /api/me/permissions` | — | — |
| `GET /api/me/tour-status` | — | — |
| `POST /api/me/tour-status` | — | — |
| `DELETE /api/me/tour-status` | — | — |

### `/api/me/permissions`

#### `GET /api/me/permissions`

GET /api/me/permissions Returns the current user's effective permission set for QuikScale in the active org. Used by the client-side gate (sidebar filter, button hide, route guards). Cached at the React-Query level — no need to fetch per action. SIDE EFFECT — seed bootstrap: every authenticated client mounts the `useMyPermissions` hook, which fires this endpoint. We use it as a cheap "on-app-startup" hook to call `seedAllDefaultRoles(orgId)`, which: - creates the org's admin AppRole + grants on first call - creates the org's default "User" AppRole + grants on first call - backfills any legacy OPSP RolePermission rows once The seed is in-process cached per org for 5min, so the real DB work happens once per process per org. SELF-SERVE BIND: self-serve registration creates the Org + an org_admin membership but never runs the invite/provision flows (POST /api/org/users, /api/internal/provision-roles, invitation accept) that bind a user to an app role. Without a UserAppRole the admin lands with zero permissions — an empty sidebar. So if the caller is an org/super admin and holds no QuikScale role yet, bind them to the freshly-seeded admin role here. Idempotent; the other binding flows still own their cases.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Permission** | _none beyond auth_ |
| **Source** | [app/api/me/permissions/route.ts](../app/api/me/permissions/route.ts) |

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/me/tour-status`

#### `GET /api/me/tour-status`

Onboarding-tour completion flag for the signed-in user in their active org. Stored as row-existence in the generic `QsUserViewPref` table (no boolean column): present = completed. The client treats this endpoint as the single source of truth and fails closed on any error, so a 500 here suppresses the tour rather than replaying it on every login.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Permission** | _none beyond auth_ |
| **Source** | [app/api/me/tour-status/route.ts](../app/api/me/tour-status/route.ts) |

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: { completed } } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

#### `POST /api/me/tour-status`

Mark the tour complete. Idempotent via the `(userId, orgId, viewKey)` unique index — an upsert rather than find-then-create so two tabs finishing at once can't race into a duplicate-key error.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Permission** | _none beyond auth_ |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/me/tour-status/route.ts](../app/api/me/tour-status/route.ts) |

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: { completed } } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

#### `DELETE /api/me/tour-status`

Reset the flag so the tour runs again ("Take the tour again").

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Permission** | _none beyond auth_ |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/me/tour-status/route.ts](../app/api/me/tour-status/route.ts) |

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: { completed } } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

---

## Module `metrics` <a id="module-metrics"></a>

_1 endpoint_

| Endpoint | Permission | Module gate |
|---|---|---|
| `GET /api/metrics` | — | — |

### `/api/metrics`

#### `GET /api/metrics`

GET /api/metrics — Prometheus scrape endpoint. Requires METRICS_TOKEN env var in production. Prometheus scraper must pass `Authorization: Bearer <token>` header.

| | |
|---|---|
| **Auth** | `Authorization: Bearer <METRICS_TOKEN>` |
| **Permission** | _none beyond auth_ |
| **Headers read** | `authorization` |
| **Source** | [app/api/metrics/route.ts](../app/api/metrics/route.ts) |

**Responses**

| Status | Body |
|---|---|
| `200` | raw body (non-JSON) |
| `401` | { error } |
| `403` | { error } |

---

## Module `opsp` <a id="module-opsp"></a>

_19 endpoints_

| Endpoint | Permission | Module gate |
|---|---|---|
| `GET /api/opsp` | `OPSP.Create:view` | `opsp.create` |
| `POST /api/opsp` | `OPSP.Create:create` | `opsp.create` |
| `PUT /api/opsp` | `OPSP.Create:view` | `opsp.create` |
| `GET /api/opsp/config` | — | `opsp` |
| `GET /api/opsp/deadline` | — | — |
| `GET /api/opsp/edit-log` | — | `opsp` |
| `POST /api/opsp/edit-log` | — | `opsp` |
| `PATCH /api/opsp/edit-log` | — | `opsp` |
| `GET /api/opsp/history` | `OPSP.History:view` | `opsp.history` |
| `GET /api/opsp/review` | `OPSP.Review:view` | `opsp.review` |
| `POST /api/opsp/review` | `OPSP.Review:update` | `opsp.review` |
| `GET /api/opsp/review-ack` | — | `opsp` |
| `POST /api/opsp/review-ack` | — | `opsp` |
| `GET /api/opsp/review/critical` | `OPSP.Review.Critical:view` | `opsp.review` |
| `POST /api/opsp/review/critical` | `OPSP.Review.Critical:update` | `opsp.review` |
| `GET /api/opsp/review/critical/audit` | `OPSP.Review.Critical:view` | `opsp.review` |
| `GET /api/opsp/review/logs` | — | — |
| `POST /api/opsp/review/secondary` | `OPSP.Review:update` | `opsp.review` |
| `POST /api/opsp/review/submit` | — | `opsp` |

### `/api/opsp`

#### `GET /api/opsp`

── GET: load OPSP data for current user + year + quarter ── When the target quarter has no record yet, look up the immediately prior quarter; if THAT is `finalized` or `reviewed`, return its data with the four quarterly-specific fields cleared. The synthesised payload is NOT persisted server-side — the client's `skipNextSave` guard means autosave only writes once the user actually edits something. So the prior data is just the starting point for the new quarter, exactly like the user asked: "bakhi sab Prefilled aana chaheya".

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `opsp.create` — 404 when the org has the module disabled |
| **Permission** | `OPSP.Create:view` |
| **Source** | [app/api/opsp/route.ts](../app/api/opsp/route.ts) |

**Query** — `quarter`, `targetUserId`, `year`

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: { ...data, ...sectionFields }, ownerNames, sectionUserId, responsibleAdminName, fiscalYearStart } |
| `200` | { success: true, data, ownerNames, sectionUserId, responsibleAdminName, inherited, fiscalYearStart }<br/>`data` inferred from object literal: `...carry`, `year`, `quarter`, `status`, `actionsQtr`, `rocks`, `...(isYearBoundary ? { goalRows: [], keyIni`, `...sectionFields` |
| `200` | { success: true, data, ownerNames, sectionUserId, responsibleAdminName, fiscalYearStart } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

#### `POST /api/opsp`

── POST: finalize ──

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `opsp.create` — 404 when the org has the module disabled |
| **Permission** | `OPSP.Create:create` |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/opsp/route.ts](../app/api/opsp/route.ts) |

**Request body** — `opspFinalizeSchema` (`lib/schemas/opspSchema.ts`)

| Field | Type | Required |
|---|---|---|
| `year` | union | ✓ |
| `quarter` | enum: Q1 \| Q2 \| Q3 \| Q4 | ✓ |

**Responses**

| Status | Body |
|---|---|
| `201` | { success: true, data: { count } } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

#### `PUT /api/opsp`

── PUT: upsert (autosave) ── Gated on `view` (not `update`): any user who can VIEW the OPSP may save their OWN per-user sections (Accountability / Priorities / Critical #s). Writing the STRATEGIC plan additionally requires `OPSP.Create:create` (enforced per-field below), and editing ANOTHER user's sections requires `OPSP.EditUser:update` (via resolveSectionUserId).

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `opsp.create` — 404 when the org has the module disabled |
| **Permission** | `OPSP.Create:view` |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/opsp/route.ts](../app/api/opsp/route.ts) |

**Request body** — `opspUpsertSchema` (`lib/schemas/opspSchema.ts`)

| Field | Type | Required |
|---|---|---|
| `year` | union | ✓ |
| `quarter` | enum: Q1 \| Q2 \| Q3 \| Q4 | ✓ |

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data, savedAt }<br/>`data` — Prisma `oPSPData.upsert` result |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/opsp/config`

#### `GET /api/opsp/config`

GET /api/opsp/config Returns the OPSP plan configuration for the current user: - startYear: year of the earliest OPSPData record - targetYears: target duration (3-5) - endYear: startYear + targetYears - 1 - hasSetup: whether any OPSP record exists (wizard completed) - fiscalYearStart: tenant setting

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `opsp` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Source** | [app/api/opsp/config/route.ts](../app/api/opsp/config/route.ts) |

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, hasSetup, startYear, endYear, targetYears, startQuarter, fiscalYearStart, reviewedQuarters } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/opsp/deadline`

#### `GET /api/opsp/deadline`

GET /api/opsp/deadline Returns BOTH banner payloads for the current user's OPSP — see OPSP_THRESHOLD_LOGIC.md for the full spec. Response shape: { success: true, finalize: { mode: "A"|"B", show: true, daysLeft, message, period, ... } | null, review: { show: true, daysUntilQuarterEnd, isOverdue, message, period } | null, autoFinalized?: { message } } Mode A (Finalize): anchored on `OPSPData.createdAt`. Requires the `opsp_threshold_days` FeatureFlag to be explicitly set. Lazy auto-finalize when the deadline is breached. Mode B (Finalize): fallback when Mode A doesn't apply. Anchored on the tenant's `QuarterSetting.endDate`. Default lead time of 5 days when no threshold is configured. No auto-finalize — overdue message persists. Review: anchored on quarter end. `opsp_review_threshold_days` has NO default (silence when not configured). Quarter-end resolved via strict QuarterSetting lookup, then fiscal-year flex, then synthetic calendar quarter as last-ditch fallback. Returns `{ success: true, finalize: null, review: null }` for unauthenticated users (no 401) because the dashboard layout calls this unconditionally.

| | |
|---|---|
| **Auth** | Hand-rolled `getServerSession` check |
| **Permission** | _none beyond auth_ |
| **Source** | [app/api/opsp/deadline/route.ts](../app/api/opsp/deadline/route.ts) |

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, finalize, review } |
| `200` | { success: true, finalize, review, autoFinalized } |
| `500` | { success: false, error } |

### `/api/opsp/edit-log`

#### `GET /api/opsp/edit-log`

GET — list this OPSP's field-edit history for the drawer.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `opsp` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Source** | [app/api/opsp/edit-log/route.ts](../app/api/opsp/edit-log/route.ts) |

**Query** — `quarter`, `year`

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: [] } |
| `200` | { success: true, data } |
| `400` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

#### `POST /api/opsp/edit-log`

POST — record one field change made while editing a finalized OPSP.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `opsp` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/opsp/edit-log/route.ts](../app/api/opsp/edit-log/route.ts) |

**Request body** — JSON, not validated by a Zod schema (see route).

**Responses**

| Status | Body |
|---|---|
| `201` | { success: true } |
| `400` | { success: false, error } |
| `403` | { success: false, error } |
| `404` | { success: false, error } |
| `409` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

#### `PATCH /api/opsp/edit-log`

PATCH — edit the note (reason) on an existing edit-log entry.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `opsp` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/opsp/edit-log/route.ts](../app/api/opsp/edit-log/route.ts) |

**Request body** — JSON, not validated by a Zod schema (see route).

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true } |
| `400` | { success: false, error } |
| `403` | { success: false, error } |
| `404` | { success: false, error } |
| `409` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/opsp/history`

#### `GET /api/opsp/history`

GET /api/opsp/history?year=2026 Returns all OPSP records for the logged-in user's tenant for the given fiscal year, plus available fiscal years and tenant fiscal config.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `opsp.history` — 404 when the org has the module disabled |
| **Permission** | `OPSP.History:view` |
| **Source** | [app/api/opsp/history/route.ts](../app/api/opsp/history/route.ts) |

**Query** — `year`

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data, availableYears, initializedQuarters, fiscalYearStart }<br/>`data` — Prisma `oPSPData.findMany` result |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/opsp/review`

#### `GET /api/opsp/review`

GET /api/opsp/review?year=2026&quarter=Q1&horizon=quarter Loads the OPSP source rows (actions/goals/targets) for the current user and merges in any saved review entries (achieved values). Gated on OPSP.Review:view — admins hold the grant; a non-admin granted OPSP.Review can view the (org-shared) review data read-only.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `opsp.review` — 404 when the org has the module disabled |
| **Permission** | `OPSP.Review:view` |
| **Source** | [app/api/opsp/review/route.ts](../app/api/opsp/review/route.ts) |

**Query** — `horizon`, `quarter`, `year`

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: { opspId, opspStatus, rows, secondaryRows, year, quarter, horizon } } |
| `200` | { success: true, data: { opspId, opspStatus, targetYears, rows, secondaryRows, year, quarter, horizon, fiscalYearStart } } |
| `400` | { success: false, error } |
| `500` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

#### `POST /api/opsp/review`

POST /api/opsp/review Saves review entries for one category row (all periods at once). Called when the user clicks "Save" in the review modal. Requires OPSP.Review:update.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `opsp.review` — 404 when the org has the module disabled |
| **Permission** | `OPSP.Review:update` |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/opsp/review/route.ts](../app/api/opsp/review/route.ts) |

**Request body** — `opspReviewSaveSchema` (`lib/schemas/opspReviewSchema.ts`)

| Field | Type | Required |
|---|---|---|
| `year` | union | ✓ |
| `quarter` | enum: Q1 \| Q2 \| Q3 \| Q4 | ✓ |
| `horizon` | unknown | ✓ |
| `rowIndex` | number — min 0, max 20 | ✓ |
| `category` | string — min 1 | ✓ |
| `entries` | array — min 1, max 5 | ✓ |

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data } |
| `404` | { success: false, error } |
| `500` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/opsp/review-ack`

#### `GET /api/opsp/review-ack`

OPSP post-finalize "Mark as Reviewed" acknowledgement. Persists the per-user high-water mark in `AuditEventRead` so it survives logout (which clears localStorage) and works cross-device. The stored `lastReadAt` is the timestamp of the latest edit the user acknowledged; the client shows the post-finalize highlight only while a newer edit exists. GET ?year=&quarter=&surface= → { ackedTs:number } (0 if never acked) POST { year, quarter, surface, ackedTs } → { ackedTs:number } Scoped to the acting user (session) + org. Gated on the OPSP module so both form editors and reviewers can record their own mark.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `opsp` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Source** | [app/api/opsp/review-ack/route.ts](../app/api/opsp/review-ack/route.ts) |

**Query** — `quarter`, `surface`, `year`

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: { ackedTs } } |
| `400` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

#### `POST /api/opsp/review-ack`

OPSP post-finalize "Mark as Reviewed" acknowledgement. Persists the per-user high-water mark in `AuditEventRead` so it survives logout (which clears localStorage) and works cross-device. The stored `lastReadAt` is the timestamp of the latest edit the user acknowledged; the client shows the post-finalize highlight only while a newer edit exists. GET ?year=&quarter=&surface= → { ackedTs:number } (0 if never acked) POST { year, quarter, surface, ackedTs } → { ackedTs:number } Scoped to the acting user (session) + org. Gated on the OPSP module so both form editors and reviewers can record their own mark.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `opsp` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/opsp/review-ack/route.ts](../app/api/opsp/review-ack/route.ts) |

**Request body** — JSON, not validated by a Zod schema (see route).

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: { ackedTs } } |
| `400` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/opsp/review/critical`

#### `GET /api/opsp/review/critical`

GET /api/opsp/review/critical?year=&quarter= Returns all 6 CritCards (3 modules × 2 cardTypes) + saved review entries for the (year, quarter) OPSP.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `opsp.review` — 404 when the org has the module disabled |
| **Permission** | `OPSP.Review.Critical:view` |
| **Source** | [app/api/opsp/review/critical/route.ts](../app/api/opsp/review/critical/route.ts) |

**Query** — `quarter`, `targetUserId`, `year`

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: { opspId, opspStatus, modules, entries, year, quarter } } |
| `200` | { success: true, data: { opspId, opspStatus, modules, entries, year, quarter, subjectUserId } } |
| `500` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

#### `POST /api/opsp/review/critical`

POST /api/opsp/review/critical Body: { year, quarter, module: "actions" | "year" | "people", cardType: "critical" | "balancing", category: string, (the CritCard title, for audit) achievedValue: number | null, comment: string | null, } Upserts a single OPSPReviewEntry per (module, cardType). Achieved + Comment are saved together.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `opsp.review` — 404 when the org has the module disabled |
| **Permission** | `OPSP.Review.Critical:update` |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/opsp/review/critical/route.ts](../app/api/opsp/review/critical/route.ts) |

**Request body** — JSON, not validated by a Zod schema (see route).

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: { module, cardType, achievedValue, comment } } |
| `400` | { success: false, error } |
| `404` | { success: false, error } |
| `500` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/opsp/review/critical/audit`

#### `GET /api/opsp/review/critical/audit`

GET /api/opsp/review/critical/audit?entityId=<opspId>:<period> Full Change History timeline for ONE Critical # / Balancing Critical # card, read from the centralized AuditEvent + AuditChange tables (the same system KPI/Priority/WWW use). Mirrors /api/priority/[id]/audit, but takes the composite entityId as a query param (it contains colons) and re-derives the SAME per-card authorization the write route enforces: - year / actions → org-level criticals, admin only - people:<id> → self, or another user with OPSP.EditUser:update Gated by OPSP.Review.Critical:view + the opsp.review feature flag, so a critical-only (non-admin) reviewer can read their OWN card's history — which the admin-gated /api/audit-logs endpoint never allowed.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `opsp.review` — 404 when the org has the module disabled |
| **Permission** | `OPSP.Review.Critical:view` |
| **Source** | [app/api/opsp/review/critical/audit/route.ts](../app/api/opsp/review/critical/audit/route.ts) |

**Query** — `entityId`

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data, meta }<br/>`data` — Prisma `auditEvent.findMany` result |
| `400` | { success: false, error } |
| `404` | { success: false, error } |
| `500` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/opsp/review/logs`

#### `GET /api/opsp/review/logs`

GET /api/opsp/review/logs?opspId=xxx&horizon=quarter&rowIndex=0 Returns audit log entries for a specific OPSP review row. Used by the "Logs" icon column in the OPSP Review table.

| | |
|---|---|
| **Auth** | Org-admin guard (`requireAdmin`) |
| **Permission** | _none beyond auth_ |
| **Source** | [app/api/opsp/review/logs/route.ts](../app/api/opsp/review/logs/route.ts) |

**Query** — `horizon`, `opspId`, `rowIndex`

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data }<br/>`data` — Prisma `auditLog.findMany` result |
| `400` | { success: false, error } |
| `500` | { success: false, error } |

### `/api/opsp/review/secondary`

#### `POST /api/opsp/review/secondary`

POST /api/opsp/review/secondary Saves status + comment for a secondary review row (rocks / key initiatives / key thrusts). Uses OPSPReviewEntry with period="secondary". Requires OPSP.Review:update.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `opsp.review` — 404 when the org has the module disabled |
| **Permission** | `OPSP.Review:update` |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/opsp/review/secondary/route.ts](../app/api/opsp/review/secondary/route.ts) |

**Request body** — `opspReviewSecondarySaveSchema` (`lib/schemas/opspReviewSchema.ts`)

| Field | Type | Required |
|---|---|---|
| `year` | union | ✓ |
| `quarter` | enum: Q1 \| Q2 \| Q3 \| Q4 | ✓ |
| `horizon` | unknown | ✓ |
| `rowIndex` | number — min 0, max 50 | ✓ |
| `category` | string — min 1 | ✓ |
| `status` | string — nullable |  |
| `comment` | string — nullable |  |

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: { rowIndex, status, comment } } |
| `404` | { success: false, error } |
| `500` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/opsp/review/submit`

#### `POST /api/opsp/review/submit`

POST /api/opsp/review/submit Marks an OPSP as fully reviewed for a fiscal period. Two effects: 1. Locks the review surface for that period. 2. Unlocks the next quarter in the OPSP create page (the page reads the list of reviewed periods from /api/opsp/config and uses it to gate the Quarter buttons). Pre-condition: the OPSP must already be `finalized`. We don't enforce row-level completeness on the server — the submit button is only enabled in the UI when every Action has an achieved value and every Rock has a status. Client-side gate + server-side state transition is the same pattern as Finalize. Body: { year, quarter }

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `opsp` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/opsp/review/submit/route.ts](../app/api/opsp/review/submit/route.ts) |

**Request body** — JSON, not validated by a Zod schema (see route).

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: { year, quarter, status } } |
| `400` | { success: false, error } |
| `404` | { success: false, error } |
| `409` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

---

## Module `org` <a id="module-org"></a>

_37 endpoints_

| Endpoint | Permission | Module gate |
|---|---|---|
| `GET /api/org/fiscal-years` | — | `kpi` |
| `GET /api/org/info` | — | — |
| `POST /api/org/invitations` | — | — |
| `GET /api/org/memberships` | — | — |
| `GET /api/org/quarter-settings` | — | `kpi` |
| `GET /api/org/quarters` | — | `orgSetup.quarters` |
| `POST /api/org/quarters` | — | `orgSetup.quarters` |
| `DELETE /api/org/quarters` | — | `orgSetup.quarters` |
| `PUT /api/org/quarters/{id}` | — | `orgSetup.quarters` |
| `DELETE /api/org/quarters/{id}` | — | `orgSetup.quarters` |
| `GET /api/org/roles` | `User:view` | `orgSetup.users` |
| `POST /api/org/roles` | `User:create` | `orgSetup.users` |
| `GET /api/org/roles/{id}` | `User:view` | `orgSetup.users` |
| `PATCH /api/org/roles/{id}` | `User:update` | `orgSetup.users` |
| `DELETE /api/org/roles/{id}` | `User:delete` | `orgSetup.users` |
| `GET /api/org/roles/{id}/members` | `User:view` | `orgSetup.users` |
| `PUT /api/org/roles/{id}/members` | `User:update` | `orgSetup.users` |
| `GET /api/org/roles/{id}/permissions` | `User:view` | `orgSetup.users` |
| `PUT /api/org/roles/{id}/permissions` | `User:update` | `orgSetup.users` |
| `POST /api/org/select` | — | — |
| `GET /api/org/teams` | — | `orgSetup.teams` |
| `POST /api/org/teams` | — | `orgSetup.teams` |
| `PUT /api/org/teams/{id}` | — | `orgSetup.teams` |
| `DELETE /api/org/teams/{id}` | — | `orgSetup.teams` |
| `POST /api/org/teams/{id}/members` | — | `orgSetup.teams` |
| `DELETE /api/org/teams/{id}/members/{userId}` | — | `orgSetup.teams` |
| `POST /api/org/teams/{id}/restore` | — | `orgSetup.teams` |
| `POST /api/org/teams/bulk-restore` | — | `orgSetup.teams` |
| `GET /api/org/users` | `User:view` | `orgSetup.users` |
| `POST /api/org/users` | `User:create` | `orgSetup.users` |
| `PUT /api/org/users/{id}` | `User:update` | `orgSetup.users` |
| `DELETE /api/org/users/{id}` | `User:delete` | `orgSetup.users` |
| `GET /api/org/users/{id}/permissions` | `User:view` | `orgSetup.users` |
| `POST /api/org/users/{id}/permissions` | `User:update` | `orgSetup.users` |
| `PATCH /api/org/users/{id}/role` | `User:update` | `orgSetup.users` |
| `PATCH /api/org/users/{id}/status` | `User:update` | `orgSetup.users` |
| `GET /api/org/users/search` | `User:view` | `orgSetup.users` |

### `/api/org/fiscal-years`

#### `GET /api/org/fiscal-years`

GET /api/org/fiscal-years Lightweight tenant-scoped endpoint used by the shared FiscalPeriodPicker. Returns only the fiscal years + configured quarters from QuarterSetting — no feature gate so every module (KPI, Priority, Dashboard, OPSP, modals) can consume a single source of truth for the FY/Quarter picker. Response: { success: true, data: { years: number[], configured: Array<{ year: number; quarter: string }> } }

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `kpi` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Source** | [app/api/org/fiscal-years/route.ts](../app/api/org/fiscal-years/route.ts) |

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: { years, configured } } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/org/info`

#### `GET /api/org/info`

GET /api/org/info Returns the current tenant's basic info (id, name, slug). Used by the OPSP preview to render the tenant name in the document's "Organization:" blue-band field. Lightweight read — no joins, no perms beyond the standard tenant-auth guard.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Permission** | _none beyond auth_ |
| **Source** | [app/api/org/info/route.ts](../app/api/org/info/route.ts) |

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data }<br/>`data` — Prisma `org.findUnique` result |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/org/invitations`

#### `POST /api/org/invitations`

POST /api/org/invitations Accept or decline a pending invitation. Body: { membershipId: string, action: "accept" | "decline" }

| | |
|---|---|
| **Auth** | Hand-rolled `getServerSession` check |
| **Permission** | _none beyond auth_ |
| **Source** | [app/api/org/invitations/route.ts](../app/api/org/invitations/route.ts) |

**Request body** — `invitationActionSchema` (`lib/schemas/orgSchema.ts`)

| Field | Type | Required |
|---|---|---|
| `membershipId` | string — min 1 | ✓ |
| `action` | enum: accept \| decline | ✓ |

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, message } |
| `400` | { success: false, error } |
| `401` | { success: false, error } |
| `404` | { success: false, error } |
| `500` | { success: false, error } |

### `/api/org/memberships`

#### `GET /api/org/memberships`

GET /api/org/memberships — list orgs the current user belongs to. Wraps the shared factory from @quikit/auth. QuikScale-specific scoping: - filter to tenants where the user has UserAppAccess for "quikscale" Logic body lives in packages/auth/org-memberships.ts; same handler shape is used by quikvc and any future SSO-client app.

| | |
|---|---|
| **Auth** | Shared `@quikit/auth` factory handler — session required, runs before org selection |
| **Permission** | _none beyond auth_ |
| **Source** | [app/api/org/memberships/route.ts](../app/api/org/memberships/route.ts) |

**Responses**

_Handler delegates to `createOrgMembershipsHandler()`._

| Status | Body |
|---|---|
| _delegated_ | implemented by `createOrgMembershipsHandler()` in `@quikit/auth/org-memberships` |

### `/api/org/quarter-settings`

#### `GET /api/org/quarter-settings`

GET /api/org/quarter-settings Tenant-scoped read of `QuarterSetting` rows — returns each configured (fiscalYear, quarter) pair together with its `startDate` and `endDate`. Consumed by `useQuarterStartDates` so the Priority modal/table can render week-date labels anchored on the tenant's real quarter start (the Monday on/before the 1st of the quarter's first month) instead of the hardcoded `QUARTER_STARTS` calendar-month boundaries. Response: { success: true, data: { quarters: Array<{ fiscalYear: number; quarter: string; startDate: string; // "YYYY-MM-DD" endDate: string; // "YYYY-MM-DD" }> } }

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `kpi` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Source** | [app/api/org/quarter-settings/route.ts](../app/api/org/quarter-settings/route.ts) |

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: { quarters } } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/org/quarters`

#### `GET /api/org/quarters`

GET /api/org/quarters?year=2026

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `orgSetup.quarters` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Source** | [app/api/org/quarters/route.ts](../app/api/org/quarters/route.ts) |

**Query** — `year`

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data, availableYears, futureYearAvailable, latestEndDate, hasDataByYear } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

#### `POST /api/org/quarters`

POST /api/org/quarters

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `orgSetup.quarters` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/org/quarters/route.ts](../app/api/org/quarters/route.ts) |

**Request body** — `generateQuartersSchema` (`lib/schemas/quarterSchema.ts`)

| Field | Type | Required |
|---|---|---|
| `fiscalYear` | number — min 2020, max 2099 | ✓ |
| `startDate` | string — nullable |  |
| `weekCounts` | array |  |
| `weeklyMeetingDay` | string — max 20, nullable |  |

**Responses**

| Status | Body |
|---|---|
| `201` | { success: true, data } |
| `400` | { success: false, error } |
| `403` | { success: false, error } |
| `409` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

#### `DELETE /api/org/quarters`

DELETE /api/org/quarters?year=YYYY Hard-deletes every QuarterSetting row for the tenant + given fiscal year. Intended for Quarter Settings → "Delete Fiscal Year". Per-quarter deletes continue to live at DELETE /api/org/quarters/[id]. Caller must have the orgSetup.quarters module license (same gate as POST/PUT, now enforced by the shared wrapper). No cascade — rows in KPI / Priority / OPSP that reference (fiscalYear, quarter) by value keep their values; the picker will just drop the year from its DB-scoped list.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `orgSetup.quarters` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/org/quarters/route.ts](../app/api/org/quarters/route.ts) |

**Query** — `year`

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: { fiscalYear, deleted } } |
| `400` | { success: false, error } |
| `404` | { success: false, error } |
| `409` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/org/quarters/{id}`

#### `PUT /api/org/quarters/{id}`

PUT /api/org/quarters/[id] — only Q1 start date can be changed, recalculates all quarters

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `orgSetup.quarters` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/org/quarters/[id]/route.ts](../app/api/org/quarters/[id]/route.ts) |

**Path params** — `id`

**Request body** — `updateQuarterSchema` (`lib/schemas/quarterSchema.ts`)

| Field | Type | Required |
|---|---|---|
| `startDate` | string — min 1 |  |
| `endDate` | string — min 1 |  |
| `weekCount` | unknown |  |
| `weeklyMeetingDay` | string — max 20, nullable |  |

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data } |
| `400` | { success: false, error } |
| `404` | { success: false, error } |
| `409` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

#### `DELETE /api/org/quarters/{id}`

DELETE /api/org/quarters/[id]

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `orgSetup.quarters` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/org/quarters/[id]/route.ts](../app/api/org/quarters/[id]/route.ts) |

**Path params** — `id`

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true } |
| `404` | { success: false, error } |
| `409` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/org/roles`

#### `GET /api/org/roles`

GET /api/org/roles — list all AppRoles for this tenant + QuikScale.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `orgSetup.users` — 404 when the org has the module disabled |
| **Permission** | `User:view` |
| **Source** | [app/api/org/roles/route.ts](../app/api/org/roles/route.ts) |

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data }<br/>`data` — Prisma `appRole.findMany` result |
| `500` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

#### `POST /api/org/roles`

POST /api/org/roles — create a new AppRole.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `orgSetup.users` — 404 when the org has the module disabled |
| **Permission** | `User:create` |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/org/roles/route.ts](../app/api/org/roles/route.ts) |

**Request body** — `createRoleSchema` (inline)

| Field | Type | Required |
|---|---|---|
| `name` | string — min 1, max 64 | ✓ |
| `description` | string — max 500, nullable |  |
| `isDefault` | boolean |  |

**Responses**

| Status | Body |
|---|---|
| `201` | { success: true, data }<br/>`data` — Prisma `appRole.create` result |
| `400` | { success: false, error } |
| `409` | { success: false, error } |
| `500` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/org/roles/{id}`

#### `GET /api/org/roles/{id}`

GET /api/org/roles/[id] — fetch one role with full permission list.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `orgSetup.users` — 404 when the org has the module disabled |
| **Permission** | `User:view` |
| **Source** | [app/api/org/roles/[id]/route.ts](../app/api/org/roles/[id]/route.ts) |

**Path params** — `id`

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data }<br/>`data` — Prisma `appRole.findFirst` result |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

#### `PATCH /api/org/roles/{id}`

PATCH /api/org/roles/[id] — rename / update description / set default.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `orgSetup.users` — 404 when the org has the module disabled |
| **Permission** | `User:update` |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/org/roles/[id]/route.ts](../app/api/org/roles/[id]/route.ts) |

**Path params** — `id`

**Request body** — `patchRoleSchema` (inline)

| Field | Type | Required |
|---|---|---|
| `name` | string — min 1, max 64 |  |
| `description` | string — max 500, nullable |  |
| `isDefault` | boolean |  |

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data }<br/>`data` — Prisma `appRole.update` result |
| `400` | { success: false, error } |
| `404` | { success: false, error } |
| `409` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

#### `DELETE /api/org/roles/{id}`

DELETE /api/org/roles/[id] — delete a non-system role. CASCADE clears RolePermission + UserAppRole rows for this role.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `orgSetup.users` — 404 when the org has the module disabled |
| **Permission** | `User:delete` |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/org/roles/[id]/route.ts](../app/api/org/roles/[id]/route.ts) |

**Path params** — `id`

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: { id, affectedUsers }, message } |
| `400` | { success: false, error } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/org/roles/{id}/members`

#### `GET /api/org/roles/{id}/members`

GET /api/org/roles/[id]/members — list users currently on this AppRole.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `orgSetup.users` — 404 when the org has the module disabled |
| **Permission** | `User:view` |
| **Source** | [app/api/org/roles/[id]/members/route.ts](../app/api/org/roles/[id]/members/route.ts) |

**Path params** — `id`

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: { roleId, members } } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

#### `PUT /api/org/roles/{id}/members`

PUT /api/org/roles/[id]/members Reconcile: every userId in the body should END UP linked to this role. Users currently on this role but NOT in the body are removed. Users in the body who don't yet have a UserAppAccess row for QuikScale are skipped and reported back — admin must invite them first.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `orgSetup.users` — 404 when the org has the module disabled |
| **Permission** | `User:update` |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/org/roles/[id]/members/route.ts](../app/api/org/roles/[id]/members/route.ts) |

**Path params** — `id`

**Request body** — `putBodySchema` (inline)

| Field | Type | Required |
|---|---|---|
| `userIds` | string[] — min 1 | ✓ |

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: { roleId, ...result } } |
| `400` | { success: false, error } |
| `404` | { success: false, error } |
| `409` | { success: false, error } |
| `500` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/org/roles/{id}/permissions`

#### `GET /api/org/roles/{id}/permissions`

GET /api/org/roles/[id]/permissions

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `orgSetup.users` — 404 when the org has the module disabled |
| **Permission** | `User:view` |
| **Source** | [app/api/org/roles/[id]/permissions/route.ts](../app/api/org/roles/[id]/permissions/route.ts) |

**Path params** — `id`

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: { roleId, isSystem, permissions } } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

#### `PUT /api/org/roles/{id}/permissions`

PUT /api/org/roles/[id]/permissions Replaces the entire (resource, action) set for this role atomically. Pass an empty array to revoke all permissions.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `orgSetup.users` — 404 when the org has the module disabled |
| **Permission** | `User:update` |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/org/roles/[id]/permissions/route.ts](../app/api/org/roles/[id]/permissions/route.ts) |

**Path params** — `id`

**Request body** — `putBodySchema` (inline)

| Field | Type | Required |
|---|---|---|
| `permissions` | array | ✓ |

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: { roleId, count } } |
| `400` | { success: false, error } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/org/select`

#### `POST /api/org/select`

POST /api/org/select — switch active org for the current user. Wraps the shared factory from @quikit/auth. QuikScale scoping requires UserAppAccess for "quikscale" in the chosen tenant.

| | |
|---|---|
| **Auth** | Shared `@quikit/auth` factory handler — session required, runs before org selection |
| **Permission** | _none beyond auth_ |
| **Source** | [app/api/org/select/route.ts](../app/api/org/select/route.ts) |

**Responses**

_Handler delegates to `createOrgSelectHandler()`._

| Status | Body |
|---|---|
| _delegated_ | implemented by `createOrgSelectHandler()` in `@quikit/auth/org-select` |

### `/api/org/teams`

#### `GET /api/org/teams`

GET /api/org/teams — all teams with member count and head info. Default: returns only active teams (deletedAt = null). With ?includeDeleted=true: returns ONLY soft-deleted teams (trash view).

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `orgSetup.teams` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Source** | [app/api/org/teams/route.ts](../app/api/org/teams/route.ts) |

**Query** — `includeDeleted`, `search`, `sortBy`, `sortOrder`

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: [...], meta: PaginationMeta }<br/>row shape inferred from `.map()` projection: `id`, `name`, `description`, `color`, `headId`, `headName`, `memberCount`, `members`, `createdAt` |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

#### `POST /api/org/teams`

POST /api/org/teams — create team

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `orgSetup.teams` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Rate limit** | handler bucket `team:create` (limit LIMITS.mutation.limit) |
| **Source** | [app/api/org/teams/route.ts](../app/api/org/teams/route.ts) |

**Request body** — `createTeamSchema` (`lib/schemas/teamSchema.ts`)

| Field | Type | Required |
|---|---|---|
| `name` | string — min 1 | ✓ |
| `description` | string — nullable |  |
| `color` | string — default "#0066cc" |  |
| `headId` | string — nullable |  |

**Responses**

| Status | Body |
|---|---|
| `201` | { success: true, data: { id, name, description, color, headId, headName, memberCount, members, createdAt } } |
| `400` | { success: false, error } |
| `409` | { success: false, error } |
| `429` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/org/teams/{id}`

#### `PUT /api/org/teams/{id}`

PUT /api/org/teams/[id] — update team

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `orgSetup.teams` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/org/teams/[id]/route.ts](../app/api/org/teams/[id]/route.ts) |

**Path params** — `id`

**Request body** — `updateTeamSchema` (`lib/schemas/teamSchema.ts`)

| Field | Type | Required |
|---|---|---|
| `name` | string — min 1 |  |
| `description` | string — nullable |  |
| `color` | string |  |
| `headId` | string — nullable |  |

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: { id, name, description, color, headId, headName, memberCount, createdAt } } |
| `400` | { success: false, error } |
| `404` | { success: false, error } |
| `409` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

#### `DELETE /api/org/teams/{id}`

DELETE /api/org/teams/[id] — delete team

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `orgSetup.teams` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/org/teams/[id]/route.ts](../app/api/org/teams/[id]/route.ts) |

**Path params** — `id`

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/org/teams/{id}/members`

#### `POST /api/org/teams/{id}/members`

POST /api/org/teams/[id]/members Adds one or more users as members of the given team. For each user we: 1. Verify they have an active Membership in the tenant. 2. Set Membership.teamId = team.id (the "primary team" that the /api/org/teams list query reads through `members: Membership[]`). 3. Upsert a UserTeam row for multi-team tracking (in case a future UI surfaces secondary teams). Responds with { success, data: { added, skipped, skippedUserIds } } so the client can report partial failures.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `orgSetup.teams` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/org/teams/[id]/members/route.ts](../app/api/org/teams/[id]/members/route.ts) |

**Path params** — `id`

**Request body** — `addTeamMembersSchema` (`lib/schemas/teamMembersSchema.ts`)

| Field | Type | Required |
|---|---|---|
| `userIds` | string[] — min 1 | ✓ |

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: { added, skipped, skippedUserIds, team } } |
| `400` | { success: false, error } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/org/teams/{id}/members/{userId}`

#### `DELETE /api/org/teams/{id}/members/{userId}`

DELETE /api/org/teams/[id]/members/[userId] Removes a user from a team. Inverse of POST /members: - If Membership.teamId currently points to this team, clear it to null (user becomes unassigned to a primary team). - Delete the UserTeam row if present. - Does NOT delete or deactivate the Membership itself — the user is still part of the organisation, just not this team.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `orgSetup.teams` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/org/teams/[id]/members/[userId]/route.ts](../app/api/org/teams/[id]/members/[userId]/route.ts) |

**Path params** — `id`, `userId`

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/org/teams/{id}/restore`

#### `POST /api/org/teams/{id}/restore`

POST /api/org/teams/[id]/restore — undo soft delete.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `orgSetup.teams` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/org/teams/[id]/restore/route.ts](../app/api/org/teams/[id]/restore/route.ts) |

**Path params** — `id`

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true } |
| `404` | { success: false, error } |
| `409` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/org/teams/bulk-restore`

#### `POST /api/org/teams/bulk-restore`

POST /api/org/teams/bulk-restore — undo soft delete in bulk.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `orgSetup.teams` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/org/teams/bulk-restore/route.ts](../app/api/org/teams/bulk-restore/route.ts) |

**Request body** — JSON, not validated by a Zod schema (see route).

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: { restored, skipped } } |
| `400` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/org/users`

#### `GET /api/org/users`

GET /api/org/users Returns the membership list plus the dynamic `appRole` (AppRole) each user has been assigned in this tenant's QuikScale app. SCOPE: only users who have a `app_quikscale.UserAppRole` row for THIS org + the QuikScale app appear. Org members who only have access to other apps (e.g. QuikTrack via UserAppAccess but no QuikScale role) are filtered out — they shouldn't show up on the QuikScale Users page.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `orgSetup.users` — 404 when the org has the module disabled |
| **Permission** | `User:view` |
| **Source** | [app/api/org/users/route.ts](../app/api/org/users/route.ts) |

**Query** — `role`, `search`, `sortBy`, `sortOrder`, `status`

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: [...], meta: PaginationMeta } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

#### `POST /api/org/users`

POST /api/org/users

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `orgSetup.users` — 404 when the org has the module disabled |
| **Permission** | `User:create` |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/org/users/route.ts](../app/api/org/users/route.ts) |

**Request body** — `createOrgUserSchema` (`lib/schemas/userSchema.ts`)

| Field | Type | Required |
|---|---|---|
| `firstName` | string — min 1, max 100 | ✓ |
| `lastName` | string — min 1, max 100 | ✓ |
| `email` | string — max 200, email | ✓ |
| `password` | string — min 8, max 200 |  |
| `role` | enum: super_admin \| admin \| executive \| manager \| employee \| coach \| member |  |
| `teamIds` | string[] |  |
| `teamId` | string — nullable |  |
| `linkExistingUserId` | string — min 1 |  |
| `invitationMethod` | enum: native \| sso |  |

**Responses**

| Status | Body |
|---|---|
| `201` | { success: true, data: { ...buildUserResponse(…), tempPassword }, meta } |
| `400` | { success: false, error } |
| `404` | { success: false, error } |
| `409` | { success: false, error } |
| `422` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/org/users/{id}`

#### `PUT /api/org/users/{id}`

PUT /api/org/users/[id]

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `orgSetup.users` — 404 when the org has the module disabled |
| **Permission** | `User:update` |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/org/users/[id]/route.ts](../app/api/org/users/[id]/route.ts) |

**Path params** — `id`

**Request body** — `updateOrgUserSchema` (`lib/schemas/userSchema.ts`)

| Field | Type | Required |
|---|---|---|
| `firstName` | string — min 1, max 100 |  |
| `lastName` | string — min 1, max 100 |  |
| `email` | string — max 200, email |  |
| `password` | string — min 8, max 200 |  |
| `role` | enum: super_admin \| admin \| executive \| manager \| employee \| coach \| member |  |
| `status` | enum: active \| invited \| inactive \| declined \| pending |  |
| `teamIds` | string[] |  |
| `teamId` | string — nullable |  |

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: { membershipId, userId, firstName, lastName, email, avatar, lastSignInAt, role, teamId, teamIds, teamNames, status, joinedAt } } |
| `400` | { success: false, error } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

#### `DELETE /api/org/users/{id}`

DELETE /api/org/users/[id] — deactivate membership

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `orgSetup.users` — 404 when the org has the module disabled |
| **Permission** | `User:delete` |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/org/users/[id]/route.ts](../app/api/org/users/[id]/route.ts) |

**Path params** — `id`

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true } |
| `400` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/org/users/{id}/permissions`

#### `GET /api/org/users/{id}/permissions`

GET

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `orgSetup.users` — 404 when the org has the module disabled |
| **Permission** | `User:view` |
| **Source** | [app/api/org/users/[id]/permissions/route.ts](../app/api/org/users/[id]/permissions/route.ts) |

**Path params** — `id`

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: { userId, roles, roleGrants, extras, effective } } |
| `404` | { success: false, error } |
| `500` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

#### `POST /api/org/users/{id}/permissions`

POST (atomic replace)

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `orgSetup.users` — 404 when the org has the module disabled |
| **Permission** | `User:update` |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/org/users/[id]/permissions/route.ts](../app/api/org/users/[id]/permissions/route.ts) |

**Path params** — `id`

**Request body** — `postBodySchema` (inline)

| Field | Type | Required |
|---|---|---|
| `extras` | array | ✓ |

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: { userId, count } } |
| `400` | { success: false, error } |
| `404` | { success: false, error } |
| `500` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/org/users/{id}/role`

#### `PATCH /api/org/users/{id}/role`

PATCH /api/org/users/[id]/role Inline role-change endpoint used by the Users list dropdown. Storage model (post-rename, 2026-05-06): - Roles live in `app_quikscale.AppRole` (was `CustomRole`). - User → role mapping lives in `app_quikscale.UserAppRole` (a join table, replaces the `appRoleId` column that used to be on `quikit.UserAppAccess`). Pre-condition: the user must already have a `quikit.UserAppAccess` row for QuikScale. If not, returns 409 — the admin must invite them first.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `orgSetup.users` — 404 when the org has the module disabled |
| **Permission** | `User:update` |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/org/users/[id]/role/route.ts](../app/api/org/users/[id]/role/route.ts) |

**Path params** — `id`

**Request body** — `bodySchema` (inline)

| Field | Type | Required |
|---|---|---|
| `roleId` | string — min 1, nullable | ✓ |

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: { userId, appRoleId, appRole } } |
| `400` | { success: false, error } |
| `404` | { success: false, error } |
| `409` | { success: false, error } |
| `500` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/org/users/{id}/status`

#### `PATCH /api/org/users/{id}/status`

PATCH /api/org/users/[id]/status Toggle a user's membership status (active / inactive). Inactive users keep their data but lose the ability to sign in to this tenant.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `orgSetup.users` — 404 when the org has the module disabled |
| **Permission** | `User:update` |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/org/users/[id]/status/route.ts](../app/api/org/users/[id]/status/route.ts) |

**Path params** — `id`

**Request body** — `bodySchema` (inline)

| Field | Type | Required |
|---|---|---|
| `status` | enum: active \| inactive | ✓ |

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data }<br/>`data` — Prisma `orgMember.update` result |
| `400` | { success: false, error } |
| `404` | { success: false, error } |
| `500` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/org/users/search`

#### `GET /api/org/users/search`

GET /api/org/users/search?email=<prefix> Typeahead for the "Add New User" panel. Returns OrgMembers in the active org whose email matches the prefix (case-insensitive substring). A user may already be an OrgMember (joined via another app — e.g. QuikVC) without having UserAppAccess for QuikScale yet. The autocomplete surfaces those users so the admin can grant quikscale access in one click instead of typing details fresh. Each row carries `hasQuikScaleAccess` so the UI can: - "Add to QuikScale" → POST with linkExistingUserId - "Already in QuikScale" → disabled / informational Returns at most 10 rows. Empty query → empty array (don't dump the whole org).

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `orgSetup.users` — 404 when the org has the module disabled |
| **Permission** | `User:view` |
| **Source** | [app/api/org/users/search/route.ts](../app/api/org/users/search/route.ts) |

**Query** — `email`

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: [] } |
| `200` | { success: true, data }<br/>`data` inferred from `.map()` projection: `userId`, `firstName`, `lastName`, `email`, `avatar`, `status`, `hasQuikScaleAccess` |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

---

## Module `pace` <a id="module-pace"></a>

_4 endpoints_

| Endpoint | Permission | Module gate |
|---|---|---|
| `GET /api/pace` | — | `pace` |
| `POST /api/pace` | — | `pace` |
| `PUT /api/pace/{id}` | — | `pace` |
| `DELETE /api/pace/{id}` | — | `pace` |

### `/api/pace`

#### `GET /api/pace`

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `pace` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Source** | [app/api/pace/route.ts](../app/api/pace/route.ts) |

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: { functions, insights } } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

#### `POST /api/pace`

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `pace` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/pace/route.ts](../app/api/pace/route.ts) |

**Request body** — `createAccountabilityFunctionSchema` (`lib/schemas/accountabilitySchema.ts`)

| Field | Type | Required |
|---|---|---|
| `chartType` | enum: face \| pace | ✓ |
| `name` | string — min 1, max 120 | ✓ |
| `description` | string — max 500, nullable |  |
| `leadingIndicators` | string — max 2000, nullable |  |
| `expectedOutcomes` | string — max 2000, nullable |  |
| `assignedToUserId` | string — nullable |  |
| `teamId` | string — nullable |  |
| `parentFunctionId` | string — nullable |  |
| `sortOrder` | number — min 0 |  |

**Responses**

| Status | Body |
|---|---|
| `201` | { success: true, data }<br/>`data` — Prisma `accountabilityFunction.create` result |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/pace/{id}`

#### `PUT /api/pace/{id}`

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `pace` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/pace/[id]/route.ts](../app/api/pace/[id]/route.ts) |

**Path params** — `id`

**Request body** — `updateAccountabilityFunctionSchema` (`lib/schemas/accountabilitySchema.ts`)

| Field | Type | Required |
|---|---|---|
| `chartType` | enum: face \| pace | ✓ |
| `name` | string — min 1, max 120 | ✓ |
| `description` | string — max 500, nullable |  |
| `leadingIndicators` | string — max 2000, nullable |  |
| `expectedOutcomes` | string — max 2000, nullable |  |
| `assignedToUserId` | string — nullable |  |
| `teamId` | string — nullable |  |
| `parentFunctionId` | string — nullable |  |
| `sortOrder` | number — min 0 |  |

- derived from `createAccountabilityFunctionSchema`
- all fields optional (`.partial()`)

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data }<br/>`data` — Prisma `accountabilityFunction.update` result |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

#### `DELETE /api/pace/{id}`

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `pace` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/pace/[id]/route.ts](../app/api/pace/[id]/route.ts) |

**Path params** — `id`

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

---

## Module `performance` <a id="module-performance"></a>

_24 endpoints_

| Endpoint | Permission | Module gate |
|---|---|---|
| `GET /api/performance/cycle` | — | `people.cycle` |
| `GET /api/performance/goals` | — | `people.goals` |
| `POST /api/performance/goals` | — | `people.goals` |
| `GET /api/performance/goals/{id}` | — | `people.goals` |
| `PUT /api/performance/goals/{id}` | — | `people.goals` |
| `DELETE /api/performance/goals/{id}` | — | `people.goals` |
| `GET /api/performance/individual` | — | `analytics.individual` |
| `GET /api/performance/individual/{userId}` | — | `analytics.individual` |
| `GET /api/performance/one-on-one` | — | `people.oneOnOne` |
| `POST /api/performance/one-on-one` | — | `people.oneOnOne` |
| `GET /api/performance/one-on-one/{id}` | — | `people.oneOnOne` |
| `PUT /api/performance/one-on-one/{id}` | — | `people.oneOnOne` |
| `DELETE /api/performance/one-on-one/{id}` | — | `people.oneOnOne` |
| `GET /api/performance/reviews` | — | `people.reviews` |
| `POST /api/performance/reviews` | — | `people.reviews` |
| `GET /api/performance/reviews/{reviewId}` | — | `people.reviews` |
| `PUT /api/performance/reviews/{reviewId}` | — | `people.reviews` |
| `GET /api/performance/scorecard` | — | `analytics.scorecard` |
| `GET /api/performance/talent` | — | `people.talent` |
| `POST /api/performance/talent` | — | `people.talent` |
| `GET /api/performance/talent/benchmark` | — | `people.talent` |
| `PUT /api/performance/talent/benchmark` | — | `people.talent` |
| `GET /api/performance/teams` | — | `analytics.teams` |
| `GET /api/performance/trends` | — | `analytics.trends` |

### `/api/performance/cycle`

#### `GET /api/performance/cycle`

GET /api/performance/cycle Cycle Hub data endpoint — computes the current phase of the quarterly performance cycle from existing data (QuarterSetting + PerformanceReview + Goals). Read-only, zero writes. The phase is inferred from: 1. Where we are in the current quarter (early / mid / late / closing week) 2. The review status of the current user (draft → self → manager → etc.) 3. Whether the user has active goals for the current quarter

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `people.cycle` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Source** | [app/api/performance/cycle/route.ts](../app/api/performance/cycle/route.ts) |

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: { phase, quarter, year, startDate, endDate, weekInQuarter, weeksRemaining, userReview, metrics, message } } |
| `200` | { success: true, data: { phase, quarter, year, startDate, endDate, weekInQuarter, weeksRemaining, userReview, goals, metrics } } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/performance/goals`

#### `GET /api/performance/goals`

GET /api/performance/goals Filters: ownerId / quarter / year / status / parentGoalId

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `people.goals` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Source** | [app/api/performance/goals/route.ts](../app/api/performance/goals/route.ts) |

**Query** — `ownerId`, `page`, `pageSize`, `parentGoalId`, `quarter`, `search`, `sortBy`, `sortOrder`, `status`, `year`

**Validated query params** — `listGoalsParamsSchema` (`lib/schemas/goalSchema.ts`)

| Field | Type | Required |
|---|---|---|
| `ownerId` | string |  |
| `quarter` | enum: Q1 \| Q2 \| Q3 \| Q4 |  |
| `year` | number (coerced) — min 2000, max 2100 |  |
| `status` | enum: draft \| active \| on-track \| at-risk \| completed \| abandoned |  |
| `parentGoalId` | string |  |
| `search` | string |  |
| `sortBy` | enum: title \| status \| progressPercent \| year \| createdAt \| updatedAt |  |
| `sortOrder` | enum: asc \| desc — default "desc" |  |
| `page` | number (coerced) — default 1 |  |
| `pageSize` | number (coerced) — max 100, default 10 |  |

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data, stats, meta } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

#### `POST /api/performance/goals`

POST /api/performance/goals

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `people.goals` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Rate limit** | handler bucket `goal:create` (limit LIMITS.mutation.limit) |
| **Source** | [app/api/performance/goals/route.ts](../app/api/performance/goals/route.ts) |

**Request body** — `createGoalSchema` (`lib/schemas/goalSchema.ts`)

| Field | Type | Required |
|---|---|---|
| `title` | string — min 1 | ✓ |
| `description` | string — nullable |  |
| `category` | string — nullable |  |
| `ownerId` | string | ✓ |
| `parentGoalId` | string — nullable |  |
| `targetValue` | number — nullable |  |
| `currentValue` | number — nullable |  |
| `unit` | string — nullable |  |
| `quarter` | enum: Q1 \| Q2 \| Q3 \| Q4 — nullable |  |
| `year` | number — min 2000, max 2100 | ✓ |
| `status` | enum: draft \| active \| on-track \| at-risk \| completed \| abandoned — default "draft" |  |

**Responses**

| Status | Body |
|---|---|
| `201` | { success: true, data }<br/>`data` — Prisma `goal.create` result |
| `400` | { success: false, error } |
| `404` | { success: false, error } |
| `429` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/performance/goals/{id}`

#### `GET /api/performance/goals/{id}`

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `people.goals` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Source** | [app/api/performance/goals/[id]/route.ts](../app/api/performance/goals/[id]/route.ts) |

**Path params** — `id`

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data }<br/>`data` — Prisma `goal.findFirst` result |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

#### `PUT /api/performance/goals/{id}`

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `people.goals` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/performance/goals/[id]/route.ts](../app/api/performance/goals/[id]/route.ts) |

**Path params** — `id`

**Request body** — `updateGoalSchema` (`lib/schemas/goalSchema.ts`)

| Field | Type | Required |
|---|---|---|
| `title` | string — min 1 | ✓ |
| `description` | string — nullable |  |
| `category` | string — nullable |  |
| `ownerId` | string | ✓ |
| `parentGoalId` | string — nullable |  |
| `targetValue` | number — nullable |  |
| `currentValue` | number — nullable |  |
| `unit` | string — nullable |  |
| `quarter` | enum: Q1 \| Q2 \| Q3 \| Q4 — nullable |  |
| `year` | number — min 2000, max 2100 | ✓ |
| `status` | enum: draft \| active \| on-track \| at-risk \| completed \| abandoned — default "draft" |  |

- derived from `createGoalSchema`
- all fields optional (`.partial()`)

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data }<br/>`data` — Prisma `goal.update` result |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

#### `DELETE /api/performance/goals/{id}`

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `people.goals` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/performance/goals/[id]/route.ts](../app/api/performance/goals/[id]/route.ts) |

**Path params** — `id`

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, message } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/performance/individual`

#### `GET /api/performance/individual`

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `analytics.individual` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Source** | [app/api/performance/individual/route.ts](../app/api/performance/individual/route.ts) |

**Query** — `search`

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: [...], meta: PaginationMeta } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/performance/individual/{userId}`

#### `GET /api/performance/individual/{userId}`

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `analytics.individual` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Source** | [app/api/performance/individual/[userId]/route.ts](../app/api/performance/individual/[userId]/route.ts) |

**Path params** — `userId`

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: { user, meetings } } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/performance/one-on-one`

#### `GET /api/performance/one-on-one`

GET /api/performance/one-on-one Lists 1:1s visible to the current user: - if no filters → returns sessions where user is EITHER manager OR report - if managerId filter → admin-style lookup for that manager - if reportId filter → admin-style lookup for that report

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `people.oneOnOne` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Source** | [app/api/performance/one-on-one/route.ts](../app/api/performance/one-on-one/route.ts) |

**Query** — `from`, `managerId`, `page`, `pageSize`, `reportId`, `to`

**Validated query params** — `listOneOnOnesParamsSchema` (`lib/schemas/oneOnOneSchema.ts`)

| Field | Type | Required |
|---|---|---|
| `managerId` | string |  |
| `reportId` | string |  |
| `from` | string — ISO date-time |  |
| `to` | string — ISO date-time |  |
| `page` | number (coerced) — default 1 |  |
| `pageSize` | number (coerced) — max 100, default 20 |  |

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data, meta } |
| `400` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

#### `POST /api/performance/one-on-one`

POST /api/performance/one-on-one — schedule a new session.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `people.oneOnOne` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/performance/one-on-one/route.ts](../app/api/performance/one-on-one/route.ts) |

**Request body** — `createOneOnOneSchema` (`lib/schemas/oneOnOneSchema.ts`)

| Field | Type | Required |
|---|---|---|
| `managerId` | string | ✓ |
| `reportId` | string | ✓ |
| `scheduledAt` | string — ISO date-time | ✓ |
| `duration` | number — default 30 |  |
| `talkingPoints` | string — nullable |  |

**Responses**

| Status | Body |
|---|---|
| `201` | { success: true, data }<br/>`data` — Prisma `oneOnOne.create` result |
| `400` | { success: false, error } |
| `429` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/performance/one-on-one/{id}`

#### `GET /api/performance/one-on-one/{id}`

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `people.oneOnOne` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Source** | [app/api/performance/one-on-one/[id]/route.ts](../app/api/performance/one-on-one/[id]/route.ts) |

**Path params** — `id`

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data }<br/>`data` — Prisma `oneOnOne.findFirst` result |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

#### `PUT /api/performance/one-on-one/{id}`

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `people.oneOnOne` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/performance/one-on-one/[id]/route.ts](../app/api/performance/one-on-one/[id]/route.ts) |

**Path params** — `id`

**Request body** — `updateOneOnOneSchema` (`lib/schemas/oneOnOneSchema.ts`)

| Field | Type | Required |
|---|---|---|
| `scheduledAt` | string — ISO date-time |  |
| `duration` | number |  |
| `talkingPoints` | string — nullable |  |
| `actionItems` | string — nullable |  |
| `notes` | string — nullable |  |
| `mood` | enum: green \| yellow \| red — nullable |  |
| `completedAt` | string — ISO date-time, nullable |  |

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data }<br/>`data` — Prisma `oneOnOne.update` result |
| `400` | { success: false, error } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

#### `DELETE /api/performance/one-on-one/{id}`

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `people.oneOnOne` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/performance/one-on-one/[id]/route.ts](../app/api/performance/one-on-one/[id]/route.ts) |

**Path params** — `id`

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, message } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/performance/reviews`

#### `GET /api/performance/reviews`

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `people.reviews` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Source** | [app/api/performance/reviews/route.ts](../app/api/performance/reviews/route.ts) |

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: [...], meta: PaginationMeta } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

#### `POST /api/performance/reviews`

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `people.reviews` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/performance/reviews/route.ts](../app/api/performance/reviews/route.ts) |

**Request body** — `createReviewSchema` (`lib/schemas/reviewSchema.ts`)

| Field | Type | Required |
|---|---|---|
| `revieweeId` | string — min 1 | ✓ |
| `quarter` | enum: Q1 \| Q2 \| Q3 \| Q4 | ✓ |
| `year` | union | ✓ |
| `rating` | union — nullable |  |
| `strengths` | string — nullable |  |
| `improvements` | string — nullable |  |
| `notes` | string — nullable |  |
| `kpiScore` | union — nullable |  |
| `priorityScore` | union — nullable |  |
| `attendanceScore` | union — nullable |  |
| `overallScore` | union — nullable |  |
| `status` | enum: draft \| self-assessment \| manager-review \| calibration \| approved \| shared \| signed \| submitted \| finalized |  |

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data }<br/>`data` — Prisma `performanceReview.create` result |
| `400` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/performance/reviews/{reviewId}`

#### `GET /api/performance/reviews/{reviewId}`

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `people.reviews` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Source** | [app/api/performance/reviews/[reviewId]/route.ts](../app/api/performance/reviews/[reviewId]/route.ts) |

**Path params** — `reviewId`

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data }<br/>`data` — Prisma `performanceReview.findFirst` result |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

#### `PUT /api/performance/reviews/{reviewId}`

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `people.reviews` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/performance/reviews/[reviewId]/route.ts](../app/api/performance/reviews/[reviewId]/route.ts) |

**Path params** — `reviewId`

**Request body** — `updateReviewSchema` (`lib/schemas/reviewSchema.ts`)

| Field | Type | Required |
|---|---|---|
| `revieweeId` | string — min 1 |  |
| `quarter` | enum: Q1 \| Q2 \| Q3 \| Q4 |  |
| `year` | union |  |
| `rating` | union — nullable |  |
| `strengths` | string — nullable |  |
| `improvements` | string — nullable |  |
| `notes` | string — nullable |  |
| `kpiScore` | union — nullable |  |
| `priorityScore` | union — nullable |  |
| `attendanceScore` | union — nullable |  |
| `overallScore` | union — nullable |  |
| `status` | enum: draft \| self-assessment \| manager-review \| calibration \| approved \| shared \| signed \| submitted \| finalized |  |

- all fields optional (`.partial()`)

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data }<br/>`data` — Prisma `performanceReview.update` result |
| `400` | { success: false, error } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/performance/scorecard`

#### `GET /api/performance/scorecard`

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `analytics.scorecard` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Source** | [app/api/performance/scorecard/route.ts](../app/api/performance/scorecard/route.ts) |

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: { orgScore, kpi, priority, meetings, www, teams, members } } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/performance/talent`

#### `GET /api/performance/talent`

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `people.talent` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Source** | [app/api/performance/talent/route.ts](../app/api/performance/talent/route.ts) |

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: [...], meta: PaginationMeta } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

#### `POST /api/performance/talent`

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `people.talent` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/performance/talent/route.ts](../app/api/performance/talent/route.ts) |

**Request body** — `talentAssessmentSchema` (`lib/schemas/talentSchema.ts`)

| Field | Type | Required |
|---|---|---|
| `userId` | string — min 1 | ✓ |
| `potential` | enum: low \| medium \| high — default "medium" |  |
| `flightRisk` | enum: low \| medium \| high — default "low" |  |
| `successionReady` | enum: ready \| developing \| not-ready \| ready-now — default "not-ready" |  |
| `skills` | string[] — default [] |  |
| `developmentNotes` | string — nullable |  |
| `rehireDecision` | enum: enthusiastic \| probably \| no \| unrated — default "unrated" |  |
| `rightSeat` | enum: yes \| blurry \| wrong \| unrated — default "unrated" |  |
| `coreValuesScore` | number — min 1, max 5, nullable |  |
| `capacity` | enum: stretched \| right-sized \| underused — nullable |  |
| `doMore` | string — max 2000, nullable |  |
| `doLess` | string — max 2000, nullable |  |
| `quarter` | string — default "Q1" |  |
| `year` | number (coerced) — min 2000, max 2100, default new Date( |  |

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data }<br/>`data` — Prisma `talentAssessment.upsert` result |
| `400` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/performance/talent/benchmark`

#### `GET /api/performance/talent/benchmark`

QuikScale runs two parallel admin systems (see lib/api/requireAdmin.ts): the legacy `OrgMember.role` string and dynamic-RBAC v2 (`UserAppRole` → `AppRole`), which is what Org Setup → User Management writes. An admin promoted via the v2 UI keeps `OrgMember.role = "member"`, so a legacy-only tier check wrongly 403s them. Consult both.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `people.talent` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Source** | [app/api/performance/talent/benchmark/route.ts](../app/api/performance/talent/benchmark/route.ts) |

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: { perfCut, potentialCut, isDefault, updatedAt } } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

#### `PUT /api/performance/talent/benchmark`

QuikScale runs two parallel admin systems (see lib/api/requireAdmin.ts): the legacy `OrgMember.role` string and dynamic-RBAC v2 (`UserAppRole` → `AppRole`), which is what Org Setup → User Management writes. An admin promoted via the v2 UI keeps `OrgMember.role = "member"`, so a legacy-only tier check wrongly 403s them. Consult both.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `people.talent` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/performance/talent/benchmark/route.ts](../app/api/performance/talent/benchmark/route.ts) |

**Request body** — `benchmarkSchema` (inline)

| Field | Type | Required |
|---|---|---|
| `perfCut` | number — min 0, max 100 | ✓ |
| `potentialCut` | number — min 0, max 100 | ✓ |

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: { perfCut, potentialCut, isDefault, updatedAt } } |
| `400` | { success: false, error } |
| `403` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/performance/teams`

#### `GET /api/performance/teams`

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `analytics.teams` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Source** | [app/api/performance/teams/route.ts](../app/api/performance/teams/route.ts) |

**Query** — `search`

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: [...], meta: PaginationMeta } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/performance/trends`

#### `GET /api/performance/trends`

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `analytics.trends` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Source** | [app/api/performance/trends/route.ts](../app/api/performance/trends/route.ts) |

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

---

## Module `pillars` <a id="module-pillars"></a>

_1 endpoint_

| Endpoint | Permission | Module gate |
|---|---|---|
| `GET /api/pillars/stats` | — | — |

### `/api/pillars/stats`

#### `GET /api/pillars/stats`

GET /api/pillars/stats Aggregates module counts across all 4 Scaling Up pillars for the hub page.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Permission** | _none beyond auth_ |
| **Source** | [app/api/pillars/stats/route.ts](../app/api/pillars/stats/route.ts) |

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: { people, strategy, execution } } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

---

## Module `priority` <a id="module-priority"></a>

_17 endpoints_

| Endpoint | Permission | Module gate |
|---|---|---|
| `GET /api/priority` | `Priority:view` | `priority` |
| `POST /api/priority` | `Priority:create` | `priority` |
| `GET /api/priority/{id}` | `Priority:view` | `priority` |
| `PUT /api/priority/{id}` | `Priority:update` | `priority` |
| `DELETE /api/priority/{id}` | `Priority:delete` | `priority` |
| `GET /api/priority/{id}/audit` | — | `priority` |
| `GET /api/priority/{id}/logs` | — | `priority` |
| `POST /api/priority/{id}/notes` | — | `priority` |
| `POST /api/priority/{id}/restore` | — | `priority` |
| `GET /api/priority/{id}/summary` | — | `priority` |
| `POST /api/priority/{id}/weekly` | — | `priority` |
| `POST /api/priority/{id}/weekly/batch` | — | `priority` |
| `POST /api/priority/bulk-restore` | — | `priority` |
| `POST /api/priority/duplicate-check` | `Priority:create` | `priority` |
| `GET /api/priority/export` | `Priority:view` | `priority` |
| `GET /api/priority/exported-lookup` | `Priority:view` | `priority` |
| `POST /api/priority/reorder` | `Priority:update` | `priority` |

### `/api/priority`

#### `GET /api/priority`

GET /api/priority — list priorities filtered by year + quarter

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `priority` — 404 when the org has the module disabled |
| **Permission** | `Priority:view` |
| **Source** | [app/api/priority/route.ts](../app/api/priority/route.ts) |

**Query** — `includeDeleted`, `owner`, `quarter`, `search`, `sortBy`, `sortOrder`, `status`, `teamId`, `year`

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: [...], meta: PaginationMeta } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

#### `POST /api/priority`

POST /api/priority — create a priority

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `priority` — 404 when the org has the module disabled |
| **Permission** | `Priority:create` |
| **Rate limit** | handler bucket `priority:create` (limit LIMITS.mutation.limit) |
| **Source** | [app/api/priority/route.ts](../app/api/priority/route.ts) |

**Request body** — `createPrioritySchema` (`lib/schemas/prioritySchema.ts`)

| Field | Type | Required |
|---|---|---|
| `name` | string — min 1 | ✓ |
| `description` | string — nullable |  |
| `owner` | string — min 1 |  |
| `ownerIds` | string[] — min 1 |  |
| `teamId` | string — nullable |  |
| `quarter` | enum: Q1 \| Q2 \| Q3 \| Q4 | ✓ |
| `year` | number — min 2020, max 2099 | ✓ |
| `startWeek` | number — min 1, nullable |  |
| `endWeek` | number — min 1, nullable |  |
| `overallStatus` | enum: not-applicable \| not-yet-started \| behind-schedule \| on-track \| completed \| not-started — default "not-yet-started" |  |
| `notes` | string — nullable |  |
| `importedFromOpsp` | boolean |  |

- has cross-field `.refine()` rules

**Responses**

| Status | Body |
|---|---|
| `201` | { success: true, data, meta, message } |
| `400` | { success: false, error } |
| `409` | { success: false, error } |
| `429` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/priority/{id}`

#### `GET /api/priority/{id}`

Before/after fields needed to diff a Priority for the audit timeline.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `priority` — 404 when the org has the module disabled |
| **Permission** | `Priority:view` |
| **Source** | [app/api/priority/[id]/route.ts](../app/api/priority/[id]/route.ts) |

**Path params** — `id`

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data }<br/>`data` — Prisma `priority.findFirst` result |
| `403` | { success: false, error } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

#### `PUT /api/priority/{id}`

Before/after fields needed to diff a Priority for the audit timeline.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `priority` — 404 when the org has the module disabled |
| **Permission** | `Priority:update` |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/priority/[id]/route.ts](../app/api/priority/[id]/route.ts) |

**Path params** — `id`

**Request body** — `updatePrioritySchema` (`lib/schemas/prioritySchema.ts`)

| Field | Type | Required |
|---|---|---|
| `name` | string — min 1 |  |
| `description` | string — nullable |  |
| `owner` | string — min 1 |  |
| `teamId` | string — nullable |  |
| `quarter` | enum: Q1 \| Q2 \| Q3 \| Q4 |  |
| `year` | number — min 2020, max 2099 |  |
| `startWeek` | number — min 1, nullable |  |
| `endWeek` | number — min 1, nullable |  |
| `overallStatus` | enum: not-applicable \| not-yet-started \| behind-schedule \| on-track \| completed \| not-started |  |
| `notes` | string — nullable |  |
| `resetWeeklyData` | boolean |  |
| `notifyReplacement` | boolean |  |

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data }<br/>`data` — Prisma `priority.update` result |
| `400` | { success: false, error } |
| `403` | { success: false, error } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

#### `DELETE /api/priority/{id}`

Before/after fields needed to diff a Priority for the audit timeline.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `priority` — 404 when the org has the module disabled |
| **Permission** | `Priority:delete` |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/priority/[id]/route.ts](../app/api/priority/[id]/route.ts) |

**Path params** — `id`

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, message } |
| `403` | { success: false, error } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/priority/{id}/audit`

#### `GET /api/priority/{id}/audit`

GET /api/priority/[id]/audit — full Change History timeline for one Priority. Reads the centralized AuditEvent + AuditChange tables (the new system), mirroring /api/kpi/[id]/audit. Returns the complete per-entity timeline newest-first; the Change History panel does its own client-side filtering, search, and tab counts, so the API stays a simple, cacheable read. Uses findUnique (NOT findFirst) for the existence check so soft-deleted Priorities can still have their history viewed.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `priority` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Source** | [app/api/priority/[id]/audit/route.ts](../app/api/priority/[id]/audit/route.ts) |

**Path params** — `id`

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data, meta }<br/>`data` — Prisma `auditEvent.findMany` result |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/priority/{id}/logs`

#### `GET /api/priority/{id}/logs`

GET /api/priority/[id]/logs — change history for a Priority (read-only) Source: AuditLog rows where entityType=Priority and entityId=id

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `priority` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Source** | [app/api/priority/[id]/logs/route.ts](../app/api/priority/[id]/logs/route.ts) |

**Path params** — `id`

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data }<br/>`data` inferred from `.map()` projection: `id`, `action`, `oldValue`, `newValue`, `changedBy`, `changedByName`, `reason`, `createdAt` |
| `403` | { success: false, error } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/priority/{id}/notes`

#### `POST /api/priority/{id}/notes`

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `priority` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/priority/[id]/notes/route.ts](../app/api/priority/[id]/notes/route.ts) |

**Path params** — `id`

**Request body** — `noteSchema` (inline)

| Field | Type | Required |
|---|---|---|
| `content` | string — min 1, max 5000 | ✓ |

**Responses**

| Status | Body |
|---|---|
| `201` | { success: true, data: { id, content }, message } |
| `400` | { success: false, error } |
| `403` | { success: false, error } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/priority/{id}/restore`

#### `POST /api/priority/{id}/restore`

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `priority` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/priority/[id]/restore/route.ts](../app/api/priority/[id]/restore/route.ts) |

**Path params** — `id`

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, message } |
| `200` | { success: true, data }<br/>`data` — Prisma `priority.update` result |
| `400` | { success: false, error } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/priority/{id}/summary`

#### `GET /api/priority/{id}/summary`

GET /api/priority/[id]/summary — compact Priority projection for AI Runtime. Distinct from GET /api/priority/[id] which returns the full row + every weekly status. This endpoint returns only the fields agents need: identity, ownership, quarter window, current overall status, last 8 weekly statuses, truncated notes, and a deep-link URL. PII: owner_user select is restricted to id/firstName/lastName — email is never read. Deeper PII scrubbing (e.g. of user-authored notes) is the AI Runtime layer's responsibility per v3.0 handoff §7.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `priority` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Source** | [app/api/priority/[id]/summary/route.ts](../app/api/priority/[id]/summary/route.ts) |

**Path params** — `id`

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: { id, name, status, quarter, year, startWeek, endWeek, weeklyStatuses, lastNotes, owner_user, url } } |
| `403` | { success: false, error } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/priority/{id}/weekly`

#### `POST /api/priority/{id}/weekly`

POST /api/priority/[id]/weekly — upsert a weekly status

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `priority` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/priority/[id]/weekly/route.ts](../app/api/priority/[id]/weekly/route.ts) |

**Path params** — `id`

**Request body** — `weeklyStatusSchema` (`lib/schemas/prioritySchema.ts`)

| Field | Type | Required |
|---|---|---|
| `weekNumber` | number — min 1 | ✓ |
| `status` | enum: not-applicable \| not-yet-started \| behind-schedule \| on-track \| completed | ✓ |
| `notes` | string — nullable |  |

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data }<br/>`data` — Prisma `priorityWeeklyStatus.upsert` result |
| `400` | { success: false, error } |
| `403` | { success: false, error } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/priority/{id}/weekly/batch`

#### `POST /api/priority/{id}/weekly/batch`

POST /api/priority/[id]/weekly/batch — upsert MANY weekly statuses in one save. Mirrors the KPI weekly batch route's audit taxonomy so the change history stays consistent across modules: • ≥ 3 DISTINCT changed weeks → ONE BULK_UPDATE event (purple "Bulk weekly update · weeks N–M" card). Used by the Completed cascade, which can touch many weeks in a single user action. • < 3 changed weeks → one WEEKLY_UPDATE event PER changed week, with the SAME snapshot shape the single-week route writes — so a 1- or 2-week save renders identically to today. No-op weeks (status AND notes unchanged) are applied idempotently but never logged, matching the single-week route.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `priority` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/priority/[id]/weekly/batch/route.ts](../app/api/priority/[id]/weekly/batch/route.ts) |

**Path params** — `id`

**Request body** — `weeklyStatusBatchSchema` (`lib/schemas/prioritySchema.ts`)

| Field | Type | Required |
|---|---|---|
| `inputs` | array — min 1 | ✓ |

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: { applied, failed, weeks } } |
| `400` | { success: false, error } |
| `403` | { success: false, error } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/priority/bulk-restore`

#### `POST /api/priority/bulk-restore`

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `priority` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/priority/bulk-restore/route.ts](../app/api/priority/bulk-restore/route.ts) |

**Request body** — JSON, not validated by a Zod schema (see route).

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: { restored } } |
| `400` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/priority/duplicate-check`

#### `POST /api/priority/duplicate-check`

POST /api/priority/duplicate-check Priority counterpart of the KPI similarity warning. Uses Gemini to flag a priority whose name means the SAME thing as one that already exists ACROSS USERS in the same planning period. Advisory only — never blocks creation. Flow: 1. DB pre-filter — same quarter + year, org-wide (all owners). 2. Gemini semantic name comparison across the candidates. 3. Return the matched existing priority (with its owner's name). Responses (all 200, `{ success: true, data }`): - `{ match: <priority+ownerName> }` — a similar priority exists. - `{ match: null }` — nothing similar. - `{ aiUnavailable: true }` — AI check could not run.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `priority` — 404 when the org has the module disabled |
| **Permission** | `Priority:create` |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/priority/duplicate-check/route.ts](../app/api/priority/duplicate-check/route.ts) |

**Request body** — `priorityDuplicateCheckSchema` (`lib/schemas/priorityDuplicateCheckSchema.ts`)

| Field | Type | Required |
|---|---|---|
| `name` | string — min 1 | ✓ |
| `owner` | string — min 1 | ✓ |
| `quarter` | enum: Q1 \| Q2 \| Q3 \| Q4 | ✓ |
| `year` | number — min 2020, max 2099 | ✓ |
| `startWeek` | number — min 1, nullable |  |
| `endWeek` | number — min 1, nullable |  |

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: { match } } |
| `200` | { success: true, data: { aiUnavailable } } |
| `400` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/priority/export`

#### `GET /api/priority/export`

GET /api/priority/export — Global Export for Priority. Interval = fiscal YEAR + one or more QUARTERS. Each quarter becomes its own sheet/section with that quarter's Week N status columns. Full-year = all four quarters. Rows scoped + visibility-filtered per quarter via the SAME `buildPriorityScopeWhere` the list route uses. Node runtime.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `priority` — 404 when the org has the module disabled |
| **Permission** | `Priority:view` |
| **Source** | [app/api/priority/export/route.ts](../app/api/priority/export/route.ts) |

**Query** — `includeDeleted`, `owner`, `status`, `teamId`

**Validated query params** — `exportBaseSchema` (`lib/exports/exportParams.ts`)

| Field | Type | Required |
|---|---|---|
| `columns` | unknown |  |

**Validated query params** — `quarterRangeSchema` (`lib/exports/exportParams.ts`)

| Field | Type | Required |
|---|---|---|
| `year` | number (coerced) — min 2000, max 3000 | ✓ |
| `quarters` | enum: Q1 \| Q2 \| Q3 \| Q4 — min 1 |  |

**Responses**

| Status | Body |
|---|---|
| `400` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/priority/exported-lookup`

#### `GET /api/priority/exported-lookup`

GET /api/priority/exported-lookup?owner=&quarter=&year= Priority counterpart of the KPI lookup. Returns only the columns the OPSP "Export → Create Priorities" Previously-Exported / New tabs need, for every priority this owner has in the quarter — a single indexed query, NO pagination.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `priority` — 404 when the org has the module disabled |
| **Permission** | `Priority:view` |
| **Source** | [app/api/priority/exported-lookup/route.ts](../app/api/priority/exported-lookup/route.ts) |

**Query** — `owner`, `quarter`, `year`

**Validated query params** — `paramsSchema` (inline)

| Field | Type | Required |
|---|---|---|
| `owner` | string — min 1 | ✓ |
| `quarter` | enum: Q1 \| Q2 \| Q3 \| Q4 | ✓ |
| `year` | number (coerced) — min 2020, max 2099 | ✓ |

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: { items } } |
| `400` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/priority/reorder`

#### `POST /api/priority/reorder`

POST /api/priority/reorder — move a Priority row to a new manual position.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `priority` — 404 when the org has the module disabled |
| **Permission** | `Priority:update` |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/priority/reorder/route.ts](../app/api/priority/reorder/route.ts) |

**Request body** — `reorderRowSchema` (`lib/schemas/reorderSchema.ts`)

| Field | Type | Required |
|---|---|---|
| `id` | string — min 1 | ✓ |
| `beforeId` | string — min 1, nullable | ✓ |
| `afterId` | string — min 1, nullable | ✓ |

**Responses**

_Handler delegates to `handleReorder()`._

| Status | Body |
|---|---|
| `200` | { success: true, data: { id, position } } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

---

## Module `s` <a id="module-s"></a>

_2 endpoints_

| Endpoint | Permission | Module gate |
|---|---|---|
| `GET /api/s/{token}` | — | — |
| `POST /api/s/{token}` | — | — |

### `/api/s/{token}`

#### `GET /api/s/{token}`

Public — no auth required

| | |
|---|---|
| **Auth** | **Public** — unauthenticated; the share token in the URL is the only credential |
| **Permission** | _none beyond auth_ |
| **Source** | [app/api/s/[token]/route.ts](../app/api/s/[token]/route.ts) |

**Path params** — `token`

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data }<br/>`data` — Prisma `survey.findUnique` result |
| `404` | { success: false, error } |

#### `POST /api/s/{token}`

| | |
|---|---|
| **Auth** | **Public** — unauthenticated; the share token in the URL is the only credential |
| **Permission** | _none beyond auth_ |
| **Source** | [app/api/s/[token]/route.ts](../app/api/s/[token]/route.ts) |

**Path params** — `token`

**Request body** — `submitResponseSchema` (`lib/schemas/habitSchema.ts`)

| Field | Type | Required |
|---|---|---|
| `subItemBits` | unknown | ✓ |

**Responses**

| Status | Body |
|---|---|
| `201` | { success: true, data: { id } } |
| `400` | { success: false, error } |
| `403` | { success: false, error } |
| `404` | { success: false, error } |
| `500` | { success: false, error } |

---

## Module `session` <a id="module-session"></a>

_1 endpoint_

| Endpoint | Permission | Module gate |
|---|---|---|
| `GET /api/session/validate` | — | — |

### `/api/session/validate`

#### `GET /api/session/validate`

GET /api/session/validate Checks if the current user still has: 1. An active membership for the selected tenant 2. An active app access record for QuikScale Returns { valid: false } if either check fails.

| | |
|---|---|
| **Auth** | Hand-rolled `getServerSession` check |
| **Permission** | _none beyond auth_ |
| **Rate limit** | handler bucket `session:validate` (limit 100) |
| **Source** | [app/api/session/validate/route.ts](../app/api/session/validate/route.ts) |

**Responses**

| Status | Body |
|---|---|
| `200` | { valid, reason } |
| `200` | { valid, hasTenant } |
| `429` | { valid, rateLimited } |

---

## Module `settings` <a id="module-settings"></a>

_8 endpoints_

| Endpoint | Permission | Module gate |
|---|---|---|
| `GET /api/settings/company` | — | — |
| `PATCH /api/settings/company` | — | — |
| `GET /api/settings/configurations` | — | — |
| `PATCH /api/settings/configurations` | — | — |
| `GET /api/settings/profile` | — | — |
| `PATCH /api/settings/profile` | — | — |
| `GET /api/settings/table-preferences` | — | — |
| `PATCH /api/settings/table-preferences` | — | — |

### `/api/settings/company`

#### `GET /api/settings/company`

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Permission** | _none beyond auth_ |
| **Source** | [app/api/settings/company/route.ts](../app/api/settings/company/route.ts) |

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data }<br/>`data` — Prisma `user.findUnique` result |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

#### `PATCH /api/settings/company`

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Permission** | _none beyond auth_ |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/settings/company/route.ts](../app/api/settings/company/route.ts) |

**Request body** — `updateCompanySchema` (`lib/schemas/settingsSchema.ts`)

| Field | Type | Required |
|---|---|---|
| `accentColor` | string |  |
| `themeMode` | enum: light \| dark \| system |  |

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data }<br/>`data` — Prisma `user.update` result |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/settings/configurations`

#### `GET /api/settings/configurations`

| | |
|---|---|
| **Auth** | Org-admin guard (`requireAdmin`) |
| **Permission** | _none beyond auth_ |
| **Source** | [app/api/settings/configurations/route.ts](../app/api/settings/configurations/route.ts) |

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data }<br/>`data` — Prisma `featureFlag.findMany` result |
| `401` | { success: false, error } |
| `500` | { success: false, error } |

#### `PATCH /api/settings/configurations`

| | |
|---|---|
| **Auth** | Org-admin guard (`requireAdmin`) |
| **Permission** | _none beyond auth_ |
| **Source** | [app/api/settings/configurations/route.ts](../app/api/settings/configurations/route.ts) |

**Request body** — `updateConfigurationsSchema` (`lib/schemas/settingsSchema.ts`)

| Field | Type | Required |
|---|---|---|
| `flags` | object[] — nullable |  |

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data }<br/>`data` — Prisma `featureFlag.upsert` result |
| `400` | { success: false, error } |
| `500` | { success: false, error } |

### `/api/settings/profile`

#### `GET /api/settings/profile`

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Permission** | _none beyond auth_ |
| **Source** | [app/api/settings/profile/route.ts](../app/api/settings/profile/route.ts) |

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: { ...user, role } } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

#### `PATCH /api/settings/profile`

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Permission** | _none beyond auth_ |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/settings/profile/route.ts](../app/api/settings/profile/route.ts) |

**Request body** — `updateProfileSchema` (`lib/schemas/settingsSchema.ts`)

| Field | Type | Required |
|---|---|---|
| `firstName` | string — min 1, max 100 |  |
| `lastName` | string — min 1, max 100 |  |
| `country` | string — max 5, nullable |  |
| `timezone` | string — max 100, nullable |  |
| `bio` | string — nullable |  |

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data }<br/>`data` — Prisma `user.update` result |
| `400` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/settings/table-preferences`

#### `GET /api/settings/table-preferences`

GET /api/settings/table-preferences — returns one entry per supported table key. Tables the user hasn't customized yet come back as EMPTY defaults so the client doesn't have to special-case "first visit".

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Permission** | _none beyond auth_ |
| **Source** | [app/api/settings/table-preferences/route.ts](../app/api/settings/table-preferences/route.ts) |

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

#### `PATCH /api/settings/table-preferences`

PATCH /api/settings/table-preferences — upsert one table's prefs. Only the keys present in the request body are updated; everything else is preserved on the row.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Permission** | _none beyond auth_ |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/settings/table-preferences/route.ts](../app/api/settings/table-preferences/route.ts) |

**Request body** — `updateTablePreferencesSchema` (`lib/schemas/tablePreferencesSchema.ts`)

| Field | Type | Required |
|---|---|---|
| `table` | enum: kpi \| priority \| www \| clientMaster \| clientMembers \| dailyHuddle \| weeklyMeeting \| categories \| units \| opspReviewPrimary \| opspReviewSecondary \| opspReviewCritical | ✓ |
| `frozenCol` | string — nullable |  |
| `hiddenCols` | string[] — nullable |  |
| `sort` | string — nullable |  |
| `colWidths` | record — nullable |  |
| `colOrder` | string[] — nullable |  |

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: { table, frozenCol, hiddenCols, sort, colWidths, colOrder } } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

---

## Module `support` <a id="module-support"></a>

_5 endpoints_

| Endpoint | Permission | Module gate |
|---|---|---|
| `GET /api/support/tickets` | — | — |
| `POST /api/support/tickets` | — | — |
| `GET /api/support/tickets/{id}` | — | — |
| `POST /api/support/uploads` | — | — |
| `GET /api/support/uploads/view/{...key}` | — | — |

### `/api/support/tickets`

#### `GET /api/support/tickets`

Platform support tickets raised from QuikScale. GET — the caller's OWN tickets (Settings → Support Status) POST — raise a new ticket (floating Support panel) The query itself lives in `@quikit/shared/supportTickets` and is identical in every app; this file only supplies the app's own auth guard and slug. Deliberately NOT gated by a `moduleKey` or an RBAC `permission`: a user who has been locked out of a module must still be able to report that they are locked out. `withOrgAuth` still enforces session + active org membership + QuikScale app access, so this is not an open endpoint.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Permission** | _none beyond auth_ |
| **Source** | [app/api/support/tickets/route.ts](../app/api/support/tickets/route.ts) |

**Responses**

| Status | Body |
|---|---|
| `200` | { success: false, error } |
| `200` | { success: true, data, meta } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

#### `POST /api/support/tickets`

Platform support tickets raised from QuikScale. GET — the caller's OWN tickets (Settings → Support Status) POST — raise a new ticket (floating Support panel) The query itself lives in `@quikit/shared/supportTickets` and is identical in every app; this file only supplies the app's own auth guard and slug. Deliberately NOT gated by a `moduleKey` or an RBAC `permission`: a user who has been locked out of a module must still be able to report that they are locked out. `withOrgAuth` still enforces session + active org membership + QuikScale app access, so this is not an open endpoint.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Permission** | _none beyond auth_ |
| **Rate limit** | wrapper limiter off — handler self-limits |
| **Source** | [app/api/support/tickets/route.ts](../app/api/support/tickets/route.ts) |

**Request body** — JSON, not validated by a Zod schema (see route).

**Responses**

| Status | Body |
|---|---|
| `200` | { success: false, error } |
| `200` | { success: true, data } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/support/tickets/{id}`

#### `GET /api/support/tickets/{id}`

GET /api/support/tickets/[id] — detail + response thread for ONE ticket the caller raised. Ownership (`orgId` + `userId`) is part of the Prisma `where`, so a ticket belonging to another user or org is indistinguishable from a ticket that does not exist (404) — no existence oracle.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Permission** | _none beyond auth_ |
| **Source** | [app/api/support/tickets/[id]/route.ts](../app/api/support/tickets/[id]/route.ts) |

**Path params** — `id`

**Responses**

| Status | Body |
|---|---|
| `200` | { success: false, error } |
| `200` | { success: true, data } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/support/uploads`

#### `POST /api/support/uploads`

Attachment uploads for support requests raised from QuikScale. POST — multipart `files`, stored in Google Cloud Storage under `support/<orgId>/<yyyy-mm>/<random><ext>`. Returns descriptors the client echoes back on POST /api/support/tickets. The validation, key layout and GCS calls live in `@quikit/shared/supportAttachments` and are identical in every app; this file only supplies QuikScale's auth guard. Not permission-gated, matching the ticket route: a user locked out of a module must still be able to show us the screen that locked them out. Uploads land under the caller's own org prefix, which is what the viewer route checks before it will sign anything.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Permission** | _none beyond auth_ |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/support/uploads/route.ts](../app/api/support/uploads/route.ts) |

**Request body** — JSON, not validated by a Zod schema (see route).

**Responses**

| Status | Body |
|---|---|
| `200` | { success: false, error } |
| `201` | { success: true, data } |
| `400` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/support/uploads/view/{...key}`

#### `GET /api/support/uploads/view/{...key}`

Attachment viewer. Rows store the GCS object KEY, never a URL — bucket objects are private and signed URLs expire in minutes, so a persisted URL would be dead on arrival. This route re-signs on every request and redirects. Tenant isolation: the key layout is `support/<orgId>/<yyyy-mm>/<file>` and `handleSupportAttachmentView` rejects anything whose org segment isn't the caller's, with a 404 rather than a 403 so the route is not an existence oracle for other tenants' keys.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Permission** | _none beyond auth_ |
| **Source** | [app/api/support/uploads/view/[...key]/route.ts](../app/api/support/uploads/view/[...key]/route.ts) |

**Path params** — `key`

**Responses**

| Status | Body |
|---|---|
| `200` | { success: false, error } |
| `307` | redirect (`Location` header) |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

---

## Module `surveys` <a id="module-surveys"></a>

_7 endpoints_

| Endpoint | Permission | Module gate |
|---|---|---|
| `GET /api/surveys` | — | `survey` |
| `POST /api/surveys` | — | `survey` |
| `GET /api/surveys/{id}` | — | `survey` |
| `PUT /api/surveys/{id}` | — | `survey` |
| `DELETE /api/surveys/{id}` | — | `survey` |
| `GET /api/surveys/{id}/report` | — | `survey` |
| `GET /api/surveys/{id}/responses` | — | `survey` |

### `/api/surveys`

#### `GET /api/surveys`

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `survey` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Source** | [app/api/surveys/route.ts](../app/api/surveys/route.ts) |

**Query** — `quarter`, `type`, `year`

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data }<br/>`data` — Prisma `survey.findMany` result |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

#### `POST /api/surveys`

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `survey` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/surveys/route.ts](../app/api/surveys/route.ts) |

**Request body** — `createSurveySchema` (`lib/schemas/surveySchema.ts`)

| Field | Type | Required |
|---|---|---|
| `type` | enum: enps \| cnps | ✓ |
| `title` | string — min 1, max 200 | ✓ |
| `question` | string — min 1, max 500 |  |
| `questions` | array — min 1, max 20 |  |
| `quarter` | string | ✓ |
| `year` | number — min 2020, max 2100 | ✓ |

- has cross-field `.refine()` rules

**Responses**

| Status | Body |
|---|---|
| `201` | { success: true, data }<br/>`data` inferred from `.map()` projection: `order`, `text`, `answerType`, `allowComment`, `required` |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/surveys/{id}`

#### `GET /api/surveys/{id}`

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `survey` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Source** | [app/api/surveys/[id]/route.ts](../app/api/surveys/[id]/route.ts) |

**Path params** — `id`

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data }<br/>`data` — Prisma `survey.findFirst` result |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

#### `PUT /api/surveys/{id}`

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `survey` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/surveys/[id]/route.ts](../app/api/surveys/[id]/route.ts) |

**Path params** — `id`

**Request body** — `updateSurveySchema` (`lib/schemas/surveySchema.ts`)

| Field | Type | Required |
|---|---|---|
| `title` | string — min 1, max 200 |  |
| `status` | enum: draft \| active \| closed |  |
| `addQuestions` | array — max 20 |  |
| `reorder` | object[] — min 0 |  |

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data, hadResponses }<br/>`data` — Prisma `survey.findFirst` result |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

#### `DELETE /api/surveys/{id}`

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `survey` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/surveys/[id]/route.ts](../app/api/surveys/[id]/route.ts) |

**Path params** — `id`

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/surveys/{id}/report`

#### `GET /api/surveys/{id}/report`

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `survey` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Source** | [app/api/surveys/[id]/report/route.ts](../app/api/surveys/[id]/report/route.ts) |

**Path params** — `id`

**Responses**

| Status | Body |
|---|---|
| `200` | binary — `text/csv`<br/>attachment: `${survey.type}-${survey.quarter}-${survey.year}.csv` |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/surveys/{id}/responses`

#### `GET /api/surveys/{id}/responses`

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `survey` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Source** | [app/api/surveys/[id]/responses/route.ts](../app/api/surveys/[id]/responses/route.ts) |

**Path params** — `id`

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data }<br/>`data` — Prisma `surveyResponse.findMany` result |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

---

## Module `swt` <a id="module-swt"></a>

_4 endpoints_

| Endpoint | Permission | Module gate |
|---|---|---|
| `GET /api/swt` | — | `swt` |
| `POST /api/swt` | — | `swt` |
| `PUT /api/swt/{id}` | — | `swt` |
| `DELETE /api/swt/{id}` | — | `swt` |

### `/api/swt`

#### `GET /api/swt`

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `swt` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Source** | [app/api/swt/route.ts](../app/api/swt/route.ts) |

**Query** — `quarter`, `year`

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data }<br/>`data` — Prisma `sWTEntry.findMany` result |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

#### `POST /api/swt`

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `swt` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/swt/route.ts](../app/api/swt/route.ts) |

**Request body** — `createSWTEntrySchema` (`lib/schemas/swtSchema.ts`)

| Field | Type | Required |
|---|---|---|
| `quarter` | string — min 1 | ✓ |
| `year` | number — min 2020, max 2035 | ✓ |
| `type` | enum: strength \| weakness \| trend | ✓ |
| `content` | string — min 1, max 500 | ✓ |
| `impact` | string — max 2000, nullable |  |
| `category` | enum: technology \| distribution \| product \| markets \| consumer \| social \| regulatory — nullable |  |
| `trendDirection` | enum: positive \| negative \| neutral — nullable |  |
| `sortOrder` | number — min 0 |  |

**Responses**

| Status | Body |
|---|---|
| `201` | { success: true, data }<br/>`data` — Prisma `sWTEntry.create` result |
| `409` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/swt/{id}`

#### `PUT /api/swt/{id}`

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `swt` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/swt/[id]/route.ts](../app/api/swt/[id]/route.ts) |

**Path params** — `id`

**Request body** — `updateSWTEntrySchema` (`lib/schemas/swtSchema.ts`)

| Field | Type | Required |
|---|---|---|
| `quarter` | string — min 1 | ✓ |
| `year` | number — min 2020, max 2035 | ✓ |
| `type` | enum: strength \| weakness \| trend | ✓ |
| `content` | string — min 1, max 500 | ✓ |
| `impact` | string — max 2000, nullable |  |
| `category` | enum: technology \| distribution \| product \| markets \| consumer \| social \| regulatory — nullable |  |
| `trendDirection` | enum: positive \| negative \| neutral — nullable |  |
| `sortOrder` | number — min 0 |  |

- derived from `createSWTEntrySchema`
- all fields optional (`.partial()`)

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data }<br/>`data` — Prisma `sWTEntry.update` result |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

#### `DELETE /api/swt/{id}`

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `swt` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/swt/[id]/route.ts](../app/api/swt/[id]/route.ts) |

**Path params** — `id`

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

---

## Module `teams` <a id="module-teams"></a>

_2 endpoints_

| Endpoint | Permission | Module gate |
|---|---|---|
| `GET /api/teams` | `Team:view` | `orgSetup.teams` |
| `POST /api/teams` | `Team:create` | `orgSetup.teams` |

### `/api/teams`

#### `GET /api/teams`

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `orgSetup.teams` — 404 when the org has the module disabled |
| **Permission** | `Team:view` |
| **Source** | [app/api/teams/route.ts](../app/api/teams/route.ts) |

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: [...], meta: PaginationMeta } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

#### `POST /api/teams`

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `orgSetup.teams` — 404 when the org has the module disabled |
| **Permission** | `Team:create` |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/teams/route.ts](../app/api/teams/route.ts) |

**Request body** — `createTeamSchema` (`lib/schemas/teamSchema.ts`)

| Field | Type | Required |
|---|---|---|
| `name` | string — min 1 | ✓ |
| `description` | string — nullable |  |
| `color` | string — default "#0066cc" |  |
| `headId` | string — nullable |  |

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data }<br/>`data` — Prisma `qsTeam.create` result |
| `409` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

---

## Module `units` <a id="module-units"></a>

_7 endpoints_

| Endpoint | Permission | Module gate |
|---|---|---|
| `GET /api/units` | `Unit:view` | `orgSetup.units` |
| `POST /api/units` | `Unit:create` | `orgSetup.units` |
| `PUT /api/units/{id}` | `Unit:update` | `orgSetup.units` |
| `DELETE /api/units/{id}` | `Unit:delete` | `orgSetup.units` |
| `POST /api/units/{id}/restore` | `Unit:delete` | `orgSetup.units` |
| `POST /api/units/bulk-restore` | `Unit:delete` | `orgSetup.units` |
| `POST /api/units/reorder` | `Unit:update` | `orgSetup.units` |

### `/api/units`

#### `GET /api/units`

GET /api/units — list units for the tenant. Server pagination + search + sort + the Trash view (includeDeleted).

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `orgSetup.units` — 404 when the org has the module disabled |
| **Permission** | `Unit:view` |
| **Source** | [app/api/units/route.ts](../app/api/units/route.ts) |

**Query** — `includeDeleted`, `search`, `sortBy`, `sortOrder`

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: [...], meta: PaginationMeta } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

#### `POST /api/units`

POST /api/units — create a unit. Duplicate (orgId, lowercased name) → 409.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `orgSetup.units` — 404 when the org has the module disabled |
| **Permission** | `Unit:create` |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/units/route.ts](../app/api/units/route.ts) |

**Request body** — `createUnitSchema` (`lib/schemas/unitSchema.ts`)

| Field | Type | Required |
|---|---|---|
| `name` | string — min 1 | ✓ |
| `description` | string — nullable |  |

**Responses**

| Status | Body |
|---|---|
| `201` | { success: true, data }<br/>`data` — Prisma `unitMaster.create` result |
| `409` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/units/{id}`

#### `PUT /api/units/{id}`

PUT /api/units/[id] — rename / update a unit. Same (orgId, nameKey) uniqueness.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `orgSetup.units` — 404 when the org has the module disabled |
| **Permission** | `Unit:update` |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/units/[id]/route.ts](../app/api/units/[id]/route.ts) |

**Path params** — `id`

**Request body** — `updateUnitSchema` (`lib/schemas/unitSchema.ts`)

| Field | Type | Required |
|---|---|---|
| `name` | string — min 1 |  |
| `description` | string — nullable |  |

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data }<br/>`data` — Prisma `unitMaster.update` result |
| `404` | { success: false, error } |
| `409` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

#### `DELETE /api/units/{id}`

DELETE /api/units/[id] — SOFT delete (moves the unit to Trash). Retains the row with a `deletedAt` tombstone so it can be restored.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `orgSetup.units` — 404 when the org has the module disabled |
| **Permission** | `Unit:delete` |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/units/[id]/route.ts](../app/api/units/[id]/route.ts) |

**Path params** — `id`

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, message } |
| `200` | { success: true } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/units/{id}/restore`

#### `POST /api/units/{id}/restore`

POST /api/units/[id]/restore — clear the soft-delete tombstone.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `orgSetup.units` — 404 when the org has the module disabled |
| **Permission** | `Unit:delete` |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/units/[id]/restore/route.ts](../app/api/units/[id]/restore/route.ts) |

**Path params** — `id`

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, message } |
| `200` | { success: true, data }<br/>`data` — Prisma `unitMaster.update` result |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/units/bulk-restore`

#### `POST /api/units/bulk-restore`

POST /api/units/bulk-restore — restore many soft-deleted units.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `orgSetup.units` — 404 when the org has the module disabled |
| **Permission** | `Unit:delete` |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/units/bulk-restore/route.ts](../app/api/units/bulk-restore/route.ts) |

**Request body** — JSON, not validated by a Zod schema (see route).

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: { restored } } |
| `400` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/units/reorder`

#### `POST /api/units/reorder`

POST /api/units/reorder — move a unit to a new manual position (org-shared).

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `orgSetup.units` — 404 when the org has the module disabled |
| **Permission** | `Unit:update` |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/units/reorder/route.ts](../app/api/units/reorder/route.ts) |

**Request body** — `reorderRowSchema` (`lib/schemas/reorderSchema.ts`)

| Field | Type | Required |
|---|---|---|
| `id` | string — min 1 | ✓ |
| `beforeId` | string — min 1, nullable | ✓ |
| `afterId` | string — min 1, nullable | ✓ |

**Responses**

_Handler delegates to `handleReorder()`._

| Status | Body |
|---|---|
| `200` | { success: true, data: { id, position } } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

---

## Module `users` <a id="module-users"></a>

_2 endpoints_

| Endpoint | Permission | Module gate |
|---|---|---|
| `GET /api/users` | — | — |
| `GET /api/users/{id}` | — | — |

### `/api/users`

#### `GET /api/users`

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Permission** | _none beyond auth_ |
| **Source** | [app/api/users/route.ts](../app/api/users/route.ts) |

**Query** — `search`, `teamId`

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: [...], meta: PaginationMeta } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/users/{id}`

#### `GET /api/users/{id}`

GET /api/users/[id] Resolve a single ACTIVE org member by user id, scoped to the caller's org. Used by the owner/who FilterPicker on KPI / Priority / WWW to display the name + avatar of an APPLIED owner filter even when that user isn't in the loaded 25-user page AND the filtered list is empty (0 rows). Without this, the picker fell back to "All owners" while a filter was actually active — the list showed "1 filter" and 0 items, but the picker named nobody. Tenant isolation is enforced by the `orgId` filter: a user id from another org (or one that isn't an active member here) resolves to 404, never leaks.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Permission** | _none beyond auth_ |
| **Source** | [app/api/users/[id]/route.ts](../app/api/users/[id]/route.ts) |

**Path params** — `id`

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

---

## Module `www` <a id="module-www"></a>

_16 endpoints_

| Endpoint | Permission | Module gate |
|---|---|---|
| `GET /api/www` | `WWW:view` | `www` |
| `POST /api/www` | `WWW:create` | `www` |
| `GET /api/www/{id}` | `WWW:view` | `www` |
| `PUT /api/www/{id}` | `WWW:update` | `www` |
| `DELETE /api/www/{id}` | `WWW:delete` | `www` |
| `GET /api/www/{id}/audit` | — | `www` |
| `GET /api/www/{id}/logs` | — | `www` |
| `GET /api/www/{id}/notes` | `WWW:view` | `www` |
| `POST /api/www/{id}/notes` | `WWW:update` | `www` |
| `PATCH /api/www/{id}/notes/{noteId}` | `WWW:update` | `www` |
| `DELETE /api/www/{id}/notes/{noteId}` | `WWW:update` | `www` |
| `POST /api/www/{id}/restore` | — | `www` |
| `GET /api/www/{id}/status-history` | `WWW:view` | `www` |
| `POST /api/www/bulk-restore` | — | `www` |
| `GET /api/www/export` | `WWW:view` | `www` |
| `POST /api/www/reorder` | `WWW:update` | `www` |

### `/api/www`

#### `GET /api/www`

GET /api/www — list all WWWItems for tenant

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `www` — 404 when the org has the module disabled |
| **Permission** | `WWW:view` |
| **Source** | [app/api/www/route.ts](../app/api/www/route.ts) |

**Query** — `from`, `includeDeleted`, `overdue`, `search`, `sortBy`, `sortOrder`, `status`, `teamId`, `to`, `who`

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: [...], meta: PaginationMeta } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

#### `POST /api/www`

POST /api/www — create a WWWItem

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `www` — 404 when the org has the module disabled |
| **Permission** | `WWW:create` |
| **Rate limit** | handler bucket `www:create` (limit LIMITS.mutation.limit) |
| **Source** | [app/api/www/route.ts](../app/api/www/route.ts) |

**Request body** — `createWWWSchema` (`lib/schemas/wwwSchema.ts`)

| Field | Type | Required |
|---|---|---|
| `who` | string — min 1 |  |
| `whoIds` | string[] — min 1 |  |
| `what` | string — min 1 | ✓ |
| `when` | string — min 1 |  |
| `dueDateTBD` | boolean — default false |  |
| `status` | enum: values of `WWW_STORED_STATUSES` — default "not-yet-started" |  |
| `notes` | string — nullable |  |
| `category` | enum: eNPS \| cNPS \| Others — nullable |  |
| `originalDueDate` | string — nullable |  |

- has cross-field `.refine()` rules

**Responses**

| Status | Body |
|---|---|
| `201` | { success: true, data, message }<br/>`data` inferred from object literal: `...primaryItem`, `whoIds`, `when`, `originalDueDate`, `createdAt`, `updatedAt`, `who_user`, `who_users` |
| `400` | { success: false, error } |
| `409` | { success: false, error } |
| `429` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/www/{id}`

#### `GET /api/www/{id}`

Route handlers

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `www` — 404 when the org has the module disabled |
| **Permission** | `WWW:view` |
| **Source** | [app/api/www/[id]/route.ts](../app/api/www/[id]/route.ts) |

**Path params** — `id`

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: { ...shapeWWWResponse(…), url } } |
| `403` | { success: false, error } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

#### `PUT /api/www/{id}`

Before/after fields needed to diff a WWW item for the audit timeline.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `www` — 404 when the org has the module disabled |
| **Permission** | `WWW:update` |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/www/[id]/route.ts](../app/api/www/[id]/route.ts) |

**Path params** — `id`

**Request body** — `updateWWWSchema` (`lib/schemas/wwwSchema.ts`)

| Field | Type | Required |
|---|---|---|
| `who` | string — min 1 |  |
| `whoIds` | string[] — min 1 |  |
| `what` | string — min 1 |  |
| `when` | string — min 1 |  |
| `dueDateTBD` | boolean |  |
| `status` | enum: values of `WWW_STORED_STATUSES` |  |
| `notes` | string — nullable |  |
| `category` | enum: eNPS \| cNPS \| Others — nullable |  |
| `originalDueDate` | string — nullable |  |
| `revisedDates` | string[] |  |

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data } |
| `400` | { success: false, error } |
| `403` | { success: false, error } |
| `404` | { success: false, error } |
| `409` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

#### `DELETE /api/www/{id}`

Before/after fields needed to diff a WWW item for the audit timeline.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `www` — 404 when the org has the module disabled |
| **Permission** | `WWW:delete` |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/www/[id]/route.ts](../app/api/www/[id]/route.ts) |

**Path params** — `id`

**Request body** — JSON, not validated by a Zod schema (see route).

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, message } |
| `403` | { success: false, error } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/www/{id}/audit`

#### `GET /api/www/{id}/audit`

GET /api/www/[id]/audit — full Change History timeline for one WWW item. Reads the centralized AuditEvent + AuditChange tables (the new system), mirroring /api/kpi|priority/[id]/audit. Newest-first; the panel does its own client-side filtering/search/counts so the API stays a simple read. Uses findUnique (NOT findFirst) for the existence check so soft-deleted items can still have their history viewed.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `www` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Source** | [app/api/www/[id]/audit/route.ts](../app/api/www/[id]/audit/route.ts) |

**Path params** — `id`

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data, meta }<br/>`data` — Prisma `auditEvent.findMany` result |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/www/{id}/logs`

#### `GET /api/www/{id}/logs`

GET /api/www/[id]/logs — change history for a WWW item (read-only) Source: AuditLog rows where entityType=WWWItem and entityId=id

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `www` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Source** | [app/api/www/[id]/logs/route.ts](../app/api/www/[id]/logs/route.ts) |

**Path params** — `id`

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data }<br/>`data` inferred from `.map()` projection: `id`, `action`, `oldValue`, `newValue`, `changedBy`, `changedByName`, `reason`, `createdAt` |
| `403` | { success: false, error } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/www/{id}/notes`

#### `GET /api/www/{id}/notes`

GET /api/www/[id]/notes — thread for one WWW item, newest first.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `www` — 404 when the org has the module disabled |
| **Permission** | `WWW:view` |
| **Source** | [app/api/www/[id]/notes/route.ts](../app/api/www/[id]/notes/route.ts) |

**Path params** — `id`

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data }<br/>`data` — Prisma `wWWNote.findMany` result |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

#### `POST /api/www/{id}/notes`

POST /api/www/[id]/notes — add a note. Anyone who can edit the item (creator / assignee / admin) may add a note.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `www` — 404 when the org has the module disabled |
| **Permission** | `WWW:update` |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/www/[id]/notes/route.ts](../app/api/www/[id]/notes/route.ts) |

**Path params** — `id`

**Request body** — `wwwNoteSchema` (`lib/schemas/wwwNoteSchema.ts`)

| Field | Type | Required |
|---|---|---|
| `content` | string — min 1 | ✓ |

**Responses**

| Status | Body |
|---|---|
| `201` | { success: true, data, message }<br/>`data` — Prisma `wWWNote.create` result |
| `400` | { success: false, error } |
| `403` | { success: false, error } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/www/{id}/notes/{noteId}`

#### `PATCH /api/www/{id}/notes/{noteId}`

PATCH /api/www/[id]/notes/[noteId] — edit a note's content. Only the note's author (or an admin) may edit it.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `www` — 404 when the org has the module disabled |
| **Permission** | `WWW:update` |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/www/[id]/notes/[noteId]/route.ts](../app/api/www/[id]/notes/[noteId]/route.ts) |

**Path params** — `id`, `noteId`

**Request body** — `wwwNoteSchema` (`lib/schemas/wwwNoteSchema.ts`)

| Field | Type | Required |
|---|---|---|
| `content` | string — min 1 | ✓ |

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data, message }<br/>`data` — Prisma `wWWNote.update` result |
| `400` | { success: false, error } |
| `403` | { success: false, error } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

#### `DELETE /api/www/{id}/notes/{noteId}`

DELETE /api/www/[id]/notes/[noteId] — remove a note. The author or an admin may delete it.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `www` — 404 when the org has the module disabled |
| **Permission** | `WWW:update` |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/www/[id]/notes/[noteId]/route.ts](../app/api/www/[id]/notes/[noteId]/route.ts) |

**Path params** — `id`, `noteId`

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, message } |
| `403` | { success: false, error } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/www/{id}/restore`

#### `POST /api/www/{id}/restore`

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `www` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/www/[id]/restore/route.ts](../app/api/www/[id]/restore/route.ts) |

**Path params** — `id`

**Request body** — JSON, not validated by a Zod schema (see route).

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, message } |
| `200` | { success: true, data }<br/>`data` — Prisma `wWWItem.update` result |
| `400` | { success: false, error } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/www/{id}/status-history`

#### `GET /api/www/{id}/status-history`

GET /api/www/[id]/status-history The full lifecycle of one WWW item: every status transition in order, plus the derived state today. This is what makes the requirement doc's WWW Review section answerable — "what happened to the items created in previous meetings?" — from the business record rather than from a transcript. Status is never inferred from what somebody said in a meeting; it comes from here. Rows written before the application started recording transitions are marked `source: "backfill"` and reconstructed from the audit trail, which is best-effort. They are labelled so nobody mistakes reconstructed history for recorded history. Unlike the sibling `audit` and `logs` routes, this checks the `WWW` resource permission and the item's row-level visibility — history is item content, not module metadata. See `docs/17-ai-meeting-rhythm-architecture.md` section I.2.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `www` — 404 when the org has the module disabled |
| **Permission** | `WWW:view` |
| **Source** | [app/api/www/[id]/status-history/route.ts](../app/api/www/[id]/status-history/route.ts) |

**Path params** — `id`

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: { item, history, current, daysToClose, hasBackfilledRows } } |
| `403` | { success: false, error } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/www/bulk-restore`

#### `POST /api/www/bulk-restore`

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `www` — 404 when the org has the module disabled |
| **Permission** | _none beyond auth_ |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/www/bulk-restore/route.ts](../app/api/www/bulk-restore/route.ts) |

**Request body** — JSON, not validated by a Zod schema (see route).

**Responses**

| Status | Body |
|---|---|
| `200` | { success: true, data: { restored } } |
| `400` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/www/export`

#### `GET /api/www/export`

GET /api/www/export — Global Export for WWW. Date-based interval: from/to ("YYYY-MM-DD") filter the `when` due date. Rows are scoped + visibility-filtered via the SAME `buildWwwScopeWhere` the list route uses. Node runtime (ExcelJS + @react-pdf/renderer).

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `www` — 404 when the org has the module disabled |
| **Permission** | `WWW:view` |
| **Source** | [app/api/www/export/route.ts](../app/api/www/export/route.ts) |

**Query** — `includeDeleted`, `status`, `teamId`, `who`

**Validated query params** — `exportBaseSchema` (`lib/exports/exportParams.ts`)

| Field | Type | Required |
|---|---|---|
| `columns` | unknown |  |

**Validated query params** — `dateRangeSchema` (`lib/exports/exportParams.ts`)

| Field | Type | Required |
|---|---|---|
| `from` | unknown |  |
| `to` | unknown |  |

**Responses**

| Status | Body |
|---|---|
| `400` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

### `/api/www/reorder`

#### `POST /api/www/reorder`

POST /api/www/reorder — move a WWW row to a new manual position.

| | |
|---|---|
| **Auth** | Session (NextAuth) + active org membership |
| **Module gate** | `www` — 404 when the org has the module disabled |
| **Permission** | `WWW:update` |
| **Rate limit** | shared mutation bucket |
| **Source** | [app/api/www/reorder/route.ts](../app/api/www/reorder/route.ts) |

**Request body** — `reorderRowSchema` (`lib/schemas/reorderSchema.ts`)

| Field | Type | Required |
|---|---|---|
| `id` | string — min 1 | ✓ |
| `beforeId` | string — min 1, nullable | ✓ |
| `afterId` | string — min 1, nullable | ✓ |

**Responses**

_Handler delegates to `handleReorder()`._

| Status | Body |
|---|---|
| `200` | { success: true, data: { id, position } } |
| `404` | { success: false, error } |
| _standard_ | `401` / `403` / `429` / `500` — see [Error model](#error-model) |

---

## Appendix A — permission resources

Every `resource:action` pair the RBAC v2 gate can enforce, from `lib/api/permissionsRegistry.ts`.

| Resource | Label | Actions |
|---|---|---|
| `Dashboard` | Dashboard | view |
| `KPI` | Individual KPI | view, create, update, delete |
| `TeamKPI` | Team KPI | view, create, update, delete |
| `Priority` | Priority | view, create, update, delete |
| `CriticalNumber` | Critical Numbers | view, create, update, delete |
| `Team` | Teams | view, create, update, delete |
| `Quarter` | Quarter Settings | view, create, update, delete |
| `Unit` | Unit Master | view, create, update, delete |
| `User` | Users | view, create, update, delete |
| `User.AddUser` | Add User Button | create |
| `User.Management` | User Management Tab | view |
| `WWW` | WWW | view, create, update, delete |
| `ClientMeetings.Dashboard` | Meeting Dashboard | view |
| `ClientMaster` | Client Master | view, create, update, delete |
| `ClientMember` | Client Members | view, create, update, delete |
| `DailyHuddle` | Daily Huddle | view, create, update, delete |
| `WeeklyMeeting` | Weekly Meeting | view, create, update, delete |
| `ClientMeetings.Report` | Meeting Report | view, update, delete |
| `OPSP.Create` | Create OPSP | view, create, update, delete |
| `OPSP.History` | OPSP History | view, create, update, delete |
| `OPSP.History.EditFinalize` | Edit after Finalize | update |
| `OPSP.Review` | OPSP Review | view, create, update, delete |
| `OPSP.Review.Critical` | Critical Review | view, create, update, delete |
| `OPSP.Categories` | Category Mgmt | view, create, update, delete |
| `Analytics.Scorecard` | Scorecard | view |
| `Analytics.Individual` | Individual | view |
| `Analytics.Teams` | Teams | view |
| `Analytics.Trends` | Trends | view |
| `People.Cycle` | Cycle | view, create, update, delete |
| `People.Goals` | Goals | view, create, update, delete |
| `People.Self` | Self-Assessment | view, create, update, delete |
| `People.Reviews` | Reviews | view, create, update, delete |
| `People.OneOnOne` | 1:1s | view, create, update, delete |
| `People.Feedback` | Feedback | view, create, update, delete |
| `People.Talent` | Talent | view, create, update, delete |
| `Habits` | Rockefeller Habits | view, create, update, delete |
| `FACe` | Function Accountability Chart | view, create, update, delete |
| `PACe` | Process Accountability Chart | view, create, update, delete |
| `SWT` | Strengths, Weaknesses & Trends | view, create, update, delete |
| `Survey` | Surveys | view, create, update, delete |
| `Survey.Responses` | Survey Responses | view, create |

<sub>Generated by `scripts/gen-api-contract.mjs` — do not hand-edit below the preamble. Prose lives in `docs/api-contract-preamble.md`.</sub>
