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
- Focus rings (outside the 4 locked tables below): `ring-accent-400`
- Active tabs/badges (sidebar, settings, etc.): `bg-accent-100 text-accent-700`
- `AddButton` shared component (top-of-page Add/New buttons across modules)
- Table header backgrounds: `bg-accent-50` on all `<th>` elements across all tables

**Use hardcoded Tailwind colors for (semantic — NOT themeable):**
- KPI status cells: `bg-green-500`, `bg-red-500`, `bg-blue-500` (these represent data states)
- Quarter badges: `bg-blue-50`, `bg-purple-50`, `bg-amber-50` (fixed per Q1/Q2/Q3/Q4)
- Warning/error/success alerts: `bg-amber-50`, `bg-red-50`, `bg-green-50`
- Chart colors: fixed palette

### 🔒 LOCKED TABLES — Do NOT theme cells (critical, permanent rule)

The following four tables have **locked cell styling**. All `<td>` cells, row IDs, checkboxes, log icons, row hover, status badges, progress bars, action links, focus rings, and weekly-value cells use **fixed `blue-*` / `gray-*` / semantic colors** and must **never** be migrated to `accent-*`.

**Exception — `<th>` header backgrounds**: Table header backgrounds (`<th>`) use `bg-accent-50` across ALL tables (including these 4) for consistent branded theming. This is the ONLY accent class allowed in these files.

1. **Individual KPI table** — `apps/quikscale/app/(dashboard)/kpi/components/KPITable.tsx`
2. **Team KPI table** — `apps/quikscale/app/(dashboard)/kpi/teams/components/TeamSection.tsx` + shared `KPITable.tsx`
3. **Priority table** — `apps/quikscale/app/(dashboard)/priority/components/PriorityTable.tsx`
4. **WWW table** — `apps/quikscale/app/(dashboard)/www/components/WWWTable.tsx`

**Why locked:**
- KPI weekly-value cells form a semantic traffic-light system (Blue=Exceeded, Green=Achieved, Yellow=Near, Red=Below). Theming would break that visual language.
- "Completed" status (Priority + WWW) is intentionally blue so all 4 tables share the same `bg-blue-500` completed state across tenants.
- Table IDs (#) are `text-gray-900 hover:underline` — they must stay black so tenants with purple/teal/orange themes still have a neutral readable row ID column.
- Row hover (`hover:bg-blue-50`) and log-icon hover (`hover:text-blue-500`) are part of the table chrome, not brandable UI.

**Color palette used in these 4 tables (reference):**

| Surface | Class |
|---|---|
| Row ID button | `text-gray-900 hover:underline` |
| Checkbox | `text-blue-600 border-gray-300` |
| Log-icon hover | `text-gray-400 hover:text-blue-500 hover:bg-gray-100` |
| Row hover | `hover:bg-blue-50` (or `hover:bg-blue-50/30` for KPI) |
| Column-resize handle | `hover:bg-blue-400/50` |
| Freeze-boundary icon | `text-blue-400` |
| Comment input focus ring | `focus:ring-blue-400` |
| Priority/WWW status — completed | `bg-blue-500 text-white` |
| Priority/WWW status — on-track | `bg-green-500 text-white` |
| Priority/WWW status — behind-schedule | `bg-amber-400 text-white` |
| Priority/WWW status — not-yet-started | `bg-red-500 text-white` |
| Priority/WWW status — not-applicable | `bg-gray-400 text-white` |
| KPI weekly — exceeded (`pct ≥ 120`) | `bg-blue-600 text-white` |
| KPI weekly — achieved (`pct ≥ 100`) | `bg-green-600 text-white` |
| KPI weekly — near (`pct ≥ 80`) | `bg-yellow-500 text-white` |
| KPI weekly — below (`pct < 80` + updated) | `bg-red-600 text-white` |
| KPI weekly — neutral (not entered) | `text-gray-300` |

**Before any future bulk CSS refactor** (tailwind class sweeps, blue→accent migrations, theme changes): add an explicit path exclusion for these 4 files AND for `apps/quikscale/lib/utils/colorLogic.ts` and `apps/quikscale/lib/utils/kpiHelpers.ts` (which compute the KPI traffic-light semantics).

### Theming the rest of the app

**To enable theming in a new app:**
1. Add `<ThemeApplier />` to the dashboard layout: `import { ThemeApplier } from "@quikit/ui/theme-applier"`
2. Create `/api/settings/company` GET endpoint that returns `{ accentColor }`
3. Use `accent-*` classes instead of `bg-blue-*` for buttons/sidebar/headers (outside the 4 locked tables above)

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
