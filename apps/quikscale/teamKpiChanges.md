# Team KPI — Changes Log

Branch: `feature/TeamKPI`. Companion doc to [bugsResolve.md](./bugsResolve.md)
and [rolesAndPermissions.md](./rolesAndPermissions.md). Sequenced in the order
the changes were built.

---

## 1. Team KPI ↔ Individual KPI auto-linking

When a Team KPI is created with N owners, N child Individual KPIs are
auto-created — one per owner — linked back via `KPI.parentKPIId`. Edits flow
both ways so the team and child rows stay in sync without manual upkeep.

### What changed

- **POST `/api/kpi`** — after the Team KPI insert, iterates `validated.ownerIds`
  and creates one Individual KPI per owner with:
  - `parentKPIId = team.id`
  - `owner = ownerId`, `kpiLevel = "individual"`, `ownerIds: []`
  - `target = team.target × ownerContributions[owner]/100`
  - `weeklyTargets` derived from `weeklyOwnerTargets[owner]` if present, else
    `team.weeklyTargets × pct/100`
  - `quarterlyGoal` / `qtdGoal` scaled the same way
  - Logged via `KPILog` with `linkedFromTeamKPI` metadata
- **Per-owner emails** — for Team KPIs, `notifyKPIAssignment` is called once
  per child, so each owner sees a mail with **their own** derived target
  (instead of one batch mail with the team-level total).
- **Bidirectional weekly-value sync** — [`api/kpi/[id]/weekly/route.ts`](./app/api/kpi/[id]/weekly/route.ts)
  now extracts `upsertAndRecalc(opts)`. After the primary write:
  - Team write → mirrors to that owner's child Individual row.
  - Child write → mirrors to the parent Team's per-owner row.
  Both paths re-aggregate `qtdAchieved` + `progressPercent` on the linked KPI.
- **Bidirectional target sync** — [`api/kpi/[id]/route.ts`](./app/api/kpi/[id]/route.ts)
  PUT calls one of two helpers when `target` / `weeklyTargets` /
  `weeklyOwnerTargets` / `ownerContributions` change:
  - `syncTeamTargetToChildren(teamId)` — pushes scaled target + per-week
    targets down to every child.
  - `syncChildTargetToParent(parentId)` — re-derives parent.target as the sum
    of children's targets, recomputes `ownerContributions` proportionally,
    and writes `weeklyOwnerTargets[owner] = child.weeklyTargets`.
- **DELETE behaviour** — soft-deleting a Team KPI cascades a soft-delete to
  every child (each gets a `KPILog` entry). Soft-deleting a child triggers
  `syncChildTargetToParent` so the team total drops accordingly.
- **Duplicate-name guard** — POST rejects `(tenant, name, quarter, year)`
  collisions, but only against rows with `parentKPIId IS NULL` so child KPIs
  don't false-positive against unrelated user-created KPIs sharing the name.
- **List endpoint** — `/api/kpi` enriches each row with
  `parentKPI: { id, name, kpiLevel } | null` (one batched query per page).
- **UI badge** — [`KPITable.tsx`](./app/(dashboard)/kpi/components/KPITable.tsx)
  renders a small `Linked` badge next to the KPI Name when `parentKPI` is set.
  Tooltip shows the team KPI's name. No new column added (locked-table rule
  respected).

### Files

| Path | What |
|---|---|
| [`app/api/kpi/route.ts`](./app/api/kpi/route.ts) | POST auto-creates children + per-owner emails + duplicate-name guard + list enrichment |
| [`app/api/kpi/[id]/route.ts`](./app/api/kpi/[id]/route.ts) | PUT/DELETE sync helpers + cascade |
| [`app/api/kpi/[id]/weekly/route.ts`](./app/api/kpi/[id]/weekly/route.ts) | `upsertAndRecalc` + bidirectional weekly mirror |
| [`lib/types/kpi.ts`](./lib/types/kpi.ts) | `KPIRow.parentKPI` field |
| [`app/(dashboard)/kpi/components/KPITable.tsx`](./app/(dashboard)/kpi/components/KPITable.tsx) | `Linked` badge in KPI Name cell |

---

## 2. Edit Team KPI form — parity with Add form

The Edit dialog (`LogModal.tsx`) used to show only the Total row in the
Target Breakdown table and dropped the entire Contribution % per Owner block,
so admins couldn't adjust team-level KPIs after creation without recreating
them.

### What changed

- **`EditFormState`** extended with `ownerIds`, `ownerContributions` (string
  map for live editing), `weeklyOwnerBreakdown`. Seeded from the saved KPI's
  `ownerContributions` + `weeklyOwnerTargets` on mount; legacy KPIs without
  `weeklyOwnerTargets` are auto-seeded from formula via a `useEffect`.
- **Contribution % per Owner block** — same component shape as the Add form:
  per-owner % input, live "Contribution value" preview, "Distribute evenly"
  button, green/amber Total indicator validating `sum == 100 ± 0.5`.
- **Per-owner Target Breakdown rows** — Total row is now editable in team
  scope (edits redistribute by contribution %), and one row per owner appears
  below it with editable per-week cells.
- **Helpers** mirrored from `KPIModal`: `setContribution`,
  `distributeContributionsEvenly`, `setOwnerWeekCell`, `setTeamTotalWeekCell`,
  `computeAllOwnerBreakdowns`. Pulled from shared
  [`kpiModalHelpers.ts`](./app/(dashboard)/kpi/components/kpiModalHelpers.ts).
- **Save payload** — when team scope: `weeklyTargets` is sent as the per-week
  sum of owner cells (so the target-sync helper picks up changes), plus
  `ownerContributions` and `weeklyOwnerTargets` maps.

### Files

| Path | What |
|---|---|
| [`app/(dashboard)/kpi/components/LogModal.tsx`](./app/(dashboard)/kpi/components/LogModal.tsx) | EditTab redesign + handleSave team payload |

---

## 3. Per-owner Individual KPI Name (Add form + Edit form + API)

Each owner's child Individual KPI can now have its own name. Empty input →
child uses the Team KPI name.

### What changed

- **`createKPISchema` + `updateKPISchema`** accept `ownerKpiNames:
  Record<userId, string>` (optional, 1-200 chars per entry).
- **POST `/api/kpi`** — when iterating owners to create children, uses
  `ownerKpiNames[ownerId]?.trim()` as the child name; falls back to
  `validated.name`.
- **PUT `/api/kpi/[id]`** — when `ownerKpiNames` is supplied on a Team KPI
  edit, looks up each child by `(parentKPIId, owner)` and renames it. Empty /
  unchanged entries are skipped.
- **List endpoint** — `kpiListParamsSchema` now accepts `parentKPIId`, and
  the route applies it to the Prisma where clause. Used by the Edit dialog
  to fetch a Team KPI's children with one call.
- **Add form (`KPIModal.tsx`)** — each row in the Contribution % per Owner
  block grew a second line with an "Individual KPI name" text input
  (placeholder = current Team KPI name). Form state extended with
  `ownerKpiNames`. Submit payload includes only non-empty entries.
- **Edit form (`LogModal.tsx`)** — same input rendered under each
  contribution row. On mount, fetches `/api/kpi?parentKPIId=<id>&kpiLevel=individual`
  and seeds `editForm.ownerKpiNames` with each child's current name. Save
  payload includes only non-empty / changed entries.

### Files

| Path | What |
|---|---|
| [`lib/schemas/kpiSchema.ts`](./lib/schemas/kpiSchema.ts) | `ownerKpiNames` on create + update; `parentKPIId` on list |
| [`app/api/kpi/route.ts`](./app/api/kpi/route.ts) | POST applies per-owner names; list applies parentKPIId filter |
| [`app/api/kpi/[id]/route.ts`](./app/api/kpi/[id]/route.ts) | PUT applies child renames |
| [`app/(dashboard)/kpi/components/KPIModal.tsx`](./app/(dashboard)/kpi/components/KPIModal.tsx) | Add form per-owner name input |
| [`app/(dashboard)/kpi/components/LogModal.tsx`](./app/(dashboard)/kpi/components/LogModal.tsx) | Edit form per-owner name input + child fetch on mount |

---

## 4. Dashboard rework — "My Dashboard" tab + 3-stage Team filter

The Dashboard had two tabs: **Individual** (admins saw a Team+Owner filter,
non-admins were auto-scoped to themselves) and **Team** (single team picker).
Replaced with a clearer split: a self-locked tab and a fully-filterable team
view.

### What changed

- **Tab 1 renamed `Individual` → `My Dashboard`** for everyone (admin and
  non-admin). Always scoped to the logged-in user across all sections:
  - KPI: Individual KPIs where `owner === userId` + Team KPIs where
    `userId ∈ ownerIds`.
  - Priorities: `owner === userId`.
  - WWW: `who === userId`.
  - No filter button on this tab. Role-based gating dropped from this file
    (`isAdmin` / `ROLE_HIERARCHY` removed).
- **Tab 2 (`Team`) gets a 3-stage filter** that applies uniformly across
  KPI / Priority / WWW:

  | Filter | Label | Options | Default |
  |---|---|---|---|
  | A | Team | "All Users" + every team name | All Users |
  | B | KPI Type | Individual KPI / Team KPI | Individual KPI |
  | C | Owner | "All Users" + users in scope | All Users |

- **Application rules**: A and C apply to **all three** sections (KPI,
  Priorities, WWW). B only swaps the KPI section between Individual and Team
  level — Priorities/WWW always render and follow A + C.
- **Owner picker (C) auto-resets** when A changes (the user list narrows /
  widens with team scope).
- **WWW section now renders on the Team tab** (was previously gated to
  Individual tab only). Source already respected the filter chain via
  `wwwSource` so no extra plumbing was needed.
- **`DashboardMoreActions`** receives the live filtered `kpis` / `priorities`
  / `wwwItems` so Excel exports reflect the same view the user is looking at.

### Files

| Path | What |
|---|---|
| [`app/(dashboard)/dashboard/page.tsx`](./app/(dashboard)/dashboard/page.tsx) | Whole tab + filter rework. Removed `useFilterContext` `filterTeam`/`filterOwner` references and ROLE_HIERARCHY imports. |

---

## 5. Dashboard KPI table — QTD Goal / Weekly Goal mismatch fix

### Symptom

For a KPI created mid-quarter (target = 1000, weeks 1-4 target = 0):

- **Stats tab** showed QTD Goal = 0, Weekly Goal = "—" (correct).
- **Dashboard KPI table** showed QTD Goal = **1K**, Weekly Goal = **76.92**
  (wrong — this is the full target and the flat 1000/13 split).

### Root cause

[`KPITable.tsx`](./app/(dashboard)/kpi/components/KPITable.tsx) read
`kpi.qtdGoal` raw from the API (which is the stale full-quarter aggregate)
and computed Weekly Goal as `(kpi.qtdGoal ?? kpi.target) / 13`. The
**Stats tab** in [`StatsTab.tsx`](./app/(dashboard)/kpi/components/StatsTab.tsx)
already had a private `computeQtd` that summed `weeklyTargets[1..currentWeek-1]`,
respecting per-week breakdowns and zero-padding for pre-creation weeks.
Two implementations had drifted apart.

### Fix

Extracted the math into shared helpers so both surfaces compute the same way:

- **`computeQtd(kpi, currentWeek)`** in
  [`kpiStats.ts`](./app/(dashboard)/kpi/components/kpiStats.ts):
  - `currentWeek === null` → fall back to `kpi.qtdGoal` / `kpi.qtdAchieved`
    (historical KPIs / past quarters still render).
  - `currentWeek <= 1` → `{ qtdGoal: 0, qtdAchieved: 0 }`.
  - Otherwise: Σ `weeklyTargets[1..currentWeek-1]` (falling back to
    `target/13` only when no breakdown is set), and Σ `weeklyValues` for the
    same range.
- **`weeklyGoalFor(kpi, weekNumber)`** in the same file — returns
  `weeklyTargets[weekNumber]` if set, else `target/13`.
- **`StatsTab.tsx`** — removed the local `computeQtd`, imports the shared one.
- **`KPITable.tsx`** — QTD Goal, QTD Achieved, and Weekly Goal cells now call
  the shared helpers using the `currentWeek` already in scope from
  `useCurrentWeek(year, quarter)`. No styling/color changes — locked-table
  rule respected.

### Files

| Path | What |
|---|---|
| [`app/(dashboard)/kpi/components/kpiStats.ts`](./app/(dashboard)/kpi/components/kpiStats.ts) | New `computeQtd` + `weeklyGoalFor` helpers |
| [`app/(dashboard)/kpi/components/StatsTab.tsx`](./app/(dashboard)/kpi/components/StatsTab.tsx) | Use shared helper, drop private copy |
| [`app/(dashboard)/kpi/components/KPITable.tsx`](./app/(dashboard)/kpi/components/KPITable.tsx) | QTD/Weekly cells call shared helpers |

---

## Verification checklist

After pulling this branch:

1. **Team KPI create** — create a Team KPI with 2 owners at 60/40 split,
   target 1000. Confirm two Individual KPIs appear in `/kpi/individual`,
   each named after the team (or per-owner if you set per-owner names) with
   targets 600 and 400, both showing the `Linked` badge.
2. **Per-owner emails** — both owners receive an email; each one shows their
   own derived target (600 / 400), not the team's 1000.
3. **Weekly value sync** — open the Team KPI's Updates tab, enter a value
   for one owner. Refresh `/kpi/individual`, confirm the matching child KPI
   has the same value. Reverse: edit the child's weekly, confirm the team's
   per-owner row updates.
4. **Target sync** — edit a child's target. Confirm the parent Team KPI's
   `target` becomes the sum of all children, and `ownerContributions` are
   recalculated proportionally.
5. **Edit Team KPI** — open the Edit dialog. Confirm Contribution % per Owner
   block, per-owner Target Breakdown rows, and "Individual KPI name" inputs
   all appear pre-filled with current values.
6. **Dashboard My Dashboard** — log in as a non-admin. Land on My Dashboard;
   confirm only your KPIs / priorities / WWW are visible, no filter button.
7. **Dashboard Team tab** — open Filter, set KPI Type = Team, pick a team.
   Confirm KPI section shows only that team's Team KPIs; Priorities/WWW show
   that team's members' rows. Switch KPI Type to Individual → KPI section
   swaps to that team's individual KPIs; Priorities/WWW stay the same.
8. **Dashboard QTD/Weekly** — for a KPI created mid-quarter, the dashboard
   table's QTD Goal and Weekly Goal columns now match what the Stats tab
   shows (0 and "—" respectively for weeks 1-4 if those targets are 0).
