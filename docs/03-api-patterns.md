# API Patterns

Every API route in this codebase follows the same shape. Read this once, then copy `app/api/example/route.ts` whenever you add a new endpoint.

## The contract

Every API route must:

1. **Be wrapped in an auth helper** — the app's `withOrgAuth` (its thin `lib/api/` wrapper over `@quikit/auth`), or `requireAdmin` / (extremely rarely) `requireSuperAdmin`.
2. **Validate input with Zod** — never trust `req.body` directly.
3. **Filter by `orgId`** in every Prisma query.
4. **Return a consistent response shape**: `{ success: true, data }` or `{ success: false, error }`.
5. **Catch `(error: unknown)`** — never `(e: any)`.
6. **Return 201 from POSTs that create resources**, 200 from everything else.
7. **Have at least three tests**: unauthenticated → 401, cross-org → rejected, happy path.

> **Naming:** the wrapper is called `withOrgAuth` in quikscale/quikvc/quiksocial/quiktrack/quikinfra, `withTenantAuth` in quikcrm, and `withAdminAuth` in admin. They all resolve the same `orgId` from the session. Examples below use `withOrgAuth`.

## The canonical shape

```ts
// apps/<your-app>/app/api/<resource>/route.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";

const createSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
});

export const GET = withOrgAuth(async ({ orgId }) => {
  const items = await db.widget.findMany({
    where: { orgId },
    select: { id: true, name: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return NextResponse.json({ success: true, data: items });
});

export const POST = withOrgAuth(async ({ orgId, userId }, req: NextRequest) => {
  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
      { status: 400 },
    );
  }
  const widget = await db.widget.create({
    data: { ...parsed.data, orgId, createdBy: userId },
    select: { id: true, name: true },
  });
  return NextResponse.json({ success: true, data: widget }, { status: 201 });
});
```

The `withOrgAuth` context is `{ session, userId, orgId }`. The wrapper already handles the 401 (no session), 403 (no active membership), and 500 (unhandled throw) boilerplate, and fire-and-forget request logging (`logApiCall`) — so your handler only writes the happy path.

## Auth wrappers

| Wrapper | Use when |
|---|---|
| `withOrgAuth` | The route reads/writes data scoped to the calling user's org. **99% of routes.** |
| `requireAdmin` | Route is only available to org admins. Same org scoping; checks `membershipRole` against `ADMIN_TIER_ROLES` (`super_admin`, `org_admin`, legacy `admin`). |
| `requireSuperAdmin` | Cross-org operations (almost never — only `quikit`/`admin`). Checks `session.user.isSuperAdmin`. |

`requireAdmin`/`requireSuperAdmin`/`getOrgId` are **factories** from `@quikit/auth` (`createRequireAdmin`, `createRequireSuperAdmin`, `createGetOrgId`). Each app instantiates them once in `lib/api/` with its `authOptions`, then `withOrgAuth` composes them. Don't roll your own auth check; use these.

`withOrgAuth` layers on two optional gates:

**Module gating** — hide a whole module per org (feature flags):
```ts
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
const withOrgAuth = withOrgAuthForModule("kpi");   // 404s if the org has the "kpi" module disabled

export const POST = withOrgAuth(async ({ orgId }, req) => { /* ... */ });
```

**RBAC v2 permission gating** — check a granular `(resource, action)` grant:
```ts
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
const auth = withOrgAuthForResource("kpi", "KPI");   // module + resource bound

export const GET    = auth.view(async ({ orgId }, req) => { /* ... */ });
export const POST   = auth.create(async ({ orgId }, req) => { /* ... */ });
export const PATCH  = auth.update(async ({ orgId }, req) => { /* ... */ });
export const DELETE = auth.delete(async ({ orgId }, req) => { /* ... */ });
```

Under the hood this calls `userCan(userId, orgId, resource, action)`, which is `true` when the user's `UserAppRole → RolePermission` OR an additive `UserPermissionExtra` grants it (see [`login-roles-architecture-and-flow.md`](./login-roles-architecture-and-flow.md)). For a brand-new app, leave both gates off until the integration owner registers your modules/roles.

## Input validation with Zod

Every request body, query string, and route param goes through Zod:

```ts
const querySchema = z.object({
  status: z.enum(["draft", "active", "completed"]).optional(),
  page: z.coerce.number().int().positive().default(1),
});

export const GET = withOrgAuth(async ({ orgId }, req: NextRequest) => {
  const parsed = querySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) return validationError(parsed);
  const { status, page } = parsed.data;
  // ...
});
```

The `validationError(parsed)` helper formats a consistent 400 response. Live in `apps/<your-app>/lib/api/validationError.ts` (copy from quikscale).

## Response shape — non-negotiable

Every response from every route looks like one of these two shapes:

```jsonc
// Success
{ "success": true, "data": <whatever> }

// Error
{ "success": false, "error": "<string message>" }
```

Don't invent new shapes. Don't return raw arrays. Don't return `null` on success — use `{ success: true, data: null }` if you must.

## Error handling

```ts
export const POST = withOrgAuth(async ({ orgId, userId }, req: NextRequest) => {
  try {
    // ... business logic
    return NextResponse.json({ success: true, data: result }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Operation failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
});
```

`withOrgAuth` already wraps your handler in a try/catch that returns this exact 500 shape, so an explicit try/catch is only needed when you want a *specific* status (e.g. 409 for a conflict).

- `catch (error: unknown)` is required by ESLint (`no-explicit-any`).
- Use `instanceof Error` to access `.message`.
- Status codes: 400 = validation, 401 = auth, 403 = authz, 404 = not found / disabled module, 409 = conflict (e.g., already-finalized), 500 = unhandled.
- Do not leak stack traces. The `message` is shown to the user.

## HTTP method conventions

| Method | When | Status on success |
|---|---|---|
| `GET` | Read-only list / single item | 200 |
| `POST` | Create a new resource | 201 |
| `PATCH` | Partial update | 200 |
| `PUT` | Full replace (rare; usually use PATCH) | 200 |
| `DELETE` | Soft or hard delete | 200 |

Don't use `POST` for non-create operations unless you have a specific reason (e.g., "submit review" actions). When you do, comment why.

## Pagination

Use the shared utility:

```ts
import { parsePaginationParams, paginationToSkipTake, buildPaginationResponse } from "@quikit/shared";

export const GET = withOrgAuth(async ({ orgId }, req: NextRequest) => {
  const params = parsePaginationParams(req.nextUrl.searchParams);
  const [items, total] = await Promise.all([
    db.widget.findMany({
      where: { orgId },
      select: { id: true, name: true },
      ...paginationToSkipTake(params),
    }),
    db.widget.count({ where: { orgId } }),
  ]);
  return NextResponse.json({ success: true, data: buildPaginationResponse(items, total, params) });
});
```

Don't hand-roll skip/take. Don't omit pagination on list endpoints — defaults are page 1, limit 20 (max 100).

## Audit logging

Mutating operations (create/update/delete) write an audit log entry:

```ts
import { writeAuditLog } from "@/lib/api/auditLog";

await writeAuditLog({
  orgId, actorId: userId,
  action: "CREATE",                   // CREATE | UPDATE | DELETE
  entityType: "Widget",
  entityId: widget.id,
  changes: ["name", "description"],   // changed fields, not values (no PII)
  reason: "User created widget via /api/widgets",
});
```

Never include personal data in `changes` or `reason`. The log is a who/what/when, not a copy of the data.

## Rate limiting (when needed)

For routes that accept untrusted input or expensive operations:

```ts
import { rateLimitAsync } from "@quikit/shared/rateLimit";

const ok = await rateLimitAsync({
  key: `create-widget:${orgId}:${userId}`,
  windowMs: 60_000,
  max: 10,
});
if (!ok) {
  return NextResponse.json({ success: false, error: "Too many requests" }, { status: 429 });
}
```

Note: `rateLimitAsync` is on the `@quikit/shared/rateLimit` subpath, not the barrel — it needs server-only deps.

## Common mistakes (rejection-bait)

- ❌ `db.widget.findMany({ where: { id } })` — missing `orgId` filter.
- ❌ `const data = await req.json(); db.widget.create({ data })` — no Zod validation.
- ❌ `catch (e: any)` — banned by ESLint.
- ❌ Returning a raw array or undefined — must wrap in `{ success, data }`.
- ❌ `as any` cast — banned. Use `as unknown as <Type>` with an explanation comment if absolutely required.
- ❌ Routes that don't write audit logs for mutations.
- ❌ Bespoke pagination shape (must use shared util).

## See also

- `apps/<your-app>/app/api/example/route.ts` — copy when adding routes.
- `docs/exemplars/api-route.example.ts` — annotated reference.
- `docs/04-db-patterns.md` — Prisma rules + tenant isolation.
- `docs/07-testing.md` — required tests for new routes.
