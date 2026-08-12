# Custom Quarter Settings — Month-Based Quarter Generation (Redesign)

> **Status:** IMPLEMENTED (2026-07-07). Custom ON = month-based by default (weeks all 13) with opt-in week-based custom lengths (any week ≠ 13); Custom OFF unchanged. 98 quarter tests pass (unit + API); lint + typecheck clean on changed files.
>
> **Revision (2026-07-07):** the per-quarter week inputs were reinstated on toggle-ON (they were briefly removed). Month-based is now the *default* rather than the *only* custom behavior — see §2 Mode B.
>
> **Bug fix (2026-07-07):** stale week counts until a hard reload after creating/editing quarters — fixed by invalidating the quarter caches on every mutation. See §10. 100 quarter tests pass (incl. a reload-bug regression test).
> **Author:** Quarter Settings redesign.
> **Scope:** `apps/quikscale` — Quarter Settings generation logic (Custom Quarter mode).

## 1. Problem statement

Two defects in **Custom Quarter Settings** mode (Settings → Configurations → *Custom Quarter Settings* = ON):

### Bug 1 — "1 day is missing" (FY = 364 days, not 365)
Custom mode builds each quarter as `weekCount × 7` days ([`chainQuarterDates`](../apps/quikscale/lib/utils/quarterGen.ts)). With the default `13/13/13/13`:

```
52 weeks × 7 = 364 days   →  FY 01/04/2026 → 30/03/2027   (should end 31/03/2027)
```

A week-count year is **structurally** one day short of a calendar year (two short in a leap year). No week configuration can ever sum to 365/366.

### Bug 2 — Quarters drift off calendar-month boundaries
Because each quarter is a fixed 91 days, only Q1 lands on a clean month boundary:

| Quarter | Current (weeks×7) | Expected (month-based) |
|---|---|---|
| Q1 | 01/04/2026 → **30/06/2026** ✅ | 01/04/2026 → 30/06/2026 |
| Q2 | 01/07/2026 → **29/09/2026** ❌ | 01/07/2026 → 30/09/2026 |
| Q3 | **30/09/2026** → 29/12/2026 ❌ | 01/10/2026 → 31/12/2026 |
| Q4 | **30/12/2026** → 30/03/2027 ❌ | 01/01/2027 → 31/03/2027 |

Calendar months are not 7-day multiples, so week-chaining can never align to month boundaries.

## 2. Desired behavior

### Mode A — Custom Quarter **OFF** (unchanged)
Keep the existing **day-count split** ([`generateQuarterDates`](../apps/quikscale/lib/utils/quarterGen.ts)): Q1–Q3 = 91 days, Q4 = 92 (93 in a leap FY). Sum is always exactly 365/366. This keeps the KPI weekly grid stable at 13 columns per quarter across all years. **No change.**

### Mode B — Custom Quarter **ON** (two sub-modes, chosen by the week counts)
The Initialize modal shows the FY start date, weekly meeting day, **and per-quarter week inputs** (default 13/13/13/13). A single deterministic rule picks the generator — no extra toggle, no schema change:

- **All four weeks = 13 (the default) → month-based** calendar 3-month intervals anchored on the FY start (below). This is what appears by default and always sums to a full 365/366-day year. `weekCount` persists as 13.
- **Any quarter ≠ 13 (e.g. Q1=14, Q2=15) → week-based**: each quarter spans `weekCount × 7` days, chained contiguously (`chainQuarterDates`). The FY length floats to the sum of the weeks. Each quarter persists its chosen `weekCount`.

Rationale for the rule (`isMonthBasedWeekCounts`): an all-13 *week-based* year is 364 days — the original "1 day missing" bug, which nobody wants — so all-13 always means the clean calendar year, and a user opts into week lengths only by setting a quarter to ≠ 13.

**Month-based generation** (the all-13 default): quarters on calendar 3-month intervals anchored on the FY start date.

**Example 1 — FY start 01/04/2026**

| Quarter | Start | End | Days |
|---|---|---|---|
| Q1 | 01/04/2026 | 30/06/2026 | 91 |
| Q2 | 01/07/2026 | 30/09/2026 | 92 |
| Q3 | 01/10/2026 | 31/12/2026 | 92 |
| Q4 | 01/01/2027 | 31/03/2027 | 90 |
| **FY** | 01/04/2026 | 31/03/2027 | **365** |

**Example 2 — FY start 15/04/2026**

| Quarter | Start | End |
|---|---|---|
| Q1 | 15/04/2026 | 14/07/2026 |
| Q2 | 15/07/2026 | 14/10/2026 |
| Q3 | 15/10/2026 | 14/01/2027 |
| Q4 | 15/01/2027 | 14/04/2027 |

### Rules (both examples)
1. Each quarter starts exactly **3 months after Q1's start** (anchored on Q1, not chained — see §4).
2. Each quarter **ends the day before the next quarter starts**.
3. The **last quarter always ends on the FY end date** (= Q1 start + 12 months − 1 day).
4. Support **leap years** and **months of different lengths**.
5. Handle **29th / 30th / 31st** day-of-month starts correctly (clamp to month length).
6. Use **timezone-safe** (UTC-normalized) date math.

## 3. The algorithm

### 3.1 Safe month addition (clamping)
`Date.setMonth` overflows (31 Jan + 1 month → 03 Mar). We need clamping to the target month's last day.

```ts
/** Add `months` to a UTC date, clamping the day to the target month's length.
 *  addMonthsUTC(2026-01-31, 1) → 2026-02-28 (not 2026-03-03). */
export function addMonthsUTC(date: Date, months: number): Date {
  const y = date.getUTCFullYear();
  const mAbs = date.getUTCMonth() + months;
  const targetYear = y + Math.floor(mAbs / 12);
  const targetMonth = ((mAbs % 12) + 12) % 12;
  const day = date.getUTCDate();
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return new Date(Date.UTC(targetYear, targetMonth, Math.min(day, lastDay)));
}
```

### 3.2 Month-based quarter generation

```ts
export function generateMonthlyQuarterDates(q1Start: Date): QuarterDateRow[] {
  const names = ["Q1", "Q2", "Q3", "Q4"] as const;
  const anchor = new Date(Date.UTC(
    q1Start.getUTCFullYear(), q1Start.getUTCMonth(), q1Start.getUTCDate(),
  ));

  // Starts anchored on Q1 (0, 3, 6, 9 months) — avoids compounding clamp drift.
  const starts = [0, 3, 6, 9].map((m) => addMonthsUTC(anchor, m));
  const fyEnd = addDays(addMonthsUTC(anchor, 12), -1); // Q1 start + 1yr − 1 day

  return names.map((quarter, i) => ({
    quarter,
    startDate: starts[i],
    endDate: i < 3 ? addDays(starts[i + 1], -1) : fyEnd,
    weekCount: 13, // KPI grid stays 13 columns; see §5
  }));
}
```

## 4. Why anchor on Q1 (not chain from previous quarter)

Rule 1 says "3 months after the previous quarter's start." For the common (non-clamped) cases the two are identical. They diverge only on clamped month-ends, where **anchoring on Q1 is strictly more correct** because it prevents compounding drift:

- FY start **30/11/2026** (Feb has 28 days):
  - **Anchored on Q1:** Q1=30/11, Q2=addMonths(30/11,3)=28/02, Q3=addMonths(30/11,6)=**30/05**, Q4=addMonths(30/11,9)=**30/08** ✅ (Q3/Q4 recover the 30th).
  - **Chained from previous:** Q3=addMonths(28/02,3)=28/05, Q4=addMonths(28/05,3)=28/08 ❌ (permanent drift to the 28th).

Contiguity (rule 2) and "last quarter ends on FY end" (rule 3) hold in both, but anchoring keeps the day-of-month stable wherever the calendar allows. **Decision: anchor on Q1.**

## 5. `weekCount` and the KPI weekly grid

The `weekCount` column drives the KPI weekly-value grid (13-week rolling view, current-week calc in [`fiscal.ts`](../apps/quikscale/lib/utils/fiscal.ts)). Month-based quarters are **91/92/92/90 days** — not integer weeks. To keep the KPI grid unchanged and stable:

- **Persist `weekCount = 13` for all four quarters in month-based mode.** The KPI grid renders 13 week columns as it does today; `getCurrentFiscalWeekFromStart` already clamps to `total` (13), so the 1–2 trailing days of a 92-day quarter fold into week 13. No downstream KPI change needed.
- The per-quarter week inputs stay in the Initialize modal (default 13/13/13/13). Left at 13 they yield the month-based calendar quarters (weekCount persists 13); set to a custom value they yield week-based quarters (weekCount persists that value). Only the ≠13 case departs from `weekCount = 13`, and that case is genuinely week-aligned, so the KPI grid stays correct in both.

**No Prisma schema change** — `weekCount` already exists and stays `13`.

## 6. Files to change

| File | Change |
|---|---|
| `apps/quikscale/lib/utils/quarterGen.ts` | Add `addMonthsUTC` + `generateMonthlyQuarterDates`. Keep `chainQuarterDates` (still used by legacy data / can be removed later). |
| `apps/quikscale/app/api/org/quarters/route.ts` (POST) | Custom mode → call `generateMonthlyQuarterDates(fyStartDate)` instead of `chainQuarterDates`. |
| `apps/quikscale/app/api/org/quarters/[id]/route.ts` (PUT) | Custom mode → recompute via `generateMonthlyQuarterDates(q1Start)` (Q1 start editable; weekCount edits become no-ops for dates). |
| `apps/quikscale/app/(dashboard)/org-setup/quarters/page.tsx` | Generate modal: per-quarter week inputs (default 13) + preview that branches month-based ↔ week-based via `isMonthBasedWeekCounts`. Edit panel: Custom mode edits this quarter's weeks (+ Q1 start), single-quarter month-aware end preview. |
| `apps/quikscale/__tests__/unit/quarterGen.test.ts` | Add `addMonthsUTC` + `generateMonthlyQuarterDates` suites (see §7). |

## 7. Edge cases & unit tests

`generateMonthlyQuarterDates` / `addMonthsUTC`:

1. **Standard 01/04/2026** → Q1 01/04→30/06, Q2 01/07→30/09, Q3 01/10→31/12, Q4 01/01→31/03/2027; days 91/92/92/90; sum 365.
2. **Mid-month 15/04/2026** → matches Example 2 exactly; Q4 ends 14/04/2027.
3. **Leap FY (start 01/04/2024)** → Feb 2025 not in range; but **start 01/01/2024** → Q1 includes Feb 29 2024; sum = 366.
4. **31st start (31/01/2026)** → Q2 addMonths(31/01,3)=30/04 (Apr=30d), Q3 31/07, Q4 31/10; FY end 30/01/2027; contiguous.
5. **30th start into February (30/11/2026)** → Q2 28/02/2027 (clamp), Q3 30/05, Q4 30/08 (anchor recovery).
6. **29th Feb start in leap year (29/02/2024)** → Q2 29/05, Q3 29/08, Q4 29/11; FY end 28/02/2025 (clamp).
7. **Contiguity invariant** — `addDays(q[i].end, 1) === q[i+1].start` for all i.
8. **FY-end invariant** — `q[3].endDate === addDays(addMonthsUTC(q1Start,12), -1)`.
9. **Timezone safety** — all outputs at UTC-midnight; identical result regardless of runner TZ.
10. **weekCount** — every returned row has `weekCount === 13`.

### API-route coverage (`__tests__/api/quarters.post.test.ts`)
Fully isolated (deep-mocked Prisma, mocked session + module gate — no DB, no production code touched). Proves the toggle *wiring*, not the date math (that's the unit suite above):
- **Custom OFF** → POST persists the day-count split (Q1 01/04→30/06, Q4 ends 31/03, sum 365), `weekCount=13`.
- **Custom ON (weeks all 13)** → POST persists month-based quarters for both a 1st-of-month and a mid-month (15th) start; sum 365, `weekCount=13`; weekly-meeting-day flag upserted.
- **Custom ON (weeks 14/15/13/13)** → POST persists week-based quarters (Q1=98 days weekCount 14, Q2=105 days weekCount 15, …).
- **Custom ON PUT** → moving Q1's start recomputes all 4 quarters on 3-month intervals (asserted via the `update` calls, so it validates the logic rather than a re-read mock).
- **401** when unauthenticated.

## 7a. Toggle (ON/OFF) behavior

The `enable_custom_quarter_settings` flag is read on both sides so the two paths never disagree:
- **Client:** `useCustomQuarterSettings()` subscribes to the flag cache; `invalidateFeatureFlagsCache()` (called after the Settings save) re-fetches and live-re-renders the modal/table.
- **Server:** `getCustomQuarterEnabled(orgId)` is re-read on every POST/PUT, so generation always matches the current flag — regardless of what the client sent.

**Switching the toggle does not retroactively rewrite existing quarters** — by design. Already-generated FYs keep their dates; the new mode only applies to the *next* Initialize (or a recalculation of an unlocked FY via editing Q1's start). This avoids silently shifting boundaries under FYs that may already have downstream references. FYs with KPI/Priority/OPSP data are locked and cannot be regenerated at all.

- **ON, weeks all 13** → `generateMonthlyQuarterDates` (calendar 3-month intervals) — the default.
- **ON, any week ≠ 13** → `chainQuarterDates` (weeks × 7, chained) — custom lengths.
- **OFF** → `generateQuarterDates` (day-count split 91/91/91/92, Q4 absorbs leap). Week inputs N/A.

The month-vs-week decision uses `isMonthBasedWeekCounts(weekCounts)` on both POST (from the request body) and PUT (from the persisted per-quarter counts, with the edit applied), so the client preview, POST, and PUT recalculation always agree.

## 7b. Leap-year handling (both modes)

- **OFF (day-count):** `hasLeap = totalDays === 366` → Q4 distribution becomes 93 (else 92). Q1–Q3 stay 91 so the KPI grid is stable year-to-year; only Q4 flexes. Covered by existing `generateQuarterDates` leap tests.
- **ON (month-based):** Feb 29 is absorbed **naturally** by whichever calendar quarter contains it — no special-casing. E.g. April-start FY 2027-28: Q4 = 01/01/2028→31/03/2028 = 91 days (Feb 2028 has 29), quarters run 91/92/92/91, sum = 366. A 29 Feb *start* clamps its FY end via `addMonthsUTC` (see §7 case 6).
- **Modal UI:** the "Leap year" badge now shows in **both** modes, driven by `effectiveTotalDays === 366` (previously OFF-only).

## 8. Backward compatibility & risk

- **Already-created quarters:** untouched. This only changes generation of *new* quarters and recalculation of *unlocked* FYs (FYs with KPI/Priority/OPSP data are locked and cannot be regenerated).
- **KPI grid:** unchanged (weekCount stays 13; clamping already handles 92-day quarters).
- **`resolveQuarterForDate`** (custom-quarter-aware): already date-range based — works correctly with month-based ranges.
- **Rollout:** code-only, no migration. Ship on a `fix/` branch through the standard `dev → uat → main` train.

## 9. Open decisions (confirm before implementing)

- **D1 — Custom OFF stays day-count split (91/91/91/92)?** Recommended: yes (keeps KPI grid stable).
- **D2 — Persist `weekCount = 13` in month-based mode?** Recommended: yes (no KPI change).
- **D3 — Per-quarter week inputs in Custom mode?** ~~Hidden~~ → **Reinstated (2026-07-07 revision):** shown with default 13/13/13/13. All-13 = month-based default; any ≠13 = week-based custom. This is the current behavior.

## 10. Bug fix — stale week counts until a hard reload (2026-07-07)

### Symptom
After creating custom quarters (e.g. Q1 = 15 weeks, Q2 = 14), opening **Add KPI** showed the grid with **13 weeks** ("Target split equally across 13 weeks"). Only after a full browser **reload** did it show the real count (15 for Q1, 14 for Q2). Same staleness moving to any week-aware module (Priority, Dashboard, OPSP) right after editing quarters.

### Root cause
Week-aware surfaces don't read `QuarterSetting` directly — they read it through two **module-level in-memory caches**, populated once and reused for the whole SPA session:

| Cache | File | Fed endpoint | Consumers |
|---|---|---|---|
| current-week / week-count | `lib/hooks/useCurrentWeek.ts` | `/api/org/quarters` | `useQuarterWeekCount` (KPI grid size), `useCurrentWeek/Quarter`, `useWeekLabels` |
| quarter-start-dates | `lib/hooks/useQuarterStartDates.ts` | `/api/org/quarter-settings` | Priority modal/table week labels |

The Quarter Settings page invalidated **only** `invalidateFiscalYearsCache()` after generate/edit/delete. `invalidateCurrentWeekCache()` and `invalidateQuarterStartDatesCache()` **existed but were wired nowhere**, so the two quarter caches kept their pre-generation snapshot (missing the just-created rows → `useQuarterWeekCount` fell back to the default 13). A hard reload reset the module caches, which is why reloading "fixed" it.

`handleSaved` (the edit path) invalidated **nothing at all**.

### Fix
`apps/quikscale/app/(dashboard)/org-setup/quarters/page.tsx`:
- Added `invalidateAllQuarterCaches()` = `invalidateFiscalYearsCache()` + `invalidateCurrentWeekCache()` + `invalidateQuarterStartDatesCache()`.
- Called it in **all four** mutating handlers: `handleGenerated`, `handleSaved`, `handleBulkDelete`, `handleDeleteFY`.

With the caches cleared at mutation time, the next mount of any week-aware view (e.g. the Add-KPI drawer) refetches `/api/org/quarters` and gets the real week counts — **no reload needed**. The KPI modal already reacts to the async `weekCount` resolving (the `weekCountResolved` effect in `KPIModal.tsx` rebuilds the weekly breakdown when it becomes ≠ 13), so a fresh cache is all that was missing.

### Note
`useCurrentWeek.ts`'s cache has no live listener/subscription (unlike `useQuarterStartDates`), so an **already-mounted** view won't hot-update — but in a single-route SPA you navigate (remount) to reach KPI/Priority after editing quarters, and the remount refetches. Adding a listener there is a possible future enhancement, not required for this fix.
