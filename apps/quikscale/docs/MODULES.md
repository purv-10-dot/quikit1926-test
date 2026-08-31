# QuikScale — Module & Feature Inventory

A complete, code-level inventory of every module in QuikScale: what each one does, the features inside it, the user workflows, and the cross-module dependencies. Not a marketing document — extracted from the codebase as of `main`.

**Audience**: internal teams (engineering, product, support, contractors). Customers see polished marketing pages, not this.

---

## Quick map

QuikScale ships **8 fully-implemented modules** (with UI + API) and **4 placeholders** (UI stub only — slated for later phases). Modules are ordered below by user-facing prominence.

| # | Module | Status | UI pages | API routes | Use in one line |
|---|---|---|---:|---:|---|
| 1 | [Dashboard](#1-dashboard) | ✅ shipped | 1 | 1 | Consolidated KPI / Priority / WWW overview with traffic-light status |
| 2 | [KPI](#2-kpi) | ✅ shipped | 2 | 13 | Track weekly KPI values + targets, individual + team rollups |
| 3 | [OPSP](#3-opsp) | ✅ shipped | 4 | 11 | One-Page Strategic Plan with finalize → review cascade |
| 4 | [Priority](#4-priority) | ✅ shipped | 1 | 9 | Quarterly priorities with week-by-week status |
| 5 | [WWW](#5-www) | ✅ shipped | 1 | 7 | Who-What-When commitments with revision history |
| 6 | [Client Meetings (Meeting Rhythm)](#6-client-meetings) | ✅ shipped | 5 | 32 | Daily huddle + weekly meeting tracking with 6-month performance grid |
| 7 | [Performance](#7-performance) | ✅ shipped | 13 | 25 | Reviews, goals, feedback, talent assessments, one-on-ones |
| 8 | [Settings](#8-settings) | ✅ shipped | 1 | 8 | User profile, company branding, feature flags |
| 9 | [Org Setup](#9-org-setup) | 🚧 placeholder (Phase 7) | 1 | 0 | Accountability structure (planned) |
| 10 | [OPPP](#10-oppp) | 🚧 placeholder (Phase 8) | 1 | 0 | Personal plans aligned to OPSPs (planned) |
| 11 | [Habits](#11-habits) | 🚧 placeholder (Phase 9) | 1 | 0 | Rockefeller Habits framework (planned) |
| 12 | [Cash](#12-cash) | 🚧 placeholder (Phase 10) | 1 | 0 | Cash flow + financial KPI module (planned) |

**Methodology**: QuikScale implements the **Scaling Up** framework (Verne Harnish): OPSP, Rocks, BHAG, Brand Promise, Critical #, Quarterly Priorities, etc. Module names and concepts trace directly to that vocabulary.

---

## 1. Dashboard

### What it is
The single landing page after sign-in. Aggregates the user's KPIs, Priorities, and WWW items into one view with a fiscal-period picker and traffic-light status indicators. Two perspectives: **Individual** (your own work) and **Team** (filterable rollup).

### Routes
- `GET /dashboard` — main consolidated view

### Features
- **Dual-perspective tabs** — Individual (self) and Team (selectable team with member filter)
- **Collapsible KPI overview card grid** with summary pill (avg %, on-track count, at-risk count, behind count)
- **Weekly traffic-light cells** across all 13 weeks of the quarter — colors driven by % of target (blue ≥120, green ≥100, yellow ≥80, red <80)
- **Frozen columns** support — sticky left columns with persisted user preference
- **Fiscal period navigation** — year/quarter picker; selection persists across modules via shared `FilterContext`
- **Pagination** — 10 rows per page on dashboard tables
- **Tooltips** on weekly cells (value/target/notes) and note cells (full text on hover)
- **Role-based filters** — admins see Team + Owner filters; non-admins see only their own data
- **One-call API** — `/api/dashboard/summary` returns KPI + Priority + WWW + users + teams in a single request

### How it works
User lands on `/dashboard` after login. They see their KPIs as a card grid; clicking a card expands the full table view. They can switch to Team tab to see team-level rollups, or use the year/quarter picker to navigate to a different period. The fiscal period choice persists as they navigate to other modules.

### Data models
- `KPI`, `KPIWeeklyValue` (per-week values)
- `Priority`, `PriorityWeeklyStatus`
- `WWWItem` (Who-What-When)
- `Team`, `User`, `QuarterSetting` (for fiscal week math)

### Permissions
- **Admins**: see everything; full Team + Owner filters
- **Non-admins**: see only their own data; Team tab defaults to their first team

### Cross-module dependencies
- Imports `KPITable`, `PriorityTable`, `WWWTable` components from their own modules
- Shares `FilterContext` (year, quarter, filterTeam, filterOwner) with KPI / Priority / WWW

### Notable UI behavior
- Sticky header with fiscal period picker + trash toggle
- Custom fixed-position tooltips (not browser native) for week cells
- Frozen columns use sticky positioning + z-index layering for proper stacking against scrolling cells
- KPI overview has both expanded card-grid view and collapsed pill-summary view

---

## 2. KPI

### What it is
A locked-style table for managing weekly Key Performance Indicators. Two flavors: **Individual KPIs** (one owner) and **Team KPIs** (multiple contributors with allocated %). Weekly cells use a traffic-light color system that's intentionally NOT theme-able — it represents semantic state, not brand.

### Routes
- `GET /kpi` — Individual KPI table
- `GET /kpi/teams` — Team KPI rollup with per-contributor breakdown

### Features
- **Individual KPI table** with locked row styling (semantic colors only)
- **Team KPIs** with multi-owner contribution % allocation (sum must = 100%) and per-owner weekly targets
- **Weekly traffic-light cells**: blue ≥120% achieved, green ≥100%, yellow ≥80%, red <80% + updated, gray = no data
- **Frozen column** support up to user's last selection (persisted in `User.kpiFrozenCol`)
- **Hidden column management** (persisted in `User.kpiHiddenCols`; shared with Dashboard)
- **Bulk delete** with row checkboxes + soft-delete trash view
- **Add/Edit modal** capturing year, quarter, owner, target, measurement unit, division type (Cumulative/Incremental)
- **Search, sort, paginate** (default 50 rows/page)
- **XLSX export** with configurable columns and scope (page / filtered / all)
- **KPI cascade** — parent KPI → child KPIs for team drill-down
- **Status filter**: Active / Paused / Completed
- **Reverse-color flag** for KPIs where lower numbers are better (e.g., Defect Count)

### How it works
A user creates a KPI with a quarterly goal. The system divides the goal across 13 weekly targets automatically. Each week, the user logs an actual value in the corresponding cell — the cell color updates immediately based on % of target. Frozen columns let them keep the KPI name visible while scrolling through 13 weeks. They can export the full table to Excel for reporting.

### Data models
- `KPI` (kpiLevel: "individual" | "team", quarterlyGoal, weeklyTargets, reverseColor, status, healthStatus, …)
- `KPIWeeklyValue` (weekNumber, value, notes — per user per week)
- `KPINote` (free-form notes on a KPI)
- `KPILog` (audit trail: action, oldValue, newValue, changedBy)

### Permissions
- **Admins**: full CRUD on all KPIs
- **Team heads**: CRUD on their team's KPIs
- **Individual owners**: edit their own values + notes only (not metadata like target)
- **Viewers**: read-only

### Cross-module dependencies
- Feeds `Dashboard`'s traffic-light overview
- Referenced by OPSP's "KPI Accountability" section
- Weekly targets cascade into OPSP's `actionsQtr` for quarterly action planning
- KPI health may be referenced from Performance scorecards

### Notable UI behavior
- **Locked table cells** — fixed blue/gray/semantic colors; never themed
- **Lock icon** at the column-freeze boundary (visual cue for sticky boundary)
- **Auto-computed weekly goal** (quarterlyGoal ÷ 13) shown in tooltip
- **Trash pill** (amber badge) when in trash view; click to exit
- **Hidden cols pill** showing hidden column count; click to restore one or all

---

## 3. OPSP

### What it is
**One-Page Strategic Plan** — the most complex module in QuikScale. A multi-section form that captures the org's strategy across People, Process, Targets (3-5 yr), Goals (1 yr), and Quarterly Actions. Has a finalize → review workflow that locks the form once submitted, then opens the next quarter only after the prior quarter's review is submitted.

### Routes
- `GET /opsp` — main form (with 8 modal-driven detail sections)
- `GET /opsp/review` — review submission (per owner / per period)
- `GET /opsp/history` — historical OPSP documents by year
- `GET /opsp/categories` — category master list (driving Targets/Goals dropdowns)

### Features
- **Setup wizard** gates first-time access — 3-yr or 5-yr planning horizon, fiscal year start, etc.
- **Multi-section form**:
  - PEOPLE: Employees / Customers / Shareholders (3-bullet lists each)
  - PROCESS: Make/Buy / Sell / Record-Keeping
  - 8 modal-driven detail sections: Targets, Goals, Actions, Rocks, Key Thrusts, Key Initiatives, KPI Accountability, Quarterly Priorities
- **Finalize → read-only** workflow with confirmation dialog
- **Auto-cascade**: targetRows → goalRows (split by quarter) → actionsQtr (split by month/owner)
- **Pre-finalize validation** — projected sums must equal breakdown sums; all rocks/initiatives must have owners; character limits enforced (descriptions 70-800 chars depending on field)
- **Owner-missing hint** — inline `(N missing owner)` warning beside section subtitles
- **PDF / Word export** rendering 3-page document with org name, signed-in user, blue-band headers
- **Year / quarter picker** with quarters locked until prior quarter's review is submitted
- **Auto-save with debounce** — save indicator badge shows Saving / Saved / Save failed
- **Rich-text editor** (bold/italic/lists) on Objectives, Strengths, Weaknesses, Trends fields
- **Character counter** at bottom-right of each text field; turns red when over limit
- **Tooltip on Profit per X** — view full value when truncated
- **Submit Review** button on `/opsp/review` enables only when every Action's Achieved is filled and every Rock's Status is set; clicking it locks the OPSP as `reviewed` and unlocks Q+1 in the launcher

### How it works
First-time user opens `/opsp` → setup wizard kicks in. They define a 3 or 5 year plan starting from a fiscal quarter. They fill PEOPLE bullet lists, then expand the Targets modal to add 3-year targets (revenue, growth, etc.) with per-year breakdowns. The system cascades Targets into Goals (quarterly splits) and Goals into Actions (monthly splits per owner). They fill PROCESS sections, define Rocks (5 quarterly priorities), Key Thrusts, etc. They click Finalize → form locks. Later they go to `/opsp/review`, fill in achieved values per period, click Submit. OPSP locks as reviewed; Q+1 unlocks. Cycle repeats.

### Data models
- `OPSPData` (one row per user per (year, quarter); status: draft | finalized | reviewed; targetRows / goalRows / actionsQtr / keyThrusts / keyInitiatives / kpiAccountability / quarterlyPriorities all stored as JSON arrays)
- `OPSPReviewEntry` (per cell of review submission: opspId, horizon, rowIndex, period, targetValue, achievedValue, comment)
- `CategoryMaster` (name, dataType: Number | Percentage | Currency, currency)
- `OPSPDocument` (legacy, kept for backward compat — newer OPSPs use OPSPData)

### Permissions
- **Admins**: can finalize anyone's OPSP
- **User**: can edit/finalize their own OPSP
- **Reviewer (admin/manager)**: view + submit reviews on finalized OPSPs

### Cross-module dependencies
- **Quarter unlock**: review submission flips `OPSPData.status` to `reviewed` and unlocks the next quarter in the launcher's quarter picker (data exposed via `/api/opsp/config`'s `reviewedQuarters[]`)
- **Cascade into Performance.Goal**: planned in later phase
- **Cascade into Priority**: Quarterly Priorities section is intended to seed Priority module rows
- **Categories shared with KPI** — both pull from `CategoryMaster`

### Notable UI behavior
- **Sticky header** with year/quarter picker + Finalize button + Preview button + save badge
- **8 modal forms** for detail sections — each with full CRUD on sub-tables
- **Finalize confirmation dialog** with "cannot be undone" warning + green Finalized banner after
- **Validation toast** (top-right, max-height scrollable) showing all errors grouped by section
- **Setup wizard overlay** — full-screen modal gating first access
- **Locked Q1 cell after review** — when next-quarter form opens, prior quarter's column shows `45 / 50` style locked display (achieved / projected) with the gap rolled into the next period (proposed; partial implementation)
- **Year picker disables quarters** locked by review gate

---

## 4. Priority

### What it is
A locked-style table for tracking 3–5 quarterly execution priorities. Each priority has a start week and end week within the quarter. Weekly cells in the priority's window show a status; cells outside the window show an `X` (not applicable).

### Routes
- `GET /priority` — main table

### Features
- **Locked table** with semantic color status badges:
  - 🔵 Blue — Completed
  - 🟢 Green — On-Track
  - 🟡 Yellow — Behind-Schedule
  - 🔴 Red — Not-Yet-Started
  - ⚫ Gray — Not-Applicable
- **Week-by-week status tracking** within `[startWeek, endWeek]`; cells outside that range render as inactive
- **Start/End week pickers** in add/edit modal
- **Frozen columns** (sticky name column) with persisted preference
- **Hidden column management** (persisted in `User.priorityHiddenCols`)
- **Bulk delete** with selection + trash toggle
- **Search and filter** (name, owner, team, status)
- **Pagination** (configurable, default 50)
- **XLSX export** with selectable columns
- **Read-only mode** when shown on dashboard

### How it works
User opens `/priority`, clicks Add Priority, defines a quarterly priority ("Launch Q2 Product") with `startWeek=1, endWeek=13`. Each week, they update the cell to On-Track / Behind / Completed. The cells outside their priority window are visually inert. At quarter-end they export the final status report.

### Data models
- `Priority` (owner, teamId, quarter, year, startWeek, endWeek, overallStatus, notes)
- `PriorityWeeklyStatus` (priorityId, weekNumber, status, notes)

### Permissions
- **Admins**: full CRUD
- **Team heads**: CRUD on their team's priorities
- **Owners**: edit own status + notes
- **Viewers**: read-only

### Cross-module dependencies
- Appears on Dashboard's Priority table
- May be referenced from Client Meetings (weekly meeting checklist)
- Linked from WWW (`WWWItem.linkedPriorityId`)
- Quarterly Priorities section in OPSP cascades into Priority rows (planned)

### Notable UI behavior
- **Locked table** — fixed colors, no theme overrides
- **Status legend** in header
- **X markers** outside the priority's [start, end] week range
- **Sticky header** with item count + bulk delete

---

## 5. WWW

### What it is
**Who-What-When** — a commitment-tracking table. Each row has an owner ("Who"), a description ("What"), and a due date ("When"), plus status. Tracks revision history when due dates change.

### Routes
- `GET /www` — main table

### Features
- **Locked table** with same semantic status palette as Priority
- **Inline status editing** via dropdown in each row
- **Who picker** (user selection) with team filtering
- **When date picker** (required)
- **What** description + searchable Notes field
- **Revision tracking** — revised dates stored as array; latest shown in "Revised Date" column
- **Revision log** — separate audit trail per item: oldDueDate, newDueDate, reason, changedBy, createdAt
- **Category tagging** via CategoryMaster
- **Frozen "Who" column** (persisted)
- **Hidden column management** (persisted in `User.wwwHiddenCols`)
- **Bulk delete** with selection
- **Add panel** (slide-out modal) with form validation
- **Search** across What + Notes
- **Filter** by team / owner / status
- **Pagination** (configurable; 10 rows on dashboard)
- **XLSX export**
- **Trash toggle** to view + restore deleted items

### How it works
User clicks "Add WWW", fills in: Who = John, What = "Prepare Q2 budget", When = May 15. Status = Not Yet Started. As John progresses, status updates to On-Track. If the deadline shifts to May 22, the original date is preserved and a revision log entry is recorded. At due date, status flips to Completed or Behind-Schedule.

### Data models
- `WWWItem` (who, what, when, status, category, linkedKPIId, linkedPriorityId, originalDueDate, revisedDates[], notes, …)
- `WWWRevisionLog` (oldDueDate, newDueDate, reason, changedBy, createdAt)

### Permissions
- **Admins**: full CRUD
- **Team leads**: CRUD on their team's WWW items
- **Owners (Who)**: update their own status + notes
- **Viewers**: read-only

### Cross-module dependencies
- Appears on Dashboard (Individual tab only)
- Optional links: `linkedKPIId` (audit trail) and `linkedPriorityId` (sub-task tracking)
- Categories shared with KPI / OPSP via CategoryMaster

### Notable UI behavior
- **Status badge click** opens inline dropdown
- **Who cell click** opens user picker modal
- **Revised date link** opens revision log drawer
- **Notes hover** shows tooltip with full text
- **Slide-out Add panel** with validation

---

## 6. Client Meetings

### What it is
**Meeting Rhythm** module — tracks daily huddles and weekly meetings per client. Generates a 6-month rolling performance grid (calls happened, punctuality, format adherence, etc.) and exports compliance reports per member. The largest module by API count (32 endpoints).

### Routes
- `GET /client-meetings` — main dashboard with client picker, mode toggle, performance grid, member punch-in tab
- Plus 4 sub-pages for client management, member management, weekly drill-down, and exports

### Features
- **Client selector** dropdown (active clients only)
- **Daily vs. Weekly mode toggle** — different metrics per mode
- **6-month rolling performance grid** with color cells:
  - 🔵 ≥98% (excellent)
  - 🟢 ≥90% (good)
  - 🟡 ≥80% (needs improvement)
  - 🔴 <80% (critical)
  - ⚫ no data
- **Daily metrics** (6 KPIs): Calls Happened, Punctuality, Duration Adherence, Format Followed, Attendance, Stucks Called Out
- **Weekly metrics** (9 KPIs): Calls Happened, Punctuality, Duration, Dashboard Quality, KP Achievement Gaps, WWW Review, Employee Feedback, Collective Intelligence, Attendance
- **Tenant-wide overall stats** showing averages across all clients per metric
- **Member punch-in tab** (weekly mode) — drill into individual member compliance week by week
- **Excel export** in 3 variants — Daily report, Weekly report, Member punch-in report
- **Total Calls Assessed** chip showing data-entry count
- **Roster picker** for multi-select member view in punch-in
- **Soft-delete + restore** for clients, members, huddles, weekly meetings
- **Audit logs** per row (full CREATE/UPDATE/DELETE history)

### How it works
Account manager opens `/client-meetings`, selects "ABC Foods". They choose Daily mode → see how many huddles were held this month, punctuality rate, format adherence rate. The 6-month grid shows trends over time. They switch to Weekly mode for deeper meeting quality metrics. They click the Punch-in tab to see member-by-member contribution on the current week. They export the weekly report to share with the client.

### Data models
- `Client` (name, weeklyStartTime, weeklyEndTime, dailyStartTime, dailyEndTime)
- `ClientDailyHuddle` (clientId, meetingDate, callStatus, format adherence flags, etc.)
- `ClientWeeklyMeeting` (clientId, meetingDate, all 9 quality scores)
- `ClientWeeklyMemberScore` (per-member per-week punch-in detail)
- `ClientDailyHuddleAbsence` / `ClientWeeklyMeetingAbsence`
- `ClientMember` (external team member roster — not platform users)
- `ClientMembership` (which platform user is assigned to which client + their client role)

### Permissions
- **Admins**: full CRUD on all clients, huddles, meetings
- **Account managers**: edit own clients + record huddles
- **Assigned team members**: log own attendance + scores
- **Viewers**: read-only dashboard

### Cross-module dependencies
- Member punch-in references KPI / Priority / WWW discussion depth (cross-module quality tracking)
- Absence tracking correlates with Performance one-on-one cadence (planned)

### Notable UI behavior
- **6-month scrollable color grid** with month + day-of-week headers
- **Mode toggle** flips entire dashboard layout + metric set
- **Performance color legend** in header
- **Punch-in table** with members as rows, weeks as columns, numeric/AB/NA cells
- **Export modal** with date range + month/year picker + member multi-select

---

## 7. Performance

### What it is
The largest module by page count (13 pages). A full performance management suite covering scorecards, peer reviews, goal tracking, one-on-ones, feedback, and talent assessment.

### Routes
- `GET /performance` (or `/performance/scorecard`) — individual scorecard
- `GET /performance/reviews` — reviews given + received
- `GET /performance/goals` — goal table
- `GET /performance/feedback` — feedback inbox
- `GET /performance/individual` — individual employee view (admin: all; users: self)
- `GET /performance/individual/[userId]` — drill-down on one employee
- `GET /performance/one-on-one` — one-on-one schedule + notes
- `GET /performance/teams` — team-level overview
- `GET /performance/talent` — 9-box talent matrix
- `GET /performance/trends` — analytics dashboard
- Plus 3 nested admin/setup pages

### Features
- **Performance Cycle** (annual / bi-annual / quarterly) with defined periods + review gates
- **Scorecard** — KPI achievement, goal progress, feedback summary, peer review scores in one view
- **Goal CRUD** with owner / reviewer / contributors, target value, achieved value, health status, completion tracking
- **Peer review flow** — manager → self → peers → direct reports, weighted scoring, structured + open comments
- **Feedback modal** (quick entry) with sentiment (positive / constructive / neutral), category tag, optional anonymous flag
- **Feedback inbox** with filters (all / positive / constructive / anonymous) + unread badge
- **One-on-one** scheduling with agenda, notes, follow-up items, attendance tracking
- **9-box talent matrix** — performance × potential, drag-to-reposition employees
- **Skill inventory** — auto-suggested from peer review comments + manual add/remove
- **Goal cascade** from organizational OKRs → team goals → individual goals
- **Cycle status progress** — % reviews submitted, % goals set, % feedback given
- **Export** team performance reports (goal summary, review scores, feedback trends)

### How it works
Manager opens Performance → Teams to see aggregate progress. They drill into an individual (Scorecard) showing KPIs, goals, feedback. During the annual review cycle, they fill the peer review form and route it to the direct report + peers. Once the cycle closes, scores are aggregated. They set next year's goals (linked to OKRs), schedule one-on-ones, and use the talent matrix for succession planning.

### Data models
- `PerformanceCycle` (name, year, status, startDate, endDate, reviewerGroups)
- `PerformanceReview` (reviewerId, revieweeId, cycleId, type: manager | peer | self | direct-report, scores, comments)
- `Goal` (ownerId, reviewerId, year, quarter, targetValue, achievedValue, healthStatus, completionDate)
- `OneOnOne` (managerId, reportId, scheduledDate, agenda, notes, attendees)
- `FeedbackEntry` (fromUserId, toUserId, sentiment, category, comment, isAnonymous)
- `TalentAssessment` (assessedUserId, assessorUserId, performanceRating, potentialRating, skills, notes)

### Permissions
- **Admins**: view all reviews / goals / feedback; manage cycles
- **Managers**: create + submit reviews for direct reports; view team dashboard + individuals; schedule one-on-ones
- **ICs**: complete self-reviews; view own data; participate in peer reviews when invited
- **Cycle gate**: reviews only available during active cycle

### Cross-module dependencies
- **Goals** cascade from OPSP's `goalRows` (planned)
- **Scorecard** pulls KPI progress from KPI module
- **One-on-ones** may reference Priority / Goal items in agenda
- **Feedback** sentiment auto-suggests skills for talent matrix

### Notable UI behavior
- **9-box talent matrix** with drag-to-move cards
- **Multi-step review form** with branching by reviewer type
- **Score aggregation** — peer score = avg of N peers + manager weighted
- **Anonymous feedback toggle** hides sender name
- **Cycle progress bar** showing % completion per gate
- **Review PDF export** with summary scorecard

---

## 8. Settings

### What it is
Configuration hub with three tabs: User Profile, Company branding, and admin Feature Flags.

### Routes
- `GET /settings` — redirects to `/settings/profile`
- `GET /settings/profile` — user profile (name, email, avatar, country, timezone, theme, accent)
- `GET /settings/company` — company branding (logo, accent, fiscal year config)
- `GET /settings/configurations` — admin-only feature flags

### Features
- **Profile tab**:
  - Name, email, avatar (upload or pick from defaults)
  - Country + timezone dropdown (12 countries supported)
  - Bio text area
  - Theme mode toggle (Light / Dark / Auto)
  - Accent color picker (10 presets: Blue, Purple, Amber, Green, Orange, Indigo, Slate, Emerald, Teal, Cyan; or custom hex)
- **Company tab** (admin-only edit):
  - Company name (read-only)
  - Logo upload
  - Brand accent + theme
  - Fiscal year start month
  - Quarter start month
- **Configurations tab** (admin-only):
  - Feature flag toggles per module
  - Experimental feature toggles
  - Per-flag value input (strings, e.g., API keys)
  - Real-time effect (no page reload)

### How it works
User opens Profile, picks a teal accent → UI updates immediately via the `ThemeApplier` component. Admin opens Configurations, toggles "Performance" off → that module's pages become "coming soon" stubs for everyone in the tenant.

### Data models
- `User` (firstName, lastName, avatar, country, timezone, bio, themeMode, accentColor)
- `Tenant` (brandColor, logoUrl, fiscalYearStart, quarterStartMonth)
- `FeatureFlag` (tenantId, key, enabled, value)

### Permissions
- **All users**: edit own profile
- **Admins**: edit company branding + feature flags

### Cross-module dependencies
- **Theme changes** propagate to all modules via `ThemeApplier` (CSS variables)
- **Feature flags** gate module route access (disabled modules show "coming soon" stubs)
- **Accent color changes** update all `accent-*` styled elements live
- **Timezone setting** drives `useCurrentWeek` for fiscal week calculations

---

## 9. Org Setup

🚧 **Placeholder — Phase 7**. Single 15-line page reading "Coming in Phase 7". No API routes. Will eventually provide org structure / accountability function definitions.

## 10. OPPP

🚧 **Placeholder — Phase 8**. Single 13-line page reading "Coming in Phase 8". Stands for "Organizational Purpose & Personal Plan" — will let individuals create personal strategic plans aligned with the org OPSP.

## 11. Habits

🚧 **Placeholder — Phase 9**. Single 13-line page reading "Coming in Phase 9". Will implement the Rockefeller Habits framework (daily standup, weekly cadence, etc.).

## 12. Cash

🚧 **Placeholder — Phase 10**. Single 13-line page reading "Coming in Phase 10". Cash-flow + financial KPI module.

---

## Cross-module architecture

### Shared infrastructure

- **`FilterContext`** — `year`, `quarter`, `filterTeam`, `filterOwner` persisted across KPI / Priority / WWW / Dashboard. One change updates all of them.
- **Table preferences** — per-module hidden columns + sort order + frozen column position, persisted on `User`.
- **Fiscal utilities** — `useCurrentWeek`, `useWeekDateRange`, `useWeekLabels` hooks all respect `QuarterSetting` from the DB (not hardcoded calendar weeks).
- **Permission helpers** — `getTenantId()`, `requireAdmin()`, plus per-domain `canEditKPI()`, `canEditPriority()` etc. in `apps/quikscale/lib/api/`.
- **`ThemeApplier`** — CSS variable injection for accent color, fed from `User.accentColor` and `Tenant.brandColor`.
- **Export infrastructure** — `runExport()` XLSX generator with column customization + scope (page / filtered / all).
- **Audit logging** — every mutation writes to `AuditLog` via `writeAuditLog()`, scoped by `tenantId` + `actorId`.

### Data cascade flows

| From | To | Direction |
|---|---|---|
| OPSP `targetRows` | OPSP `goalRows` | auto (yearly → quarterly split) |
| OPSP `goalRows` | OPSP `actionsQtr` | auto (quarterly → monthly per owner) |
| OPSP `quarterlyPriorities` | Priority module rows | planned |
| OPSP `goalRows` | Performance `Goal` records | planned |
| KPI weekly values | Dashboard traffic-light overview | live |
| Priority + WWW data | Dashboard tables | live |
| Performance.Goal achievement | KPI weekly progress | reference |

### API response shape (every module)

```json
{ "success": true,  "data":  /* model or array */ }
{ "success": false, "error": "string message" }
```

Documented in full at [`apps/quikscale/docs/API_CONTRACT.md`](./API_CONTRACT.md).

### Role hierarchy used across all modules

```
super_admin   (cross-tenant — admin app only)
admin         (full tenant access)
executive     (org-wide; can manage anything within a tenant)
manager       (team-scoped CRUD)
employee      (self-scoped CRUD)
coach         (read-only / advisory)
```

Defined in `@quikit/shared`'s `ROLES` + `ROLE_HIERARCHY` constants.

### Fiscal calendar

QuikScale uses a tenant-configurable fiscal year (default starts April for Indian tenants). All "week N of quarter Q" math is computed from `QuarterSetting.startDate` + 7-day windows, NOT from calendar weeks. The 13-week quarter is sacred: anything that says "weekly" really means "1 of 13 within the quarter."

---

## Notes on this document

- **Generated**: 2026-04-29 from `apps/quikscale/app/(dashboard)/` and `apps/quikscale/app/api/` source.
- **Audience**: internal teams. Customer-facing language would soften the implementation details and skip the phase-numbered placeholders.
- **Maintenance**: regenerate after major module additions. The patterns are: a module is a folder under `app/(dashboard)/`, has `page.tsx` files, and matches an `app/api/<module>/` folder.
- **Companion docs**:
  - [`API_CONTRACT.md`](./API_CONTRACT.md) — the full contract: every endpoint's auth gate, permission, query params, request schema and response bodies. Generated by `npm run docs:api`; prose lives in [`api-contract-preamble.md`](./api-contract-preamble.md).
  - Root `/CLAUDE.md` — codebase conventions
  - `/docs/05-frontend-patterns.md` — how the UI is built
