# Bugs Resolved — feature/kpi-email-notifications

Running log of every bug fixed (and the diagnostic chain that led to the fix)
on this branch. Sequenced in the order they were hit. Companion doc to
[`emailIntegration.md`](./emailIntegration.md) which documents the email
feature itself end-to-end.

---

## 1. Email send fails — `535 5.7.139 Authentication unsuccessful`

### Symptom
Creating a KPI for an owner with a valid email address printed:

```
[email] sendMail failed to=rohitdeshmukh9211@gmail.com:
  Error: Invalid login: 535 5.7.139 Authentication unsuccessful,
  the user credentials were incorrect.
```

No mail delivered.

### Root cause(s)
Two bugs stacked on top of each other:

**1a. Wrong SMTP host.** First implementation used `smtp.gmail.com:465 (SSL)`,
but the `support@quikit.ai` mailbox lives on Microsoft 365. Office 365
silently rejects auth on Gmail's host.

**1b. `$24` in the password being eaten by Next.js's env loader.**
`@next/env` runs every value in `.env` through `dotenv-expand`, which
interprets `$VAR` and `${VAR}` references. The configured password
`Q!kS#uPp0rt$24%G4` contains `$24`, which expanded to `""` because no env
variable named `24` exists. Effective loaded password became
`Q!kS#uPp0rt%G4` (14 chars instead of 17). A diagnostic
`passLen=14` log line confirmed the truncation in real time.

### Fix
- Switched the transporter defaults to `smtp.office365.com:587` STARTTLS
  with optional `SMTP_TLS_CIPHERS` (Office 365 sometimes wants `SSLv3`):

  ```ts
  cachedTransporter = nodemailer.createTransport({
    host, port, secure,
    auth: { user, pass },
    requireTLS: !secure,
    tls: ciphers ? { ciphers } : undefined,
  });
  ```
  ([apps/quikscale/lib/services/email.ts](./lib/services/email.ts))

- Introduced `EMAIL_PASSWORD_B64` as the preferred env variable. Base64
  encoding bypasses dotenv-expand because `$` characters are absent from the
  base64 alphabet:

  ```ts
  const passB64 = process.env.EMAIL_PASSWORD_B64;
  const pass = passB64
    ? Buffer.from(passB64, "base64").toString("utf8")
    : process.env.EMAIL_PASSWORD;
  ```

- `apps/quikscale/.env`:

  ```env
  EMAIL_USER="support@quikit.ai"
  EMAIL_PASSWORD_B64="USFrUyN1UHAwcnQkMjQlRzQ="   # base64("Q!kS#uPp0rt$24%G4")
  SMTP_HOST="smtp.office365.com"
  SMTP_PORT="587"
  SMTP_SECURE="false"
  SMTP_TLS_CIPHERS="SSLv3"
  ```

### How to regenerate the base64 (after a password rotation)
Use a file read so the shell does not eat `$N` first:

```bash
node -e "const fs=require('fs'); \
  const env=fs.readFileSync('apps/quikscale/.env','utf8'); \
  const m=env.match(/^EMAIL_PASSWORD=\"([^\"]+)\"/m); \
  console.log(Buffer.from(m[1],'utf8').toString('base64'));"
```

### Verification
The transporter now logs:

```
[email] transporter ready host=smtp.office365.com port=587 secure=false
        user=support@quikit.ai passLen=17
[email] sent to=<recipient> messageId=<...>
```

`passLen=17` ⇒ full password reached nodemailer.

---

## 2. WWW edit form — only single assignee supported

### Symptom
- Native `<select>` for the **Who?** field, single value only.
- KPI/Priority modules already had a searchable, multi-assignee picker
  (avatar + email + chips), so UX was inconsistent.

### Fix
- Replaced the native `<select>` with `<UserSelect mode="multi">` from
  `@quikit/ui` — same component KPI and Priority use.
- Added a `whoIds: String[]` column to `WWWItem` with migration
  `20260504120000_add_www_who_ids` that backfills existing rows to
  `ARRAY[who]` so legacy data shows up correctly in the new picker.
- Kept the legacy single `who` column always mirrored to `whoIds[0]` so
  every existing index (`@@index([who])`, `@@index([tenantId, who])`),
  the `canEditWWW` permission helper, list sorts, and audit history
  continue to work without change.
- API: POST + PUT now accept `whoIds`, return both `whoIds` and
  `who_users[]` alongside the legacy `who` / `who_user`.
  ([apps/quikscale/app/api/www/route.ts](./app/api/www/route.ts),
   [apps/quikscale/app/api/www/[id]/route.ts](./app/api/www/[id]/route.ts))

### Side benefit
The reassignment email (next bug) became natural to express because it
now operates on a list rather than a single id.

---

## 3. WWW assignee change did not notify users

### Symptom
Editing the **Who?** field on a WWW item silently re-pointed the work to a
different person without any in-app notification or email — both the
removed and the added user were left in the dark.

### Fix
- New orchestrator `notifyWWWReassignment(...)` — emails the **union of old
  ∪ new** assignees so removed people learn they're off the item and added
  people learn they're on it.
  ([apps/quikscale/lib/services/wwwNotifications.ts](./lib/services/wwwNotifications.ts))
- New email template `buildWWWUpdateEmail(...)`:

  > Subject: **Your action item has been updated**
  > Body lists `What`, `Updated by`, `Previous assignees` (struck-through),
  > and `New assignees` (bold).

- Wired into `PUT /api/www/[id]` — fires after `writeAuditLog`, **fire-
  and-forget** (`.catch(console.error)`) so SMTP problems can't break the
  update. The orchestrator is a no-op when assignee lists are identical
  (i.e. an edit that only changes `notes`/`status`/`when` does not spam
  emails).
- Audit trail: every dispatch attempt writes a `Notification` row with
  `type: "www_reassigned_email_sent"` or `"_email_failed"` so the full
  delivery history lives in the DB.

---

## 4. Dashboard week-grid showed all 13 weeks (info overload)

### Symptom
KPI and Priority sections on the dashboard rendered the full 13-week grid
of the active quarter, forcing horizontal scroll and making "what happened
recently" hard to scan.

### Fix
Rolling 5-week visible window, derived from the DB-driven current week
([apps/quikscale/lib/utils/fiscal.ts](./lib/utils/fiscal.ts)):

```ts
export function rollingVisibleWeeks(
  currentWeek: number | null | undefined,
  size = 5,
  total = 13,
): number[] {
  if (currentWeek == null || currentWeek <= 1) return [];
  const end = Math.min(total, currentWeek - 1);
  const start = Math.max(1, end - size + 1);
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}
```

The dashboard converts the *not-visible* weeks into `hideColumns` keys
(`week1`, `week2`, …) and forwards them to the locked `KPITable` /
`PriorityTable`. The locked tables already supported per-instance hides
(KPITable did natively; PriorityTable was extended to honour `week${n}`
keys for headers, body cells and `colSpan`).

> Behaviour table:
>
> | `currentWeek` | Visible weeks      |
> |---------------|--------------------|
> | 1             | (none)             |
> | 4             | `[1, 2, 3]`        |
> | 6             | `[1, 2, 3, 4, 5]`  |
> | 10            | `[5, 6, 7, 8, 9]`  |
> | 13 (past qtr) | `[8, 9, 10, 11, 12]` |

The KPI / Priority **dedicated pages** still show the full 13 weeks — the
hide-columns are only injected on the dashboard.

---

## 5. Dashboard tables left empty horizontal space

### Symptom
After dropping from 13 to 5 visible week columns, the locked tables kept
their `min-width: max-content` layout — column widths stayed fixed and the
table left a wide blank gap on the right.

### Fix
New `fillWidth?: boolean` prop on **KPITable** and **PriorityTable**. When
set, the `<table>` switches from `min-width: max-content` to `width: 100%`,
so columns stretch to fill the container. The dedicated KPI / Priority
pages don't pass `fillWidth`, so their existing horizontal-scroll layout
is unchanged. The dashboard sets `fillWidth` on both tables.

---

## 6. Quarter Settings — false-positive *"FY 2027-28 already exists"*

### Symptom
- *Quarter Settings* page picker listed `FY 2027-28`.
- Selecting it showed `0 items` ("No quarters found").
- Opening *Initialize Quarters*, picking the start date that derives FY
  2027, the modal showed a red banner: **`FY 2027-28 already exists.`**
- The user couldn't proceed even though no quarter rows existed for the
  year.

### Root cause
`enable_future_quarters` feature flag is on for this tenant. `GET
/api/org/quarters` augments `availableYears` with a *phantom* placeholder
equal to `highestExistingFY + 1` so admins can see the next FY in the
picker before initializing it
([apps/quikscale/app/api/org/quarters/route.ts:82-91](./app/api/org/quarters/route.ts#L82)).
The phantom is also returned separately as `futureYearAvailable`.

The `GenerateModal` used the full picker list as
`existingYears`, then both:

1. Skipped the phantom in `while (existingYears.includes(nextFY)) nextFY++;`
   — so the modal defaulted to FY 2028 instead of FY 2027.
2. Treated the phantom as already-existing in `handleGenerate()` —
   producing the red banner that blocked submit.

The server-side check (`db.quarterSetting.findMany({ where: { tenantId,
fiscalYear } })`) was correct all along — it never produced a false
positive because no real rows existed for the phantom.

### Fix
[apps/quikscale/app/(dashboard)/org-setup/quarters/page.tsx](./app/(dashboard)/org-setup/quarters/page.tsx):
strip `futureYearAvailable` out of the set used for "already exists"
reasoning before either the next-FY loop or the submit guard:

```ts
const trulyExistingYears = futureYearAvailable != null
  ? existingYears.filter((y) => y !== futureYearAvailable)
  : existingYears;

let nextFY = currentFY;
while (trulyExistingYears.includes(nextFY)) nextFY++;
// …
if (trulyExistingYears.includes(derivedFY)) {
  setError(`FY ${derivedFY}-${...} already exists.`);
  return;
}
```

### Verification
After restart: opening *Initialize Quarters* for the phantom FY no longer
shows the red banner. *Generate Quarters* succeeds and persists Q1–Q4.
Selecting `FY 2027-28` in the picker now populates the table.

---

## 7. Time picker — inconsistent UI between Daily Huddle and Weekly Meeting

### Symptom
- Daily Huddle used the native browser `<input type="time">`.
- Weekly Meeting used the custom `<TimePicker>` (3-column wheel).
- Two different UIs, two different validation behaviours. Users had to
  re-learn the picker between the two modules.
- No "End must be after Start" enforcement on Daily Huddle; no manual
  typing in the Weekly Meeting wheel.

### Fix
Unified on the **native browser picker** (Daily Huddle's existing UX) —
consistent typing + clock dropdown across both modules.

- [apps/quikscale/app/(dashboard)/client-meetings/weekly-meeting/page.tsx](./app/(dashboard)/client-meetings/weekly-meeting/page.tsx) —
  every `<TimePicker>` (Actual Start, Actual End, and the paired-radio time
  fields like *Good News Sharing Time*) replaced with `<input type="time">`.
- [apps/quikscale/app/(dashboard)/client-meetings/daily-huddle/page.tsx](./app/(dashboard)/client-meetings/daily-huddle/page.tsx) —
  kept the native input, added validation parity.

### Validation rules now applied to both forms
1. **End ≥ Start prevented** —
   `<input type="time" min={form.actualStartTime}>` greys out invalid
   options in the browser dropdown. A guard in `onChange` also rejects
   any value that slips past `min` (e.g. typed manually).
2. **End is disabled until Start is picked** — removes the chance to enter
   an End first and then a later Start.
3. **Auto-clear End on Start change** — if a new Start would invalidate
   the existing End, End is reset to empty so the user must re-pick.

### Caveat (12h / 24h format toggle requirement)
The native `<input type="time">` is a browser primitive — its display
format (12h AM/PM vs 24h) is locale-controlled by the browser/OS and
cannot be forced per-input from JavaScript. The stored value is
`HH:mm` (24h) regardless of display, so data is uniform.

If a per-app 12h/24h toggle becomes a hard requirement later, the path is
to switch back to the custom `TimePicker` (already extended on this branch
with `format="12h"|"24h"` + `minTime` props before being reverted).

---

## 8. KPI / Priority tables sat flush against the sidebar

### Symptom
On the Individual KPI and Priority pages the table started immediately at
the left edge of the content area while the page header bar above used
`px-6 py-3`. Result: a visible "header indented / table flush" misalignment
that felt unfinished.

### Root cause
The table-area wrapper `<div className="flex-1 overflow-hidden min-h-0">`
had no horizontal padding. The locked KPITable / PriorityTable
components handle their own internal scroll and don't pad themselves —
that's the wrapper's job.

### Fix
[apps/quikscale/app/(dashboard)/kpi/page.tsx](./app/(dashboard)/kpi/page.tsx)
and
[apps/quikscale/app/(dashboard)/priority/page.tsx](./app/(dashboard)/priority/page.tsx):

```tsx
// before
<div className="flex-1 overflow-hidden min-h-0">

// after
<div className="flex-1 overflow-hidden min-h-0 px-6 py-4">
```

Same `px-6` as the header bar above so header and table read as one
consistent column.

---

## 9. Sidebar entry for *Roles & Permissions* was redundant

### Symptom
The dynamic-roles feature shipped with two entry points:
- Sidebar → Org Setup → *Roles & Permissions*
- Header user-dropdown → *User Permission*

Both opened the same page. Two entries for one feature added noise to
the Org Setup section.

### Fix
[apps/quikscale/components/dashboard/sidebar.tsx](./components/dashboard/sidebar.tsx):
removed the sidebar entry, kept the header dropdown as the single entry
point. The unused `Shield` icon import was dropped at the same time.
The route stays reachable by URL or via the dropdown.

`MODULE_REGISTRY` (`packages/shared/lib/moduleRegistry.ts`) still carries
the `orgSetup.roles` entry — it's needed by the FF-1 layout gate
(`gateModuleRoute("quikscale", "orgSetup.roles", …)`) so admins can
disable the feature per-tenant. Removing it from the registry would
break that gate; only the sidebar reference was redundant.

---

## 10. Priority table — "Log" header label missing + `<thead>` not sticky

### Symptom
- The Log column rendered with no header text — just an empty `<th>`
  above the row of clock icons.
- Scrolling the Priority list vertically made the header row scroll away
  with the body. By the time you'd scrolled past ~10 rows the column
  labels were gone.

### Root cause
Two unrelated regressions in [`PriorityTable.tsx`](./app/(dashboard)/priority/components/PriorityTable.tsx):

1. The label switch had `colKey === "_log" ? "" :` — empty string instead of
   `"Log"`.
2. The `<thead>` had no `sticky top-0` (KPI table has it). Individual `<th>`
   cells were `relative top-0 ...` with `sticky` only when frozen — but
   `relative` is in the same Tailwind specificity group as `sticky` and
   was winning the cascade, so even frozen header cells weren't actually
   pinned.

### Fix
- Set the Log header label to `"Log"`.
- Added `sticky top-0 z-30` to the `<thead>` so the header row pins on
  vertical scroll.

---

## 11. Priority table — first 3 columns drifted on horizontal scroll

### Symptom
On horizontal scroll, the leftmost columns (`_cb` checkbox, `_log` icon,
`_id`) lost their pinned position and were covered by the scrolling
content underneath. Result: the user could scroll right and see the
TEAM column truncated at the page edge with no checkbox / log / id
column visible at all — defeating the whole point of having frozen
chrome columns. KPI's table did this correctly; Priority didn't.

### Root cause
Two CSS-cascade issues:

1. **Header `<th>`** — class string had `relative top-0 z-30 … ${frozen ? "sticky" : ""}`.
   Tailwind generates `position: relative` for `relative` and
   `position: sticky` for `sticky`. They share specificity, so whichever
   appears later in the compiled CSS wins — that turned out to be
   `relative`, killing the sticky behaviour for frozen header cells.

2. **Body `<td>`** — frozen cells (`_cb` / `_log` / `_id`) used `z-20`,
   the same as non-frozen cells. During horizontal scroll the
   non-frozen `<td>`s (which come *later* in DOM order) drew on top of
   the sticky frozen ones in the z-stack, visually covering them.

### Fix
[`PriorityTable.tsx`](./app/(dashboard)/priority/components/PriorityTable.tsx):

```tsx
// Header: drop `relative`, always sticky-top, frozen cells z-[35]
className={`group sticky top-0 ${frozen ? "z-[35]" : "z-30"} bg-accent-50 …`}

// Frozen body cells (_cb / _log / _id): bumped to z-[25]
<td className="sticky z-[25] border-r border-gray-100 px-2 py-1.5 bg-inherit"
```

Now Priority mirrors KPI exactly:

| Action | What pins, what scrolls |
|---|---|
| Vertical scroll | `<thead>` row pins at top |
| Horizontal scroll | `_cb` + `_log` + `_id` (header AND body cells) pin at left |
| Both at once | The cb/log/id top-left "L-shape" frame stays anchored |

---

## 12. Current-week visual highlight removed

### Symptom
A previous batch added a purple `ring-2 ring-inset ring-accent-500`
outline + bold accent label + " · Current" suffix on the active week
column in both KPI and Priority tables. Visual noise — the column was
already obvious from the header date range, and the outline competed
with the actual KPI traffic-light cell colours below.

### Fix
- [`KPITable.tsx`](./app/(dashboard)/kpi/components/KPITable.tsx) — dropped
  `isCurrent` from the week-column header `<th>` and the body `<td>`;
  removed the ring class, bold accent label, and " · Current" suffix.
- [`PriorityTable.tsx`](./app/(dashboard)/priority/components/PriorityTable.tsx) —
  same removals on header `<th>` and body cells (the `currentRing`
  helper was deleted entirely).

`currentWeek` is still computed inside both components — it's still used
for past-week-locked logic (`isBlocked` / `isPastLocked`). Only the
visual highlight is gone.

---

## 13. Weekly Meeting — Absent / Dashboard-NA pickers + Update tab consistency

Three related issues in the **Weekly Meeting** Add/Edit form:

### 13a. Absent members appeared in the *Weekly Dashboard NA* dropdown

**Symptom** — Picking a client member as *Absent Members* didn't remove
them from the *Weekly Dashboard NA* picker below. The user could
flag the same person as both absent **and** dashboard-NA, which is a
contradiction (they're either present-but-skipping-dashboard or absent
altogether).

**Fix** — [`weekly-meeting/page.tsx`](./app/(dashboard)/client-meetings/weekly-meeting/page.tsx):
the *Weekly Dashboard NA* `<UserMultiPicker>` now filters its `users`
list to exclude anyone in `absentClientMemberIds`. Additionally the
*Absent Members* `onChange` handler purges any stale NA selections that
overlap with the new absent list:

```tsx
// Dashboard NA picker
users={pickerUsers.filter(
  (u) => !editing.form.absentClientMemberIds.includes(u.id),
)}

// Absent picker — clean up Dashboard NA when an overlap is created
onChange={(v) => {
  updateField("absentClientMemberIds", v);
  const absentSet = new Set(v);
  const cleanedNA = editing.form.dashboardNAClientMemberIds.filter(
    (id) => !absentSet.has(id),
  );
  if (cleanedNA.length !== editing.form.dashboardNAClientMemberIds.length) {
    updateField("dashboardNAClientMemberIds", cleanedNA);
  }
}}
```

### 13b. Dashboard-NA members still appeared in the Update tab grid

**Symptom** — The Update tab built its roster by excluding only
*Absent* members. Members flagged *Weekly Dashboard NA* still appeared
as rows the user had to score, even though by definition they're
opting out of the dashboard.

**Fix** — Same file, the `activeMembers` filter now excludes BOTH:

```tsx
const absentSet = new Set(editing?.form.absentClientMemberIds ?? []);
const dashboardNASet = new Set(editing?.form.dashboardNAClientMemberIds ?? []);
const activeMembers = (clientDetail?.members ?? []).filter(
  (m) => !absentSet.has(m.userId) && !dashboardNASet.has(m.userId),
);
```

Reactive: toggling either flag in Edit removes/re-adds the row in
Update without a save round-trip. Saved scores for now-excluded
members are preserved server-side and reappear if the user un-flags
them.

### 13c. Update tab inputs showed `0` as a literal value

**Symptom** — Every score input on the Update tab pre-filled with `0`.
Users had to clear the field before typing — the `0` looked like a
real submitted value rather than a placeholder.

**Fix** — Render the input EMPTY when the stored value is the default
`0`, with `placeholder="0"` so the visual cue is preserved:

```tsx
<input
  type="number"
  ...
  value={s[c.key] === 0 ? "" : s[c.key]}
  placeholder="0"
  className="… placeholder:text-gray-400 …"
/>
```

The save logic still treats an empty / NaN input as `0` via the
existing `parseFloat(... || "0")` fallback, so no backend change is
needed. Result: a freshly-loaded Update tab now reads as "tell me
each score" instead of "every score is already 0".

---

## 14. Member Punch-In — *Select Member* should be single-select

### Symptom
The Meeting Rhythm Dashboard → *Member Punch-In* tab let admins tick
multiple members in the *Select Member* picker, but the page only ever
queried for the first one (`punchUserId = punchUserIds[0]`). Result: a
confusing UI where you could select 3 people and only see results for
one.

### Fix
[`apps/quikscale/app/(dashboard)/client-meetings/page.tsx`](./app/(dashboard)/client-meetings/page.tsx)
— swapped `<UserMultiPicker>` for `<UserPicker>`. Kept the underlying
state shape as `string[]` (one-element array) so the existing
downstream code (`punchUserIds[0]`) continues to work without further
edits. Dropped the unused `UserMultiPicker` import.

```tsx
<UserPicker
  value={punchUserIds[0] ?? ""}
  onChange={(id) => setPunchUserIds(id ? [id] : [])}
  ...
/>
```

---

## 15. Weekly Meeting — same client could have two meetings in one week

### Symptom
Nothing stopped admins from creating multiple weekly meetings for the
same client within the same calendar week. Two meetings on Mon and Wed
of the same week would both save, then the dashboard would
double-count.

### Fix
**Server-side rule:** *one weekly meeting per client per Monday→Sunday
week*. Applied to both create + update.

[`apps/quikscale/app/api/client-meetings/weekly-meetings/route.ts`](./app/api/client-meetings/weekly-meetings/route.ts)
(POST) — before insert:

```ts
const { start: weekStart, end: weekEnd } = weekBoundsMondayToSunday(meetingDate);
const conflict = await db.clientWeeklyMeeting.findFirst({
  where: {
    tenantId,
    clientId: d.clientId,
    deletedAt: null,
    meetingDate: { gte: weekStart, lte: weekEnd },
  },
});
if (conflict) return 409 with the message:
  `A weekly meeting for the selected client already exists between ${dd(weekStart)} and ${dd(weekEnd)}.`
```

Two helper functions added at the bottom of the file:
- `weekBoundsMondayToSunday(d)` → `{ start: Mon 00:00, end: Sun 23:59:59.999 }`.
  Handles `getDay() === 0` (Sunday) → 6 days from Monday.
- `fmtDDMMYYYY(d)` → `dd/MM/yyyy` for the conflict message.

[`apps/quikscale/app/api/client-meetings/weekly-meetings/[id]/route.ts`](./app/api/client-meetings/weekly-meetings/[id]/route.ts)
(PUT) — same rule, but excludes the meeting being edited
(`id: { not: params.id }`) so:
- Move-within-the-same-week → allowed.
- Move TO a week that already has another meeting for this client → 409.

Soft-deleted meetings ignored (`deletedAt: null`) — trashing a
conflicting meeting frees up the slot.

### Frontend
No client-side change needed — the existing form already surfaces the
API's `error` field as a toast / red banner, so the user sees the
exact message verbatim.

---

## 16. Member Punch-In — saved scores overrode the AB / NA labels

### Symptom
When a member was flagged *Absent* (or *Weekly Dashboard NA*) on a
meeting and a row in `ClientWeeklyMemberScore` already existed for
them (e.g. all-zero defaults), the row in the Member Punch-In grid
rendered as `0% / 0% / 0% / 0% / 0%` (red) instead of
`AB / AB / AB / AB / AB` (or `NA / NA / NA / NA / NA`).

### Root cause
The `&& !present` guard in `computeMemberPunchIn` (`lib/services/clientMeetingsMath.ts`)
let any saved score sneak past the status check:

```ts
if (onDashboardNA && !present) return ... NA;   // ← guard
if (isAbsent && !present)      return ... AB;   // ← guard
return numeric;                                 // saved score wins
```

### Fix
Status flag wins unconditionally. Drop the `!present` guard:

```ts
if (onDashboardNA) return ... NA;
if (isAbsent)     return ... AB;
return numeric;
```

Saved scores are still preserved in the DB and reappear if the user
later un-flags the member.

---

## 17. Member Punch-In — wrong relation queried, AB / NA never matched

### Symptom
Even after fix #16, an absent member STILL rendered as `0%` instead of
`AB`. The fix was correct in `clientMeetingsMath.ts`; the bug was one
layer up.

### Root cause
`ClientWeeklyMeeting` carries TWO pairs of absence relations:

| Relation | Keyed on |
|---|---|
| `absentMembers` / `dashboardNAMembers` | `User.id` |
| `absentTeamMembers` / `dashboardNATeamMembers` | `ClientMember.id` |

The Weekly Meeting form's *Absent Members* / *Weekly Dashboard NA*
pickers source from `clientDetail.members` (ClientMembers) and write
to the **`*TeamMembers`** tables. But the dashboard route was reading
from the **`User`-keyed** relations (`absentMembers` /
`dashboardNAMembers`). The `punchUserId` it then compared against was
a `ClientMember.id` — never present in the `User.id` list — so
`isAbsent` and `onDashboardNA` were always `false`.

### Fix
[`apps/quikscale/app/api/client-meetings/dashboard/route.ts`](./app/api/client-meetings/dashboard/route.ts)
— include the ClientMember-keyed relations in the
`clientWeeklyMeeting.findMany` query, and pass their `clientMemberId`
into the `absentUserIds` / `dashboardNAUserIds` slots that
`computeMemberPunchIn` already keys against:

```ts
include: {
  absentTeamMembers: true,
  dashboardNATeamMembers: true,
  ...
},
...
absentUserIds: m.absentTeamMembers.map(a => a.clientMemberId),
dashboardNAUserIds: m.dashboardNATeamMembers.map(a => a.clientMemberId),
```

The function's parameter names are still
`absentUserIds` / `dashboardNAUserIds` even though they're now
ClientMember ids — flagged in a code comment but not renamed (would
ripple too widely for one bug fix).

---

## 18. Member Punch-In — color coding removed

### Symptom
Numeric % cells on the Member Punch-In grid were color-coded
(red < 80, yellow 80-89, green 90-97, blue ≥ 98) and AB / NA cells had
their own red / gray backgrounds. Admin requested plain values, no
color coding.

### Fix
[`apps/quikscale/app/(dashboard)/client-meetings/page.tsx`](./app/(dashboard)/client-meetings/page.tsx)
— removed the `cellClass(v, true)` invocation on Member Punch-In rows.
Cells now render as `text-center px-3 py-2 font-semibold text-gray-800`
on the white row background — `42%`, `AB`, `NA`, all visually equal
weight. The Performance tab (other half of the page) still uses
`cellClass`; that helper wasn't deleted.

---

## 19. Attendance % counted Dashboard NA as missing

### Symptom
Performance tab → *Avg. % of people attending the calls* showed 67% for
a meeting where the math should be 75% (roster 4, absent 1, NA 1).

### Root cause
[`apps/quikscale/app/api/client-meetings/dashboard/route.ts`](./app/api/client-meetings/dashboard/route.ts)
was subtracting NA members from the denominator
(`totalMembers = rosterSize - naCount`), then dividing by the smaller
denominator. With 4 / 1 / 1, that produced
`(4-1) / (4-1) = (3-1) / 3 = 66.67%`.

The intent: NA members were present at the meeting; they're just
exempt from filling the dashboard. They should NOT shrink the
denominator nor count as absent.

### Fix
Pass the full roster as denominator; don't subtract NA:

```ts
const absentCount = m.absentMembers.length + m.absentTeamMembers.length;
return {
  ...,
  totalMembers: rosterSize,           // was: rosterSize - naCount
  absentCount,
  ...
};
```

| Roster | Absent | NA | Old | New |
|---|---|---|---|---|
| 4 | 1 | 1 | 67% ❌ | 75% ✓ |
| 5 | 2 | 0 | 60% | 60% (unchanged) |
| 6 | 1 | 2 | 125% (overflow) ❌ | 83% ✓ |

The "with NA" case where old code overflowed (count went above 100%)
is also now safe because the denominator is no longer pre-shrunk.

---

## 20. KPI Name cell — long text blew out the column width

### Symptom
A KPI name with no spaces (e.g. a paste like
`lkjlkuiokjsdfnkjhsduighsdfk…`) stretched the *KPI Name* column off
the right edge of the page, scrolling the entire row.

### Root cause
The KPI Name cell rendered the value inside
`<span className="line-clamp-2 leading-snug">`. `line-clamp-2` clips
overflow to 2 lines with an ellipsis but it doesn't help when the
string is one giant unbroken word — `overflow-wrap` defaults to
`normal`, so the word can't break and the column expands.

### Fix
[`apps/quikscale/app/(dashboard)/kpi/components/KPITable.tsx`](./app/(dashboard)/kpi/components/KPITable.tsx)
— replaced the line-clamp span with a 3-line scroll box that
break-alls long unbroken strings:

```tsx
<div
  className="max-h-[3.25rem] overflow-y-auto leading-snug break-all cursor-default pr-1"
  style={{ scrollbarWidth: "thin" }}
>
  {kpi.name}
</div>
```

| Class | Why |
|---|---|
| `max-h-[3.25rem]` | ~3 lines at `text-xs` + `leading-snug`. |
| `overflow-y-auto` | Vertical scrollbar only when content overflows past 3 lines. |
| `break-all` | Force-breaks single-word strings inside the column instead of pushing the column wider. Stronger than `break-words`. |
| `pr-1` | Reserve 4px so the scrollbar doesn't sit on top of the text. |
| `scrollbarWidth: "thin"` | Compact native scrollbar. |

The `<NameTooltip>` wrapper is preserved so hover still shows the
full name without scrolling.

---

## 21. Audit logs — raw JSON dumps were unreadable

### Symptom
Both Daily Huddle and Weekly Meeting audit log views rendered the
`oldValue` / `newValue` payloads as raw JSON / `key=value` blobs:

```
SCORE_UPDATE                              5/4/2026, 7:04:34 PM
Ashwin Singone
{"userId":"cmocybon5001f131i4v8dw1zn","kpiWeeklyQTD":50,"kpiCoding":75,…
```

```
CREATE                Ashwin Singone · Apr 29, 2026, 6:43 PM
clientId="cmofp1fjg001toopvmm3gb6zb", meetingDate="2026-04-30T00:00:00.000Z", callStatus="HELD"
```

### Fix
[`apps/quikscale/lib/utils/auditLog.ts`](./lib/utils/auditLog.ts) — added
`fmtFriendlyAuditEntry(action, newValue, oldValue, opts)` that returns
`{ headline, rows: [{ label, oldValue?, newValue }] }`:

- **CREATE** → `Created for May 12, 2026 — Held` + key fields as table.
- **UPDATE** → `Updated 3 fields` + per-row `oldValue → newValue` diffs
  (only changed keys, noisy meta keys hidden).
- **SCORE_UPDATE** → `Scored Pravin` + the 5 KPI rows.
- **DELETE / RESTORE** → headline only.

`fmtValue` translates raw payload values into readable form:

| Input | Rendered |
|---|---|
| `"HELD"` (callStatus) | `Held` |
| `"YES"` / `"NO"` / `"NA"` (flag fields) | `Yes` / `No` / `N/A` |
| `"2026-04-30T00:00:00.000Z"` (date-only) | `Apr 30, 2026` |
| `"2026-04-30T10:15:00.000Z"` (datetime) | `Apr 30, 2026, 10:15 AM` |
| `"cmofp1fjg001toopvmm3gb6zb"` (cuid) | resolved name from `nameById` resolver, else `cmofp1…3gb6zb` |
| `null` / `""` | `—` |

Wired into both pages:
[`apps/quikscale/app/(dashboard)/client-meetings/weekly-meeting/page.tsx`](./app/(dashboard)/client-meetings/weekly-meeting/page.tsx)
and
[`apps/quikscale/app/(dashboard)/client-meetings/daily-huddle/page.tsx`](./app/(dashboard)/client-meetings/daily-huddle/page.tsx) —
each builds a `nameById` resolver from `clients` + member lists in
state and renders the headline + diff table. Raw payload preserved
inside a collapsed `<details>` block on the Weekly Meeting log for
developers debugging the source data.

---

## 22. Excel export — Attendance + Quality both showed 0%

### Symptom
After fix #19 (dashboard attendance) and the `Quality of the
dashboards` rewrite (bug #26 below), the Excel "Weekly Report" still
exported `0%` for both rows even when the dashboard showed the
correct values.

### Root cause
[`apps/quikscale/app/api/client-meetings/export/weekly/route.ts`](./app/api/client-meetings/export/weekly/route.ts)
had been carrying THREE bugs that the dashboard route didn't:

1. `totalMembers: 0` was hard-coded → attendance percent always
   short-circuited to 0%.
2. `absentCount: m.absentMembers.length` only counted User-keyed
   absents; the form writes ClientMember-keyed absents to
   `absentTeamMembers` (same root cause as #17).
3. `memberScores: [] as const` — Quality of the dashboards reads from
   member scores (#26); passing an empty array made it always 0%.

### Fix
- Pull the client roster (`teamMembers` with `member.deletedAt`) so
  `rosterSize` matches the dashboard's denominator.
- `include` the four absence relations + `memberScores` in the Prisma
  query.
- Map them through to `calculateWeeklyMonthlyStats`:
  ```ts
  totalMembers: rosterSize,
  absentCount: m.absentMembers.length + m.absentTeamMembers.length,
  memberScores: m.memberScores.map(s => ({ userId: s.clientMemberId, … })),
  ```

The export now matches the dashboard exactly for the same client +
month range.

---

## 23. Daily Huddle + Weekly Meeting — new "Export Data" modal

### Symptom
- Weekly Meeting had no export entry point at all.
- Daily Huddle's existing export modal asked for *columns + scope*
  (`Page / Filtered / All`), which admins didn't actually need — they
  wanted to pick a client + month range and download the rows.

### Fix
**New shared component**:
[`apps/quikscale/components/client-meetings/ExportDataModal.tsx`](./components/client-meetings/ExportDataModal.tsx)
— matches the reference design: From / To Year + Month dropdowns +
*Select Client* dropdown + green *Export Data* submit. `onSubmit`
receives `{ from: "YYYY-MM-DD", to: "YYYY-MM-DD", clientId }`.

**ModuleMoreActions extension**:
[`apps/quikscale/components/table/ModuleMoreActions.tsx`](./components/table/ModuleMoreActions.tsx)
— added optional `onExportClick` prop. When set, the *Export Data*
menu item calls it instead of opening the legacy column-selection
ExportModal. Existing callers that don't pass it get the old behaviour
(no breaking change).

**Daily Huddle**:
[`apps/quikscale/app/(dashboard)/client-meetings/daily-huddle/page.tsx`](./app/(dashboard)/client-meetings/daily-huddle/page.tsx) —
the More menu's *Export Data* now opens the new modal. Submit fetches
huddles for the chosen window/client and runs them through the
existing `runExport` xlsx pipeline.

**Weekly Meeting**:
[`apps/quikscale/app/(dashboard)/client-meetings/weekly-meeting/page.tsx`](./app/(dashboard)/client-meetings/weekly-meeting/page.tsx) —
added a standalone *Export Data* button next to *Add* (Weekly has no
trash/columns plumbing yet, so a full More menu was deferred). Same
modal, exports a 21-column sheet (Meeting Date / Client / Status /
Absent / Dashboard NA / Times / 7 segment Yes-No-NA flags + their
times). Filename: `WeeklyMeeting_<from>_<to>[_all-clients].xlsx`.

---

## 24. Weekly Meeting — Yes without Time should be rejected

### Symptom
The seven Yes/No/NA radios on the Weekly Meeting form (Good News
Sharing, K&P dashboard, GAPS, WWW, Customer/Employee Feedback,
Collective Intelligence, OPSP Review) each have a paired Time field.
Picking *YES* without filling its time submitted happily — leaving
incomplete data in the DB.

### Fix
[`apps/quikscale/app/(dashboard)/client-meetings/weekly-meeting/page.tsx`](./app/(dashboard)/client-meetings/weekly-meeting/page.tsx) —
in the submit handler, after the existing `actualEndTime > actualStartTime`
check:

```ts
const missingTimes = RADIO_FIELDS.filter(
  (rf) => f[rf.key] === "YES" && !f[rf.pairedTime],
);
if (missingTimes.length > 0) {
  setTimeFieldErrors(new Set(missingTimes.map((rf) => rf.pairedTime)));
  setError(`Please enter the time for: ${labels}. Time is required when set to YES.`);
  return;
}
```

`RADIO_FIELDS` already maps each radio to its paired column, so the
loop is exhaustive — covers all seven segments without per-field
plumbing.

---

## 25. Weekly Meeting — top-only error required scrolling

### Symptom
After bug #24 shipped, the rejection message lived only in the global
red banner at the top of the form. With seven segments stacked
vertically, users had to scroll up after clicking Submit just to see
WHAT was wrong, and even then the message didn't say which inputs to
fix beyond a comma-list of labels.

### Fix
Per-field validation surface in the same file:

1. New state `timeFieldErrors: Set<string>` keyed by paired-time
   column name.
2. Submit populates the set on rejection; clears it on success.
3. The Time `<input>` adds:
   - Red border + `bg-red-50` when its key is in the set.
   - `<p>Time is required when {label} is set to YES.</p>` directly
     below the input.
4. Two reactive clears so the user gets instant feedback:
   - Typing a value into the Time input → removes that key from the
     set.
   - Toggling the YES radio away (NO / NA) → also clears it (because
     `setRadio` already wipes the time field).

---

## 26. Weekly Meeting — submit didn't scroll to the first error

### Symptom
Even with bug #25 shipped, on a long form the user clicked Submit at
the bottom and the red borders appeared up the page off-screen —
nothing visibly happened from their viewport.

### Fix
Same file — after populating `timeFieldErrors`, scroll the first
missing field into view:

```ts
const firstMissingKey = missingTimes[0].pairedTime;
requestAnimationFrame(() => {
  const el = document.querySelector(
    `[data-time-field="${firstMissingKey}"]`,
  ) as HTMLElement | null;
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => el.focus({ preventScroll: true }), 350);
  }
});
```

Each Time `<input>` carries a `data-time-field={rf.pairedTime}`
attribute so the lookup finds it. `requestAnimationFrame` waits one
tick so the just-rendered red border is visible at scroll-end;
`preventScroll: true` on `focus()` stops the browser from snap-jumping
the input to top after the smooth scroll.

---

## 27. "Quality of the dashboards" calc rewrite

### Symptom
Performance row showed values that didn't match the per-member scores
in the Update tab. Admins expected a clean average of the five KPI
columns across members; the dashboard was blending a flag percentage
into the result, plus the dashboard route was passing empty
member-score arrays into the math.

### Root cause
Two parts:

1. **`calculateWeeklyMonthlyStats` blended two unrelated signals 50/50**:
   ```ts
   const qualityFlagPct = pctYesNA(held.map(r => r.opspReview), held.length);
   const avgMemberScore = …;             // mean of per-member averages
   const avgAuality = (qualityFlagPct + avgMemberScore) / 2;
   ```
   The `opspReview` Yes/No/NA flag has nothing to do with how members
   scored on the dashboard — including it dragged the metric off the
   actual member-score average.

2. **Dashboard + export routes both passed `memberScores: [] as const`**
   so the member-score branch always returned 0 — Quality was
   effectively `qualityFlagPct / 2`, regardless of what was scored.

### Fix
[`apps/quikscale/lib/services/clientMeetingsMath.ts`](./lib/services/clientMeetingsMath.ts) —
removed the flag blend; `avgAuality` is now the pure cross-meeting
mean of per-meeting member-score averages. Meetings with zero
member-scores are excluded from the denominator (so an empty week
doesn't pull the metric to 0):

```ts
const meetingsWithScores = perMeetingMemberAvgs
  .filter((_, i) => held[i].memberScores.length > 0);
const avgAuality = meetingsWithScores.length
  ? meetingsWithScores.reduce((a, b) => a + b, 0) / meetingsWithScores.length
  : 0;
```

[`apps/quikscale/app/api/client-meetings/dashboard/route.ts`](./app/api/client-meetings/dashboard/route.ts) and
[`apps/quikscale/app/api/client-meetings/export/weekly/route.ts`](./app/api/client-meetings/export/weekly/route.ts) —
both `include: { memberScores: true }` on the meeting query and
forward each row through:

```ts
memberScores: m.memberScores.map(s => ({
  userId: s.clientMemberId,
  kpiWeeklyQTD: s.kpiWeeklyQTD,
  kpiCoding: s.kpiCoding,
  priorityNotes: s.priorityNotes,
  priorityStartEndDate: s.priorityStartEndDate,
  priorityColor: s.priorityColor,
})),
```

### Verification
Worked example: meeting with two scored members (Ravi 54/95/14/25/14
and June 2/8/0/0/0). Per-member averages 40.4 and 2.0; per-meeting mean
21.2; only one held meeting → `avgAuality = 21.2 → 21` after `smartRound`.

Mathematically identical to "per-KPI average across members, then
average those 5" because
`((a+b+c+d+e)/5 + (f+g+h+i+j)/5) / 2 ≡ ((a+f)/2 + (b+g)/2 + …) / 5`.

---

## Summary of files touched (by bug)

| Bug                                          | Files                                                                                              |
|----------------------------------------------|----------------------------------------------------------------------------------------------------|
| 1. SMTP auth fail                            | `apps/quikscale/lib/services/email.ts`, `apps/quikscale/.env`                                      |
| 2. Multi-assignee on WWW                     | `packages/database/prisma/schema.prisma`, migration `20260504120000_add_www_who_ids`, `apps/quikscale/lib/schemas/wwwSchema.ts`, `apps/quikscale/lib/types/www.ts`, `apps/quikscale/app/(dashboard)/www/components/WWWPanel.tsx`, `apps/quikscale/app/api/www/route.ts`, `apps/quikscale/app/api/www/[id]/route.ts` |
| 3. WWW reassignment notification             | `apps/quikscale/lib/services/email.ts`, `apps/quikscale/lib/services/wwwNotifications.ts`, `apps/quikscale/app/api/www/[id]/route.ts` |
| 4. Dashboard rolling 5-week window           | `apps/quikscale/lib/utils/fiscal.ts`, `apps/quikscale/app/(dashboard)/dashboard/page.tsx`, `apps/quikscale/app/(dashboard)/priority/components/PriorityTable.tsx` |
| 5. Dashboard table fill-width                | `apps/quikscale/app/(dashboard)/kpi/components/KPITable.tsx`, `apps/quikscale/app/(dashboard)/priority/components/PriorityTable.tsx`, `apps/quikscale/app/(dashboard)/dashboard/page.tsx` |
| 6. Phantom FY "already exists"               | `apps/quikscale/app/(dashboard)/org-setup/quarters/page.tsx`                                       |
| 7. Time picker consistency                   | `apps/quikscale/app/(dashboard)/client-meetings/weekly-meeting/page.tsx`, `apps/quikscale/app/(dashboard)/client-meetings/daily-huddle/page.tsx` |
| 8. KPI / Priority page padding               | `apps/quikscale/app/(dashboard)/kpi/page.tsx`, `apps/quikscale/app/(dashboard)/priority/page.tsx` |
| 9. Sidebar Roles & Permissions removed       | `apps/quikscale/components/dashboard/sidebar.tsx` |
| 10. Priority — Log label + sticky thead       | `apps/quikscale/app/(dashboard)/priority/components/PriorityTable.tsx` |
| 11. Priority — first 3 columns sticky horiz   | `apps/quikscale/app/(dashboard)/priority/components/PriorityTable.tsx` |
| 12. Current-week visual highlight removed    | `apps/quikscale/app/(dashboard)/kpi/components/KPITable.tsx`, `apps/quikscale/app/(dashboard)/priority/components/PriorityTable.tsx` |
| 13. Weekly Meeting — Absent / Dashboard-NA / Update placeholder | `apps/quikscale/app/(dashboard)/client-meetings/weekly-meeting/page.tsx` |
| 14. Member Punch-In — Select Member single-select | `apps/quikscale/app/(dashboard)/client-meetings/page.tsx` |
| 15. Weekly Meeting — one-meeting-per-client-per-week guard | `apps/quikscale/app/api/client-meetings/weekly-meetings/route.ts`, `apps/quikscale/app/api/client-meetings/weekly-meetings/[id]/route.ts` |
| 16. Member Punch-In — AB / NA flags win over saved scores | `apps/quikscale/lib/services/clientMeetingsMath.ts` |
| 17. Member Punch-In — wrong relation queried (User vs ClientMember) | `apps/quikscale/app/api/client-meetings/dashboard/route.ts` |
| 18. Member Punch-In — color coding removed | `apps/quikscale/app/(dashboard)/client-meetings/page.tsx` |
| 19. Attendance % counted Dashboard NA as missing | `apps/quikscale/app/api/client-meetings/dashboard/route.ts` |
| 20. KPI Name cell — 3-line scroll + break-all (no column blowout) | `apps/quikscale/app/(dashboard)/kpi/components/KPITable.tsx` |
| 21. Friendly audit logs (Daily Huddle + Weekly Meeting) | `apps/quikscale/lib/utils/auditLog.ts`, `apps/quikscale/app/(dashboard)/client-meetings/daily-huddle/page.tsx`, `apps/quikscale/app/(dashboard)/client-meetings/weekly-meeting/page.tsx` |
| 22. Excel export — Attendance + Quality both 0% | `apps/quikscale/app/api/client-meetings/export/weekly/route.ts` |
| 23. Daily / Weekly Meeting — new Export Data modal | `apps/quikscale/components/client-meetings/ExportDataModal.tsx`, `apps/quikscale/components/table/ModuleMoreActions.tsx`, `apps/quikscale/app/(dashboard)/client-meetings/daily-huddle/page.tsx`, `apps/quikscale/app/(dashboard)/client-meetings/weekly-meeting/page.tsx` |
| 24. Weekly Meeting — Yes-without-Time validation | `apps/quikscale/app/(dashboard)/client-meetings/weekly-meeting/page.tsx` |
| 25. Weekly Meeting — inline field-level Time errors | `apps/quikscale/app/(dashboard)/client-meetings/weekly-meeting/page.tsx` |
| 26. Weekly Meeting — auto-scroll to first error | `apps/quikscale/app/(dashboard)/client-meetings/weekly-meeting/page.tsx` |
| 27. "Quality of the dashboards" calc rewrite | `apps/quikscale/lib/services/clientMeetingsMath.ts`, `apps/quikscale/app/api/client-meetings/dashboard/route.ts`, `apps/quikscale/app/api/client-meetings/export/weekly/route.ts` |

Every bug fix was followed by `npm run typecheck` (clean) before moving on.
No tests were added — the existing repo standard requires regression tests
for bug fixes; that is queued as a follow-up.
