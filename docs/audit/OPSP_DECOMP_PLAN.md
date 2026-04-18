# OPSP Page Decomposition Plan

Tracking doc for breaking up `apps/quikscale/app/(dashboard)/opsp/page.tsx`
(currently **1889 lines**). Big moves are gated on coverage per
`CLAUDE.md` — the testing harness must be our safety net.

## 1. Current structure

| Lines        | Region                                                      |
|--------------|-------------------------------------------------------------|
| 1 – 46       | `"use client"`, imports (hooks, types, components, icons)   |
| 48 – 83      | `FormData` interface (38 top-level fields)                  |
| 84 – 103     | `defaultForm()` — single fresh-state factory                |
| 107 – 851    | `OPSPPreview` component (~745 lines — PDF/Word preview)     |
| 110 – 325    | ├─ `handleDownloadPDF`, `handleDownloadWord` (dynamic imports + docx assembly) |
| 327 – 345    | ├─ Local class strings + thin wrappers around helpers       |
| 349 – 406    | ├─ `CritBlock`, `CatProjTable`, `NumberedOwnerRows` sub-components |
| 408 – 851    | └─ JSX for 4-page OPSP print layout                         |
| 855 – 1889   | `OPSPPage` default export — main editor                     |
| 856 – 895    | ├─ URL-param parsing + `useState` (20 state slots)          |
| 896 – 1019   | ├─ 6 `useEffect` hooks (outside-click, category cache, config load, data load, cascades) |
| 1021 – 1047  | ├─ `set`, `setArr`, `confirmFinalize` handlers              |
| 1049 – 1100  | ├─ Cascade effects: Targets → Goals, Goals → Actions        |
| 1103 – 1108  | ├─ `SaveBadge` inline component                             |
| 1110 – 1889  | └─ JSX: header, year/quarter picker, 4 quadrants, modals, setup wizard |

## 2. Logical modules

Target split (names are proposals; each becomes its own file under
`apps/quikscale/app/(dashboard)/opsp/components/`):

| Proposed module              | Source lines   | Responsibility                                             |
|------------------------------|----------------|------------------------------------------------------------|
| `lib/utils/opspHelpers.ts`   | 84–103, 169–178, 327–338, 861–868 | Empty factories, URL parsing, owner/date helpers (**DONE**) |
| `lib/utils/opspNormalize.ts` | prev. inline   | Payload normalizer (**DONE in earlier pass**)              |
| `PreviewPDFActions.ts`       | 111 – 322      | PDF + Word export (pure async; takes `form` + `users`)     |
| `PreviewLayout.tsx`          | 408 – 851      | 4-page JSX tree (leaf — no state, just props)              |
| `YearQuarterPicker.tsx`      | 1162 – 1238    | Header dropdown (year + quarter grid)                      |
| `HeaderBar.tsx`              | 1140 – 1285    | Logo, SaveBadge, picker, action buttons                    |
| `ObjectivesSection.tsx`      | ~1310 – 1500   | Core values / purpose / actions (Q1 quadrant)              |
| `TargetsSection.tsx`         | ~1400 – 1490   | 5-year targets + key thrusts                               |
| `GoalsSection.tsx`           | ~1490 – 1620   | Annual goals + key initiatives                             |
| `ActionsSection.tsx`         | ~1620 – 1740   | Quarterly actions + rocks                                  |
| `AccountabilitySection.tsx`  | ~1740 – 1890   | KPI accountability + quarterly priorities + trends         |
| `useOPSPForm.ts`             | 861–1100       | Custom hook: state + load + save + cascades                |

After the split, `page.tsx` should be **~200 lines**: hook + 5 section
components + modals wiring.

## 3. Riskiest chunks

1. **Cascade `useEffect` pair (1049–1100)** — both reach into
   `prev.targetRows` / `prev.goalRows` to recompute downstream rows and
   rely on referential-equality returns to avoid re-render storms. Any
   split that moves these into a child component must preserve the
   `setForm(prev => changed ? next : prev)` pattern.
2. **Setup-wizard gating (913–962)** — the mount effect toggles
   `showSetupWizard`, `planStartYear/EndYear/StartQuarter` plus
   `fiscalYearStart`. Five derived pieces of state from one fetch —
   splitting it requires a single reducer or custom hook, not loose
   `useState`s, to stay atomic.
3. **Autosave debouncer (1013–1019)** — 1.5 s debounce with
   `skipNextSave` flag used to swallow the save after a load. Moving
   this requires co-locating the `skipNextSave` ref with `setForm`.
4. **Deep JSX nesting in the 4 quadrants (1310–1870)** — many rows
   reference `form.targetRows[i]`, `form.goalRows[i]` and their
   "inherited" flag computed inline. Extracting a section means passing
   the computed `inherited` props down, not recomputing in the child.

## 4. Extraction order (for a future session)

1. **Extract `PreviewPDFActions.ts`** — the two `handleDownload*`
   callbacks are self-contained and already call only pure helpers.
   Lowest risk after helpers.
2. **Extract `useOPSPForm` hook** — move state, load, save, cascades.
   Forces clean prop surface for the rest. Hardest single step; do it
   before any section extraction.
3. **Extract `YearQuarterPicker.tsx`** — clear boundary, only needs
   `{year, quarter, planStartYear, planEndYear, planStartQuarter,
   onChange}`.
4. **Extract `PreviewLayout.tsx`** — pure render, only needs `form` +
   `users` + helper imports. Shrinks `OPSPPreview` wrapper to <100 lines.
5. **Extract the 4 quadrant sections** one at a time, in this order:
   Objectives → Targets → Goals → Actions → Accountability. Each pass
   verifies the cascade effects still fire correctly (they run on
   `form.targetRows` / `form.goalRows`, not on any JSX).

## 5. Coverage gates per chunk

| Chunk                          | Required coverage before move                                    |
|--------------------------------|------------------------------------------------------------------|
| PreviewPDFActions              | `opspHelpers.test.ts` (done) + smoke test that `stripHtml` / `resolveOwnerName` are called by a mock-docx integration test |
| useOPSPForm                    | Dedicated hook test covering: debounce save, skipNextSave flag, load→form sync, cascades (both directions). Must reach ≥70% on the hook file. |
| YearQuarterPicker              | Component DOM test: disabled quarters before `planStartQuarter`, only current FY selectable |
| PreviewLayout                  | Snapshot test on a seeded form (golden file) + a test that non-empty `form.rocks` render as numbered rows |
| ObjectivesSection              | Fixture test for `OBJECTIVES_FIXTURE` + cascade regression: clearing `targetRows[0]` wipes `goalRows[0].q1-q4` |
| Each remaining section         | Same pattern: a fixture + 1 regression test for the row it cascades into |

**Overall gate (CLAUDE.md §Before large refactors):** the page and its
direct dependents must reach ≥50% line coverage before the quadrant
sections move. Current estimate after this pass: ~35 % (helpers +
normalize). Next coverage lever: a `useOPSPForm` hook test.

## 6. What this session shipped

- New `apps/quikscale/lib/utils/opspHelpers.ts` — 11 empty factories +
  5 pure helpers (`parseUrlYear`, `parseUrlQuarter`, `formatDueDate`,
  `stripHtml`, `resolveOwnerName`).
- New `apps/quikscale/__tests__/unit/opspHelpers.test.ts` — 40+
  assertions across happy paths, edge cases, and null/empty handling.
- `page.tsx` dropped from 1891 → 1889 lines with **zero** behavioral
  change; only the empty-factory block, `fmtDue`, `strip`, inline
  `ownerName` duplicates, and URL parse logic became one-liners
  importing from `opspHelpers.ts`.
