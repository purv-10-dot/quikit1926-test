# QuikIT database flow and schema guide

This document describes the **current** PostgreSQL layout and request flow for the QuikIT monorepo: which Postgres schemas exist, what each holds, how apps use them, and how login connects to org selection, the launcher, and product apps.

---

## 1. Big picture

You run **one** PostgreSQL database (name comes from `DATABASE_URL`). Prisma uses **multiple Postgres schemas** so central auth, platform metadata, shared glue, and each product app stay in separate namespaces.

The datasource is declared in `packages/database/prisma/schema.prisma` (generator uses the `multiSchema` preview feature). It declares **10 schemas** (~655 models total):

| Schema | Role |
|--------|------|
| `auth` | Central identity (`User`, `Account`, `Session`, `VerificationToken`, `AgentJwtIssuance`) |
| `quikit` | App registry, organizations, memberships, per-user and per-org app access, subscriptions, OAuth IdP tables |
| `public` | Shared cross-app tables (teams, notifications, audit, telemetry, billing/plan rows, super-admin instrumentation, etc.) |
| `app_quikscale` | QuikScale domain data |
| `app_quikinfra` | QuikInfra domain data (`Cn*` models) |
| `app_quikcrm` | QuikCRM domain data (`Crm*` models) |
| `app_quikhrms` | QuikHRMS domain data (largest domain) |
| `app_quiktrack` | QuikTrack domain data (`Qt*` models) |
| `app_quiksocial` | QuikSocial domain data (`Social*` models) |
| `app_quikvc` | QuikVC domain data (`VC*` models) |

**Connection variables**

- `DATABASE_URL` ? runtime queries (in production this often points at a pooler; the schema comments describe PgBouncer-style query params when applicable).
- `DATABASE_URL_DIRECT` ? **required** for `prisma migrate` / DDL. Prisma 5.x does **not** fall back to `DATABASE_URL` when this is unset; you get **P1012** even if `DATABASE_URL` is valid. For local Postgres without a pooler, the two URLs are often identical.

Set both in each app?s `.env.local` (or inherited environment) when that app loads Prisma.

**Shared package:** database access goes through **`@quikit/database`** (`packages/database`), not ad-hoc SQL from each app.

---

## 2. Schema responsibilities

### `auth` ? identity core

NextAuth-style tables for the central user and credentials:

- `User` ? profile, preferences, relations into org data (memberships live in `quikit`, keyed by `userId`).
- `Account` ? OAuth provider linking.
- `Session` ? session rows.
- `VerificationToken` ? email verification, password reset, org invite tokens, etc.

**Typical use:** sign-in, session resolution, password and email verification flows (`apps/auth`).

---

### `quikit` ? organizations, app registry, access control

Platform tables for apps and tenants (organizations):

- `App` ? registered apps (`slug`, `baseUrl`, `status`, `requiresOrgAdmin`, ?).
- `OAuthClient`, `OAuthCode`, `OAuthRefreshToken` ? QuikIT as OAuth2/OIDC IdP for business apps. Codes and refresh tokens carry **`orgId`** (active organization context) and an optional `sessionId`.
- `Org` ? organization master data (model **and** physical table are both named `Org` ? there is no separate `Tenant` model). Includes **`allowedEmailDomains`** (optional gate for inviting members by email domain), `plan`, fiscal settings, and branding.
- `OrgMember` ? user-to-org membership: `role`, optional `teamId`, invitation fields (`inviteMethod`, `inviteAppIds`, `invitationToken`), `status`. `@@unique([orgId, userId])`.
- `UserAppAccess` ? user-level grant per `(userId, orgId, appId)` with a `role` (default `member`).
- `OrgAppAccess` ? org-level hard gate per app (`enabled`, optional `reason`, `trialEndsAt`). Sparse: a row exists only when an app is explicitly disabled/trialing.
- `Subscription` ? per-org trial/billing state (`status`, `planSlug`, `trialEndsAt`). `@@unique([orgId])`; grandfathered orgs may have no row.

**Typical use:** org list after login, org switcher, launcher authorization, OAuth authorization codes tied to an `orgId`.

---

### `public` ? shared platform and operations

Cross-cutting tables (~17 Prisma models in this schema), including:

- `Team`, `UserTeam` ? org-scoped team graph (`orgId` on both).
- `Notification`, `AuditLog`, `FeatureFlag`, `AppModuleFlag` ? org-scoped product and ops concerns.
- `ApiCall`, `ApiCallHourlyRollup` ? request telemetry and rollups (`orgId` nullable for pre-auth traffic).
- `AppHealthCheck` ? uptime probes (ties to `quikit.App` via `appId`).
- `SessionEvent` ? auth lifecycle events for analytics (`orgId` nullable before org selection).
- `BroadcastAnnouncement`, `BroadcastDismissal` ? platform banners.
- `Plan`, `Invoice` ? plan catalog and billing-related rows.
- `Impersonation`, `PlatformAlert` ? super-admin impersonation tokens and firing alerts.

**Typical use:** auditing, feature flags, module flags, telemetry, health, impersonation, announcements, plans/invoices.

---

### `app_quikscale` ? QuikScale (~59 models)

Operational excellence domain: KPIs, priorities, WWW, client meetings (daily huddles + weekly meetings), OPSP, performance reviews, goals, 1:1s, feedback, habits, surveys, quarter settings, RBAC v2 (`AppRole`/`UserAppRole`/`RolePermission`), and a per-entity audit system (`AuditEvent`/`AuditChange`/`AuditEventRead`). QuikScale owns its **own** team tables (`QsTeam`/`QsUserTeam`), separate from `public.Team`.

Org-owned rows use **`orgId`** (FK to `quikit.Org`, `onDelete: Cascade`).

---

### `app_quikinfra` ? QuikInfra (~86 models)

Construction / ERP-style domain: companies, vendors, projects, procurement (PR/PO/GRN/indent), inventory & stock ledger, finance, equipment/fleet, QC, safety, documents, expenses, document numbering, and construction-local RBAC (`CnAppRole`/`CnUserAppRole`/`CnRolePermissionV2`) + audit. All models are prefixed **`Cn`**.

Scoped with **`orgId`** on org-owned tables.

---

### `app_quikcrm` ? QuikCRM (~101 models)

Sales domain (models prefixed **`Crm`**): accounts, contacts, leads, opportunities (+ stage transitions), quotes (+ lines/approvals/portal), orders, products & price lists, tasks, call logs & telephony, sales teams/groups, workflow automations, sequences, documents, SLA rules, dashboards. Scoped with **`orgId`**.

### `app_quikhrms` ? QuikHRMS (~283 models ? largest domain)

HR/payroll domain: employees, recruitment (candidates/interviews/offers), on/off-boarding, org structure, attendance, leave, WFH, shifts/rosters, appraisals & goals, payroll (salary structures, pay runs, payslips), statutory compliance (EPF/PT/TDS/LWF), reimbursements, loans, assets, travel, disciplinary, delegations, approvals, plus its own `Hrms*` RBAC tables. ~115 of the schema's enums live here. Scoped with **`orgId`**.

### `app_quiktrack` ? QuikTrack (~45 models)

Project-management domain (models prefixed **`Qt`**): projects, teams, issues, custom fields, grouped kanban, docs & doc sharing, timesheets, dashboards, saved views/reports, invitations, and `Qt*` RBAC tables. Scoped with **`orgId`**.

### `app_quiksocial` ? QuikSocial (~22 models)

Social domain (models prefixed **`Social`**): posts, comments, reactions, connected accounts, auto-reply rules + logs, engagement metrics, mentions, hashtag tracking, and `Social*` RBAC tables. Scoped with **`orgId`**.

### `app_quikvc` ? QuikVC (~28 models)

VC workflow (models prefixed **`VC`**): funds, applications, deals, scoring, IC memos and votes, investors, commitments, capital calls, allocations, term sheets, notifications, VC audit log, etc. Scoped with **`orgId`**.

---

## 3. Naming: `Org`, `OrgMember`, and `orgId`

| Layer | Convention |
|-------|----------------|
| **Prisma model** | `Org` for the organization entity (membership is `OrgMember`) |
| **Physical table** | `Org` in schema `quikit` (model name = table name; no `@@map`) |
| **Foreign key column** | `orgId` in Prisma and in Postgres |

There is no `Tenant` model and effectively no `tenantId` column for org scoping; the global migration `20260502201000_global_tenantid_to_orgid` renamed legacy `tenantId` ? **`orgId`** everywhere (see migrations under `packages/database/prisma/migrations/`).

**Application code:** some helpers, logs, or OAuth **scope** strings may still say `tenant`; they usually refer to the **same organization id** as `orgId`. Prefer `orgId` in new API payloads and session fields.

---

## 4. End-to-end data flow

### A) Login (`apps/auth`, dev port **3001**)

1. User signs in on the auth app (NextAuth route under `app/api/auth/[...nextauth]`).
2. `User`, `Account`, `Session` are read/written in the **`auth`** schema.
3. Org membership is resolved from **`quikit`** (`Membership` / `OrgMember`, org row `Tenant` / `Org`).
4. Where instrumented, **`public.SessionEvent`** (and similar) may record login-related events.

---

### B) Org selection (`/select-org` and APIs)

1. **`GET /api/org/memberships`** (`apps/auth/app/api/org/memberships/route.ts`) ? lists the user?s org memberships from `quikit`.
2. **`POST /api/auth/select-org`** (`apps/auth/app/api/auth/select-org/route.ts`) ? verifies the user has an **active** membership for the requested **`orgId`**, returns `{ success, orgId, role }`. The **client** then calls `session.update({ orgId, membershipRole, ? })` so the JWT carries the active org. With a shared **`NEXTAUTH_SECRET`**, other apps trust the same session shape.

---

### C) Launcher (`apps/quikit`, dev port **3000**)

1. **`GET /api/apps/launcher`** (`apps/quikit/app/api/apps/launcher/route.ts`) loads the app catalog from **`quikit.App`**.
2. It resolves **`orgId`** from the session JWT, or falls back to the user?s first **active** membership if `orgId` is not yet on the session.
3. For each app it checks **`quikit.UserAppAccess`** for `(userId, orgId)` to set `installed` and `role` on each tile.
4. **`baseUrl`** for each tile can be overridden per environment so local dev does not follow production URLs stored in the DB:

   `QUIKIT_URL`, `QUIKSCALE_URL`, `ADMIN_URL`, `QUIKVC_URL`, `QUIKINFRA_URL`

5. Response includes `quikitUrl` for client navigation (from `QUIKIT_URL` or `NEXTAUTH_URL`). Response is marked **private** HTTP cache (`Cache-Control: private, max-age=30, stale-while-revalidate=60`).

---

### D) Admin (`apps/admin`, dev port **3002**)

Uses **`@quikit/database`** to manage platform configuration: org and access models in **`quikit`**, shared models in **`public`** as needed. If `DATABASE_URL` / `DATABASE_URL_DIRECT` are wrong or the DB is unreachable, Prisma fails at startup.

---

### E) Business apps

| App | Port (dev) | Primary data schema |
|-----|------------|---------------------|
| `quikscale` | 3003 | `app_quikscale` + shared schemas as needed |
| `quiktrack` | 3004 | `app_quiktrack` + shared |
| `quikvc` | 3005 | `app_quikvc` + shared |
| `quikinfra` | 3006 | `app_quikinfra` + shared |
| `quiksocial` | 3007 | `app_quiksocial` + shared |
| `quikcrm` | 3008 | `app_quikcrm` + shared |
| `quikhrms` | 3009 | `app_quikhrms` + shared |

Each app still reads session and org context from **`auth`** / **`quikit`** (and **`public`** for teams, flags, notifications, etc.) as required.

---

## 5. App-to-schema map (practical)

| App | Primary schemas |
|-----|-----------------|
| `apps/auth` | Read/write **`auth`**; read **`quikit`** for orgs and memberships; write **`public`** where instrumentation applies |
| `apps/quikit` (launcher/IdP) | Read/write **`quikit`** for registry, access, OAuth codes; read **`public`** for shared features + super-admin |
| `apps/admin` | **`quikit`** + **`public`** for administration |
| `apps/quikscale` | **`app_quikscale`** + shared schemas |
| `apps/quiktrack` | **`app_quiktrack`** + shared schemas |
| `apps/quikvc` | **`app_quikvc`** + shared schemas |
| `apps/quikinfra` | **`app_quikinfra`** + shared schemas |
| `apps/quiksocial` | **`app_quiksocial`** + shared schemas |
| `apps/quikcrm` | **`app_quikcrm`** + shared schemas |
| `apps/quikhrms` | **`app_quikhrms`** + shared schemas |

---

## 6. Local development defaults

**Dev ports** (from each app?s `package.json` `dev` script):

| App | Dev port |
|-----|------|
| Launcher (`quikit`) | 3000 |
| Auth | 3001 |
| Admin | 3002 |
| QuikScale | 3003 |
| QuikTrack | 3004 |
| QuikVC | 3005 |
| QuikInfra | 3006 |
| QuikSocial | 3007 |
| QuikCRM | 3008 |
| QuikHRMS | 3009 |
| `_template` (scaffold) | 3010 |

(These are the `next dev` ports. A few apps bind different `npm start` ports — see [`docs/13-app-ports-and-env.md`](docs/13-app-ports-and-env.md).)

From the **monorepo root** (`quikitzipnew/`), `npm run dev` runs **Turbo** across packages/apps. Filtered examples: `npm run dev:quikit`, `npm run dev:auth`, `npm run dev:quikscale`, `npm run dev:admin`.

**Database commands** (also from monorepo root):

- `npm run db:migrate` ? `prisma migrate dev` in `packages/database`
- `npm run db:migrate:deploy` ? `prisma migrate deploy` (CI / shared environments)
- `npm run db:migrate:status` ? migration status
- `npm run db:generate` ? `prisma generate`
- `npm run db:studio` ? Prisma Studio

Equivalent scripts exist on **`packages/database`** (`db:migrate:deploy`, etc.) if you `cd` there.

Set **`DATABASE_URL`** and **`DATABASE_URL_DIRECT`** in each app?s `.env.local` to the same Postgres instance you migrated.

**Tip:** In `apps/quikit/.env.local`, set `ADMIN_URL=http://localhost:3005` (and other `*_URL` overrides) so launcher tiles stay on localhost while `App.baseUrl` in the database still points at deployed hosts.

---

## 7. ?Column does not exist? / migration drift

Usually the **database** is behind **Prisma** (or the opposite): a migration was not applied, or an old DB still has pre-rename columns.

**Fix pattern**

1. From repo root: `npm run db:migrate:deploy` (or `cd packages/database && npx prisma migrate deploy`).
2. Regenerate client: `npm run db:generate`.
3. Restart dev servers.

Avoid hand-editing production schemas without a matching migration in `packages/database/prisma/migrations/`.

---

## 8. Standardization snapshot

| Area | Status |
|------|--------|
| Prisma `schema.prisma` | Tenant-scoped columns use **`orgId`** |
| Postgres (after migrations) | **`orgId`** on scoped tables |
| Auth, launcher, admin | Session and launcher APIs use **`orgId`** for active organization |
| Product apps | Data models use **`orgId`**; occasional legacy naming in code or OAuth scopes may still say ?tenant? |

Older prose in `docs/01-architecture.md` or `docs/04-db-patterns.md` may still mention `tenantId`; **this guide and `schema.prisma` take precedence** when they disagree.

---

## 9. Operational checklist

1. Treat **`packages/database/prisma/schema.prisma`** as the source of truth for models and `@@schema(...)` placement.
2. Ship schema changes with **`prisma migrate`**; keep **`DATABASE_URL_DIRECT`** set everywhere migrations run.
3. After pulling migration updates: deploy migrations, regenerate the client, restart apps.
4. Optional seeds: `db:seed:e2e`, `db:seed:oauth`, `db:seed:quikvc` (see `packages/database/package.json`).

---

## 10. Quick reference paths

| What | Where |
|------|------|
| Prisma schema | `packages/database/prisma/schema.prisma` |
| Migrations | `packages/database/prisma/migrations/` |
| Database package | `packages/database/` (`@quikit/database`) |
| Launcher apps API | `apps/quikit/app/api/apps/launcher/route.ts` |
| Org memberships API | `apps/auth/app/api/org/memberships/route.ts` |
| Select org API | `apps/auth/app/api/auth/select-org/route.ts` |
| Example rename migration | `packages/database/prisma/migrations/20260502201000_global_tenantid_to_orgid/migration.sql` |

---

*Optional follow-up:* a spreadsheet or appendix listing each Prisma model with `@@schema`, `@@map`, and indexes helps onboarding and compliance; this file stays focused on flow and boundaries.
