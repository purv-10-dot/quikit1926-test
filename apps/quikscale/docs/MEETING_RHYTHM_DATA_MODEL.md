# Meeting Rhythm — Data Model Reference

> **Scope:** Weekly Meeting + Daily Huddle storage map. Covers every table, column,
> foreign key, enum, and cascade behavior involved in the Client Meetings flow.
>
> **Routes:** [`app/(dashboard)/client-meetings/daily-huddle/`](../app/(dashboard)/client-meetings/daily-huddle/) and [`app/(dashboard)/client-meetings/weekly-meeting/`](../app/(dashboard)/client-meetings/weekly-meeting/)
> **Schema file:** [`packages/database/prisma/schema.prisma`](../../../packages/database/prisma/schema.prisma)
> **Prisma schema namespace:** `app_quikscale` (all tables below)

---

## 1. Table inventory

| # | Table | Purpose | Cascade parent |
|---|---|---|---|
| 1 | `Client` | The client/account itself | `Org` |
| 2 | `ClientMember` | External roster (client-side people, no tenant login) | `Org` |
| 3 | `ClientTeamMember` | M2M link: which `ClientMember`s belong to which `Client` | `Client` + `ClientMember` |
| 4 | `ClientMembership` | M2M link: which tenant `User`s are assigned to which `Client` | `Client` + `User` |
| 5 | `ClientDailyHuddle` | One row per daily huddle event | `Client` + `Org` |
| 6 | `ClientDailyHuddleAbsence` | Absent **tenant Users** in a huddle | `ClientDailyHuddle` + `User` |
| 7 | `ClientDailyHuddleTeamAbsence` | Absent **external ClientMembers** in a huddle | `ClientDailyHuddle` + `ClientMember` |
| 8 | `ClientWeeklyMeeting` | One row per weekly meeting event | `Client` + `Org` |
| 9 | `ClientWeeklyMeetingAbsence` | Absent **tenant Users** in a weekly meeting | `ClientWeeklyMeeting` + `User` |
| 10 | `ClientWeeklyMeetingTeamAbsence` | Absent **external ClientMembers** in a weekly meeting | `ClientWeeklyMeeting` + `ClientMember` |
| 11 | `ClientWeeklyMeetingDashboardNA` | Tenant Users marked "Weekly Dashboard N/A" | `ClientWeeklyMeeting` + `User` |
| 12 | `ClientWeeklyMeetingTeamDashboardNA` | External ClientMembers marked "Weekly Dashboard N/A" | `ClientWeeklyMeeting` + `ClientMember` |
| 13 | `ClientWeeklyMemberScore` | Per-member KPI/Priority scores captured in a weekly meeting | `ClientWeeklyMeeting` + `ClientMember` |
| 14 | `ClientWeeklyMeetingLog` | Audit trail (CREATE/UPDATE/DELETE/RESTORE) for weekly meetings | `ClientWeeklyMeeting` |

---

## 2. Foundation tables (shared by both daily & weekly)

### 2.1 `Client`

The client/account that the meetings are about. Every meeting row carries `clientId`.

| Column | Type | Description |
|---|---|---|
| `id` | `String` (cuid) PK | |
| `orgId` | `String` FK → `Org.id` | Tenant scope. **Always filter queries by this.** |
| `name` | `String` | Client display name |
| `description` | `String?` | Free-text |
| `isActive` | `Boolean @default(true)` | Soft-disable without deleting |
| `startDate` | `DateTime?` | When the engagement started |
| `weeklyStartTime` | `String?` | Planned weekly meeting window — `HH:mm` 24h |
| `weeklyEndTime` | `String?` | |
| `dailyStartTime` | `String?` | Planned daily huddle window — `HH:mm` 24h |
| `dailyEndTime` | `String?` | |
| `createdAt`, `updatedAt`, `createdBy`, `updatedBy` | audit | |
| `deletedAt` | `DateTime?` | Soft-delete marker |

**Indexes:** `orgId`, `(orgId, isActive)`, `deletedAt`
**Unique:** `(orgId, name)`

### 2.2 `ClientMember`

Flat roster of **external** people the client invites. **Not tenant Users** — they have no login. Used as the source of truth for "who's on this client's team" inside meeting drawers.

| Column | Type | Description |
|---|---|---|
| `id` | `String` PK | |
| `orgId` | `String` | Tenant scope |
| `name` | `String` | |
| `email` | `String` | |
| audit + `deletedAt` | | |

**Indexes:** `orgId`, `(orgId, deletedAt)`, `email`

### 2.3 `ClientTeamMember` (Client ↔ ClientMember)

Many-to-many link between a `Client` and the `ClientMember`s that belong to it.

| Column | Type |
|---|---|
| `clientId` | FK → `Client.id` |
| `clientMemberId` | FK → `ClientMember.id` |
| `orgId` | denormalized for index |
| `createdAt` | |

**PK:** composite `(clientId, clientMemberId)`
**Indexes:** `clientMemberId`, `orgId`

### 2.4 `ClientMembership` (Client ↔ tenant User)

Many-to-many link between a `Client` and your own tenant `User`s (e.g. account manager, SPOC).
**Separate from `ClientTeamMember`** — this side is for tenant staff with logins.

| Column | Type |
|---|---|
| `id` | PK |
| `orgId`, `clientId`, `userId` | FKs |
| `clientRole` | `String?` — client-specific role like "Account Manager" |
| `deletedAt` | soft-delete |

**Unique:** `(clientId, userId)`

---

## 3. Daily Huddle

### 3.1 `ClientDailyHuddle`

One row per daily huddle event for a client.

| Column | Type | Description |
|---|---|---|
| `id` | `String` PK | |
| `orgId` | `String` | Tenant scope |
| `clientId` | `String` FK → `Client.id` | |
| `meetingDate` | `DateTime` | Date of the huddle |
| `callStatus` | `enum ClientMeetingStatus @default(HELD)` | `HELD` / `NOT_HELD` / `CALL_CANCELLED_BY_CLIENT` / `HOLIDAY_FOR_CLIENT` / `HOLIDAY_FOR_SUCCESS_ALCHEMIST` |
| `actualStartTime` | `String?` | Observed start `HH:mm`. Blank when call not held. |
| `actualEndTime` | `String?` | Observed end |
| `format1Status` | `enum ClientMeetingFlag @default(NA)` | Format check #1 — `YES` / `NO` / `NA` |
| `format2Status` | `enum ClientMeetingFlag` | Format check #2 |
| `stuckCallStatus` | `enum ClientMeetingFlag` | "Stuck call" flag |
| `punctualityOverride` | `enum ClientMeetingFlag` | Manual punctuality override (radio in drawer) |
| `totalMembers` | `Int @default(0)` | **Snapshot** of invited roster size at meeting time — used as denominator in attendance %. Do NOT recompute from current roster (it drifts over time). |
| `notes` | `String?` | Rich-text notes captured in the drawer |
| `notesKPDashboard` | `String?` | KP-Dashboard-scoped notes |
| `otherNotes` | `String?` | |
| audit + `deletedAt` | | |

**Indexes:** `orgId`, `(orgId, deletedAt)`, `clientId`, `meetingDate`, `(clientId, meetingDate)`, `(clientId, deletedAt, meetingDate)`, `deletedAt`

### 3.2 `ClientDailyHuddleAbsence` — tenant Users absent

| Column | Type |
|---|---|
| `huddleId` | FK → `ClientDailyHuddle.id` |
| `userId` | FK → `User.id` |

**PK:** `(huddleId, userId)`
**Index:** `userId`

### 3.3 `ClientDailyHuddleTeamAbsence` — external ClientMembers absent

| Column | Type |
|---|---|
| `huddleId` | FK → `ClientDailyHuddle.id` |
| `clientMemberId` | FK → `ClientMember.id` |

**PK:** `(huddleId, clientMemberId)`
**Index:** `clientMemberId`

> **Why two absence tables?** Two parallel "member" universes attend the same huddle:
> tenant Users (with login) and external ClientMembers (no login). A single
> polymorphic table would lose referential integrity, so the schema splits them.

---

## 4. Weekly Meeting

### 4.1 `ClientWeeklyMeeting`

One row per weekly meeting event. Carries 7 timed segments + 7 status flags.

| Column | Type | Description |
|---|---|---|
| `id` | `String` PK | |
| `orgId` | `String` | Tenant scope |
| `clientId` | `String` FK → `Client.id` | |
| `meetingDate` | `DateTime` | |
| `callStatus` | `enum ClientMeetingStatus` | Same enum as daily huddle |
| `actualStartTime` | `String?` | Overall meeting start `HH:mm` |
| `actualEndTime` | `String?` | Overall meeting end |
| **Segment timings — 7 slots, `null` = segment skipped:** | | |
| `segmentTime1` | `String?` | Pairs with `goodNewsSharing` |
| `segmentTime2` | `String?` | Pairs with `kpDashboard` |
| `segmentTime3` | `String?` | Pairs with `gaps` |
| `segmentTime4` | `String?` | Pairs with `www` |
| `segmentTime5` | `String?` | Pairs with `feedback` |
| `segmentTime6` | `String?` | Pairs with `collectiveIntelligence` |
| `segmentTime7` | `String?` | Pairs with `opspReview` |
| **Segment status flags — `YES` / `NO` / `NA`:** | | |
| `goodNewsSharing` | `enum ClientMeetingFlag` | |
| `kpDashboard` | `enum ClientMeetingFlag` | |
| `gaps` | `enum ClientMeetingFlag` | |
| `www` | `enum ClientMeetingFlag` | |
| `feedback` | `enum ClientMeetingFlag` | |
| `collectiveIntelligence` | `enum ClientMeetingFlag` | |
| `opspReview` | `enum ClientMeetingFlag` | |
| `notesKPDashboard` | `String?` | |
| `otherNotes` | `String?` | |
| audit + `deletedAt` | | |

**Indexes:** `orgId`, `(orgId, deletedAt)`, `clientId`, `meetingDate`, `(clientId, meetingDate)`, `(clientId, deletedAt, meetingDate)`, `deletedAt`

### 4.2 `ClientWeeklyMeetingAbsence` — tenant Users absent

| Column | Type |
|---|---|
| `meetingId` | FK → `ClientWeeklyMeeting.id` |
| `userId` | FK → `User.id` |

**PK:** `(meetingId, userId)`

### 4.3 `ClientWeeklyMeetingTeamAbsence` — external ClientMembers absent

| Column | Type |
|---|---|
| `meetingId` | FK → `ClientWeeklyMeeting.id` |
| `clientMemberId` | FK → `ClientMember.id` |

**PK:** `(meetingId, clientMemberId)`

### 4.4 `ClientWeeklyMeetingDashboardNA` — "Weekly Dashboard N/A" for tenant Users

Distinct from absence. The member **attended** but their dashboard isn't applicable that week.

| Column | Type |
|---|---|
| `meetingId` | FK |
| `userId` | FK |

**PK:** `(meetingId, userId)`

### 4.5 `ClientWeeklyMeetingTeamDashboardNA` — "Weekly Dashboard N/A" for external ClientMembers

| Column | Type |
|---|---|
| `meetingId` | FK |
| `clientMemberId` | FK |

**PK:** `(meetingId, clientMemberId)`

### 4.6 `ClientWeeklyMemberScore` — per-member scores (Update tab)

Captured inside the weekly meeting drawer's **Update** tab.

| Column | Type | Description |
|---|---|---|
| `id` | PK | |
| `meetingId` | FK → `ClientWeeklyMeeting.id` | |
| `clientMemberId` | FK → `ClientMember.id` | Keyed on **ClientMember** (external roster), NOT User. Historical note: was previously keyed on User; migrated when external members became the canonical roster source. |
| `kpiWeeklyQTD` | `Int @default(0)` | |
| `kpiCoding` | `Int @default(0)` | |
| `priorityNotes` | `Int @default(0)` | |
| `priorityStartEndDate` | `Int @default(0)` | |
| `priorityColor` | `Int @default(0)` | |
| `updatedAt` | | |

**Unique:** `(meetingId, clientMemberId)` — exactly one score row per member per meeting
**Index:** `clientMemberId`

### 4.7 `ClientWeeklyMeetingLog` — audit trail

One row per CREATE / UPDATE field-level change / DELETE / RESTORE event on `ClientWeeklyMeeting`. Mirrors `KPILog`.

| Column | Type | Description |
|---|---|---|
| `id` | PK | |
| `orgId` | | |
| `meetingId` | FK → `ClientWeeklyMeeting.id` | |
| `action` | `String` | e.g. `"create"`, `"update.callStatus"`, `"delete"`, `"restore"` |
| `oldValue` | `String?` | Previous serialized value |
| `newValue` | `String?` | New serialized value |
| `changedBy` | `String` | userId |
| `reason` | `String?` | Optional explanation |
| `createdAt` | | |

**Indexes:** `orgId`, `meetingId`, `createdAt`, `(meetingId, createdAt)`

---

## 5. Enums

### `ClientMeetingStatus`

```
HELD
NOT_HELD
CALL_CANCELLED_BY_CLIENT
HOLIDAY_FOR_CLIENT
HOLIDAY_FOR_SUCCESS_ALCHEMIST
```

### `ClientMeetingFlag`

```
YES
NO
NA   (default — used for "not applicable" / not yet evaluated)
```

---

## 6. Relationship diagram

```
Org
 │
 ├──< Client ────────────────────────────────────────────────┐
 │      │                                                    │
 │      ├──< ClientMembership ──> User      (tenant staff)   │
 │      │      Unique (clientId, userId)                     │
 │      │                                                    │
 │      ├──< ClientTeamMember ──> ClientMember               │
 │      │      PK (clientId, clientMemberId)                 │
 │      │                                                    │
 │      ├──< ClientDailyHuddle ─┬─< DailyHuddleAbsence       ─> User
 │      │      (per huddle)     └─< DailyHuddleTeamAbsence   ─> ClientMember
 │      │                                                    │
 │      └──< ClientWeeklyMeeting ┬─< WeeklyMeetingAbsence        ─> User
 │             (per meeting)     ├─< WeeklyMeetingTeamAbsence    ─> ClientMember
 │                               ├─< WeeklyMeetingDashboardNA    ─> User
 │                               ├─< WeeklyMeetingTeamDashboardNA─> ClientMember
 │                               ├─< WeeklyMemberScore           ─> ClientMember
 │                               └─< WeeklyMeetingLog            (audit only)
 │
 └──< ClientMember (flat external roster, joined to Client via ClientTeamMember)
```

---

## 7. Cascade & soft-delete behavior

| Behavior | Tables |
|---|---|
| **Soft-delete** (`deletedAt` column, row preserved) | `Client`, `ClientMember`, `ClientMembership`, `ClientDailyHuddle`, `ClientWeeklyMeeting` |
| **Hard-cascade-delete** (rows removed when parent deleted) | All `*Absence`, `*DashboardNA`, `ClientWeeklyMemberScore`, `ClientWeeklyMeetingLog`, `ClientTeamMember` |
| **Org-level cascade** | Deleting an `Org` cascades through `Client` → all meetings → all child rows. |

> When restoring a soft-deleted huddle/meeting, child rows (absences, scores) are
> already gone if they were hard-cascaded. If you need full restore-with-children,
> you must soft-delete the children too (not currently implemented).

---

## 8. Common query patterns

### Fetch a weekly meeting with all attendees marked absent

```ts
const meeting = await db.clientWeeklyMeeting.findUnique({
  where: { id: meetingId },
  include: {
    absentMembers: { include: { user: true } },          // tenant Users
    absentTeamMembers: { include: { member: true } },    // external ClientMembers
    dashboardNAMembers: { include: { user: true } },
    dashboardNATeamMembers: { include: { member: true } },
    memberScores: { include: { member: true } },
  },
});
```

### Fetch a daily huddle with attendance lists

```ts
const huddle = await db.clientDailyHuddle.findUnique({
  where: { id: huddleId },
  include: {
    absentMembers: { include: { user: true } },          // tenant Users
    absentTeamMembers: { include: { member: true } },    // external ClientMembers
    client: { select: { id: true, name: true } },
  },
});
```

### Attendance % math

```ts
// Denominator is the SNAPSHOT taken at meeting time, NOT today's roster
const totalInvited = huddle.totalMembers;
const totalAbsent = huddle.absentMembers.length + huddle.absentTeamMembers.length;
const attendancePct = totalInvited > 0
  ? ((totalInvited - totalAbsent) / totalInvited) * 100
  : 0;
```

### List all weekly meetings for a client (active, sorted by date desc)

```ts
const meetings = await db.clientWeeklyMeeting.findMany({
  where: { orgId, clientId, deletedAt: null },
  orderBy: { meetingDate: "desc" },
});
```

---

## 9. Design notes & gotchas

1. **Two parallel "member" worlds.** Every absence/dashboard-NA list comes in
   two flavors: `*Absence` (tenant Users) and `*TeamAbsence` (external
   ClientMembers). UI must merge both before display. See §6 diagram.

2. **`ClientWeeklyMemberScore` is keyed on `ClientMember`, not `User`.** If the
   Update-tab scores look empty, the cause is usually a `Client` that has
   tenant `ClientMembership`s but no `ClientTeamMember`s. The drawer needs
   external members to render score rows.

3. **`totalMembers` is a snapshot.** Stored on `ClientDailyHuddle` at creation
   time. Do NOT recompute attendance % using the current roster size — it
   drifts as members are added/removed from the client.

4. **`callStatus != HELD` implies blanks.** When `callStatus` is anything other
   than `HELD`, `actualStartTime`/`actualEndTime` are expected to be `null` and
   all format/segment flags default to `NA`. UI enforces this; DB does not.

5. **Daily huddle has no audit log table.** Only `ClientWeeklyMeeting` has
   `ClientWeeklyMeetingLog`. If daily huddle audit is ever required, mirror
   the same model with a new `ClientDailyHuddleLog` table.

6. **No "attended" rows.** Attendance is computed as
   `totalMembers - absentees - teamAbsentees`. There is no positive
   `*Presence` table — absence is the source of truth.

7. **`ClientMembership` vs `ClientTeamMember`.** Two different join tables for
   two different audiences:
   - `ClientMembership` → tenant Users (your staff). Has `clientRole` field.
   - `ClientTeamMember` → external ClientMembers (client's people).
   Don't conflate them when filtering "members of this client" — pick the
   right one for the surface you're rendering.
