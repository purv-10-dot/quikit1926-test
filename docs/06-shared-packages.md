# Shared Packages

What lives in `packages/`, what to import from where, and why you can't modify them.

## Why shared packages

Common code lives in `@quikit/*` so:
- Every app stays consistent.
- Bug fixes propagate everywhere on one PR.
- The integration team can refactor centrally without 10 contractors changing their copies.

You **import** from these packages. You **don't modify** them. If something's missing, file a request in your PR description.

## Package map

| Package | Import root | What's in it |
|---|---|---|
| `@quikit/auth` | `@quikit/auth` | NextAuth options factories, middleware factory, guard factories, session store, feature gates, JWT verify |
| `@quikit/database` | `@quikit/database` | Prisma client singleton (soft-delete middleware) + re-exported `@prisma/client` types |
| `@quikit/redis` | `@quikit/redis` | ioredis singleton + best-effort `cacheGet/Set/Del` (fail-open) |
| `@quikit/ui` | `@quikit/ui` | React components (~50), Tailwind theme, design tokens |
| `@quikit/shared` | `@quikit/shared` | Constants (ROLES, MEMBERSHIP_ROLES, statuses), pagination, email, module registry, rate limiting |

Each package has its own `package.json`. None publish to npm — they resolve via the npm workspaces in the monorepo root.

## `@quikit/auth`

Subpath imports: prefer specific subpaths over the barrel for tree-shaking. **The guards are factories** — you call them once with your app's `authOptions`, then reuse the returned function.

```ts
import { createAuthOptions, createOAuthClientOptions } from "@quikit/auth"; // NextAuth options factories
import { createMiddleware } from "@quikit/auth/middleware";                  // middleware factory
import { createRequireAdmin } from "@quikit/auth/require-admin";             // → requireAdmin()
import { createRequireSuperAdmin } from "@quikit/auth/require-super-admin";  // → requireSuperAdmin() (cross-org, rare)
import { createGetOrgId } from "@quikit/auth/get-tenant-id";                 // → getOrgId(userId) (subpath still named get-tenant-id)
import { gateModuleApi, gateModuleRoute } from "@quikit/auth/feature-gate";  // module entitlement
import { getOrSet, invalidate } from "@quikit/auth/cache";                   // layered LRU+Redis cache
import type { Session, JWT } from "@quikit/auth/types";                      // session type augmentation
```

There is **no** `@quikit/auth/withTenantAuth` export. Each app builds its own thin `lib/api/withOrgAuth.ts` that instantiates these factories and composes the 401/403/500 boilerplate + module/permission gates (see `docs/03-api-patterns.md`).

When to use what:
- **API routes**: wrap with your app's `withOrgAuth` (built on these factories) — covers 99% of cases.
- **Server Components**: use `getServerSession(authOptions)` from `next-auth`, then check fields manually if needed.
- **Middleware**: import `createMiddleware` and configure once in `apps/<your-app>/middleware.ts`.

Session shape is augmented globally in `packages/auth/types.ts`:
```ts
session.user.id             // string
session.user.email          // string
session.user.firstName      // string | undefined
session.user.lastName       // string | undefined
session.user.orgId          // string | undefined — the active org
session.user.membershipRole // "super_admin" | "org_admin" | "app_admin" | "member" (+ legacy "admin"/"executive"/…)
session.user.isSuperAdmin   // boolean — platform-wide flag
session.user.membershipInvalid // boolean — set when the active membership went inactive
```

The JWT additionally carries `sessionId` (Redis soft-revocation handle), `impersonating`/`impersonator*` claims, and an `actingAs` principal (`user | ai_agent | platform_service | scheduled_job`).

## `@quikit/database`

```ts
import { db } from "@quikit/database";                     // Prisma client singleton
import type { Org, User, OrgMember } from "@prisma/client"; // types from generated client
```

The `db` import is the singleton Prisma client used everywhere. It is extended with **soft-delete middleware** for a set of models (`KPI`, `Team`, `Priority`, `WWWItem`, `Meeting`) — reads auto-exclude `deletedAt != null` rows unless you filter on `deletedAt` explicitly. **Re-export it from your app's `lib/db.ts`** so tests can swap it via mock:

```ts
// apps/<your-app>/lib/db.ts
export { db } from "@quikit/database";
```

Then everywhere else in your app:
```ts
import { db } from "@/lib/db";
```

This indirection lets the `mockDb` test helper (see `docs/07-testing.md`) replace the client cleanly.

### Prisma model imports

Generated types come from `@prisma/client`, not `@quikit/database`:

```ts
import type { Org, KPI, OPSPData } from "@prisma/client";
```

The `db.<model>` runtime is on `db`, but the types live in `@prisma/client`. (`@quikit/database` re-exports everything from `@prisma/client`, so importing from either works — prefer `@prisma/client` for types.)

## `@quikit/redis`

Thin wrapper around a lazily-connected `ioredis` singleton. **Fail-open by design** — if `REDIS_URL` is unset or Redis is down, the helpers no-op rather than throw, so the app keeps working (with per-process fallback state).

```ts
import { getRedis, cacheGet, cacheSet, cacheDel, isRedisAvailable } from "@quikit/redis";

await cacheSet("key", "value", 60);         // TTL seconds; best-effort
const v = await cacheGet("key");            // string | null
```

`getRedis()` returns `null` when Redis is unavailable; `requireRedis()` throws (use only on paths that genuinely require Redis, e.g. the quikcrm BullMQ worker). Higher-level caching (`getOrSet`, layered LRU+Redis) lives in `@quikit/auth/cache`; a Redis-only cache-aside helper (`cacheOrCompute`) lives in `@quikit/shared/redisCache`. See `docs/cache-management.md`.

## `@quikit/ui`

The biggest package. Forty-plus components + the Tailwind config + theme tokens.

```ts
import {
  // Form primitives
  Button, Input, Textarea, Select, Checkbox, NumberInput, DateInput, Field, FormRow,
  // Display
  Card, Badge, Avatar, Tooltip, Skeleton, EmptyState,
  // Layout
  Tabs, SlidePanel, Modal, ModalContent, ModalHeader, ModalTitle, ModalBody, ModalFooter,
  // Data
  DataTable, Pagination,
  // Pickers
  UserPicker, UserMultiPicker, FilterPicker, TenantPicker,
  // Branding / theming
  ThemeApplier, applyAccentColor, AppSwitcher,
  // Toolbar / actions
  AddButton, MoreMenu, ColMenu, HiddenColsPill,
  // Auth flows
  SignInComponent, UserMenu,
  // Utilities
  cn, formatDate, formatRelativeDate, generateInitials, slugify, isValidEmail, truncateText,
} from "@quikit/ui";
```

### Subpath imports

```ts
import "@quikit/ui/styles";                  // global CSS — included in your app's globals.css
import baseConfig from "@quikit/ui/tailwind-config"; // Tailwind base config — extend in your tailwind.config.ts
```

Always include `@import "@quikit/ui/styles";` at the top of your `app/globals.css` to get the theme tokens.

## `@quikit/shared`

Constants + utilities + types. **Server-safe in the barrel; some submodules are server-only.**

```ts
// Safe to import from client OR server:
import { ROLES, MEMBERSHIP_ROLES, ROLE_HIERARCHY, ADMIN_TIER_ROLES } from "@quikit/shared";
import { MEMBERSHIP_STATUS, type MembershipStatus } from "@quikit/shared";
import { KPI_STATUS, KPI_HEALTH_STATUS, PRIORITY_STATUS, WWW_STATUS } from "@quikit/shared";
import { TENANT_PLANS, SUBSCRIPTION_STATUS, TRIAL_DURATION_DAYS } from "@quikit/shared";
import { parsePaginationParams, paginationToSkipTake, buildPaginationResponse } from "@quikit/shared";
import { MODULE_REGISTRY, isModuleEnabled, getAppConfig, visibleModules } from "@quikit/shared";

// SERVER-ONLY (don't import from client components):
import { rateLimitAsync } from "@quikit/shared/rateLimit";   // pulls ioredis
import { sendInvitationEmail } from "@quikit/shared";         // pulls email libs (Resend / nodemailer)
```

`MEMBERSHIP_ROLES` = `super_admin | org_admin | app_admin | member` (the v4 org-membership roles); `ROLES` also carries the legacy `admin | executive | manager | employee | coach` values still present in `ROLE_HIERARCHY` for backward compatibility.

The `rateLimit` subpath is intentionally NOT in the barrel — importing it from a client component breaks webpack with "can't resolve dns/net/tls". Use the subpath when needed and only on the server.

### Roles + permissions

`ROLES` constants + `ROLE_HIERARCHY` ranking are shared across all apps. Don't redefine.

```ts
import { ROLES, ROLE_HIERARCHY } from "@quikit/shared";

// Allow role X if X >= manager
const minRank = ROLE_HIERARCHY[ROLES.MANAGER];
const userRank = ROLE_HIERARCHY[session.user.membershipRole];
if (userRank < minRank) return forbidden();
```

## Why you can't modify `packages/`

- The integration owner reviews every cross-package change.
- 10 contractors editing the same shared package = guaranteed merge conflicts and broken builds.
- A bug in `@quikit/ui` affects every app — needs strict review.

What if you really need a feature in a shared package?

1. Build a local copy in `apps/<your-app>/components/` with a `// TODO(integration): upstream to @quikit/ui` comment.
2. Mention it in your PR description: "I built `XSelect` locally; recommend upstreaming to `@quikit/ui`."
3. Integration owner decides: upstream now, upstream later, or stay local.

Don't propose direct edits to `packages/` from your repo. Your access doesn't allow it; the PR will be closed.

## Common rejections

- ❌ Modified a file under `packages/`.
- ❌ Imported `rateLimitAsync` from `@quikit/shared` (the barrel) instead of `@quikit/shared/rateLimit`.
- ❌ Imported `db` directly from `@quikit/database` everywhere instead of through `@/lib/db`.
- ❌ Re-implemented something already in `@quikit/ui` (e.g., custom modal).
- ❌ Defined a new role / status string that should be in `@quikit/shared`.

## See also

- `docs/04-db-patterns.md` — Prisma + tenant isolation.
- `docs/05-frontend-patterns.md` — using `@quikit/ui` components.
- `packages/ui/index.ts` — full export list.
- `packages/shared/index.ts` — full export list.
- `packages/auth/package.json` — full export list with subpaths.
