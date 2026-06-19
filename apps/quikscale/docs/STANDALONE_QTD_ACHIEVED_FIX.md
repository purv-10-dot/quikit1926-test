# Standalone QTD Achieved — Why the Dashboard Was Wrong, What We Changed, and Why UAT Still Showed the Old Value

> **Scope:** This is a **client-side render fix**, not a database migration. No Prisma column was changed. No row in the `KPI` table was rewritten. The server still stores the wrong value in `KPI.qtdAchieved` for Standalone KPIs — the client now ignores that column and re-derives the correct number at render time.

---

## 1. The Standalone formula

For a Standalone KPI, **every week carries the full quarterly target** (e.g. target = 80 means each week must hit 80). QTD Achieved is therefore an **average**, not a sum.

```
QTD Goal     = kpi.target                       (constant — the quarterly target)
QTD Achieved = Σ (weekly values W1..currentWeek−1)
               ─────────────────────────────────────────────
               count(weeks with target > 0 in W1..currentWeek−1)
```

The denominator is **weeks with a target**, NOT **weeks where a value was entered**. That's the documented "penalty" rule from `docs/individualKpi-standalone-logic.md`: if a week had a target but the owner forgot to log, that week still drags the average down.

### Worked example — "standalone test cal"

Today is **W8** of Q1 2026‑27, target = 80, division = Standalone.

| Week | Target | Value entered |
|------|--------|---------------|
| W1–W3 | 0      | —             |
| W4    | 80     | logged        |
| W5    | 80     | logged        |
| W6    | 80     | logged        |
| W7    | 80     | **empty (penalty week)** |

* Σ values across W4–W7 = **272.5** (matches Stats panel: 3 weeks reported × avg 90.83)
* Weeks with target > 0 in [W1..W7] = **4** (W4, W5, W6, W7)
* QTD Achieved = 272.5 ÷ 4 = **68.125 ≈ 68.13** ✓

This matches the Stats panel exactly.

---

## 2. Why the dashboard showed 272.5

The Prisma `KPI.qtdAchieved` column is stamped by the server **every time a weekly value is saved**. The stamp is a plain cumulative sum, regardless of `divisionType`:

```ts
// apps/quikscale/app/api/kpi/[id]/weekly/route.ts:106-122
const allWeekly = await db.kPIWeeklyValue.findMany({
  where: { kpiId: opts.kpiId },
  select: { value: true },
});
const totalAchieved = allWeekly.reduce((s, w) => s + (w.value || 0), 0); // ← SUM
// ...
await db.kPI.update({
  where: { id: opts.kpiId },
  data: {
    qtdAchieved: totalAchieved,   // ← stamped as SUM, ignores divisionType
    progressPercent,
    // ...
  },
});
```

The same SUM-stamping happens in the batch endpoint (`weekly/batch/route.ts:85`). So for any Standalone KPI in the database **right now**, `KPI.qtdAchieved` holds the wrong number — the cumulative total, not the average.

The Stats panel (`StatsTab.tsx`) and the KPI module table (`KPITable.tsx`) had already learned to **ignore** that column and recompute via the pure helper `computeQtd()` in `apps/quikscale/app/(dashboard)/kpi/components/kpiStats.ts`. The dashboard's QTD Achieved cell was reading the raw column.

---

## 3. What we changed (code‑level, no DB write)

File: [`apps/quikscale/app/(dashboard)/kpi/components/KPITable.tsx`](../app/(dashboard)/kpi/components/KPITable.tsx)

**Site A — paired QTD Goal + QTD Achieved cell (line ~465):**

```diff
- const { qtdGoal, qtdAchieved } = computeQtd(kpi, currentWeek);
+ const { qtdGoal, qtdAchieved } = computeQtd(kpi, currentWeek, progressDivisionType);
```

The third argument was already required by `computeQtd()` for the Standalone branch to fire, but the call site was omitting it — so it defaulted to `"Cumulative"` and returned the SUM.

**Site B — QTD Achieved fallback when QTD Goal column is hidden (lines ~503–526):**

```diff
- // was reading raw kpi.qtdAchieved (the server's wrong SUM)
- {fmtCompact(kpi.qtdAchieved ?? null)}
+ const { qtdGoal: dQtdGoal, qtdAchieved: dQtdAchieved } =
+     computeQtd(kpi, currentWeek, progressDivisionType);
+ {fmtCompact(dQtdAchieved)}
```

`progressDivisionType` was already in scope on line 291 — derived once per row from `kpi.divisionType`. We just threaded it through.

**Cumulative KPIs are byte‑identical to before** — the `divisionType === "Standalone"` branch only fires for Standalone rows.

---

## 4. Why UAT still showed 272.5 after merging

This is the part the user specifically asked about. There are four independent reasons the old value can still appear in UAT:

### Reason 1 — Vercel does not auto-deploy `uat` (most common cause)

From the root `CLAUDE.md`:

> **Deploy gating** — only `main` triggers a Vercel build. This is enforced in three layers:
> 1. Per-app `vercel.json` (`deploymentEnabled: {main: true}`) — allow-list.
> 2. Per-app `vercel.json` `ignoreCommand` — exits 0 (skip) for any `VERCEL_GIT_COMMIT_REF != main`.
> 3. Per-project Vercel dashboard → Git → Production Branch = `main`. Preview deployments disabled.

So merging into `uat` **does not redeploy the UAT site**. The UAT environment keeps serving the previous bundle until either:
* the change is merged forward into `main` (which redeploys production), **OR**
* somebody runs a manual one-off preview deploy: `vercel --prod=false`.

If the UAT environment you're checking is actually a Vercel preview pinned to a specific commit, that preview will not pick up new commits on `uat` either. You'd need a fresh preview deploy.

### Reason 2 — Browser / edge cache

Even after a successful deploy, the static JS chunk that contains `KPITable.tsx` is fingerprinted and cached. A hard reload (Ctrl+Shift+R / Cmd+Shift+R) usually clears it. If you're on the deployed URL and see no change after a successful deploy, **hard-reload first** before diagnosing further.

### Reason 3 — `currentWeek === null` fallback

`computeQtd()` has a defensive fallback for past/future quarters:

```ts
// apps/quikscale/app/(dashboard)/kpi/components/kpiStats.ts:84-89
if (currentWeek == null) {
  return {
    qtdGoal: kpi.target ?? kpi.qtdGoal ?? null,
    qtdAchieved: kpi.qtdAchieved ?? null,   // ← falls back to server SUM
  };
}
```

If the fiscal-year config (`QuarterSetting` table) is **not seeded** in UAT, `useCurrentWeek()` returns `null`, and `computeQtd()` falls back to the wrong server value. Same thing happens if you're viewing a quarter whose dates are entirely in the past or entirely in the future.

**How to confirm:** open the dashboard, check the header pill — it should read e.g. "Q1 · Week 8 · 20 May – 26 May". If the "Week N" part is missing, `currentWeek` is null and the fix can't engage.

**How to fix:** seed `QuarterSetting` for the current fiscal year in UAT (`npm run db:seed:quarters` or whatever your UAT seeding command is).

### Reason 4 — The DB column itself

`KPI.qtdAchieved` in the database **is still wrong** for every existing Standalone KPI. Any surface that reads it directly (without going through `computeQtd`) still shows the SUM. We didn't fix:

* The dashboard's **mini KPI cards** at the top of the Overview pane (`KPICard` in `dashboard/page.tsx` line 489) — reads `kpi.qtdAchieved` raw.
* The **AvgKPICard** badge (the orange "341% avg KPI" pill) — reads `kpi.progressPercent` raw (also server-stamped from the same SUM).
* Any **CSV/Excel export** that ships the `qtdAchieved` column directly.
* Any **API consumer outside the app** (BI tools, dashboards, future integrations).

This is intentional scope for the requested fix (the table cell only), but worth knowing it's a partial fix. A full fix has two options:

| Option | What | Trade‑off |
|--------|------|-----------|
| **A. Client‑side everywhere** | Add `computeQtd(..., divisionType)` to every UI surface that currently reads `kpi.qtdAchieved` / `kpi.progressPercent`. | No migration, no backfill. But every new consumer has to remember the rule. |
| **B. Fix the server stamp** | In `weekly/route.ts` and `weekly/batch/route.ts`, branch on `kpi.divisionType` when computing `totalAchieved` and `progressPercent`. Backfill existing rows once (`scripts/backfill-standalone-qtd.ts`). | Single source of truth. Requires a migration script + one-time DB run per environment. |

Option **B** is the right long-term fix. The Standalone semantics belong on the server so every consumer agrees.

---

## 5. Checklist when verifying in UAT

1. **Code is actually deployed.** Confirm by viewing the source of the deployed JS bundle and searching for `progressDivisionType` — it should appear inside the QTD Goal cell render. If not, your deploy didn't include the fix.
2. **Hard‑reload** the dashboard tab (Ctrl+Shift+R).
3. **Header shows current week.** If the page header doesn't show "Week N", `currentWeek` is null and the fix can't run — fix the `QuarterSetting` seed in UAT.
4. **Spot‑check the math.** For a Standalone KPI with 4 prior weeks each at target 80 and three values 100/82.5/90 entered:
   * Stats panel "QTD Achieved" should read **68.13 / 80**.
   * Dashboard QTD Achieved cell should now read **68** (compact format) with traffic-light color matching ≈85%.
5. **Mini overview cards still show the old number** — that's expected per §4 Reason 4. They were out of scope.

---

## 6. Why not just fix the DB?

The user asked "code level fix or db level fix?" — the answer is **code level fix is correct for now** because:

* The DB column `KPI.qtdAchieved` is fundamentally a **derived** value (a stamp of weekly aggregates). Changing the formula on the write side is the *real* fix, not running an UPDATE.
* The same code that produces wrong stamps today would re-produce them on the next weekly save, even after backfilling rows. So a one-off DB UPDATE solves nothing.
* Backfilling without changing the server logic = bug returns the next time someone logs a week.
* Conversely: fixing the server logic without backfilling = old rows are wrong until the next weekly save touches them.

The correct path forward is **Option B from §4** — fix the write path in `weekly/route.ts` + `weekly/batch/route.ts`, then run a one-time backfill. The current client-side fix unblocks the table cell while that larger change is scheduled.

---

## 7. Related references

* Pure math helper: [`apps/quikscale/app/(dashboard)/kpi/components/kpiStats.ts`](../app/(dashboard)/kpi/components/kpiStats.ts) (`computeQtd`)
* Server stamp (the source of the wrong value): [`apps/quikscale/app/api/kpi/[id]/weekly/route.ts`](../app/api/kpi/[id]/weekly/route.ts) line 106–122
* Batch stamp: [`apps/quikscale/app/api/kpi/[id]/weekly/batch/route.ts`](../app/api/kpi/[id]/weekly/batch/route.ts) line 83–87
* Standalone spec: `docs/individualKpi-standalone-logic.md` (repo root)
* Deploy gating rules: [`CLAUDE.md`](../../../CLAUDE.md) → "Git Workflow — Branch Protection"
