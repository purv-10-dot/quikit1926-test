# Backend API Coding Standards

Scope: every `app/api/**/route.ts` handler in this project.

The goal is a single canonical shape — auth, validation, business logic, response — so that every handler looks the same and the cross-cutting concerns (tenant scoping, error envelope, logging) are impossible to forget.

All the helpers referenced below already exist in `src/lib/*`. The work is *adoption*, not new infrastructure.

---

## Baseline findings from existing routes

Sampled: `finance/vendor-payments`, `estimations`, `approvals/[id]/[action]`.

| Concern | Current state |
|---|---|
| Auth / tenant | Inconsistent. `estimations` calls `getTenantContext()`; `finance/vendor-payments` and `approvals/[id]/[action]` skip auth entirely. |
| Permission check | Missing everywhere in the sample. `requirePermission()` helper exists but is unused. |
| Response envelope | Raw `NextResponse.json(...)`. `ok()` / `err()` / `created()` helpers in `src/lib/http/envelope.ts` exist but are unused in sampled routes. |
| Error handling | No `try/catch` in any sampled route. `toHttpResponse(err)` helper exists but is unused. |
| Input validation | Ad-hoc `if (!body.x)` or nothing at all. `src/lib/validators.ts` has field validators that aren't applied. |
| Query param parsing | Inline `new URL(req.url).searchParams` repeated in every handler. |
| Audit / approver identity | Hardcoded `"Demo Admin (Super Admin)"` in approvals — should come from context. |
| Request ID / logging | No structured logging. Envelope auto-includes `requestId` but only if the helper is used. |

The helpers are in place; the routes just don't call them.

---

## The standard handler shape

```ts
import type { NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth/context";
import { ok, created } from "@/lib/http/envelope";
import { toHttpResponse, DomainError } from "@/lib/http/errors";

export async function GET(req: NextRequest) {
  try {
    const ctx = await requirePermission("finance.view");
    if (ctx instanceof Response) return ctx;      // 401 / 403 short-circuit

    const query = parseQuery(req);                // typed, validated params
    const data = await listVendorPayments(ctx, query);

    return ok({ data, total: data.length });
  } catch (err) {
    return toHttpResponse(err);                   // DomainError → envelope
  }
}
```

Five rules, every handler, no exceptions:

1. **Auth first.** Call `requireAuth()` / `requirePermission()` / `requireAnyPermission()` before touching any data. Short-circuit on `instanceof NextResponse`.
2. **Validate input.** Parse query and body through a typed parser that throws `DomainError("VALIDATION_ERROR", ..., 422)` on bad input. Never trust the shape.
3. **Scope by tenant.** Use `tenantWhere(ctx, …)` / `tenantCreate(ctx, …)` for every Prisma call. Also respect `ctx.projectIds` when listing project-scoped data (see `estimations/route.ts` for the pattern).
4. **Return through the envelope.** `ok(data)`, `created(data)`, `noContent()`. Never call `NextResponse.json` directly from a handler.
5. **Catch once, map once.** Wrap the body in `try { ... } catch (err) { return toHttpResponse(err); }`. All domain errors throw `DomainError(code, message, status, { details })`.

---

## What a handler should *not* contain

- **Business logic.** Extract into a service in `src/lib/<domain>/`. Handler = transport glue.
- **Manual tenant filters.** Use `tenantWhere`. Inline `{ tenantId: ctx.tenantId }` is fine for reads; never inline for writes.
- **Try/catch around individual Prisma calls.** One outer try/catch. Let `DomainError` describe the failure, let `toHttpResponse` map it.
- **Hardcoded user identity.** `ctx.userId` / `ctx.userName` for audit fields, never string literals.
- **Parallel arrays / in-memory mutation.** The demo-store pattern is legacy — new routes should hit Prisma through a service module.

---

## Error codes

Every thrown `DomainError` uses a **stable machine-readable code**:

| Code | When | Status |
|---|---|---|
| `VALIDATION_ERROR` | Input failed shape/field validation | 422 |
| `UNAUTHORIZED` | No session (handled by `requireAuth`) | 401 |
| `FORBIDDEN` | Missing permission (handled by `requirePermission`) | 403 |
| `NOT_FOUND` | Resource doesn't exist in this tenant | 404 |
| `CONFLICT` | Unique-constraint violation, optimistic-lock failure | 409 |
| `STATE_INVALID` | Entity in wrong status for this action (e.g. "can't pay a draft invoice") | 409 |
| `EXCEEDS_LIMIT` | Business cap hit (e.g. RA exceeds BOQ) | 422 |

Module-specific subclasses of `DomainError` (e.g. `FinanceError`, `PurchaseError`) live in `src/lib/<domain>/errors.ts` and use codes prefixed with the module name (`FINANCE_INVALID_TDS_RATE`).

---

## Request ID & logging

Already free. `ok()` / `err()` read `x-request-id` from the incoming request and echo it in every envelope. `toHttpResponse` logs domain errors at `warn`, unknowns at `error` (+ Sentry).

Do not add per-handler logging. If you need to log a business event (e.g. "payment approved"), do it in the service, not the handler.

---

## Testing contract

Every route must be reachable with:

```
x-test-role: <role_key>   // impersonate a role in tests
x-test-tenant: <id>       // override tenant
x-test-user: <id>         // override user
```

(See `buildTestOverrideContext` in `src/lib/auth/context.ts`.) Dev-only — gated by `AUTH_DEMO_MODE` + `NODE_ENV !== "production"`.

---

## Rollout plan

1. Land the template (`finance/vendor-payments/route.ts`) + service module + this doc.
2. Pilot one module (e.g. `finance`) — all four routes under `app/api/finance/**`.
3. Review. Lock the pattern.
4. Roll across modules — one PR per module. Don't mix module migrations; keeps diffs reviewable.

Expected per-route delta: ~20–40 lines of handler boilerplate collapsed into 5 lines of standard shape + a service function that holds the actual logic.
