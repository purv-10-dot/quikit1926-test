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
| `@quikit/auth` | `@quikit/auth` | NextAuth options factory, middleware factory, session guards, role checks |
| `@quikit/database` | `@quikit/database` | Prisma client + types + RLS helpers |
| `@quikit/ui` | `@quikit/ui` | React components, Tailwind theme, design tokens |
| `@quikit/shared` | `@quikit/shared` | Constants (ROLES, MEMBERSHIP_STATUS), pagination, email, module registry |

Each package has its own `package.json`. None publish to npm — they resolve via the npm workspaces in the monorepo root.

## `@quikit/auth`

Subpath imports: prefer specific subpaths over the barrel for tree-shaking.

```ts
import { createAuthOptions } from "@quikit/auth";                       // auth options factory
import { createMiddleware } from "@quikit/auth/middleware";              // middleware factory
import { withTenantAuthForModule } from "@quikit/auth/withTenantAuth";   // route wrapper
import { requireAdmin } from "@quikit/auth/require-admin";               // admin-only routes
import { requireSuperAdmin } from "@quikit/auth/require-super-admin";    // cross-tenant (rare)
import { getTenantId } from "@quikit/auth/get-tenant-id";                // direct session read
import { gateModuleApi } from "@quikit/auth/feature-gate";               // module entitlement
import type { Session, JWT } from "@quikit/auth/types";                  // session type augmentation
```

When to use what:
- **API routes**: wrap with `withTenantAuth` (or `requireAdmin`) — covers 99% of cases.
- **Server Components**: use `getServerSession()` from `next-auth/next`, then check fields manually if needed.
- **Middleware**: import `createMiddleware` and configure once in `apps/<your-app>/middleware.ts`.

Session shape is augmented globally in `packages/auth/types.ts`:
```ts
session.user.id            // string
session.user.email         // string | null
session.user.name          // string | null
session.user.tenantId      // string — current tenant
session.user.membershipRole // "admin" | "executive" | "manager" | "employee" | "coach"
session.user.isSuperAdmin  // boolean — admin app only
```

## `@quikit/database`

```ts
import { db } from "@quikit/database";                // Prisma client
import type { Tenant, User, Membership } from "@prisma/client";  // types from generated client
```

The `db` import is the singleton Prisma client used everywhere. **Re-export it from your app's `lib/db.ts`** so tests can swap it via mock:

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
import type { Tenant, KPI, OPSPData } from "@prisma/client";
```

The `db.<model>` runtime is on `db`, but the types live in `@prisma/client`.

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
import { ROLES, ROLE_HIERARCHY, ROLE_LABELS, type Role } from "@quikit/shared";
import { MEMBERSHIP_STATUS, type MembershipStatus } from "@quikit/shared";
import { KPI_STATUS, KPI_HEALTH_STATUS, PRIORITY_STATUS } from "@quikit/shared";
import { parsePaginationParams, paginationToSkipTake, buildPaginationResponse } from "@quikit/shared";
import { MODULE_REGISTRY, ancestorsOf, isModuleEnabled, visibleModules } from "@quikit/shared";

// SERVER-ONLY (don't import from client components):
import { rateLimitAsync } from "@quikit/shared/rateLimit";   // pulls ioredis
import { sendInvitationEmail } from "@quikit/shared";         // pulls SMTP libs
```

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
