# Root Cause Analysis — Meeting Rhythm Dashboard Showing Incorrect Figures

| | |
|---|---|
| **Title** | "Quality of the dashboards" and Member Punch-In figures did not match the Excel export, and did not match the data actually shown on screen |
| **Document status** | Final |
| **Date raised** | 11 August 2026 |
| **Date resolved** | 11 August 2026 |
| **Severity** | Medium — incorrect information displayed; **no data loss or data corruption** |
| **Affected area** | QuikScale → Client Meetings → Meeting Rhythm Dashboard (Performance tab, Member Punch-In tab, Excel exports) |
| **Prepared for** | Client stakeholders |

---

## 1. Executive summary

The Meeting Rhythm Dashboard's **"Quality of the dashboards"** figure (Performance tab) did not match the **"Total Average of All Members"** figure in the Member Punch-In Excel export, even though both are meant to describe the same thing. Separately, the **Member Punch-In tab's "Total Avg" row** and **"Total Weekly Average"** figure did not match the individual weekly rows displayed directly above them on the same screen.

**Important:** the underlying data was always saved correctly. Every score, absence, and Dashboard-NA flag a user entered was stored exactly as entered. The problem was entirely in how the application **calculated and displayed summary numbers** from that correct data — three independent calculation defects, found and fixed one after another as each was verified against this client's real data.

All three defects have been fully diagnosed, fixed, and covered by automated regression tests. The two on-screen figures now agree with each other and with the Excel export in every case tested, including a live verification run against this client's actual June and July 2026 data.

---

## 2. Symptoms observed

- **Performance tab**, "Quality of the dashboards" row: showed **86%** for July, while the Member Punch-In Excel export for the same client/month showed **90.3%** ("Total Average of All Members").
- After the first fix, July matched, but **June still showed 98.94%** on the dashboard against **92.69%** in a freshly regenerated Excel export; **May showed 99.24%** against **94.48%** in the export.
- **Member Punch-In tab**: selecting a member and July 2026 showed four weekly rows — `NA, AB, NA, 0%` — but the **"Total Avg" row and "Total Weekly Average" pill both showed 67%**, a number with no mathematical relationship to the four rows visible directly above it (four rows where only one week has a real numeric score of 0 should average to 0%, not 67%).

---

## 3. Business impact

- **User trust / data confidence:** Managers reviewing team performance saw the dashboard, the Excel export, and even the weekly detail rows on the same screen disagree with each other, undermining confidence in every number the module reports.
- **Decision risk:** "Quality of the dashboards" and Member Punch-In averages feed directly into performance conversations with team members; an inflated or deflated score can misrepresent an individual's or team's actual performance.
- **No data integrity impact:** No scores, absences, or flags were lost or corrupted. Every root cause was a defect in **aggregation logic**, not in how data was captured or stored.

---

## 4. Root cause analysis

Both the dashboard's Performance tab and the Excel Member Punch-In export are supposed to describe the same underlying `ClientWeeklyMemberScore` records, but three independent defects caused them to compute different numbers from the same data.

### Root cause #1 — The dashboard counted stale scores that should have been excluded

When a team member is marked **Absent** or **Dashboard-NA** for a specific weekly meeting, any KPI score entered for them that same week should be excluded from every average — the Excel export always did this correctly. The dashboard's "Quality of the dashboards" formula, however, had no awareness of Absent/Dashboard-NA flags at all: it averaged **every** saved score it found, including scores left over from before a member was marked absent (or entered after, depending on the order edits happened in). Because nothing in the save process ever cleared a stale score when a member was later flagged, this mismatch could silently persist indefinitely once it occurred.

### Root cause #2 — The dashboard counted people who were no longer on the team, and silently dropped people who were

Once root cause #1 was fixed, a second, larger mismatch remained for June and May. Comparing the dashboard's calculation against this client's actual database rows, member by member, revealed two further defects in the same formula:

- **Removed team members were still counted.** A member removed from a client's roster can still have old scores in the database from when they were on the team. The dashboard's formula walked every score record it could find, with no check for whether that person was still an active team member — so a departed member's old (and, in this case, unusually high) score kept inflating the average every month, forever. The Excel export was always correct here, because it only ever loops through the client's *current* team roster.
- **Present-but-unscored members were silently ignored instead of being counted as a miss.** If a team member attended a meeting (not flagged Absent or Dashboard-NA) but nobody entered their KPI scores that week, the Excel export correctly treats that as a missed update and counts it as 0% — an accurate reflection of "the dashboard wasn't updated." The dashboard's formula only ever counted people who had at least one saved score in its data, so a member with **no** score records at all for the month was invisible to it: not counted as a 0%, just left out of the average entirely, which understates how incomplete the team's actual reporting was.

Both defects trace back to the same design flaw: the dashboard's "Quality of the dashboards" calculation was a **separate, hand-written reimplementation** of the same logic the Excel export already used correctly, and the two implementations were free to drift apart. This is confirmed by the fact this exact class of bug (dashboard vs. export disagreement) had already been fixed at least twice before for other reasons, each time by patching the dashboard's own copy of the logic rather than removing the duplicate.

### Root cause #3 — The Member Punch-In tab's totals were computed over the wrong date range entirely

Unlike root causes #1 and #2, this defect was not about *which* scores were included — it was about *which meetings* were queried in the first place. The Member Punch-In tab lets a user pick a specific "Select Year" / "Select Month". The four weekly rows displayed on screen were correctly filtered, in the browser, to just that selected month. However, the **totals shown in the "Total Avg" row and the "Total Weekly Average" figure were calculated on the server using an entirely different, unrelated date range** — the Performance tab's own rolling 6-month window — because the selected year/month was never sent to the server at all.

The practical effect: the four rows on screen (from the selected month) and the totals below them (from a different, wider range of months) had no mathematical relationship to each other, which is why a set of rows that should average to 0% displayed a "Total Avg" of 67% instead — a number left over from other months entirely. A related, more severe consequence of the same defect: because the screen never re-queried the server when the year/month dropdowns changed, selecting a month **outside** the default rolling window (e.g. a year ago) would have silently shown an empty table instead of that month's real data.

---

## 5. Resolution

Three targeted changes were made, addressing each root cause directly:

1. **Exclude Absent/Dashboard-NA scores in the dashboard formula (fixes Root cause #1).**
   The "Quality of the dashboards" calculation now checks the Absent/Dashboard-NA flags for each meeting before including a score, exactly matching the Excel export's rule. A write-time safeguard was also added: saving an Absent/Dashboard-NA flag now automatically clears any conflicting score for that same meeting, and the system now refuses to save a new score for someone already flagged Absent/Dashboard-NA — preventing the conflicting data from recurring. A one-time cleanup script was written to remove stale conflicting scores already present in the database (execution is a separate, deliberate step, not run automatically).

2. **Stop duplicating the calculation — compute both figures the same way (fixes Root cause #2).**
   Rather than patch the dashboard's separate implementation a third time, it was removed. The dashboard's "Quality of the dashboards" figure is now produced by calling the **exact same functions** the Excel export uses, once per member on the client's *current* roster. This guarantees, by construction, that a departed member's old scores are excluded and that a present-but-unscored member is correctly counted as a 0% miss — and makes it structurally impossible for the two figures to disagree again, since there is now only one implementation instead of two.

3. **Send the selected month to the server, and use it consistently (fixes Root cause #3).**
   The Member Punch-In tab now sends the user's selected year and month to the server with every request, and the server now queries and totals *only* that month's meetings — the same range used to produce the rows displayed on screen. The screen also now re-fetches automatically whenever the year or month selection changes, so any month a user picks (not just the current rolling window) loads correctly.

**Net effect:** "Quality of the dashboards" now always matches the Excel export's "Total Average of All Members," for every month, and the Member Punch-In tab's totals always match the rows displayed on the same screen.

---

## 6. Verification & testing

- **Live data verification:** the fix was checked against this client's actual database records for June and July 2026 (not just synthetic test data), confirming the dashboard and a freshly regenerated Excel export now produce identical figures (June: 92.69% = 92.69%; May: 94.48% = 94.48%), and that the Member Punch-In "Total Avg" for the reported July case now correctly reads 0%, matching the four rows shown (`NA, AB, NA, 0%`).
- **Automated regression tests** were added covering:
  - A stale score being correctly excluded when its meeting has an Absent/Dashboard-NA flag.
  - A departed team member's leftover scores being excluded from the average.
  - A present, unscored team member being counted as a 0% miss rather than silently omitted.
  - The Member Punch-In server query being scoped to the exact selected year/month, not the dashboard's rolling window.
  - The Member Punch-In totals matching the displayed rows for the selected month end-to-end.
- All fix-related tests pass (35 tests across the affected test files). The changes introduce no type-safety regressions.

---

## 7. Preventive measures

- **Single source of truth for the calculation:** the dashboard and the Excel export now share one implementation instead of two, so they cannot silently drift apart again — a future change to the scoring rules only has to be made in one place.
- **Automated regression coverage:** the new tests will fail immediately if a future change reintroduces a mismatch between the dashboard and the export, or breaks the Member Punch-In date scoping.
- **Write-time safeguards:** conflicting Absent/Dashboard-NA-vs-score data can no longer be created going forward, closing off the root condition that caused Root cause #1, rather than only correcting for it after the fact.

---

## 8. Recommendations for the client

- **No action is required to see corrected figures going forward** — the fix is already effective for all newly loaded dashboard and export data.
- **A one-time cleanup script is available** (not yet run) to remove historical stale score records left over from before this fix (the Root cause #1 condition). Running it is optional: the calculation fix already excludes those stale rows from every figure regardless of whether the underlying rows are cleaned up, so this step is a database hygiene action rather than something required for correct reporting.
- No historical scores, absences, or Dashboard-NA flags need correction — every value a user entered was always saved correctly; only the summary calculations built from that data were affected.

---

## 9. Addendum — display precision made consistent (11 August 2026, same day)

After the three root causes above were fixed, "Quality of the dashboards" still displayed with two decimal places (e.g. `94.48%`, `92.69%`, `90.3%`) while every other metric row on the same screen and in the same Excel exports (Avg. % of Calls happened, punctuality, attendance, etc.) displays as a whole percentage (e.g. `87%`, `100%`). This was a leftover from the fix history: the figure used to need decimal precision to byte-match a separately-calculated, also-decimal export value. Now that the dashboard and the export call the exact same function (Root cause #2's fix), that precision is no longer needed to keep them in sync — so it was safe to round "Quality of the dashboards" to a whole number everywhere, matching the rest of the screen.

**Fix:** `calculateOverallFinalAverage()` now rounds to a whole number (`Math.round(sum / count)`) instead of two decimal places. Because the dashboard, the Weekly Excel export, and the Member Punch-In Excel export all read this same function's output, all three updated automatically and remain guaranteed to agree with each other. The dashboard's own "Total Avg" column (rightmost column, averaging a metric across months) was also switched from a separate 2-decimal helper (`avgColPrecise`, now removed) to the same whole-number helper (`avgCol`) used by every other row.

**Verified against live data:** this client's May/June/July 2026 figures, previously `94.48% / 92.69% / 90.3%`, now read `94% / 93% / 90%`.

---

## Appendix A — Technical detail (for engineering audiences)

**Core files:**
- `apps/quikscale/lib/services/clientMeetingsMath.ts` — pure calculation functions (`calculateWeeklyMonthlyStats`, `computeMemberPunchIn`, `calculateOverallFinalAverage`, `monthlyMemberWeightedQuality`).
- `apps/quikscale/app/api/client-meetings/dashboard/route.ts` — Performance tab + Member Punch-In tab data source.
- `apps/quikscale/app/api/client-meetings/export/punch/route.ts` — Member Punch-In Excel export.
- `apps/quikscale/app/api/client-meetings/export/weekly/route.ts` — Performance tab Excel export.
- `apps/quikscale/app/api/client-meetings/weekly-meetings/[id]/route.ts` — weekly meeting edit (Absent/Dashboard-NA flags).
- `apps/quikscale/app/api/client-meetings/weekly-meetings/[id]/scores/[userId]/route.ts` — per-member score save.
- `apps/quikscale/app/(dashboard)/client-meetings/page.tsx` — Meeting Rhythm Dashboard UI.

### Root cause #1 — stale score vs. Absent/Dashboard-NA flag

`memberWeightedQuality()` (the pre-fix dashboard formula) iterated every `ClientWeeklyMemberScore` row attached to a held meeting with no reference to that meeting's `absentTeamMembers` / `dashboardNATeamMembers` relations. `computeMemberPunchIn()` (the export formula) already let the Absent/NA flag win over any saved score for the same meeting. Nothing in `PUT /weekly-meetings/[id]` or `PATCH /weekly-meetings/[id]/scores/[userId]` prevented a member from having both a saved score and an Absent/NA flag for the same meeting simultaneously, so this divergent state could and did occur in production data.

**Fix:** `memberWeightedQuality` was made to accept per-meeting `absentUserIds`/`dashboardNAUserIds` and skip a member's score when flagged, matching `computeMemberPunchIn`. `PUT /weekly-meetings/[id]` now deletes `ClientWeeklyMemberScore` rows for any member newly added to `absentClientMemberIds`/`dashboardNAClientMemberIds`, in the same transaction. `PATCH .../scores/[userId]` now returns `409` if the member is currently flagged Absent/Dashboard-NA for that meeting. A backfill script, `apps/quikscale/scripts/backfill-clean-stale-meeting-scores.ts` (dry-run supported), finds and removes existing stale rows org-wide or per-client.

### Root cause #2 — roster mismatch (superseded root cause #1's fix)

Diagnosed by pulling this client's actual June 2026 rows and diffing `memberWeightedQuality`'s per-member inputs against `computeMemberPunchIn`'s roster-driven inputs directly. Found: (a) a `ClientMember` with no current `ClientTeamMember` link to the client still had scores counted by the dashboard (which is score-row-driven, not roster-driven); (b) a roster member with zero score rows for the month (present, unflagged, simply never scored) was invisible to the dashboard's formula instead of being defaulted to 0 the way `computeMemberPunchIn`'s `present?.field ?? 0` fallback does.

**Fix:** `memberWeightedQuality` was removed and replaced with `monthlyMemberWeightedQuality(held, roster)`, which builds `computeMemberPunchIn`-shaped inputs from the held meetings and calls `computeMemberPunchIn` + the same `eligibleReports` filter + `calculateOverallFinalAverage` once per **current roster member**, sourced from `client.teamMembers` (excluding soft-deleted members). `calculateWeeklyMonthlyStats` now takes a `roster: Array<{id, name}>` parameter; both `dashboard/route.ts` and `export/weekly/route.ts` were updated to pass it. Verified against live June/July data via a temporary diagnostic script (not committed) that ran both the old and new logic against real DB rows side by side.

### Root cause #3 — Member Punch-In date range mismatch

`app/(dashboard)/client-meetings/page.tsx`'s `refresh()` callback built its request query string from `{clientId, mode, punchInUserId}` only — `punchYear`/`punchMonth` state existed (driving the year/month `<select>`s) but was never included in the fetch, and was absent from the `useCallback` dependency array, so changing the selection didn't even trigger a re-fetch. Server-side, `dashboard/route.ts`'s Member Punch-In query reused the Performance tab's `from`/`toEnd` (the `monthsBack`-based rolling window), so `computeMemberPunchIn` always aggregated over that window regardless of what the user had selected. The displayed `weeks` array was separately filtered client-side to the selected month, so the visible rows (correct month) and the totals (wrong, wider range) came from different underlying meeting sets.

**Fix:** the frontend now sends `punchYear`/`punchMonth` with every request and includes them in the `refresh` dependency array. The backend accepts these via `parseYearMonthNum` and, when present, scopes the Member Punch-In `clientWeeklyMeeting.findMany` query and the resulting `computeMemberPunchIn` call to exactly that month (falling back to the dashboard's own range only if the params are absent, for backward compatibility). The now-redundant client-side date filter on `data.punchIn.weeks` was removed, since the server now returns exactly the requested month.

### Test coverage added

- `apps/quikscale/__tests__/unit/clientMeetingsMath.test.ts` — 15 tests: member-weighted quality matches the export across two-meeting/single-meeting/empty-roster scenarios, stale-score exclusion, ghost-roster-member exclusion, unscored-present-member defaulting to 0.
- `apps/quikscale/__tests__/api/clientMeetings.weeklyMeetingScores.test.ts` — 6 tests: PUT clears stale scores on new Absent/NA flags, PATCH rejects scoring an already-flagged member, happy path unaffected.
- `apps/quikscale/__tests__/api/clientMeetings.dashboardPunchIn.test.ts` — 2 tests: Member Punch-In query is scoped to `punchYear`/`punchMonth`, and the resulting totals match a reproduction of the exact reported `NA, AB, NA, 0%` → 0% scenario.
- `clientMeetingsMath.test.ts` expected values updated for the Addendum #9 rounding change (e.g. `49.75` → `50`).

### Confirmed non-causes

- Not a database migration or backfill issue — all three root causes were live calculation-logic defects; there is no separate materialized/aggregate table for these figures.
- Not a caching issue — the dashboard route has no server-side response caching (`revalidate`/`unstable_cache`) and the frontend uses plain `fetch()` with no client-side query caching layer.
- Not a timezone/month-boundary mismatch — both the dashboard and the export construct month ranges identically via UTC `Date.UTC(year, month, 1)` → last-day `23:59:59.999`.
