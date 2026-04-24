# MoreYeahs Legacy → QuikScale Migration — Field Mapping

**Source:** MongoDB LCNC "GOAL" app dump, org `691d68de6d2dc48a6ed47674` (MoreYeahs)
**Target:** QuikScale local Prisma (PostgreSQL)
**Script:** `scripts/migrate-legacy/migrate-moreyeahs.mjs`
**Last run result:** 82 People + 2 LCNC-only = 84 users, 17 teams, 8 quarters, 500 indKPIs, 12 teamKPIs, 376 priorities, 245 WWWs

---

## Source collections used

| BSON file | Entity ID | Role | Rows |
|---|---|---|---|
| `formData_691d68e36d2dc48a6ed4767c.bson` | people | Business-entity people | 83 |
| `formData_691d68e36d2dc48a6ed4767f.bson` | teams | Teams | 17 |
| `formData_691d68e36d2dc48a6ed47683.bson` | quarter | Quarters (fiscal) | 8 |
| `formData_691d68e36d2dc48a6ed47681.bson` | indKpi | Individual KPIs | 516 |
| `formData_691d68e36d2dc48a6ed47682.bson` | teamKpi | Team KPIs | 12 |
| `formData_691d68e36d2dc48a6ed47684.bson` | priority | Priorities | 390 |
| `formData_691d68e36d2dc48a6ed4767e.bson` | www | WWW items (Who/What/When) | 252 |
| `lcnc-GoalsLive/users.bson` | LCNC platform | Login users (authorship resolution) | 76 in MoreYeahs org |

All source documents share a common envelope:
```
{ _id, form_data, notes, entityId, DetailPageData, isDeleted,
  orgId, createdBy, updatedBy, createdAt, updatedAt, __v }
```
The business fields live in `form_data`.

---

## Legend

- ✅ **Mapped** — value moved to Prisma, semantics preserved
- 🔁 **Derived** — value computed from source (not 1:1 copy)
- ⚠️ **Lossy** — mapped with known data loss / approximation
- ❌ **Dropped** — not migrated; see reason column

---

## 1. People (business-entity) → `User` + `Membership`

**MongoDB collection:** `formData_<peopleEntity>`

| Mongo field | Shape | Prisma target | Status | Notes |
|---|---|---|---|---|
| `form_data.app-master-user-email` | string | `User.email` (unique) | ✅ | Lowercased + trimmed |
| `form_data.app-master-user-name` | string | `User.firstName` + `User.lastName` | 🔁 | Split on whitespace; first token = firstName, rest = lastName |
| `form_data.app-master-user-phone` | string | — | ❌ | **No column on User.** Add `User.phone String?` to map. |
| `_id` | ObjectId | — | ❌ | No `legacyId` column. Impedes re-reconciliation. |
| `createdAt` / `updatedAt` | Date | `User.createdAt` / `updatedAt` | ❌ | User model doesn't take overrides in current flow (upsert path). |
| `createdBy` / `updatedBy` | ObjectId | — | ❌ | User model has no `createdBy` / `updatedBy` columns. |
| `isDeleted` | bool | — | ❌ | **User model has no `deletedAt` column.** 2 soft-deleted people still imported as active. |
| (synthetic) | — | `User.password` | 🔁 | All users get `bcrypt("password123", 10)` |
| (synthetic) | — | `Membership(tenantId, userId, role="member", status="active")` | 🔁 | One membership per People row into the Moreyeahs tenant |

---

## 2. LCNC Platform Users → `User` (supplemental)

**MongoDB collection:** `lcnc-GoalsLive/users.bson` (platform, not business)

Used purely to resolve `createdBy`/`updatedBy` ObjectIds on business records.

| Mongo field | Prisma target | Status |
|---|---|---|
| `email` | `User.email` (upsert if not already from People) | ✅ |
| `name` | `User.firstName` + `User.lastName` | 🔁 |
| `organizations[].orgId` | — (filter only; scoped to MoreYeahs) | 🔁 |
| `_id` | (in-memory) `lcncUserById` map for author resolution | ✅ |
| `password` (LCNC bcrypt hash) | — | ❌ | Replaced with `bcrypt("password123")` — users re-login with known credentials. Original hashes use `$2a$12$…`, ours uses `$2b$10$…`. |
| `isSuperAdmin`, `provider`, `isInvite`, `isActive`, `isAiUser` | — | ❌ | Super-admin status managed separately in QuikScale (`User.isSuperAdmin` set manually for ashwin). |
| `organizations[].role` | — | ❌ | LCNC roles (`user`, etc.) don't map to QuikScale roles (`member`/`admin`). All LCNC users default to `member`; escalation is manual post-migration. |
| `created_at` / `updated_at` | — | ❌ | User model has no author/timestamp overrides in migration flow. |

**Impact:** recovered authorship on 98.8% of KPI records (was 15% before LCNC dump). See §10 for stats.

---

## 3. Teams → `Team` + `UserTeam`

| Mongo field | Shape | Prisma target | Status | Notes |
|---|---|---|---|---|
| `form_data.goal-teams-text` | string | `Team.name` | ✅ | |
| `form_data.goal-teams-lookup` | `{id, entityId, value}` → People | `Team.headId` (→ User.id) | 🔁 | Resolved via peopleById → usersByEmail |
| `form_data.goal-teams-multiplelookup[]` | array of `{id, entityId}` | `UserTeam(tenantId, userId, teamId)` rows | 🔁 | One row per member; also sets `Membership.teamId` |
| (synthetic) | — | `Team.slug` | 🔁 | `slugify(name) + "-" + mongoId.slice(-6)` for uniqueness |
| (synthetic) | — | `Team.color` | 🔁 | Hardcoded `#0066cc` |
| `_id` (envelope) | ObjectId | — | ❌ | No `Team.legacyId` |
| `createdAt` | Date | `Team.createdAt` | ✅ | |
| `updatedAt` | Date | `Team.updatedAt` | ✅ | Raw SQL `UPDATE` post-create (bypasses Prisma `@updatedAt`) |
| `createdBy` | ObjectId | `Team.createdBy` | 🔁 | Resolved via `resolveUser()` (LCNC → People → Ashwin fallback) |
| `updatedBy` | ObjectId | — | ❌ | `Team` model has no `updatedBy` column |
| `isDeleted` | bool | `Team.deletedAt` | ✅ | Set to `updatedAt` or `createdAt` when `isDeleted:true`. 5/17 teams are soft-deleted. |
| `notes` (top-level) | array | — | ❌ | Empty across all team records |
| `DetailPageData`, `entityId`, `orgId`, `__v` | — | — | ❌ | Platform/UI metadata, no business value |

---

## 4. Quarters → `QuarterSetting`

| Mongo field | Prisma target | Status | Notes |
|---|---|---|---|
| `form_data.goal-quarter-select-1` | `QuarterSetting.quarter` | ✅ | Values: `Q1 | Q2 | Q3 | Q4` |
| `form_data.goal-quarter-date` | `QuarterSetting.startDate` | ✅ | |
| `form_data.goal-quarter-text` | `QuarterSetting.endDate` | ✅ | Falls back to `startDate` if missing |
| (derived) | `QuarterSetting.fiscalYear` | 🔁 | Fiscal year (Apr-start): if month ≥ 4, FY = calendar year; else calendar year − 1 |
| `form_data.goal-quarter-status` | `QuarterSetting.status` | ✅ | Added column (schema change). `completed` → `completed`, `upcoming` → `upcoming`, absent → `active` |
| `form_data.goal-quarter-select` (e.g. "2026") | — | ❌ | Source fiscalYear override. We derive from startDate; source value ignored to avoid conflicts. |
| `form_data.weeks[]` | — | ❌ | Custom week-window array `[{week, start, end}]`. App re-derives weeks from `startDate`/`endDate`. **Caveat:** if source had non-standard 7-day boundaries, they are lost. |
| `createdAt` | `QuarterSetting.createdAt` | ⚠️ | Not passed in migration — Prisma default `now()` used. Fixable but low priority. |
| `updatedAt` | — | ❌ | Same |
| `createdBy` (ObjectId) | `QuarterSetting.createdBy` | ⚠️ | Hardcoded to SYSTEM_USER_ID (Ashwin). `resolveUser()` not wired here. |
| `isDeleted` | — | ❌ | `QuarterSetting` has no `deletedAt`. 0 deleted quarters in source, so low risk. |

---

## 5. Individual KPIs → `KPI` (kpiLevel="individual") + `KPIWeeklyValue`

| Mongo field | Shape | Prisma target | Status | Notes |
|---|---|---|---|---|
| `form_data.goal-individual_kpi-text` | string | `KPI.name` | ✅ | |
| `form_data.goal-individual_kpi-textarea` | string | `KPI.description` | ✅ | |
| `form_data.goal-individual_kpi-lookup` | → People | `KPI.owner` | 🔁 | Resolved to User.id. **Skip** record if owner unresolvable. |
| `form_data.goal-individual_kpi-lookup-1` | → Team | `KPI.teamId` | 🔁 | Nullable |
| `form_data.goal-individual_kpi-lookup-3` | → Quarter | `KPI.year` + `KPI.quarter` | 🔁 | **Skip** if quarter unresolvable |
| `form_data.goal-individual_kpi-select` | "Number/Currency/Percentage" | `KPI.measurementUnit` | 🔁 | Case-normalized |
| `form_data.goal-individual_kpi-currency` | string | `KPI.currency` | ✅ | Only set when unit=Currency |
| `form_data.goal-individual_kpi-text-1` | number | `KPI.target` + `quarterlyGoal` + `qtdGoal` | 🔁 | Source has one target; copied to all three Prisma columns |
| `form_data.goal-individual_kpi-radio` | "Cumulative/Standalone" | `KPI.divisionType` | 🔁 | Unknown → `Cumulative` |
| `form_data.goal-individual_kpi-weeklyContributionTable.weeks[].week` | int | `KPIWeeklyValue.weekNumber` | ✅ | |
| `form_data.goal-individual_kpi-weeklyContributionTable.weeks[].targetValue` | number | `KPI.weeklyTargets` (Json map `{week: val}`) | 🔁 | Aggregated into a single JSON field |
| `form_data.goal-individual_kpi-weeklyContributionTable.weeks[].currentValue` | number | `KPIWeeklyValue.value` | ✅ | One row per week with `value > 0` |
| `form_data.goal-individual_kpi-weeklyContributionTable.weeks[].notes` | string | `KPIWeeklyValue.notes` | ✅ | "No notes available" → null |
| (synthetic) | — | `KPI.qtdAchieved` | 🔁 | Sum of `currentValue` across weeks |
| (synthetic) | — | `KPI.progressPercent` | 🔁 | `min(100, (qtdAchieved / target) * 100)` |
| (synthetic) | — | `KPI.healthStatus` | 🔁 | `>=80` on-track, `>=50` at-risk, else behind |
| (synthetic) | — | `KPI.status` | 🔁 | Hardcoded `active` (even for soft-deleted — `deletedAt` carries that signal) |
| `form_data.goal-individual_kpi-Metercontrol` | number (UI slider) | — | ❌ | UI state, no semantic meaning |
| `form_data.goal-individual_kpi-select-2` | "Weekly/Monthly/…" | — | ❌ | Cadence config. **KPI schema assumes weekly** → non-weekly source KPIs silently get weekly semantics. Add `KPI.cadence String?` to preserve. |
| `.weeks[].isUpdated` | bool | — | ⚠️ | Source distinguishes "entered 0" vs "never touched". We approximate: `value > 0` ⇒ row exists. Losing explicit-zero signal. |
| `_id` (envelope) | ObjectId | — | ❌ | No `KPI.legacyId`. Re-runs require full wipe. |
| `createdAt` / `updatedAt` | Date | `KPI.createdAt` / `updatedAt` | ✅ | `updatedAt` via raw SQL post-create |
| `createdBy` / `updatedBy` | ObjectId | `KPI.createdBy` / `updatedBy` | ✅ | Via `resolveUser()` chain |
| `isDeleted` | bool | `KPI.deletedAt` | ✅ | 88/512 KPIs soft-deleted |
| `notes` (top-level) | array | — | ❌ | Empty for all IndKPIs |

---

## 6. Team KPIs → `KPI` (kpiLevel="team") + `KPIWeeklyValue`

Same shape as Individual KPI but with `goal-team_kpi-*` prefix.

| Mongo field | Prisma target | Status | Notes |
|---|---|---|---|
| `goal-team_kpi-text` | `KPI.name` | ✅ | |
| `goal-team_kpi-textarea` | `KPI.description` | ✅ | |
| `goal-team_kpi-lookup` | `KPI.teamId` | 🔁 | |
| `goal-team_kpi-lookup-2` | `KPI.owner` (lead) | 🔁 | First owner in the `ownerIds[]` array |
| `goal-team_kpi-multicascadingLookup[]` | `KPI.ownerIds[]` + `KPI.ownerContributions` (Json) | 🔁 | **Equal-split contribution**: e.g. 3 owners → `{u1:34, u2:33, u3:33}`. Source has no per-owner percentage data. |
| `goal-team_kpi-lookup-4` | `KPI.year` + `KPI.quarter` | 🔁 | Quarter reference |
| `goal-team_kpi-select` | `KPI.measurementUnit` | 🔁 | |
| `goal-team_kpi-currency` | `KPI.currency` | ✅ | |
| `goal-team_kpi-text-1` | `KPI.target` + `quarterlyGoal` + `qtdGoal` | 🔁 | |
| `goal-team_kpi-radio` | `KPI.divisionType` | 🔁 | |
| `goal-team_kpi-weeklyContributionTable` | same as IndKPI | ✅ | |
| `goal-team_kpi-Metercontrol`, `goal-team_kpi-select-2` | — | ❌ | Same reasons as IndKPI |
| envelope (`createdBy`, `updatedBy`, `createdAt`, `updatedAt`, `isDeleted`) | | ✅ | Same treatment as IndKPI. 6/12 team KPIs soft-deleted. |

**Caveat on ownerContributions:** equal-split is a guess. If MoreYeahs used percentage-weighted team KPIs (e.g. owner A=60%, B=40%), that data is not in source — all team KPIs will evenly split contribution. Users can adjust post-migration via UI.

---

## 7. Priorities → `Priority` + `PriorityWeeklyStatus`

| Mongo field | Prisma target | Status | Notes |
|---|---|---|---|
| `form_data.goal-priority-text` | `Priority.name` | ✅ | |
| `form_data.goal-priority-lookup` | `Priority.teamId` | 🔁 | |
| `form_data.goal-priority-lookup-1` | `Priority.owner` | 🔁 | **Skip** if unresolvable |
| `form_data.goal-priority-lookup-2` | `Priority.year` + `Priority.quarter` | 🔁 | **Skip** if unresolvable |
| `form_data.goal-priority-text-1` | `Priority.startWeek` | 🔁 | Parsed from "Week N" string |
| `form_data.goal-priority-text-2` | `Priority.endWeek` | 🔁 | Same |
| `form_data.goal-priority-WeeksData[].week` | `PriorityWeeklyStatus.weekNumber` | ✅ | |
| `form_data.goal-priority-WeeksData[].updateStatus` | `PriorityWeeklyStatus.status` | 🔁 | Normalized: "On Track" → `on-track`, "Completed" → `completed`, "Behind" → `behind-schedule`, "Not Applicable" → `not-applicable`, else `not-yet-started` |
| `form_data.goal-priority-WeeksData[].notes` | `PriorityWeeklyStatus.notes` | ✅ | |
| (derived from last week's status) | `Priority.overallStatus` | 🔁 | Last non-empty week status wins |
| `notes` (top-level, array of `{text, createdAt, createdBy}`) | `Priority.notes` | ✅ | Flattened into formatted string: `[YYYY-MM-DD — Author Name] text`. 122/376 priorities have this. |
| envelope (`createdBy`, `updatedBy`, `createdAt`, `updatedAt`, `isDeleted`) | | ✅ | 29/376 soft-deleted |
| `_id` | — | ❌ | No legacyId |
| `DetailPageData`, `entityId`, `orgId`, `__v` | — | ❌ | |

---

## 8. WWW Items → `WWWItem`

| Mongo field | Prisma target | Status | Notes |
|---|---|---|---|
| `form_data.goal-www-lookup` | `WWWItem.who` | 🔁 | People → User.id. **Skip** if unresolvable. |
| `form_data.goal-www-textarea` | `WWWItem.what` | ✅ | |
| `form_data.goal-www-dateonly-1` | `WWWItem.when` + `originalDueDate` | 🔁 | Parsed MM/DD/YYYY. **Skip** if unparseable. |
| `form_data.goal-www-dateonly` | `WWWItem.revisedDates[]` | 🔁 | Wrapped into ISO-string array (single entry) |
| `form_data.goal-www-select` | `WWWItem.status` | 🔁 | Normalized: "Completed", "In Progress", "Behind Schedule", "Not Applicable", "Blocked", "Not Yet Started" |
| `form_data.goal-www-notestextarea` | `WWWItem.notes` (part 1) | ✅ | `notesToText()` flattens string-or-array-of-`{value,timestamp}` |
| `notes` (top-level) | `WWWItem.notes` (part 2, merged) | ✅ | Empty across all WWW records in this dump |
| envelope | | ✅ | Same treatment as Priority. 57/245 soft-deleted. |

---

## 9. Platform-wide envelope fields — consistent treatment

Every Mongo business doc has these. Treatment applies uniformly across Team / KPI / Priority / WWW.

| Mongo field | Prisma target | Status |
|---|---|---|
| `_id` | — | ❌ No `legacyId` columns |
| `createdAt` | `<model>.createdAt` | ✅ Passed in `data` (overrides Prisma default) |
| `updatedAt` | `<model>.updatedAt` | ✅ Raw SQL `UPDATE` post-create |
| `createdBy` | `<model>.createdBy` | ✅ `resolveUser()` — LCNC → People → Ashwin |
| `updatedBy` | `<model>.updatedBy` | ✅ Same (Team has no column → skipped) |
| `isDeleted: true` | `<model>.deletedAt = updatedAt` | ✅ |
| `notes` (top-level) | `<model>.notes` | ✅ on Priority/WWW; ❌ on Team/KPI (models have no `notes` column used) |
| `DetailPageData` | — | ❌ UI layout state |
| `entityId`, `orgId`, `__v` | — | ❌ Platform bookkeeping |

---

## 10. Authorship resolution chain

`resolveUser(mongoObjectId)` tries three routes in order:

1. **LCNC login-user lookup** (`lcncUserById: ObjectId → email`) — 76 entries scoped to MoreYeahs org + global super-admins
2. **Business People lookup** (`peopleById: ObjectId → email`) — 83 entries
3. **Fallback** → ashwin@moreyeahs.com (SYSTEM_USER_ID)

### Result (current migration run):

| Module | Distinct authors | Fallback-to-Ashwin |
|---|---|---|
| KPI | 21 | 6 / 512 (1.2%) |
| Priority | 10 | 1 / 376 (0.3%) |
| WWW | 7 | 6 / 245 (2.4%) |

**Residual fallback reasons:**
- Records authored by LCNC users outside MoreYeahs org (cross-org admins, deleted LCNC accounts)
- Records authored by LCNC users never synced into the `users` collection (edge case)

---

## 11. Not migrated (explicit scope-out)

The following LCNC collections are in the dump but **not migrated** — no QuikScale equivalent or out of scope for this migration:

| LCNC collection | Reason |
|---|---|
| `auditlogs` | QuikScale has its own audit trail (ChangeLog) starting at migration time |
| `login_activity` | Security/analytics; not business data |
| `approutes`, `pages`, `pagedashboardfields`, `app_forms`, `apps`, `appversions`, `app_repository` | LCNC platform schema/UI — not relevant to QuikScale (which has its own UI) |
| `automations`, `CustomApis`, `integration_catalog` | LCNC runtime config |
| `orgmodules`, `organisations` | Replaced by QuikScale `Tenant` + feature-gate system |
| `savedviews` | UI preferences; QuikScale has its own TablePreference |
| `uploaded_opsp_documents` | Document attachments — **would need separate file-migration strategy** (S3/R2/etc.). Flagged for future. |
| `support_tickets` | No QuikScale ticketing module |
| `account_details`, `user_preferences` | Platform user settings |
| `otp`, `entities` | Platform internals |

---

## 12. Assumptions

1. **All users log in with `password123`** — users must change post-migration. Enforced only in script; no forced-rotation flow in QuikScale yet.
2. **Fiscal year starts April 1** — hardcoded. If MoreYeahs uses a different FY start, all quarter/year derivations are wrong.
3. **Equal-split team KPI contributions** — source has no weighting; UI must allow adjustment.
4. **Status normalization is sufficient** — unmatched status strings (e.g. misspellings) default to `not-yet-started`. May hide data-quality issues.
5. **LCNC `users` dump reflects current state** — if source was taken at a different time than business-entity dump, there could be drift (user deleted after record creation, etc.). Residual 1–2% fallback likely covers this.
6. **`isDeleted:true` means user intentionally deleted** — we preserve soft-delete. If LCNC used `isDeleted` as a staging flag, we'd be hiding records users expect to see.
7. **KPI `target` = `quarterlyGoal` = `qtdGoal`** — source has one target field. QuikScale has three. We mirror into all three; if the product later treats them differently (e.g. YTD vs QTD goals), this migration over-constrains.

---

## 13. Caveats / risks flagged

### Data loss
- **`User.phone` dropped** — 83 people, phone lost for all. Low impact unless SMS/WhatsApp alerts are planned.
- **Week boundaries from `weeks[]`** — lost. If any quarter had non-7-day weeks, computed weeks will disagree with source.
- **Explicit-zero KPI entries** — lost. "Week 5: 0 (intentional)" becomes "Week 5: never updated".
- **LCNC roles / super-admin status** — lost. Only `ashwin@moreyeahs` is super-admin in QuikScale; all others are `member`.

### Reliability / re-runnability
- **No `legacyId` columns** → re-runs require full wipe (script does this; data loss on re-run is intentional).
- **Prisma `@updatedAt`** forces `now()` on insert; `updatedAt` preserved via raw SQL. Each record is 1 extra query. For ~1,200 records, negligible.

### Authorship
- **2 soft-deleted People imported as active** — `User` has no `deletedAt` column. These accounts can still log in. Fix requires schema addition or manual deactivation of their `Membership.status`.
- **Residual ~1% Ashwin fallback** — records authored by cross-org LCNC users. Can manually fix via DB query after migration if authorship for specific records matters.

### Product semantics
- **Team KPI equal-split** may not match original intent.
- **KPI cadence** assumed weekly. Monthly KPIs in source silently converted.
- **Quarter status** now preserved (`upcoming | active | completed`) but QuikScale UI doesn't currently gate edits by status — write-lock on completed quarters needs feature work.

---

## 14. Future work (if migrating more orgs)

Recommended schema additions to make future LCNC migrations cleaner:

| Addition | Value | Effort |
|---|---|---|
| `User.phone String?` | Preserve contact info | 1 line + re-push |
| `User.deletedAt DateTime?` | Soft-delete parity | 1 line |
| `User.legacyId String? @unique` | Idempotent re-runs | 1 line |
| `Team.legacyId`, `KPI.legacyId`, `Priority.legacyId`, `WWWItem.legacyId` | Same | 4 lines |
| `KPI.cadence String?` (weekly/monthly) | Non-weekly KPIs | 1 line + update flow |
| `KPIWeeklyValue.wasExplicitlyEntered Bool?` | Distinguish "0 entered" from "skipped" | 1 line + UI tweak |
| `User.phone`, multi-lang support | Feature work | — |

---

**Generated:** 2026-04-22
**Generator:** Claude (this session)
**Script maintainer:** ashwin@moreyeahs.com
