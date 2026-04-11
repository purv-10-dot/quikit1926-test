# QuikIT Mind Map

> **Purpose**: Quick-orient reference so I don't have to re-read the entire codebase every session.
> **Update rule**: Whenever code is pushed to `main`, update the "Recent pushes" section + any structural changes.
> **Companion**: `.claude/code-analysis.md` — detailed findings, effort estimates, test results.

---

## 1. Project at a glance

- **Type**: Turborepo monorepo, Next.js 14 (App Router), Prisma + PostgreSQL, multi-tenant SaaS
- **Repo root**: `/Users/user/Documents/Claude_Code/QuikIT`
- **Package manager**: pnpm workspaces
- **Today's date**: 2026-04-10

### Apps (3)
| App | Port | Purpose |
|-----|------|---------|
| `apps/quikscale` | **3004** | End-user SaaS (KPI, Priority, WWW, OPSP, Meetings, Performance, Dashboard) |
| `apps/admin` | **3005** | Tenant-admin app (org setup, user mgmt, settings) |
| `apps/super-admin` | **3006** | Cross-tenant god mode (tenants, billing, audit) |

> Ports are locked — NEVER change them.

### Shared packages (4)
| Package | Exports |
|---------|---------|
| `@quikit/database` | `db` (Prisma client), schema, migrations |
| `@quikit/auth` | `createMiddleware`, `getTenantId`, `requireAdmin`, `requireSuperAdmin`, session helpers |
| `@quikit/ui` | Design system components, `ThemeApplier`, `@quikit/ui/styles`, `@quikit/ui/tailwind-config` |
| `@quikit/shared` | `ROLES`, `ROLE_HIERARCHY`, pagination utils, common types |

---

## 2. QuikScale feature domains (apps/quikscale)

Dashboard routes live under `app/(dashboard)/<feature>/`. API routes mirror under `app/api/<feature>/`.

| Feature | Route | Key model(s) | Status |
|---------|-------|--------------|--------|
| **KPI Individual** | `/kpi` | `KPI` (kpiLevel=individual), `KPIWeeklyValue`, `KPINote`, `KPILog` | ✅ Stable |
| **KPI Team** | `/kpi/teams` | `KPI` (kpiLevel=team, ownerIds, ownerContributions), per-owner weekly values | ✅ Phase 2 done |
| **Priority** | `/priority` | `Priority`, `PriorityWeeklyUpdate` | ✅ Stable |
| **WWW** (What Went Well) | `/www` | `WWWItem`, `WWWWeeklyUpdate` | ✅ Stable |
| **OPSP** (One Page Strategic Plan) | `/opsp` | `OPSP` (JSON columns for form state) | ✅ Recently rebuilt |
| **Dashboard** | `/dashboard` | Aggregates from above | ✅ Stable |
| **Meetings** | `/meetings` | `Meeting`, `MeetingAttendee`, `MeetingAgendaItem` | 🟡 Partial |
| **Habits** | `/habits` | `Habit`, `HabitCheckIn` | 🟡 Partial |
| **Performance** | `/performance` | `PerformanceReview` | 🟡 Partial |
| **OPPP** | `/oppp` | placeholder | 🔴 Skeleton |
| **Cash** | `/cash` | placeholder | 🔴 Skeleton |
| **Settings** | `/settings` | Profile, theme, company settings | ✅ Recent |
| **Org Setup** | `/org-setup` | Teams, users, roles | ✅ Stable |

---

## 3. Data model highlights (packages/database/prisma/schema.prisma)

### KPI (unified individual + team)
- Discriminator: `kpiLevel` ∈ `"individual" | "team"`
- **Individual**: `owner` (cuid, required), `ownerIds=[]`, `ownerContributions=null`
- **Team**: `owner=null`, `teamId` required, `ownerIds[]` non-empty, `ownerContributions` (Json, sum=100), `weeklyOwnerTargets` (Json), plus per-owner weekly values on `KPIWeeklyValue` via `userId`
- Invariants enforced in **Zod schema** (`apps/quikscale/lib/schemas/kpiSchema.ts`) not DB CHECK
- `KPIWeeklyValue` has optional `userId` for team KPI attribution

### Tenant isolation
- EVERY query filters by `tenantId` (except super-admin)
- `getTenantId()` helper from `@quikit/auth` throws on missing session
- Middleware from `@quikit/auth/middleware` handles redirects

### OPSP JSON columns
- `rocks`, `goals`, `keyThrusts`, `capabilities`, `values`, etc. are `Json?` — form state lives server-side, client submits full objects
- Rocks recently converted from RichEditor string → 3-column table (rank | Quarterly Priorities | Who) with Maximize2 expand modal

---

## 4. Patterns & conventions (see CLAUDE.md for source of truth)

### API route template
```ts
export async function GET(req: NextRequest) {
  try {
    const tenantId = await getTenantId();           // 1. Auth
    const params = schema.parse(searchParams);      // 2. Zod validate
    const data = await db.kpi.findMany({            // 3. Prisma with tenantId
      where: { tenantId },
      select: { ... },                              // select for lists, include for details
      ...paginationToSkipTake(params),
    });
    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {                        // never `any`
    const message = error instanceof Error ? error.message : "Operation failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
```
- POST → 201 on create, everything else → 200
- Response shape always `{ success, data | error }`
- Use `NextRequest` not `Request`

### Frontend patterns
- Provider order: `SessionProvider → QueryClientProvider → ThemeProvider`
- Login route: `/login` (never `/auth/login`)
- File/dir names: lowercase (`sidebar.tsx`), exports PascalCase (`export function Sidebar`)
- UI components imported from `@quikit/ui` — never locally copied
- Hardcoded `bg-gray-50` etc. is forbidden — use CSS vars / accent-* classes
- Accent colors themeable via `accent-50…accent-900` (mapped by `ThemeApplier`)
- Semantic colors (status greens/reds, quarter badges) stay hardcoded

### Git workflow (IMMUTABLE — see MEMORY.md)
- All dev work is **LOCAL only** by default
- NO commits or pushes without explicit user green-flag
- Branch flow: `feature/*` → `dev` → `uat` → `main`
- Backup pattern: `git commit-tree` without disturbing working tree

---

## 5. Recent pushes (to `main`)

> **Update this section on every push to main.**

| Date | Commit | Summary |
|------|--------|---------|
| 2026-04-10 | `7d3bb54` | Major OPSP rebuild (Rocks 3-col table, Maximize2 expand modal on all OPSP sections) + Team KPI Phase 1/2 (multi-owner, per-owner weekly targets & values) + inconsistency fixes |
| earlier | `a4a4ae5` | Merge uat → main (settings + theming) |
| earlier | `98658b3` | Settings page (profile, company theme, configurations) |
| earlier | `1d67018` | Accent color system + `ThemeApplier` in shared packages |
| earlier | `b8fc408` | Separate super-admin from org-level apps |

---

## 6. Active backup branches (local only, not pushed)

| Branch | Created | What it preserves |
|--------|---------|-------------------|
| `backup/pre-analysis-20260411-010643` | 2026-04-11 | Snapshot before code-analysis sweep |
| `backup/pre-teams-kpi-20260410-163306` | 2026-04-10 | Snapshot before Team KPI implementation |

Rollback pattern: `git reset --hard <backup-branch>`.

---

## 7. Key files to know (by frequency of touch)

### Largest / most-edited (frontend)
| File | Lines | Notes |
|------|-------|-------|
| `apps/quikscale/app/(dashboard)/opsp/page.tsx` | ~2225 | Monolith — 36 inline sub-components. Split candidate. |
| `apps/quikscale/app/(dashboard)/kpi/components/KPIModal.tsx` | ~1090 | Shared by Individual + Team via `scope` prop |
| `apps/quikscale/app/(dashboard)/kpi/components/LogModal.tsx` | ~1017 | Weekly logging sheet |
| `apps/quikscale/app/(dashboard)/kpi/components/KPITable.tsx` | ~800 | Shared table; `readOnly` + `hideColumns` props |
| `apps/quikscale/app/(dashboard)/kpi/teams/page.tsx` | ~400 | Team KPI hub (expandable TeamSection per team) |
| `apps/quikscale/app/(dashboard)/kpi/teams/components/TeamSection.tsx` | ~300 | Per-team collapsible section |

### Core shared logic
- `apps/quikscale/lib/schemas/kpiSchema.ts` — Zod invariants for KPI (individual/team)
- `apps/quikscale/lib/types/kpi.ts` — `KPIRow`, `WeeklyValue`, `TeamInfo`, `OwnerUser`
- `apps/quikscale/lib/hooks/useKPI.ts` — `useKPIs`, `useTeamKPIs`, create/update/delete mutations
- `apps/quikscale/lib/hooks/useTeams.ts` — `useTeams()` (returns `{id,name,color,headId,memberCount,...}`)
- `apps/quikscale/lib/hooks/useCanManageTeamKPI.ts` — client-side permission check
- `apps/quikscale/lib/api/teamKPIPermissions.ts` — server-side: admin OR team head
- `apps/quikscale/lib/utils/kpiHelpers.ts` — `progressColor`, `weekCellColors`, `fmt`, `fmtCompact`
- `apps/quikscale/lib/utils/fiscal.ts` — fiscal year/quarter/week math

### API surface (quikscale)
```
/api/kpi            GET|POST    list/create (branches on kpiLevel)
/api/kpi/[id]       GET|PUT|DELETE   respect team-KPI permissions
/api/kpi/[id]/weekly-values   POST   per-owner attribution
/api/kpi/[id]/notes           GET|POST
/api/kpi/[id]/logs            GET
/api/priority       GET|POST
/api/www            GET|POST
/api/opsp           GET|PUT     single JSON row per tenant/year
/api/org/teams      GET|POST
/api/org/users      GET
/api/settings/company    GET|PUT
/api/teams/[id]     GET|PUT|DELETE
```

---

## 8. Known issues / unfinished items

> See `.claude/code-analysis.md` for full breakdown + effort estimates (Phase 1 ~84h, Phase 2 ~39h).

### High-priority (Phase 1)
- **No test coverage** anywhere in the repo — zero test files
- **Pagination missing** on ~40 of 42 API endpoints — only KPI has it
- **Soft-delete only on KPI** — Priority/WWW/OPSP do hard deletes
- **Auth duplication** — `getTenantId` wrapper repeated in every route
- **OPSP monolith** — 2225 lines, 36 inline sub-components, needs extraction
- **298 hardcoded `blue-*` classes** — theming leak
- **253 hardcoded `text-[Npx]` values** — breaks font scaling
- **3 picker duplications** — OwnerSelect, TeamSelect, UserPicker variants
- **5 tooltip implementations** across apps
- **Duplicate Button component** (local vs `@quikit/ui`)
- **7 `catch (e: any)` violations** of the `unknown` rule
- **Missing DB indexes** on frequent filter columns (kpiLevel, status, year)
- **AuditLog model exists but unused**
- **Relation cascade inconsistencies** on KPI children

### Medium-priority (Phase 2)
- Meetings, Habits, Performance pages are partial
- OPPP and Cash pages are skeletons
- Mind map/analysis living docs (this file + code-analysis.md) need discipline to stay updated

---

## 9. Operational quick reference

### Start dev servers
```bash
pnpm dev                                  # all 3 apps via turbo
pnpm --filter @quikit/quikscale dev       # just quikscale on :3004
```
Or via Claude Preview MCP: `preview_start` with name from `.claude/launch.json`.

### Prisma workflow
```bash
pnpm --filter @quikit/database db:push    # push schema → DB (no migration file)
pnpm --filter @quikit/database db:migrate # create migration (interactive — avoid in agent sessions)
pnpm --filter @quikit/database db:studio  # Prisma Studio
```
**Agent rule**: use `db push` not `migrate dev` (migrate dev is interactive).

### Typecheck
```bash
pnpm typecheck          # turbo typecheck across all packages
pnpm --filter @quikit/quikscale typecheck
```

### Git backup pattern (no working-tree disturbance)
```bash
TREE=$(git write-tree)
COMMIT=$(git commit-tree "$TREE" -p HEAD -m "backup: <reason>")
git branch "backup/pre-<change>-$(date +%Y%m%d-%H%M%S)" "$COMMIT"
```

---

## 10. Orientation checklist (for new session)

When resuming work, in this order:
1. Read this file (mind-map.md).
2. If task is code-quality / refactor → read `.claude/code-analysis.md`.
3. If task is feature → check corresponding feature row in §2 above, then open the key files from §7.
4. Check `git log --oneline -5` + `git status` to see what's in progress.
5. Verify which backup branch represents the last-safe state.
6. Confirm git workflow permission with user before ANY commit/push.
