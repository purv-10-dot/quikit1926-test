# QuikScale Admin Guide

> Consolidated admin/developer documentation for the QuikScale app.
> Replaces 10 previously-untracked markdown files. Each section below
> is the verbatim content of one source doc, separated by horizontal rules.

**Last consolidated:** 2026-05-18

---

## Table of Contents

- [OPSP — What's New (User Guide)](#opsp-user-guide)
- [OPSP Developer Changes — 2026-05-13](#opsp-dev-changes-2026-05-13)
- [OPSP Developer Changes — 2026-05-14](#opsp-dev-changes-2026-05-14)
- [Roles — Complete Technical Documentation](#roles-technical)
- [Roles, Permissions & User Invitation — Technical Documentation](#roles-permissions-invitation)
- [Roles & Permissions — Complete Reference](#roles-permissions-complete)
- [User Invite Flow](#user-invite-flow)
- [Users List Page](#users-list-page)
- [User Permissions Panel](#user-permissions-panel)
- [Sort, Search, and RBAC Fixes (2026-05-15 → 2026-05-18)](#sort-search-rbac-fixes)

---

<a id="opsp-user-guide"></a>

# OPSP — What's New (User Guide)

> *(Source: `apps/quikscale/docs/opspChangesUserGuide.md`)*


A plain-language summary of every change shipped on the **OPSP module** on
**13–14 May 2026**. No code, no file paths — just what changed in the app and
how it affects your day-to-day work.

If you're a developer and need the technical details, see
[opspChanges-2026-05-13.md](../opspChanges-2026-05-13.md) and
[opspChanges-2026-05-14.md](../opspChanges-2026-05-14.md).

---

## At a glance

- **Create OPSP** is more flexible — you can add more Goal rows, and typing a
  Projected value now fills the period cells for you automatically.
- **Q1 → Q2 carry-over** is live — when Q1 is finalized, Q2 opens already
  pre-filled with everything you wrote in Q1, except the four
  quarter-specific blocks (Action QTR, Rocks, Quarterly Priorities, Your
  Accountability). The same rule applies to Q2→Q3 and Q3→Q4. At the **year
  boundary** (Q4 → next year's Q1), Goals (1 YR) and Key Initiatives also
  reset.
- **Finalize** is now reliable — no more silent "stayed in draft" issues. If
  something fails, you see the real error.
- **Review tab** got three new columns (Category Type, Last Year Same Period,
  Year Growth) and the Yearly + 3-to-5 year tabs now show **one row per
  category** instead of breaking out every quarter/year.
- **Critical Review** is a brand-new top-level tab — record Achieved values
  and comments against the colored bullets (Green / Light Green / Yellow /
  Red) for Actions QTR, Year, and People.
- **PDF Preview** now fits all 10 Goal rows on a single page.
- A handful of long-standing bugs fixed: WWW item save error, Member Monthly
  Punch Excel export, and a "Not Finalized" warning that wrongly appeared
  after submitting a review.

---

## 1. Create OPSP — more flexible Goals section

**Before:** Goals (1 YR.) was locked at exactly 6 rows.

**Now:**
- You can **add up to 10 Goal rows** using the **+ Add New** button below the
  list.
- Hover over any extra row (row 7 onwards) to see a small **×** button to
  remove it. You can never go below the original 6.
- The card height stays the same — extra rows scroll inside the card.
- **The PDF preview also adapts** — if you add more than 6 goals, the PDF
  automatically uses a compact spacing on Page 1 so all 10 rows fit. With ≤6
  goals the layout is unchanged.

---

## 2. Create OPSP — typing Projected auto-fills the period cells

**Before:** When you typed a Projected value on the main Create OPSP page
(Targets / Goals / Actions), the y1..y5, q1..q4 or m1..m3 cells stayed empty
unless you opened the matrix modal. On Finalize you'd see errors like
"missing breakdown values for q1/q2/q3/q4".

**Now:**
- Typing a Projected value on **Targets, Goals, or Actions** immediately
  fills the period cells using the right split (cumulative, cumulative till
  end, or standalone — based on the category).
- This works for **both Automatic and Manual** category types now. Earlier
  Manual categories were stuck.
- If you load an older OPSP that already had empty period cells, **Finalize
  now back-fills them for you** before validating — no more being blocked by
  legacy empty cells.

---

## 3. Q1 → Q2 quarter inheritance (and Q2→Q3, Q3→Q4, Q4→next Q1)

When you finalize a quarter and open the next one, the new quarter is no
longer blank.

### What carries over
Everything you authored — Vision, Purpose, BHAG, Core Values, Brand Promise,
Profit per X, Targets (3-5 YRS), Goals (1 YR.), Key Initiatives, Key
Thrusts, KPIs, etc.

### What resets every quarter
These four blocks are intentionally cleared so you write them fresh each
quarter:
1. **Action QTR**
2. **Rocks**
3. **Quarterly Priorities**
4. **Your Accountability**

### What also resets at the year boundary (Q4 → next year's Q1)
In addition to the four above, these are cleared so you can plan the new
year:
- **Goals (1 YR.)**
- **Key Initiatives**

### Editing inherited values
All inherited fields are **fully editable**. (We removed the earlier
"padlock" indicator on inherited Action QTR rows — if you want to change an
inherited value, just type over it.)

---

## 4. Finalize is now reliable

**Before:** Sometimes after clicking Finalize, the OPSP would stay in
**draft** in the database even though the modal closed. The Review page
would then complain "OPSP Not Finalized".

**Now:**
- Finalize **waits for the latest auto-save to flush** before submitting, so
  your most recent edits always land first.
- If anything fails server-side (record missing, wrong status, etc.) you see
  the **actual error message in a red banner inside the confirm modal**
  instead of a misleading success.
- If the OPSP is already finalized or reviewed, Finalize cleanly tells you
  so instead of silently doing nothing.

---

## 5. Review tab — three new columns

The OPSP Review screen now shows three additional columns:

| Column | What it shows |
|---|---|
| **Category Type** | The aggregation type for the category — Cumulative, Cumulative Till End, or Standalone. Helps you understand why a row's footer is summing vs averaging. |
| **Last Year Same Period** | What was Achieved in the same period one year ago. Shows `0` if there was no data. |
| **Year Growth** | The difference between this period and last year. Shown in **green** for positive change, **red** for negative, and a dash if there's no comparison. |

---

## 6. Review tab — Yearly and 3-to-5-Year views are now one row per category

**Before:**
- **Yearly tab** showed 4 quarter rows (Q1..Q4) + a Cumulative footer for
  every category — five rows per category.
- **3-to-5 year tab** showed one row per year + a Cumulative footer.

**Now:**
- **Yearly tab:** **one row per category**, no Q1..Q4 sub-rows.
- **3-to-5 year tab:** **one row per category**, no per-year sub-rows.
- **Quarter tab is unchanged** (still shows m1/m2/m3 + footer).
- Editing is only possible from the Quarter tab — the `#` button on the
  Yearly and 3-to-5 year tabs is now plain text instead of opening the edit
  drawer (those values are derived from the lower horizon).

---

## 7. Review tab — Cumulative Till End now totals as SUM

**Before:** "Cumulative Till End" categories took the last filled period's
value as the total.

**Now:** Cumulative Till End **sums all periods**, exactly like
"Cumulative". The footer still shows the label *"Exit"* (so you can tell the
two types apart visually), only the math changed.

For reference:

| Category Type | How it aggregates | Footer label |
|---|---|---|
| Cumulative | SUM | Cumulative |
| Cumulative Till End | **SUM** *(was last-filled)* | Exit |
| Standalone | AVERAGE | Average |

---

## 8. Review tab — "Submit" no longer shows a misleading warning afterwards

**Before:** After clicking **Submit** on the Quarter Review, the page would
sometimes display:
> "OPSP Not Finalized — Your OPSP for 2026-2027 · Q1 is still in **draft**
> status."

…even though the status had correctly moved to *reviewed*.

**Now:** The page treats both **finalized** and **reviewed** as
"committed" — no more false warning. The Submit button still flips between
**Submit** and **Submitted** as expected.

---

## 9. Brand-new tab — **Critical Review**

A new top-level tab next to **Review** lets managers record results against
the Critical # / Balancing Critical # bullets you set during OPSP authoring.

### Where to find it
Open any OPSP Review page → look for the **`Review`** / **`Critical Review`**
pill at the top of the screen.

### Layout
- Three module sub-tabs at the top: **Actions QTR**, **Year**, **People**.
- Each sub-tab shows two tables stacked vertically:
  - **Critical #** — your "stretch" bullets.
  - **Balancing Critical #** — your "guardrail" bullets.
- Each card has 4 colored bullets:
  🟢 **Green**, 🟢 **Light Green**, 🟡 **Yellow**, 🔴 **Red**.

### What you can do
- Click the **`#`** button on any row to open the Critical Review drawer.
- Switch between the 4 color tabs inside the drawer.
- For each color, enter:
  - **Achieved** (number)
  - **Comment** (free text)
- The drawer automatically computes:
  - **Gap** = Achieved − Projected
  - **Achieved %** with a traffic-light fill (green/yellow/red)
- Click **Save Changes** — only the bullets you actually edited get sent.

### Quality-of-life rules
- **Empty cards are hidden** — if a card has no title and no Projected
  values, it won't clutter the screen.
- **Read-only mode** — if the underlying OPSP is still in draft or already
  reviewed, the drawer shows a banner and inputs are locked.
- **Non-numeric Projected values** — Achieved is disabled and Gap shows
  `—`, but you can still leave a Comment.

### Audit
Every save writes an audit log entry, so you can trace who changed which
bullet and when (visible via the clock-icon column in each table).

---

## 10. Create OPSP — Key Thrusts no longer asks for an Owner

The Key Thrusts section on the 3-5 YRS card used to require an Owner per
thrust. That column has been removed:
- In the **Create OPSP** Key Thrusts list and modal.
- In the **Review** screen's 3-to-5 year table.
- From Finalize validation — you'll no longer be blocked by a "Key Thrust
  missing owner" error.

Older OPSPs that had owners assigned will still load fine — we just stop
showing the column.

---

## 11. WWW — "Unknown argument 'whoIds'" error fixed

**Before:** Creating or updating a WWW item could fail with a database
error mentioning `whoIds`.

**Now:** The save works cleanly. The multi-assignee experience on the form
is unchanged — you can still pick one or more people in the **Who** field
just like before.

---

## 12. Meeting Rhythm — Member Monthly Punch Excel export fixed

**Before:** The exported Excel file showed a single row per member with
empty value cells.

**Now:** The export uses the correct roster (team members + client members
for the meeting), pulls all weekly scores, and merges cells per member block
the way the reference spreadsheet does — including the Total Average row.
Absent / Not Applicable buckets are computed correctly.

---

## 13. Other small things

- **OPSP form's "Goals" cell in PDF preview** no longer overflows or shows
  a half-empty "continued" second page.
- **Submit button** keeps working after submit (a blank-tab regression was
  fixed as part of #8).

---

## Quick "where to look" cheat sheet

| You want to… | Go to |
|---|---|
| Add more than 6 goals | **Create OPSP** → Goals (1 YR.) → **+ Add New** |
| See how this period compares to last year | **OPSP Review** → look for the **Last Year Same Period** + **Year Growth** columns |
| Record Achieved for Critical # bullets | **OPSP Review** → **Critical Review** pill → click **`#`** on any row |
| Start the next quarter pre-filled | Finalize the current quarter — the next one opens pre-filled (except the four quarter-specific blocks) |
| See what reset at year boundary | Q4 → next Q1 also clears **Goals (1 YR.)** and **Key Initiatives** |

---

*Last updated: 2026-05-15.*

---

<a id="opsp-dev-changes-2026-05-13"></a>

# OPSP Developer Changes — 2026-05-13

> *(Source: `apps/quikscale/opspChanges-2026-05-13.md`)*


Single-day log of every change shipped on the OPSP module on **2026-05-13**.
Grouped by feature area; each section gives the **symptom / root cause / fix**
in the style of [`bugsResolve.md`](./bugsResolve.md).

Files referenced are relative to `apps/quikscale/` unless noted.

---

## 1. OPSP creation — Goals (1 YR.) becomes dynamic (6 → 10 rows)

### What changed
Goals rows on the **Create OPSP** page used to be a fixed 6-slot block. Users
now can add up to **10** Goal rows, remove extras down to the original 6, and
the section's card height stays constant via a scroll viewport.

### Implementation
- [`app/(dashboard)/opsp/components/GoalsSection.tsx`](./app/(dashboard)/opsp/components/GoalsSection.tsx):
  - New constants `MAX_GOAL_ROWS = 10` and `MIN_GOAL_ROWS = 6`.
  - Rows wrapped in `<div className="max-h-[268px] overflow-y-auto pr-1">` —
    fixed card height, scrolls when row count grows.
  - Per-row **X** button appears on hover when `goalRows.length > MIN_GOAL_ROWS`.
  - **+ Add New** button below the list, disabled (hidden) once
    `goalRows.length === MAX_GOAL_ROWS`.

### How the cascade copes
The Targets → Goals seeding in
[`hooks/useOPSPForm.ts`](./app/(dashboard)/opsp/hooks/useOPSPForm.ts) is
unchanged — it still seeds index-by-index for the first
`min(targetRows.length, goalRows.length)` rows. Extra Goal rows (7-10) the
user adds are user-only and are not seeded by Targets.

---

## 2. PDF Preview — Goals overflow handling

### Symptom
With 8-10 Goal rows in the editor, the PDF Preview clipped rows 7+, and
several iterations of a "see next page for more" hint / "Goals (1 Yr.) —
Continued" page produced empty whitespace on a second `<Page>`.

### Root cause
`<View>` in `@react-pdf/renderer` honours `height: "85mm"` strictly with
`overflow: "hidden"`. Adding rows past the visible height clipped them. A
secondary "continuation" page only contained 4 rows plus a footer, leaving
~180mm blank.

### Final fix — compact mode
[`app/(dashboard)/opsp/components/OPSPDocument.tsx`](./app/(dashboard)/opsp/components/OPSPDocument.tsx)
gained a `compact` prop on `CatProjTable`:

```tsx
const cellOverride = compact
  ? { paddingVertical: 2, paddingHorizontal: 5, minHeight: 14 }
  : null;
```

The Goals cell on Page 1 always renders at the original `85mm` height but
switches to compact mode when `goalsOverflow = filledGoalsCount > 6`. All
10 rows fit inside the same cell — no continuation page, no whitespace,
layout byte-identical to the original when ≤ 6 goals are filled.

---

## 3. Main-page Projected inputs auto-fill period cells

### Symptom
Typing a Projected value on the simplified Targets / Goals / Actions sections
on the Create OPSP page no longer auto-filled the y1..y5 / q1..q4 / m1..m3
breakdown cells. Earlier, that happened through the now-removed matrix
modals. Validation then blocked Finalize because cells were empty.

### Fix
Wired `breakdownProjected()` into the `onChange` of each main-page Projected
input.

| Section | Period count | File |
|---|---|---|
| Targets | `form.targetYears` (3-5) | [`components/TargetsSection.tsx`](./app/(dashboard)/opsp/components/TargetsSection.tsx) |
| Goals   | 4 | [`components/GoalsSection.tsx`](./app/(dashboard)/opsp/components/GoalsSection.tsx) |
| Actions | 3 | [`components/ActionsSection.tsx`](./app/(dashboard)/opsp/components/ActionsSection.tsx) |

All three pass `{ force: true }` (see §4) so Manual categories also get
auto-filled when the modal-driven manual-entry UI is gone.

---

## 4. `breakdownProjected({ force: true })` — auto-fill for Manual rows

### Symptom
Finalize blocked with:
> Goals row 4 (Manual Cumulative Till End): missing breakdown values for q1/q2/q3/q4

Even after typing Projected, the period cells stayed empty for any category
whose `breakdownType === "Manual"`.

### Root cause
`breakdownProjected` was gated:

```ts
if (meta.breakdownType !== "Automatic") return null;
```

Manual rows always returned `null`. The matrix modals were the only UI that
let users fill those cells; with the modals removed, Manual rows could
never satisfy the validator.

### Fix
Added a `force` option to `breakdownProjected` in
[`components/modals.tsx`](./app/(dashboard)/opsp/components/modals.tsx):

```ts
export function breakdownProjected(
  categoryName: string,
  projected: string,
  periodCount: number,
  options?: { force?: boolean },
): string[] | null {
  ...
  if (!options?.force && meta.breakdownType !== "Automatic") return null;
  ...
}
```

Call sites that pass `force: true` (so Manual rows also get auto-filled):

- `TargetsSection` Projected onChange
- `GoalsSection` Projected onChange
- `ActionsSection` Projected onChange
- The Targets→Goals and Goals→Actions cascade in
  [`hooks/useOPSPForm.ts`](./app/(dashboard)/opsp/hooks/useOPSPForm.ts)

The matrix modals still call `breakdownProjected()` without `force`, so
their original Manual-respecting semantics are preserved.

---

## 5. `backfillPeriods()` — pre-validation safety net on Finalize

### Why
Even with §4 in place, *existing* OPSPs loaded from the DB might already
have Manual rows with empty period cells (data saved before the auto-fill
was wired). Without intervention those still fail validation on Finalize.

### Fix
New helper in
[`app/(dashboard)/opsp/lib/validateOPSP.ts`](./app/(dashboard)/opsp/lib/validateOPSP.ts):

```ts
export function backfillPeriods(form: FormData): FormData {
  // For each row with Category + Projected but all period cells empty:
  //   - call breakdownProjected(..., { force: true })
  //   - write the slices back into the row
  // Rows with ANY period cell already filled are left untouched.
}
```

Wired into the Finalize click handler in
[`app/(dashboard)/opsp/page.tsx`](./app/(dashboard)/opsp/page.tsx):

```tsx
const filled = backfillPeriods(form);
if (filled !== form) setForm(filled);
const errs = validateOPSP(filled);
```

---

## 6. Finalize flow hardening — `flushSave` + real error surface

### Symptoms (multiple)
1. After clicking Finalize, the OPSP sometimes stayed `draft` in DB — user
   saw "Submit available on Quarter view" hint and the Review page showed
   "OPSP Not Finalized".
2. The Finalize confirm modal always closed regardless of server outcome.

### Root causes
- **Race**: `setForm(filled)` queued an autosave on a 1.5s debounce. The
  Finalize confirm modal often opened/closed in less than 1.5s, so the
  backfilled cells (and the OPSP record itself, on the first ever save)
  could land in the DB *after* the POST `/api/opsp` finalize call. POST's
  `updateMany({ where: { ... status: "draft" } })` then matched zero rows.
- **Silent no-op**: `updateMany` returns `{ count: 0 }` on no match but the
  endpoint replied `{ success: true }`. The client treated it as success.

### Fix — three layers
**6a.** New `flushSave()` on the hook
([`hooks/useOPSPForm.ts`](./app/(dashboard)/opsp/hooks/useOPSPForm.ts))
that cancels the pending debounce and awaits a synchronous PUT.

**6b.** `POST /api/opsp`
([`app/api/opsp/route.ts`](./app/api/opsp/route.ts)) now distinguishes:
- *Match found and updated* → `success: true`
- *Record missing* → `404 { success: false, error: "No OPSP found …" }`
- *Already finalized/reviewed* → `success: true, alreadyFinalized: true`

**6c.** `confirmFinalize` in
[`app/(dashboard)/opsp/page.tsx`](./app/(dashboard)/opsp/page.tsx) now:
1. `await flushSave()`
2. POSTs and **awaits the JSON body**
3. On failure renders the actual error in a red banner inside the modal
   instead of closing it

---

## 7. WWW item `whoIds` Prisma error

### Symptom
Creating a WWW item exploded with:

```
Invalid `prisma.wWWItem.create()` invocation:
Unknown argument `whoIds`. Did you mean `who`?
```

### Root cause
The `WWWItem` model in `packages/database/prisma/schema.prisma` only has a
scalar `who: String`. Earlier code at
[`app/api/www/route.ts`](./app/api/www/route.ts) speculatively wrote
`whoIds: string[]` with a `as { whoIds: string[] }` TS cast — works at
compile time, blows up at runtime against the actual Prisma client.

### Fix
Stripped the `whoIds` writes everywhere, kept the multi-assignee shape at
the API boundary by synthesising it from the single `who`:

- [`app/api/www/route.ts`](./app/api/www/route.ts) — POST create no longer
  spreads `whoIds`; GET reads only `who` and emits `whoIds: [who]` in the
  response.
- [`app/api/www/[id]/route.ts`](./app/api/www/[id]/route.ts) — PUT drops
  `whoIds` from `select` and `update.data`; reassignment notification
  compares old/new `[who]` lists.

Frontend contract unchanged (requests with `whoIds: [...]` collapse to
`who = whoIds[0]` server-side).

---

## 8. OPSP Review — new columns

### Added
| Column | Renders on | Source |
|---|---|---|
| **Category Type** | first row of group | raw `categoryType` from `CategoryMaster` (`"Cumulative"` / `"CumulativeTillEnd"` / `"Standalone"`) |
| **Last Year Same Period** | every row | Achieved value of the same period one year ago — falls back to `0` |
| **Year Growth** | every row | `current.achieved − lastYearAchieved`, green `+N` / red `−N` / `—` |

### Backend changes
[`app/api/opsp/review/route.ts`](./app/api/opsp/review/route.ts):
- `catMetaMap` now carries `categoryType` (added to Prisma `select`).
- Each row in the response payload includes its `categoryType`.
- New `loadLastYearAchieved()` helper queries the prior-year OPSP(s) for
  the same category and attaches `lastYearAchieved` per `PeriodData`. Branches
  by horizon: Quarter pulls the analogous m-cell; Yearly aggregates Y-1's
  four quarters; 3-5yr aggregates `(year+i)-1`'s four quarters.

### Frontend changes
[`app/(dashboard)/opsp/review/page.tsx`](./app/(dashboard)/opsp/review/page.tsx):
- `PeriodData`, `ReviewRow`, `TableRow` extended.
- `buildTableRows` computes `yearGrowth` per row and per footer.
- Three new column defs inserted into `primaryColumns`.

---

## 9. OPSP Review — `"reviewed"` was treated as `"not finalized"`

### Symptom
After clicking **Submit** on the Quarter Review, the page rendered:
> "OPSP Not Finalized — Your OPSP for 2026-2027 · Q1 is still in **draft** status."
even though the DB had status `"reviewed"` (verified via diagnostic script).

### Root cause
`isFinalized = data?.opspStatus === "finalized"` is strict equality. The
lifecycle is `draft → finalized → reviewed`; once status flips past
`finalized` the check returns `false` and the page rendered the warning
branch. The warning's body text hardcodes the word *draft*, which made the
bug look like a status revert.

### Fix
Introduced a "committed" predicate:

```ts
const isFinalized = data?.opspStatus === "finalized";
const isReviewed  = data?.opspStatus === "reviewed";
const isCommitted = isFinalized || isReviewed;
```

Render gates switched from `!isFinalized` to `!isCommitted`:
- Item-count pill in the header
- "OPSP Not Finalized" warning branch

`isFinalized` / `isReviewed` stay separate for the Submit button's
**Submit** ↔ **Submitted** label flip.

---

## 10. OPSP Review — Yearly + 3-5yr collapsed to one row per category

### Before
- **Yearly tab**: 4 quarter rows (Q1..Q4) + 1 Cumulative footer per category = 5 rows
- **3-5yr tab**: N year rows (2026, 2027, …) + 1 Cumulative footer per category

### After
- **Yearly tab**: **1 row per category** — no Q1..Q4 sub-rows, Period column hidden.
- **3-5yr tab**: **1 row per category** — no year sub-rows, Period column hidden.
- **Quarter tab** — unchanged (m1/m2/m3 + footer).

Editing is only possible from the Quarter tab; the `#` button on
Yearly / 3-5yr rows now renders as plain text instead of opening the
edit modal (Achieved on those tabs is derived from the lower horizon).

### Implementation
[`app/(dashboard)/opsp/review/page.tsx`](./app/(dashboard)/opsp/review/page.tsx):
- `buildTableRows(rows, periodLabels, horizon)` branches on
  `collapse = horizon === "yearly" || horizon === "3to5year"`. In collapse
  mode it emits a single row per category using the same `aggregateByType`
  math the footer would have used.
- `primaryColumns` memo filters out the `period` column when
  `horizon !== "quarter"`.

---

## 11. Aggregation rules — CumulativeTillEnd → SUM

### Change
Previously `CumulativeTillEnd` aggregated by taking the **last filled
period**. Per spec, it now aggregates the same way as `Cumulative` — **SUM**.
Standalone still averages.

| `categoryType` | Aggregation | Footer label |
|---|---|---|
| `Cumulative` | SUM | "Cumulative" |
| `CumulativeTillEnd` | **SUM** (was last-filled) | "Exit" |
| `Standalone` | AVERAGE (fixed denominator) | "Average" |

The footer/Period label is still per type — only the math changed.

### Reusable helpers (shared shape on backend + frontend)
```ts
calculateCumulativeTotal(periods)    // Σ target / Σ achieved
calculateStandaloneAverage(periods)  // (Σ target) / N , (Σ achieved) / N
aggregateByType(categoryType, periods)
  // → dispatches to one of the above
```

Lives in both:
- Backend: [`app/api/opsp/review/route.ts`](./app/api/opsp/review/route.ts)
- Frontend: [`app/(dashboard)/opsp/review/page.tsx`](./app/(dashboard)/opsp/review/page.tsx)

### Effect on the cascade
Quarter → Yearly → 3-5yr aggregations all use the same dispatcher per row's
`categoryType`. For a Standalone category, the chain is *average → average
→ average* across months, then quarters, then years. For Cumulative /
CumulativeTillEnd, *sum → sum → sum*.

---

## 12. Diagnostic + maintenance scripts

Three one-off scripts added under [`scripts/`](./scripts):

| Script | Purpose |
|---|---|
| [`check-opsp-status.ts`](./scripts/check-opsp-status.ts) | Prints the current OPSP record + recent audit log entries for `(email, year, quarter)` — used to confirm what status the Review page is actually seeing. |
| [`debug-review-status.ts`](./scripts/debug-review-status.ts) | Replays the Review page's `isFinalized` / `isReviewed` / `isCommitted` derivation against DB state to confirm which body branch the page will render. |
| [`revert-opsp-status.ts`](./scripts/revert-opsp-status.ts) | Flips a single OPSP's status (e.g. `reviewed → draft`). Idempotent, prints before/after. |
| [`reset-opsp-review.ts`](./scripts/reset-opsp-review.ts) | Resets a finalized/reviewed OPSP for retesting: flips status back to `finalized` AND deletes every `OPSPReviewEntry` for that OPSP (all horizons, all rows, all periods). |

Run via:
```sh
npx tsx --env-file=.env scripts/<name>.ts
```

Edit `EMAIL` / `YEAR` / `QUARTER` (and `NEW_STATUS` where relevant) at the
top of each file before running.

---

## 13. Build-cache invalidation note

While diagnosing §9 (the `isCommitted` gate fix on the Review page), the
running Next.js dev bundle was found to be stale even though the source
file on disk had the fix. Deleting `apps/quikscale/.next/` and restarting
`next dev` forced a fresh compile. Hard-refresh (`Ctrl+Shift+R`) in the
browser also bypasses any cached JS chunks. Keep this in mind when a fix
looks "not applied" but `git diff` confirms it's on disk.

---

## Summary of files touched

### App-level (apps/quikscale)
- `app/(dashboard)/opsp/page.tsx` — Finalize flow + error banner
- `app/(dashboard)/opsp/components/TargetsSection.tsx` — auto-fill
- `app/(dashboard)/opsp/components/GoalsSection.tsx` — dynamic rows + auto-fill
- `app/(dashboard)/opsp/components/ActionsSection.tsx` — auto-fill
- `app/(dashboard)/opsp/components/modals.tsx` — `force` option on `breakdownProjected`
- `app/(dashboard)/opsp/components/OPSPDocument.tsx` — PDF compact mode
- `app/(dashboard)/opsp/hooks/useOPSPForm.ts` — `flushSave`
- `app/(dashboard)/opsp/lib/validateOPSP.ts` — `backfillPeriods`
- `app/(dashboard)/opsp/review/page.tsx` — entire Review revamp (new columns, collapsed views, aggregation)
- `app/api/opsp/route.ts` — POST finalize hardening
- `app/api/opsp/review/route.ts` — `categoryType`, cascade, `lastYearAchieved`, SUM-for-Exit
- `app/api/www/route.ts` — WWW `whoIds` fix (create / list)
- `app/api/www/[id]/route.ts` — WWW `whoIds` fix (update)
- `scripts/*.ts` — diagnostic / reset scripts (4 new files)

### No schema or shared-package changes
All work confined to `apps/quikscale/` per the project scope rule, with the
single exception of relying on the existing `CategoryMaster.categoryType`
field in `packages/database/prisma/schema.prisma` (no migration needed).

---

<a id="opsp-dev-changes-2026-05-14"></a>

# OPSP Developer Changes — 2026-05-14

> *(Source: `apps/quikscale/opspChanges-2026-05-14.md`)*


Single-day log of every change shipped on **2026-05-14**, grouped by feature
area. Each section gives the **symptom / root cause / fix** in the style of
[`opspChanges-2026-05-13.md`](./opspChanges-2026-05-13.md).

Files referenced are relative to `apps/quikscale/` unless noted.

Commits landed on this date (chronological):

| Hash | Subject |
|------|---------|
| `87e75cc` | www changes |
| `d6bd00a` | merge OPSP creation and REview owner remove in key thrust |
| `59c99c8` | changes in OPSP Q1 data Prefilled in Q2 except some fields |
| `1b8ab0e` | in REview Critical Review tab complted |
| `14ebb81` | ai chnages |
| `d7c249d` | Merged with an Eohit |

---

## 1. WWW item — `Unknown argument 'whoIds'` Prisma error

### Symptom
Creating or updating a WWW item failed at the database layer with
`PrismaClientValidationError: Unknown argument 'whoIds'`. The column was being
written by the API route, but the Prisma model exposes only a singular `who`.

### Root cause
The `WWWItem` Prisma model carries a single `who` scalar — there is no `whoIds`
column. The route layer had been wired to mirror the multi-assignee API
contract (`whoIds[]`) directly onto the create / update calls.

### Fix
Keep `whoIds[]` as the **API-boundary contract** (clients still send/receive a
list) but synthesise it server-side from `who`:

- [`app/api/www/[id]/route.ts`](./app/api/www/%5Bid%5D/route.ts) (PUT):
  - Accept either `who` or `whoIds[]` from the client.
  - Always persist a single `who` (mirrored to `whoIds[0]` when a list is
    supplied).
  - Synthesise `whoIds[]` from the persisted `who` on the response shape.
  - Added `shapeWWWResponse(raw, { stripEmail })` to centralise date / email
    normalisation across GET/PUT responses, plus the `WWWUserFull` /
    `WWWUserPublic` types for AI-agent vs human callers.
  - GET path mirrors the explicit `403` cross-tenant guard already used by KPI
    / Priority summary endpoints (defence in depth on top of the `findFirst`
    `orgId` filter).

The same boundary pattern (accept `whoIds`, persist `who`, synthesise the list
on response) applies for collection POST handlers (`app/api/www/route.ts`).

---

## 2. Key Thrusts — drop the Owner column

### What changed
The **Key Thrusts** section on the *Create OPSP* page (3–5 YRS card) used to
carry an Owner column alongside Title. Stakeholders said the owner add no
information for thrusts at that horizon and the column was crowding the row.
It's now removed in three places:

- [`app/(dashboard)/opsp/components/TargetsSection.tsx`](./app/%28dashboard%29/opsp/components/TargetsSection.tsx)
  — Key Thrusts list no longer renders an Owner cell.
- [`app/(dashboard)/opsp/components/modals.tsx`](./app/%28dashboard%29/opsp/components/modals.tsx)
  — `KeyThrustsModal`: Owner input removed; modal width reflowed.
- [`app/(dashboard)/opsp/lib/validateOPSP.ts`](./app/%28dashboard%29/opsp/lib/validateOPSP.ts)
  — Drop the "Key Thrust missing owner" rule from the Finalize validator so
  legacy / new rows both pass.

### Review side (3–5 YRS)
- [`app/(dashboard)/opsp/review/page.tsx`](./app/%28dashboard%29/opsp/review/page.tsx)
  — The 3-to-5-year Review table no longer shows a Who column for thrusts.

**Backward compatibility:** the `keyThrusts` JSON shape on `OPSPData` still
supports an `owner` field if it was previously set; we just stop reading /
writing it. No migration was needed.

---

## 3. OPSP — Q1 → Q2 quarter inheritance flow

### What the user asked for
> After finalize Q1 we need to give access to fill Q2 and Q2 should be
> prefilled with all Q1 values **except** *Action QTR*, *Rocks*,
> *Quarterly Priorities*, *Your Accountability*. The rest stays prefilled.
> Same rule applies for every Q2→Q3, Q3→Q4. For Q4→Q1 of the next year, also
> clear *Goals (1 YR)* and *Key Initiatives* (annual data resets at the year
> boundary).

### Implementation

#### 3.1 Server: GET `/api/opsp` inheritance
[`app/api/opsp/route.ts`](./app/api/opsp/route.ts)

When the requested `(year, quarter)` has no row, or has a **stub row** (no
authored content), the GET handler walks backward to find the most recent
finalized/reviewed OPSP and seeds the new quarter from it:

- Stub detection looks at HTML-stripped `coreValues`, `purpose`, `bhag`,
  `brandPromise`, `profitPerX` plus filled rows in `targetRows` / `goalRows`.
- The carried-over payload omits these per-quarter fields:
  - `actionsQtr` (Action QTR)
  - `rocks`
  - `quarterlyPriorities`
  - `kpiAccountability` (Your Accountability)
- Additionally, when the **target quarter is Q1** (year boundary), also clear:
  - `goalRows` (Goals 1 YR)
  - `keyInitiatives`

#### 3.2 Client: prevent re-seeding of inherited cleared fields
[`app/(dashboard)/opsp/hooks/useOPSPForm.ts`](./app/%28dashboard%29/opsp/hooks/useOPSPForm.ts)

Two one-shot cascade guards prevent the existing cross-section seeders from
clobbering the deliberate empty state on load:

```ts
const skipNextTargetsCascade = useRef(false);
const skipNextGoalsCascade = useRef(false);
```

Set to `true` immediately before every `setForm(...)` inside
`loadForPeriod(...)`. Without these, the Targets→Goals and Goals→Actions
cascades would fire on the inherited render and immediately re-seed
`actionsQtr` from the carried-over `goalRows` — undoing the server's clear.

#### 3.3 Client: pad the two key-value sections on load
[`lib/utils/opspNormalize.ts`](./lib/utils/opspNormalize.ts)

Added `normalizeKVRows(rows, count)` helper. `normalizeLoadedOPSP` now pads
`kpiAccountability` and `quarterlyPriorities` to their expected row count so
the inherited Q2 form renders blank input rows rather than nothing at all.

#### 3.4 ActionsModal — drop the "inherited lock" UI
[`app/(dashboard)/opsp/components/modals.tsx`](./app/%28dashboard%29/opsp/components/modals.tsx)

The previous design grey-padlocked any row that came from an inherited Q1.
User feedback: *"if the user wants to change they should be able to."* The
read-only padlock + tooltip were removed; inherited Action QTR rows are now
fully editable.

---

## 4. OPSP Review — **Critical Review** top-level tab (new feature)

### Context
The *Critical # / Balancing Critical #* cards captured during OPSP authoring
had no review surface. Managers couldn't record Achieved values against the
4 colored bullets (Green / Light Green / Yellow / Red), couldn't see Gap, and
couldn't leave comments.

A new **Critical Review** top-level tab was added next to the existing
**Review** tab on the OPSP Review screen, with sub-tabs for the three modules
(`Actions QTR`, `Year`, `People`).

### 4.1 Layout

Top-level pill toggle below the page title:

```
[ Review ]  [ Critical Review ]      ← new top-level tabs
```

Critical Review tab body:

```
[ Actions QTR ]  [ Year ]  [ People ]      ← module sub-tabs

   Critical # — Growth
   ┌────┬───┬───┬──────────┬────────────────────────┬──────────┬──────┬──────────┐
   │ ☐  │🕒 │ # │  Title   │ Projected (• Color val)│ Achieved │ Gap  │ Comment  │
   ├────┼───┼───┼──────────┼────────────────────────┼──────────┼──────┼──────────┤
   │    │   │   │          │  • Green     100       │   70     │ −30  │   …      │
   │ ☐  │🕒 │ 1 │ Growth   │  • L.Green    80       │   70     │ −10  │   …      │
   │    │   │   │          │  • Yellow     60       │   70     │ +10  │   …      │
   │    │   │   │          │  • Red        40       │   70     │ +30  │   …      │
   └────┴───┴───┴──────────┴────────────────────────┴──────────┴──────┴──────────┘
```

Per-module shows two stacked tables (Critical + Balancing Critical). Empty
cards (no title, all blank bullets) are hidden.

### 4.2 New files

| File | Role |
|------|------|
| [`app/(dashboard)/opsp/review/CriticalReviewSection.tsx`](./app/%28dashboard%29/opsp/review/CriticalReviewSection.tsx) | Tab body. Owns module sub-tabs, GET from `/api/opsp/review/critical`, drawer open/close, parallel POST on Save Changes (≤4 bullets per save), read-only banner for draft/reviewed OPSPs. |
| [`app/(dashboard)/opsp/review/CriticalTable.tsx`](./app/%28dashboard%29/opsp/review/CriticalTable.tsx) | Renders one CritCard as a 4-row table with **checkbox + clock-icon (audit) + S.No + Title** merged vertically via `rowSpan={4}` (mirrors the Review tab). Achieved + Comment are read-only; the `#` button opens the drawer. |
| [`app/(dashboard)/opsp/review/CriticalReviewDrawer.tsx`](./app/%28dashboard%29/opsp/review/CriticalReviewDrawer.tsx) | Right-side slide-in panel with 4 color tabs (Green / Light Green / Yellow / Red). Per-tab fields: Projected (read-only), Achieved (numeric), Gap (derived), Achieved % (derived, traffic-light fill), Comments. Diff-on-save — only the bullets the user actually changed POST. |
| [`app/(dashboard)/opsp/review/helpers.ts`](./app/%28dashboard%29/opsp/review/helpers.ts) | Shared exports — `achievedPctColor()`, `CRIT_BULLET_COLORS`, `CRIT_BULLET_LABELS` — so the table, drawer, and other review tabs all stay in sync. |
| [`app/api/opsp/review/critical/route.ts`](./app/api/opsp/review/critical/route.ts) | GET (loads CritCards + saved entries, keyed `"<module>:<cardType>:<bulletIndex>"`). POST upserts one `OPSPReviewEntry` row per bullet. Auth via `withOrgAuthForModule("opsp")`. |

### 4.3 Page integration
[`app/(dashboard)/opsp/review/page.tsx`](./app/%28dashboard%29/opsp/review/page.tsx)

- Added a `topTab: "review" | "critical"` state (default `"review"`).
- The existing header strip (horizon pills, Primary/Secondary, Submit, search)
  is gated behind `topTab === "review"` so it disappears on the Critical Review
  tab. The year/quarter picker stays visible (shared period selection).
- `loadData()` is gated on `topTab === "review"` — no wasted API call when the
  manager is on Critical Review.
- `isCommitted` now treats both `"finalized"` and `"reviewed"` as committed so
  the Submit tab keeps working after submission (was the cause of the earlier
  "Submit page goes blank after submit" report).
- `readOnly` for the Critical Review drawer is true whenever OPSP is in draft
  or already reviewed.

### 4.4 Data model — no schema migration

Reuses `OPSPReviewEntry` with a new sentinel:

| Column | Value |
|--------|-------|
| `horizon` | `"critical"` |
| `rowIndex` | bullet index `0..3` (Green / Light Green / Yellow / Red) |
| `period` | `"<module>:<cardType>"` — e.g. `"actions:critical"`, `"year:balancing"` |
| `category` | CritCard `title` (denormalised for audit) |
| `targetValue` | parsed Projected (when numeric); null otherwise |
| `achievedValue` | user-entered Achieved |
| `comment` | plain text |

Max 24 rows per OPSP: 4 bullets × 3 modules × 2 cardTypes. No Prisma migration
required.

### 4.5 Audit
Each Critical Review save writes an `AuditLog` row with `entityType: "Review"`
and a `reason` field describing the module / cardType / bulletIndex changed.
("OPSPCriticalReview" is not a value in `AuditEntityType`, so we reuse the
existing "Review" type and disambiguate in `reason` / `changes`.)

---

## 5. OPSP Review — cumulative / standalone aggregation cascade

### Symptom
On the OPSP Review screen, the Yearly tab's *Achieved* column was empty even
though Q1 had been finalized and submitted. The 3-to-5-year tab had the same
issue. Standalone categories also showed wrong roll-ups.

### Root cause
The cascade in `app/api/opsp/review/route.ts` filtered Quarterly entries with
`status: "finalized"` strictly. Once Q1's review had been **submitted**, its
`OPSPData.status` flipped to `"reviewed"` (a strictly later state than
`"finalized"`), and the cascade stopped picking up its rows entirely.

### Fix
Broaden the status filter to include both:

```ts
where: { ..., status: { in: ["finalized", "reviewed"] } }
```

Aggregation rule remains by Category Type:

| Category Type | Quarterly → Yearly | Yearly → 3-to-5 |
|---|---|---|
| `Cumulative` | SUM of quarterly Achieved | SUM of yearly Achieved |
| `CumulativeTillEnd` | **SUM** of quarterly Achieved (not last-filled) | SUM of yearly Achieved |
| `Standalone` | AVG of quarterly Achieved | AVG of yearly Achieved |

When a Yearly category matches a Quarterly category by **name**, the Yearly
Achieved cascade-fills from the SUM/AVG of the Quarterly rows. 3-to-5 cascades
from Yearly the same way.

---

## 6. Member Monthly Punch export — full grouped layout

### Symptom
The Meeting Rhythm member-monthly Excel export shipped a single row per member
with empty value cells.

### Root cause (three plumbing bugs)
1. **Wrong roster source.** The export pulled `memberships` instead of the
   actual meeting attendees (`teamMembers` + `ClientMember`).
2. **`memberScores` never fetched.** The route assembled the layout without
   pulling the punch-in score table.
3. **AB / NA lists wrong.** The export was comparing the wrong sets when
   bucketing Absent / Not Applicable.

### Fix
[`app/api/client-meetings/export/punch/route.ts`](./app/api/client-meetings/export/punch/route.ts)

- Roster derived from `teamMembers` ∪ `ClientMember` rows for the meeting.
- Fetch `memberScores` for every meeting in the date range and join into the
  per-member grid.
- AB / NA bucket comparison uses the new normalised lists.
- Per-block merging: Member Name + Total Weekly Avg cells are now `mergeCells`-d
  **across the whole block including the Total Average row**, with a separator
  row between member blocks so the visual hierarchy matches the reference
  spreadsheet.
- `applyPctFill` reused for the traffic-light cell fill (no new logic).

---

## 7. AI runtime infrastructure (commit `14ebb81`)

### What landed
Bearer-auth plumbing and call-logging for an AI runtime to consume QuikScale
APIs as a first-class actor (rather than impersonating a human session).

| File | Role |
|------|------|
| [`lib/api/withOrgAuth.ts`](./lib/api/withOrgAuth.ts) | `withOrgAuthForModule(...)` now accepts a bearer token in addition to a session cookie. The wrapped handler receives `actingAs: "user" \| "ai_agent"` in its context. AI agents see email stripped from response shapes (e.g. `who_user`, `who_users` on WWW). |
| [`app/api/internal/manifest/route.ts`](./app/api/internal/manifest/route.ts) | Returns the per-tenant API surface (which routes exist, schema slugs) for the AI runtime to introspect. |
| [`app/api/kpi/[id]/summary/route.ts`](./app/api/kpi/%5Bid%5D/summary/route.ts) | Read-only KPI summary endpoint for AI callers — same `orgId` defence-in-depth `403` as the WWW handler. |
| [`app/api/priority/[id]/summary/route.ts`](./app/api/priority/%5Bid%5D/summary/route.ts) | Same shape, for priorities. |
| [`__tests__/api/withOrgAuth-bearer.test.ts`](./__tests__/api/withOrgAuth-bearer.test.ts) | Coverage for the bearer auth path: missing token → 401, bad token → 401, mis-tenant token → 403, valid token → handler runs with `actingAs: "ai_agent"`. |
| [`__tests__/api/internal-manifest.test.ts`](./__tests__/api/internal-manifest.test.ts) | Manifest endpoint coverage. |
| [`__tests__/api/kpi.summary.test.ts`](./__tests__/api/kpi.summary.test.ts) | KPI summary unit tests (401 / 403 / 200). |
| [`__tests__/api/priority.summary.test.ts`](./__tests__/api/priority.summary.test.ts) | Priority summary unit tests. |
| [`__tests__/api/www.get.test.ts`](./__tests__/api/www.get.test.ts) | WWW GET tests including the `actingAs: "ai_agent"` email-stripping path. |
| [`STRUCTURE_FOR_AI.md`](./STRUCTURE_FOR_AI.md) | Top-level guide for the AI runtime — directory structure, auth model, manifest contract. |
| [`.env.example`](./.env.example) | New env vars for bearer-auth secret + AI runtime URL. |
| `packages/database/prisma/migrations/20260513120000_add_acting_as_to_api_call/migration.sql` | Adds `actingAs` column to `api_call_log`. |
| `packages/database/prisma/migrations/20260514130524_add_ai_call_log_quikscale/migration.sql` | Adds the `ai_call_log` table (separate from `api_call_log`) for richer AI-runtime telemetry. |
| `quikscale-ai-runtime.postman_collection.json` (repo root) | Postman collection for testing the new endpoints end-to-end. |

### Known pre-existing typecheck noise
The migration adds `aiCallLog` to the Prisma model, but the local generated
client hasn't been regenerated against the latest migration yet. `npx tsc`
reports two errors on the bearer test + `withOrgAuth.ts` that referencing
`db.aiCallLog`. These will resolve after a clean `prisma generate` — they are
**not** regressions introduced by the changes above.

---

## 8. Reset / debug scripts

Created during the day to drive local DB into the expected states between
tests:

| Script | Purpose |
|--------|---------|
| `scripts/revert-opsp-status.ts` | Revert `OPSPData.status` (e.g. `reviewed` → `draft`). Recreated several times when ad-hoc deleted. |
| `scripts/reset-opsp-review.ts` | Wipe `OPSPReviewEntry` rows and flip the source `OPSPData.status`. |
| `scripts/reset-quarterly-fields.ts` | Clear the four "quarterly" arrays on `OPSPData` (`actionsQtr`, `rocks`, `quarterlyPriorities`, `kpiAccountability`) — used to fix Q2 stubs that had been polluted by a since-fixed cascade. |
| `scripts/debug-opsp-quarters.ts` | Dump every `OPSPData` row (year, quarter, status, what's filled). |
| `scripts/dump-q2-content.ts` | Dump just the Q2 stub for verification. |

---

## Files touched

### Modified
- `app/(dashboard)/opsp/components/TargetsSection.tsx`
- `app/(dashboard)/opsp/components/modals.tsx`
- `app/(dashboard)/opsp/hooks/useOPSPForm.ts`
- `app/(dashboard)/opsp/lib/validateOPSP.ts`
- `app/(dashboard)/opsp/review/page.tsx`
- `app/api/client-meetings/export/punch/route.ts`
- `app/api/opsp/route.ts`
- `app/api/www/[id]/route.ts`
- `lib/api/withOrgAuth.ts`
- `lib/utils/opspNormalize.ts`
- `.env.example`

### Created
- `app/(dashboard)/opsp/review/CriticalReviewSection.tsx`
- `app/(dashboard)/opsp/review/CriticalReviewDrawer.tsx`
- `app/(dashboard)/opsp/review/CriticalTable.tsx`
- `app/(dashboard)/opsp/review/helpers.ts`
- `app/api/opsp/review/critical/route.ts`
- `app/api/internal/manifest/route.ts`
- `app/api/kpi/[id]/summary/route.ts`
- `app/api/priority/[id]/summary/route.ts`
- `__tests__/api/internal-manifest.test.ts`
- `__tests__/api/kpi.summary.test.ts`
- `__tests__/api/priority.summary.test.ts`
- `__tests__/api/withOrgAuth-bearer.test.ts`
- `__tests__/api/www.get.test.ts`
- `STRUCTURE_FOR_AI.md`

### Out of repo (root or `packages/`)
- `packages/database/prisma/migrations/20260513120000_add_acting_as_to_api_call/migration.sql`
- `packages/database/prisma/migrations/20260514130524_add_ai_call_log_quikscale/migration.sql`
- `quikscale-ai-runtime.postman_collection.json`

### Out of scope (explicitly NOT touched)
- `app/api/opsp/review/route.ts` (primary/secondary GET/POST)
- `app/api/opsp/review/secondary/route.ts`
- `app/api/opsp/review/submit/route.ts`
- Prisma `OPSPData` / `OPSPReviewEntry` schema (no field added; Critical
  Review encodes via existing columns).
- The Excel / PDF export pipelines (unrelated to Critical Review).
- The 4 locked tables (KPI individual, KPI teams, Priority, WWW) — none of
  their cell styling was touched (per the repo-wide "do not theme locked
  tables" rule).

---

## Verification

1. **Static**
   ```bash
   cd apps/quikscale && npx tsc --noEmit -p tsconfig.json
   ```
   The only remaining errors are the pre-existing `aiCallLog` / `actingAs`
   ones from the migration not yet being reflected in the generated Prisma
   client (`prisma generate`).

2. **Manual — Review tab regression**
   - `/opsp/review` defaults to Review tab.
   - Quarter / Yearly / 3-5 Years pills swap content correctly.
   - Submit POSTs to `/api/opsp/review/submit` and flips status to `reviewed`.
   - After Submit, the screen stays usable (no more "blank Submit tab" bug).

3. **Manual — Critical Review tab**
   - Toggle to Critical Review → 3 module sub-tabs render.
   - Color dots match the editor palette (Green / Light Green / Yellow / Red).
   - Numeric Projected → Achieved enabled, Gap live, Achieved % traffic-light.
   - Non-numeric Projected → Achieved disabled, Gap "—", Comment still
     editable.
   - Save Changes only POSTs the bullets the user actually changed.
   - Empty cards hidden entirely.
   - OPSP draft / reviewed → inputs read-only with banner.

4. **Manual — Q1 → Q2 inheritance**
   - Finalize Q1 → Q2 opens with all blocks prefilled **except** Action QTR,
     Rocks, Quarterly Priorities, Your Accountability.
   - Year boundary (Q4 → next Q1) additionally clears Goals (1 YR) and Key
     Initiatives.
   - Editing inherited fields persists correctly.

5. **DB inspection**
   ```sql
   SELECT * FROM app_quikscale."OPSPReviewEntry"
   WHERE horizon = 'critical' ORDER BY "createdAt" DESC LIMIT 24;
   ```
   Rows match the saved entries; `period` like `"year:critical"` /
   `"actions:balancing"`; `rowIndex` 0..3.

---

<a id="roles-technical"></a>

# Roles — Complete Technical Documentation

> *(Source: `apps/quikscale/docs/roles.md`)*


**App:** QuikScale (Goal Performance OS)
**UI location:** Org Setup → Users → **User Management** tab → Roles
**Schema namespace:** `app_quikscale`
**Last updated:** 2026-05-15

> This document covers ONLY the Roles concept in QuikScale — what a role is, how it's stored, how to create / rename / set-default / delete one, how the matrix works, and how members are attached. For the user-invitation flow see [`userInviteFlow.md`](userInviteFlow.md). For permission gates and authorization see [`rolesPermissionsAndUserInvitation.md`](rolesPermissionsAndUserInvitation.md).

---

## Table of Contents

1. [What a Role Is](#1-what-a-role-is)
2. [Role Types](#2-role-types)
3. [The AppRole Database Model](#3-the-approle-database-model)
4. [Role Lifecycle](#4-role-lifecycle)
5. [Creating a Role (UI + API)](#5-creating-a-role-ui--api)
6. [Editing a Role's Permissions](#6-editing-a-roles-permissions)
7. [Renaming a Role / Updating Description](#7-renaming-a-role--updating-description)
8. [The "Default for new users" Flag](#8-the-default-for-new-users-flag)
9. [Deleting a Role](#9-deleting-a-role)
10. [Managing Role Members](#10-managing-role-members)
11. [Seeded Roles & Auto-Top-Up](#11-seeded-roles--auto-top-up)
12. [Admin-Lockout Safety Net](#12-admin-lockout-safety-net)
13. [API Reference](#13-api-reference)
14. [Edge Cases](#14-edge-cases)
15. [Key Files](#15-key-files)

---

## 1. What a Role Is

A **Role** in QuikScale is a named bundle of permissions that belongs to **one organization** and **one app** (QuikScale).

- A role groups `(resource, action)` grants — e.g. `("KPI", "create")`, `("Priority", "update")`.
- A user is assigned to a role via the `UserAppRole` join table.
- A user can hold **multiple** roles in the same org; their effective permissions are the UNION across all their roles plus any per-user extras.
- Roles are tenant-scoped — Org A's "Manager" role and Org B's "Manager" role are two separate rows with independent permission sets.

The relationship at a glance:

```
                 ┌───────────────────────────────┐
                 │           AppRole             │
                 │  id, orgId, appId, name,      │
                 │  description, isSystem,       │
                 │  isDefault                    │
                 └──┬──────────────────────┬─────┘
                    │                      │
                    │ permissions[]        │ members[]
                    ▼                      ▼
        ┌────────────────────┐   ┌──────────────────────┐
        │  RolePermission    │   │     UserAppRole      │
        │  roleId, resource, │   │  userId, orgId,      │
        │  action            │   │  roleId, assignedBy  │
        └────────────────────┘   └──────────────────────┘
```

---

## 2. Role Types

| Type | `isSystem` | `isDefault` | Examples | Editable name? | Editable permissions? | Deletable? |
|---|---|---|---|---|---|---|
| **System role** | `true` | usually `false` | `admin` | ❌ No — rename blocked | ✅ Yes — admin permissions are editable | ❌ No — protected |
| **Default role** | `false` | `true` | `User` (seeded) | ✅ Yes | ✅ Yes | ✅ Yes (but a new default must be set first or new invites fall back to admin) |
| **Custom role** | `false` | `false` | `Acountablity User`, `Manager`, `Viewer`, anything an admin creates | ✅ Yes | ✅ Yes | ✅ Yes |

### admin (system role)

- Created by `seedAdminAppRole()` on first request to `/api/me/permissions` for the org.
- Seeded with every `(resource, action)` pair from the permission tree.
- Permissions are **editable** — there is no admin bypass in the permission gate.
- Name and `isSystem` flag cannot be changed via API (PATCH refuses with 400 "System roles cannot be modified").
- Cannot be deleted (DELETE refuses with 400 "System roles cannot be deleted").
- Protected by the **admin-lockout guard** (see §12) — last admin cannot be removed.

### User (default role)

- Created by `seedUserAppRole()` on first request to `/api/me/permissions` for the org.
- Marked `isDefault=true` so new invitees auto-join here.
- Seeded with curated grants:
  - `view` on every leaf in the permission tree
  - `update` on `KPI`, `Priority`, `WWW`
- `isSystem=false` — admin can rename, redefine, or delete it. Setting another role as default automatically demotes "User".

### Custom roles

- Created by admins via `POST /api/org/roles` from the UI (the "+" button next to "Roles").
- `isSystem=false`, `isDefault=false` unless explicitly checked.
- Start with **zero** `RolePermission` rows — the admin must tick boxes in the matrix and save to grant anything.

---

## 3. The AppRole Database Model

```prisma
model AppRole {
  id          String           @id @default(cuid())
  orgId       String           // tenant
  appId       String           // always the QuikScale app row
  name        String           // unique within (orgId, appId)
  description String?
  isSystem    Boolean          @default(false)  // protects rename/delete
  isDefault   Boolean          @default(false)  // exactly one true per (orgId, appId)
  createdAt   DateTime         @default(now())
  updatedAt   DateTime         @updatedAt
  createdBy   String?          // userId of the admin who created it

  app         App              @relation(fields: [appId], references: [id], onDelete: Cascade)
  org         Org              @relation(fields: [orgId], references: [id], onDelete: Cascade)
  permissions RolePermission[] // 0..N grants
  members     UserAppRole[]    // 0..N user assignments

  @@unique([orgId, appId, name])
  @@index([orgId, appId])
  @@schema("app_quikscale")
}
```

### Key constraints

- **`(orgId, appId, name)` unique** — two roles in the same org cannot share a name. Two orgs can both have an "Admin" role.
- **`(orgId, appId, isDefault=true)` should be unique** — enforced by application logic, not a DB constraint. Every create/update that sets `isDefault=true` first runs `updateMany({ where: isDefault: true }, { data: { isDefault: false } })` to demote any prior default.
- **`onDelete: Cascade`** on `appId`/`orgId` — if the org or app row is deleted, every role goes with it.
- **Cascading children** — deleting an AppRole cascades to `RolePermission` and `UserAppRole`. Users on the role lose the assignment; their `OrgMember` row is untouched.

### Related tables

| Table | Relationship |
|---|---|
| `RolePermission(roleId, resource, action)` | 0..N grants per role — defines WHAT the role can do |
| `UserAppRole(userId, orgId, roleId)` | 0..N members per role — defines WHO holds the role |
| `UserPermissionExtra(orgId, userId, resource, action)` | Not a role table — per-user additive grants on top of role grants |
| `OrgMember.role` | Legacy string column (`admin`/`manager`/`member`) on the OrgMember row. **Not** the same as `AppRole`. Kept for back-compat — does not drive permission decisions. |

---

## 4. Role Lifecycle

```
                     ┌─────────────────────────────────┐
                     │  Org created / first user logs  │
                     │  in / /api/me/permissions hits  │
                     └────────────────┬────────────────┘
                                      │
                                      ▼
                     ┌─────────────────────────────────┐
                     │ seedAllDefaultRoles(orgId)      │
                     │  • admin AppRole + all grants   │
                     │  • User  AppRole + curated      │
                     │  • backfill legacy rows         │
                     │  • top-up admin perms           │
                     │  (5-min in-process cache)       │
                     └────────────────┬────────────────┘
                                      │
                                      ▼
              ┌───────────────────────────────────────────────┐
              │       Roles exist for the org                 │
              │       Admin can now manage via the UI         │
              └──────────┬────────────────┬───────────────────┘
                         │                │
              ┌──────────┘                └─────────────┐
              ▼                                          ▼
   ┌──────────────────────┐                  ┌───────────────────────┐
   │ POST /api/org/roles  │                  │  Edit existing role:  │
   │ Create custom role   │                  │  • PATCH (rename/     │
   │  (starts empty)      │                  │     desc/default)     │
   └──────────┬───────────┘                  │  • PUT permissions    │
              │                              │  • PUT members        │
              ▼                              │  • DELETE (non-sys)   │
   ┌──────────────────────┐                  └───────────────────────┘
   │ PUT permissions for  │
   │ the new role (grants)│
   └──────────────────────┘
```

---

## 5. Creating a Role (UI + API)

### UI — "Add Role" form

(See screenshot.) Clicking the **+** button in the Roles list shows an inline form:

| Field | Required? | Behavior |
|---|---|---|
| **Role name** | ✅ Yes | 1–64 characters, trimmed. Must be unique within the org. |
| **Default for new users** | ❌ Optional | When ticked, the new role becomes the default for invitees — the previous default is demoted automatically. |
| **Add Role** button | — | Disabled until "Role name" has content. |
| **Cancel** link | — | Closes the form without writing anything. |

When the admin clicks **Add Role**:
1. The button shows a spinner while the request is in flight.
2. On success, the new role appears in the list and the matrix on the right switches to it (all checkboxes blank — admin must grant permissions and save).
3. On 409 conflict ("Role already exists"), the form shows an inline error and keeps the input.

### API — `POST /api/org/roles`

**Request:**

```http
POST /api/org/roles
Content-Type: application/json
Cookie: next-auth.session-token=...

{
  "name": "Manager",
  "description": "Team manager with edit access",   // optional, ≤ 500 chars
  "isDefault": false                                 // optional, default false
}
```

**Validation (Zod):**

| Rule | Error |
|---|---|
| `name` is 1–64 chars, trimmed | 400 — "Name is required" / Zod max error |
| `description` ≤ 500 chars or null | 400 — Zod max error |
| `isDefault` is boolean or absent | 400 — Zod type error |

**Server logic:**

1. `requireAdmin()` — caller must hold the admin role. 403 if not.
2. Resolve QuikScale `App.id` (cached).
3. `findUnique` on `(orgId, appId, name)` — 409 if a row already exists.
4. If `isDefault=true`, `updateMany` previous defaults in same scope to `false`.
5. `appRole.create({ orgId, appId, name, description, isSystem:false, isDefault, createdBy })`.

**Response (201):**

```json
{
  "success": true,
  "data": {
    "id": "role_xyz",
    "name": "Manager",
    "description": "Team manager with edit access",
    "isSystem": false,
    "isDefault": false,
    "createdAt": "2026-05-15T10:00:00Z",
    "updatedAt": "2026-05-15T10:00:00Z"
  }
}
```

> ⚠️ The new role has **zero** `RolePermission` rows. Users assigned to this role will have no permissions until the admin opens the matrix, ticks boxes, and clicks Save.

---

## 6. Editing a Role's Permissions

### UI — The Permission Matrix

When a role is selected in the left rail, the right pane shows the **RolePermissionMatrix**:

- Columns: **View / Create / Update / Delete**
- Rows: module (header, tristate) → leaf (individual checkbox)
- Cells where the action isn't defined for a leaf render `—` (e.g. `Dashboard` only has View; Create/Update/Delete are `—`)

**Tristate behavior on module rows:**

| State | Meaning |
|---|---|
| ☐ unchecked | 0 children have this action |
| ☑ checked | ALL valid children have this action |
| ☒ indeterminate (dash glyph) | Some children have it, some don't |

Clicking a module-row checkbox toggles every valid child leaf in that column.

**Dirty state:** the component diffs current vs. server state. When any cell differs, a sticky bottom bar appears with **Discard** and **Save** buttons. Closing the page or switching roles while dirty shows a confirm prompt.

### API — `PUT /api/org/roles/[id]/permissions`

**Request (full replace — server takes the desired set):**

```http
PUT /api/org/roles/<roleId>/permissions
Content-Type: application/json

{
  "permissions": [
    { "resource": "KPI",        "action": "view"   },
    { "resource": "KPI",        "action": "update" },
    { "resource": "Priority",   "action": "view"   },
    { "resource": "OPSP.History.EditFinalize", "action": "update" }
  ]
}
```

**Validation:** every `(resource, action)` must pass `isValidPermissionPair()` — the leaf must exist in the registry AND list the action in its `actions` array. Garbage pairs like `{resource: "Dashboard", action: "delete"}` are rejected before any DB write.

**Server logic (atomic):**

```typescript
await db.$transaction(async (tx) => {
  await tx.rolePermission.deleteMany({ where: { roleId } });
  if (permissions.length > 0) {
    await tx.rolePermission.createMany({
      data: permissions.map(p => ({ roleId, resource: p.resource, action: p.action })),
    });
  }
});
```

Full replace — passing `permissions: []` revokes everything.

**Response (200):**

```json
{ "success": true, "data": { "roleId": "role_xyz", "count": 4 } }
```

### How the matrix knows about a role's permissions

`GET /api/org/roles/[id]/permissions` returns the full grant list. The component hydrates each cell from this response, then tracks edits locally until Save.

---

## 7. Renaming a Role / Updating Description

### API — `PATCH /api/org/roles/[id]`

```http
PATCH /api/org/roles/<roleId>
Content-Type: application/json

{
  "name": "Team Lead",                    // optional
  "description": "Manages a single team", // optional, null clears
  "isDefault": false                      // optional
}
```

**Server logic:**

1. `requireAdmin()`.
2. `appRole.findFirst({ id, orgId })` — 404 if not found.
3. **If `isSystem=true` → 400 "System roles cannot be modified"** — admin row's name and isDefault are frozen.
4. If `name` changed → check uniqueness on `(orgId, appId, name)` → 409 on dup.
5. If `isDefault=true` → `updateMany` to demote previous defaults.
6. `appRole.update({ ... })` applying the changed fields.

### Why is admin's name frozen?

`isAdminRole()` in `permissions.ts` looks for `isSystem && name === "admin"`. Renaming admin would break:
- The seeded admin-detection in `loadMyPermissions().isAdmin`
- The admin-lockout guard (`getAdminRoleId` filters by name)
- `requireAdmin()` (filters by role name "admin")

So the name is a stable identifier, not a label.

---

## 8. The "Default for new users" Flag

`AppRole.isDefault=true` means: **new invitees through `POST /api/org/users` are auto-assigned this role.**

### Invariant

At most one role per `(orgId, appId)` should have `isDefault=true`. This is **not** a DB constraint — it's enforced by every write that touches the flag:

- `POST /api/org/roles` with `isDefault=true` → `updateMany` previous defaults to `false` before insert.
- `PATCH /api/org/roles/[id]` with `isDefault=true` → same pre-step.
- `seedUserAppRole(orgId)` — only creates the "User" role + sets `isDefault=true` if no existing role with that name. If demoting an existing default to make room, it does so in the same transaction.

### What if no role has isDefault?

- The invite handler will fall through to "User" by lookup name. If the seeded "User" role was deleted and no replacement was marked default, the invite handler raises in the seeder — the new user still gets the **admin** role as the safety-net (the "first user in admin-less org" path also handles this).

### Setting a different default

In the UI, edit any non-system role's settings and tick "Default for new users", then Save. Server demotes the prior default. Backend equivalent:

```http
PATCH /api/org/roles/<roleId>
{ "isDefault": true }
```

---

## 9. Deleting a Role

### UI

Hover any non-system row in the Roles list → a trash icon appears at the right. Click → confirm dialog showing **"N user(s) currently hold this role. Deleting will remove their role assignment."** Confirm → role is gone.

### API — `DELETE /api/org/roles/[id]`

**Server logic:**

1. `requireAdmin()`.
2. `appRole.findFirst({ id, orgId })` with `_count.members` — 404 if not found.
3. **If `isSystem=true` → 400 "System roles cannot be deleted"** — admin is protected.
4. `appRole.delete({ id })` — `onDelete: Cascade` removes:
   - All `RolePermission` rows for this role.
   - All `UserAppRole` rows for this role (users lose the assignment).

**Response (200):**

```json
{
  "success": true,
  "data": { "id": "role_xyz", "affectedUsers": 3 },
  "message": "Role deleted. 3 user(s) lost their role assignment."
}
```

### What happens to users who lose their only role?

Their `UserAppRole` row is deleted by cascade. They keep their `User`, `OrgMember`, `UserTeam`, and `UserAppAccess` rows — they remain org members with QuikScale access — but `loadMyPermissions()` will return zero permissions until an admin reassigns them. The sidebar collapses to empty (except feature-flag-only items without a `NAV_RESOURCE` mapping).

The admin must reassign them via `PATCH /api/org/users/[id]/role` or by toggling members on a different role.

---

## 10. Managing Role Members

A role's members are stored in `UserAppRole`. The role-edit UI has a "Members" tab (or the user-list approach via `POST /api/org/users/[id]/role`).

### Listing members — `GET /api/org/roles/[id]/members`

```json
{
  "success": true,
  "data": {
    "roleId": "role_xyz",
    "members": [
      { "id": "user_a", "firstName": "Jane",  "lastName": "Smith", "email": "..." },
      { "id": "user_b", "firstName": "Ravi",  "lastName": "Patel", "email": "..." }
    ]
  }
}
```

### Reconciling members — `PUT /api/org/roles/[id]/members`

The body carries the **full desired** member list. The server reconciles:

```http
PUT /api/org/roles/<roleId>/members
{ "userIds": ["user_a", "user_b", "user_c"] }
```

**Server logic (transactional):**

1. `requireAdmin()` + verify role belongs to this org.
2. **Admin-lockout guard:** if the role being reconciled IS the admin role AND `userIds` is empty → 409 "Cannot reconcile the admin role to an empty member list".
3. Filter `userIds` to those who already have `UserAppAccess` for QuikScale. Users without it are reported back in `skippedUserIds` — the admin must invite them first.
4. `userAppRole.deleteMany({ roleId, orgId, userId: { notIn: eligible } })` — detach users no longer in the desired set.
5. For each `userId` in the desired set who doesn't already have a `UserAppRole` row → `userAppRole.create({ ... })`.

**Response:**

```json
{
  "success": true,
  "data": {
    "roleId": "role_xyz",
    "detached": 1,
    "attached": 2,
    "skippedUserIds": ["user_q"]  // user_q has no QuikScale access yet
  }
}
```

### Alternative — change a single user's role

For one-off changes, `PATCH /api/org/users/[id]/role { roleId: "<newRoleId>" }` is the targeted call. It also runs the admin-lockout guard.

---

## 11. Seeded Roles & Auto-Top-Up

The first authenticated request to `/api/me/permissions` for a given org triggers `seedAllDefaultRoles(orgId)`:

| Step | What it does | Idempotent? |
|---|---|---|
| `seedAdminAppRole(orgId)` | Create admin `AppRole` if missing. Fill ALL `RolePermission` rows ONLY if the role has zero grants. | ✅ Yes |
| `seedUserAppRole(orgId)` | Create "User" `AppRole` with `isDefault=true` if missing. Fill curated grants ONLY if zero. Demote previous defaults first. | ✅ Yes |
| `backfillLegacyResources(orgId)` | Replace pre-v2 flat resource keys (`OPSP`, `Individual`) with new dot-namespaced ones (`OPSP.Create`, `OPSP.History`, …). One-time per row. | ✅ Yes (no-op after replacement) |
| `backfillAdminPermissions(orgId)` | For any `(resource, action)` pair that exists in the registry but NOT on the admin row, insert it. Catches admins of existing orgs missing newly-added resources. Only touches admin. | ✅ Yes |

**Cache:** 5-minute in-process Map keyed by `orgId`. Subsequent requests within the window skip the DB work and return the cached `{ adminRoleId, userRoleId }`.

### Why "top-up" matters

When developers add a new module to `PERMISSION_TREE` (e.g. Analytics, People, ClientMeetings.Dashboard), existing orgs' admin role would miss those grants forever. `backfillAdminPermissions` fixes that on the next request — **without** clobbering admin-deliberate un-checks on existing resources.

Non-admin roles are NOT auto-topped-up — admins must explicitly tick new permissions for custom roles.

---

## 12. Admin-Lockout Safety Net

The v2 model removed the admin permission bypass. Without a safety net, an admin could:

(a) un-check every permission on the admin role → admin loses access
(b) remove themselves from the admin role with no other admin remaining → org locked out of role management

### Mitigation (a) — handled by `userCan`

A fully-empty admin role just behaves like a no-grants role. The UI surfaces a warning in the matrix. The user can still log in (they are authenticated) but they will see an empty sidebar. There is no programmatic refusal to save the empty matrix — admins can do this if they really want to (and recover by adding a permission back via the matrix).

### Mitigation (b) — `preventAdminLockout.ts`

Three guards refuse operations that would leave the admin role with 0 members:

| Function | Used by |
|---|---|
| `assertWouldNotEmptyAdmin({ orgId, userId })` | `PATCH /api/org/users/[id]/role` — refuses to swap the user off admin if they're the last one |
| `assertReconcileLeavesAdminPopulated({ orgId, roleId, nextUserIds })` | `PUT /api/org/roles/[id]/members` — refuses to reconcile admin to an empty list |
| `assertRoleDeletable({ orgId, roleId })` | (Future) refuses to delete admin or any role with active members |

All three throw `AdminLockoutError`; the caller catches and returns 409 with the friendly message.

### What if the admin role is deleted from the DB directly?

The seeder will recreate it with full grants on the next `/api/me/permissions` hit. The seed cache will miss (admin role lookup returns null), full seed runs.

---

## 13. API Reference

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/org/roles` | List all roles for the current org + member counts + permission counts |
| `POST` | `/api/org/roles` | Create a new custom role (empty grants) |
| `GET` | `/api/org/roles/[id]` | Fetch one role with full permission list and member count |
| `PATCH` | `/api/org/roles/[id]` | Rename / update description / set default. Refused for `isSystem=true` |
| `DELETE` | `/api/org/roles/[id]` | Delete a non-system role. Cascades to `RolePermission` + `UserAppRole` |
| `GET` | `/api/org/roles/[id]/permissions` | Fetch the grant matrix for one role |
| `PUT` | `/api/org/roles/[id]/permissions` | Atomic full-replace of grants. Validates every `(resource, action)` |
| `GET` | `/api/org/roles/[id]/members` | List the users currently on this role |
| `PUT` | `/api/org/roles/[id]/members` | Reconcile membership. Lockout-guarded for admin role |
| `PATCH` | `/api/org/users/[id]/role` | Change a single user's role. Lockout-guarded |

All routes require the caller to hold the admin role (`requireAdmin()`) and to be a member of the org (`getOrgId` resolves from session).

---

## 14. Edge Cases

| Scenario | Behavior |
|---|---|
| Two admins simultaneously rename a role to the same name | The second `PATCH` hits the `(orgId, appId, name)` unique constraint → 409 returned to the loser. First wins. |
| Admin creates a role with `isDefault=true` while another role already has it | The existing default is demoted (`updateMany`) before the new row is inserted. Same logical transaction window. |
| Admin deletes the seeded "User" role while it's marked default | Allowed — role is gone, no default exists. Next invite either falls back to a different default if one exists, or auto-promotes the invitee to admin if the org has zero admins. Recreating "User" via the seeder requires admin to call `/api/me/permissions` (which re-runs the seeder); it will be `isDefault=true` only if NO other default exists at that moment. |
| Role is renamed while users are on it | No data change to `UserAppRole` — it stores `roleId`, not the name. Affected users keep their assignment. The new name shows everywhere immediately (role-name is fetched on each `useMyPermissions` poll). |
| Custom role created with same name as a previously-deleted role | Allowed — the old row is gone. The `(orgId, appId, name)` unique constraint applies to live rows only. |
| Two roles both have `isDefault=true` (data anomaly) | Should not happen, but if it did: invite handler picks the **seeded "User" role by name lookup** first; if missing, falls back to whichever default Prisma returns first (`findFirst`). Run a one-off fix to demote duplicates. |
| User holds two roles, one grants `(KPI, create)` and one doesn't | Granted — UNION semantics. There is no deny-precedence. |
| Role's matrix saved with 0 permissions, but role still has 5 members | Members keep their `UserAppRole` rows but `loadMyPermissions()` returns empty permissions for them. Sidebar collapses to feature-flag-only items. |
| Org has no QuikScale `App.id` registered | All role routes return 500 "QuikScale app not registered". Roles cannot be created until the platform-level App row exists. |

---

## 15. Key Files

| Concern | File |
|---|---|
| Schema model | [`packages/database/prisma/schema.prisma`](packages/database/prisma/schema.prisma) — `AppRole` L756, `RolePermission` L794, `UserAppRole` L777 |
| Role list / create | [`apps/quikscale/app/api/org/roles/route.ts`](apps/quikscale/app/api/org/roles/route.ts) |
| Role detail / rename / delete | [`apps/quikscale/app/api/org/roles/[id]/route.ts`](apps/quikscale/app/api/org/roles/[id]/route.ts) |
| Role permissions matrix | [`apps/quikscale/app/api/org/roles/[id]/permissions/route.ts`](apps/quikscale/app/api/org/roles/[id]/permissions/route.ts) |
| Role members reconcile | [`apps/quikscale/app/api/org/roles/[id]/members/route.ts`](apps/quikscale/app/api/org/roles/[id]/members/route.ts) |
| User role swap | [`apps/quikscale/app/api/org/users/[id]/role/route.ts`](apps/quikscale/app/api/org/users/[id]/role/route.ts) |
| Default-role seeders | [`apps/quikscale/lib/api/seedAdminAppRole.ts`](apps/quikscale/lib/api/seedAdminAppRole.ts) |
| Lockout guard | [`apps/quikscale/lib/api/preventAdminLockout.ts`](apps/quikscale/lib/api/preventAdminLockout.ts) |
| Permission tree (resource catalog used by the matrix) | [`apps/quikscale/lib/api/permissionsRegistry.ts`](apps/quikscale/lib/api/permissionsRegistry.ts) |
| Admin gate used by every role route | [`apps/quikscale/lib/api/requireAdmin.ts`](apps/quikscale/lib/api/requireAdmin.ts) |
| Roles tab UI | [`apps/quikscale/app/(dashboard)/org-setup/users/components/RolesTab.tsx`](apps/quikscale/app/(dashboard)/org-setup/users/components/RolesTab.tsx) |
| Permission matrix UI | [`apps/quikscale/app/(dashboard)/org-setup/users/components/RolePermissionMatrix.tsx`](apps/quikscale/app/(dashboard)/org-setup/users/components/RolePermissionMatrix.tsx) |

---

**End of document.**

---

<a id="roles-permissions-invitation"></a>

# Roles, Permissions & User Invitation — Technical Documentation

> *(Source: `apps/quikscale/docs/rolesPermissionsAndUserInvitation.md`)*


**App:** QuikScale (Goal Performance OS)
**Schema namespace:** `app_quikscale`
**Doc version:** v2 (dynamic roles)
**Last updated:** 2026-05-15

> Audience: backend/frontend developers, new joiners, future maintainers.
> Scope: everything in `apps/quikscale/` that touches authn/authz — the Manage Roles & Permissions matrix, the Add New User modal, the API routes that back them, the DB tables they write to, and the runtime gates that enforce the result.

---

## Table of Contents

1. [Role & Permission System Overview](#1-role--permission-system-overview)
2. [Database Table Flow](#2-database-table-flow)
3. [User Invitation Flow](#3-user-invitation-flow)
4. [Permission Checking Flow](#4-permission-checking-flow)
5. [UI Behavior Documentation](#5-ui-behavior-documentation)
6. [Complete Authorization Flow](#6-complete-authorization-flow)
7. [Appendix — Code References](#7-appendix--code-references)

---

## 1. Role & Permission System Overview

### 1.1 What is RBAC in QuikScale?

QuikScale uses a **Role-Based Access Control (RBAC) v2** model:

- A **role** is a named bag of permissions belonging to one organization and one app (here, QuikScale).
- A **permission** is a `(resource, action)` pair.
- A **user** inherits all permissions of every role they hold + any per-user additive extras.

The effective permission set for a user is:

```
effective(user, org) = UNION(role.permissions for role in user.roles)
                     ∪ extras(user, org)
```

There is **no admin bypass**. The seeded `admin` role gets every permission ticked on creation, but those rows live in `RolePermission` like any other role's grants — they can be edited or revoked. The `isSystem=true` flag on `admin` only protects against **rename/delete**, never against permission checks. ([permissions.ts:48-51](apps/quikscale/lib/api/permissions.ts#L48-L51))

A safety net (`preventAdminLockout.ts`) refuses any operation that would leave the org with zero admins, so an admin can't accidentally lock the org out of role management.

### 1.2 Resources & Actions

| Concept | Storage | Example |
|---|---|---|
| **Resource** | open-ended dot-namespaced string | `KPI`, `TeamKPI`, `OPSP.History`, `OPSP.History.EditFinalize`, `Analytics.Scorecard` |
| **Action** | one of four verbs | `view`, `create`, `update`, `delete` |
| **Permission** | `(resource, action)` row in `RolePermission` | `("KPI", "create")` |

The full resource catalog is the **permission tree**, defined in [`apps/quikscale/lib/api/permissionsRegistry.ts`](apps/quikscale/lib/api/permissionsRegistry.ts). The DB never sees the hierarchy — it only stores flat `(resource, action)` rows. The tree exists in TypeScript so the matrix UI can render module → submodule → leaf and so the server can validate that a posted `(resource, action)` pair is real.

### 1.3 The four CRUD-V actions

| Action | UI effect (typical) | API effect |
|---|---|---|
| `view` | Sidebar entry visible, list endpoints return data, detail pages load | `GET` routes pass |
| `create` | Add / + button visible, create modal opens | `POST` routes pass |
| `update` | Edit button visible, inline edit unlocked, drag-reorder enabled | `PATCH` / `PUT` routes pass |
| `delete` | Trash icon visible, delete action callable | `DELETE` routes pass |

Rules of thumb that the UI follows:

- **Missing `view`** → entire menu item, page, and any link to it are hidden. The sidebar filter cascades — a parent group with zero visible children collapses.
- **Has `view` but missing `create`** → the page is read-only. The "+ Add" / "+ New" button on top is hidden by `useMyPermissions().has(resource, "create")`.
- **Missing `update`** → row Edit buttons hidden, inline edit disabled, but the page is still browsable.
- **Missing `delete`** → trash icons hidden, but the row still renders.

### 1.4 Module-level vs Entity-level vs Sub-permission

The permission matrix has three levels of detail:

```
Module (= sidebar group, e.g. "KPI")
└── Entity / Leaf (= one row in the matrix, e.g. "Individual KPI" → resource "KPI")
    └── Sub-leaf (rare — e.g. "Edit after Finalize" under "OPSP History")
```

Module rows in the matrix are **virtual** — they don't have their own DB rows. Their checkboxes are **tristate** computed from the children: ticking the module row ticks every child leaf for that action column; unticking does the inverse.

Module → leaf inventory:

| Module | Leaves (resource keys) |
|---|---|
| Dashboard | `Dashboard` (view-only) |
| KPI | `KPI` (Individual), `TeamKPI` (Teams) |
| Priority | `Priority` |
| Org Setup | `Team` (Teams), `User` (Users), `Quarter` (Quarter Settings) |
| WWW | `WWW` |
| Meeting Rhythm | `ClientMeetings.Dashboard` (view-only), `ClientMaster`, `ClientMember`, `DailyHuddle`, `WeeklyMeeting` |
| OPSP | `OPSP.Create`, `OPSP.History` (+ sub-leaf `OPSP.History.EditFinalize`), `OPSP.Review`, `OPSP.Categories` |
| Analytics | `Analytics.Scorecard`, `Analytics.Individual`, `Analytics.Teams`, `Analytics.Trends` (all view-only) |
| People | `People.Cycle`, `People.Goals`, `People.Self`, `People.Reviews`, `People.OneOnOne`, `People.Feedback`, `People.Talent` |

**Special leaves:**
- `Dashboard`, `ClientMeetings.Dashboard`, `Analytics.*` only declare `["view"]` in their `actions` array — the matrix renders only the View column for them, and the PUT endpoint rejects any `(resource, "create"|"update"|"delete")` row targeting them.
- `OPSP.History.EditFinalize` is binary (`["update"]` only). When granted, the Edit button stays enabled even on finalized OPSPs and the editor unlocks the form. ([permissionsRegistry.ts:124-134](apps/quikscale/lib/api/permissionsRegistry.ts#L124-L134))

---

## 2. Database Table Flow

### 2.1 Tables involved

Roles & permissions live across two Postgres schemas:

| Schema | Table | Purpose |
|---|---|---|
| `quikit` | `User` | Identity / profile / password hash. One row per human. |
| `quikit` | `Org` | Tenant. |
| `quikit` | `App` | App registry — `slug='quikscale'` row exists once globally. |
| `quikit` | `OrgMember` | User ↔ Org membership row. Carries `role` (legacy string, kept for OrgMember-level admin/member/viewer), `status`, invitation tokens. |
| `quikit` | `UserAppAccess` | User ↔ App grant per Org. "Can this user use QuikScale in this org?" |
| `public` | `UserTeam` | User ↔ Team membership. One user can belong to many teams. |
| `public` | `Team` | Team within an org. |
| `app_quikscale` | `AppRole` | Per-app role. `(orgId, appId, name)` unique. |
| `app_quikscale` | `UserAppRole` | User ↔ AppRole assignment per org. |
| `app_quikscale` | `RolePermission` | Grant rows. `(roleId, resource, action)` unique. |
| `app_quikscale` | `UserPermissionExtra` | Per-user additive grants. `(orgId, userId, resource, action)` unique. |

> ⚠️ There is no `Invitation` table for the QuikScale invite path — invitation state lives on `OrgMember.invitationToken` + `invitedAt` + `acceptedAt`. The "Add New User" modal on the Users page bypasses the email-invite handshake and creates the user record + sets a password inline.

### 2.2 Foreign key topology

```
User (quikit.User)
 ├── OrgMember.userId          (quikit.OrgMember)            org membership
 ├── UserAppAccess.userId      (quikit.UserAppAccess)        app access
 ├── UserTeam.userId           (public.UserTeam)             team membership
 ├── UserAppRole.userId        (app_quikscale.UserAppRole)   role assignment
 └── UserPermissionExtra.userId(app_quikscale.UserPermissionExtra) user extras

Org (quikit.Org) ←──── all of the above scope by orgId

App (quikit.App, slug='quikscale')
 ├── UserAppAccess.appId
 └── AppRole.appId

AppRole (app_quikscale.AppRole)
 ├── RolePermission.roleId    (1 role : N grants)
 └── UserAppRole.roleId       (1 role : N members)
```

### 2.3 Insert / update sequence by event

#### Event A — Admin creates a new role (`POST /api/org/roles`)

1. `requireAdmin()` confirms the caller has the admin role (via UserAppRole).
2. Lookup `App.id` where `slug='quikscale'` (cached).
3. `findUnique` on `AppRole(orgId, appId, name)` — refuse 409 on dup.
4. If `isDefault=true`, `updateMany` previous default(s) to `false` in same scope.
5. `appRole.create({ orgId, appId, name, description, isSystem:false, isDefault, createdBy })`.

→ Writes: 1 row in `AppRole`. No `RolePermission` rows yet — the new role starts empty.

#### Event B — Admin saves permissions for a role (`PUT /api/org/roles/[id]/permissions`)

1. `requireAdmin()`.
2. Validate body — every `(resource, action)` passes `isValidPermissionPair()`.
3. Inside a transaction:
   - `rolePermission.deleteMany({ where: { roleId } })`
   - `rolePermission.createMany({ data: pairs.map(p => ({ roleId, ...p })) })`

→ Atomic full-replace of grants. ([roles/[id]/permissions/route.ts](apps/quikscale/app/api/org/roles/[id]/permissions/route.ts))

#### Event C — Admin invites a user (`POST /api/org/users`)

See [§3.4 Backend transaction sequence](#34-backend-transaction-sequence) for the full insert order. Summary writes:

1. `User` insert (or reuse existing).
2. `OrgMember` insert with `status='active'`.
3. `UserTeam` upsert × N teams.
4. `UserAppAccess` insert (idempotent — checks first).
5. `seedAllDefaultRoles(orgId)` ensures `admin` + `User` `AppRole` rows + their `RolePermission` rows exist.
6. `UserAppRole` insert assigning the invitee to either `User` (default) or `admin` (only when the org currently has zero admins).

#### Event D — Admin changes a user's role (`PATCH /api/org/users/[id]/role`)

1. `assertWouldNotEmptyAdmin()` — refuses if the change would leave 0 admins.
2. `userAppRole.deleteMany({ userId, orgId, role: { appId } })` — drop existing.
3. `userAppRole.create({ userId, orgId, roleId, assignedBy })` — add new.

#### Event E — Admin grants a per-user extra (`POST /api/org/users/[id]/permissions`)

Atomic replace of the user's extras set:

1. `userPermissionExtra.deleteMany({ orgId, userId })`
2. `userPermissionExtra.createMany({ data: extras.map(e => ({ orgId, userId, ...e })) })`

### 2.4 Which table is read during an authorization decision?

For "can this user perform this action?":
1. `RolePermission` rows where `roleId IN (user's roles via UserAppRole)` AND `resource=? AND action=?` — first hit returns true.
2. Else `UserPermissionExtra` row matching `(orgId, userId, resource, action)` — hit returns true.
3. Else deny.

For sidebar visibility:
- Same lookup as above, with `action='view'` and the resource derived from `NAV_RESOURCE[moduleKey]`.

There is **no separate navigation table** — nav is just `view` permission.

---

## 3. User Invitation Flow

### 3.1 UI walkthrough — "Add New User" modal

(See screenshot 2.) On `Org Setup → Users → Users` tab, the **Add User** button opens this modal:

| Field | Required | Notes |
|---|---|---|
| First Name | ✅ | Free text, trimmed |
| Last Name | ✅ | Free text, trimmed |
| Email Address | ✅ | Lowercased, used as the unique user key. The dropdown autocompletes existing org members so the admin can "link" rather than create a duplicate. |
| Password | ✅ (new user) | Hashed with bcrypt (cost 12). Optional only when linking an existing org member via the email autocomplete. |
| Role | — | Dropdown of QuikScale `AppRole` rows for this org. Default = "Use org default" → the role with `isDefault=true` (seeded "User" role unless an admin changed it). |
| Teams | — | Multi-select. 0+ teams. Maps to `UserTeam` rows. |

### 3.2 Frontend → API flow

```
[Add User button]
   ↓ open modal, fetch /api/org/roles + /api/org/teams to populate dropdowns
[Fill form, click "+ Add User"]
   ↓
POST /api/org/users  { firstName, lastName, email, password, role?, teamIds[] }
   ↓
[200 + new row appended optimistically to TanStack Query cache]
[modal closes]
```

### 3.3 Validation layer

Body parsed with `createOrgUserSchema` (Zod) — rejects:
- Empty names / email
- Invalid email format
- Password length < 8 (only enforced when creating a fresh user)
- Unknown `role` string

On failure → 400 with the first Zod error message.

### 3.4 Backend transaction sequence

The route handler runs (simplified from [`app/api/org/users/route.ts`](apps/quikscale/app/api/org/users/route.ts)):

```typescript
export const POST = withOrgAuth(async ({ orgId, userId }, req) => {
  const { firstName, lastName, email, password, role, teamIds, linkExistingUserId } = parsed.data;

  let newUserId: string;

  // Path A — admin picked an existing user from the email autocomplete
  if (linkExistingUserId) {
    const member = await db.orgMember.findUnique({
      where: { orgId_userId: { orgId, userId: linkExistingUserId } },
    });
    if (!member) return 404;
    newUserId = member.userId;
  } else {
    // Path B — fresh email
    const existing = await db.user.findUnique({ where: { email } });
    if (existing) {
      // Existing platform user, not yet in this org → create OrgMember only
      if (await db.orgMember.findUnique({ where: { orgId_userId: { orgId, userId: existing.id } } }))
        return 409; // already a member
      await db.orgMember.create({ data: { orgId, userId: existing.id, role, teamId, status: "active", createdBy: userId } });
      newUserId = existing.id;
    } else {
      // Brand new platform user → User + OrgMember
      const user = await db.user.create({ data: { firstName, lastName, email, password: bcrypt.hash(password, 12) } });
      await db.orgMember.create({ data: { orgId, userId: user.id, role, teamId, status: "active", createdBy: userId } });
      newUserId = user.id;
    }
  }

  // Team memberships
  for (const tId of teamIds) {
    await db.userTeam.upsert({
      where:  { orgId_userId_teamId: { orgId, userId: newUserId, teamId: tId } },
      update: {},
      create: { orgId, userId: newUserId, teamId: tId },
    });
  }

  // App access + dynamic role
  const appId = await getQuikScaleAppId();
  if (!await db.userAppAccess.findFirst({ where: { orgId, appId, userId: newUserId } })) {
    await db.userAppAccess.create({ data: { userId: newUserId, orgId, appId, role: "member", grantedBy: userId } });
  }

  const { adminRoleId, userRoleId } = await seedAllDefaultRoles(orgId);
  const adminCount = await db.userAppRole.count({ where: { orgId, roleId: adminRoleId } });
  // Safety net — first user in an admin-less org is auto-promoted
  const targetRoleId = adminCount === 0 ? adminRoleId : userRoleId;
  await ensureUserOnRole(newUserId, orgId, targetRoleId, userId);

  return NextResponse.json({ success: true, data: ... }, { status: 201 });
});
```

### 3.5 Permission inheritance

The new user inherits the seeded "User" role's grants — `view` on every leaf + `update` on KPI/Priority/WWW. ([seedAdminAppRole.ts:118-172](apps/quikscale/lib/api/seedAdminAppRole.ts#L118-L172))

The admin can immediately:
- Switch the user to a different role via `PATCH /api/org/users/[id]/role`
- Add per-user extras via `POST /api/org/users/[id]/permissions`

### 3.6 Login & first-session bootstrap

```
User → /login (NextAuth credentials provider, bcrypt.compare)
   ↓
Session created (JWT) with userId
   ↓
Layout renders, every authenticated page mounts useMyPermissions()
   ↓
GET /api/me/permissions
   ↓
   ├─ seedAllDefaultRoles(orgId)  // idempotent — admin + User AppRole exist
   ├─ loadMyPermissions(userId, orgId) returns
   │    { isAdmin, roleId, roleName, permissions: ["KPI:view","Priority:update",...], extras: [] }
   └─ React Query caches for 5min
   ↓
Sidebar re-renders with only the entries the user has view on
```

### 3.7 What is NOT in this flow (intentionally)

- **No email invite.** The Add User modal sets the password inline. Email-based invite acceptance (with `OrgMember.invitationToken`) exists at the platform level (`apps/main`) but is not the path used from the QuikScale Users page.
- **No password reset link.** That goes through the platform identity service.

---

## 4. Permission Checking Flow

### 4.1 Server-side — `userCan(userId, orgId, resource, action)`

Single source of truth. Returns `true` iff one of:
- A `RolePermission` row exists whose `roleId` is in the user's `UserAppRole` set for this `(orgId, app=quikscale)`, AND its `(resource, action)` matches.
- A `UserPermissionExtra` row exists for `(orgId, userId, resource, action)`.

Implementation: [`apps/quikscale/lib/api/permissions.ts:67-99`](apps/quikscale/lib/api/permissions.ts#L67-L99).

Prisma compiles this to **one SELECT with EXISTS subqueries** — no N+1.

### 4.2 Route wrapper — `withOrgAuthForResource`

Most routes never call `userCan()` directly. They use the curried factory at the top of each route file:

```typescript
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
const auth = withOrgAuthForResource("kpi", "KPI");

export const GET    = auth.view  (async ({ orgId }, req) => { /* list */ });
export const POST   = auth.create(async ({ orgId, userId }, req) => { /* create */ });
export const PATCH  = auth.update(async ({ orgId }, req) => { /* update */ });
export const DELETE = auth.delete(async ({ orgId }, req) => { /* delete */ });
```

What `withOrgAuthForResource` does on every request:
1. `getServerSession()` — 401 if missing.
2. `getOrgId(userId)` — 403 if user has no active org membership.
3. `gateModuleApi("quikscale", moduleKey, orgId)` — 404 if the FF-1 feature flag for this module is off for the tenant.
4. `userCan(userId, orgId, resource, action)` — 403 if denied.
5. Otherwise runs the handler with `{ session, userId, orgId }`.
6. Fires `logApiCall(...)` for audit. Never blocks the response.

For module-gated routes that don't have a clean single-resource mapping (admin routes, /me routes), use `withOrgAuth` directly with an explicit `permission: { resource, action }` option, or call `requireAdmin()` for hard admin-only endpoints.

### 4.3 Client-side — `useMyPermissions()`

```typescript
const perms = useMyPermissions();

// Hide a button
{perms.has("KPI", "create") && <Button>+ Add KPI</Button>}

// Hide a route
useEffect(() => {
  if (!perms.loading && !perms.has("OPSP.Review", "view")) router.replace("/dashboard");
}, [perms]);
```

Fetches `GET /api/me/permissions` once per mount, cached via TanStack Query for 5 minutes. `.has(resource, action)` checks the merged Set of role grants ∪ extras. ([useMyPermissions.ts:71-88](apps/quikscale/lib/hooks/useMyPermissions.ts#L71-L88))

### 4.4 Worked examples

#### Example 1 — KPI Create button

```typescript
// apps/quikscale/app/(dashboard)/kpi/components/Header.tsx
const perms = useMyPermissions();
{perms.has("KPI", "create") && <AddButton onClick={openCreateModal}>+ Add KPI</AddButton>}

// apps/quikscale/app/api/kpi/route.ts
const auth = withOrgAuthForResource("kpi.individual", "KPI");
export const POST = auth.create(async ({ orgId, userId }, req) => { ... });
```

Both gates check the same `("KPI", "create")` pair. Frontend hides the button; backend also rejects direct API calls — defense in depth.

#### Example 2 — Team Update

UI on `Teams` page checks `perms.has("Team", "update")` to render row Edit icons. Backend on `PATCH /api/org/teams/[id]` uses `withOrgAuthForResource("orgSetup.teams", "Team").update(...)`.

#### Example 3 — User Delete (with admin-lockout guard)

UI checks `perms.has("User", "delete")` to render the trash icon. Backend on `DELETE /api/org/users/[id]` runs:
1. Standard `userCan("User", "delete")` via `withOrgAuthForResource`.
2. **Plus** `assertWouldNotEmptyAdmin({ orgId, userId: targetId })` — refuses with 409 if the target user is currently the only admin.

The lockout guard sits in addition to the permission check — having `User:delete` does not let you remove the last admin.

### 4.5 Instance-level rules

`userCan()` is **class-level** ("can users of this role create KPIs at all?"). Per-row rules ("can THIS user edit THIS KPI?") live in feature-specific helpers under `apps/quikscale/lib/api/` — e.g. `canEditKpi(user, kpi)` checks both `userCan("KPI", "update")` AND `kpi.ownerId === user.id || user.role === "head"`.

---

## 5. UI Behavior Documentation

### 5.1 Permission matrix screen — `RolePermissionMatrix`

(See screenshot 1.)

Layout:
- Left rail: list of roles for this org. `admin` pinned at top (`isSystem` first). Hover a non-system role → trash icon. `+` button at top opens "create role" form.
- Right pane: matrix with four action columns (View / Create / Update / Delete) and rows that mirror the permission tree.

Row types:
1. **Module row** (e.g. "KPI") — header. Checkbox per action column is **tristate**:
   - Unchecked when 0 children have it.
   - Checked when ALL children have it.
   - Indeterminate (`-` glyph) when some have it.
   - Clicking toggles every child leaf in that column.
2. **Sub-leaf indented row** (e.g. "Individual KPI") — single checkbox per action column.
3. **Read-only action columns** — actions not declared in a leaf's `actions` array render `—` (e.g. `Dashboard` only has View; Create/Update/Delete are `—`).

Dirty state:
- The component diffs the current checkbox state vs. the server's saved set.
- When dirty, a sticky bottom bar appears with `Discard` and `Save` buttons.
- Save → `PUT /api/org/roles/[id]/permissions` with the full desired array.
- On success the cache invalidates and the bar disappears.

### 5.2 Parent-child checkbox logic

Counter pills next to module labels (`8/8`, `12/12`, `4/4` in the screenshot) show "leaves with at least one grant / total leaves" — quick visual of coverage. The pill turns gray when 0 grants, blue at full coverage.

When the admin ticks a module-row checkbox:
- For each child leaf that supports this action → tick it.
- Skip leaves where the action isn't in the leaf's `actions` array (no garbage rows).

When unticking:
- Untick every child leaf in that column.

### 5.3 Sidebar visibility

`NAV_RESOURCE` maps every sidebar `moduleKey` to a resource. The sidebar component filters items by:
1. Feature flag (org has the module enabled).
2. `useMyPermissions().has(resource, "view")` for the mapped resource.

Cascading:
- Parent groups (e.g. "Org Setup") show iff at least one child is visible.
- Hidden module = hidden in BOTH expanded and collapsed sidebar modes.

During the initial perms fetch (`loading=true`), the sidebar falls back to feature-flag-only filtering so the user doesn't see an empty sidebar flash. ([sidebar.tsx:94-124](apps/quikscale/components/dashboard/sidebar.tsx#L94-L124))

### 5.4 Role switching for a user

Inside `Org Setup → Users → Users` tab, clicking a user row expands an inline `UserPermissionsPanel`:
- Top: role dropdown (the user's current `AppRole`).
- Below: same matrix as the role editor, but each cell is one of three states:
  - **Role-locked** — gray background, lock icon. The role grants this — cannot uncheck.
  - **Extra** — amber background with amber dot. A user-extra row in `UserPermissionExtra`.
  - **Empty** — clickable to add as an extra.
- Module-row tristate only toggles the **non-locked** cells.

Role dropdown change → `PATCH /api/org/users/[id]/role` → admin-lockout guard runs → role swap (delete old `UserAppRole`, create new).

### 5.5 Default & system role behavior

| Role | `isSystem` | `isDefault` | Notes |
|---|---|---|---|
| `admin` | true | false | Created by `seedAdminAppRole`. Rename/delete blocked. Permissions editable. Lockout-guarded. |
| `User` | false | true | Created by `seedUserAppRole`. New invitees auto-join here. Admin can rename, delete, or set a different role as default. |
| Custom roles | false | false | Created by admin via `POST /api/org/roles`. Fully editable & deletable. |

Setting `isDefault=true` on another role automatically demotes the existing default (`updateMany` in the create/update handlers).

### 5.6 Built-in roles in the screenshot

| Role | Purpose |
|---|---|
| **admin** | Full access. Cannot be renamed/deleted. Permissions editable. |
| **Acountablity User** | Custom role created for the example tenant — for an accountability/scorecard-reviewer persona. Editable like any custom role. |
| **User** | Default invitee role (the "User" seeded role). Editable. |

---

## 6. Complete Authorization Flow

End-to-end sequence for a typical authenticated request:

```
┌─────────────────────────────────────────────────────────────────────────┐
│ 1. LOGIN                                                                │
│    POST /api/auth/callback/credentials                                  │
│    → NextAuth verifies email + bcrypt.compare(password, user.password)  │
│    → JWT issued with { sub: userId }                                    │
└─────────────────────────────────────────────────────────────────────────┘
                                  ↓
┌─────────────────────────────────────────────────────────────────────────┐
│ 2. SESSION                                                              │
│    Browser cookie next-auth.session-token                               │
│    Server reads it on every request via getServerSession(authOptions)   │
└─────────────────────────────────────────────────────────────────────────┘
                                  ↓
┌─────────────────────────────────────────────────────────────────────────┐
│ 3. ORG CONTEXT                                                          │
│    getOrgId(userId) → SELECT orgId FROM OrgMember                       │
│      WHERE userId=? AND status='active' LIMIT 1                         │
│    (a user can have multiple orgs; QuikScale uses the first active one) │
└─────────────────────────────────────────────────────────────────────────┘
                                  ↓
┌─────────────────────────────────────────────────────────────────────────┐
│ 4. ROLE RESOLUTION                                                      │
│    UserAppRole.findMany({ userId, orgId, role: { appId=quikscale } })   │
│    → list of AppRole rows the user holds                                │
└─────────────────────────────────────────────────────────────────────────┘
                                  ↓
┌─────────────────────────────────────────────────────────────────────────┐
│ 5. PERMISSION FETCH (frontend)                                          │
│    GET /api/me/permissions  →  loadMyPermissions(userId, orgId)         │
│    {                                                                    │
│      isAdmin: <any of the user's roles is the admin role>,              │
│      roleId, roleName,                                                  │
│      permissions: ["KPI:view","KPI:update",...]   // role ∪ extras      │
│      extras: ["Priority:delete"]                  // only the extras    │
│    }                                                                    │
│    Cached 5min via React Query.                                         │
└─────────────────────────────────────────────────────────────────────────┘
                                  ↓
┌─────────────────────────────────────────────────────────────────────────┐
│ 6. FRONTEND RENDERING                                                   │
│    Sidebar:    filterNavigation(navTree, disabled, perms.has, ...)      │
│    Buttons:    {perms.has("KPI","create") && <AddButton />}             │
│    Routes:     useEffect redirects when perms.has(view) === false       │
└─────────────────────────────────────────────────────────────────────────┘
                                  ↓
┌─────────────────────────────────────────────────────────────────────────┐
│ 7. API CALL (user clicks a button)                                      │
│    POST /api/kpi  with auth cookie                                      │
└─────────────────────────────────────────────────────────────────────────┘
                                  ↓
┌─────────────────────────────────────────────────────────────────────────┐
│ 8. ROUTE WRAPPER (withOrgAuthForResource("kpi.individual","KPI").create)│
│    a. getServerSession()                       → 401 on miss            │
│    b. getOrgId()                               → 403 on miss            │
│    c. gateModuleApi("quikscale","kpi.individual",orgId) → 404 on FF off │
│    d. userCan(userId, orgId, "KPI", "create")  → 403 on deny            │
│    e. handler runs with { session, userId, orgId }                      │
│    f. logApiCall(method, path, status, durationMs)  (fire-and-forget)   │
└─────────────────────────────────────────────────────────────────────────┘
                                  ↓
┌─────────────────────────────────────────────────────────────────────────┐
│ 9. HANDLER LOGIC                                                        │
│    - Zod parse body                                                     │
│    - Per-row checks (e.g. team-head can only assign KPIs in own team)   │
│    - db.kpi.create({ data: { orgId, ... } })  ← always filter by orgId  │
│    - return NextResponse.json({ success: true, data }, { status: 201 }) │
└─────────────────────────────────────────────────────────────────────────┘
```

### 6.1 Bypass paths (read carefully)

- **No admin bypass.** Admin gets through `userCan()` because its `RolePermission` rows are seeded full — not because of any `if (isAdmin) return true` shortcut. Empty those rows and admin loses access (which is why the lockout guard exists).
- **`requireAdmin()`** (in `lib/api/requireAdmin.ts`) is a different gate used on a handful of admin-only routes (the role-management routes themselves: `/api/org/roles/*`). It checks for the `admin` AppRole specifically — it's not a general bypass and it does not satisfy `userCan()` for arbitrary resources.

---

## 7. Appendix — Code References

### 7.1 Files (paths relative to repo root)

| Concern | File |
|---|---|
| Permission tree (single source of truth) | [`apps/quikscale/lib/api/permissionsRegistry.ts`](apps/quikscale/lib/api/permissionsRegistry.ts) |
| Server permission checks | [`apps/quikscale/lib/api/permissions.ts`](apps/quikscale/lib/api/permissions.ts) |
| Route wrapper / auth guard | [`apps/quikscale/lib/api/withOrgAuth.ts`](apps/quikscale/lib/api/withOrgAuth.ts) |
| Admin-lockout guard | [`apps/quikscale/lib/api/preventAdminLockout.ts`](apps/quikscale/lib/api/preventAdminLockout.ts) |
| Default-role seeders + legacy backfill | [`apps/quikscale/lib/api/seedAdminAppRole.ts`](apps/quikscale/lib/api/seedAdminAppRole.ts) |
| Client permission hook | [`apps/quikscale/lib/hooks/useMyPermissions.ts`](apps/quikscale/lib/hooks/useMyPermissions.ts) |
| Sidebar filter | [`apps/quikscale/components/dashboard/sidebar.tsx`](apps/quikscale/components/dashboard/sidebar.tsx) |
| Role list / create API | [`apps/quikscale/app/api/org/roles/route.ts`](apps/quikscale/app/api/org/roles/route.ts) |
| Role detail / rename / delete API | [`apps/quikscale/app/api/org/roles/[id]/route.ts`](apps/quikscale/app/api/org/roles/[id]/route.ts) |
| Role permissions matrix API | [`apps/quikscale/app/api/org/roles/[id]/permissions/route.ts`](apps/quikscale/app/api/org/roles/[id]/permissions/route.ts) |
| Role members reconcile API | [`apps/quikscale/app/api/org/roles/[id]/members/route.ts`](apps/quikscale/app/api/org/roles/[id]/members/route.ts) |
| User CRUD + invite API | [`apps/quikscale/app/api/org/users/route.ts`](apps/quikscale/app/api/org/users/route.ts) |
| User role swap API | [`apps/quikscale/app/api/org/users/[id]/role/route.ts`](apps/quikscale/app/api/org/users/[id]/role/route.ts) |
| User extras API | [`apps/quikscale/app/api/org/users/[id]/permissions/route.ts`](apps/quikscale/app/api/org/users/[id]/permissions/route.ts) |
| Current-user permissions API (+ seed trigger) | [`apps/quikscale/app/api/me/permissions/route.ts`](apps/quikscale/app/api/me/permissions/route.ts) |
| Matrix UI | [`apps/quikscale/app/(dashboard)/org-setup/users/components/RolePermissionMatrix.tsx`](apps/quikscale/app/(dashboard)/org-setup/users/components/RolePermissionMatrix.tsx) |
| Roles tab UI | [`apps/quikscale/app/(dashboard)/org-setup/users/components/RolesTab.tsx`](apps/quikscale/app/(dashboard)/org-setup/users/components/RolesTab.tsx) |
| User extras panel UI | [`apps/quikscale/app/(dashboard)/org-setup/users/components/UserPermissionsPanel.tsx`](apps/quikscale/app/(dashboard)/org-setup/users/components/UserPermissionsPanel.tsx) |
| Schema (Prisma) | [`packages/database/prisma/schema.prisma`](packages/database/prisma/schema.prisma) — see lines 756–823 for the 4 RBAC models |
| Migration | [`packages/database/prisma/migrations/20260512130000_dynamic_roles_v2/migration.sql`](packages/database/prisma/migrations/20260512130000_dynamic_roles_v2/migration.sql) |

### 7.2 Prisma model summary

```prisma
// app_quikscale.AppRole
model AppRole {
  id          String           @id @default(cuid())
  orgId       String
  appId       String
  name        String
  description String?
  isSystem    Boolean          @default(false)
  isDefault   Boolean          @default(false)
  createdAt   DateTime         @default(now())
  updatedAt   DateTime         @updatedAt
  createdBy   String?
  app         App              @relation(fields: [appId], references: [id], onDelete: Cascade)
  org         Org              @relation(fields: [orgId], references: [id], onDelete: Cascade)
  permissions RolePermission[]
  members     UserAppRole[]
  @@unique([orgId, appId, name])
  @@index([orgId, appId])
  @@schema("app_quikscale")
}

// app_quikscale.UserAppRole
model UserAppRole {
  id         String   @id @default(cuid())
  userId     String
  orgId      String
  roleId     String
  assignedAt DateTime @default(now())
  assignedBy String?
  role       AppRole  @relation(fields: [roleId], references: [id], onDelete: Cascade)
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  org        Org      @relation(fields: [orgId], references: [id], onDelete: Cascade)
  @@unique([userId, orgId, roleId])
  @@index([roleId])
  @@index([userId, orgId])
  @@schema("app_quikscale")
}

// app_quikscale.RolePermission
model RolePermission {
  id       String  @id @default(cuid())
  roleId   String
  resource String
  action   String
  role     AppRole @relation(fields: [roleId], references: [id], onDelete: Cascade)
  @@unique([roleId, resource, action])
  @@index([roleId])
  @@schema("app_quikscale")
}

// app_quikscale.UserPermissionExtra
model UserPermissionExtra {
  id        String   @id @default(cuid())
  orgId     String
  userId    String
  resource  String
  action    String
  grantedBy String?
  createdAt DateTime @default(now())
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  org       Org      @relation(fields: [orgId], references: [id], onDelete: Cascade)
  @@unique([orgId, userId, resource, action])
  @@index([userId, orgId])
  @@schema("app_quikscale")
}
```

### 7.3 Best practices

- **Always import from the local registry.** `import { ACTIONS, isValidPermissionPair } from "@/lib/api/permissionsRegistry";`. Do not import permission constants from `@quikit/shared` — they don't exist there for QuikScale (intentional separation of concerns).
- **Always filter Prisma queries by `orgId`.** Multi-tenant safety — even with permission checks, a missing `orgId` filter leaks data across tenants.
- **Wrap every route with `withOrgAuthForResource`** (or `withOrgAuth` + explicit `permission`). Hand-rolled auth checks drift out of sync with the framework.
- **Adding a new resource:** add a leaf to `PERMISSION_TREE` and (if it's a sidebar item) add the mapping in `NAV_RESOURCE`. Then run the seeder so admin picks up the new pair via `backfillAdminPermissions`. No DB migration required — resources are open strings.
- **Use `useMyPermissions().has()` for every conditional UI** that depends on permission. Don't read `isAdmin` to decide UI visibility — that path will silently break the day a non-admin role gets the same permission.
- **Never reintroduce an `isAdmin` bypass** in `userCan()`. The lockout guard exists because we removed it; reintroducing it makes the guard meaningless.

### 7.4 Edge cases

| Scenario | Behavior |
|---|---|
| User has zero roles AND zero extras | All permission checks deny. Sidebar empty. |
| User has admin role but admin has zero `RolePermission` rows | Treated like a no-grants role. UI shows a "permissions empty" warning. Lockout guard still prevents removing the user. |
| Two roles on the same user with conflicting grants | UNION — if either grants `("KPI", "create")`, the user has it. There is no "deny" precedence. |
| User extra added for a permission the role already grants | No effect — the union still has it once. The extras row stays for audit and renders as an amber dot in the matrix. |
| Resource removed from the registry but old `RolePermission` rows survive | `userCan` rejects upfront via `isResource()` guard. Dead rows are harmless but should be cleaned by a one-off script if the resource is permanently gone. |
| Org has no admin members (defensive — should never happen) | Next invite auto-promotes the new user to admin. |
| `gateModuleApi` returns "module disabled" but `userCan` would have allowed | The route returns 404 (module hidden), not 403. FF-1 wins over RBAC. |

---

**End of document.**

---

<a id="roles-permissions-complete"></a>

# Roles & Permissions — Complete Reference

> *(Source: `apps/quikscale/rolesAndPermissions-Complete.md`)*


> Single consolidated doc covering the **Dynamic Roles & Permissions v2**
> feature in QuikScale **as it currently runs in code** (verified by
> reading the live source on 2026-05-13). Supersedes:
>
> - [`rolesAndPermissions.md`](./rolesAndPermissions.md) — v1 design (CustomRole + appRoleId)
> - [`rolesAndPermissions-AppRole.md`](./rolesAndPermissions-AppRole.md) — v1 → v2 rename notes
> - [`rolesAndPermissions-Guide.md`](./rolesAndPermissions-Guide.md) — admin-facing flow
>
> Where the original design and the current code diverge, **this doc
> describes what the code actually does today**, with the design intent
> kept only as historical context where helpful.

---

## Table of contents

1. [Why this feature exists](#1-why-this-feature-exists)
2. [v2 in one paragraph (what changed from v1)](#2-v2-in-one-paragraph-what-changed-from-v1)
3. [Concepts at a glance](#3-concepts-at-a-glance)
4. [Architecture — schema placement](#4-architecture--schema-placement)
5. [Data model — the five tables](#5-data-model--the-five-tables)
6. [Permission registry — local, tree-shaped](#6-permission-registry--local-tree-shaped)
7. [Server gate — `permissions.ts`](#7-server-gate--permissionsts)
8. [Auto-seed flow](#8-auto-seed-flow)
9. [API endpoints (live)](#9-api-endpoints-live)
10. [Client-side hook — `useMyPermissions`](#10-client-side-hook--usemypermissions)
11. [UI state — what's wired vs deferred](#11-ui-state--whats-wired-vs-deferred)
12. [Legacy role usage still in the codebase](#12-legacy-role-usage-still-in-the-codebase)
13. [Migration history](#13-migration-history)
14. [SQL playbook — verification queries](#14-sql-playbook--verification-queries)
15. [Verification checklist](#15-verification-checklist)
16. [Open follow-ups (deferred)](#16-open-follow-ups-deferred)
17. [Quick reference cheat sheet](#17-quick-reference-cheat-sheet)

---

## 1. Why this feature exists

QuikScale has many features — KPIs, Priorities, WWW, Quarter Settings,
Daily / Weekly meetings, OPSP, etc. Not every team member should do
everything. Until v1 shipped, the only roles were a fixed enum baked
into the `OrgMember.role` column (`SUPER_ADMIN | ADMIN | EXECUTIVE | …`),
and what they meant lived in code, not data.

**Goal of the rewrite (v2)**: replace the hard-coded role enum with
**per-org, per-app custom roles** that an admin can edit from the UI.
Each role carries:

- An **entity × action grid** of grants (Create / Update / Delete /
  View on KPI, Priority, WWW, OPSP.Create, OPSP.History, …).
- A separate list of **sidebar items** the role can see (`navKey`
  whitelist).

Plus a **per-user additive grants** table so admins can give one user
extra permissions without changing the role for everyone on it.

---

## 2. v2 in one paragraph (what changed from v1)

The original v1 design assumed an `isSystem=true` admin role would
**short-circuit** all `userCan()` checks. v2 removes that bypass —
admin's access now flows through the **same** `RolePermission` join as
every other role (the admin role is seeded with all 48 pairs ticked).
The `isSystem` flag only protects the row from rename / delete in the
UI. v2 also adds a fifth table — `UserPermissionExtra` — so admins can
grant a single user an extra permission without editing the shared
role. The shared-package permission registry from v1 was never built;
the live registry is **app-local** at
[`apps/quikscale/lib/api/permissionsRegistry.ts`](./lib/api/permissionsRegistry.ts)
and uses a **dot-namespaced tree** (e.g. `OPSP.History.EditFinalize`)
instead of v1's flat resource list.

---

## 3. Concepts at a glance

| Concept | Storage table | What it is |
|---|---|---|
| **AppRole** | `app_quikscale.AppRole` | A named role inside one (org, app). The catalogue row. |
| **RolePermission** | `app_quikscale.RolePermission` | One entry in the entity × action grid for a role. Presence = granted. |
| **RoleNavigation** | `app_quikscale.RoleNavigation` | One sidebar item the role can see. Independent of CRUD grants. |
| **UserAppRole** | `app_quikscale.UserAppRole` | The join row — links a user to a role inside an org. |
| **UserPermissionExtra** *(v2)* | `app_quikscale.UserPermissionExtra` | Per-user additive `(resource, action)` grant. Applied **ON TOP OF** the role grants. |
| **System role** | `AppRole.isSystem = true` | `admin` only. Protects against rename/delete in the UI. **Does NOT bypass `userCan`** in v2. |
| **Default role** | `AppRole.isDefault = true` | The role auto-assigned to a newly invited user. Only one per (org, app). |

All five tables live in the `app_quikscale` schema.

---

## 4. Architecture — schema placement

Postgres has multiple schemas in `quikit_dev`:

| Schema | What lives there |
|---|---|
| `auth` | NextAuth identity — `User`, `Session`, `Account`, `VerificationToken` |
| `quikit` | Platform — `Org`, `App`, `OrgMember`, `UserAppAccess` |
| `app_quikscale` | QuikScale-specific data — `KPI`, `Priority`, `WWWItem`, `OPSP*`, and all five role tables |
| `app_quikvc` | QuikVC-specific data |
| `app_quikconstruction` | QuikConstruction-specific data |

**All five role tables live in `app_quikscale`.** Reasoning:

- Roles are app-specific (a QuikScale "Manager" grants on KPI /
  Priority / WWW; a QuikVC "Manager" would grant on Deal / Portfolio).
- The codebase already uses cross-schema FKs in the *opposite*
  direction (`app_quikscale.KPI.orgId → quikit.Org.id`), so the new
  direction (`app_quikscale.AppRole.orgId → quikit.Org.id`) is a
  known-supported pattern.
- **Standing rule**: no new columns are added outside `app_quikscale`.
  That's why `UserAppRole` is a join table inside `app_quikscale`
  rather than an `appRoleId` column on `quikit.UserAppAccess`. (v1
  added that column; v2 removed it.)

---

## 5. Data model — the five tables

All `@@schema("app_quikscale")`. Cross-schema FKs only point to
`quikit.Org` / `quikit.App` and `auth.User` (with cascade).

### 5.1 `AppRole`

```prisma
model AppRole {
  id          String           @id @default(cuid())
  orgId       String                              // FK → quikit.Org.id
  appId       String                              // FK → quikit.App.id
  name        String                              // "admin" / "User" / "Manager" / …
  description String?
  isSystem    Boolean          @default(false)    // protects rename/delete only
  isDefault   Boolean          @default(false)    // auto-assign on invite
  createdAt   DateTime         @default(now())
  updatedAt   DateTime         @updatedAt
  createdBy   String?

  app         App              @relation(fields: [appId], references: [id], onDelete: Cascade)
  org         Org              @relation(fields: [orgId], references: [id], onDelete: Cascade)
  navigations RoleNavigation[]
  permissions RolePermission[]
  members     UserAppRole[]

  @@unique([orgId, appId, name])
  @@index([orgId, appId])
  @@schema("app_quikscale")
}
```

### 5.2 `RolePermission` — entity × action grid

```prisma
model RolePermission {
  id       String  @id @default(cuid())
  roleId   String                                  // FK → AppRole.id
  resource String                                  // one of registry leaves (dot-namespaced)
  action   String                                  // view | create | update | delete
  role     AppRole @relation(fields: [roleId], references: [id], onDelete: Cascade)

  @@unique([roleId, resource, action])
  @@index([roleId])
  @@schema("app_quikscale")
}
```

Semantics:
- **Presence of a row = permission granted.** Absence = deny.
- The seeded `admin` (`isSystem=true`) gets **all** valid `(resource,
  action)` pairs as rows on first seed. Subsequent re-seeds don't
  overwrite admin un-ticks (see §8).

### 5.3 `RoleNavigation` — sidebar visibility

```prisma
model RoleNavigation {
  id     String  @id @default(cuid())
  roleId String                                    // FK → AppRole.id
  navKey String                                    // one of NAV_KEYS
  role   AppRole @relation(fields: [roleId], references: [id], onDelete: Cascade)

  @@unique([roleId, navKey])
  @@index([roleId])
  @@schema("app_quikscale")
}
```

Separate from `RolePermission` because navigation visibility and CRUD
are independent axes.

### 5.4 `UserAppRole` — the join table

```prisma
model UserAppRole {
  id         String   @id @default(cuid())
  userId     String                                // FK → auth.User.id (cascade)
  orgId      String                                // FK → quikit.Org.id (cascade)
  roleId     String                                // FK → AppRole.id (cascade)
  assignedAt DateTime @default(now())
  assignedBy String?

  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  org        Org      @relation(fields: [orgId], references: [id], onDelete: Cascade)
  role       AppRole  @relation(fields: [roleId], references: [id], onDelete: Cascade)

  @@unique([userId, orgId, roleId])
  @@index([roleId])
  @@index([userId, orgId])
  @@schema("app_quikscale")
}
```

> 📝 v1 doc said `userId` / `orgId` were stored as plain strings without
> Prisma `@relation` to avoid hard FKs into the `auth` schema. The
> v2 schema **does** add the `auth.User` FK with cascade. Deleting a
> user from NextAuth therefore cleans the join row automatically.

### 5.5 `UserPermissionExtra` *(new in v2)* — per-user additive grants

```prisma
/// Per-user additive permission grants — applied ON TOP of the user's role
/// grants. Used by admins to extend an individual user's access without
/// changing the role for everyone on it.
model UserPermissionExtra {
  id        String   @id @default(cuid())
  orgId     String                                 // FK → quikit.Org.id (cascade)
  userId    String                                 // FK → auth.User.id (cascade)
  resource  String                                 // dot-namespaced
  action    String                                 // view | create | update | delete
  grantedBy String?
  createdAt DateTime @default(now())

  org       Org      @relation(fields: [orgId], references: [id], onDelete: Cascade)
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([orgId, userId, resource, action])
  @@index([userId, orgId])
  @@schema("app_quikscale")
}
```

Effective permission set for a user = **UNION of**:
1. `RolePermission` rows on any role the user is on (via `UserAppRole`).
2. `UserPermissionExtra` rows for the user in this org.

---

## 6. Permission registry — local, tree-shaped

Single source of truth, consumed by both the server gate and (when
shipped) the matrix UI.

**File**: [`apps/quikscale/lib/api/permissionsRegistry.ts`](./lib/api/permissionsRegistry.ts)

> 📝 v1 doc referenced `packages/shared/lib/permissionsRegistry.ts` — that
> file was never written. The live registry is app-local. The header
> comment explicitly says: *"Lives here (not in `@quikit/shared`)
> because the user has scoped out-of-scope edits under
> `packages/shared/**`. The legacy shared `permissionsRegistry.ts`
> referenced in old docs was never written."*

### 6.1 Shape — `PermissionModule[] → SubModule[] → Leaf[]`

Resource keys are **dot-namespaced** so the tree maps onto a flat
`RolePermission(resource, action)` storage table:

```ts
export const ACTIONS = ["view", "create", "update", "delete"] as const;

export interface PermissionLeaf {
  resource: string;                        // dot-namespaced (e.g. "OPSP.History.EditFinalize")
  label: string;
  actions: readonly Action[];              // usually ACTIONS, sometimes ["update"] etc.
}

export interface PermissionSubModule {
  key: string;
  label: string;
  leaves: PermissionLeaf[];
  subModules?: PermissionSubModule[];      // unlimited nesting; used by OPSP
}

export interface PermissionModule {
  key: string;
  label: string;
  leaves?: PermissionLeaf[];
  subModules?: PermissionSubModule[];
}

export const PERMISSION_TREE: PermissionModule[] = [
  { key: "Dashboard", label: "Dashboard",
    leaves: [{ resource: "Dashboard", label: "Dashboard", actions: ["view"] }] },
  { key: "KPI", label: "KPI", leaves: [
      { resource: "KPI",     label: "Individual KPI", actions: ACTIONS },
      { resource: "TeamKPI", label: "Team KPI",       actions: ACTIONS },
  ]},
  { key: "Priority", label: "Priority",
    leaves: [{ resource: "Priority", label: "Priority", actions: ACTIONS }] },
  { key: "OrgSetup", label: "Org Setup", leaves: [
      { resource: "Team",    label: "Teams",            actions: ACTIONS },
      { resource: "User",    label: "Users",            actions: ACTIONS },
      { resource: "Quarter", label: "Quarter Settings", actions: ACTIONS },
  ]},
  { key: "WWW", label: "WWW",
    leaves: [{ resource: "WWW", label: "WWW", actions: ACTIONS }] },
  { key: "ClientMeetings", label: "Meeting Rhythm", leaves: [
      { resource: "ClientMaster",   label: "Client Master",   actions: ACTIONS },
      { resource: "ClientMember",   label: "Client Members",  actions: ACTIONS },
      { resource: "DailyHuddle",    label: "Daily Huddle",    actions: ACTIONS },
      { resource: "WeeklyMeeting",  label: "Weekly Meeting",  actions: ACTIONS },
  ]},
  { key: "OPSP", label: "OPSP", subModules: [
      { key: "OPSP.Create",  label: "Create OPSP",
        leaves: [{ resource: "OPSP.Create", label: "Create OPSP", actions: ACTIONS }] },
      { key: "OPSP.History", label: "OPSP History",
        leaves: [{ resource: "OPSP.History", label: "OPSP History", actions: ACTIONS }],
        subModules: [
          // Binary leaf — only "update" valid; gates the Edit button on finalized OPSPs.
          { key: "OPSP.History.EditFinalize", label: "Edit after Finalize",
            leaves: [{ resource: "OPSP.History.EditFinalize", label: "Edit after Finalize",
                       actions: ["update"] }] },
        ] },
      { key: "OPSP.Review",     label: "OPSP Review",
        leaves: [{ resource: "OPSP.Review", label: "OPSP Review", actions: ACTIONS }] },
      { key: "OPSP.Categories", label: "Category Mgmt",
        leaves: [{ resource: "OPSP.Categories", label: "Category Mgmt", actions: ACTIONS }] },
  ]},
];
```

### 6.2 Navigation registry — flat list

```ts
export const NAV_ITEMS = [
  { key: "dashboard",                 label: "Dashboard" },
  { key: "kpi.individual",            label: "Individual KPI" },
  { key: "kpi.teams",                 label: "Teams KPI" },
  { key: "priority",                  label: "Priority" },
  { key: "www",                       label: "WWW" },
  { key: "orgSetup.teams",            label: "Teams" },
  { key: "orgSetup.users",            label: "Users" },
  { key: "orgSetup.quarters",         label: "Quarter Settings" },
  { key: "clientMeetings.dashboard",  label: "Meeting Dashboard" },
  { key: "clientMeetings.clients",    label: "Client Master" },
  { key: "clientMeetings.members",    label: "Client Members" },
  { key: "clientMeetings.dailyHuddle",label: "Daily Huddle" },
  { key: "clientMeetings.weeklyMeeting", label: "Weekly Meeting" },
  { key: "opsp.create",               label: "Create OPSP" },
  { key: "opsp.history",              label: "OPSP History" },
  { key: "opsp.review",               label: "OPSP Review" },
  { key: "opsp.categories",           label: "Category Mgmt" },
] as const;
```

### 6.3 Derived helpers exported by the registry

| Export | Purpose |
|---|---|
| `walkLeaves()` | Generator that yields every leaf in the tree once. |
| `allPermissionPairs()` | Flat `[{ resource, action }]` of every valid pair. Used by seeders. |
| `RESOURCES` | Read-only flat list of every resource key the tree exposes. |
| `isResource(s)` / `isAction(s)` / `isNavKey(s)` | Type guards used by the server gate to reject garbage input. |
| `isValidPermissionPair(r, a)` | Stronger check — the leaf must list `a` in its `actions[]`. Used by `PUT /api/org/roles/[id]/permissions`. |
| `LEGACY_RESOURCE_BACKFILL` | Map from old flat resource names (`"OPSP"`) to the new tree leaves. Used by `backfillLegacyResources()` to migrate any v1 row. |

---

## 7. Server gate — `permissions.ts`

[`apps/quikscale/lib/api/permissions.ts`](./lib/api/permissions.ts)

| Export | Purpose |
|---|---|
| `userCan(userId, orgId, resource, action)` | Class-level CRUD check. UNION of role grants + per-user extras. **No admin bypass.** |
| `userHasNav(userId, orgId, navKey)` | Sidebar-visibility check. **Role grants only** — navigation is intentionally not per-user-extendable. |
| `loadMyPermissions(userId, orgId)` | Returns the full `MyPermissions` shape for `/api/me/permissions`. |
| `isAdminRole(role)` | Pure helper — `role.isSystem && role.name === "admin"`. Used as the rename/delete guard. **NOT a permission bypass.** |
| `forbidden(message?)` | Standard 403 response helper. |
| `getQuikScaleAppId()` | Cached lookup of the QuikScale `App.id` by slug. |
| `QUIKSCALE_APP_SLUG` | The slug constant (`"quikscale"`). |

### 7.1 `userCan` resolution

```
1. Try RolePermission via UserAppRole join:
     RolePermission(resource=X, action=Y) where role.appId=QuikScale
       AND role.members.some(userId=$u, orgId=$o)
     → if hit, return true.

2. Try per-user additive:
     UserPermissionExtra(userId=$u, orgId=$o, resource=X, action=Y)
     → if hit, return true.

3. Otherwise return false.
```

Two queries max. Both are indexed:
- `RolePermission (roleId, resource, action)` unique → seek
- `UserAppRole (userId, orgId)` index → seek
- `UserPermissionExtra (orgId, userId, resource, action)` unique → seek

### 7.2 `loadMyPermissions` return shape

```ts
export interface MyPermissions {
  isAdmin: boolean;            // true iff user holds ANY role with isSystem && name==="admin"
  roleId: string | null;       // primary (first-assigned) role id
  roleName: string | null;     // primary role name
  permissions: string[];       // "resource:action" — UNION of role + extras
  extras: string[];            // subset of `permissions` that came from UserPermissionExtra
  navigation: string[];        // role grants only
}
```

The `isAdmin` flag is **derived** at query time, not stored — it's a
convenience for UI rendering ("show the admin banner"), not a security
gate. Real permission decisions go through `permissions[]`.

---

## 8. Auto-seed flow

[`apps/quikscale/lib/api/seedAdminAppRole.ts`](./lib/api/seedAdminAppRole.ts)

> 📝 Name is historical — the file now exports **three** seeders plus a
> legacy backfill. v1 only had `seedAdminAppRole`.

| Export | Purpose | Idempotent? |
|---|---|---|
| `seedAdminAppRole(orgId)` | Create the org's admin AppRole if missing, fill its grants on **first** seed (skips re-fill so admin un-checks survive). | yes |
| `seedUserAppRole(orgId)` | Create the org's default `User` AppRole (curated permissions: `view` everywhere, `update` on KPI / Priority / WWW). Marked `isDefault=true` so new invitees land here. | yes |
| `seedAllDefaultRoles(orgId)` | Orchestrator: runs both seeders + `backfillLegacyResources(orgId)`. | yes |
| `backfillLegacyResources(orgId)` | Rewrites any pre-tree `RolePermission` rows from `LEGACY_RESOURCE_BACKFILL` into the new dot-namespaced keys. | yes |
| `ensureUserOnRole(userId, orgId, roleId, assignedBy?)` | `findFirst` + `create` for `UserAppRole`. Skips if already linked. | yes |

### 8.1 What `seedAdminAppRole` actually does

```
1. Look up the QuikScale App id (cached in-process).
2. If AppRole(orgId, appId, name="admin") doesn't exist, create it with
   isSystem=true, isDefault=false.
3. If THIS admin role has zero RolePermission rows yet, create one row
   per pair from allPermissionPairs() (≈ 48 rows). If admin already has
   ANY rows, DO NOT re-fill — admin's deliberate un-checks survive
   re-seeds.
4. Same logic for RoleNavigation rows.
5. Return the admin AppRole.id.
```

### 8.2 What `seedUserAppRole` adds

The curated "User" role is the default for new invitees. Its grants
on first seed are:

- `view` on every leaf in the tree (so users can navigate freely).
- `update` on `KPI`, `Priority`, `WWW` — the day-to-day work surfaces.

Marked `isDefault=true` so `POST /api/org/users` assigns new users
to it. Admins can rename / delete it freely (`isSystem=false`).

### 8.3 When the seeders run

- **`POST /api/org/users`** — `seedAllDefaultRoles(orgId)` is called
  before role assignment, so a fresh org gets the admin + User roles
  populated as a side effect of inviting the first user.
- **Per-request side-effect on `/org-setup/users` layout** — same
  call, idempotent. Guarantees a stale (pre-v2) org gets backfilled
  the next time an admin loads the Users page.
- **Manual** — runnable from a one-off `tsx` script if you need to
  prime an org outside the request path.

---

## 9. API endpoints (live)

All routes are admin-gated (`requireAdmin()` from
`apps/quikscale/lib/api/requireAdmin.ts`).

### 9.1 Role management

| Route | Methods | Notes |
|---|---|---|
| [`/api/org/roles`](./app/api/org/roles/route.ts) | `GET`, `POST` | GET lists every AppRole for this org with `_count.members`, `_count.permissions`, `_count.navigations`. POST creates a new role; demotes any existing default when `isDefault=true`. |
| [`/api/org/roles/[id]`](./app/api/org/roles/[id]/route.ts) | `GET`, `PATCH`, `DELETE` | Detail (incl. `permissions`, `navigation`, counts). System roles refuse PATCH / DELETE with 400. |
| [`/api/org/roles/[id]/permissions`](./app/api/org/roles/[id]/permissions/route.ts) | `GET`, `PUT` | Read grid; PUT atomically replaces the `(resource, action)` set. Rejects garbage pairs via `isValidPermissionPair`. |
| [`/api/org/roles/[id]/navigation`](./app/api/org/roles/[id]/navigation/route.ts) | `GET`, `PUT` | Same atomic-replace pattern for `navKey`s. |
| [`/api/org/roles/[id]/members`](./app/api/org/roles/[id]/members/route.ts) | `GET`, `PUT` | GET lists `UserAppRole` rows + user info. PUT reconciles — inserts new `UserAppRole` rows, deletes removed ones. Skips users without `UserAppAccess` (reported as `skippedUserIds`). |
| [`/api/me/permissions`](./app/api/me/permissions/route.ts) | `GET` | Returns `MyPermissions` for the calling user. Client-cached by React Query. |

### 9.2 User management

| Route | Methods | Notes |
|---|---|---|
| [`/api/org/users`](./app/api/org/users/route.ts) | `GET`, `POST` | GET response joins `UserAppRole` to surface `appRoleId` + `appRoleName` per user. POST auto-grants `UserAppAccess`, runs `seedAllDefaultRoles`, then assigns the picked role via `ensureUserOnRole`. |
| [`/api/org/users/[id]/role`](./app/api/org/users/[id]/role/route.ts) | `PATCH` | `{ roleId: string \| null }`. Adds / removes `UserAppRole`. 409 if the user has no `UserAppAccess` row yet. |
| [`/api/org/users/[id]/status`](./app/api/org/users/[id]/status/route.ts) | `PATCH` | `{ status: "active" \| "inactive" }` — toggles `OrgMember.status`. |
| [`/api/org/users/[id]/permissions`](./app/api/org/users/[id]/permissions/route.ts) **(v2 new)** | `GET`, `PUT` | Per-user `UserPermissionExtra` rows. GET lists what's currently granted as an extra. PUT atomically replaces the set. |

### 9.3 Atomic-replace pattern

All PUTs that manage a many-row set (`permissions`, `navigation`,
`members`, `permissions` extras) use the same transaction shape:

```ts
await db.$transaction([
  db.<table>.deleteMany({ where: { roleId } }),
  desired.length > 0
    ? db.<table>.createMany({ data: desired.map(d => ({ roleId, ...d })) })
    : null,
].filter(Boolean));
```

Half-applied saves are impossible.

### 9.4 System-role guards (server-side)

- `PATCH /api/org/roles/[id]` and `DELETE /api/org/roles/[id]` → 400
  if `isSystem = true`.
- The matrix PUT endpoints **do** allow editing the admin role's
  permissions (v2 design — admin is editable now); only the rename /
  delete paths reject system roles.

---

## 10. Client-side hook — `useMyPermissions`

[`apps/quikscale/lib/hooks/useMyPermissions.ts`](./lib/hooks/useMyPermissions.ts)

```ts
const perms = useMyPermissions();

perms.isAdmin                          // boolean
perms.roleName                         // "admin" / "User" / null
perms.has("KPI", "create")             // resource × action check
perms.hasNav("opsp.review")            // navKey check
perms.permissions                      // raw "resource:action" array
perms.extras                           // subset granted via UserPermissionExtra
perms.navigation                       // raw navKey array
perms.loading                          // true while the first fetch is in flight
```

Cached via React Query with a 5-minute `staleTime`. Multiple components
share one fetch. The cache doesn't auto-invalidate cross-tab — the
5-minute window is the propagation budget for now.

---

## 11. UI state — what's wired vs deferred

> ⚠️ **Important**: the v1 docs described two fully built pages at
> `/org-setup/roles` (Users list) and `/org-setup/roles/manage`
> (permission matrix). **Those pages do not exist in code today.** The
> backend (schema, seeders, server gate, all routes, `useMyPermissions`)
> is complete; the admin UI is the remaining gap.

### 11.1 What exists

| Item | Path | Status |
|---|---|---|
| `/org-setup/users` page | [`app/(dashboard)/org-setup/users/page.tsx`](./app/(dashboard)/org-setup/users/page.tsx) | ✅ ships — lists users, role dropdown, status switch, Add User modal. |
| `/org-setup/teams` page | [`app/(dashboard)/org-setup/teams/page.tsx`](./app/(dashboard)/org-setup/teams/page.tsx) | ✅ unrelated to roles. |
| `/org-setup/quarters` page | [`app/(dashboard)/org-setup/quarters/page.tsx`](./app/(dashboard)/org-setup/quarters/page.tsx) | ✅ unrelated to roles. |
| Sidebar `Org Setup` group | [`components/dashboard/sidebar.tsx`](./components/dashboard/sidebar.tsx) | ✅ exposes Teams / Users / Quarter Settings. |

The Users page (under `/org-setup/users`, not `/org-setup/roles` as v1
proposed) is where inline role assignment happens. The role dropdown
calls `PATCH /api/org/users/[id]/role`.

### 11.2 What doesn't exist yet

| v1 proposal | Current code |
|---|---|
| `/org-setup/roles/layout.tsx` | ❌ no `roles` directory |
| `/org-setup/roles/page.tsx` (Users list w/ Manage Roles button) | ❌ subsumed by `/org-setup/users` for the inline parts; no dedicated landing |
| `/org-setup/roles/manage/page.tsx` (Entities / Navigation matrix) | ❌ **the role-creation + permission-matrix UI is not built**; admins can't add a role or edit its grid from the browser |
| Sidebar "Roles & Permissions" link | ❌ intentionally omitted — sidebar.tsx contains a comment: *"Roles & Permissions intentionally NOT in sidebar. Entry point is the header user-dropdown → 'User Permission' instead."* |
| Header "User Permission" dropdown item | ❌ the comment claims it exists; the actual header uses `<UserMenu>` from `@quikit/ui` and has no QuikScale-specific "User Permission" entry |

### 11.3 Practical consequence

Today admins can:
- **Assign existing roles** to users via `/org-setup/users` (the role
  dropdown is populated from `GET /api/org/roles`).
- **Toggle user active/inactive** via the status switch.
- **Add new users** via the Add User modal (auto-seeds default roles).

Admins **cannot yet** (without a curl call or DB write):
- Create a new role.
- Rename / delete / change defaults on a role.
- Edit a role's permission grid or navigation list.
- Grant a per-user `UserPermissionExtra`.

These operations are all available via the REST API (§9) — only the UI
to drive them is missing.

---

## 12. Legacy role usage still in the codebase

The v2 dynamic-roles system is the source of truth for **module-level**
gates (sidebar visibility, top-level page access). **Instance-level**
permission helpers (e.g. "can this user edit *this specific* KPI?")
still read the legacy `OrgMember.role` enum via the shared
`ROLE_HIERARCHY` constant.

Files that still consult `membership.role`:

- [`apps/quikscale/lib/api/kpiPermissions.ts`](./lib/api/kpiPermissions.ts)
- [`apps/quikscale/lib/api/kpiWeeklyPermissions.ts`](./lib/api/kpiWeeklyPermissions.ts)
- [`apps/quikscale/lib/api/teamKPIPermissions.ts`](./lib/api/teamKPIPermissions.ts)
- [`apps/quikscale/lib/api/priorityPermissions.ts`](./lib/api/priorityPermissions.ts)
- [`apps/quikscale/lib/api/wwwPermissions.ts`](./lib/api/wwwPermissions.ts)
- [`apps/quikscale/lib/api/preventAdminLockout.ts`](./lib/api/preventAdminLockout.ts)

This is **intentional** for now (v2 didn't try to migrate them — see
[§16 Open follow-ups](#16-open-follow-ups-deferred)). It means:

- A user with the v2 `User` role can `view` KPIs (per their
  RolePermission row), but whether they can *edit a specific
  someone-else's KPI* still depends on the legacy `OrgMember.role` test
  (`canEditKPI`).
- An admin user (v2 `isSystem` role AND legacy `OrgMember.role = "ADMIN"`)
  passes both layers and can do everything.
- A user without the legacy ADMIN tier but with a custom v2 role that
  grants `KPI:update` would pass `userCan(...)` but fail
  `canEditKPI(...)` for KPIs they don't own.

The migration plan (deferred) is to replace each `canEditXxx` helper
with a thin call to `userCan(..., "Xxx", "update")` plus the existing
instance-level rule (owner / team-head / etc.).

---

## 13. Migration history

### 13.1 v1 (2026-05-04) — design only

The original branch contained a migration named
`20260504130000_dynamic_roles` (referenced in old docs) that created
`CustomRole`, `RolePermission`, `RoleNavigation`, and an `appRoleId`
column on `public.UserAppAccess`. **This migration is not present in
the current `migrations/` directory** — it was superseded before the
branch landed in main.

### 13.2 v2 (2026-05-12) — what's actually in the repo

[`packages/database/prisma/migrations/20260512130000_dynamic_roles_v2/migration.sql`](../../packages/database/prisma/migrations/20260512130000_dynamic_roles_v2/migration.sql)

The live migration:

1. `CREATE TABLE IF NOT EXISTS app_quikscale."AppRole"` (and its unique +
   indexes + FKs to `quikit.Org` / `quikit.App`).
2. `CREATE TABLE IF NOT EXISTS app_quikscale."RolePermission"` + unique
   + index + FK to `AppRole`.
3. `CREATE TABLE IF NOT EXISTS app_quikscale."RoleNavigation"` + unique
   + index + FK to `AppRole`.
4. `CREATE TABLE IF NOT EXISTS app_quikscale."UserAppRole"` + unique +
   indexes + FKs to `auth.User` / `quikit.Org` / `AppRole` (all cascade).
5. **NEW**: `CREATE TABLE app_quikscale."UserPermissionExtra"` + unique
   + index + FKs to `auth.User` / `quikit.Org` (cascade).

All four pre-existing tables use `IF NOT EXISTS` because the v1
migration may have already created them in some environments. The fifth
table (`UserPermissionExtra`) is new in v2.

No `appRoleId` column on `UserAppAccess` — v2 dropped that column
entirely in favour of the `UserAppRole` join table.

### 13.3 Naming / drift recap

| v1 name | v2 name | Why |
|---|---|---|
| `CustomRole` | `AppRole` | Matches DB table name post-schema-rework. |
| `UserAppAccess.appRoleId` | `UserAppRole` join | Standing rule: no new columns outside `app_quikscale`. |
| n/a | `UserPermissionExtra` | New requirement: per-user additive grants. |
| `isSystem` = bypass | `isSystem` = rename/delete protection only | Admin is editable in v2. |

---

## 14. SQL playbook — verification queries

### A. List every AppRole with row counts

```sql
SELECT
  ar.name,
  ar."isSystem",
  ar."isDefault",
  ar."createdAt",
  (SELECT COUNT(*) FROM app_quikscale."RolePermission" rp WHERE rp."roleId" = ar.id) AS perm_rows,
  (SELECT COUNT(*) FROM app_quikscale."RoleNavigation" rn WHERE rn."roleId" = ar.id) AS nav_rows,
  (SELECT COUNT(*) FROM app_quikscale."UserAppRole"    uar WHERE uar."roleId" = ar.id) AS members
FROM   app_quikscale."AppRole" ar
ORDER BY ar."isSystem" DESC, ar.name;
```

### B. Entity grants for a role (raw)

```sql
SELECT resource, action
FROM   app_quikscale."RolePermission" rp
JOIN   app_quikscale."AppRole" ar ON ar.id = rp."roleId"
WHERE  ar.name = 'User'
ORDER BY resource, action;
```

### C. Pivoted matrix view

```sql
SELECT
  resource AS "Entity",
  BOOL_OR(action = 'create') AS "Create",
  BOOL_OR(action = 'update') AS "Update",
  BOOL_OR(action = 'delete') AS "Delete",
  BOOL_OR(action = 'view')   AS "View"
FROM   app_quikscale."RolePermission" rp
JOIN   app_quikscale."AppRole" ar ON ar.id = rp."roleId"
WHERE  ar.name = 'User'
GROUP BY resource
ORDER BY resource;
```

### D. Navigation grants for a role

```sql
SELECT rn."navKey"
FROM   app_quikscale."RoleNavigation" rn
JOIN   app_quikscale."AppRole" ar ON ar.id = rn."roleId"
WHERE  ar.name = 'User'
ORDER BY rn."navKey";
```

### E. Who has which role?

```sql
SELECT u.email,
       ar.name      AS role_name,
       ar."isSystem",
       ar."isDefault"
FROM   app_quikscale."UserAppRole" uar
JOIN   auth."User"      u  ON u.id  = uar."userId"
JOIN   app_quikscale."AppRole" ar ON ar.id = uar."roleId"
JOIN   quikit."App"     a  ON a.id  = ar."appId" AND a.slug = 'quikscale'
ORDER BY ar.name NULLS FIRST, u.email;
```

### F. Per-user extras for a user

```sql
SELECT resource, action, "grantedBy", "createdAt"
FROM   app_quikscale."UserPermissionExtra"
WHERE  "userId" = '<user-id>' AND "orgId" = '<org-id>'
ORDER BY resource, action;
```

### G. Effective permission set (UNION) for one user

```sql
WITH role_perms AS (
  SELECT rp.resource, rp.action, 'role'::text AS source
  FROM   app_quikscale."UserAppRole" uar
  JOIN   app_quikscale."RolePermission" rp ON rp."roleId" = uar."roleId"
  WHERE  uar."userId" = '<user-id>' AND uar."orgId" = '<org-id>'
),
extras AS (
  SELECT resource, action, 'extra'::text AS source
  FROM   app_quikscale."UserPermissionExtra"
  WHERE  "userId" = '<user-id>' AND "orgId" = '<org-id>'
)
SELECT resource, action, STRING_AGG(source, ',' ORDER BY source) AS sources
FROM   (SELECT * FROM role_perms UNION ALL SELECT * FROM extras) u
GROUP BY resource, action
ORDER BY resource, action;
```

### H. Cascade smoke test

```sql
-- Pick a non-system role.
SELECT id, name FROM app_quikscale."AppRole" WHERE "isSystem" = false LIMIT 1;

-- Count what will cascade.
SELECT
  (SELECT COUNT(*) FROM app_quikscale."RolePermission" WHERE "roleId" = '<id>') AS perms_will_drop,
  (SELECT COUNT(*) FROM app_quikscale."RoleNavigation" WHERE "roleId" = '<id>') AS navs_will_drop,
  (SELECT COUNT(*) FROM app_quikscale."UserAppRole"    WHERE "roleId" = '<id>') AS members_will_drop;

-- Delete the role.
DELETE FROM app_quikscale."AppRole" WHERE id = '<id>';

-- Re-run the counts — all three should be 0.
-- The users keep their quikit.UserAppAccess rows (they just lose the role pointer).
```

---

## 15. Verification checklist

Run these against a freshly seeded org:

1. **Open `/org-setup/users`** — the page lists every member with a
   *Role* dropdown. Initially everyone is on the auto-assigned `User`
   role (the default).
2. **`SELECT * FROM app_quikscale."AppRole" WHERE "orgId" = ?`** returns
   two rows: `admin` (`isSystem=true, isDefault=false`) and `User`
   (`isSystem=false, isDefault=true`).
3. **Run query A** above — admin has ≈ 48 RolePermission rows and ≈ 17
   RoleNavigation rows.
4. **Run query A** for `User` — should have ~17 RolePermission rows
   (`view` on every leaf + `update` on KPI / Priority / WWW) and ≈ 17
   RoleNavigation rows.
5. **`GET /api/me/permissions`** for an admin user returns:
   ```json
   {
     "success": true,
     "data": {
       "isAdmin": true,
       "roleId": "<admin-role-id>",
       "roleName": "admin",
       "permissions": [ "WWW:create", "WWW:update", … ],
       "extras": [],
       "navigation": [ "dashboard", "kpi.individual", … ]
     }
   }
   ```
6. **`userCan(admin, org, "KPI", "create")`** returns `true` via the
   role's seeded RolePermission row (NOT via a bypass).
7. **Delete the admin role** via `DELETE /api/org/roles/<adminId>` →
   400 `{ error: "System roles cannot be deleted" }`.
8. **Grant a UserPermissionExtra** via `PUT /api/org/users/[id]/permissions`
   → `userCan` for that user starts returning true for the granted
   pair even when no role grants it.

---

## 16. Open follow-ups (deferred)

These are intentionally not done; each needs its own batch:

1. **Per-feature permission helpers still read legacy roles.**
   `canEditKPI`, `canEditPriority`, `canEditWWW`,
   `canEditTeamKPI`, `canEditKPIWeekly`, `preventAdminLockout` all read
   `OrgMember.role` via `ROLE_HIERARCHY`. Sweeping them to call
   `userCan(...)` is a separate batch — needs test coverage so
   instance-level rules (owner / team-head / self) don't regress.
2. **The Manage Permission UI** — `/org-setup/roles/manage` (matrix)
   is the biggest visible gap. API is ready; UI isn't.
3. **The dedicated Users-list landing under `/org-setup/roles`** — v1
   doc described it; today the same flow lives under `/org-setup/users`.
   Either rename routes or update the docs to keep `/users`.
4. **Sidebar / header entry points** — sidebar comment claims the
   header has a "User Permission" item; it doesn't. Either add it or
   re-introduce a sidebar link.
5. **Client-side gate on existing pages** — `<Sidebar>` filters by
   FF-1 module flags only; adding `useMyPermissions().hasNav(navKey)`
   AND-gating is a one-hook change.
6. **Per-button hides** — `<AddButton>` on KPI / Priority / WWW should
   hide when `useMyPermissions().has("KPI", "create")` is false.
7. **Cross-org user / app filter** — the Users page treats every
   tenant as a single org today.
8. **Invitation-based Add User flow.** Today the Add User modal
   generates a temp password client-side. Replace with email-invite
   + first-login password set.
9. **Drop legacy columns**: `OrgMember.role` and `UserAppAccess.role`
   mirror the new world during transition. Drop in a later cleanup
   migration once every consumer uses `userCan(...)`.
10. **`useMyPermissions` cross-tab invalidation.** Currently the 5-min
    `staleTime` is the propagation budget. Wire to a server-sent
    event or pusher channel if instant cross-tab updates become a
    requirement.

---

## 17. Quick reference cheat sheet

| Need to… | Where |
|---|---|
| Add a new entity to the matrix | Add a leaf to [`permissionsRegistry.ts`](./lib/api/permissionsRegistry.ts) (under the right module/submodule). Next `seedAdminAppRole` run auto-grants admin on it. |
| Add a new sidebar item | Append to `NAV_ITEMS` in [`permissionsRegistry.ts`](./lib/api/permissionsRegistry.ts). |
| Add a binary leaf (single action) | Like `OPSP.History.EditFinalize` — declare `actions: ["update"]` on the leaf. The PUT permissions endpoint will reject `(resource, action)` pairs that aren't in `actions[]`. |
| Gate an existing API route at module level | `if (!await userCan(userId, orgId, "KPI", "create")) return forbidden();` |
| Gate an existing API route at *instance* level | Use the existing `canEditXxx` helper — still reads legacy `OrgMember.role` until [§16 item 1](#16-open-follow-ups-deferred) is done. |
| Hide a button / sidebar entry client-side | `useMyPermissions().has("KPI", "create")` or `.hasNav("kpi.individual")`. |
| Grant one user an extra permission | `PUT /api/org/users/[id]/permissions` with the new set — atomic replace. |
| List every role for an org | Query A in [§14](#14-sql-playbook--verification-queries). |
| Reset everything for one org | `DELETE FROM app_quikscale."AppRole" WHERE "orgId" = '<id>'` cascades to RolePermission / RoleNavigation / UserAppRole. Then call `seedAllDefaultRoles(orgId)`. |
| Add a new role from code | `db.appRole.create({ orgId, appId, name, ... })` + populate `RolePermission` / `RoleNavigation` (or just `seedUserAppRole`-style helper). |
| Assign a user to a role | `ensureUserOnRole(userId, orgId, roleId)` from [`seedAdminAppRole.ts`](./lib/api/seedAdminAppRole.ts), or `PATCH /api/org/users/[id]/role` from the API. |
| Investigate "admin can't do X" | Step 1: is the admin AppRole row present? Query A. Step 2: does `RolePermission(roleId=admin, resource=X, action=Y)` exist? Query B. Step 3: is the user actually on the admin role? Query E. Step 4: does `getQuikScaleAppId()` return the right id? Hit `/api/me/permissions` to confirm. |

---

<a id="user-invite-flow"></a>

# User Invite Flow

> *(Source: `apps/quikscale/docs/userInviteFlow.md`)*


**App:** QuikScale (Goal Performance OS)
**Endpoint:** `POST /api/org/users`
**UI:** Org Setup → Users → Users tab → **Add User** button → "Add New User" modal
**Last updated:** 2026-05-15

> This document covers ONLY the user-invitation flow: every field the admin fills in, every database table the request touches, every row that gets inserted, and what the new user can do after their first login.

---

## Table of Contents

1. [What "Inviting a User" Means in QuikScale](#1-what-inviting-a-user-means-in-quikscale)
2. [The Add New User Modal — Field-by-Field](#2-the-add-new-user-modal--field-by-field)
3. [Frontend → API Request Shape](#3-frontend--api-request-shape)
4. [Two Paths: New User vs Existing User](#4-two-paths-new-user-vs-existing-user)
5. [Database Tables Involved](#5-database-tables-involved)
6. [Step-by-Step Database Writes](#6-step-by-step-database-writes)
7. [Permission Inheritance — What the New User Can Do](#7-permission-inheritance--what-the-new-user-can-do)
8. [First Login Flow](#8-first-login-flow)
9. [Edge Cases & Safety Nets](#9-edge-cases--safety-nets)
10. [End-to-End Sequence Diagram](#10-end-to-end-sequence-diagram)

---

## 1. What "Inviting a User" Means in QuikScale

In QuikScale, "inviting a user" through the Add User modal does **not** send an email invite. It is an inline create — the admin fills the new user's password directly. The user can sign in immediately at `/login` with the email/password the admin set.

The flow has three concerns that all happen in a single API call:

| Concern | What it answers |
|---|---|
| **Identity** | Does this person have a `User` record on the platform? |
| **Membership** | Are they a member of THIS organization? |
| **App access + role** | Can they use QuikScale in this org, and with what role's permissions? |

A single `POST /api/org/users` request handles all three.

---

## 2. The Add New User Modal — Field-by-Field

| Field | Required? | What it does |
|---|---|---|
| **First Name** | ✅ Required | Stored on the `User` row. Used in `Welcome, Ashwin!` headers, avatars, mentions. |
| **Last Name** | ✅ Required | Stored on the `User` row. |
| **Email Address** | ✅ Required | The unique login identifier across the platform. Lowercased server-side. Also used by the autocomplete dropdown — if the email already exists on another org, the admin can pick it and "link" instead of creating a duplicate. |
| **Password** | ✅ Required (for new users) | Set inline by the admin. Stored as a `bcrypt` hash with cost 12 — the plaintext never reaches the database. Optional only when **linking** an existing platform user (they already have a password). |
| **Role** | Optional | Drop-down lists every `AppRole` for this org (admin, User, Acountablity User, plus any custom roles). Default selection = **"Use org default"** which resolves to whichever role has `isDefault=true` (the seeded "User" role unless an admin changed it). |
| **Teams** | Optional | Multi-select of teams within the org. The new user can be added to 0, 1, or many teams. Each selection creates one `UserTeam` row. |

When the admin clicks **+ Add User**, the form is submitted as JSON to `POST /api/org/users`.

---

## 3. Frontend → API Request Shape

```http
POST /api/org/users
Content-Type: application/json
Cookie: next-auth.session-token=...

{
  "firstName": "Jane",
  "lastName":  "Smith",
  "email":     "jane@company.com",
  "password":  "Secret123!",        // omit when linkExistingUserId is set
  "role":      "member",            // legacy OrgMember.role string
  "teamIds":   ["team_abc", "team_xyz"],
  "linkExistingUserId": null         // or "user_..." to link instead of create
}
```

### Server-side validation (Zod — `createOrgUserSchema`)

| Rule | Behavior on violation |
|---|---|
| `firstName` is 1–100 chars | 400 — "First name is required" |
| `lastName` is 1–100 chars | 400 — "Last name is required" |
| `email` is a valid email, ≤ 200 chars | 400 — "Invalid email" |
| `password` ≥ 8 chars (when not linking) | 400 — "Password must be at least 8 characters" |
| `role` is one of the allowed strings | 400 — Zod enum error |
| `teamIds` is `string[]` | 400 — Zod array error |
| If `linkExistingUserId` is missing → `password` must be present | 400 — "Password is required for new users" |

If any rule fails, the handler returns `{ success: false, error: "<first error message>" }` with status 400.

---

## 4. Two Paths: New User vs Existing User

The same endpoint covers three scenarios. Server picks the right one automatically:

### Path A — Link an existing org member (`linkExistingUserId` provided)

The admin typed an email and the autocomplete dropdown matched a person who is already an `OrgMember` of this org but has not yet been granted QuikScale access.

- **Skip** `User` creation — they already have one.
- **Skip** `OrgMember` creation — they already have one.
- **Just** grant `UserAppAccess` + assign default `AppRole` + add `UserTeam` rows.

### Path B — Existing platform User, NEW to this org

The admin typed an email that exists in `User` but **not** in `OrgMember` for this org. This happens when someone is a member of a different tenant.

- **Skip** `User` creation.
- **Create** `OrgMember` row.
- Grant `UserAppAccess` + default `AppRole` + `UserTeam` rows.

### Path C — Brand-new platform user

The email does not exist in `User` at all.

- **Create** `User` (hash password with bcrypt cost 12).
- **Create** `OrgMember`.
- Grant `UserAppAccess` + default `AppRole` + `UserTeam` rows.

| Decision step | Logic |
|---|---|
| `linkExistingUserId` set? | → Path A |
| Else, `User.findUnique({ email })` returns a row? | → Path B |
| Else | → Path C |

---

## 5. Database Tables Involved

The invite flow touches tables across three Postgres schemas. Knowing the schema matters because they show up in `db.<table>` calls as Prisma models.

### Schema: `quikit`

| Table | What it stores | Inserted on path |
|---|---|---|
| `User` | Identity record — `email`, `firstName`, `lastName`, `password` (bcrypt hash), `avatar`, `lastSignInAt`. One row per human across the whole platform. | C only |
| `Org` | Tenant. Already exists — the invite is scoped to `orgId` from the admin's session. | Never (read-only) |
| `App` | App catalog. `slug='quikscale'` row exists globally. | Never (read-only) |
| `OrgMember` | The User ↔ Org membership row. Carries the legacy `role` string (`admin`/`manager`/`member`), `teamId` (legacy single-team), `status`, optional invitation token. | B, C |
| `UserAppAccess` | The User ↔ App grant per Org — "can this user use QuikScale in this org?". | A, B, C |

### Schema: `public`

| Table | What it stores | Inserted on path |
|---|---|---|
| `UserTeam` | User ↔ Team join. One row per `(orgId, userId, teamId)`. Allows multi-team membership. | A, B, C (when `teamIds` non-empty) |
| `Team` | Team within an org. Already exists — the invite references existing teamIds. | Never (read-only) |

### Schema: `app_quikscale`

| Table | What it stores | Inserted on path |
|---|---|---|
| `AppRole` | Per-app role definition: `name`, `description`, `isSystem`, `isDefault`. Already exists for `admin` + `User` after the first seed pass; created on-demand if missing. | A, B, C (idempotent — created by seed only if missing) |
| `RolePermission` | Grant rows: `(roleId, resource, action)`. Already populated for the seeded `admin` + `User` roles. | A, B, C (only on first seed for the org) |
| `UserAppRole` | User ↔ AppRole assignment for this org. The new user gets one row pointing to either the `User` role (default) or the `admin` role (only if the org has zero admins). | A, B, C |
| `UserPermissionExtra` | Per-user additive grants. **Not** written by the invite flow — admins add these later via the user-permissions panel. | Never (during invite) |

### Why tables span three schemas

- `quikit` = platform-level identity + cross-app data
- `public` = shared between apps (teams)
- `app_quikscale` = QuikScale-only RBAC data, isolated so sister apps (e.g. QuikIT, admin) can have their own role models without polluting the platform schema

---

## 6. Step-by-Step Database Writes

### Path C (Brand-new user) — the longest flow

Setting: org `org_acme`, admin's userId = `user_admin`, inviting Jane Smith with two teams selected.

```sql
-- (Step 1) Validate body via Zod — no DB hit
-- (Step 2) Look up the email — miss → Path C
SELECT id FROM quikit."User" WHERE email = 'jane@company.com';
-- → no rows

-- (Step 3) Hash password
-- bcrypt.hash('Secret123!', 12)  → '$2b$12$...'

-- (Step 4) Insert User
INSERT INTO quikit."User" (id, firstName, lastName, email, password, ...)
VALUES ('user_jane', 'Jane', 'Smith', 'jane@company.com', '$2b$12$...', ...);

-- (Step 5) Insert OrgMember
INSERT INTO quikit."OrgMember" (id, orgId, userId, role, teamId, status, createdBy, ...)
VALUES ('mem_xyz', 'org_acme', 'user_jane', 'member', 'team_abc', 'active', 'user_admin', ...);

-- (Step 6) For each selected teamId — upsert UserTeam
INSERT INTO public."UserTeam" (id, orgId, userId, teamId, ...)
VALUES ('ut_1', 'org_acme', 'user_jane', 'team_abc', ...)
ON CONFLICT (orgId, userId, teamId) DO NOTHING;

INSERT INTO public."UserTeam" (id, orgId, userId, teamId, ...)
VALUES ('ut_2', 'org_acme', 'user_jane', 'team_xyz', ...)
ON CONFLICT (orgId, userId, teamId) DO NOTHING;

-- (Step 7) Look up the QuikScale App.id (cached after first call)
SELECT id FROM quikit."App" WHERE slug = 'quikscale';
-- → 'app_quikscale_xyz'

-- (Step 8) Check & insert UserAppAccess
SELECT id FROM quikit."UserAppAccess"
  WHERE orgId='org_acme' AND appId='app_quikscale_xyz' AND userId='user_jane';
-- → no rows

INSERT INTO quikit."UserAppAccess" (id, userId, orgId, appId, role, grantedBy, ...)
VALUES ('uaa_1', 'user_jane', 'org_acme', 'app_quikscale_xyz', 'member', 'user_admin', ...);

-- (Step 9) Seed default AppRoles for this org (idempotent — cached 5min per org)
--   - Creates admin role + all RolePermission rows if missing
--   - Creates User role + curated RolePermission rows if missing
--   - Runs legacy-resource backfill
--   - Tops up admin with any newly-registered (resource, action) pairs
-- Returns { adminRoleId: 'role_admin_acme', userRoleId: 'role_user_acme' }

-- (Step 10) Decide which role to assign the new user
SELECT COUNT(*) FROM app_quikscale."UserAppRole"
  WHERE orgId='org_acme' AND roleId='role_admin_acme';
-- → 1  (org already has an admin)
-- targetRoleId = userRoleId = 'role_user_acme'

-- (Step 11) Assign the role
SELECT id FROM app_quikscale."UserAppRole"
  WHERE userId='user_jane' AND orgId='org_acme' AND roleId='role_user_acme';
-- → no rows

INSERT INTO app_quikscale."UserAppRole" (id, userId, orgId, roleId, assignedBy, ...)
VALUES ('uar_1', 'user_jane', 'org_acme', 'role_user_acme', 'user_admin', ...);

-- (Step 12) Return 201 with the assembled response
```

### Path B (existing platform user, new to org)

Same as Path C but **skip steps 3–4** (no `User.create`). The handler proceeds directly to OrgMember insert.

### Path A (link existing org member)

Skip steps 3–5 entirely. Verify `OrgMember` exists for `linkExistingUserId` (404 if not), then run steps 6 onwards.

---

## 7. Permission Inheritance — What the New User Can Do

The new user joins the **default** role — the `AppRole` with `isDefault=true`. Out of the box, that's the seeded **"User"** role with this grant set:

| Permission | Granted? | Effect |
|---|---|---|
| `view` on every leaf in the permission tree | ✅ | New user can navigate to every module in the sidebar |
| `update` on `KPI` | ✅ | Can edit individual KPIs |
| `update` on `Priority` | ✅ | Can edit priorities |
| `update` on `WWW` | ✅ | Can edit WWW entries |
| `create`/`delete` on any resource | ❌ | Hidden — no Add/Delete buttons |
| `update` on `Team`, `User`, `Quarter`, `OPSP.*`, `ClientMaster`, etc. | ❌ | Read-only on those modules |

The admin can change this by:
1. Editing the "User" role's matrix (affects every user on this role).
2. Switching the user to a different role (`PATCH /api/org/users/[id]/role`).
3. Granting per-user extras (`POST /api/org/users/[id]/permissions`) — these add to the role grants.

### What if the admin selected a non-default role in the modal?

The `role` field in the request body is the **legacy `OrgMember.role` string** (`admin`/`manager`/`member`) — it's stored on the `OrgMember` row but does **not** drive the dynamic-RBAC `UserAppRole` assignment. The dynamic role assignment always goes to the org's default role (unless the org has zero admins, in which case the first invitee becomes admin — see §9).

> ⚠️ The Add New User modal currently shows "Use org default" as the only practical role choice. Selecting a different role in the dropdown updates `OrgMember.role` only — it does not yet pick a different `AppRole` for the user. That's tech debt flagged in the schema file. To assign a different `AppRole`, use the user row's role-switcher after invite.

---

## 8. First Login Flow

```
1. Admin shares URL + password with the new user (out-of-band — email, Slack, etc.)
2. User goes to /login
3. Submits email + password
4. NextAuth credentials provider:
     - Look up User by email
     - bcrypt.compare(plaintext, user.password)
     - On success → issue JWT with { sub: user.id }
5. Browser stores next-auth.session-token cookie
6. User lands on /dashboard
7. Layout mounts useMyPermissions() → GET /api/me/permissions
     - Server runs seedAllDefaultRoles(orgId) (idempotent, cached)
     - Server runs loadMyPermissions(userId, orgId)
       → returns { isAdmin:false, roleId:'role_user_acme', roleName:'User',
                   permissions: ["Dashboard:view", "KPI:view", "KPI:update", ...],
                   extras: [] }
8. Sidebar renders with only the modules the user has view on
9. Every Add/Edit/Delete button on every page checks perms.has(resource, action)
```

The first request to `/api/me/permissions` doubles as the **seed bootstrap** for the org — if this is the first user ever to load the app for a brand-new org, the seeder creates the `admin` + `User` `AppRole` rows + their `RolePermission` rows in a single pass. Cached per process for 5 minutes so subsequent users don't re-trigger the DB work.

---

## 9. Edge Cases & Safety Nets

| Scenario | Behavior |
|---|---|
| Email already in `User` AND already an `OrgMember` of this org | 409 — "This user is already a member of the organisation. Pick them from the email dropdown to grant QuikScale access." |
| Admin omits password for a brand-new email | 400 — "Password is required for new users" (Zod refinement). |
| `linkExistingUserId` points to someone not in this org | 404 — "User is not a member of this organisation". |
| Selected `teamIds` is empty | No `UserTeam` rows written. User joins the org but no team. |
| Same teamId appears twice in `teamIds` | Idempotent — `upsert` on `(orgId, userId, teamId)` dedupes. |
| Org has zero admin members when invite arrives | The new user is auto-promoted to **admin** instead of "User". Prevents an admin-less org. The check: `SELECT COUNT(*) FROM UserAppRole WHERE orgId=? AND roleId=adminRoleId`. |
| QuikScale `App` row is missing from `quikit.App` | `getQuikScaleAppId()` returns null → `UserAppAccess` + `UserAppRole` writes are skipped, but `User`/`OrgMember`/`UserTeam` still get created. The user can log in to the platform but won't see QuikScale until the App is registered. |
| Network error mid-flow | No global transaction — each statement is its own write. A failed step leaves earlier rows in place. The user can be re-invited; the idempotent checks (find-before-insert on `OrgMember`, `UserAppAccess`, `UserAppRole`, upsert on `UserTeam`) make the retry safe. |
| Admin tries to demote themselves and they're the only admin | Blocked at `PATCH /api/org/users/[id]/role` (not at invite — but worth knowing). The `preventAdminLockout.assertWouldNotEmptyAdmin` guard throws → 409. |

---

## 10. End-to-End Sequence Diagram

```
┌────────────────┐              ┌────────────────────┐         ┌─────────────────────┐
│  Admin UI      │              │  POST /api/org/    │         │     Database        │
│  (Add User     │              │  users handler     │         │                     │
│   modal)       │              │                    │         │                     │
└───────┬────────┘              └─────────┬──────────┘         └──────────┬──────────┘
        │                                  │                              │
        │  [Submit form]                   │                              │
        │  { firstName, lastName, email,   │                              │
        │    password, role, teamIds }     │                              │
        │ ────────────────────────────────►│                              │
        │                                  │                              │
        │                                  │  1. getServerSession() → userId
        │                                  │  2. getOrgId(userId)    → orgId
        │                                  │  3. createOrgUserSchema.parse()
        │                                  │                              │
        │                                  │  4. find User by email ─────►│
        │                                  │◄──────── no rows ────────────│
        │                                  │                              │
        │                                  │  5. bcrypt.hash(password)    │
        │                                  │                              │
        │                                  │  6. INSERT User ────────────►│ quikit.User
        │                                  │                              │
        │                                  │  7. INSERT OrgMember ───────►│ quikit.OrgMember
        │                                  │                              │
        │                                  │  8. UPSERT UserTeam × N ────►│ public.UserTeam
        │                                  │                              │
        │                                  │  9. getQuikScaleAppId() ────►│ quikit.App
        │                                  │◄──── app_quikscale_xyz ──────│
        │                                  │                              │
        │                                  │ 10. find UserAppAccess ─────►│
        │                                  │◄──── no rows ────────────────│
        │                                  │ 11. INSERT UserAppAccess ───►│ quikit.UserAppAccess
        │                                  │                              │
        │                                  │ 12. seedAllDefaultRoles(orgId)
        │                                  │     ┌─ ensure admin AppRole ►│ app_quikscale.AppRole
        │                                  │     ├─ ensure RolePermission ►│ app_quikscale.RolePermission
        │                                  │     ├─ ensure User  AppRole ►│ app_quikscale.AppRole
        │                                  │     └─ ensure RolePermission ►│ app_quikscale.RolePermission
        │                                  │                              │
        │                                  │ 13. count admins on this role
        │                                  │     ─────────────────────────►│
        │                                  │◄──── 1 ──────────────────────│
        │                                  │     targetRole = User role   │
        │                                  │                              │
        │                                  │ 14. ensureUserOnRole() ─────►│ app_quikscale.UserAppRole
        │                                  │                              │
        │                                  │ 15. fetch full row for response
        │                                  │     ─────────────────────────►│
        │                                  │◄─── membership + role row ──│
        │                                  │                              │
        │ ◄──── 201 + { user, role, ...} ──│                              │
        │                                  │                              │
        │  [modal closes, list refreshes]  │                              │
```

---

## Cheat Sheet — Tables Written Per Invite

| Path | `User` | `OrgMember` | `UserTeam` | `UserAppAccess` | `AppRole` | `RolePermission` | `UserAppRole` |
|---|---|---|---|---|---|---|---|
| A — Link existing | — | — | × N teams | ✓ (if missing) | ✓ (if missing — first time per org) | ✓ (if missing — first time per org) | ✓ |
| B — Existing user, new to org | — | ✓ | × N teams | ✓ (if missing) | ✓ (if missing — first time per org) | ✓ (if missing — first time per org) | ✓ |
| C — Brand-new user | ✓ | ✓ | × N teams | ✓ (if missing) | ✓ (if missing — first time per org) | ✓ (if missing — first time per org) | ✓ |

`UserPermissionExtra` is **never** written during invite — extras come from a separate admin action after the user exists.

---

## Key Files

| Purpose | File |
|---|---|
| API handler | [`apps/quikscale/app/api/org/users/route.ts`](apps/quikscale/app/api/org/users/route.ts) |
| Validation schema | [`apps/quikscale/lib/schemas/userSchema.ts`](apps/quikscale/lib/schemas/userSchema.ts) |
| Default-role seeder | [`apps/quikscale/lib/api/seedAdminAppRole.ts`](apps/quikscale/lib/api/seedAdminAppRole.ts) |
| User-role assignment helper | [`apps/quikscale/lib/api/seedAdminAppRole.ts`](apps/quikscale/lib/api/seedAdminAppRole.ts) — `ensureUserOnRole()` |
| Permission tree (so you know what the "User" role grants) | [`apps/quikscale/lib/api/permissionsRegistry.ts`](apps/quikscale/lib/api/permissionsRegistry.ts) |
| Server permission gate (used after invite) | [`apps/quikscale/lib/api/permissions.ts`](apps/quikscale/lib/api/permissions.ts) |
| Lockout guard (relevant to role swap after invite) | [`apps/quikscale/lib/api/preventAdminLockout.ts`](apps/quikscale/lib/api/preventAdminLockout.ts) |
| Prisma models | [`packages/database/prisma/schema.prisma`](packages/database/prisma/schema.prisma) — `User` (L268), `OrgMember` (L407), `UserTeam` (L448), `UserAppAccess` (L93), `AppRole` (L756), `RolePermission` (L794), `UserAppRole` (L777), `UserPermissionExtra` (L809) |

---

**End of document.**

---

<a id="users-list-page"></a>

# Users List Page

> *(Source: `apps/quikscale/docs/usersListPage.md`)*


**App:** QuikScale (Goal Performance OS)
**UI location:** Org Setup → Users → **Users** tab
**Endpoint:** `GET /api/org/users`
**Last updated:** 2026-05-15

> This document explains the Users list table from the screenshot — what each column shows, which Postgres table/column it comes from, the join path the API uses to assemble each row, and the count badge ("5 active members") at the top.

---

## Table of Contents

1. [The Table at a Glance](#1-the-table-at-a-glance)
2. [Column → Database Mapping](#2-column--database-mapping)
3. [The API Response Shape](#3-the-api-response-shape)
4. [How the API Assembles a Row (Step-by-Step)](#4-how-the-api-assembles-a-row-step-by-step)
5. [The "5 active members" Counter](#5-the-5-active-members-counter)
6. [Search, Filter, Pagination](#6-search-filter-pagination)
7. [Row Expansion → Effective Permissions Panel](#7-row-expansion--effective-permissions-panel)
8. [Row Actions (Edit / Remove)](#8-row-actions-edit--remove)
9. [Legacy vs Dynamic Role Columns](#9-legacy-vs-dynamic-role-columns)
10. [Edge Cases](#10-edge-cases)
11. [Key Files](#11-key-files)

---

## 1. The Table at a Glance

From the screenshot, the table has **7 columns** and one row per `OrgMember` in the active organization:

| # | Column | Example value in screenshot |
|---|---|---|
| 1 | USER | Avatar `AS` + `Ashwin Singh` |
| 2 | EMAIL | `ashwin@moreyeahs.com` |
| 3 | ROLE | `Member` (gray pill) |
| 4 | TEAMS | `Engineering` |
| 5 | STATUS | `● Active` (green dot) |
| 6 | LAST SIGN IN | `3h ago` / `Never` |
| 7 | ACTIONS | Edit (pencil) + Remove (person-minus) icons on hover |

Header shows **"Users — 5 active members"** with a Search box, Filter button, and **+ Add User** button.

---

## 2. Column → Database Mapping

Every cell in this table comes from a join across **three Postgres schemas**:

```
quikit.OrgMember  ─── one row per (org, user) membership
   │
   ├── user → quikit.User                     (identity: name, email, avatar, lastSignInAt)
   │             │
   │             └── userTeams → public.UserTeam → public.Team  (team membership)
   │
   └── (orgId / userId)
                  │
                  ├── app_quikscale.UserAppRole → AppRole  (dynamic role — see §9)
                  │
                  └── (status, role, createdAt — legacy fields on OrgMember)
```

### Cell-level breakdown

| UI column | Field in API response | Source table | Source column | Notes |
|---|---|---|---|---|
| **Avatar circle** | `firstName[0] + lastName[0]` | `quikit.User` | `firstName`, `lastName` | Background color is hashed from the name — no DB column |
| **Full name** | `firstName` + " " + `lastName` | `quikit.User` | `firstName`, `lastName` | |
| **EMAIL** | `email` | `quikit.User` | `email` | Lowercased on insert; case-insensitive unique across the platform |
| **ROLE** | `role` (legacy 3-value enum) | `quikit.OrgMember` | `role` | One of `admin`/`manager`/`member`. **NOT** the dynamic `AppRole` — that's a separate concept (see §9) |
| **TEAMS** | `teamNames` (array, usually rendered as comma-separated) | `public.UserTeam` → `public.Team` | `Team.name` | Multi-team — the user can be in 0..N teams. Renders `—` when empty (`Test User` in the screenshot) |
| **STATUS** | `status` | `quikit.OrgMember` | `status` | One of `active`/`invited`/`inactive`/`declined`/`pending`. Green dot when `active` |
| **LAST SIGN IN** | `lastSignInAt` (ISO 8601 string or null) | `quikit.User` | `lastSignInAt` | Formatted on the client with a relative-time helper. `null` → `Never` |
| **Joined** (not visible in screenshot but in the response) | `joinedAt` | `quikit.OrgMember` | `createdAt` | |
| **AppRole** (used by Effective Permissions panel) | `appRoleId`, `appRoleName` | `app_quikscale.UserAppRole` → `app_quikscale.AppRole` | `AppRole.id`, `AppRole.name` | Looked up via a separate query and merged into the row (§4 step 4) |

### Why TEAMS is plural

Historically `OrgMember.teamId` was a single string column — one team per user. The v2 model added `public.UserTeam` (many-to-many) so a user can be in multiple teams. The API returns both:

- `teamId` — the **legacy single-team** column on `OrgMember`. Still set on insert as `teamIds[0] ?? null`.
- `teamIds[]` — every `UserTeam` row's `teamId`.
- `teamNames[]` — the matching `Team.name` for each.

The UI prefers `teamNames` (the multi-team list) and shows the first team name in the column, with a "+N more" indicator if multiple. When `teamNames` is empty, renders `—`.

---

## 3. The API Response Shape

`GET /api/org/users` (paginated):

```json
{
  "success": true,
  "data": [
    {
      "membershipId": "mem_abc",
      "userId":       "user_ashwin",
      "firstName":    "Ashwin",
      "lastName":     "Singh",
      "email":        "ashwin@moreyeahs.com",
      "avatar":       null,
      "lastSignInAt": "2026-05-15T13:00:00.000Z",
      "role":         "admin",                    // legacy OrgMember.role
      "teamId":       "team_eng",                 // legacy single-team
      "teamIds":      ["team_eng"],
      "teamNames":    ["Engineering"],
      "status":       "active",
      "joinedAt":     "2026-05-12T09:00:00.000Z",
      "appRoleId":    "role_admin_acme",          // dynamic AppRole.id
      "appRoleName":  "admin"                     // dynamic AppRole.name
    },
    /* ... 4 more rows ... */
  ],
  "page": 1,
  "limit": 10,
  "total": 5,
  "totalPages": 1
}
```

---

## 4. How the API Assembles a Row (Step-by-Step)

`GET /api/org/users` runs in `apps/quikscale/app/api/org/users/route.ts`. Simplified:

```typescript
export const GET = withOrgAuth(async ({ orgId }, req) => {
  const { page, limit, skip, take } = parsePagination(req);

  // 1. Page of memberships + joined user + joined teams
  const [memberships, total, appId] = await Promise.all([
    db.orgMember.findMany({
      where: { orgId },
      include: {
        user: {
          select: {
            id: true, firstName: true, lastName: true, email: true,
            avatar: true, lastSignInAt: true,
            userTeams: {
              where: { orgId },
              include: { team: { select: { id: true, name: true } } },
            },
          },
        },
      },
      orderBy: { createdAt: "asc" },
      skip, take,
    }),
    db.orgMember.count({ where: { orgId } }),
    getQuikScaleAppId(),
  ]);

  // 2. Single batched lookup of every user's dynamic AppRole
  const appRoleByUserId = new Map();
  if (appId && memberships.length > 0) {
    const userIds = memberships.map(m => m.user.id);
    const userRoles = await db.userAppRole.findMany({
      where: { orgId, userId: { in: userIds } },
      select: { userId: true, role: { select: { id: true, name: true, appId: true } } },
    });
    for (const ur of userRoles) {
      if (ur.role.appId !== appId) continue;     // filter other apps' roles
      appRoleByUserId.set(ur.userId, { id: ur.role.id, name: ur.role.name });
    }
  }

  // 3. Shape each row
  const users = memberships.map(m => ({
    membershipId: m.id,
    userId:       m.user.id,
    firstName:    m.user.firstName,
    lastName:     m.user.lastName,
    email:        m.user.email,
    avatar:       m.user.avatar,
    lastSignInAt: m.user.lastSignInAt?.toISOString() ?? null,
    role:         m.role,                                          // legacy
    teamId:       m.teamId,                                        // legacy single
    teamIds:      m.user.userTeams.map(ut => ut.teamId),
    teamNames:    m.user.userTeams.map(ut => ut.team.name),
    status:       m.status,
    joinedAt:     m.createdAt.toISOString(),
    appRoleId:    appRoleByUserId.get(m.user.id)?.id   ?? null,    // dynamic
    appRoleName:  appRoleByUserId.get(m.user.id)?.name ?? null,
  }));

  return NextResponse.json(paginatedResponse(users, total, page, limit));
});
```

### Query topology (single page load)

```
Request (page=1, limit=10)
  │
  ├── orgMember.findMany ── INNER JOIN User
  │                         LEFT JOIN UserTeam (where orgId=?)
  │                         LEFT JOIN Team
  │   → 5 OrgMember rows, each with nested User + userTeams[]
  │
  ├── orgMember.count → 5
  │
  └── userAppRole.findMany ── INNER JOIN AppRole
      where userId IN (5 userIds)
      → 5 (or fewer) role assignments
```

Two database round-trips total for a page (the third — `getQuikScaleAppId()` — is cached after the first call).

---

## 5. The "5 active members" Counter

The header pill says **"5 active members"**.

Source: the `total` field returned by `orgMember.count({ where: { orgId } })`. Note that the count is **not filtered by `status`** in the current implementation — it's the count of all `OrgMember` rows for this org, including `invited`/`inactive`/`declined`/`pending` if any. In practice the seed data only has `active` rows so the number happens to be accurate.

If you need a strict "active only" count, change the where clause in [`apps/quikscale/app/api/org/users/route.ts`](apps/quikscale/app/api/org/users/route.ts) to `{ orgId, status: "active" }` for the `.count` call.

---

## 6. Search, Filter, Pagination

### Search box ("Search users…")

Client-side filter today — the front-end filters the already-fetched page on `firstName + lastName + email` substring match. Does **not** trigger an API call. Means: if a user is on page 2, searching from page 1 won't find them.

### Filter button

Opens a popup for filtering by role / team / status. Builds query-string parameters that get appended to the next `/api/org/users` fetch. The endpoint reads them via `parsePagination`'s siblings (search/filter parsers).

### Pagination

`parsePagination(req)` reads `?page=` and `?limit=` from the URL. Server returns:

```json
{ "data": [...], "page": 1, "limit": 10, "total": 5, "totalPages": 1 }
```

The footer ("Showing 1–5 of 5", "Rows per page: 10", "Page 1 of 1", Previous/Next) is rendered from these fields. `total` powers both the row counter and the page-count calculation.

---

## 7. Row Expansion → Effective Permissions Panel

Clicking a row's chevron expands the panel documented in [`userPermissionsPanel.md`](userPermissionsPanel.md). That panel:
- Fires `GET /api/org/users/[userId]/permissions` for THIS user only.
- Reads from `app_quikscale.UserAppRole` (the user's roles) + their `RolePermission` rows + `app_quikscale.UserPermissionExtra` (per-user extras).
- Renders the locked-vs-extra matrix.

The list endpoint (`/api/org/users`) does NOT include permission data on each row — that's lazy-loaded only when a row is expanded.

---

## 8. Row Actions (Edit / Remove)

On row hover, two icons appear (see Rishab Khan's row in the screenshot):

| Icon | Action | API |
|---|---|---|
| ✏️ Pencil | Open the Edit modal — same shape as Add User but with email locked and password optional | `PUT /api/org/users/[userId]` |
| 👤➖ Person-minus | Remove this user from the org | `DELETE /api/org/users/[userId]` |

**Edit** lets the admin update firstName, lastName, role, status, teamIds, optionally password (8+ chars).

**Remove** is **not** a full delete — it changes the `OrgMember.status` to `inactive` (or removes the `OrgMember` row, depending on implementation) but keeps the underlying `User` row, since the user may belong to other orgs. The `UserAppRole`, `UserAppAccess`, and `UserTeam` rows for this org are cleaned up on cascade.

The current admin (Ashwin in the screenshot) cannot remove themselves. The admin-lockout guard also refuses to remove the last admin.

---

## 9. Legacy vs Dynamic Role Columns

The screenshot's **ROLE** column says "Member" for every row. This is the **legacy** `OrgMember.role` string.

There are **two different "role" concepts** for a user in QuikScale, and the table shows them both (one visibly, one only used in the expand panel):

| Concept | Where stored | Table column | What it drives |
|---|---|---|---|
| **Legacy role** | `quikit.OrgMember.role` | `role` | Visible in the ROLE column. Used for back-compat with code that predates the dynamic-role system. Three values: `admin`/`manager`/`member`. Does NOT drive permission decisions. |
| **Dynamic AppRole** | `app_quikscale.UserAppRole` → `AppRole` | `appRoleId`, `appRoleName` (looked up in step 2 of §4) | Not visible in the main table. Drives all permission gates (`userCan`, `useMyPermissions`). Visible inside the Effective Permissions panel as `ROLE: ACOUNTABLITY USER` etc. |

Why the legacy column still exists:
- Some older API routes still check `OrgMember.role` for backward-compat (e.g. is this user an `admin` for org-level configuration before AppRole was introduced).
- The Add User modal's "Role" dropdown still writes to this column.

The tech-debt path is to remove the legacy column and reuse `AppRole.name` everywhere — flagged in `lib/schemas/userSchema.ts` but not done yet.

> Visible quirk: the screenshot's `Ashwin Singh` row shows ROLE = `Member` even though Ashwin is the org admin (he can manage roles). That's because `OrgMember.role` on his row is literally `"member"`. His ADMIN status comes from `UserAppRole` → `AppRole(name=admin)`, which the main table doesn't display. The expand panel and the User Management tab show the correct dynamic role.

---

## 10. Edge Cases

| Scenario | What you'll see |
|---|---|
| User has no teams (`UserTeam` rows empty) | TEAMS column shows `—` (em-dash). Example: `Test User` in the screenshot. |
| User has multiple teams | TEAMS column shows first team name + "+N more" indicator. Hover reveals the full list. |
| User has never signed in | LAST SIGN IN shows `Never`. `lastSignInAt` is `null`. |
| User's `OrgMember.status` is not `active` | STATUS pill changes color (yellow for `invited`, gray for `inactive`/`declined`/`pending`). Row may be greyed depending on filter. |
| User has no `UserAppRole` assignment (rare — happens if their role was deleted) | The main table is unaffected (`appRoleId`/`appRoleName` are null but the column isn't rendered). The expand panel shows "No role" and all cells are extras-only. |
| `UserAppRole` table is missing from the Prisma client (schema drift) | The lookup in step 2 silently catches and skips — `appRoleByUserId` stays empty, but the main list still loads. |
| QuikScale `App` row is missing from `quikit.App` | `getQuikScaleAppId()` returns null → the dynamic-role lookup is skipped entirely. Main list still loads with legacy data only. |
| Pagination beyond `totalPages` | API returns `data: []` — UI shows "No users found". |
| Duplicate `UserTeam` rows (shouldn't happen — unique constraint) | Each row appears once in `teamNames` because Prisma's `include` doesn't dedupe but the DB constraint prevents duplicates. |

---

## 11. Key Files

| Concern | File |
|---|---|
| API handler (list + create) | [`apps/quikscale/app/api/org/users/route.ts`](apps/quikscale/app/api/org/users/route.ts) |
| API handler (edit + delete a single user) | [`apps/quikscale/app/api/org/users/[id]/route.ts`](apps/quikscale/app/api/org/users/[id]/route.ts) |
| API handler (change a user's AppRole) | [`apps/quikscale/app/api/org/users/[id]/role/route.ts`](apps/quikscale/app/api/org/users/[id]/role/route.ts) |
| Email autocomplete API | [`apps/quikscale/app/api/org/users/search/route.ts`](apps/quikscale/app/api/org/users/search/route.ts) |
| Pagination parser | [`apps/quikscale/lib/api/pagination.ts`](apps/quikscale/lib/api/pagination.ts) |
| Zod schemas (validation) | [`apps/quikscale/lib/schemas/userSchema.ts`](apps/quikscale/lib/schemas/userSchema.ts) |
| Users page (UI) | [`apps/quikscale/app/(dashboard)/org-setup/users/page.tsx`](apps/quikscale/app/(dashboard)/org-setup/users/page.tsx) |
| Effective Permissions panel (row expansion) | [`apps/quikscale/app/(dashboard)/org-setup/users/components/UserPermissionsPanel.tsx`](apps/quikscale/app/(dashboard)/org-setup/users/components/UserPermissionsPanel.tsx) |
| Prisma schema | [`packages/database/prisma/schema.prisma`](packages/database/prisma/schema.prisma) — `User` L268, `OrgMember` L407, `UserTeam` L448, `Team` L465, `UserAppAccess` L93, `AppRole` L756, `UserAppRole` L777 |

---

## Quick Reference — Single Row Provenance

```
┌────────────────────────────────────────────────────────────────────────────┐
│  Row for "Ashwin Singh"                                                    │
│  ───────────────────────────────────────────────────────────────────────  │
│  UI cell        │ DB origin                                                │
│  Avatar (AS)    │ initials(firstName, lastName) from quikit.User           │
│  Full name      │ quikit.User.firstName + ' ' + quikit.User.lastName       │
│  email          │ quikit.User.email                                        │
│  ROLE = Member  │ quikit.OrgMember.role                                    │
│  TEAMS = Engin… │ public.Team.name (via public.UserTeam.teamId)            │
│  STATUS = Active│ quikit.OrgMember.status                                  │
│  LAST = 3h ago  │ formatRelative(quikit.User.lastSignInAt)                 │
│  (expand panel) │ app_quikscale.UserAppRole.roleId → AppRole.name          │
│                 │ + app_quikscale.UserPermissionExtra rows                 │
└────────────────────────────────────────────────────────────────────────────┘
```

---

**End of document.**

---

<a id="user-permissions-panel"></a>

# User Permissions Panel

> *(Source: `apps/quikscale/docs/userPermissionsPanel.md`)*


**App:** QuikScale (Goal Performance OS)
**UI location:** Org Setup → Users → **Users** tab → expand a user row
**Endpoint:** `GET / POST /api/org/users/[id]/permissions`
**Schema namespace:** `app_quikscale`
**Last updated:** 2026-05-15

> This document covers the **Effective permissions** panel that opens when an admin expands a user row. It is the per-user view of "role grants + user extras = effective permissions." For the role-side matrix (one bag of perms for many users) see [`roles.md`](roles.md).

---

## Table of Contents

1. [What This Panel Is](#1-what-this-panel-is)
2. [The Two Sources of Permission](#2-the-two-sources-of-permission)
3. [Cell States — How to Read the Matrix](#3-cell-states--how-to-read-the-matrix)
4. [Module Badges Explained](#4-module-badges-explained)
5. [Database Architecture](#5-database-architecture)
6. [API — GET & POST](#6-api--get--post)
7. [Save / Dirty State Flow](#7-save--dirty-state-flow)
8. [Effective Permission Resolution](#8-effective-permission-resolution)
9. [Module-Level Tristate Logic](#9-module-level-tristate-logic)
10. [Use Cases](#10-use-cases)
11. [Edge Cases](#11-edge-cases)
12. [End-to-End Example](#12-end-to-end-example)
13. [Key Files](#13-key-files)

---

## 1. What This Panel Is

When an admin clicks on a user row in the Users list, the row expands inline to show **"Effective permissions"** for that single user.

Unlike the role matrix (which edits one role for everyone on it), this panel edits **per-user additive grants** — extra permissions given to ONE specific user **on top of** their role.

It answers two questions simultaneously:

- "What can this user actually do?" (effective set = role + extras)
- "Why?" (which checkboxes come from the role and which were added as one-off extras)

### The banner explains the rules

> **Gray-checked + 🔒 cells come from the role and can't be changed here. Tick any empty cell to add an extra grant for just this user.**

That single sentence captures the whole design: **extras only ADD; they cannot subtract a role grant.** To remove access for one user without affecting others, demote them to a less-privileged role.

---

## 2. The Two Sources of Permission

A user's **effective** permission set is computed as:

```
effective(user, org) = UNION(role.permissions for role in user.roles)
                     ∪ extras(user, org)
```

| Source | Storage | UI cell appearance | Editable here? |
|---|---|---|---|
| **Role grants** | `RolePermission` rows linked via `UserAppRole` | Gray-checked ☑ with 🔒 lock icon | ❌ Read-only — edit on the role's matrix instead |
| **User extras** | `UserPermissionExtra` rows directly on the user | Amber-checked ☑ with orange dot, or amber dot in module header | ✅ Yes — click to toggle |
| **Empty** | No row in either table | ☐ unchecked | ✅ Yes — clicking adds an `UserPermissionExtra` row |

The lookup precedence:
1. If `RolePermission` grants `(resource, action)` to any of the user's roles → cell is **role-locked**.
2. Else if `UserPermissionExtra` grants it → cell is an **extra**.
3. Else → **empty**.

If an admin tries to add an extra for a permission the role already grants, the UI silently no-ops (the cell is locked). The DB layer would dedupe via the `(orgId, userId, resource, action)` unique constraint anyway.

---

## 3. Cell States — How to Read the Matrix

Each cell in the matrix has one of these visual states:

| State | Visual | Meaning | Click behavior |
|---|---|---|---|
| **Role-locked** | Gray background, ☑ tick, 🔒 lock icon | The user's role grants this. Cannot be removed from this panel. | No-op (cell is disabled) |
| **Extra** | Amber background, ☑ tick, amber dot in module header | A `UserPermissionExtra` row exists for this user. | Click toggles off (will be deleted on Save) |
| **Empty** | White background, ☐ unchecked | Neither source grants this. | Click toggles on (will be inserted on Save) |
| **Not applicable** | `—` placeholder | The leaf doesn't declare this action (e.g. `Dashboard` is view-only). | Disabled — cannot be granted via extras either. |

### Locked cells stay locked across module tristate toggles

If a module-row tristate checkbox is ticked, the action propagates to every non-locked leaf only. Role-locked cells are skipped — they are already on, and the panel cannot un-grant them.

---

## 4. Module Badges Explained

Next to every module label (e.g. "KPI", "Priority", "Org Setup") two small pills can appear:

| Badge | Meaning | Example |
|---|---|---|
| `N role` | The user has N grants on this module via their role(s). Computed across all leaves and all four actions. | `4 role` on KPI = 4 of the 8 possible (resource, action) cells in the KPI module are role-locked |
| `+N extra` | The user has N **additional** grants on this module via `UserPermissionExtra` rows (not already covered by the role). | `+1 extra` on Priority = 1 extra grant exists for Priority |

The badges update live as you click cells (the `+N extra` badge counts un-saved local state, then snaps to saved values after Save).

### How counts are computed

The component aggregates over every leaf in the module's subtree:

```typescript
function aggregateCounts(mod, roleGrants, extras) {
  let role = 0, extra = 0, all = 0;
  for (const leaf of walkLeaves(mod)) {
    for (const action of leaf.actions) {
      const key = `${leaf.resource}:${action}`;
      all++;
      if (roleGrants.has(key)) role++;
      else if (extras.has(key)) extra++;
    }
  }
  return { role, extra, all };
}
```

So `4 role` is **count of role-locked cells in the module**, and `+1 extra` is **count of cells held only via extras**. The total possible grants per module is `Σ(actions per leaf)`.

---

## 5. Database Architecture

The panel reads from and writes to:

```
┌──────────────────────────────────────────────────────────┐
│                User (quikit.User)                        │
│                params.id = the row being edited          │
└────────────┬─────────────────────────────────────────────┘
             │
             ├─► UserAppRole (app_quikscale.UserAppRole)
             │     │  (one row per role the user holds)
             │     └─► AppRole.permissions[]
             │           └─► RolePermission ◄──── ROLE GRANTS
             │
             └─► UserPermissionExtra ◄────────── USER EXTRAS
                   (app_quikscale.UserPermissionExtra)
```

### `UserPermissionExtra` model

```prisma
model UserPermissionExtra {
  id        String   @id @default(cuid())
  orgId     String   // tenant scope
  userId    String   // the user this extra is for
  resource  String   // e.g. "Priority", "OPSP.History.EditFinalize"
  action    String   // "view" | "create" | "update" | "delete"
  grantedBy String?  // admin who created it (audit)
  createdAt DateTime @default(now())

  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  org       Org      @relation(fields: [orgId], references: [id], onDelete: Cascade)

  @@unique([orgId, userId, resource, action])
  @@index([userId, orgId])
  @@schema("app_quikscale")
}
```

### Why the model lives in its own table (not a column on UserAppRole)

| Decision | Why |
|---|---|
| Separate table, not a JSON column on a join row | Allows EXISTS-style index lookups and joins with `RolePermission` for the merge query. Also gives a natural place for `grantedBy` / `createdAt` audit columns. |
| Scoped by `(orgId, userId)` not `(userAppRoleId)` | Extras are scoped to the **user in the org**, not to a specific role assignment. If the user is reassigned to a different role, their extras survive. |
| `(orgId, userId, resource, action)` uniqueness | Prevents duplicate rows. Atomic replace pattern (deleteMany + createMany) works even if the client sends dups. |
| `onDelete: Cascade` on user/org | Deleting the user or the org cleans up extras automatically. |
| **NOT** a join with `RolePermission` | Extras can grant resources/actions that the role doesn't have at all. They live independently. |

### Why extras CAN'T subtract from role grants

There is no "deny" model. The merge is a union:

```sql
-- Effectively:
SELECT 1 FROM RolePermission rp
  JOIN UserAppRole uar ON uar.roleId = rp.roleId
 WHERE uar.userId = ? AND uar.orgId = ? AND rp.resource = ? AND rp.action = ?
UNION ALL
SELECT 1 FROM UserPermissionExtra
 WHERE userId = ? AND orgId = ? AND resource = ? AND action = ?
LIMIT 1
```

If either side returns a row, the user has the permission. No row means denied. There is no third "explicit deny" table.

This is intentional — adding deny semantics turns a simple OR-merge into priority resolution that is much harder to reason about. The accepted workaround is: **demote the user to a less-permissive role**.

---

## 6. API — GET & POST

### `GET /api/org/users/[id]/permissions`

**Purpose:** hydrate the panel with the user's roles, role grants, raw extras, and the merged effective list (source-tagged for the UI).

**Auth:** `requireAdmin()` (only admins can view/edit other users' permissions).

**Response:**

```json
{
  "success": true,
  "data": {
    "userId": "user_test",
    "roles": [
      { "id": "role_acc_user", "name": "Acountablity User" }
    ],
    "roleGrants": [
      { "resource": "KPI", "action": "view"   },
      { "resource": "KPI", "action": "create" },
      { "resource": "KPI", "action": "update" },
      { "resource": "KPI", "action": "delete" }
    ],
    "extras": [
      { "resource": "Priority", "action": "view" }
    ],
    "effective": [
      { "resource": "KPI",      "action": "view",   "source": "role"  },
      { "resource": "KPI",      "action": "create", "source": "role"  },
      { "resource": "KPI",      "action": "update", "source": "role"  },
      { "resource": "KPI",      "action": "delete", "source": "role"  },
      { "resource": "Priority", "action": "view",   "source": "extra" }
    ]
  }
}
```

> The `effective` array deduplicates — if both a role and an extra grant the same `(resource, action)`, only the `role` entry appears (role precedence in the response).

### `POST /api/org/users/[id]/permissions`

**Purpose:** atomic replace of the user's extras set.

**Request:**

```http
POST /api/org/users/<userId>/permissions
Content-Type: application/json

{
  "extras": [
    { "resource": "Priority",                  "action": "view"   },
    { "resource": "OPSP.History.EditFinalize", "action": "update" }
  ]
}
```

**Validation (Zod):**

| Rule | On failure |
|---|---|
| `extras` is an array | 400 — Zod type error |
| Each entry has `resource` matching a known leaf | 400 — "Unknown resource" |
| Each entry has `action` ∈ `{view, create, update, delete}` | 400 — "Unknown action" |
| `(resource, action)` is a valid pair (leaf declares this action) | 400 — "(resource, action) pair is not valid for this leaf" |

The same `isValidPermissionPair()` guard used by the role-side `PUT /api/org/roles/[id]/permissions` runs here — extras cannot grant garbage like `(Dashboard, delete)`.

**Server logic (atomic):**

```typescript
await db.$transaction([
  db.userPermissionExtra.deleteMany({ where: { userId, orgId } }),
  db.userPermissionExtra.createMany({
    data: extras.map(p => ({ userId, orgId, ...p, grantedBy: actorId })),
  }),
]);
```

Full replace — passing `extras: []` revokes every extra for this user.

**Response:**

```json
{ "success": true, "data": { "userId": "user_test", "count": 2 } }
```

---

## 7. Save / Dirty State Flow

The panel keeps two pieces of local state:

- `extras: Set<string>` — the **current** desired set (mutated as the admin clicks cells)
- `savedExtras: Set<string>` — the **last saved** set (hydrated from `GET` on mount)

A diff is computed on every render:

```typescript
let added = 0, removed = 0;
for (const k of extras)      if (!savedExtras.has(k)) added++;
for (const k of savedExtras) if (!extras.has(k))      removed++;
```

When `added + removed > 0`, a sticky bottom bar appears showing **"N unsaved extras"** with **Discard** and **Save extras** buttons:

| Action | Effect |
|---|---|
| **Discard** | `setExtras(new Set(savedExtras))` — local changes reverted; bar disappears |
| **Save extras** | POST the current `extras` set as a full replace; on success, `setSavedExtras(new Set(extras))` and toast "Saved" |

Role-locked cells are not included in `extras` (they live in `roleGrants`), so toggling them is impossible — there is no diff to compute for them.

---

## 8. Effective Permission Resolution

The same merge happens server-side in `loadMyPermissions()` (used by `/api/me/permissions` for the sidebar / button gates) and in `userCan()` (used by every API route's auth gate):

```typescript
// Simplified from apps/quikscale/lib/api/permissions.ts
async function userCan(userId, orgId, resource, action) {
  // 1. Role grants — via UserAppRole join
  const roleHit = await db.rolePermission.findFirst({
    where: {
      resource, action,
      role: { appId, members: { some: { userId, orgId } } },
    },
  });
  if (roleHit) return true;

  // 2. User extras
  const extraHit = await db.userPermissionExtra.findFirst({
    where: { userId, orgId, resource, action },
  });
  return !!extraHit;
}
```

Both gates check the same logic, so what the admin sees in this panel is what the user will actually experience the next time their `useMyPermissions()` cache invalidates (or after a hard refresh).

### Cache invalidation considerations

`useMyPermissions()` caches via React Query with a 5-minute `staleTime`. When the admin saves extras for a user, that user's currently-open tabs will not see the change until:
- 5 minutes elapse, OR
- The user navigates (focus-revalidation), OR
- A manual `queryClient.invalidateQueries(["me-permissions"])` is fired

There is **no** WebSocket / SSE channel pushing perm changes today. Users on long-lived tabs may see stale UI for up to 5 minutes after an admin change. Server-side enforcement always sees fresh data — even if the button is visible in the UI, the API call gets 403.

---

## 9. Module-Level Tristate Logic

Module/submodule header rows have a checkbox per action column that operates as a **tristate over the non-locked leaves**.

| State | Meaning |
|---|---|
| ☐ unchecked | 0 non-locked leaves have this extra |
| ☑ checked | ALL non-locked leaves have this extra |
| ☒ indeterminate (dash glyph) | Some non-locked leaves have it |
| 🔒 locked-only | If ALL leaves in the subtree are role-locked, the header cell renders as locked — there is nothing for the admin to toggle here |

Clicking a module-row tristate:
- **Toggle ON** → add an extra for every leaf in the subtree that is not role-locked AND whose `actions` array includes this action.
- **Toggle OFF** → remove every extra in the subtree for this action. Role-locked cells are skipped (cannot be removed).

This is what produces the orange "indeterminate" appearance you see in the screenshot on the KPI module — `Individual KPI` is role-locked (all 4 actions granted by the role) while `Team KPI` is empty, so each action column is partially granted in the module's eyes.

---

## 10. Use Cases

### Use case A — Grant one user a one-off elevated capability

Story: "Ravi needs to delete a stale OPSP, but he's on the 'User' role which doesn't grant `OPSP.Categories:delete`."

Action:
1. Admin opens the Users tab.
2. Clicks Ravi's row to expand.
3. Ticks `Delete` on the `OPSP.Categories` leaf — cell turns amber.
4. Clicks **Save extras**.
5. Ravi refreshes his app or waits up to 5 minutes for the React Query cache to expire. Next click of his Delete button succeeds.
6. After the cleanup, admin re-opens the panel, unticks the cell, saves. Ravi loses the extra.

### Use case B — Grant the OPSP "Edit after Finalize" binary capability

Story: "Jane needs to fix a typo on a finalized OPSP."

Action:
1. Expand Jane's row.
2. Find the `OPSP History → Edit after Finalize` leaf (a sub-leaf under the OPSP submodule).
3. Tick the **Update** column (it's the only action this leaf declares).
4. Save.

The OPSP editor's `isLocked` predicate checks for `OPSP.History.EditFinalize:update` — Jane's editor now unlocks on the finalized record.

### Use case C — A new module is added; the admin wants to grant beta access to specific users

Story: "We just shipped the People module. Most users shouldn't see it yet, but the HR team should."

Two options:
1. **Per-user extras** — grant `People.Cycle:view`, `People.Goals:view`, etc. as extras for each HR user. Pro: surgical. Con: tedious for many users.
2. **Custom role** — create a "HR Beta" role with `People.*` grants, then `PATCH /api/org/users/[id]/role` for each HR user. Pro: reusable, easier to revoke en masse. Recommended.

### When NOT to use extras

- "I want to remove KPI access for ONE user on the 'User' role." → You can't. Demote them to a different role.
- "I want to grant the same 5 extras to 10 users." → Use a role. Extras are for one-offs.
- "I want to track which permissions are temporary." → Extras don't carry an expiry — there's no auto-revoke. If you need expiry, manage it manually or open a feature request.

---

## 11. Edge Cases

| Scenario | Behavior |
|---|---|
| Admin grants an extra that the role later picks up | The next merge query returns the role grant first; the extra row is still in the DB but redundant. No visible UI difference. Admin can clean up by unticking and saving. |
| User has 0 roles (e.g. their only role was deleted) | `roleGrants` is empty; ALL cells appear as either extras or empty. The admin can grant any permission via extras to keep them functional until reassignment. |
| Admin grants an extra, then the resource is removed from `PERMISSION_TREE` | The row stays in the DB but `userCan()` rejects upfront via `isResource()`. The UI does not render a row for the missing resource so the extra becomes invisible. A cleanup script can remove orphans. |
| Two admins edit the same user's extras concurrently | Last write wins — both POSTs are atomic full-replace. The second one overwrites the first. No optimistic concurrency token today. |
| User is deleted | `onDelete: Cascade` on `UserPermissionExtra.userId` removes all their extras. |
| Org is deleted | `onDelete: Cascade` on `UserPermissionExtra.orgId` removes them too. |
| Extras include a `(resource, action)` pair that the leaf doesn't declare | Rejected at the Zod refine step with "(resource, action) pair is not valid for this leaf". No DB write. |
| The user has multiple roles and one grants `(KPI, view)` while another doesn't | Granted — union semantics. The UI shows the cell as role-locked. |

---

## 12. End-to-End Example

Scenario from the screenshot: **Test User, role = Acountablity User, +1 Priority extra**

### DB state

```sql
-- 1) The user
SELECT id, email FROM quikit."User" WHERE id = 'user_test';
-- → ('user_test', 'test@gmail.com')

-- 2) Their role assignment
SELECT * FROM app_quikscale."UserAppRole" WHERE userId = 'user_test';
-- → roleId = 'role_acc_user'  (Acountablity User)

-- 3) The role's grants (assume 4 cells on Individual KPI)
SELECT resource, action FROM app_quikscale."RolePermission"
 WHERE roleId = 'role_acc_user';
-- → ('KPI', 'view')
--   ('KPI', 'create')
--   ('KPI', 'update')
--   ('KPI', 'delete')

-- 4) The user's extras
SELECT resource, action FROM app_quikscale."UserPermissionExtra"
 WHERE userId = 'user_test' AND orgId = 'org_acme';
-- → ('Priority', 'view')
```

### Panel render

```
ENTITY                  VIEW    CREATE  UPDATE  DELETE
─────────────────────────────────────────────────────────
Dashboard  [0 role]      ☐       —       —       —
KPI        [4 role]      ☒       ☒       ☒       ☒    ← module tristate (indeterminate)
  Individual KPI         🔒☑     🔒☑     🔒☑     🔒☑   ← role-locked
  Team KPI               ☐       ☐       ☐       ☐    ← empty
Priority   [0 role][+1 extra]
                         ☑●      ☐       ☐       ☐    ← View is amber-checked (extra)
Org Setup  [0 role]      ☐       ☐       ☐       ☐
  Teams                  ☐       ☐       ☐       ☐
  Users                  ☐       ☐       ☐       ☐
  Quarter Settings       ☐       ☐       ☐       ☐
WWW        [0 role]      ☐       ☐       ☐       ☐
```

### Effective permission decision for Test User

| Permission | Source | Allowed? |
|---|---|---|
| `KPI:view` | Role grant | ✅ |
| `KPI:create` | Role grant | ✅ |
| `KPI:update` | Role grant | ✅ |
| `KPI:delete` | Role grant | ✅ |
| `Priority:view` | Extra | ✅ |
| `TeamKPI:view` | Neither | ❌ |
| `Dashboard:view` | Neither | ❌ |
| `Priority:create` | Neither | ❌ |

### After admin adds `Team KPI:view` as an extra

Admin ticks the Team KPI View cell → it turns amber. Sticky bar shows "1 unsaved extra". Admin clicks **Save extras**.

```http
POST /api/org/users/user_test/permissions
{
  "extras": [
    { "resource": "Priority", "action": "view" },
    { "resource": "TeamKPI",  "action": "view" }
  ]
}
```

Server:
1. `requireAdmin()` — OK.
2. `orgMember.findUnique({ orgId, userId: "user_test" })` — found.
3. Inside transaction:
   - `userPermissionExtra.deleteMany({ userId: "user_test", orgId })` (clears 1 existing row)
   - `userPermissionExtra.createMany([{Priority,view},{TeamKPI,view}])` (inserts 2 rows)
4. Response: `{ success: true, data: { userId: "user_test", count: 2 } }`

Test User's next API call to a `TeamKPI` endpoint or sidebar refresh picks up the new permission.

---

## 13. Key Files

| Concern | File |
|---|---|
| Panel component (UI) | [`apps/quikscale/app/(dashboard)/org-setup/users/components/UserPermissionsPanel.tsx`](apps/quikscale/app/(dashboard)/org-setup/users/components/UserPermissionsPanel.tsx) |
| API — GET / POST | [`apps/quikscale/app/api/org/users/[id]/permissions/route.ts`](apps/quikscale/app/api/org/users/[id]/permissions/route.ts) |
| Server permission gate (uses the same union) | [`apps/quikscale/lib/api/permissions.ts`](apps/quikscale/lib/api/permissions.ts) |
| Client permission hook (caches `/api/me/permissions`) | [`apps/quikscale/lib/hooks/useMyPermissions.ts`](apps/quikscale/lib/hooks/useMyPermissions.ts) |
| Permission tree (resource catalog used by the matrix) | [`apps/quikscale/lib/api/permissionsRegistry.ts`](apps/quikscale/lib/api/permissionsRegistry.ts) |
| Validation guard | `isValidPermissionPair` in [`apps/quikscale/lib/api/permissionsRegistry.ts`](apps/quikscale/lib/api/permissionsRegistry.ts) |
| Schema model | [`packages/database/prisma/schema.prisma`](packages/database/prisma/schema.prisma) — `UserPermissionExtra` L809–823 |
| Migration that created the table | [`packages/database/prisma/migrations/20260512130000_dynamic_roles_v2/migration.sql`](packages/database/prisma/migrations/20260512130000_dynamic_roles_v2/migration.sql) |

---

**End of document.**

---

<a id="sort-search-rbac-fixes"></a>

# Sort, Search, and RBAC Fixes (2026-05-15 → 2026-05-18)

> *(Source: `apps/quikscale/docs/sortSearchRbacFixes.md`)*


> Engineering notes covering four root-cause investigations and their fixes,
> spanning sort/search persistence and admin authorization. All changes are
> scoped to `apps/quikscale/` (plus one shared package note for context).
>
> **Date window:** 2026-05-15 → 2026-05-18

---

## Table of contents

1. [Issue 1 — KPI sort error: "Failed to load KPIs"](#issue-1--kpi-sort-error-failed-to-load-kpis)
2. [Issue 2 — Sort/search persistence across reload](#issue-2--sortsearch-persistence-across-reload)
3. [Issue 3 — Same sort indicator across every module](#issue-3--same-sort-indicator-across-every-module)
4. [Issue 4 — Admin 403 on `/api/org/roles` (dual role system)](#issue-4--admin-403-on-apiorgroles-dual-role-system)
5. [Architectural patterns introduced](#architectural-patterns-introduced)
6. [Files changed (full list)](#files-changed-full-list)

---

## Issue 1 — KPI sort error: "Failed to load KPIs"

### Symptom

Clicking **Sort Ascending** (or Descending) on the *Owner* column of the
Individual KPI page produced a red banner: **Failed to load KPIs**. The same
failure repeated for Measurement Unit, Target Value, Quarterly Goal, QTD
Goal, QTD Achieved, and Description columns.

### Root cause

A three-layer mismatch between the front-end sort menu and the API contract:

1. **Front-end** — [apps/quikscale/app/(dashboard)/kpi/hooks/useTableColumns.ts](../app/(dashboard)/kpi/hooks/useTableColumns.ts)
   defined `SORT_KEYS` mapping every visible column to a backend sort key
   (`owner`, `measurementUnit`, `target`, …).
2. **Zod schema** — [apps/quikscale/lib/schemas/kpiSchema.ts](../lib/schemas/kpiSchema.ts)
   `kpiListParamsSchema.sortBy` accepted only:
   `["name", "createdAt", "progressPercent", "healthStatus"]`.
   Any other value triggered `ZodError` inside `kpiListParamsSchema.parse(...)`
   at [route.ts:36](../app/api/kpi/route.ts#L36), which propagated as a 500.
3. **Database layer** — even if Zod accepted `sortBy = "owner"`, the original
   `orderBy[validated.sortBy] = validated.sortOrder` would have ordered rows
   by the raw `KPI.owner` column (a userId string) instead of by the owner's
   actual name.

`useKPIs` (TanStack Query) surfaced the API error as `error.isError = true`,
which the page renders as the red "Failed to load KPIs" message.

A secondary defect: `SORT_KEYS["weeklyGoal"] = "qtdGoal"` — a lying mapping
that pretended to sort by weekly goal but actually sorted by quarter-to-date
goal. This silently produced wrong results in the rare case the user clicked
sort on the Weekly Goal column.

### Solution

| File | Change |
|---|---|
| [lib/schemas/kpiSchema.ts](../lib/schemas/kpiSchema.ts) | Expanded `sortBy` enum to include `owner`, `measurementUnit`, `target`, `quarterlyGoal`, `qtdGoal`, `qtdAchieved`, `description`. |
| [app/api/kpi/route.ts](../app/api/kpi/route.ts) | Replaced naive `orderBy[sortBy] = dir` with a relation-aware orderBy: `sortBy="owner"` becomes `{ owner_user: { firstName: dir } }` with `lastName` as a secondary key. Added `createdAt` desc as a stable tiebreaker (skipped when `createdAt` is already the primary key) so pagination doesn't shuffle equal-key rows. |
| [app/api/kpi/route.ts](../app/api/kpi/route.ts) | DB search extended: server resolves `User.firstName`/`lastName` `ILIKE %q%` to a set of `userIds`, then matches on `KPI.owner IN (…)` and `KPI.ownerIds hasSome (…)`. Typing "rishab" now surfaces Rishab's KPIs. |
| [app/(dashboard)/kpi/hooks/useTableColumns.ts](../app/(dashboard)/kpi/hooks/useTableColumns.ts) | Removed the misleading `weeklyGoal: "qtdGoal"` mapping. Weekly Goal is a per-row computed value and isn't server-sortable today. |

### Verification

- `npx tsc --noEmit` — clean for every touched file.
- `__tests__/api/kpi` — no regression vs. baseline (the failing tests in that
  folder pre-date this change; verified by stash/pop comparison).
- Manual: each sort-menu choice on each sortable column returns 200 + a
  correctly ordered rowset.

---

## Issue 2 — Sort/search persistence across reload

### Symptom

When the user applied a sort or typed a search term on Individual KPI,
Priority, or WWW, the state was lost on hard reload (Ctrl+Shift+R). Sort
also reset when navigating between modules.

### Root cause

The state lived in component-local `useState`:

- **KPI Individual** — sort/search inside the page's `filters` useState.
  Cleared on unmount/reload.
- **Priority** — sort persisted in the DB (`useTablePrefs("priority").sort`),
  but search was local useState and `filterStatus`/`filterOwner` reset on
  navigation.
- **WWW** — same as Priority.

The system already had a DB-backed `useTablePrefs` hook for sort, but it was
not consistent (KPI didn't use it for sort) and didn't cover search at all.

### Solution

Built a generic Redux Toolkit store with a `tables` slice keyed by module,
plus reusable hooks and localStorage persistence. One pattern, every module.

**New store** — [lib/store/index.ts](../lib/store/index.ts):

```ts
type TableModule = "kpi" | "kpiTeams" | "priority" | "www";

interface TableState {
  sortBy: string;
  sortOrder: "asc" | "desc";
  search: string;
}

// State shape: { byModule: Record<TableModule, TableState> }
```

**Hooks:**

- `useTableSort(module)` → `{ sortBy, sortOrder, setSort }`
- `useTableSearch(module)` → `{ search, setSearch }`
- `useDebouncedTableSearch(module, 300)` → `[inputValue, setInputValue, debouncedReduxValue]`

**localStorage persistence** — `initTablesPersistence()`:

- Storage key: `quikscale.tables` with version field `v: 1`.
- Idempotent — safe under React StrictMode double-effects.
- **Hydration deferred to a `useEffect` in the Provider** so the first client
  render matches the SSR HTML (no hydration mismatch). The naive alternative
  (`preloadedState` at module load) would inject persisted values before
  React mounts and cause a server/client divergence on any UI that reads
  from the slice on first render.
- Versioned + shape-validated on read; corrupt or out-of-version payloads
  are silently dropped.

**Search debounce — subtle correctness issue**

A single combined "input -> debounce -> Redux" effect contains a hidden bug:
after hydration, `reduxSearch` jumps to the persisted value while local
`searchInput` is still the default `""`. The pending 300ms timer would then
fire and write `""` back to Redux, clobbering the hydrated value.

Fix — split into two one-way effects:

```ts
// 1) Redux -> local. Mirrors external changes (esp. rehydration) into
//    the input.
useEffect(() => { setInput(search); }, [search]);

// 2) Local -> Redux (debounced). The `input === search` guard short-circuits
//    the sync loop and prevents the typing timer from overwriting a fresh
//    hydration.
useEffect(() => {
  if (input === search) return;
  const t = setTimeout(() => setSearch(input), delay);
  return () => clearTimeout(t);
}, [input, search, delay, setSearch]);
```

This shape is encapsulated in `useDebouncedTableSearch` so every list page
gets it for free.

**Coexisting systems (intentional):**

- `useTablePrefs` ([lib/hooks/useTablePreferences.ts](../lib/hooks/useTablePreferences.ts))
  — DB-backed. Still owns `frozenCol`, `hiddenCols`, `colWidths`. These need
  cross-device persistence.
- `tables` Redux slice (this) — sort + search. Per-browser by design.

### Migration scope

| Module | Sort source (before → after) | Search source (before → after) |
|---|---|---|
| KPI Individual | useState in `filters` → Redux | useState → Redux + debounce |
| Priority | `useTablePrefs.sort` (DB) → Redux | useState → Redux + debounce |
| WWW | `useTablePrefs.sort` (DB) → Redux | useState → Redux + debounce |
| KPI Teams | n/a — `onSort={() => {}}` (not implemented) | n/a |

### Verification

- `npx tsc --noEmit` — clean.
- Manual: sort + search restored on hard reload in every migrated module.
  DevTools → Application → Local Storage → `quikscale.tables` shows the
  persisted payload.
- Adding a new module is now: append to `TABLE_MODULES`, add default entry,
  call two hooks.

---

## Issue 3 — Same sort indicator across every module

### Symptom

The active sort column rendered three different visuals:

- **KPI Individual** — Lucide `ArrowUp` / `ArrowDown`, `text-accent-600`,
  active label tinted `text-accent-700`.
- **Priority** — Hand-rolled inline SVG chevron, `text-blue-500`, no active
  label tint.
- **WWW** — Same hand-rolled chevron as Priority.

### Root cause

Each table component built its own inline arrow at different times. There
was no shared component, so visual drift was inevitable.

### Solution

Extracted one shared component — [components/table/SortIndicator.tsx](../components/table/SortIndicator.tsx):

```tsx
interface Props {
  active: boolean;
  direction: "asc" | "desc" | null | undefined;
  className?: string;
}

export function SortIndicator({ active, direction, className }: Props) {
  if (!active || !direction) return null;
  const Icon = direction === "asc" ? ArrowUp : ArrowDown;
  return (
    <Icon
      className={`h-3 w-3 text-accent-600 flex-shrink-0 ${className ?? ""}`}
      aria-label={`Sorted ${direction === "asc" ? "ascending" : "descending"}`}
    />
  );
}
```

Used in all three table components. The active column label also picks up
`text-accent-700`, so the full visual is theme-aware (purple/teal/orange
tenants get their accent automatically).

The freeze-column icon (still `text-blue-400`) is left alone — it's the
freeze indicator, not the sort indicator, and is governed by the locked
table palette rule in [CLAUDE.md](../../CLAUDE.md).

### Verification

- `npx tsc --noEmit` — clean.
- Manual: identical arrow on every sorted column across all three modules.

---

## Issue 4 — Admin 403 on `/api/org/roles` (dual role system)

### Symptom

User Ram, who had been assigned the **admin** role via Org Setup → User
Management, hit `GET /api/org/roles` and got **403 Forbidden** with
"Admin access required". The page rendered "Failed to load roles".

Ashwin (a different admin) had no issue.

### Root cause

QuikScale runs **two parallel role systems** that are not kept in sync:

| System | Source of truth | Used by |
|---|---|---|
| **Legacy** | `OrgMember.role` (string column: `"admin"`, `"member"`, etc.) | `requireAdmin()` guard at [packages/auth/require-admin.ts:33-37](../../../packages/auth/require-admin.ts#L33-L37) |
| **Dynamic v2** | `UserAppRole` join → `AppRole` (the table in Org Setup → User Management) | `userCan()`, all v2 UI |

Sequence that produces the bug:

1. `GET /api/org/roles` calls `requireAdmin()` ([app/api/org/roles/route.ts:16](../app/api/org/roles/route.ts#L16)).
2. The shared factory checks **only** `OrgMember.role` via `ROLE_HIERARCHY`.
   `admin`/`org_admin`/`super_admin` are tier 5; everything below 403s.
3. The v2 role-assignment endpoint [`PATCH /api/org/users/[id]/role`](../app/api/org/users/[id]/role/route.ts#L114-L119)
   writes `UserAppRole` (line 118: `ensureUserOnRole(...)`) — and **does not
   touch** `OrgMember.role`.
4. So Ram is admin in the v2 system but tier 2 (`member`) in the legacy
   system. The legacy guard rejects him.

Ashwin works because his `OrgMember.role = "admin"` was set during initial
seeding; the v2 system is irrelevant for his case.

**Blast radius:** every route gated by the shared `requireAdmin()` has this
bug for anyone assigned admin via the v2 UI — not just `/api/org/roles`.
Routes affected include role management, user management, team management,
and quarter settings.

### Solution

Local override at [apps/quikscale/lib/api/requireAdmin.ts](../lib/api/requireAdmin.ts).
Was a one-line re-export of the shared factory; now a full guard that
accepts **either**:

1. Legacy `OrgMember.role` at or above admin tier, **OR**
2. Active `UserAppRole` row pointing at the system `admin` AppRole for this
   org + QuikScale.

```ts
// Tier 1 — legacy.
const legacyLevel = ROLE_HIERARCHY[membership.role] ?? 0;
if (legacyLevel >= ADMIN_MIN_LEVEL) return { session, userId, orgId, membership };

// Tier 2 — v2 dynamic-roles fallback.
const appId = await getQuikScaleAppId();
if (appId) {
  const v2Admin = await db.userAppRole.findFirst({
    where: { userId, orgId, role: { appId, isSystem: true, name: "admin" } },
    select: { id: true },
  });
  if (v2Admin) return { session, userId, orgId, membership };
}

return { error: NextResponse.json({ success: false, error: "Admin access required" }, { status: 403 }) };
```

Return shape (`{ session, userId, orgId, membership }` on success,
`{ error: NextResponse }` on failure) matches the shared factory exactly, so
every call site keeps working unchanged.

### Why local override, not shared edit?

`@quikit/auth/require-admin.ts` is shared across apps. The v2 schema
(`AppRole`, `UserAppRole`) lives in the `app_quikscale` schema and is
QuikScale-specific. Teaching the shared package about QuikScale tables is a
layering violation. Wrapping locally keeps the v2 logic where it belongs.

### Long-term considerations

This wrapper is a bridge, not the destination. The proper end-state is one
of:

- **Sync at write-time** — make `PATCH /api/org/users/[id]/role` also bump
  `OrgMember.role` to/from `"admin"` whenever the admin AppRole is
  granted/revoked. Eliminates the inconsistency at the source.
- **Retire the legacy field** — migrate every route off `requireAdmin()` to
  `userCan(userId, orgId, "Some.Resource", "some.action")` (the v2
  permission-based approach). Drop `OrgMember.role` entirely.

Either way, this wrapper would be removed at that point.

### Verification

- `npx tsc --noEmit` — clean (only the unrelated pre-existing `org-setup/users` error).
- Manual: Ram's `/api/org/roles` should now return 200 on the next request
  (no logout required — the session already has `userId`/`orgId`, only the
  guard logic changed).
- Same fix benefits every other `requireAdmin`-gated route automatically.

### Audit — every admin authorization path in QuikScale

| Guard / helper | Location | Checks legacy? | Checks v2? | Status |
|---|---|---|---|---|
| `requireAdmin()` | [lib/api/requireAdmin.ts](../lib/api/requireAdmin.ts) | Yes | Yes | **Fixed today** |
| `isOrgAdmin()` | [lib/api/visibility.ts](../lib/api/visibility.ts) | Yes | Yes | Already correct |
| `userCan()` (used by `withOrgAuth`) | [lib/api/permissions.ts](../lib/api/permissions.ts) | n/a (v2 by design) | Yes | Already correct |
| `loadMyPermissions().isAdmin` (client) | [lib/api/permissions.ts](../lib/api/permissions.ts) | n/a | Yes | Already correct |
| `@quikit/auth/require-admin` | `packages/auth` | Yes | No | Not imported by any production route |

**Routes benefiting from today's fix (15 total, all use the local wrapper):**

- Org/roles management: `GET/POST /api/org/roles`, `GET/PATCH/DELETE /api/org/roles/[id]`, `GET/PUT /api/org/roles/[id]/members`, `GET/PUT /api/org/roles/[id]/permissions`, `GET/POST /api/org/users/[id]/permissions`
- User role/status: `PATCH /api/org/users/[id]/role`, `PATCH /api/org/users/[id]/status`
- OPSP review: `POST /api/opsp/review`, `POST /api/opsp/review/critical`, `POST /api/opsp/review/secondary`, `GET /api/opsp/review/logs`
- Client meetings (clients): `GET/POST /api/client-meetings/clients`, `GET/PATCH/DELETE /api/client-meetings/clients/[id]`, `POST /api/client-meetings/clients/[id]/restore`
- Settings: `GET/PATCH /api/settings/configurations`

**Routes that already worked** (use `withOrgAuth` + `userCan()` or `isOrgAdmin()`):

- All KPI / Priority / WWW CRUD
- Sidebar visibility + page-level permission gates
- Row-level visibility scoping (admin sees all KPIs etc.)

After the fix, any user assigned admin via Org Setup → User Management has
full admin access across the app — no further code changes required.

---

## Architectural patterns introduced

### 1. Redux Toolkit alongside TanStack Query

- **Server state** stays in TanStack Query (`useKPIs`, `usePriorities`, etc.).
- **Ephemeral UI flags** stay in `useState` (drawer open/closed, hover state).
- **Cross-component module state** (sort + search) lives in Redux.

The three layers don't overlap. Never store fetched row data in Redux.

### 2. Module-keyed slice + reusable hooks

Adding a new list module:

1. Append to `TABLE_MODULES` in [lib/store/index.ts](../lib/store/index.ts).
2. Add a default entry to `TABLE_DEFAULTS`.
3. In the page: `useTableSort("module")` + `useDebouncedTableSearch("module")`.
4. Pass `sortBy`/`sortOrder` to the table's header for the indicator; wire
   `onSort` to `setSort`.

### 3. SSR-safe localStorage rehydration

- Persistence init runs from a `useEffect` in the Provider, **never** at
  module load. First render uses defaults so the SSR HTML matches.
- Versioned + shape-validated payloads.
- Idempotent so React StrictMode (or repeated Provider mounts) don't
  double-subscribe.

### 4. Shared sort indicator

`<SortIndicator active direction />` is the only place sort arrows are
rendered. Visual changes propagate everywhere automatically.

### 5. App-local admin guard

`apps/quikscale/lib/api/requireAdmin.ts` (the wrapper) is the import path
every QuikScale route uses. Never import directly from
`@quikit/auth/require-admin` for new routes — you'd skip the v2 fallback
and re-introduce the 403 bug.

---

## Files changed (full list)

### New files

- [apps/quikscale/lib/store/index.ts](../lib/store/index.ts) — Redux store, tables slice, hooks, persistence
- [apps/quikscale/components/table/SortIndicator.tsx](../components/table/SortIndicator.tsx) — shared sort-arrow component
- [apps/quikscale/docs/sortSearchRbacFixes.md](./sortSearchRbacFixes.md) — this document

### Modified files

| File | Reason |
|---|---|
| [apps/quikscale/lib/schemas/kpiSchema.ts](../lib/schemas/kpiSchema.ts) | Expanded `sortBy` enum |
| [apps/quikscale/app/api/kpi/route.ts](../app/api/kpi/route.ts) | Relation-aware orderBy + owner-name search |
| [apps/quikscale/app/(dashboard)/kpi/hooks/useTableColumns.ts](../app/(dashboard)/kpi/hooks/useTableColumns.ts) | Removed wrong `weeklyGoal` sort mapping |
| [apps/quikscale/app/(dashboard)/kpi/components/KPITable.tsx](../app/(dashboard)/kpi/components/KPITable.tsx) | Added `sortBy`/`sortOrder` props; uses `<SortIndicator>` |
| [apps/quikscale/app/(dashboard)/kpi/page.tsx](../app/(dashboard)/kpi/page.tsx) | Uses `useTableSort` + `useDebouncedTableSearch` |
| [apps/quikscale/app/(dashboard)/priority/page.tsx](../app/(dashboard)/priority/page.tsx) | Sort moved from `useTablePrefs` to Redux; search debounced via shared hook |
| [apps/quikscale/app/(dashboard)/priority/components/PriorityTable.tsx](../app/(dashboard)/priority/components/PriorityTable.tsx) | Sort source switched to Redux; uses `<SortIndicator>` |
| [apps/quikscale/app/(dashboard)/www/page.tsx](../app/(dashboard)/www/page.tsx) | Same as Priority |
| [apps/quikscale/app/(dashboard)/www/components/WWWTable.tsx](../app/(dashboard)/www/components/WWWTable.tsx) | Same as PriorityTable |
| [apps/quikscale/components/providers.tsx](../components/providers.tsx) | Added `ReduxProvider` and `initTablesPersistence()` effect |
| [apps/quikscale/lib/api/requireAdmin.ts](../lib/api/requireAdmin.ts) | Rewrote as full guard with legacy + v2 dual check |
| [apps/quikscale/package.json](../package.json) | Added `@reduxjs/toolkit` + `react-redux` |

---

