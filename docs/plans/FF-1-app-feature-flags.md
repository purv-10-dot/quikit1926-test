---
id: FF-1
title: App Feature Flags (per-tenant module gating, L3 enforcement)
wave: features
priority: P1
status: In Progress
owner: unassigned
created: 2026-04-17
updated: 2026-04-17
targets: [quikit, quikscale, admin, packages/shared, packages/auth, packages/ui, packages/database]
depends_on: []
---

# FF-1 — App Feature Flags (per-tenant, L3)

> **TL;DR** — Super admin toggles modules (e.g., KPI, Teams KPI, OPSP) on/off per tenant per app. Disabled modules disappear from the sidebar, their routes redirect to `/dashboard`, and their API endpoints return 404. Sparse storage (only disabled rows exist); default = enabled. Module tree is a typed TypeScript registry in `@quikit/shared`, used by both the super admin UI and the apps themselves.

---

## 1. Decisions locked

| # | Decision | Chosen |
|---|---|---|
| 1 | Scope | **Per-tenant** (each tenant can have different modules enabled) |
| 2 | Enforcement depth | **L3** — sidebar + route layout + API handler all gate |
| 3 | Module source of truth | **Central TS registry** in `packages/shared/lib/moduleRegistry.ts` |
| 4 | Default state | **Enabled** (new modules & new tenants get everything) |
| 5 | Query pattern | **Per-request, React.cache dedup** (one DB query per page load, shared across sub-layouts via React cache) |
| 6 | Mid-session behavior | **Let user finish; next navigation enforces** |
| 7 | Cascade rule | **A module renders ONLY IF it and all ancestors are enabled** (independent flags, cascade at check time) |
| 8 | Relationship to `UserAppAccess` | **Separate layer.** UserAppAccess = "is this app visible to this user?" FeatureFlag = "within this app, what's visible to this tenant?" |
| 9 | UI flow | App-first (as requested): `super/feature-flags` → pick app → tenant dropdown at top, module tree below |
| 10 | Audit | Every toggle writes an `AuditLog` row (reuse existing table) |

---

## 2. Data model

### 2.1 Schema

```prisma
model FeatureFlag {
  id         String   @id @default(cuid())
  tenantId   String
  appId      String
  moduleKey  String                        // "kpi" | "kpi.teams" | "opsp.review"
  enabled    Boolean  @default(false)      // we only store disabled rows; kept for future flexibility
  updatedBy  String?                        // super admin userId
  updatedAt  DateTime @updatedAt
  createdAt  DateTime @default(now())

  tenant     Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  app        App    @relation(fields: [appId], references: [id], onDelete: Cascade)

  @@unique([tenantId, appId, moduleKey])
  @@index([tenantId, appId])
}
```

**Relations to add:**
- `Tenant`: add `featureFlags FeatureFlag[]`
- `App`: add `featureFlags FeatureFlag[]`

### 2.2 Sparse-storage semantics

- **No row for `(tenantId, appId, moduleKey)`** = module is enabled (default).
- **Row with `enabled: false`** = module is disabled for this tenant in this app.
- Toggling from enabled → disabled: `upsert` row with `enabled: false`.
- Toggling from disabled → enabled: `delete` row.

### 2.3 Migration

One Prisma migration, plain `CREATE TABLE` + `CREATE INDEX` (no CONCURRENTLY, per the P1-3 learning).

---

## 3. Module registry

**File:** `packages/shared/lib/moduleRegistry.ts`

```ts
export interface ModuleDef {
  key: string;               // stable identifier used in DB and gates
  label: string;
  icon?: string;              // Lucide icon name (component resolved at render)
  href?: string;              // route; parent-only modules may omit
  parentKey?: string;         // sub-module relationship
}

export interface AppModuleConfig {
  appSlug: string;
  modules: ModuleDef[];
}

export const MODULE_REGISTRY: AppModuleConfig[] = [
  {
    appSlug: "quikscale",
    modules: [
      { key: "dashboard", label: "Dashboard", icon: "LayoutDashboard", href: "/dashboard" },
      { key: "kpi", label: "KPI", icon: "Target" },
      { key: "kpi.individual", label: "Individual KPI", icon: "User", href: "/kpi", parentKey: "kpi" },
      { key: "kpi.teams", label: "Teams KPI", icon: "Users", href: "/kpi/teams", parentKey: "kpi" },
      { key: "priority", label: "Priority", icon: "CheckSquare", href: "/priority" },
      { key: "orgSetup", label: "Org Setup", icon: "Building2" },
      { key: "orgSetup.teams", label: "Teams", icon: "Users", href: "/org-setup/teams", parentKey: "orgSetup" },
      { key: "orgSetup.users", label: "Users", icon: "User", href: "/org-setup/users", parentKey: "orgSetup" },
      { key: "orgSetup.quarters", label: "Quarter Settings", icon: "CalendarDays", href: "/org-setup/quarters", parentKey: "orgSetup" },
      { key: "www", label: "WWW", icon: "Activity", href: "/www" },
      { key: "meetings", label: "Meeting Rhythm", icon: "Calendar" },
      { key: "meetings.dashboard", label: "Dashboard", icon: "LayoutDashboard", href: "/meetings", parentKey: "meetings" },
      { key: "meetings.dailyHuddle", label: "Daily Huddle", icon: "Clock", href: "/meetings/daily-huddle", parentKey: "meetings" },
      { key: "meetings.weekly", label: "Weekly Meeting", icon: "CalendarDays", href: "/meetings/weekly", parentKey: "meetings" },
      { key: "meetings.monthly", label: "Monthly Meeting", icon: "CalendarDays", href: "/meetings/monthly", parentKey: "meetings" },
      { key: "meetings.quarterly", label: "Quarterly Offsite", icon: "CalendarDays", href: "/meetings/quarterly", parentKey: "meetings" },
      { key: "meetings.annual", label: "Annual Planning", icon: "CalendarDays", href: "/meetings/annual", parentKey: "meetings" },
      { key: "meetings.templates", label: "Templates", icon: "List", href: "/meetings/templates", parentKey: "meetings" },
      { key: "meetings.history", label: "History", icon: "BookOpen", href: "/meetings/history", parentKey: "meetings" },
      { key: "opsp", label: "OPSP", icon: "FileText" },
      { key: "opsp.create", label: "Create OPSP", icon: "FileText", href: "/opsp", parentKey: "opsp" },
      { key: "opsp.history", label: "OPSP HISTORY", icon: "BookOpen", href: "/opsp/history", parentKey: "opsp" },
      { key: "opsp.review", label: "OPSP Review", icon: "Star", href: "/opsp/review", parentKey: "opsp" },
      { key: "opsp.categories", label: "Category Mgmt", icon: "List", href: "/opsp/categories", parentKey: "opsp" },
      { key: "analytics", label: "Analytics", icon: "TrendingUp" },
      { key: "analytics.scorecard", label: "Scorecard", icon: "BarChart2", href: "/performance/scorecard", parentKey: "analytics" },
      { key: "analytics.individual", label: "Individual", icon: "User", href: "/performance/individual", parentKey: "analytics" },
      { key: "analytics.teams", label: "Teams", icon: "Users", href: "/performance/teams", parentKey: "analytics" },
      { key: "analytics.trends", label: "Trends", icon: "LineChart", href: "/performance/trends", parentKey: "analytics" },
      { key: "people", label: "People", icon: "UserCheck" },
      { key: "people.cycle", label: "Cycle", icon: "Activity", href: "/performance/cycle", parentKey: "people" },
      { key: "people.goals", label: "Goals", icon: "Target", href: "/performance/goals", parentKey: "people" },
      { key: "people.self", label: "Self-Assessment", icon: "User", href: "/performance/self", parentKey: "people" },
      { key: "people.reviews", label: "Reviews", icon: "ClipboardList", href: "/performance/reviews", parentKey: "people" },
      { key: "people.oneOnOne", label: "1:1s", icon: "Users", href: "/performance/one-on-one", parentKey: "people" },
      { key: "people.feedback", label: "Feedback", icon: "MessageSquare", href: "/performance/feedback", parentKey: "people" },
      { key: "people.talent", label: "Talent", icon: "Layers", href: "/performance/talent", parentKey: "people" },
    ],
  },
  {
    appSlug: "admin",
    modules: [
      { key: "overview", label: "Overview", icon: "LayoutDashboard", href: "/dashboard" },
      { key: "members", label: "Members", icon: "Users", href: "/members" },
      { key: "teams", label: "Teams", icon: "FolderTree", href: "/teams" },
      { key: "apps", label: "Apps", icon: "AppWindow", href: "/apps" },
      { key: "roles", label: "Roles", icon: "ShieldCheck", href: "/roles" },
      { key: "settings", label: "Settings", icon: "Settings", href: "/settings" },
    ],
  },
];

/** Utility: derive the set of ancestor keys for a given moduleKey (cascade rule). */
export function ancestorsOf(moduleKey: string): string[] {
  const parts = moduleKey.split(".");
  const out: string[] = [];
  for (let i = 1; i < parts.length; i++) out.push(parts.slice(0, i).join("."));
  return out;
}

/** Utility: is this module enabled given the disabled-set? Applies cascade rule. */
export function isModuleEnabled(moduleKey: string, disabled: Set<string>): boolean {
  if (disabled.has(moduleKey)) return false;
  for (const a of ancestorsOf(moduleKey)) if (disabled.has(a)) return false;
  return true;
}

export function getApp(appSlug: string): AppModuleConfig | undefined {
  return MODULE_REGISTRY.find((a) => a.appSlug === appSlug);
}
```

**Keep this file the single source of truth.** Sidebar, super admin UI, layout gates, and API gates all read from it.

---

## 4. Gate helpers

**File:** `packages/auth/feature-gate.ts`

Three functions, all share the per-request cache:

```ts
import { cache } from "react";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { db } from "@quikit/database";
import { NextResponse } from "next/server";
import { ancestorsOf, isModuleEnabled } from "@quikit/shared/moduleRegistry";

/** Returns the set of disabled module keys for a tenant × app. Dedupes across
 *  the same request via React.cache. */
export const getDisabledModules = cache(
  async (tenantId: string, appSlug: string): Promise<Set<string>> => {
    const app = await db.app.findUnique({ where: { slug: appSlug }, select: { id: true } });
    if (!app) return new Set();
    const rows = await db.featureFlag.findMany({
      where: { tenantId, appId: app.id, enabled: false },
      select: { moduleKey: true },
    });
    return new Set(rows.map((r) => r.moduleKey));
  },
);

/** Use in a layout.tsx (server component). Redirects if module is disabled. */
export async function gateModule(appSlug: string, moduleKey: string, authOptions: any) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.tenantId) redirect("/select-org");
  const disabled = await getDisabledModules(session.user.tenantId, appSlug);
  if (!isModuleEnabled(moduleKey, disabled)) {
    redirect(`/dashboard?feature_disabled=${encodeURIComponent(moduleKey)}`);
  }
}

/** Use at the top of an API route handler. Returns 404 if module is disabled. */
export async function gateApiModule(
  appSlug: string,
  moduleKey: string,
  tenantId: string,
): Promise<Response | null> {
  const disabled = await getDisabledModules(tenantId, appSlug);
  if (!isModuleEnabled(moduleKey, disabled)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return null;
}

/** Client-side equivalent: consumes disabled set from server component prop. */
// exported helper to filter registry by disabled set — used in sidebar rendering
export { isModuleEnabled };
```

**Usage patterns:**

```tsx
// apps/quikscale/app/(dashboard)/kpi/layout.tsx
import { gateModule } from "@quikit/auth/feature-gate";
import { authOptions } from "@/lib/auth";

export default async function KPILayout({ children }) {
  await gateModule("quikscale", "kpi", authOptions);
  return <>{children}</>;
}

// apps/quikscale/app/api/kpi/route.ts
import { gateApiModule } from "@quikit/auth/feature-gate";
// ...inside GET/POST, after getServerSession and tenantId extraction:
const blocked = await gateApiModule("quikscale", "kpi", tenantId);
if (blocked) return blocked;
```

---

## 5. Super admin UI

### 5.1 New left-nav entry

Add to `apps/quikit/app/(super-admin)/layout.tsx` sidebar:
```
{ label: "App Feature Flags", href: "/feature-flags", icon: ToggleRight }
```

### 5.2 Pages

**`/super/feature-flags`** (index) — List of apps. Click an app → go to module tree.

**`/super/feature-flags/[appSlug]`** — Module tree. Top of page has a **tenant picker** (searchable dropdown). Selected tenant's disabled-set drives the toggle states.

### 5.3 API routes

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/super/feature-flags/[appSlug]?tenantId=X` | Returns disabled moduleKeys for tenant × app |
| `POST` | `/api/super/feature-flags/[appSlug]/toggle` | Body: `{ tenantId, moduleKey, enabled }`. Upserts or deletes row. Writes AuditLog. |
| `GET` | `/api/super/tenants` | For the tenant picker — returns `[{ id, name, slug }]`. Rate-limited. Probably paginated. |

All gated by `requireSuperAdmin`.

### 5.4 Reusable components (new in `packages/ui`)

- **`<ModuleTree>`** — renders an `AppModuleConfig`'s modules as a hierarchical list with toggles. Props: `app: AppModuleConfig`, `disabledKeys: Set<string>`, `onToggle: (moduleKey, next: boolean) => void`.
- **`<TenantPicker>`** — searchable select of tenants. Props: `tenants: {id, name}[]`, `value`, `onChange`.
- Reuse existing `Switch` / `Toggle` if it exists; otherwise `ModuleTree` wraps a small `<ToggleSwitch>` locally.

---

## 6. App enforcement

### 6.1 Sidebar

Replace the hard-coded `navigation` array in `apps/quikscale/components/dashboard/sidebar.tsx` with a server-component-fetched disabled set + registry-driven render. Convert the sidebar to split:
- `sidebar.tsx` (server component wrapper that fetches flags)
- `sidebar-nav.tsx` (existing client component, receives `modules` + `disabledKeys` as props)

Same for `apps/admin/components/dashboard/sidebar.tsx`.

Sidebar filter:
```ts
const visible = modules.filter((m) => isModuleEnabled(m.key, disabledKeys));
```

### 6.2 Route layout gates

For each top-level module folder, add `layout.tsx`:
```tsx
// apps/quikscale/app/(dashboard)/kpi/layout.tsx
import { gateModule } from "@quikit/auth/feature-gate";
import { authOptions } from "@/lib/auth";

export default async function KPILayout({ children }) {
  await gateModule("quikscale", "kpi", authOptions);
  return <>{children}</>;
}
```

Sub-modules gate themselves:
```tsx
// apps/quikscale/app/(dashboard)/kpi/teams/layout.tsx
await gateModule("quikscale", "kpi.teams", authOptions);
```

The cascade rule in `isModuleEnabled` means `kpi.teams` is checked against both its own flag and `kpi`'s, so disabling the parent also blocks the child route.

### 6.3 API gates

For each API route corresponding to a module (roughly 1-2 per module), add `gateApiModule()` call after auth but before DB work. Returns 404 when disabled.

Mapping (will be in the plan's appendix):
```
/api/kpi/*         → moduleKey "kpi"
/api/kpi/teams/*   → "kpi.teams"
/api/priority/*    → "priority"
/api/org/teams/*   → "orgSetup.teams"
/api/meetings/*    → "meetings"
/api/opsp/*        → "opsp"
/api/performance/scorecard/* → "analytics.scorecard"
... etc
```

### 6.4 Feature-disabled toast

New component `<FeatureDisabledToast>` in `packages/ui` — mounts on dashboard, reads `?feature_disabled=` query param, shows a toast with "The X module has been disabled for your organization." Dismisses on click.

---

## 7. Edge cases

| Case | Behavior |
|---|---|
| User on `/kpi` when super admin disables KPI | Next click navigates → layout gate fires → redirects to `/dashboard?feature_disabled=kpi` + toast |
| User POSTs to `/api/kpi/..` from dev tools on disabled tenant | 404 (L3) |
| Parent disabled, child row enabled | Child still hidden (cascade rule, not stored) |
| New module added in registry | Enabled for all tenants by default; super admin must explicitly disable |
| Tenant row deleted | `onDelete: Cascade` on FeatureFlag → rows removed automatically |
| Super admin toggles a key that isn't in registry | Row created, but no rendering/enforcement (harmless) |
| Re-enabling a previously disabled module | `DELETE` row. Module reappears on next page load (within per-request cache; stale for up to one request). |

---

## 8. Implementation phases

### Phase 1 — Foundation (schema + registry + gates + tests)
Files:
- `packages/database/prisma/schema.prisma` (add FeatureFlag, relations)
- `packages/database/prisma/migrations/<timestamp>_add_feature_flags/migration.sql`
- `packages/shared/lib/moduleRegistry.ts`
- `packages/shared/index.ts` (export from barrel — safe, no Node deps)
- `packages/auth/feature-gate.ts`
- `packages/auth/index.ts` (export gate helpers)
- `packages/auth/__tests__/feature-gate.test.ts`

### Phase 2 — Super admin UI
Files:
- `packages/ui/components/module-tree.tsx`
- `packages/ui/components/tenant-picker.tsx`
- `packages/ui/index.ts` (export)
- `apps/quikit/app/(super-admin)/feature-flags/page.tsx` (app list)
- `apps/quikit/app/(super-admin)/feature-flags/[appSlug]/page.tsx` (tree + tenant picker)
- `apps/quikit/app/api/super/feature-flags/[appSlug]/route.ts` (GET)
- `apps/quikit/app/api/super/feature-flags/[appSlug]/toggle/route.ts` (POST)
- `apps/quikit/app/api/super/tenants/route.ts` (GET, if not already existing)
- `apps/quikit/app/(super-admin)/layout.tsx` (add sidebar entry)

### Phase 3 — QuikScale enforcement
- Split sidebar into server wrapper + client nav
- Add `layout.tsx` gates to ~9 module root folders under `apps/quikscale/app/(dashboard)/`
- Add `gateApiModule()` calls to corresponding API routes
- `FeatureDisabledToast` in `packages/ui`; wire it on quikscale's dashboard

### Phase 4 — Admin app enforcement
- Same pattern, smaller scope (6 flat modules)

### Phase 5 — Verification
- `npx turbo typecheck test --force` across all workspaces
- Prod-safety gate (no localhost added)
- Manual smoke: log in as super admin, disable KPI for a tenant, log in as that tenant's admin, verify KPI hidden from sidebar + `/kpi` redirects + `/api/kpi` returns 404

---

## 9. Effort estimate

| Phase | Effort |
|---|---|
| 1 — Foundation | 3-4 hrs |
| 2 — Super admin UI | 5-6 hrs |
| 3 — QuikScale enforcement | 6-8 hrs (lots of small files) |
| 4 — Admin enforcement | 2-3 hrs |
| 5 — Verification | 1 hr |

**Total:** ~2-3 days focused work. Single branch: `feature/app-feature-flags`, phased commits.

---

## 10. Rollback

- Revert the migration: drop `FeatureFlag` table.
- Revert code: `git revert <merge-commit>`.
- No data loss; sparse storage means even if FeatureFlag table goes away, every module was already "enabled by default."

---

## 11. Open follow-ups (deliberately out of scope)

- **Progressive rollout** (enable a module for some tenants, disable for others by default): current design is symmetric (default enabled). If we need "disabled by default, opt-in per tenant" later, adds a `defaultEnabled` flag to the registry + dense storage fallback.
- **Feature flag UI inside the app itself** (e.g., tenant admin controls subset of flags): out of scope — today only super admin.
- **Per-user flags** (different users on the same tenant see different modules): not asked for; deliberately not designed.

---

_Plan ends. Implementation begins in the next commits._
