# Database Patterns

Prisma + Postgres. Multi-tenant. The single most important rule in this codebase:

> **Every Prisma query that reads or writes tenant-scoped data MUST filter by `tenantId`.**

Read this before you touch the schema or write a query.

## The schema lives in one place

```
packages/database/prisma/schema.prisma
```

All apps share this one schema. Models are namespaced into Postgres schemas using the `@@schema("…")` directive:

- `public` — cross-cutting (Tenant, Membership, Apps, AuditLog).
- `app_quikscale` — KPI, OPSP, Priority, WWW models.
- `app_<your-app>` — your domain models.

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
| tenantId | String | scoped per tenant |
| userId | String | author |
| title | String | required, max 200 |
| content | String @db.Text | rich text JSON |
| status | String @default("draft") | draft \| scheduled \| published |
| scheduledFor | DateTime? | nullable |
| createdAt | DateTime @default(now()) | |
| updatedAt | DateTime @updatedAt | |

#### Indexes
- (tenantId)
- (tenantId, status)
- (tenantId, userId)

#### Relations
- tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

@@schema("app_quiksocial")
```

The integration owner adds the model, runs the migration, and pushes back. You then write your queries.

## Required fields on every tenant-scoped model

Every model that holds tenant data has at minimum:

```prisma
model YourModel {
  id        String   @id @default(cuid())
  tenantId  String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  createdBy String?  // nullable to allow system-created rows
  updatedBy String?  // nullable

  tenant    Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@index([tenantId])
  @@schema("app_<your-app>")
}
```

Always:
- `tenantId` indexed.
- `onDelete: Cascade` from Tenant — when a tenant is deleted, their data goes with them.
- Composite indexes for any field you'll filter alongside tenantId.

## Querying — the rules

### Always filter by tenantId

```ts
// ✅ Correct
await db.widget.findMany({ where: { tenantId } });
await db.widget.findUnique({ where: { id, tenantId } });
await db.widget.update({ where: { id, tenantId }, data: { ... } });
await db.widget.delete({ where: { id, tenantId } });

// ❌ WRONG — leaks data across tenants
await db.widget.findMany({ where: { id: someId } });
await db.widget.findUnique({ where: { id } });
```

### Use `select` for list endpoints, `include` for detail

```ts
// ✅ List — select only fields you render
const items = await db.widget.findMany({
  where: { tenantId },
  select: { id: true, name: true, owner: { select: { id: true, firstName: true } } },
});

// ✅ Detail — include for full related models
const item = await db.widget.findUnique({
  where: { id, tenantId },
  include: { owner: true, comments: true },
});
```

`include` with no field list bloats the payload. Use `select` whenever the consumer only needs specific fields.

### `findFirst` vs `findUnique`

- `findUnique` requires a true uniqueness constraint in the schema. Fast.
- `findFirst` accepts arbitrary `where`. Slightly slower but more flexible.
- For composite uniqueness (like `tenantId + slug`), define `@@unique([tenantId, slug])` and use `findUnique` with the composite key.

### Cross-tenant queries are forbidden

There is exactly one place cross-tenant queries are allowed: the super-admin app, in routes wrapped in `requireSuperAdmin`. Your app never has these. If you find yourself wanting to query across tenants, stop and ask the integration owner.

## Transactions

Use transactions when you need atomicity:

```ts
const result = await db.$transaction(async (tx) => {
  const widget = await tx.widget.create({
    data: { ...input, tenantId, createdBy: userId },
  });
  await tx.auditLog.create({
    data: { tenantId, actorId: userId, entityId: widget.id, action: "CREATE" },
  });
  return widget;
});
```

The `tx` client behaves like `db` but is bound to the transaction. Don't use `db` inside the callback — use `tx`.

Transactions roll back automatically if any query throws.

## Performance — what to watch

1. **N+1 queries**: don't call `db.X.findMany` inside a `.map()`. Use `include` or fetch in bulk and stitch.
2. **Unbounded lists**: every `findMany` should have `take` (50 default) unless you have a strict reason not to.
3. **Missing indexes**: if you filter by `(tenantId, status, createdAt)`, define a composite index. Sequential scans on large tables cost real money.
4. **Connection pool exhaustion**: in production we use Neon's edge pooler. Locally with vanilla Postgres, set Prisma's `connection_limit` to a sane value (5–10) so dev tools don't drink the pool.

## Migrations

You don't write migrations. The integration owner runs:

```bash
npm run db:migrate -- --name <descriptive-name>
```

after editing `schema.prisma`. The migration files in `packages/database/migrations/` are checked in.

For local schema sync (development only — never in CI):

```bash
npm run db:push
```

`db:push` is destructive — it drops/recreates without a migration record. Use it for local rapid iteration; never in CI or production.

## Seeding

Seed scripts live in `packages/database/prisma/seed-*.ts`. There are several:

- `seed.ts` — minimal demo tenant for dev.
- `seed-full.ts` — large dataset for performance testing.
- `seed-e2e.ts` — fixed dataset for Playwright tests.

Don't add new seed scripts in your app. If you need test data, add it to your test setup files instead.

## Audit log

Every mutation that affects tenant data writes an audit log entry. The `AuditLog` model lives in `public` schema and is written via the `writeAuditLog` helper:

```ts
import { writeAuditLog } from "@/lib/api/auditLog";

await writeAuditLog({
  tenantId, actorId: userId,
  action: "CREATE" | "UPDATE" | "DELETE",
  entityType: "Widget",
  entityId: widget.id,
  changes: ["name", "status"],   // names of changed fields only
  reason: "User-friendly summary, no PII",
});
```

The audit log is queried by admins — don't use it for app logic.

## Common rejections

- ❌ Prisma query without `tenantId` in `where`.
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
