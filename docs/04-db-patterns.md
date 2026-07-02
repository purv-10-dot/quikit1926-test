# Database Patterns

Prisma + Postgres. Multi-tenant (the tenant boundary is called an **org**). The single most important rule in this codebase:

> **Every Prisma query that reads or writes org-scoped data MUST filter by `orgId`.**

Read this before you touch the schema or write a query.

> **`orgId`, not `tenantId`.** A global migration (`20260502201000_global_tenantid_to_orgid`) renamed the scoping column from `tenantId` to `orgId` across the whole schema. The org model is `Org` (physical table `Org`); membership is `OrgMember`. Any older doc/prose that says `tenantId` means `orgId`.

## The schema lives in one place

```
packages/database/prisma/schema.prisma
```

All apps share this **one** schema file (generator uses the `multiSchema` preview feature). It declares **10 Postgres schemas**, and every model is placed with the `@@schema("…")` directive:

| Postgres schema | Holds |
|---|---|
| `auth` | Central identity — `User`, `Account`, `Session`, `VerificationToken`, `AgentJwtIssuance` |
| `quikit` | `Org`, `OrgMember`, `App`, `UserAppAccess`, `OrgAppAccess`, `Subscription`, OAuth IdP tables |
| `public` | Cross-app — `Team`, `UserTeam`, `Notification`, `AuditLog`, `FeatureFlag`, `AppModuleFlag`, telemetry (`ApiCall*`), `SessionEvent`, `AuthLog`, `Plan`, `Invoice`, `Impersonation`, `BroadcastAnnouncement` |
| `app_quikscale` | KPI, Priority, WWWItem, OPSP*, client meetings, RBAC (`AppRole`/`UserAppRole`/`RolePermission`) |
| `app_quikinfra` | Construction ERP — `Cn*` models (projects, procurement, stock, finance) |
| `app_quikcrm` | CRM — `Crm*` models (leads, accounts, opportunities, quotes) |
| `app_quikhrms` | HR/payroll — the largest domain (employees, payroll, attendance, statutory) |
| `app_quiktrack` | Project tracker — `Qt*` models (issues, docs, custom fields) |
| `app_quiksocial` | Social — `Social*` models (posts, auto-reply, integrations) |
| `app_quikvc` | Venture capital — `VC*` models (deals, scoring, term sheets) |
| `app_<your-app>` | your domain models |

Every app-domain model is scoped by an `orgId` FK to `quikit.Org` with `onDelete: Cascade`. There is no cross-org query outside super-admin routes.

You **propose** schema changes in your PR description. The integration owner adds them. Don't edit `schema.prisma` directly without prior agreement — schema changes need migration coordination.

## Adding a new model — the request format

In your PR description:

```
### Schema change request

I need a new model to store campaign drafts.

#### Model: CampaignDraft

| Field | Type | Notes |
|---|---|---|
| id | String @id @default(cuid()) | |
| orgId | String | scoped per org |
| userId | String | author |
| title | String | required, max 200 |
| content | String @db.Text | rich text JSON |
| status | String @default("draft") | draft \| scheduled \| published |
| scheduledFor | DateTime? | nullable |
| createdAt | DateTime @default(now()) | |
| updatedAt | DateTime @updatedAt | |
| deletedAt | DateTime? | soft-delete marker (see below) |

#### Indexes
- (orgId)
- (orgId, status)
- (orgId, userId)

#### Relations
- org Org @relation(fields: [orgId], references: [id], onDelete: Cascade)

@@schema("app_quiksocial")
```

The integration owner adds the model, runs the migration, and pushes back. You then write your queries.

## Required fields on every org-scoped model

Every model that holds org data has at minimum:

```prisma
model YourModel {
  id        String   @id @default(cuid())
  orgId     String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  createdBy String?  // nullable to allow system-created rows
  updatedBy String?  // nullable
  deletedAt DateTime? // soft-delete: filter WHERE deletedAt IS NULL

  org       Org      @relation(fields: [orgId], references: [id], onDelete: Cascade)

  @@index([orgId])
  @@index([orgId, deletedAt])
  @@schema("app_<your-app>")
}
```

Always:
- `orgId` indexed.
- `onDelete: Cascade` from `Org` — when an org is deleted, its data goes with it.
- Composite indexes for any field you'll filter alongside `orgId` (e.g. `(orgId, status)`, `(orgId, deletedAt)`).

## Querying — the rules

### Always filter by orgId

```ts
// ✅ Correct
await db.kpi.findMany({ where: { orgId } });
await db.kpi.findUnique({ where: { id, orgId } });   // (findFirst if id isn't a composite unique)
await db.kpi.update({ where: { id, orgId }, data: { ... } });
await db.kpi.delete({ where: { id, orgId } });

// ❌ WRONG — leaks data across orgs
await db.kpi.findMany({ where: { id: someId } });
await db.kpi.findUnique({ where: { id } });
```

> **Soft delete is automatic on some models.** `@quikit/database` extends the Prisma client with soft-delete middleware for a set of models (e.g. `KPI`, `Team`, `Priority`, `WWWItem`, `Meeting`): `findMany`/`findFirst`/`count` auto-append `deletedAt: null` unless you explicitly pass a `deletedAt` filter. To read soft-deleted rows, pass `where: { deletedAt: { not: null } }`.

### Use `select` for list endpoints, `include` for detail

```ts
// ✅ List — select only fields you render
const items = await db.kpi.findMany({
  where: { orgId },
  select: { id: true, name: true, owner_user: { select: { id: true, firstName: true } } },
});

// ✅ Detail — include for full related models
const item = await db.kpi.findUnique({
  where: { id, orgId },
  include: { owner_user: true, weeklyValues: true },
});
```

`include` with no field list bloats the payload. Use `select` whenever the consumer only needs specific fields.

### `findFirst` vs `findUnique`

- `findUnique` requires a true uniqueness constraint in the schema. Fast.
- `findFirst` accepts arbitrary `where`. Slightly slower but more flexible.
- For composite uniqueness (like `orgId + slug`), define `@@unique([orgId, slug])` and use `findUnique` with the composite key.

### Cross-org queries are forbidden

There is exactly one place cross-org queries are allowed: super-admin routes wrapped in `requireSuperAdmin` (mostly in `quikit`/`admin`). Your app never has these. If you find yourself wanting to query across orgs, stop and ask the integration owner.

## Transactions

Use transactions when you need atomicity:

```ts
const result = await db.$transaction(async (tx) => {
  const kpi = await tx.kpi.create({
    data: { ...input, orgId, createdBy: userId },
  });
  await tx.auditLog.create({
    data: { orgId, actorId: userId, entityId: kpi.id, entityType: "KPI", action: "CREATE" },
  });
  return kpi;
});
```

The `tx` client behaves like `db` but is bound to the transaction. Don't use `db` inside the callback — use `tx`.

Transactions roll back automatically if any query throws.

## Performance — what to watch

1. **N+1 queries**: don't call `db.X.findMany` inside a `.map()`. Use `include` or fetch in bulk and stitch.
2. **Unbounded lists**: every `findMany` should have `take` (50 default) unless you have a strict reason not to.
3. **Missing indexes**: if you filter by `(orgId, status, createdAt)`, define a composite index. Sequential scans on large tables cost real money.
4. **Connection pool exhaustion**: in production we use Neon's edge pooler. Locally with vanilla Postgres, set Prisma's `connection_limit` to a sane value (5–10) so dev tools don't drink the pool.

## Migrations

You don't write migrations. The integration owner runs:

```bash
npm run db:migrate -- --name <descriptive-name>
```

after editing `schema.prisma`. The migration files in `packages/database/prisma/migrations/` are checked in (58+ migrations; the `tenantId → orgId` rename is `20260502201000_global_tenantid_to_orgid`).

For local schema sync (development only — never in CI):

```bash
npm run db:push
```

`db:push` is destructive — it drops/recreates without a migration record. Use it for local rapid iteration; never in CI or production.

## Seeding

Seed scripts live in `packages/database/` and are invoked from the repo root:

- `npm run db:seed:e2e` — fixed org + fixtures for Playwright tests.
- `npm run db:seed:oauth` — seeds OAuth client rows for local SSO.
- `npm run db:seed:quikvc` — QuikVC demo data.

Don't add new seed scripts in your app. If you need test data, add it to your test setup files instead.

## Audit log

Every mutation that affects org data writes an audit log entry. The cross-app `AuditLog` model lives in the `public` schema (`orgId`, `action`, `entityType`, `entityId`, `changes[]`, `actorId`, `reason`, …). QuikScale additionally has a richer per-entity audit system in `app_quikscale` — `AuditEvent` + `AuditChange` + `AuditEventRead`. Write via the app's `writeAuditLog` helper:

```ts
import { writeAuditLog } from "@/lib/api/auditLog";

await writeAuditLog({
  orgId, actorId: userId,
  action: "CREATE" | "UPDATE" | "DELETE",
  entityType: "KPI",
  entityId: kpi.id,
  changes: ["name", "status"],   // names of changed fields only
  reason: "User-friendly summary, no PII",
});
```

The audit log is queried by admins — don't use it for app logic.

## Common rejections

- ❌ Prisma query without `orgId` in `where`.
- ❌ Edited `schema.prisma` without an approved schema-change request.
- ❌ `findMany` without `take`.
- ❌ Used `include` to dump entire related model when consumer only needs `id` + `name`.
- ❌ Wrote a migration file by hand instead of using `prisma migrate dev`.
- ❌ Used `db.$queryRaw` with user input (SQL injection risk; use parameters).

## See also

- `docs/03-api-patterns.md` — the API route shape that wraps these queries.
- `docs/exemplars/prisma-list-query.example.ts` — canonical list query.
- `docs/exemplars/prisma-detail-query.example.ts` — canonical detail query.
- `packages/database/prisma/schema.prisma` — full schema (read-only for you).
