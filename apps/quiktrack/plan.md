# QuikTrack — New Jira-Clone App (`apps/quiktrack`)

## Context

The user wants a brand-new Next.js app `apps/quiktrack` inside the QuikIT monorepo (`c:\Users\user\Desktop\Quikit Revamp\quikit`). It is a Jira clone covering 12 modules (For You dashboard, Spaces, Project Summary, Backlog, Kanban, Work Item Drawer, Epics, Task Table, Timeline, Pages, Timesheet, Reports, Notifications). Specs come from PDFs in `C:\Users\user\Downloads\PMS_DOC_FOR_CLAUD` (no screenshots in that folder — see Open Questions).

The app must follow root `quikit/CLAUDE.md` standards and the `apps/_template/` scaffolding pattern, reuse existing shared packages only (`@quikit/auth`, `@quikit/database`, `@quikit/shared`, `@quikit/ui`), live on its own Postgres schema (`app_quiktrack`) via Prisma multi-schema, and ship with full tests (401 / cross-tenant / happy-path) per CLAUDE.md.

This is a multi-week build. The plan organizes it into 6 incremental phases so each phase is independently runnable, typecheck-clean, and lint-clean before the next begins.

---

## Pre-Flight Findings (from exploration)

**Free port:** 3006 (admin=3005, quikconstruction=3007, quikvc=3008 already taken)
**Existing schemas:** `public, app_quikscale, app_quikconstruction, app_quikvc` → add `app_quiktrack`.
**Template:** `apps/_template/` is the canonical scaffold — clone wholesale, then rename.
**No "quiktrack" stubs anywhere in repo.**
**No screenshots in PDF folder** — only `.pdf` specs. Visual fidelity must come from the PDFs and any references the user pastes inline; otherwise we follow Jira-like conventions plus QuikIT design tokens.

**Key shared exports already verified:**
- Auth: `createMiddleware`, `withTenantAuthForModule`, `createGetTenantId`, `createRequireAdmin`, `SessionGuard`
- DB: `db` (soft-delete-aware Prisma client) from `@quikit/database`
- Shared: `parsePaginationParams`, `paginationToSkipTake`, `buildPaginationResponse`, `rateLimitAsync`
- UI: Button/Input/Card/Badge/Avatar/Modal, `ThemeApplier`, `cn()`, `@quikit/ui/tailwind-config`

---

## Module → Spec → Endpoint → Screen Matrix (source of truth)

| Module | Spec PDFs | Primary route | Key endpoints |
|---|---|---|---|
| For You dashboard | `for_you_dashboard_spec.pdf` | `/dashboard` | `GET /api/dashboard/for-you` |
| Spaces (project list) | `spaces_module_spec.pdf` | `/spaces` | `GET/POST /api/projects` |
| Create Space | `create_space_module_spec_updated.pdf` | `/spaces/new` | `POST /api/projects` (unique `(orgId, projectKey)`) |
| Project Summary | `project_summary_module_spec.pdf` | `/spaces/[projectId]/summary` | `GET /api/projects/[id]/summary` |
| Backlog + Sprint | `backlog_*` (3 PDFs), `backlog_sprint_module_spec_v2.pdf` | `/spaces/[projectId]/backlog` | `GET /api/sprints`, `GET /api/backlog/issues`, `PATCH /api/sprints/[id]/start`, `POST /api/sprints/[id]/complete`, `PATCH /api/issues/[id]/move` |
| Kanban Board | `kanban_board_prisma_hierarchy_spec.pdf` | `/spaces/[projectId]/board` | `GET /api/issues?projectId&status`, `PATCH /api/issues/[id]/move` |
| Work Item Drawer | `issue_detail_drawer_spec.pdf` | drawer (shared) | `GET/PATCH /api/issues/[id]`, `POST /api/issues` (subtask) |
| Epics | `epics_module_spec_with_pagination.pdf` | `/spaces/[projectId]/epics` | `GET /api/epics`, `DELETE /api/issues/[id]` (orphans children in tx) |
| Task Table | `task_table_module_spec.pdf` | `/spaces/[projectId]/tasks` | `GET /api/issues/table?projectId` |
| Timeline | `timeline_epic_edit_drawer_spec.pdf` | `/spaces/[projectId]/timeline` | `GET /api/issues/[epicId]`, `PATCH /api/issues/[epicId]` |
| Pages | `pages_module_spec_with_exports.pdf` | `/spaces/[projectId]/pages` | `GET/POST /api/pages`, `GET /api/pages/[id]/export/{pdf,csv}` |
| Timesheet | `timesheet_module_spec.pdf` | `/timesheet` | `GET/POST /api/timesheets`, cascading dropdowns |
| Project Reports | `project_reports_module_spec.pdf` | `/reports/projects` | `GET /api/reports/project` |
| Resource Reports | `resource_reports_module_spec.pdf` | `/reports/resources` | `GET /api/reports/resource` |

Cross-cutting: validation rules (timesheet hours 0.25–24, no future date; project key unique per org; subtasks cannot have children; sprint lifecycle Create→Active→Completed).

---

## Cross-Cutting Feature: Project-Level Permissions (Jira-style membership)

**Rule:** A user can only see / interact with a project if they are a member of it (`QtProjectMember`). Tenant scoping alone is **not** sufficient — a user in tenant T must additionally be in `QtProjectMember` for project P. Org admins are an exception (see role matrix).

**User identity source:** All users live in the **public `User` table** (shared, already exists). QuikTrack does **not** create its own user table — `QtProjectMember.userId` and `QtIssue.assigneeId` etc. are FKs to `public.User.id`.

**Organization source:** Organizations (tenants) live in the **public `Tenant`/`Organization` table** (shared). QuikTrack does **not** create its own org table; every QuikTrack row is scoped to an existing `tenantId`/`orgId` from public.

**Teams (QuikTrack-owned):** Teams are a QuikTrack concept and live in the **`app_quiktrack` schema** as `QtTeam` + `QtTeamMember`. A team is a named group of users within a tenant; teams can be assigned to projects (many-to-many via `QtProjectTeam`) and can be set as the default assignee group on a column or sprint. Teams reference users from `public.User` via FK.

**Roles (per project):**
| Role | Can view | Can create/edit issues | Can manage members | Can edit project settings |
|---|---|---|---|---|
| `PROJECT_ADMIN` | ✅ | ✅ | ✅ | ✅ |
| `MEMBER` | ✅ | ✅ | ❌ | ❌ |
| `VIEWER` | ✅ | ❌ | ❌ | ❌ |
| (non-member) | ❌ | ❌ | ❌ | ❌ |
| Tenant `ADMIN` (public.Membership.role) | ✅ all projects | ✅ | ✅ | ✅ |
| `SUPER_ADMIN` | ✅ all tenants | ✅ | ✅ | ✅ |

**Enforcement layer:** `lib/api/withProjectAccess.ts` — wraps `withTenantAuthForModule` and additionally checks `QtProjectMember` (or admin bypass) for the requested `projectId`. Every project-scoped endpoint must use this wrapper. Returns **404** (not 403) for non-members so project existence isn't leaked.

**UI enforcement:** `GET /api/projects` returns only projects the caller is a member of (or all if admin). Sidebar's space list is filtered server-side. Direct URL navigation to `/spaces/[projectId]/*` for a non-member returns the standard "Project not found" page.

---

## Cross-Cutting Feature: User Invitation Flow

**Two flavors, both wired in QuikTrack UI:**

1. **Invite to tenant + add to project** (new user) — admin enters email + role + project(s). System:
   - Looks up `public.User` by email; if absent, creates a stub user (`status: PENDING`) and a `public.Invitation` row (token, expiry, invitedBy).
   - Sends email with magic-link to `/invite/accept?token=...`. (Reuses existing tenant-invitation infrastructure if present in `@quikit/auth`; otherwise app-local table `QtInvitation` with `TODO(integration)` note to consolidate.)
   - On accept: user sets password (or SSO), `User.status` flips to `ACTIVE`, `public.Membership` row created for tenant, `QtProjectMember` row created for each project.
2. **Add existing tenant user to project** — admin picks from autocomplete of users already in the tenant; immediately creates `QtProjectMember` (no email).

**Endpoints:**
- `POST /api/projects/[id]/members` — body `{ email | userId, role }`. If `email` and user not in tenant → kick off invite flow.
- `GET /api/projects/[id]/members` — list with role, status, lastActive.
- `PATCH /api/projects/[id]/members/[userId]` — change role.
- `DELETE /api/projects/[id]/members/[userId]` — remove from project (does not affect tenant membership).
- `GET /api/users/search?q=` — tenant-scoped autocomplete (returns only users already in caller's tenant; never leaks across tenants).
- `POST /api/invitations/[token]/accept` — public route, no `withTenantAuth`, validates token + sets up Membership + QtProjectMember rows in a single tx.
- `GET /api/invitations/[token]` — public, returns inviter name + project name for the accept page.

**UI (under Project Settings → Members tab, mirroring Jira's "Add people" modal):**
- Search input with debounced `/api/users/search`.
- "Invite by email" fallback when no match — opens role picker + optional message.
- Member list table: avatar, name, email, role dropdown, last-active, remove button.
- Pending invites section with "resend" + "revoke".

**Email:** reuse `@quikit/shared` email helper if present; else stub the send and log to console (Phase 6 follow-up).

---

## Cross-Cutting Feature: Dynamic Kanban Stages (per-project columns)

**Already covered in schema by `QtIssueStatus`** (projectId, name, color, orderIndex, category). Expanding the implementation:

**Per-project columns are first-class:**
- On project creation, seed default columns: `To Do` → `In Progress` → `In Review` → `Done` (with `category` = BACKLOG | IN_PROGRESS | DONE for reporting/grouping).
- Project Settings → Board tab provides a CRUD for columns:
  - Add column (name, color, category).
  - Rename / recolor.
  - Reorder via drag-handle (updates `orderIndex` in a single tx).
  - Delete (only if no issues reference it; otherwise prompt to reassign).
  - **Hide / unhide** column on the board (`isHidden` boolean — issues stay in DB but column collapses in board view; counts still appear in summary).
- Issues' `statusId` always references a real `QtIssueStatus` row (no string enum), so workflows and reports honor custom stages.

**Endpoints:**
- `GET /api/projects/[id]/statuses` — list ordered by `orderIndex`, includes `isHidden`.
- `POST /api/projects/[id]/statuses` — create.
- `PATCH /api/statuses/[id]` — rename / recolor / category / `isHidden`.
- `POST /api/projects/[id]/statuses/reorder` — body `{ orderedIds: [...] }`, single tx update.
- `DELETE /api/statuses/[id]` — guarded by issue-count check; supports `?reassignTo=<otherStatusId>`.

**Schema addition (Phase 2):** add `isHidden Boolean @default(false)` and `category` enum (`BACKLOG`/`IN_PROGRESS`/`DONE`) to `QtIssueStatus`.

---

## Cross-Cutting Feature: App Settings — Column Visibility (table views)

**Separate from Kanban column hide** — this is for the **table-style modules** (Epics, Task Table, Reports, Backlog list view).

**Storage:** `QtUserViewPref` table:
- `userId` (FK public.User), `tenantId`, `projectId` (nullable — null = global default), `viewKey` (e.g. `"task_table"`, `"epics"`, `"project_report"`, `"backlog"`), `hiddenColumns String[]`, `columnOrder String[]`.
- `@@unique([userId, projectId, viewKey])`.

**Endpoints:**
- `GET /api/view-prefs?viewKey=&projectId=` — returns user's saved prefs (falls back to defaults).
- `PUT /api/view-prefs` — upsert.

**UI:** every table has a "Columns" gear-icon button that opens a popover with checkboxes per column + drag-to-reorder. Persists immediately. App Settings page mirrors the same controls under "Default views" for the user's global defaults.

---

## Cross-Cutting Feature: App Registration in QuikIT Launcher + App Switcher

QuikTrack must appear in two existing surfaces (both already discovered):

**1. Launcher "Your Apps" grid** — `apps/quikit/app/(launcher)/apps/page.tsx` renders cards from `/api/apps/launcher` (joins `App` table with `UserAppAccess`).

**2. Top-bar app switcher** (3×3 grid icon dropdown) — shared component at `packages/ui/components/app-switcher.tsx`, fed by `/api/apps/switcher`.

**Registration steps (added to Phase 1):**
1. Add a `QuikTrack` row to the `App` table via the existing seed file `packages/database/prisma/seed-oauth.ts`:
   ```ts
   { slug: "quiktrack", name: "QuikTrack", baseUrl: "http://localhost:3006",
     status: "active", description: "Project management — Spaces, Sprints, Kanban, Timesheet, Reports" }
   ```
2. Add an icon mapping for slug `"quiktrack"` in the app-switcher's emoji/color fallback table inside `packages/ui/components/app-switcher.tsx` (small, surgical edit — flagged as the only `packages/ui` change required, with `TODO(integration)` comment).
3. Seed `UserAppAccess` rows for existing dev users so the card actually appears (idempotent upsert in the same seed script).
4. Optional: `TenantAppAccess` row if the deployment uses tenant-level gating (mirror QuikVC pattern).
5. **No launcher UI change needed** — the grid auto-picks up the new app once seed runs and access rows exist.

**Pixel reference (from screenshots provided):**
- Launcher card: `rounded-2xl border border-gray-200 p-5 hover:border-indigo-300 hover:shadow-md`, 12×12 icon tile (`rounded-xl bg-gray-50`), Active badge top-right, `text-xs` description, `bg-indigo-600` Launch button.
- App switcher: 3-col grid, 10×10 icon tiles, `text-[11px]` label, `bg-indigo-50` for current app.

These exist already; QuikTrack just needs to slot in matching the existing card style — no new components.

---

## Cross-Cutting Feature: Pixel-Perfect UI from User-Provided Screenshots

The user will paste UI screenshots inline, one screen at a time. Process for each screen:
1. Extract a **visual checklist** (layout grid, spacing, typography, icon sizes, border radius, shadows, table row heights, drawer/modal dimensions, chip/badge styles, hover/active/focus/disabled states, responsive breakpoints).
2. Save the checklist to `apps/quiktrack/docs/visual-checklists/<screen>.md`.
3. Implement using `@quikit/ui` primitives first; fall back to app-local wrappers in `apps/quiktrack/components/` only when a primitive lacks the variant required for parity (mark with `TODO(integration)` to consider upstreaming).
4. PR notes for the screen include a **self-audit:** checklist items matched ✅, intentional deviations + reasons.
5. Never modify `packages/ui/*` unless explicitly authorized.

---

## Phase 1 — Scaffold (runnable shell)

**Goal:** `npm run dev --workspace apps/quiktrack` boots on port 3006, redirects unauth to `/login`, shows an empty `(dashboard)` shell.

**Steps**
1. Copy `apps/_template/` → `apps/quiktrack/`. Delete template-specific placeholders.
2. Edit `apps/quiktrack/package.json` — `"name": "quiktrack"`, `"dev": "next dev -p 3006"`, `"start": "next start -p 3006"`. Keep deps identical to other apps.
3. Edit `apps/quiktrack/manifest.ts` — `appId: "quiktrack"`, `routePrefix: "/quiktrack"`, navigation entries (Dashboard, Spaces, Timesheet, Reports), permissions matrix.
4. Edit `apps/quiktrack/next.config.js` — set `serverActions.allowedOrigins` to `["localhost:3006"]`, transpile `@quikit/*`.
5. Edit `apps/quiktrack/middleware.ts` — `createMiddleware("/login", [...public])`.
6. Edit `apps/quiktrack/app/layout.tsx` — set `<title>` and metadata to "QuikTrack".
7. Verify `apps/quiktrack/components/providers.tsx` keeps order **SessionProvider → QueryClientProvider → ThemeProvider**.
8. Build dashboard shell at `apps/quiktrack/app/(dashboard)/layout.tsx` with `SessionGuard`, `ThemeApplier`, `Sidebar`, `Header`, `<main>`.
9. Add `/api/health` route (no auth) and a single placeholder page at `/dashboard`.
10. Add `apps/quiktrack/CLAUDE.md` — copy from `_template`, replace name + port + appId.
11. Add `apps/quiktrack/README.md`: how to run, port, env vars.
12. **Register in launcher + app switcher:**
    - Update `packages/database/prisma/seed-oauth.ts` to upsert `App { slug:"quiktrack", name:"QuikTrack", baseUrl:"http://localhost:3006", status:"active", description:"..." }` and seed `UserAppAccess` for dev users.
    - Add icon mapping for `"quiktrack"` in `packages/ui/components/app-switcher.tsx` fallback table.
    - Run seed: `npx prisma db seed`.
    - Verify QuikTrack card appears in QuikIT launcher (`http://localhost:3000/apps`) and in top-bar switcher dropdown.
13. Confirm root `npm run typecheck && npm run lint && npm run dev --workspace apps/quiktrack` all pass. No DB models yet.

**Acceptance:** App boots, login redirect works, dashboard shell renders with sidebar.

---

## Phase 2 — Prisma schema `app_quiktrack`

**Goal:** Migration creates all QuikTrack tables under `app_quiktrack` schema. No app code touches it yet.

**Steps**
1. Edit `packages/database/prisma/schema.prisma`:
   - Add `"app_quiktrack"` to `schemas = [...]`.
   - Add models (each with `@@schema("app_quiktrack")` and audit fields `isDeleted Boolean @default(false)`, `createdBy String?`, `updatedBy String?`, `createdAt DateTime @default(now())`, `updatedAt DateTime @updatedAt`):
     - `QtProject` (orgId, tenantId, projectKey, name, description, startDate, endDate, status, icon, projectType, leadUserId) — `@@unique([orgId, projectKey])`
     - `QtProjectMember` (projectId, userId [→ public.User.id], role [`PROJECT_ADMIN`|`MEMBER`|`VIEWER`], joinedAt, invitedBy) — `@@unique([projectId, userId])`
     - `QtSprint` (projectId, name, goal, status, startDate, endDate)
     - `QtIssueType` (projectId, name, color, orderIndex)
     - `QtIssueStatus` (projectId, name, color, orderIndex, category [`BACKLOG`|`IN_PROGRESS`|`DONE`], isHidden Boolean @default(false))
     - `QtIssue` (projectId, tenantId, key, title, description, type [EPIC|TASK|SUBTASK], statusId, priority, parentId, epicId, sprintId, assigneeId [→ public.User.id], reporterId [→ public.User.id], startDate, dueDate, eta, storyPoints, orderInColumn)
     - `QtTimesheetEntry` (userId [→ public.User.id], projectId, issueId, parentIssueId, entryDate, hours, description)
     - `QtTimesheetWeeklySummary` (issueId, userId, year, weekNumber, totalHours) — `@@unique([issueId, userId, year, weekNumber])`
     - `QtPage` (projectId, title, content, authorId [→ public.User.id], parentPageId)
     - `QtNotificationPref` (userId [→ public.User.id], eventKey, channel, enabled)
     - `QtUserViewPref` (userId [→ public.User.id], tenantId, projectId [nullable], viewKey, hiddenColumns String[], columnOrder String[]) — `@@unique([userId, projectId, viewKey])`
     - `QtInvitation` (email, tenantId, projectId [nullable], role, token [unique], expiresAt, invitedBy, acceptedAt) — only if `@quikit/auth` does not already expose a tenant-invitation table; otherwise reuse and skip this model.
     - **`QtTeam`** (id, tenantId [→ public.Tenant.id], orgId [→ public.Organization.id], name, description, leadUserId [→ public.User.id, nullable], color, isDeleted, audit fields) — `@@unique([tenantId, name])`, `@@index([tenantId, orgId])`
     - **`QtTeamMember`** (id, teamId [→ QtTeam], userId [→ public.User.id], role [`LEAD`|`MEMBER`], joinedAt) — `@@unique([teamId, userId])`, `@@index([userId])`
     - **`QtProjectTeam`** (id, projectId [→ QtProject], teamId [→ QtTeam], addedAt, addedBy) — `@@unique([projectId, teamId])` — many-to-many bridge so an entire team can be granted access/assignment to a project.

   **Note on User FKs:** Prisma cross-schema relations require declaring the relation on both sides. Since `User` is in `public` schema (managed by other apps), QuikTrack models reference `User` via standard Prisma `@relation` syntax — multi-schema mode supports this. No new fields added to `User`.
   - Indexes per spec:
     ```
     @@index([projectId, statusId]) // board
     @@index([epicId])
     @@index([parentId])
     @@index([assigneeId])
     @@index([projectId, type])
     @@index([startDate, dueDate])
     // Timesheet
     @@index([userId, entryDate])
     @@index([projectId])
     @@index([issueId])
     ```
2. `npx prisma migrate dev --name quiktrack_init` from repo root.
3. `npx prisma generate`.
4. Verify other apps still typecheck (no model name collisions — all prefixed `Qt*`).

**Acceptance:** Migration applies cleanly. Existing apps still build & test green.

---

## Phase 3 — Core backend APIs (foundation)

**Goal:** Tenant-scoped, withTenantAuth-wrapped, Zod-validated, paginated CRUD for the foundation entities.

**Pattern (every route):**
```ts
export const GET = withTenantAuthForModule(null)(async (req, { tenantId, userId }) => {
  try {
    const params = parsePaginationParams(new URL(req.url).searchParams);
    const where = { tenantId, isDeleted: false /* + filters */ };
    const [data, total] = await Promise.all([
      db.qtIssue.findMany({ where, ...paginationToSkipTake(params), select: {...} }),
      db.qtIssue.count({ where }),
    ]);
    return NextResponse.json({ success: true, data, meta: buildPaginationResponse(data, total, params).meta });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Operation failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
});
```

**Endpoints to build (in order):**
0. **Permission wrapper** — `lib/api/withProjectAccess.ts` enforcing membership-or-admin (returns 404 to non-members). Every project-scoped route uses it.
1. Projects: `GET/POST /api/projects` (list filtered to caller's memberships unless admin), `GET/PATCH/DELETE /api/projects/[id]`, `GET /api/projects/[id]/summary`.
1a. **Members + invitations**:
    - `GET/POST /api/projects/[id]/members`, `PATCH/DELETE /api/projects/[id]/members/[userId]`
    - `GET /api/users/search?q=` (tenant-scoped autocomplete from `public.User`)
    - `POST /api/invitations` (admin creates), `GET/POST /api/invitations/[token]` (public accept flow)
1b. **Statuses (dynamic Kanban stages)**:
    - `GET/POST /api/projects/[id]/statuses`, `PATCH/DELETE /api/statuses/[id]`, `POST /api/projects/[id]/statuses/reorder`.
    - On project create: seed 4 default statuses in tx.
1c. **View prefs (column hide/show)**:
    - `GET/PUT /api/view-prefs?viewKey=&projectId=`.
1d. **Teams** (tenant-scoped, QuikTrack-owned):
    - `GET/POST /api/teams` — list/create teams in caller's tenant.
    - `GET/PATCH/DELETE /api/teams/[id]`.
    - `GET/POST /api/teams/[id]/members` — list / add user(s) by `userId`.
    - `DELETE /api/teams/[id]/members/[userId]`.
    - `POST /api/projects/[id]/teams` (body `{ teamId }`) — grants every team member project access by upserting a `QtProjectMember` row per user (role defaults to `MEMBER`); also writes the `QtProjectTeam` link so future team-member additions can auto-propagate.
    - `DELETE /api/projects/[id]/teams/[teamId]` — removes the link (does **not** auto-remove individual `QtProjectMember` rows; admin can prune separately).
    - Permission: tenant admin or `PROJECT_ADMIN` for project-team links; tenant admin only for team CRUD.
2. Issues: `GET/POST /api/issues`, `GET/PATCH/DELETE /api/issues/[id]`, `PATCH /api/issues/[id]/move` (status/sprint/parent change in single tx, recompute `orderInColumn`), `GET /api/issues/table`.
3. Sprints: `GET/POST /api/sprints`, `GET/PATCH /api/sprints/[id]`, `PATCH /api/sprints/[id]/start` (tx: validate dates + flip status), `POST /api/sprints/[id]/complete` (tx: move incomplete issues to backlog → archive sprint).
4. Backlog: `GET /api/backlog/issues?projectId`, `GET /api/backlog/meta`.
5. Epics: `GET /api/epics?projectId`, `DELETE /api/issues/[id]` for epics orphans children in tx.
6. Timesheets: `GET/POST /api/timesheets`, `PATCH/DELETE /api/timesheets/[id]`. Validation: `0.25 ≤ hours ≤ 24`, `entryDate ≤ today`. Trigger weekly summary upsert.
7. Pages: `GET/POST /api/pages`, `GET/PATCH/DELETE /api/pages/[id]`, `GET /api/pages/[id]/export/pdf` and `/csv`. Use `pdfkit` + `fast-csv` (add only at app level).
8. Reports: `GET /api/reports/project`, `GET /api/reports/resource` — pure aggregation, no writes.
9. Dashboard: `GET /api/dashboard/for-you` — recent projects + assigned issues + my sprints.
10. Notifications: `GET/PATCH /api/notifications/preferences`. Event-hook stubs that log only (real delivery is post-MVP).

**Subtask rollup helper** (called from issue PATCH and timesheet upsert): `lib/services/rollup.ts` — recomputes parent `eta` (sum of children) and `dueDate` (max of children) when subtask changes.

**Critical files:**
- `apps/quiktrack/lib/db.ts` — re-export `db`.
- `apps/quiktrack/lib/api/withTenantAuth.ts` — re-export `withTenantAuthForModule(null)`.
- `apps/quiktrack/lib/validation/` — Zod schemas (issue, sprint, timesheet, page, project).
- `apps/quiktrack/lib/services/` — `rollup.ts`, `sprintLifecycle.ts`, `boardOrdering.ts`.

**Tests for every endpoint** (CLAUDE.md mandatory):
- 401 unauth
- Cross-tenant isolation (issue from tenant A invisible to tenant B)
- **Non-member returns 404** for project-scoped endpoints (member of tenant but not project)
- **Role-gated mutations** rejected for `VIEWER` and non-members
- Happy path
- Validation failure (where applicable)

---

## Visual Checklist — "For You" Landing Page (from screenshot 3)

This is the first pixel-perfect screen. Saved to `apps/quiktrack/docs/visual-checklists/for-you.md` during Phase 4.

**Top bar:**
- Left: 9-dot apps icon · QuikTrack logo + wordmark · sidebar collapse chevron.
- Center: full-width search input, rounded-md, light-grey border, `Search` placeholder, search icon left.
- Right: `+ Create` blue button (`bg-blue-600`, `rounded`, white plus icon, `text-sm font-medium`).
- Far right: bell · help (?) · settings gear · user avatar — each `h-5 w-5`, 16px gap.
- Bar height ~48px, white bg, bottom border `border-gray-200`.

**Left sidebar (~232px wide, `bg-white`, `border-r border-gray-200`):**
- Active row uses `bg-blue-50 text-blue-700` highlight on left edge.
- Top section (no header): For you (active) · Recent ▶ · Starred ▶ · Apps · Plans · Spaces (with `+` and `…` actions).
- "Recent" sub-list: recent project rows with colored 16px square icons.
- "More spaces ▶".
- Section break.
- Filters · Dashboards · Operations ▾ (Home, Alerts, On-call schedules indented).
- Customers · Customer experiences.
- Section break.
- Confluence · Teams (external link icon).
- Bottom: "Customize sidebar" gear row.
- Row height ~32px, icon 16px, `text-sm`, padding `px-3`.

**Main content:**
- Section "Recommended spaces" — H2 `text-base font-semibold` · "View all spaces" link far right (`text-blue-600 text-sm`).
- 3-column grid of recommended cards: `border rounded-md p-3`, 32px square colored project icon left, name + type subtitle right (`text-sm font-medium`, `text-xs text-gray-500`).
- Section "For you" — H2 + tab row right: `Recommended` · `Assigned to me [8]` · `Starred` · `Worked on` · `Viewed` (active = underline + black text, count badge `bg-blue-600 text-white rounded px-1`).
- Group headers (`Yesterday`, `In the last month`) — `text-xs font-medium text-gray-500 uppercase`.
- List rows: 16px type icon · title (`text-sm`) + meta line (`Task · SCRUM-36 · My Scrum Project` `text-xs text-gray-500`) · right-aligned timestamp (`text-xs text-gray-500`).
- Row hover `hover:bg-gray-50`, `py-2 px-2`.

**Behavior:**
- Tab switch is client-side (no remount).
- Group cutoffs: Today / Yesterday / Last week / Last month / Older — computed from `updatedAt`.
- Empty tab → friendly empty state with illustration placeholder + CTA.

**Data sources:**
- `GET /api/dashboard/recommended-spaces` → 3 most-recently-touched projects user is a member of.
- `GET /api/dashboard/for-you?tab=recommended|assigned|starred|worked|viewed` → paginated activity feed.
- `GET /api/dashboard/recent-spaces` → sidebar Recent list.

---

## Phase 4 — Core UI foundations

**Goal:** Pixel-fidelity-attempted UI for the four central screens.

**Shell:**
- `apps/quiktrack/components/shell/sidebar.tsx` — top-level nav (Dashboard, Spaces, Timesheet, Reports), per-space sub-nav (Summary/Backlog/Board/Tasks/Epics/Timeline/Pages).
- `apps/quiktrack/components/shell/header.tsx` — search, notifications, avatar.

**Screens (each with a per-screen visual checklist file at `apps/quiktrack/docs/visual-checklists/<screen>.md`):**
1. **Spaces grid** — card layout, project icons, search, "New space" button. Reuses `Card`, `Badge` from `@quikit/ui`.
2. **Project Summary** — metric cards (counts, % done), recent activity, status pie. Uses `recharts` (already a tx-list dep) or app-local equivalent.
3. **Backlog** — three independent scroll regions; `react-beautiful-dnd` (or HTML5 DnD app-local) for drag between sprint accordions and backlog list. Optimistic update with rollback.
4. **Kanban board** — dynamic columns from `QtIssueStatus`, drag-drop with optimistic update, lazy subtask expand. Per-column infinite scroll.
5. **Work Item Drawer** (shared between board / backlog / task table) — title, description (rich text), status, assignee, sprint, epic, priority, ETA, dates, subtasks list with inline create, time-log readonly list. Use `@quikit/ui/modal` extended into a side-drawer variant; if it doesn't support side-drawer, create app-local `components/drawer.tsx` wrapper with `TODO(integration)` to upstream.

**Theming:**
- `accent-*` Tailwind classes for buttons, sidebar background, focus rings, table headers.
- Hardcoded colors only for status semantics (Done = green, Blocked = red, etc.) per CLAUDE.md.

**Component tests:** at least one `.dom.test.tsx` per major screen verifying empty state + happy path render.

---

## Phase 4b — Settings & Membership UI

1. **Project Settings shell** at `/spaces/[projectId]/settings` with tabs: Details · Members · Board (columns) · Notifications.
2. **Members tab** — Jira-style "Add people" modal:
   - Autocomplete search of tenant users via `/api/users/search`.
   - "Invite by email" fallback with role picker + optional message.
   - Member table (avatar, name, email, role dropdown, last-active, remove).
   - Pending invites list with resend / revoke.
3. **Invitation accept page** at `/invite/accept?token=` — public route (excluded in middleware), fetches inviter + project context, completes signup or auto-attaches to existing user.
4. **Board tab** — column CRUD (add/rename/recolor/reorder/hide/delete-with-reassign).
5. **Column visibility** — gear-icon popover on every table view, persists via `/api/view-prefs`. Mirror in App Settings page for global defaults.

---

## Phase 5 — Remaining modules

1. **Epics** — paginated table, inline edit, delete-with-orphan confirmation modal.
2. **Task Table** — hierarchical expandable rows, inline edit per cell.
3. **Timeline / Gantt** — left tree + right gantt (use `frappe-gantt` or hand-rolled SVG; choose SVG to avoid new dep). Epic-edit drawer reuses Phase 4 drawer.
4. **Pages** — list + editor (use `@tiptap/react` if absent; otherwise plain `<textarea>` + markdown render). PDF/CSV export buttons hit Phase-3 endpoints.
5. **Timesheet** — Day/Week/Month/List views, cascading Project→Issue→Subtask dropdowns with server search/pagination, inline create.
6. **Reports — project & resource** — filters, summary cards, paginated tables, detail drawers.
7. **For You dashboard** — recommended boards + recent activity + my open issues.
8. **Notification preferences screen** + event-hook stubs in `lib/services/notifications.ts`.

---

## Phase 6 — Hardening

1. Test gap analysis — ensure every endpoint has 401 / cross-tenant / happy. Add component tests for drag-drop and drawer interactions.
2. Coverage ratchet update.
3. End-to-end happy path Playwright spec: create project → create sprint → add issues → start sprint → drag on board → log time → complete sprint → view report.
4. Lint/typecheck/test green across **all** workspaces (no regressions in admin/quikconstruction/quikit/quikvc/quikscale).
5. Final implementation report listing files, endpoints, models, indexes, and known TODOs.

---

## Critical files to create/modify (summary)

**New (under `apps/quiktrack/`):** all of `app/`, `components/`, `lib/`, `__tests__/`, `manifest.ts`, `middleware.ts`, `package.json`, `next.config.js`, `tsconfig.json`, `tailwind.config.ts`, `vitest.config.ts`, `CLAUDE.md`, `README.md`.

**Modified (shared):** `packages/database/prisma/schema.prisma` — add models + schema name. **No other `packages/*` files modified.**

**Migrations:** new file under `packages/database/prisma/migrations/<timestamp>_quiktrack_init/`.

---

## Reused utilities (do not reimplement)

- Pagination: `parsePaginationParams`, `paginationToSkipTake`, `buildPaginationResponse` from `@quikit/shared/pagination`.
- Auth wrappers: `withTenantAuthForModule`, `createGetTenantId`, `createRequireAdmin` from `@quikit/auth/*`.
- Middleware factory: `createMiddleware` from `@quikit/auth/middleware`.
- DB client: `db` from `@quikit/database` (soft-delete-aware).
- UI: every primitive in `@quikit/ui`. Theming via `ThemeApplier`.
- Test helpers: `setSession` from `__tests__/setup.ts`, `mockDb` from `__tests__/helpers/mockDb.ts` (cloned from template).

---

## Verification

**Per-phase gate:** `npm run typecheck && npm run lint && npm run test` must pass at repo root before advancing.

**End-to-end manual test (post-Phase 5):**
1. `npm run dev --workspace apps/quiktrack` → open `http://localhost:3006`.
2. Log in, land on `/dashboard`.
3. Create a Space (verify projectKey uniqueness error on duplicate).
4. Open Backlog, create sprint, add 3 issues, start sprint.
5. Open Board, drag issue across columns (refresh — order persists).
6. Open Work Item Drawer, add subtask, verify ETA rolls up to parent.
7. Log time entry > 24h → 422; valid entry → success; verify weekly summary.
8. Complete sprint → incomplete issues return to backlog.
9. Export a Page as PDF & CSV — both download.
10. Open Reports → filter by project + date range → export.
11. Confirm tenant isolation: log in as a user from another tenant → no QuikTrack data visible.

**Automated:** Playwright spec at `apps/quiktrack/__tests__/e2e/lifecycle.spec.ts` covers steps 3–8.

---

## Open questions / risks

1. **No screenshots in `PMS_DOC_FOR_CLAUD`** — pixel-perfect parity requested. Will rely on PDFs + Jira conventions + QuikIT design tokens; will mark visual deviations in PR notes per phase.
2. **Rich-text editor** — adding `@tiptap/react` is the cleanest option; flag for confirmation when starting Pages module.
3. **PDF/CSV export libs** — `pdfkit` + `fast-csv` proposed at app-level deps (not shared package).
4. **Gantt rendering** — proposing hand-rolled SVG (no new dep) over `frappe-gantt`; will revisit if complexity blows up.
5. **Notification delivery** — Phase 5 stubs only log events; real email/in-app delivery is out of scope unless user expands.
6. **Existing tenant-invitation infra** — need to confirm whether `@quikit/auth` or another app already has a tenant-invitation table/email flow we should reuse before introducing `QtInvitation`. Will inspect during Phase 1 and consolidate if found.
7. **Pixel-perfect screenshots** — user will paste screenshots inline per screen; each gets a checklist file under `apps/quiktrack/docs/visual-checklists/` and a self-audit in PR notes.
8. **App-switcher edit** — adding QuikTrack's icon/color fallback requires touching `packages/ui/components/app-switcher.tsx` (one entry in the slug→emoji table). This is the only `packages/*` modification beyond `schema.prisma` + `seed-oauth.ts`. Will be a small, reviewed change.
