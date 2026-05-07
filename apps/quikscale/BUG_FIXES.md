# QuikScale — Bug Fixes Log

> Resolved-bug history for the `quickscale/resolvebugs` branch.
> Each entry: **Symptom → Root cause → Fix → Files → Verification**.

---

## Session: 2026-04-30

Six bugs resolved across three modules — Priority, Client Meetings (Weekly Meeting drawer), and Meeting Rhythm Dashboard.

| # | Module | Symptom | Status |
|---|---|---|---|
| 1 | Priority | End Week dropdown allowed weeks < Start Week | ✅ |
| 2 | Weekly Meeting | Updates tab showed members marked Absent | ✅ |
| 3 | Weekly Meeting | Updates tab not available in Add (Create) flow | ✅ |
| 4 | Weekly Meeting | Score inputs accepted values up to 1000 | ✅ |
| 5 | Meeting Rhythm Dashboard | Punctuality shown 100% even when 5 min late | ✅ |
| 6 | Meeting Rhythm Dashboard | Attendance always 0% | ✅ |

---

## 1. Priority — Dynamic End Week filter (Add + Edit)

### Symptom
End Week dropdown always showed Week 1–13. A user could pick `Start Week = 5, End Week = 2` and only the post-submit `validate()` caught it. End Week was also not auto-corrected when Start Week was raised above the current End Week.

### Root cause
- `WEEK_OPTIONS.map(...)` used unfiltered.
- `set("startWeek", v)` only updated one field; End Week wasn't reactively bumped.

### Fix
- Added `handleStartWeekChange()` in both Add and Edit modals — sets `startWeek` and bumps `endWeek` to match if it would otherwise become invalid.
- End Week options now filter via `WEEK_OPTIONS.filter(w => w >= (parseInt(form.startWeek) || 1))`.

```ts
function handleStartWeekChange(val: string) {
  setForm(f => {
    const sw = parseInt(val);
    const ew = parseInt(f.endWeek);
    const nextEnd = !isNaN(sw) && !isNaN(ew) && ew < sw ? val : f.endWeek;
    return { ...f, startWeek: val, endWeek: nextEnd };
  });
  setErrors(e => { const n = { ...e }; delete n.startWeek; delete n.endWeek; return n; });
}
```

### Files
- [apps/quikscale/app/(dashboard)/priority/components/PriorityModal.tsx](apps/quikscale/app/(dashboard)/priority/components/PriorityModal.tsx) — Add flow
- [apps/quikscale/app/(dashboard)/priority/components/PriorityLogModal.tsx](apps/quikscale/app/(dashboard)/priority/components/PriorityLogModal.tsx) — Edit flow

### Verification
- Pick Start Week 5 → End Week dropdown shows Weeks 5–13 only.
- Set Start Week 2, End Week 13, then change Start Week to 7 → End Week auto-syncs to 7.
- The pre-existing `validate()` `sw > ew` check stays as a safety net.

---

## 2. Weekly Meeting — Exclude absent members from Updates grid

### Symptom
The per-member scoring grid on the Update tab listed every client roster member, including ones marked Absent on the Edit tab.

### Root cause
`UpdateScoreGrid` received `clientDetail.members` directly with no filter against `editing.form.absentClientMemberIds`.

### Fix
- Computed `activeMembers` reactively at render time:
  ```ts
  const absentSet = new Set(editing?.form.absentClientMemberIds ?? []);
  const activeMembers = (clientDetail?.members ?? []).filter(m => !absentSet.has(m.userId));
  const allAbsent = (clientDetail?.members.length ?? 0) > 0 && activeMembers.length === 0;
  ```
- Pass `activeMembers` and a new `allAbsent` flag to `UpdateScoreGrid`.
- Added a distinct empty-state copy when all roster members are marked absent.

Member scores are keyed by `clientMemberId` server-side, so saved scores for a now-absent member are preserved in the DB and reappear if the user un-marks them.

### Files
- [apps/quikscale/app/(dashboard)/client-meetings/weekly-meeting/page.tsx](apps/quikscale/app/(dashboard)/client-meetings/weekly-meeting/page.tsx)

### Verification
- Mark 3 of 10 members absent → grid shows 7 rows.
- Un-mark a member → row reappears with previously saved scores intact.

---

## 3. Weekly Meeting — Add-mode Update tab + row-level Save/Edit state

### Symptom
- Update tab was only visible when editing an existing meeting — couldn't enter scores during Create.
- Per-row Save button didn't disable inputs after save; no Edit button to re-open a saved row.

### Root cause
- `tabs` was conditionally `undefined` when `!isEdit`.
- The grid had a transient "Updated" feedback (auto-reverted in 2.5s) but no persistent locked state.

### Fix
**State model** — replaced transient `scoreSavedFor` with two persistent flags:
| Flag | Meaning | Drives |
|---|---|---|
| `scoreDirtyFor` | User has typed values OR clicked Edit on a saved row | Save-button visibility |
| `scoreLockedFor` | Row committed (Edit-mode: PATCHed; Add-mode: staged) | Inputs `disabled` + Edit-button visibility |
| `scoreSavingFor` | PATCH in flight | "Saving…" label |

**Render rule**: `showSave = dirty && !locked`; `showEdit = locked`. Idle (untouched) rows show no button.

**Branching `saveScore`**:
- **Add mode** (no `editing.id`): stages locally — sets `locked=true`, no API call.
- **Edit mode**: PATCHes the existing upsert endpoint, then sets `locked=true`.

**`save()` (global Submit) — new batch-persist step in Add mode**:
After the meeting POST returns the new `id`, `Promise.allSettled` PATCHes any row where `locked || dirty` AND the member is on the current roster AND not Absent. Failures surface as a non-blocking warning ("Meeting saved, but N member score row(s) failed to save…") — the meeting is still created and the user can re-open to retry.

**Hydration**:
- `openEdit`: rows present in `memberScores` start `locked=true, dirty=true` so the Edit button is visible immediately and clicking it reveals Save.
- `openCreate`: clears all per-row state.
- Switching clients in Add mode clears `scores`, `scoreDirtyFor`, `scoreLockedFor`, `scoreSavingFor` since member ids belong to the previous client.

**Tabs / footer**:
- Update tab now shown in both Add and Edit (`tabs = editing ? [edit, update] : undefined`).
- Footer remains visible on both tabs in Add mode (Submit must reach the user); footer hidden on Update tab only in Edit mode (per-row PATCH covers persistence).

### Files
- [apps/quikscale/app/(dashboard)/client-meetings/weekly-meeting/page.tsx](apps/quikscale/app/(dashboard)/client-meetings/weekly-meeting/page.tsx)

### Verification
- Add flow: pick client → Update tab visible → type values → Save button appears → click Save → row disables, Edit button shows → click Edit → row re-enables, Save reappears → click global Submit → meeting created + scores persisted in one round.
- Edit flow: open existing meeting → rows with saved scores show Edit immediately → click Edit, change values, click Save → PATCH fires once → row locks again. No duplicate rows in `ClientWeeklyMemberScore` (upsert on `(meetingId, clientMemberId)` unique).

---

## 4. Weekly Meeting — Score input cap (max 100)

### Symptom
Score inputs accepted values up to 1000.

### Root cause
- HTML `max={1000}` and Zod `.max(1000)` on all five score fields.

### Fix
**Schema** — five fields tightened in [apps/quikscale/lib/schemas/clientMeetingsSchema.ts](apps/quikscale/lib/schemas/clientMeetingsSchema.ts):
```ts
.number().min(0).max(100).default(0)
```
Applies to `weeklyMemberScoreSchema` (and therefore `updateMemberScoreSchema` which `.omit({userId: true}).partial()`s it), so the cap covers both the per-row PATCH and the Add-mode batch-PATCH.

**Input** — `UpdateScoreGrid` `onChange` clamps before state update:
```tsx
<input type="number" min={0} max={100} step="0.01"
  onChange={(e) => {
    const raw = parseFloat(e.target.value || "0");
    const clamped = Number.isNaN(raw) ? 0 : Math.min(100, Math.max(0, raw));
    onChange(m.userId, c.key, clamped);
  }}
  ...
/>
```
Browser `max` only validates on submit; the JS clamp prevents paste / arrow-step from setting state above 100.

### Files
- [apps/quikscale/lib/schemas/clientMeetingsSchema.ts](apps/quikscale/lib/schemas/clientMeetingsSchema.ts)
- [apps/quikscale/app/(dashboard)/client-meetings/weekly-meeting/page.tsx](apps/quikscale/app/(dashboard)/client-meetings/weekly-meeting/page.tsx)

### Verification
- Type 150 → input snaps to 100.
- Paste `9999` → clamped to 100.
- Bypass the UI and POST `kpiCoding: 250` → backend rejects with Zod 400.

---

## 5. Meeting Rhythm Dashboard — Punctuality wrong (showed 100% when 5 min late)

### Symptom
Client `nepoliyan hill`, 29-Apr-2026: planned start `10:00`, actual start `10:05`. Dashboard showed `Avg. % of Calls where call punctuality was followed = 100%` instead of `0%`.

### Root cause — three stacked bugs

| # | File:line | Bug |
|---|---|---|
| A | [clientMeetingsMath.ts:92](apps/quikscale/lib/services/clientMeetingsMath.ts#L92) | `isPunctual` short-circuited on `override === "NA"` (treated NA as auto-pass) |
| B | [dashboard/route.ts:59](apps/quikscale/app/api/client-meetings/dashboard/route.ts#L59) | Daily route hardcoded `punctualityOverride: "NA"` instead of reading `h.punctualityOverride` |
| C | [dashboard/route.ts:60](apps/quikscale/app/api/client-meetings/dashboard/route.ts#L60) | Daily route hardcoded `totalMembers: 0` |

`ClientMeetingFlag` defaults to `NA` in Prisma → the form drawer doesn't expose a punctuality-override radio → every saved Daily Huddle has `punctualityOverride = NA` → the route was hardcoding `NA` anyway → bug A made `NA` auto-pass → 100% on every held call.

### Fix A — `isPunctual` only honors explicit YES
```ts
// before
if (override === "YES" || override === "NA") return true;

// after
if (override === "YES") return true;
```
Semantic: "this lateness was sanctioned/planned" → only YES sanctions. NA / NO / missing fall through to `actual ≤ planned + 60s` (inclusive boundary).

### Fix B — Daily route reads the real DB column
```ts
punctualityOverride: h.punctualityOverride,   // was: ("NA" as const)
```

### Fix C — Daily route reads the real `totalMembers` (with roster fallback)
```ts
const rosterSize = client.teamMembers.filter(tm => !tm.member.deletedAt).length;
// ...
totalMembers: h.totalMembers > 0 ? h.totalMembers : rosterSize,  // was: 0
absentCount: h.absentMembers.length + h.absentTeamMembers.length, // was: legacy only
```
- Falls back to live roster size for legacy rows where `totalMembers` was saved as the model default `0`.
- Counts the union of legacy `absentMembers` (User-based) and new `absentTeamMembers` (external `ClientMember`-based) since the form writes to whichever roster the client uses.
- Added `absentTeamMembers` to the Prisma `include`.

### Weekly mirror fix
`ClientWeeklyMeeting` has no `punctualityOverride` or `totalMembers` columns by design. Hardcoding override to `"NA"` is now harmless after Fix A. `totalMembers` is derived as `rosterSize - dashboardNAcount`:
```ts
const naCount = m.dashboardNAMembers.length + m.dashboardNATeamMembers.length;
const absentCount = m.absentMembers.length + m.absentTeamMembers.length;
return {
  // ...
  punctualityOverride: ("NA" as const),
  totalMembers: Math.max(0, rosterSize - naCount),
  absentCount,
};
```
Includes added: `absentTeamMembers`, `dashboardNATeamMembers`.

### Files
- [apps/quikscale/lib/services/clientMeetingsMath.ts](apps/quikscale/lib/services/clientMeetingsMath.ts)
- [apps/quikscale/app/api/client-meetings/dashboard/route.ts](apps/quikscale/app/api/client-meetings/dashboard/route.ts)

### Verification (against the screenshot data)
```
plannedStart  = "10:00"   (client.dailyStartTime)
actualStart   = "10:05"   (h.actualStartTime)
override      = "NA"      (h.punctualityOverride — Prisma default)

isPunctual:
  override === "YES" ? no
  10:05 ≤ 10:01 ?    no
  → false
avgPunctual = 0/1 → 0%   ← Apr 26 cell flips from blue (100%) to red (0%)
```

---

## 6. Meeting Rhythm Dashboard — Attendance always 0%

### Symptom
Row 5 (`Avg. % of people attending the calls`) showed `0%` for every month even when members attended.

### Root cause
Same as Bug 5 / Fix C: dashboard route hardcoded `totalMembers: 0`. The math then hit `r.totalMembers > 0 ? ... : 0` and returned 0 for every meeting.

### Fix
Same as Fix C above (Daily) and the Weekly mirror — `totalMembers` is now read from the DB column (Daily) or computed from the roster minus Dashboard-NA (Weekly), and `absentCount` unions the legacy + external-roster relations.

### Files
- [apps/quikscale/app/api/client-meetings/dashboard/route.ts](apps/quikscale/app/api/client-meetings/dashboard/route.ts)

### Verification (same data as Bug 5)
```
rosterSize    = 4 (Ravi N, June K, +2 more)
totalMembers  = 4 (fallback — saved row has 0)
absentCount   = 0 + 1 = 1   (Ravi N via absentTeamMembers)
attendance    = (4 - 1) / 4 = 75%   ← Apr 26 cell flips from red (0%) to yellow (75%)
```

---

## Session: 2026-04-30 (Part 2)

Four UI / layout fixes across the dashboard KPI table and the pagination experience for every data grid in the app.

| # | Module | Symptom | Status |
|---|---|---|---|
| 7 | Dashboard KPI table | Column gap/misalignment after multiple freeze/unfreeze | ✅ |
| 8 | Dashboard KPI table | "Last Notes" column missing | ✅ |
| 9 | All data grids | No common Pagination; no rows-per-page selector | ✅ |
| 10 | Pagination layout | Pagination footer scrolled off-screen at pageSize ≥ 20 | ✅ |

---

## 7. KPI Table — sticky-column drift after freeze/unfreeze

### Symptom
On the Dashboard KPI table, repeatedly toggling Freeze/Unfreeze on a column (or resizing a frozen column in between) introduced extra gap and misalignment between cells. The longer a session ran, the worse the drift.

### Root cause
`useStickyOffsets.ts` measured DOM column widths in `useLayoutEffect` and stored them in a `useRef`. Refs don't trigger re-renders, so each new render read the *previous* measurement: cells got NEW widths but OLD `left` offsets, and the layout never converged.

### Fix
Switched offsets from `useRef` to `useState`, and short-circuited the update when the freshly measured map equals the previous one (avoids loops on dependency reruns).

### Files
- [apps/quikscale/app/(dashboard)/kpi/hooks/useStickyOffsets.ts](apps/quikscale/app/(dashboard)/kpi/hooks/useStickyOffsets.ts)

### Verification
Freeze "Quarterly Goal", unfreeze, freeze again, then resize the frozen column — all cells stay aligned, no accumulating gap.

---

## 8. Dashboard KPI table — "Last Notes" column

### Symptom
The Dashboard → Individual KPI section did not show a "Last Notes" column even though `kpi.lastNotes` is on the row payload.

### Root cause
`useTableColumns.ts` never declared a `lastNotes` column. `lastNotes` was only surfaced via the `description` cell's hover tooltip.

### Fix
- Added `"lastNotes"` to `ALL_STATIC_COLS`, `COL_LABELS` (label "Last Notes"), and `COL_WIDTHS_DEFAULT` (200px). Not added to `SORT_KEYS` — free text, not server-sortable.
- Rendered the cell in `KPITable` immediately after `description` with a `line-clamp-2` text and a native `title` tooltip; em-dash when empty.

### Files
- [apps/quikscale/app/(dashboard)/kpi/hooks/useTableColumns.ts](apps/quikscale/app/(dashboard)/kpi/hooks/useTableColumns.ts)
- [apps/quikscale/app/(dashboard)/kpi/components/KPITable.tsx](apps/quikscale/app/(dashboard)/kpi/components/KPITable.tsx)

### Verification
Dashboard → Individual KPI section now shows the "Last Notes" column. On the main `/kpi` page the column is also visible by default and can be hidden via the column menu (preference persists per user).

---

## 9. Common Pagination — Rows per page selector across all grids

### Symptom
- KPI / Priority / WWW each had hand-rolled pagination footers (different markup, inconsistent labels, no rows-per-page selector).
- Org Setup → Users, Quarter Settings, and the four Client-Meetings pages (Client Master, Client Members, Daily Huddle, Weekly Meeting) loaded all rows and rendered them with no pagination at all.

### Fix
- Extended the existing `Pagination` component in `@quikit/ui` with two optional props: `pageSizeOptions` (default `[10, 20, 30, 50]`) and `onPageSizeChange`. When `onPageSizeChange` is supplied a "Rows per page" `<select>` renders alongside the page indicator. Backward-compatible — existing callers in `admin` and `quikit` keep working.
- KPITable, PriorityTable, and WWWTable now use the shared `<Pagination />` (their custom footers were deleted).
- Default `pageSize` is **10** everywhere (KPI page was previously 50).
- Added page state + slicing + `<Pagination />` to the six remaining list pages (Users, Quarters, Client Master, Client Members, Daily Huddle, Weekly Meeting).
- Pagination is purely client-side (slice the in-memory list) — server-side pagination is a follow-up.

### Files
- [packages/ui/components/pagination.tsx](packages/ui/components/pagination.tsx)
- [apps/quikscale/app/(dashboard)/kpi/components/KPITable.tsx](apps/quikscale/app/(dashboard)/kpi/components/KPITable.tsx)
- [apps/quikscale/app/(dashboard)/kpi/page.tsx](apps/quikscale/app/(dashboard)/kpi/page.tsx)
- [apps/quikscale/app/(dashboard)/priority/components/PriorityTable.tsx](apps/quikscale/app/(dashboard)/priority/components/PriorityTable.tsx)
- [apps/quikscale/app/(dashboard)/priority/page.tsx](apps/quikscale/app/(dashboard)/priority/page.tsx)
- [apps/quikscale/app/(dashboard)/www/components/WWWTable.tsx](apps/quikscale/app/(dashboard)/www/components/WWWTable.tsx)
- [apps/quikscale/app/(dashboard)/www/page.tsx](apps/quikscale/app/(dashboard)/www/page.tsx)
- [apps/quikscale/app/(dashboard)/org-setup/users/page.tsx](apps/quikscale/app/(dashboard)/org-setup/users/page.tsx)
- [apps/quikscale/app/(dashboard)/org-setup/quarters/page.tsx](apps/quikscale/app/(dashboard)/org-setup/quarters/page.tsx)
- [apps/quikscale/app/(dashboard)/client-meetings/clients/page.tsx](apps/quikscale/app/(dashboard)/client-meetings/clients/page.tsx)
- [apps/quikscale/app/(dashboard)/client-meetings/members/page.tsx](apps/quikscale/app/(dashboard)/client-meetings/members/page.tsx)
- [apps/quikscale/app/(dashboard)/client-meetings/daily-huddle/page.tsx](apps/quikscale/app/(dashboard)/client-meetings/daily-huddle/page.tsx)
- [apps/quikscale/app/(dashboard)/client-meetings/weekly-meeting/page.tsx](apps/quikscale/app/(dashboard)/client-meetings/weekly-meeting/page.tsx)

### Verification
Every grid shows the same chrome: `Showing X-Y of N | Rows per page [10/20/30/50] | Previous | Page n of m | Next`. Switching page size resets to page 1. Type-checks clean for `quikscale`, `quikit`, `admin`, and `packages/ui`.

---

## 10. Pagination footer — vertical layout collapse at pageSize ≥ 20

### Symptom
With Rows per page set to 20 (or higher), the pagination footer disappeared below the visible viewport on the KPI / Priority / WWW pages even though the table area was nominally bounded by `flex-1 overflow-hidden min-h-0`. The body did not scroll internally — the entire table area expanded and the parent's `overflow-hidden` clipped the pagination from view.

### Root cause
Two layers of the same flexbox gotcha — `min-height: auto` on flex items:

1. **HorizontalScroller's outer wrapper** (`<div className="flex flex-col {className}">`) was used as a `flex-1` child inside `KPITable` / `PriorityTable` / `WWWTable`. The default `min-height: auto` made it refuse to shrink below its content's min-content (the full natural table height — ~1100px for 20 rows). The scroller's outer pushed the `Pagination` sibling out of the parent's `overflow-hidden` clipping box.

2. On the **6 pages I had just added pagination to** (Users, Quarters, Client Master, Client Members, Daily Huddle, Weekly Meeting), I had placed `<Pagination />` *inside* the same `overflow-auto` container as the `<table>` — so when the table scrolled, the pagination scrolled with it.

### Fix
- **HorizontalScroller** — added `min-h-0` to its outer wrapper so `flex-1` can shrink the scroller below its content's min-content. The inner `<div className="relative flex-1 min-h-0">` already had `min-h-0`, but the outer needed it as well to participate properly in its grandparent's flex column.
- **Pagination component** — added `flex-shrink-0` so the footer is never squeezed out by an over-eager scroller in any future caller.
- **Six page wrappers** — restructured each from `<div h-full overflow-auto>{table + Pagination}</div>` to:
  ```html
  <div h-full flex flex-col min-h-0>
    <div flex-1 overflow-auto min-h-0>
      <table>…</table>
    </div>
    <Pagination />
  </div>
  ```
  Table body scrolls inside its bounded box; pagination sits as a sibling pinned to the bottom.
- Weekly Meeting's outer page area was also tightened from `flex-1 overflow-y-auto p-6` to `flex-1 flex flex-col overflow-hidden p-6 min-h-0`, since it was the one page that wasn't already using the standard `flex-1 overflow-hidden min-h-0` shell.

### Files
- [apps/quikscale/components/ui/HorizontalScroller.tsx](apps/quikscale/components/ui/HorizontalScroller.tsx)
- [packages/ui/components/pagination.tsx](packages/ui/components/pagination.tsx)
- [apps/quikscale/app/(dashboard)/org-setup/users/page.tsx](apps/quikscale/app/(dashboard)/org-setup/users/page.tsx)
- [apps/quikscale/app/(dashboard)/org-setup/quarters/page.tsx](apps/quikscale/app/(dashboard)/org-setup/quarters/page.tsx)
- [apps/quikscale/app/(dashboard)/client-meetings/clients/page.tsx](apps/quikscale/app/(dashboard)/client-meetings/clients/page.tsx)
- [apps/quikscale/app/(dashboard)/client-meetings/members/page.tsx](apps/quikscale/app/(dashboard)/client-meetings/members/page.tsx)
- [apps/quikscale/app/(dashboard)/client-meetings/daily-huddle/page.tsx](apps/quikscale/app/(dashboard)/client-meetings/daily-huddle/page.tsx)
- [apps/quikscale/app/(dashboard)/client-meetings/weekly-meeting/page.tsx](apps/quikscale/app/(dashboard)/client-meetings/weekly-meeting/page.tsx)

### Verification
Switch Rows per page through 10 / 20 / 30 / 50 on each module — the table body scrolls vertically inside its bounded box and the pagination footer stays pinned at the bottom of the table area. Type-checks clean for `quikscale` and `packages/ui`.

---

## Verification across all fixes

```bash
cd apps/quikscale
npx tsc --noEmit       # passes clean
```

After deploying:
1. **Priority Add/Edit** — pick Start Week 5 → End Week shows 5–13 only.
2. **Weekly Meeting Updates tab** — visible from the Create flow once a client is picked.
3. **Score inputs** — typing 150 snaps to 100; backend rejects 250 with 400.
4. **Meeting Rhythm Dashboard** — restart the dev server (Next.js doesn't always hot-reload service-layer changes), hard-refresh, pick the affected client. Punctuality and Attendance cells should change to reflect the actual data.

---

## Branch / commit context

- Branch: `quickscale/resolvebugs`
- Base: `main`
- Author: rohit.deshmukh@moreyeahs.com
