# Teams KPI — Data Model & Flow Reference

> **Scope:** Everything about Team KPIs — storage, IDs, relationships, the
> request flow from page to API to DB, permissions, and the gotchas that
> separate Team KPIs from Individual KPIs.
>
> **Route:** [`app/(dashboard)/kpi/teams/`](../app/(dashboard)/kpi/teams/)
> **API:** `GET /api/kpi?kpiLevel=team&year=&quarter=`
> **Schema file:** [`packages/database/prisma/schema.prisma`](../../../packages/database/prisma/schema.prisma)
> **Prisma schema namespaces:** `app_quikscale` (KPI side), `public` (Team, UserTeam)

---

## 1. Table inventory

| # | Table | Schema | Purpose | Cascade parent |
|---|---|---|---|---|
| 1 | `Team` | `public` | The team record itself | `Org` |
| 2 | `UserTeam` | `public` | Many-to-many: which Users belong to which Teams | `Team` + `User` |
| 3 | `OrgMember.teamId` | `quikit` | A user's **primary** team (single FK on `OrgMember`) | — |
| 4 | `KPI` | `app_quikscale` | The KPI itself — Individual AND Team KPIs live here, separated by `kpiLevel` | `Org` |
| 5 | `KPIWeeklyValue` | `app_quikscale` | Per-week per-owner numeric values | `KPI` |
| 6 | `KPINote` | `app_quikscale` | Comments / notes on a KPI | `KPI` + `User` |
| 7 | `KPILog` | `app_quikscale` | Audit trail (CREATE / UPDATE / DELETE / RESTORE) | `KPI` |

> **There is no `TeamKPI` table.** A "Team KPI" is just a row in `KPI` where
> `kpiLevel = "team"` and `teamId` is set. The shared `KPI` table holds both
> Individual and Team KPIs — distinguished only by the `kpiLevel` discriminator.

---

## 2. Foundation tables

### 2.1 `Team` — [`schema.prisma:467`](../../../packages/database/prisma/schema.prisma#L467)

| Column | Type | Description |
|---|---|---|
| `id` | `String` (cuid) PK | |
| `orgId` | `String` FK → `Org.id` | Tenant scope. **Always filter by this.** |
| `name` | `String` | Display name |
| `description` | `String?` | |
| `slug` | `String` | URL-friendly identifier |
| `parentTeamId` | `String?` FK → `Team.id` (self) | Team hierarchy (tree). Self-relation name: `TeamHierarchy` |
| `headId` | `String?` | UserId of the **Team Head** (used in permission gates) |
| `color` | `String? @default("#0066cc")` | Hex color used as the team badge |
| `createdAt`, `updatedAt`, `createdBy` | audit | |
| `deletedAt` | `DateTime?` | Soft-delete |

**Indexes:** `orgId`, `parentTeamId`, `deletedAt`
**Unique:** `(orgId, slug)`

**Relations:**
- `kpis KPI[]` — back-relation, every KPI with `teamId` = this
- `priorities Priority[]`
- `userTeams UserTeam[]` — multi-team membership
- `members OrgMember[]` — users whose **primary** team is this one
- `accountabilityFunctions AccountabilityFunction[]`
- `parentTeam Team?` / `childTeams Team[]` (hierarchy)

### 2.2 `UserTeam` — [`schema.prisma:450`](../../../packages/database/prisma/schema.prisma#L450)

Many-to-many join: a `User` can belong to multiple `Team`s.

| Column | Type |
|---|---|
| `id` | PK |
| `orgId` | denormalized for tenant scope |
| `userId` | FK → `User.id` |
| `teamId` | FK → `Team.id` |
| `createdAt` | |

**Unique:** `(orgId, userId, teamId)`
**Indexes:** `orgId`, `userId`, `teamId`

### 2.3 `OrgMember.teamId` — primary team

`OrgMember` (the per-org membership row for a User) has a `teamId String?` FK
that points to **one** team — this is the user's **primary** team. Used in
flows that need a single "home" team (e.g., default dropdown selection).

> **`UserTeam` vs `OrgMember.teamId`:** Use `UserTeam` for "which teams can this
> user access KPIs for". Use `OrgMember.teamId` as the default/primary
> selection. They can diverge.

---

## 3. The `KPI` table — [`schema.prisma:518`](../../../packages/database/prisma/schema.prisma#L518)

This is **the** KPI table — both Individual and Team KPIs live here.

| Column | Type | Used by Individual? | Used by Team? | Description |
|---|---|---|---|---|
| `id` | `String` PK | ✅ | ✅ | |
| `orgId` | `String` | ✅ | ✅ | Tenant scope |
| `name` | `String` | ✅ | ✅ | KPI display name |
| `description` | `String?` | ✅ | ✅ | |
| **`kpiLevel`** | `String @default("individual")` | always `"individual"` | always `"team"` | **Discriminator field.** Drives the entire fork. |
| `owner` | `String?` FK → `User.id` | ✅ single owner | usually `null` | Single-owner FK (legacy + Individual KPI primary owner) |
| **`ownerIds`** | `String[] @default([])` | typically `[ownerId]` | ✅ array of User IDs | **Multi-owner array — Team KPIs use this** |
| **`ownerContributions`** | `Json?` | unused | ✅ `{userId: pct}` map | **Per-owner contribution % split** (must sum to 100) |
| **`teamId`** | `String?` FK → `Team.id` | usually `null` | ✅ required | **Links the KPI to its Team** |
| `parentKPIId` | `String?` FK → `KPI.id` (self) | optional cascade | optional cascade | KPI hierarchy (`KPICascade` relation) |
| `quarter` | `String @default("Q1")` | ✅ | ✅ | `Q1` / `Q2` / `Q3` / `Q4` |
| `year` | `Int` | ✅ | ✅ | Fiscal year (April-based) |
| `measurementUnit` | `String` | ✅ | ✅ | `Number` / `Percentage` / `Currency` |
| `target` | `Float?` | ✅ | ✅ | User-set quarterly target |
| `quarterlyGoal` | `Float?` | ✅ | ✅ | |
| `qtdGoal` | `Float?` | ✅ | ✅ | Derived aggregate — Σ weekly goals for weeks `[1..currentWeek-1]` |
| `qtdAchieved` | `Float?` | ✅ | ✅ | Derived aggregate — Σ weekly actuals same range |
| `currentWeekValue` | `Float?` | ✅ | ✅ | |
| `progressPercent` | `Float? @default(0)` | ✅ | ✅ | `qtdAchieved / qtdGoal * 100` |
| `status` | `String @default("active")` | ✅ | ✅ | |
| `healthStatus` | `String @default("on-track")` | ✅ | ✅ | |
| `divisionType` | `String @default("Cumulative")` | ✅ | ✅ | `Cumulative` / `Average` / etc. |
| `weeklyTargets` | `Json?` | ✅ | ✅ | `{ "1": 10, "2": 10, ... "13": 10 }` — per-week target breakdown |
| **`weeklyOwnerTargets`** | `Json?` | rarely | ✅ | `{ userId: { "1": 5, "2": 5, ... } }` — **per-owner per-week split for Team KPIs** |
| `currency` | `String?` | ✅ | ✅ | |
| `targetScale` | `String?` | ✅ | ✅ | `K` / `M` etc. |
| `reverseColor` | `Boolean @default(false)` | ✅ | ✅ | `true` = lower is better (e.g. defect count) |
| `frequency` | `String @default("weekly")` | ✅ | ✅ | |
| `lastNotes` | `String?` | ✅ | ✅ | Inline last-note text shown in table |
| `lastNotesAt` | `DateTime?` | ✅ | ✅ | |
| `lastNotedBy` | `String?` | ✅ | ✅ | |
| audit + `deletedAt` | | ✅ | ✅ | |

**Indexes:**
`orgId`, `(orgId, deletedAt)`, `(orgId, kpiLevel, deletedAt)`, `owner`,
**`teamId`**, **`kpiLevel`**, `parentKPIId`, `status`, `healthStatus`,
`(quarter, year)`

### 3.1 The 4 Team-KPI-specific columns

These are the fields that make a row a "Team KPI" rather than an Individual KPI:

| Column | What it does |
|---|---|
| `kpiLevel = "team"` | Discriminator — every query that lists Team KPIs adds `WHERE kpiLevel = 'team'` |
| `teamId` | The team this KPI belongs to (single FK → `Team`) |
| `ownerIds[]` | Multi-owner array. Postgres native `String[]` array of User IDs |
| `ownerContributions` (JSON) | `{ "userA": 60, "userB": 40 }` — contribution split (must sum to 100). Drives per-owner weighted goal computation. |
| `weeklyOwnerTargets` (JSON) | `{ "userA": { "1": 6, "2": 6, ... }, "userB": { "1": 4, "2": 4, ... } }` — per-owner per-week target split. |

> An Individual KPI rendered as a Team KPI (or vice-versa) means the row's
> `kpiLevel` got corrupted somewhere. There's no separate table — the
> discriminator IS the type.

---

## 4. KPI child tables (same for Individual & Team)

### 4.1 `KPIWeeklyValue` — [`schema.prisma:577`](../../../packages/database/prisma/schema.prisma#L577)

The weekly numbers that drive everything (progress bars, traffic-light cells, QTD totals).

| Column | Type | Description |
|---|---|---|
| `id` | PK | |
| `orgId` | | |
| `kpiId` | FK → `KPI.id` | |
| `userId` | `String?` | **Owner whose contribution this row represents.** For Individual KPIs typically `null`. For Team KPIs, **one row per (owner, week)** — that's how per-owner contributions are stored. |
| `weekNumber` | `Int` | 1..13 within the quarter |
| `value` | `Float?` | The reported actual. `null` = not yet entered (≠ 0). |
| `notes` | `String?` | |
| audit | | |

**Unique:** `(kpiId, userId, weekNumber)` — one row per owner per week per KPI
**Indexes:** `orgId`, `kpiId`, `userId`

> **Important — the `userId` field on weekly values:** For a Team KPI with 2
> owners and 13 weeks, you can have up to 26 `KPIWeeklyValue` rows
> (2 owners × 13 weeks). The aggregated total for "KPI weekly value" is
> computed as `SUM(value) WHERE kpiId = ? AND weekNumber = ?` across all
> owner rows.

### 4.2 `KPINote` — [`schema.prisma:598`](../../../packages/database/prisma/schema.prisma#L598)

| Column | Type |
|---|---|
| `id` | PK |
| `orgId`, `kpiId`, `authorId` | |
| `content` | `String` |
| audit | |

### 4.3 `KPILog` — [`schema.prisma:615`](../../../packages/database/prisma/schema.prisma#L615)

Field-level audit trail. Same shape as `ClientWeeklyMeetingLog`.

| Column | Type | Description |
|---|---|---|
| `id` | PK | |
| `orgId`, `kpiId` | | |
| `action` | `String` | e.g. `"create"`, `"update.target"`, `"delete"`, `"restore"` |
| `oldValue`, `newValue` | `String?` | Serialized values |
| `changedBy` | `String` | userId |
| `reason` | `String?` | |
| `createdAt` | | |

---

## 5. Relationship diagram

```
Org
 │
 ├──< Team ─────────────────────────────────────────────┐
 │     │   (parentTeamId → self, TeamHierarchy)         │
 │     │                                                │
 │     ├──< UserTeam ──> User      (multi-team M2M)     │
 │     │     Unique (orgId, userId, teamId)             │
 │     │                                                │
 │     └──< KPI ─────────────────────────────────────┐  │
 │            ▲                                      │  │
 │            │  kpiLevel = "team"                   │  │
 │            │  teamId = Team.id                    │  │
 │            │  ownerIds[]   = [User.id, …]         │  │
 │            │  ownerContributions = {User.id: %}   │  │
 │            │  weeklyOwnerTargets = {User.id:{w:t}}│  │
 │            │                                      │  │
 │            ├──< KPIWeeklyValue ───────────────────┤  │
 │            │     Unique (kpiId, userId, weekNumber)  │
 │            ├──< KPINote ──> User (author)         │  │
 │            └──< KPILog                            │  │
 │                                                   │  │
 ├──< OrgMember.teamId  (primary team, single FK)    │  │
 │                                                   │  │
 └──< User ──< (referenced by ownerIds[], owner, KPIWeeklyValue.userId, etc.)
```

---

## 6. Request flow — from page to DB

### Step 1 — Page mounts
[`app/(dashboard)/kpi/teams/page.tsx:29`](../app/(dashboard)/kpi/teams/page.tsx#L29)

Hooks called on mount:
| Hook | Purpose | Source |
|---|---|---|
| `useResourcePermissions("TeamKPI")` | `{ canCreate, canUpdate, canDelete }` | Permission registry — `"TeamKPI"` is a **separate resource** from `"KPI"` |
| `useFilterContext()` | Persisted year + quarter + filterTeam across modules | `lib/context/FilterContext` |
| `useFiscalYears()` | List of configured fiscal years (DB-driven) | Module-level cached hook |
| `useTeams()` | All teams in the org | `lib/hooks/useTeams.ts` |
| `useTeamKPIs({ year, quarter })` | All Team KPIs in scope | `lib/hooks/useKPI.ts:33` (forces `kpiLevel:"team"`) |
| `useCurrentWeek(year, quarter)` | DB-driven current week (1..13) | Respects `QuarterSetting.startDate` |

### Step 2 — `useTeamKPIs` wraps `useKPIs`
[`lib/hooks/useKPI.ts:33-39`](../lib/hooks/useKPI.ts#L33-L39)

```ts
export function useTeamKPIs(params: Partial<KPIListParams> = {}) {
  return useKPIs({
    ...params,
    kpiLevel: "team",           // ← the discriminator
    pageSize: params.pageSize ?? 100,
  });
}
```

### Step 3 — `useKPIs` → React Query → service → API

```
useKPIs(params)
  → kpiService.getKPIs(params)
  → fetch("/api/kpi?" + qs)
  → GET /api/kpi
```

### Step 4 — API route handles it

Route: `app/api/kpi/route.ts`

Pseudo-flow:
```ts
const tenantId = await getTenantId(req);                    // from session
const params  = kpiListParamsSchema.parse(searchParams);    // Zod
// Permission guard — "TeamKPI:read" when params.kpiLevel === "team"
await withOrgAuthForResource(req, "TeamKPI", "read", ...);

const kpis = await db.kpi.findMany({
  where: {
    orgId: tenantId,
    kpiLevel: params.kpiLevel,        // "team"
    year: params.year,
    quarter: params.quarter,
    deletedAt: params.includeDeleted ? undefined : null,
  },
  include: {
    team: true,                       // join Team for badge + name
    owner_user: true,                 // legacy single-owner relation
    weeklyValues: true,               // for traffic-light cells
  },
  orderBy: [{ updatedAt: "desc" }],
  take: params.pageSize ?? 100,
});

return NextResponse.json({ success: true, data: kpis });
```

### Step 5 — Client-side grouping by team
[`page.tsx:135-143`](../app/(dashboard)/kpi/teams/page.tsx#L135-L143)

```ts
const kpisByTeam = useMemo(() => {
  const map: Record<string, KPIRow[]> = {};
  for (const k of kpis) {
    if (!k.teamId) continue;            // skip orphans
    (map[k.teamId] ??= []).push(k);
  }
  return map;
}, [kpis]);
```

### Step 6 — Render one `<TeamSection>` per team

Each section renders the **shared** [`KPITable`](../app/(dashboard)/kpi/components/KPITable.tsx)
component with `kpis={kpisByTeam[team.id] ?? []}`. Same table component used
on the Individual KPI page — feature parity is intentional.

> **Locked-table rule applies:** `KPITable.tsx` and `TeamSection.tsx` are in
> the 4 locked tables in [`CLAUDE.md`](../../../CLAUDE.md#-locked-tables--do-not-theme-cells-critical-permanent-rule).
> Cells use fixed `blue-*` / `gray-*` / semantic colors. Do NOT migrate to `accent-*`.

---

## 7. Permissions

Team KPIs use a **separate** permission resource from Individual KPIs:

| Resource key | Surface |
|---|---|
| `"KPI"` | Individual KPI page (`/kpi`) |
| `"TeamKPI"` | Team KPI page (`/kpi/teams`) |

Both are defined in the permissions registry; both have `create` / `read` /
`update` / `delete` actions; both can be granted/revoked independently per
role.

The page combines RBAC with a **legacy role check** for the Add button
([`page.tsx:124-132`](../app/(dashboard)/kpi/teams/page.tsx#L124-L132)):

```ts
const canAddTeamKPI = useMemo(() => {
  if (!session?.user?.id) return false;
  const role = session.user.membershipRole;
  if (ROLE_HIERARCHY[role] >= ROLE_HIERARCHY[ROLES.ADMIN]) return true;
  if (session.user.isSuperAdmin) return true;
  return teams.some(t => t.headId === session.user?.id);   // team head check
}, [session, teams]);
```

Add button shows only when **both** `canCreate` (RBAC) **AND** `canAddTeamKPI`
(legacy admin/team-head) pass.

---

## 8. Cascade & soft-delete behavior

| Behavior | Tables |
|---|---|
| **Soft-delete** (`deletedAt`, row preserved) | `Team`, `KPI` |
| **Hard-cascade-delete** | `KPIWeeklyValue`, `KPINote`, `KPILog` (when parent KPI is hard-deleted) |
| **Restore** | Setting `deletedAt = null` on `KPI` brings it back; weekly values are preserved because soft-delete doesn't cascade. |
| **Team deletion** | Soft-deleting a `Team` does NOT cascade to its KPIs — those keep `teamId` pointing at the soft-deleted team. UI hides them by joining `WHERE Team.deletedAt IS NULL`. |
| **Org deletion** | Hard-cascades through every model (`onDelete: Cascade` on `orgId` FKs). |

---

## 9. Common query patterns

### List all Team KPIs for an org / quarter

```ts
const teamKpis = await db.kpi.findMany({
  where: { orgId, kpiLevel: "team", year, quarter, deletedAt: null },
  include: { team: true, weeklyValues: true },
});
```

### Get one Team KPI with full detail (drawer / modal)

```ts
const kpi = await db.kpi.findUnique({
  where: { id, orgId },                 // tenant-scoped
  include: {
    team: { include: { members: true } },
    weeklyValues: true,
    notes: { include: { author: true }, orderBy: { createdAt: "desc" } },
    logs: { orderBy: { createdAt: "desc" }, take: 50 },
  },
});
```

### Compute per-owner per-week display value for a Team KPI

```ts
// KPIWeeklyValue rows for a Team KPI — one row per (owner, week)
const rows = kpi.weeklyValues.filter(wv => wv.weekNumber === week);
const aggregated = rows.reduce((sum, r) => sum + (r.value ?? 0), 0);
// Per-owner break-down:
const perOwner = Object.fromEntries(
  kpi.ownerIds.map(uid => [
    uid,
    rows.find(r => r.userId === uid)?.value ?? null
  ])
);
```

### Resolve "all KPIs owned by user U" across both Individual and Team

```ts
const ownedKpis = await db.kpi.findMany({
  where: {
    orgId,
    deletedAt: null,
    OR: [
      { owner: userId },                    // Individual KPI single-owner
      { ownerIds: { has: userId } },        // Team KPI multi-owner (Postgres array op)
    ],
  },
});
```

---

## 10. Design notes & gotchas

1. **One table, two types.** There is **no** `TeamKPI` table — the same `KPI`
   table holds both Individual and Team rows. `kpiLevel` is the only
   discriminator. Every Team KPI query must include `WHERE kpiLevel = "team"`.

2. **Two owner mechanisms in the same row.** `owner` (single FK, legacy +
   Individual primary) AND `ownerIds[]` (array, Team multi-owner). Team KPIs
   typically have `owner = null` and `ownerIds = [u1, u2, …]`. Individual KPIs
   typically have `owner = u1` and `ownerIds = [u1]` (or empty).

3. **`ownerContributions` must sum to 100.** UI enforces this at save time;
   DB does not. If you ever see a Team KPI where the % don't sum to 100, the
   weighted progress math will be wrong — first place to look during a
   color-coding bug.

4. **`weeklyOwnerTargets` is the source of truth for per-week per-owner
   targets.** The flat `weeklyTargets` JSON is the aggregate (sum across
   owners). When editing a Team KPI, update both.

5. **`KPIWeeklyValue.userId` is the contributor, not the editor.** Multiple
   rows per (kpi, week) for Team KPIs — one per owner. Aggregate with
   `SUM(value)` for the display cell.

6. **Team KPIs default to `pageSize: 100`.**
   [`useTeamKPIs`](../lib/hooks/useKPI.ts#L33-L39) caps at 100 to match the
   Zod schema's row-cap. Tenants with >100 team KPIs per quarter will silently
   truncate — switch to paginated fetch if that ever happens.

7. **Locked table rule.** `KPITable.tsx` (shared) and `TeamSection.tsx` are
   in the [4 locked tables](../../../CLAUDE.md#-locked-tables--do-not-theme-cells-critical-permanent-rule).
   Cell colors are fixed semantic (`bg-blue-600` = exceeded, `bg-green-600` =
   achieved, `bg-yellow-500` = near, `bg-red-600` = below). Do NOT migrate
   any cell styling to `accent-*` — only `<th>` backgrounds use `bg-accent-50`.

8. **"Team" badge color.** `Team.color` (hex string) is used as the badge dot
   in the team filter and as the section header accent. Default `#0066cc` if
   unset.

9. **Team hierarchy is a tree.** `parentTeamId` is a self-FK. The relation
   name is `TeamHierarchy`. UI doesn't currently render team hierarchy in the
   KPI page (flat list), but the data supports it.

10. **No `TeamKPILog`.** All audit goes to `KPILog` (same table as Individual
    KPI logs). To filter for Team KPI changes only, join to `KPI` and filter
    `kpiLevel = "team"`.
