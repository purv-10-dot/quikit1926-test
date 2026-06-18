# Executive Productivity Dashboard — complete reference

A week-over-week productivity dashboard for company leadership. Answers: *how productive is the company this week vs. last? Which departments are improving and which are slipping? Who's overloaded? Who's our top performers? Where are tasks getting stuck?*

Source code:

| Layer | File |
|---|---|
| Page route | [`apps/quiktrack/app/(dashboard)/reports/executive/page.tsx`](../app/(dashboard)/reports/executive/page.tsx) |
| Main API | [`apps/quiktrack/app/api/reports/executive/route.ts`](../app/api/reports/executive/route.ts) |
| Saved-views API | [`apps/quiktrack/app/api/reports/views/route.ts`](../app/api/reports/views/route.ts), [`[id]/route.ts`](../app/api/reports/views/[id]/route.ts) |
| Productivity engine | [`apps/quiktrack/lib/reports/productivity.ts`](../lib/reports/productivity.ts) |
| Date math (presets) | [`apps/quiktrack/lib/reports/ranges.ts`](../lib/reports/ranges.ts) |
| ISO-week helpers | [`apps/quiktrack/lib/reports/weekly.ts`](../lib/reports/weekly.ts) |
| Page shell + state | [`apps/quiktrack/components/reports/executive/executive-report.tsx`](../components/reports/executive/executive-report.tsx) |
| Filter toolbar | [`apps/quiktrack/components/reports/executive/executive-toolbar.tsx`](../components/reports/executive/executive-toolbar.tsx) |
| KPI strip | [`apps/quiktrack/components/reports/executive/executive-kpi-strip.tsx`](../components/reports/executive/executive-kpi-strip.tsx) |
| Weekly trend | [`apps/quiktrack/components/reports/executive/weekly-trend-chart.tsx`](../components/reports/executive/weekly-trend-chart.tsx) |
| Productivity by Department | [`apps/quiktrack/components/reports/executive/team-productivity-bar.tsx`](../components/reports/executive/team-productivity-bar.tsx) |
| Department Heatmap | [`apps/quiktrack/components/reports/executive/team-heatmap.tsx`](../components/reports/executive/team-heatmap.tsx) |
| Slipping Tasks Trend | [`apps/quiktrack/components/reports/executive/slipping-tasks-chart.tsx`](../components/reports/executive/slipping-tasks-chart.tsx) |
| Workload vs Productivity | [`apps/quiktrack/components/reports/executive/workload-scatter.tsx`](../components/reports/executive/workload-scatter.tsx) |
| Top Employees | [`apps/quiktrack/components/reports/executive/top-employees-table.tsx`](../components/reports/executive/top-employees-table.tsx) |
| Saved-views menu | [`apps/quiktrack/components/reports/executive/saved-views-menu.tsx`](../components/reports/executive/saved-views-menu.tsx) |
| Shared types | [`apps/quiktrack/components/reports/executive/types.ts`](../components/reports/executive/types.ts) |
| Persistence | `QtReportView` Prisma model in `packages/database/prisma/schema.prisma` (schema `app_quiktrack`) |

Tests:

| Layer | File |
|---|---|
| Productivity engine (pure unit) | [`apps/quiktrack/__tests__/unit/productivity.test.ts`](../__tests__/unit/productivity.test.ts) |
| API integration | [`apps/quiktrack/__tests__/api/reports-executive.test.ts`](../__tests__/api/reports-executive.test.ts) |
| Saved-views CRUD | [`apps/quiktrack/__tests__/api/reports-views.test.ts`](../__tests__/api/reports-views.test.ts) |

---

## 1. Who can see it

| Surface | Gate |
|---|---|
| Page | `<RequirePerm resource="Report" action="view">` — anyone whose role grants the `Report:view` permission |
| API | `withOrgAuth` — authenticated org member only; **non-admin callers are scoped to the projects they belong to** (via `QtProjectMember`) |
| Saved views | Authenticated org member; each view is private to its `userId` (admins do NOT see other users' saved views) |

A non-admin user who has zero `QtProjectMember` rows gets a fully-shaped empty response (zero counts, empty arrays). No DB issue queries fire in that case.

---

## 2. The productivity score

The dashboard's headline metric is a composite **productivity score** (0–100, integer) blended from four signals we already capture in the schema. Defined in [`lib/reports/productivity.ts`](../lib/reports/productivity.ts) and unit-tested in [`__tests__/unit/productivity.test.ts`](../__tests__/unit/productivity.test.ts).

### 2.1 Formula

```
productivity = 100 × clamp(
    0.45 × completion       // closed / created
  + 0.25 × onTime           // closedOnTime / closed (collapses to 1 if no data)
  + 0.20 × (1 - slipRate)   // 1 - slipped / max(created, 1)
  + 0.10 × hoursTerm        // 1 - max(0, (actual - est) / est)  ; clamps to [0, 1]
)
```

Each input is clamped to `[0, 1]` before being weighted. The final sum is clamped to `[0, 1]` and multiplied by 100, then rounded to an integer.

### 2.2 Why these weights

- **Completion (45%) is dominant.** "Are we actually finishing what we started?" is the strongest signal of productivity health.
- **On-time delivery (25%)** is the next-most-important — finishing-but-late still hurts. Collapses to a neutral 1.0 when `closedOnTime` data isn't available, so missing due dates don't drag scores down.
- **Slip rate (20%)** penalizes work that's blowing past its due date and *still open*.
- **Hours variance (10%)** is intentionally a soft penalty. Bad estimates shouldn't drown out a team that's still delivering.

### 2.3 Edge cases

| Input | Output | Why |
|---|---|---|
| All zeros (no activity) | **0** | Explicit short-circuit at the top of `calculateProductivity` |
| 10 created, 0 closed, 0 slipped | **55** | 0.45×0 + 0.25×1 + 0.20×1 + 0.10×1 = 0.55. The onTime/slip/hours terms all collapse to 1 in absence of data. |
| 10 created, 10 closed all on time, no slips, on-budget | **100** | Every term saturates |
| `estHours = 0` | hoursTerm = **1** | No estimate to compare against — don't penalize |
| `actualHours < estHours` | hoursTerm = **1** | Under-budget is a planning win, not a penalty |
| `closed = 0` and `closedOnTime` is provided as 0 | onTime = **1** | Avoids 0/0 = NaN. The term collapses gracefully. |
| `closedOnTime = null` | onTime = **1** | Caller signals "no due-date data" — collapses to neutral. |
| `slipped > created` (data quality edge) | slip-penalty capped at 0 | Caused when a task's `dueDate` falls in this window but it was created earlier — surface the raw rate honestly without breaking the score. |

### 2.4 Week-over-week deltas (the dashboard's only comparison)

The dashboard's headline framing is **always week-over-week**, regardless of how long the selected range is. Comparison is derived from the **last two ISO weeks of the current range** — not from a parallel "previous period" query. This is what makes the deltas meaningful when the user picks "June 2026" (a month), "Q2 2026" (a quarter), or "Last 90 days": the chart shows weekly buckets within the range, and the WoW summary diffs the most recent two of those buckets.

Computed by `computeWeekOverWeek({ weeks, productivity, created, closed, slipped })` in [`route.ts`](../app/api/reports/executive/route.ts).

**Algorithm**

```text
Let n = number of ISO weeks in the resolved range.
If n < 2:
    available = false → KPI cards show "Not enough data"
Else:
    thisWeek = (productivity[n-1], closed[n-1], slipped[n-1])
    lastWeek = (productivity[n-2], closed[n-2], slipped[n-2])
    delta.productivity = thisWeek.productivity - lastWeek.productivity      (pp)
    delta.closedAbs    = thisWeek.closed - lastWeek.closed                  (count)
    delta.closedPct    = round((closedAbs / lastWeek.closed) * 100)         (% — null when lastWeek.closed = 0)
    delta.slippedAbs   = thisWeek.slipped - lastWeek.slipped
    delta.delayedPct   = thisWeekDelayed% - lastWeekDelayed%                (pp)
    thisWeekLabel = weeks[n-1].weekLabel
    lastWeekLabel = weeks[n-2].weekLabel
```

**Examples**

| Selected range | Weeks in range | Compared |
|---|---|---|
| `this-week` | 1 | `available = false` (only one week — no prior to diff) |
| `last-week` | 1 | `available = false` |
| `this-month` (June 2026) | 4 or 5 ISO weeks | last week of June vs the week before |
| `this-quarter` (Q2 2026) | 13 | week 13 vs week 12 of the quarter |
| `this-year` (YTD) | 22+ | most recent week vs the week before |
| `custom` 2024-06-03 → 2024-06-16 | 2 | week of Jun 10 vs week of Jun 3 |

**How the delta renders**

The KPI cards and trend-chart subtitle render the delta with one of three indicators based on sign:

| Sign | Icon | Color (light / dark) | Meaning |
|---|---|---|---|
| `delta > 0` | `↑` (ArrowUp) | emerald-600 / emerald-400 (good) OR red-600 / red-400 (bad, for "Delayed Tasks" where higher is worse) | Improvement vs last week |
| `delta < 0` | `↓` (ArrowDown) | red / emerald (inverse of above) | Regression vs last week |
| `delta = 0` | `−` (Minus / "=") | **gray-500 / gray-400 (neutral)** | No change vs last week — neither up nor down |
| `delta = null` | `−` (Minus) | gray | Range has < 2 ISO weeks; "Not enough data" label |

Crucially **zero is never rendered with an up or down arrow** — that would falsely suggest direction. A flat week reads as a flat horizontal line ("=") in neutral gray, which is honest.

**Units**

- Productivity delta: percentage points (suffix `" pp"` in the chart subtitle, just `%` on the KPI card)
- Tasks Completed delta: `closedPct` — percentage change vs last week's count (null when last week = 0)
- Avg Velocity delta: raw task-count delta (suffix `" tasks"`)
- Delayed Tasks delta: percentage points

**Why this design (and not "previous-period overlay")**

The original report had a dashed previous-period overlay on the trend chart (e.g. June 2026 + dashed May 2026). It answered a *different* question: "is this month better than last month?" The exec dashboard's job is the simpler, more immediate "is this week better than the week before?" — which holds regardless of how wide a window the user is browsing. Picking a long range now just gives more weekly context around the latest WoW result; the comparison itself stays weekly.

The wire format still accepts `compareMode=previous-period` / `previous-year` and the API still returns a `previous` block for those calls (for external/saved-view back-compat), but the dashboard UI ignores it.

### 2.5 Supporting helpers

- `averageVelocity(closedSeries)` — average closed tasks per week, rounded to 1 decimal. Returns 0 for empty series.
- `delayedRate(created, slipped)` — `round(slipped/created × 100)`. Returns 0 when `created == 0`.
- `productivityTone(score)` — maps 80+→`high`, 60–79→`medium`, <60→`low`. Used by the heatmap and Top Employees row colors.

---

## 3. The date model

Every metric is computed against a `[from, to)` range where `from` is inclusive and `to` is exclusive (UTC midnight on both ends). The range is broken into **ISO weeks** (Monday-start, UTC) for all time-series charts.

### 3.1 "Now" and time zones

- All dates are computed in **UTC**. The server's local TZ and the browser TZ don't affect bucket boundaries.
- "Today" = `new Date()` on the server. Client-side preset labels use the browser clock, but the authoritative range always comes from the server response.
- Rationale: a user in IST opening the report at 1 AM Monday should see the same "this week" as a colleague in PST who opens it 13 hours earlier.

### 3.2 ISO weeks

```ts
// apps/quiktrack/lib/reports/weekly.ts
export function startOfISOWeek(d: Date): Date {
  const dt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = dt.getUTCDay();                  // 0 = Sun, 1 = Mon, ... 6 = Sat
  const offset = day === 0 ? -6 : 1 - day;     // shift to Monday
  dt.setUTCDate(dt.getUTCDate() + offset);
  return dt;
}
```

### 3.3 Range presets

| Preset | `from` | `to` |
|---|---|---|
| `this-week` | `startOfISOWeek(N)` | `from + 7 days` |
| `last-week` | `startOfISOWeek(N) - 7 days` | `startOfISOWeek(N)` |
| `this-month` | `UTC(year(N), month(N), 1)` | `from + 1 month` |
| `last-month` | `startOfMonth(N) - 1 month` | `startOfMonth(N)` |
| `this-quarter` | first day of fiscal quarter containing `N` | `from + 3 months` |
| `last-quarter` | `thisQuarter.from - 3 months` | `thisQuarter.from` |
| `this-year` | `UTC(year(N), 0, 1)` | `from + 1 year` |
| `last-year` | `startOfYear(N) - 1 year` | `startOfYear(N)` |
| `ytd` | `UTC(year(N), 0, 1)` | day after `N` (00:00 UTC) |
| `last-30/90/180/365` | `(N+1d) - N days` | day after `N` |
| `specific-quarter(year, q)` | first day of fiscal Q`q` of `year` | `from + 3 months` |
| `specific-month(year, m)` | `UTC(year, m-1, 1)` | `from + 1 month` |
| `specific-year(year)` | `UTC(year, 0, 1)` | `UTC(year+1, 0, 1)` |
| `custom(from, to)` | `parseUTC(from)` | `parseUTC(to) + 1 day` |

`custom` adds +1 day to `to` server-side so a user who picks `from=2024-01-15` and `to=2024-02-15` gets both endpoints **inclusive**.

### 3.4 Fiscal year (`Org.quarterStartMonth`)

Each org configures when its fiscal year starts (1–12, default 1 = January). The executive API reads it once per request and threads it into `resolveRange`.

**Example — org with FY starting April (`quarterStartMonth = 4`)**:

| Quarter | Months |
|---|---|
| Q1 | April, May, June |
| Q2 | July, August, September |
| Q3 | October, November, December |
| Q4 | January, February, March (next calendar year) |

"This quarter" on 2026-05-29 with `quarterStartMonth=4` resolves to `[2026-04-01, 2026-07-01)` labeled `Q1 2026 (FY)`. The `(FY)` suffix only appears for non-January fiscal years.

### 3.5 Comparison ranges (`compareMode`)

| Mode | `compare.from` | `compare.to` | Label format |
|---|---|---|---|
| `none` | — | — | — |
| `previous-period` | `range.from - (range.to - range.from)` | `range.from` | `"Previous period"` |
| `previous-year` | `range.from - 1 year` | `range.to - 1 year` | `"Same period in YYYY"` |

When `compareMode ≠ none`, a parallel set of three issue queries fires for the compare range. The previous-period series is drawn as a **dashed gray line** on the trend chart, and the four KPI cards each show a delta vs. the compare period.

> Defaults to **`previous-period`** in the toolbar (more useful out-of-the-box than no comparison).

---

## 4. Department concept

The "Department" axis in this report is sourced from **`QtProjectRole`** — the per-project roles like Developer, PM, QA, Project Admin, Viewer. Schema:

```prisma
model QtProjectRole {
  id        String   @id @default(cuid())
  orgId     String
  projectId String
  name      String
  // ...
}

model QtProjectUserRole {
  projectId     String
  userId        String
  projectRoleId String
  // ...
}
```

### 4.1 Cross-project dedup

Each project has its own copy of "Developer", "PM" etc. The dashboard groups by **lowercased role name** so the same label across projects collapses to one row:

- `Developer` (project A) + `developer` (project B) + `Developer` (project C) → one "Developer" entry
- A user who is "Developer" in two projects appears once in the heatmap, under the first role we encounter (best-effort grouping)

The de-dup happens in `dedupeDepartmentOptions()` at the bottom of `route.ts`.

### 4.2 Filtering by department

The toolbar dropdown is labeled **All Departments**. When you pick e.g. "QA", the API:

1. Resolves the role name to userIds via `QtProjectUserRole` (case-insensitive match on the role name, scoped to the user's visible projects).
2. Intersects with any explicit `assigneeIds` filter.
3. Applies the resulting userId set as `assigneeId IN (...)` on every issue query.

If the resolved userId set is **empty** (e.g. nobody is in "Viewer" yet), the API returns a fully-shaped empty response — including the **full dropdown options list** — so the dropdown stays usable. This is a deliberate design choice; see `emptyResponse(range, departmentOptions)` in `route.ts`.

The filter param on the wire is still called `teamIds` for backward compatibility with saved views, but it now carries role-name strings (case-insensitive). Internal aggregation maps keep the `team*` naming for the same reason.

### 4.3 Heatmap completeness

The **Department Productivity Heatmap** intentionally shows **every** department known to the org — even ones with no activity in the range. A "silent" department appears as a row of `—` cells. Rationale: leadership wants to spot teams that are *quiet*, not just teams that are *contributing*. The previous filter (`r.cells.some(c => c.productivity !== null)`) was removed for this reason.

---

## 5. Metric definitions

All metrics are computed from `QtIssue` (the task table) and `QtTimesheetEntry`. The base filter applied to every query is:

```ts
const baseIssueWhere = {
  orgId,                            // tenant scope — always
  isDeleted: false,                 // exclude soft-deleted
  ...projectScope,                  // user's visible projects OR explicit filter
  ...assigneeScope,                 // explicit + department-resolved userIds
  ...sprintScope,                   // explicit sprint filter
};
```

### 5.1 Tasks created

Bucketed by `QtIssue.createdAt`:

```ts
db.qtIssue.findMany({
  where: { ...baseIssueWhere, createdAt: { gte: range.from, lt: range.to } },
});
```

### 5.2 Tasks closed

Bucketed by `QtIssue.updatedAt`, filtered to `status.category = 'DONE'`:

```ts
db.qtIssue.findMany({
  where: {
    ...baseIssueWhere,
    updatedAt: { gte: range.from, lt: range.to },
    status: { category: "DONE" },
  },
});
```

> ⚠️ **Known proxy.** We don't have a `closedAt` column on `QtIssue` yet, so we use `updatedAt`. If a closed task is edited later, its bucket shifts to the edit week, not the close week. Acceptable for trends; see §11.

### 5.3 Closed-on-time (per assignee)

For each closed task, if `dueDate != null` **and** `updatedAt <= dueDate`, increment `closedOnTime[assigneeId]` for that week. Drives:

- The on-time rate column in the Top Employees table.
- The `onTime` term of the productivity formula (per-employee and per-department aggregates).

### 5.4 Slipped tasks (the "slip" rule)

A task is counted as **slipped in week W** if:

- `dueDate` falls inside week W, AND
- `status.category != 'DONE'`, AND
- the task is not deleted

```ts
db.qtIssue.findMany({
  where: {
    ...baseIssueWhere,
    dueDate: { gte: range.from, lt: range.to },
    status: { category: { not: "DONE" } },
  },
});
```

Tasks without `dueDate` are never counted as slipped. Tasks closed *after* their due date are not slipped because their status is now DONE.

### 5.5 Blocked tasks (best-effort proxy)

A task is counted as **blocked in week W** if:

- `updatedAt` falls in week W, AND
- `status.category != 'DONE'`, AND
- `status.name` contains the substring `block` (case-insensitive)

This catches custom statuses like "Blocked", "Blocked by Vendor", "Blocked - awaiting review". It is a proxy — accuracy depends on org status naming. Used as the second area on the Slipping Tasks Trend chart.

### 5.6 Hours estimated vs. logged

- **Estimated hours** — sum of `QtIssue.eta` for tasks created in the range.
- **Logged hours** — sum of `QtTimesheetEntry.hours` where `entryDate ∈ [from, to)`.

Both flow into the productivity formula's `hoursTerm` and into the Workload scatter's per-employee `hoursLogged`.

### 5.7 Workload normalization

The Workload vs. Productivity scatter shows each user as a bubble where:

- **X-axis = workload %** = `round(user.hoursLogged / orgMedianHours × 100)`. The median user is 100% by definition. Users with hours but no median (only one user) clamp to 100%.
- **Y-axis = productivity %** = the per-user composite score.
- **Bubble size = tasks closed** (Z-axis, range 60–220 px²).
- Users with no logged hours **and** no closed tasks are excluded.

### 5.8 Top Employees

Per-user aggregation across the range:

- `productivity` — full composite score (uses real `closedOnTime` data per user)
- `tasksClosed` — count of issues closed
- `onTimeRate` — `round(closedOnTime / closed × 100)`
- `trend` — weekly productivity series for the sparkline

Filtered to users who had any closed task OR any logged hour. Sorted by `productivity` descending. **Top 10** kept.

---

## 6. The charts and their interactions

### 6.1 KPI strip (4 cards)

All deltas read from `data.weekOverWeek.delta` (see §2.4). Each card's delta label is `"<thisWeekLabel> vs <lastWeekLabel>"`, e.g. `"Jun 10 vs Jun 3"`. When `weekOverWeek.available` is false (range has < 2 ISO weeks), the delta line collapses to "Not enough data".

| Card | Big number | Delta source | Sparkline | Tone |
|---|---|---|---|---|
| Overall Productivity | `summary.productivity %` | `delta.productivity` (percentage points) | `series.productivity` | Violet |
| Tasks Completed | `summary.totalClosed` (comma-formatted) | `delta.closedPct` (% vs last week — null when last-week count = 0) | `series.closed` | Blue |
| Avg Velocity | `summary.velocity` + "tasks / week" hint | `delta.closedAbs` (raw task-count delta, suffixed " tasks") | `series.closed` | Emerald |
| Delayed Tasks | `summary.delayedPct %` | `delta.delayedPct` (percentage points; lower is better) | `series.slipped` | Orange |

Each card's delta arrow is green when the change is "good" (up for productivity/completed/velocity, down for delayed) and red otherwise.

### 6.2 Productivity by Week (trend chart)

Single-series Recharts `LineChart`:

- **Weekly productivity** (violet, 2.5px solid) — `series.productivity`

The previous dashed previous-period overlay was removed — the chart's job is to show how each week's score compares to the others within the range, and the WoW summary on top of the card (e.g. *"Jun 10 vs Jun 3 ↑ 8%"*) makes the headline delta explicit. Y-axis is `[0, 100]` with a `%` formatter; X-axis is week labels.

### 6.3 Productivity by Department (horizontal bar list)

Sorted by `productivity` descending. Each row shows:

- Department name (truncated)
- Bar (max-width = card width minus name + value columns)
- `productivity %` value
- Δ vs. previous period (arrow + percentage points)

Bars use a fixed 8-color palette so adjacent rows are visually distinct.

### 6.4 Department Productivity Heatmap

Sticky-left department column + last-5-weeks columns (newest on the right). Cell color from `productivityTone`:

| Score | Cell |
|---|---|
| ≥ 80 | emerald (`bg-emerald-500/85`, white text) |
| 60–79 | amber (`bg-amber-400/85`, white text) |
| < 60 | red (`bg-red-500/85`, white text) |
| no data | gray placeholder, `—` |

Clicking a cell opens a 4-tile drill-in panel showing Productivity, Created, Closed, and Open for that department × week.

### 6.5 Slipping Tasks Trend

Recharts `AreaChart`. Mode dropdown lets the viewer switch between:

- **All Tasks** — overlays both Slipped (red) and Blocked (amber) areas
- **Slipped only** — red only
- **Blocked only** — amber only

Y-axis is `% of Tasks` — each week's value is `(slipped_or_blocked / totalCreated) × 100`. Tooltip shows the underlying task counts.

### 6.6 Workload vs. Productivity (scatter)

Recharts `ScatterChart`. See §5.7 for axis math. Quadrant labels are pinned to the chart's data area (not the card) so they read cleanly without overlapping the axis ticks:

- Top-left (low workload, high productivity) — blue, "high productivity / low workload"
- Top-right (high workload, high productivity) — amber, "high productivity / high workload"
- Bottom-left (low workload, low productivity) — light blue, underutilized
- Bottom-right (high workload, low productivity) — red, **overloaded**

`ReferenceLine` markers at x=100 (median workload) and y=50 (productivity midpoint) split the quadrants.

### 6.7 Top Employees by Productivity

Sortable table (default sort: productivity descending). Columns:

- Employee (avatar + name)
- Department (first project-role name, or `—`)
- Productivity (colored value: emerald ≥80, amber 60–79, red <60)
- Tasks Completed
- On-time Rate
- Trend (WoW) — sparkline + delta pill

Avatars fall back to two-letter initials in a violet circle when `user.avatar` is null.

---

## 7. The toolbar

Sticky filter bar (`sticky top-0 z-20`) above the dashboard:

```
[ 📅 Date range ▼ ] | [ All Departments ] [ All Projects ] [ All Sprints ] [ All Employees ] | [ Reset ] [ Save view ]
```

There is **one** time-related control — the date range picker. No separate "Compare with" dropdown, no chip on the range button, no footer inside the popover. The dashboard always compares week-over-week (last vs prior ISO week of the current range — see §2.4), so there is nothing for the user to configure.

### 7.1 Date range picker

The trigger button shows only the selected range:

```
[ 📅 June 2026 ▼ ]
[ 📅 This Week ▼ ]
[ 📅 Q2 2026   ▼ ]
```

Click to open the popover.

**Range presets** (scroll area, ~55vh max-height):

- **This / Last** — This week, Last week, This month, Last month, This quarter, Last quarter, This year, Last year, Year to date
- **Rolling window** — Last 30 / 90 / 180 days, Last 12 months
- **Specific period** — Specific quarter…, Specific month…, Specific year…, Custom date range…

The four `Specific…` options expand an inline config panel (year + quarter/month selectors, or two date inputs) immediately below the list.

**Where the comparison surfaces in the UI**

The "what's being compared" answer is shown **in the trend chart card title** and **in each KPI card's delta line** — not in the toolbar. Both read from `data.weekOverWeek` (see §2.4) and label the comparison like `"Jun 10 vs Jun 3"`, derived from the actual ISO-week labels of the last two buckets.

### 7.2 Department / Project / Sprint / Employee filters

All four are single-select for now. The user picks an option and every widget refreshes. Filters compose: picking a Department narrows the Employee dropdown's effective scope (under the hood, since both ultimately resolve to userIds).

`Reset` snaps back to `DEFAULT_FILTERS` (`last-90` + `previous-period`, all other filters cleared).

`Save view` opens a modal that saves the current filter state to `QtReportView`.

### 7.3 Why there's no compare control at all

The dashboard exists to answer one question — "is the company improving week over week?" — so the comparison axis is **always weekly** and **always derived from the data we already have** (the last two ISO weeks of whatever range is on screen, see §2.4).

Three earlier designs were tried and rejected:

1. **Two side-by-side dropdowns** (date range + compare mode). Confusing because the two controls are semantically coupled — "compare to *what*" only makes sense in the context of a chosen range — but visually read as independent filters.
2. **Compare folded into the range popover as a segmented control.** Better, but still asked the user to make a choice the dashboard didn't actually need; "Month over Month" when the range was a month was always the right answer, so why expose it.
3. **Compare locked but shown as an inline chip + popover footer.** The chip and footer were just restating what the date label already implied; they added pixels without information.

Final design: no compare UI in the toolbar. The trend chart card title and each KPI delta line carry the comparison label (`"<thisWeek> vs <lastWeek>"`). The user changes the comparison by picking a different range — that's the only lever.

**Migration safety**

`normalizeFilters()` in [`types.ts`](../components/reports/executive/types.ts) forces `compareMode = "none"` for any saved view or URL param. The API still accepts `compareMode=previous-period` / `previous-year` on the wire and returns a `previous` block for those calls (back-compat for external tooling), but the dashboard UI never sends those values and never reads from `data.previous`.

---

## 8. API surface

### 8.1 `GET /api/reports/executive`

**Query params**

| Name | Type | Description |
|---|---|---|
| `preset` | enum | Range preset (see §3.3). Default `last-90`. |
| `year`, `quarter`, `month` | int | Anchors for `specific-*` presets. |
| `from`, `to` | YYYY-MM-DD | For `custom` (server adds +1 day to `to`). |
| `compareMode` | enum | `none` (default), `previous-period`, `previous-year`. |
| `projectIds` | csv | Project IDs. Non-admin callers are silently intersected with their `QtProjectMember` set. |
| `assigneeIds` | csv | User IDs to filter to. |
| `teamIds` | csv | **Department role names** (case-insensitive). Wire-format kept for back-compat. |
| `sprintIds` | csv | Sprint IDs. |
| `weeksBack` | int | **Legacy.** When neither `preset` nor `from` is set, treated as a rolling N×7-day window. |

**Response — success**

```json
{
  "success": true,
  "data": {
    "range": { "from": "2024-04-01", "to": "2024-07-01", "label": "Q2 2024" },
    "weeks": [{ "weekStart": "2024-04-01", "weekLabel": "Apr 1" }, ...],
    "series": {
      "productivity": [62, 71, 80, ...],
      "created":      [3, 5, 2, ...],
      "closed":       [1, 4, 2, ...],
      "slipped":      [0, 1, 0, ...],
      "blocked":      [0, 0, 1, ...],
      "estHours":     [12, 18, 8, ...],
      "actualHours":  [15, 22, 10, ...]
    },
    "slipping": [
      { "weekStart": "2024-04-01", "weekLabel": "Apr 1", "slipped": 0, "blocked": 0 }, ...
    ],
    "teams": [
      { "teamId": "developer", "teamName": "Developer", "productivity": 78, "delta": null, "created": 12, "closed": 9 }
    ],
    "teamHeatmap": [
      { "teamId": "developer", "teamName": "Developer", "avgScore": 78,
        "cells": [{ "weekIdx": 0, "productivity": 80, "created": 3, "closed": 2 }, ...] }
    ],
    "workload": [
      { "userId": "u_1", "name": "Aisha Khan", "workload": 110, "productivity": 86,
        "hoursLogged": 32.5, "tasksClosed": 8 }
    ],
    "employees": [
      { "userId": "u_1", "name": "Aisha Khan", "avatar": "https://...",
        "teamName": "Developer", "productivity": 86, "tasksClosed": 8,
        "onTimeRate": 92, "trend": [70, 75, 86, ...], "delta": null }
    ],
    "summary": {
      "productivity": 74, "totalCreated": 87, "totalClosed": 71,
      "totalSlipped": 4, "closedPct": 82, "velocity": 17.7, "delayedPct": 5,
      "estHours": 142.5, "actualHours": 156.0
    },
    "previous": {
      "weeks": [...],
      "series": { "productivity": [...], "created": [...], "closed": [...], "slipped": [...] },
      "summary": { "productivity": 68, "totalCreated": 80, "totalClosed": 65,
                   "totalSlipped": 3, "closedPct": 81, "velocity": 16.2, "delayedPct": 4 },
      "label": "Previous period"
    },
    "projects": [{ "id": "p_1", "name": "Atlas", "color": "#2563eb", "projectKey": "ATL" }],
    "teamOptions": [{ "id": "developer", "label": "Developer" }, ...],
    "sprintOptions": [{ "id": "s_1", "label": "Sprint 12" }, ...]
  }
}
```

**Error responses**

| Status | Body | When |
|---|---|---|
| 401 | `{ success: false, error: "Unauthorized" }` | No session |
| 403 | `{ success: false, error: "No active membership" }` | Authenticated but no `OrgMember` |
| 500 | `{ success: false, error: "..." }` | Unhandled error |

### 8.2 Saved-views endpoints

| Method + path | Purpose |
|---|---|
| `GET /api/reports/views` | List the caller's saved views |
| `POST /api/reports/views` | Create a saved view (returns 201). Limit: 25 per user. |
| `GET /api/reports/views/[id]` | Read one |
| `PATCH /api/reports/views/[id]` | Update (rename, repin) |
| `DELETE /api/reports/views/[id]` | Delete |

All CRUD enforces `userId == caller.userId AND orgId == caller.orgId`. A view owned by someone else returns 404 (not 403, to avoid leaking existence).

---

## 9. Saved views — persistence

```prisma
model QtReportView {
  id          String   @id @default(cuid())
  orgId       String
  userId      String
  kind        String   @default("executive")
  name        String
  filtersJson Json
  isPinned    Boolean  @default(false)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  // ...
  @@index([orgId, userId, kind])
}
```

- **Private per user.** Two admins of the same org do NOT see each other's views.
- **Auto-applied pinned view.** On page load, the first pinned view (oldest `updatedAt` tiebreak) is applied. Otherwise default range is `last-90 + previous-period`.
- **Forward-compat blob.** `filtersJson` is `Json`; the UI's `normalizeFilters()` upgrades legacy shapes (old `weeksBack`-style blobs) on load.
- **Cascade on org delete.** Saved views vanish with the org.

---

## 10. CSV export

The "Export" button downloads a flat per-week table:

```
Week, Productivity %, Created, Closed, Slipped, Blocked, Estimated hours, Logged hours
2024-04-01, 62, 3, 1, 0, 0, 12, 15
2024-04-08, 71, 5, 4, 1, 0, 18, 22
...
```

Filename: `productivity-report-{from}-to-{to}.csv`. `Week` is the Monday of the ISO week (UTC). The CSV is the time-series flow only — department, workload, employee, and heatmap data are not included.

---

## 11. Known limitations

| # | Limitation | Why | Fix path |
|---|---|---|---|
| 1 | Closed-by-week uses `updatedAt` as a proxy for `closedAt` | No `closedAt` column yet | Add `closedAt DateTime?` + migration; backfill once |
| 2 | "Slipped" only counts tasks with a `dueDate` set | Tasks without a due date have no slip semantics | Require due dates at creation (process change) |
| 3 | "Blocked" is a substring match on `status.name` | We don't model "blocked" as a first-class flag | Add `QtIssueStatus.isBlocked Boolean` or use a tag system |
| 4 | A user with multiple project roles is grouped under the first one | Heatmap is single-row-per-department | Add an "All Roles" expanded view per employee |
| 5 | Workload normalization clamps when only one user has hours | Median of singleton = the value itself | Acceptable; the scatter has limited meaning at n=1 |
| 6 | Time variance assumes one estimate per task (`QtIssue.eta`) | No estimate-change history | Track via `QtIssueHistory` to surface scope creep separately |
| 7 | Heatmap shows last 5 weeks only (regardless of range length) | Visual budget on the card | Make column count proportional to range, or expose as a setting |
| 8 | No AI Insights panel | QuikTrack not yet integrated with `@quikit/ai-sdk` | Wire up once AI Runtime is available (see app-level `CLAUDE.md` §AI) |
| 9 | "Top Employees" caps at 10 | Visual budget | Add pagination or "View All" drawer |

---

## 12. Backward compatibility (legacy `weeksBack`)

Old saved views stored `{ weeksBack: 12, compareToPrevious: false }`. On load, `normalizeFilters()` upgrades them:

| Legacy `weeksBack` | New `rangePreset` |
|---|---|
| 1–7 | `last-30` |
| 8–13 | `last-90` |
| 14–27 | `last-180` |
| 28+ | `last-365` |

`compareToPrevious: true` → `compareMode: "previous-period"`. The legacy URL form `?weeksBack=N` is also still accepted by the API (mapped to a rolling N×7-day window via `parseRangeFromUrl`).

---

## 13. Tests — what we cover

Unit (`__tests__/unit/productivity.test.ts` — 22 tests):

- Empty / degenerate inputs (0 of everything, all created none closed, all closed on time)
- NaN / Infinity safety when est=0, closed=0
- Final score clamps to `[0, 100]` integer band
- Slip-rate penalization is monotonic
- On-time term collapses to 1 when `closedOnTime` is null
- Hours variance: under-budget doesn't penalize, half-over < on-budget < double-over
- Catastrophic overage still produces ≥ 0 score
- Weight invariants: weights sum to 1, completion is dominant
- `averageVelocity` rounding, empty series
- `delayedRate` zero-division safety, raw-rate even when slipped > created
- `productivityTone` band edges (80, 60, 0)

API (`__tests__/api/reports-executive.test.ts` — 35 tests):

- Auth: 401 unauthenticated
- Tenant scoping: orgId stamped on every issue/timesheet/project/sprint/role query, non-admin scoped to `QtProjectMember`, project filter intersected with visible projects
- Range resolution: every preset (last-30, specific-quarter, specific-month, custom), fiscal-year offset, compare-mode label format ("Same period in YYYY"), legacy `weeksBack` fallback
- Response shape: every key the dashboard consumes is present, series arrays all match `weeks.length`
- Productivity: `totalCreated`/`totalClosed`/`closedPct` end-to-end, `velocity = 0` for empty series, `productivity = 0` for no activity
- Department filter: dedup across projects (case-insensitive), case-insensitive lookup, zero-match preserves dropdown options
- Heatmap completeness: silent departments still appear as full rows of `—`
- Sprint filter applied to issue queries; sprint options returned in response
- Blocked tasks: dedicated query exists with `status.name contains 'block'`
- Workload: empty when no activity, normalizes around median (10/20/30 → 50/100/150 %)
- Top Employees: caps at 10, sorted by productivity desc, name = "First Last" or email fallback
- On-time rate: 1 of 2 closed on time → 50%
- Department roll-up: users into their first project role
- **Week-over-week**: delta computed from the last 2 ISO weeks of the range (2 vs 5 closed → +3 absolute, +150 %); `available = false` when range has < 2 weeks; both week labels included so UI can render `"Jun 10 vs Jun 3"`

To run:

```bash
cd apps/quiktrack
npx vitest run __tests__/unit/productivity.test.ts __tests__/api/reports-executive.test.ts
```

> ⚠️ The wider repo `vitest run` will surface 6 pre-existing failures in `projects.test.ts`, `issues.test.ts`, and `issue-detail.test.ts` (none touch the executive report). These were already broken before the alias fix unblocked the test runner.

---

## 14. Quick reference — "when X happens, where is it computed?"

| Question | Answer |
|---|---|
| What's "this quarter" with FY starting April? | `lib/reports/ranges.ts` → `quarterContaining()` |
| Why is a task counted as overdue in week W? | `route.ts` → slipped-issues query (`dueDate ∈ W AND status.category ≠ DONE`) |
| Why is a task counted as blocked? | `route.ts` → blocked-issues query (status.name contains "block", case-insensitive) |
| Why is the productivity score 55 with 10 created and 0 closed? | `productivity.ts` — on-time/slip/hours terms collapse to 1 with no data; only completion is 0 |
| Why is the "Avg Velocity" delta showing nothing? | `compareMode = none`. Switch to `previous-period` or `previous-year`. |
| Why does the Department dropdown stay populated even when I pick a role with no users? | `route.ts` — `emptyResponse(range, departmentOptions)` is called early with the full role list when filter intersects to zero |
| Why does the heatmap show silent departments? | By design — see §4.3. Lets leadership see who's quiet, not just who's contributing. |
| Why doesn't a "Developer" role from Project A appear separately from one in Project B? | `dedupeDepartmentOptions()` collapses roles by lowercased name |
| Where do saved views live? | `app_quiktrack.QtReportView` Postgres table |
| What permission do I need to see the report? | `Report:view` (or app-wide admin) |
