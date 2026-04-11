# QuikIT Development Standards

## Prisma Query Standard

- Use `select` for API endpoints that return lists (reduces payload size)
- Use `include` only when you need the full related model for business logic
- Always filter by `tenantId` on every query (except super-admin cross-tenant operations)
- Use the shared pagination utility from `@quikit/shared/pagination` for list endpoints

```typescript
// GOOD: List endpoint with select
const items = await db.kpi.findMany({
  where: { tenantId },
  select: { id: true, name: true, owner: { select: { id: true, firstName: true } } },
  ...paginationToSkipTake(params),
});

// GOOD: Detail endpoint with include (need full model)
const item = await db.kpi.findUnique({
  where: { id, tenantId },
  include: { owner: true, weeklyValues: true },
});
```

## API Route Pattern

All API routes must follow this structure:

```typescript
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function GET() {
  try {
    // 1. Auth guard (getTenantId, requireAdmin, or requireSuperAdmin)
    // 2. Input validation (Zod schemas)
    // 3. Database query with tenantId filter
    // 4. Return { success: true, data }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Operation failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
```

- Always use `catch (error: unknown)` — never `catch (e: any)`
- Always use `NextRequest` type for request parameters, not `Request`
- POST returns 201 on creation, all others return 200
- Error responses always include `{ success: false, error: string }`

## File Naming Conventions

- Directories: `lowercase` (e.g., `components/dashboard/`, not `Dashboard/`)
- Component files: `lowercase.tsx` (e.g., `sidebar.tsx`, not `Sidebar.tsx`)
- Exports: PascalCase for components (e.g., `export function Sidebar`)
- Route files: `page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`

## Shared Package Imports

- UI components: Import from `@quikit/ui` — NEVER create local copies
- Constants (ROLES, ROLE_HIERARCHY, etc.): Import from `@quikit/shared`
- Auth guards: Import factories from `@quikit/auth/*`, wrap in thin `lib/api/` files
- Database: Import `db` from `@quikit/database` or local `@/lib/db` re-export

## Provider Order (all apps)

```
SessionProvider → QueryClientProvider → ThemeProvider
```

## Middleware

All apps must use `createMiddleware()` from `@quikit/auth/middleware` — no custom middleware logic.

## Login Routes

All apps use `/login` as the login route (not `/auth/login`).

## CSS/Theming

- All apps import `@quikit/ui/styles` in their `globals.css`
- App-specific styles go after the import
- Tailwind configs extend from `@quikit/ui/tailwind-config`
- Use CSS variables (e.g., `bg-[var(--color-bg-secondary)]`) — never hardcode colors like `bg-gray-50`

## Accent Color System (Theming)

Use `accent-*` Tailwind classes for interactive/branded elements. These are mapped to CSS variables set by `ThemeApplier` based on the user's chosen accent color.

**Use `accent-*` for (themeable):**
- Buttons: `bg-accent-600 hover:bg-accent-700 text-white`
- Sidebar background: `bg-accent-800`
- Sidebar active items: `bg-white/15 text-white`
- Header avatar: `bg-accent-600`
- Table headers: `bg-accent-50 text-accent-700`
- Focus rings: `ring-accent-400`
- Active tabs/badges: `bg-accent-100 text-accent-700`

**Use hardcoded Tailwind colors for (semantic — NOT themeable):**
- KPI status cells: `bg-green-500`, `bg-red-500`, `bg-blue-500` (these represent data states)
- Quarter badges: `bg-blue-50`, `bg-purple-50`, `bg-amber-50` (fixed per Q1/Q2/Q3/Q4)
- Warning/error/success alerts: `bg-amber-50`, `bg-red-50`, `bg-green-50`
- Chart colors: fixed palette

**To enable theming in a new app:**
1. Add `<ThemeApplier />` to the dashboard layout: `import { ThemeApplier } from "@quikit/ui/theme-applier"`
2. Create `/api/settings/company` GET endpoint that returns `{ accentColor }`
3. Use `accent-*` classes instead of `bg-blue-*` for buttons/sidebar/headers

## Testing Standards

The repo uses **Vitest** for unit/component/API tests and **Playwright** for E2E. All tests live under `__tests__/` in each workspace — never under `tests/` (that directory is reserved for legacy Python artifacts in quikscale).

### When a test is required

- **Every bug fix** ships with a regression test that fails before the fix and passes after. No exceptions.
- **Every new API route** has at minimum: an unauthenticated → 401 test, a tenant-isolation test (cross-tenant request is rejected), and a happy-path test.
- **Every new shared utility** in `lib/utils/` or `@quikit/shared` reaches ≥90% line coverage in its own test file.
- **Every new permission helper** (`canXxx()` functions in `lib/api/`) has admin/team-head/self/other matrix coverage.

### Test file conventions

| Suffix / path | Environment | Purpose |
|---|---|---|
| `__tests__/unit/*.test.ts` | node | Pure functions, no mocks |
| `__tests__/permissions/*.test.ts` | node + `vitest-mock-extended` | DB-touching permission logic |
| `__tests__/api/*.test.ts` | node + mocked Prisma + mocked session | Route handlers imported directly |
| `__tests__/components/*.dom.test.tsx` | jsdom (via `// @vitest-environment jsdom` directive) | React components |
| `__tests__/e2e/*.spec.ts` | Playwright only (excluded from Vitest) | Full-stack flows |

### Mocking rules

- **Prisma**: mock via `__tests__/helpers/mockDb.ts` which `vi.mock`'s both `@quikit/database` and `@/lib/db`. Preserve `@prisma/client` enum re-exports via `vi.importActual`.
- **Sessions**: `setSession(user)` from `__tests__/setup.ts` — it hooks `getServerSession` from both `next-auth` and `next-auth/next` once for the whole file.
- **Factory auth helpers** (`createGetTenantId`, `createRequireAdmin`): instantiate the factory in the test file with a stub `authOptions`; the mocked `getServerSession` takes care of the rest.
- **Never** mock the module under test. Never mock individual route handlers — import them and call them with a constructed `NextRequest`.

### Running tests

```bash
npm run test           # All workspaces via turbo (cached)
npm run typecheck      # Parallel tsc --noEmit across all workspaces
npm run lint           # Turbo lint
npm run e2e            # Playwright (requires e2e:install + db:seed:e2e first)
npm run e2e:install    # One-time: install Chromium + deps
npm run db:seed:e2e    # Reset the E2E tenant
```

Single-file / watch mode:
```bash
cd apps/quikscale && npm run test:watch       # Vitest UI watcher
cd apps/quikscale && npm run test:ui          # Vitest web UI
```

### Coverage ratchet

`scripts/coverage-ratchet.mjs` compares a fresh `coverage/coverage-summary.json` to the committed `coverage-baseline.json`. CI fails if any of lines/statements/functions/branches drops > 0.25 percentage points.

To intentionally update the baseline after adding tests:
```bash
npm run test -- --coverage
node scripts/coverage-ratchet.mjs apps/quikscale/coverage/coverage-summary.json --update
git add coverage-baseline.json && git commit -m "chore: ratchet coverage baseline"
```

### Before large refactors

Before starting a large refactor (e.g., the OPSP 2225-line decomposition in `.claude/code-analysis.md` §6.2), overall line coverage on the affected modules must reach ≥50%. The harness is your safety net — invest in tests *before* touching the code you're afraid to move.
