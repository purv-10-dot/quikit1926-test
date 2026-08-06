# Quarter Generation Changes — Production Handoff

> **Give this file to whoever deploys the change.** It is a self-contained deploy runbook.
> Full engineering detail (algorithm, edge cases, test list) lives in
> [`custom-quarter-month-based.md`](./custom-quarter-month-based.md) in the same folder.

- **App affected:** `quikscale` only. (No other app touched.)
- **Change type:** **Code-only.** ✅ **No database migration. No schema change. No data backfill.**
- **Date prepared:** 2026-07-07

---

## 1. What changed (behavior)

All changes are inside **Quarter Settings** (Custom Quarter Settings toggle) and the views that read quarter week counts.

1. **Custom Quarter ON is now month-based by default.** With the per-quarter weeks left at the default `13/13/13/13`, quarters are generated on **calendar 3-month intervals** from the FY start date (e.g. 01/04/2026 → Q1 01/04–30/06, Q2 01/07–30/09, Q3 01/10–31/12, Q4 01/01–31/03/2027). This fixes the old "**1 day missing**" bug (52×7 = 364 days) and the quarters drifting off month boundaries.
2. **Per-quarter week customization still works.** Set any quarter's weeks to a value ≠ 13 (e.g. Q1=14, Q2=15) and that FY switches to **week-based** quarters (`weeks × 7`, chained). Rule: *all 13 → month-based; any ≠ 13 → week-based.*
3. **Leap years** are handled in both modes (month-based absorbs Feb 29 naturally; day-count mode gives Q4 the extra day).
4. **Custom Quarter OFF is unchanged** (legacy day-count split 91/91/91/92).
5. **Reload bug fixed:** after creating/editing quarters, week-aware views (KPI grid, Priority, etc.) now show the correct week count **without a hard reload** (the quarter caches are invalidated on every mutation).

---

## 2. Migration / data

**None required.**

- The `QuarterSetting.weekCount` column already exists in production (added earlier by `2026-06-30_quarter_weekcount.sql`). These changes only alter how dates/week counts are **computed**, not the schema.
- **Existing quarters are not rewritten.** The new logic applies to newly-initialized fiscal years and to recalculation of FYs that have no KPI/Priority/OPSP data yet (locked FYs are never touched). Nothing to backfill.

---

## 3. Files changed

**Production code**
- `apps/quikscale/lib/utils/quarterGen.ts` — new `addMonthsUTC`, `generateMonthlyQuarterDates`, `isMonthBasedWeekCounts`; `chainQuarterDates` retained.
- `apps/quikscale/app/api/org/quarters/route.ts` — POST picks month-based vs week-based vs legacy.
- `apps/quikscale/app/api/org/quarters/[id]/route.ts` — PUT recalculation uses the same rule.
- `apps/quikscale/app/(dashboard)/org-setup/quarters/page.tsx` — Initialize modal + edit panel; **cache invalidation on every mutation** (the reload-bug fix).
- `apps/quikscale/lib/hooks/useFeatureFlags.ts` — doc comment only.

**Tests** (no runtime impact)
- `apps/quikscale/__tests__/unit/quarterGen.test.ts`
- `apps/quikscale/__tests__/api/quarters.post.test.ts`
- `apps/quikscale/__tests__/components/useCurrentWeek.dom.test.tsx`

**Docs**
- `docs/custom-quarter-month-based.md`, `docs/quarter-month-based-PROD-HANDOFF.md` (this file).

---

## 4. Deploy steps

This repo deploys **only `main` → Vercel production**. Standard merge path: `feature/* | fix/*` → `dev` → `uat` → `main`.

1. Get the branch onto `main` via the normal PR/merge train (do **not** hand-commit to `main`).
2. Merging to `main` triggers the quikscale Vercel production build automatically.
3. No env vars to add. No migration to run. No cache/queue to flush.

Pre-deploy sanity (run in the repo):
```bash
cd apps/quikscale
npm run test        # quarter suites: 100 tests pass
npm run typecheck
npm run lint
```

---

## 5. Verification checklist (post-deploy, in the app)

Enable **Settings → Configurations → Custom Quarter Settings**, then in **Org Setup → Quarter Settings → Initialize Quarters**:

- [ ] FY start `01-04-2026`, weeks `13/13/13/13` → preview shows **365 days**, Q1 01/04→30/06, Q2 01/07→30/09, Q3 01/10→31/12, Q4 01/01→31/03/2027.
- [ ] FY start `15-04-2026`, weeks all 13 → Q1 15/04→14/07, … Q4 15/01→14/04/2027.
- [ ] Set Q1 weeks = `15`, Q2 = `14` → preview switches to week-based (Q1 = 105 days, etc.).
- [ ] A leap FY (start 01/04/2027) → shows **366 days**, "Leap year" badge.
- [ ] **Reload check:** create the quarters, then go to **KPI → Individual KPI → Add KPI** → the weekly breakdown shows the correct number of weeks (14/15) **immediately, without reloading the page**.

---

## 6. Rollback

Code-only change with no data migration, so rollback is a plain revert:

- Revert the merge commit on `main` (single branch merge → single revert). Vercel redeploys the previous build.
- No data cleanup needed — no rows were migrated or rewritten.
