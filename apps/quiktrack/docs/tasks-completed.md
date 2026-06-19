# QuikTrack — Tasks Completed

A running log of features and fixes shipped on the QuikTrack app, grouped by area. Newest sections at the bottom of each group.

---

## Spaces (project list)

- Sticky tab bar / sidebar on space pages — header and tabs no longer scroll with content (`h-screen` flex layout).
- Auto-assign random emoji icon to a project on creation; emoji also persisted alongside the project record. Removed the redundant **Access** field from the create-project form.
- Replaced project-preview illustration blob with the user-supplied SVG.
- Templates page: clicking the top-right ✕ navigates back to the last-opened project.
- Spaces table page (`/spaces`):
  - Backend-driven search, filter (by project type), sort (asc/desc by name), pagination.
  - Pagination controls always visible (matches Jira reference).
  - **Space URL** column rendered (and later cleared per request to mirror Jira layout).
  - Row `⋯` menu — only **Space settings** entry, "..." centered in column, blue active-state border, popover unclipped (`overflow-visible` on table wrapper).
- "More spaces" sidebar popover.
- Loading states everywhere replaced with shimmer skeletons (no more "Loading…" strings).
- For You page — Recommended spaces + Viewed feed; Viewed migrated from `localStorage` to `QtUserActivity` Postgres table via `$queryRaw`/`$executeRaw`.

## Sidebar / shell

- Sidebar **Spaces** section collapsible.
- Sidebar primary navigation hidden when on `/spaces/<id>/settings` (full-page settings shell).
- Project tab bar (Summary / Timeline / Backlog / …) hidden on settings pages — settings now renders as a full-page shell with its own back button.

## Header / global Create

- Global header **Create** button opens a modal:
  - Custom **Space** popover with "Recent Spaces" / "All Spaces" sections + search.
  - Custom **Work type** popover (Task / Bug / Story / Epic — Subtask removed from picker).
  - **Status**, **Priority** (5 levels with arrow icons), **Assignee**, **Parent (epic)**, **Due date**, **Start date**, **Sprint**, **Story point estimate** fields.
  - Hides Sprint / Story-point estimate / Priority for Epic work type.
  - Inline "Summary is required" error.
  - **Description** — TipTap rich-text editor with format dropdown (heading / quote), text-style dropdown (bold / italic / underline / strikethrough), bullet/ordered lists, indent/outdent, blockquote, alignment (left / center / right / justify), tables (insert + contextual row/column add-delete), link dialog with optional link text, image upload with click-to-preview media viewer, code block, undo / redo.
  - On success, dispatches `quiktrack:issue-created` window event so loaded backlog/board sections refresh.

## Backlog & Sprints

- Per-project Backlog page with sprint sections + Backlog section.
- Cursor pagination for sprints (IntersectionObserver sentinel).
- Lazy-load issues per accordion (cursor pagination + IntersectionObserver inside section).
- Inline issue creator inside each section.
- Sprint actions (`⋯`): **Edit sprint**, **Delete sprint** (soft-delete + detach issues to backlog), **Move to top / Move up** ordering.
- **Start sprint** modal (validates + activates sprint).
- **Complete sprint** modal — destination dropdown lets the user move open issues to another planning sprint, a brand-new sprint, or back to the backlog (single transaction).
- Issue rows:
  - Drag-and-drop between sprint sections / backlog (PATCH `sprintId`, optimistic UI, sprint-count badges adjusted locally).
  - Inline title edit (pencil-on-hover; ✓ / ✗ buttons; Enter / Escape).
  - Inline status pill picker (popover of project statuses).
  - **Issue key click** opens the Edit drawer.
  - Linked-epic chip (red pill with Zap icon) shown when an epic is the parent.
  - Overdue badge (red bordered chip with warning icon and short date) when `dueDate` is past.
  - Story-points cell removed.
  - `⋯` row menu: **Open**, **Delete** (centered confirm modal — "Are you sure…?", with cascade-delete warning when the row has subtasks).
- Backlog / Sprint sections never display Epics or Subtasks (server `excludeType=EPIC,SUBTASK` + defensive client-side filter on every refresh / load-more).
- Sprint count badges (`/api/sprints`) updated locally on drag-drop and refetched after creation.
- Empty sprints default-collapsed; manual toggle wins thereafter.

## Board

- Filtered to the project's **ACTIVE** sprint only — empty state when none active.

## Edit Issue drawer (right-side)

- Right-side drawer with drag-resize handle on its left edge (`col-resize` cursor; min 360 px, max 95 vw).
- Sticky-on-scroll header with shimmer skeleton while loading.
- Top action row: parent breadcrumb (clickable to navigate to parent), `+ Add epic` popover (Recent Epics + "View all epics" centered modal).
- Title — click to inline-edit.
- Status pill — popover of statuses with color-coded pills.
- **Description** — same TipTap editor as Create modal; click-to-expand with Save / Cancel.
- **Subtasks**:
  - Collapsible header with `⋯` / grid / `+` actions.
  - `+` button opens the inline create input (focuses + scrolls into view if already open).
  - Inline input row matching Jira reference (blue ring, "Subtask" type chip, send / cancel).
  - 6-column grid: Work · Priority · Assignee · Status · ETA · Σ Progress.
  - **Inline-editable** rows — title click-to-edit, Priority / Assignee / Status / ETA all open popovers; popovers use **fixed positioning** so they aren't clipped by the grid's `overflow-y-auto`.
  - Pagination by scroll inside the grid.
  - 0 % Done progress bar above the grid (computed from DONE-category subtasks).
- **Linked work items** placeholder.
- **Details** panel (collapsible):
  - **Assignee** — avatar + name picker with search; "Assign to me" link when unset.
  - **Priority** — arrow-icon picker (Highest / High / Medium / Low / Lowest).
  - **Parent** — red epic chip with Zap icon (click to detach), or epic picker when unset.
  - **Due date** — chip; red bordered + warning icon when overdue; click to edit.
  - **Start date** — date input.
  - **Sprint** — picker with search, "Only show sprints in this space" checkbox, **Active** / **Future** groupings.
  - **Original estimate (ETA)** — accepts `30m`, `2h`, `1h 30m`, `1d`, `1w`, or a bare number for hours; validation; reformats canonically (`90` → `1h 30m`).
  - **Story point estimate** — bordered hover input.
  - **Reporter** — avatar + name.
  - When the issue has subtasks, **Due date / Start date / Original estimate** become readonly roll-up chips:
    - ETA = sum of subtask ETAs
    - Start date = min of subtask start dates
    - Due date = max of subtask due dates
- All field changes PATCH immediately and dispatch `quiktrack:issue-updated`; the BacklogView listens and pre-trims local state, then refreshes loaded sections.
- Switching to a SUBTASK no longer flashes in the backlog (cache-side filter removes EPIC/SUBTASK rows on every patch and refresh).

## Spaces table — row delete

- Removed the "Move to trash" entry per request; the Spaces row menu now only lists **Space settings**.

## Settings page

- Full-page Space settings shell:
  - Inner sidebar (Details, Access, Types and workflows, Hierarchies (TRY tag), Fields, Notifications, Features, Automation, Slack integration).
  - Back button → returns to the project board.
  - Project icon + name + type label header.
- **Details** form:
  - Name, Space key (uppercase, regex), Space owner (read-only).
  - Removed Category and Default-assignee fields.
  - Inline emoji-picker icon (centered).
  - Friendly error message for unique-key conflicts (`P2002` → "This space key is already in use").

## API additions / changes

- `/api/projects/:id` PATCH — friendly conflict error for unique projectKey.
- `/api/projects/:id/members` — used for assignee pickers.
- `/api/issues` GET — `excludeType` query param (single value or comma-separated, mapped to Prisma `not` / `notIn`); `parentId` filter; cursor pagination with `total`.
- `/api/issues` POST — supports `parentId`, `epicId`, `eta` (hours), and the extended `type` enum (`TASK | BUG | STORY | EPIC | SUBTASK`).
- `/api/issues/:id` GET — now includes `parent: { id, key, title, type }` for breadcrumbs.
- `/api/issues/:id` PATCH — supports `sprintId: null` (detach to backlog).
- `/api/issues/:id` DELETE — **cascade soft-delete**: any non-deleted issue with `parentId = <issueId>` is also marked deleted in the same transaction; response includes `deletedChildCount`.
- `/api/sprints` GET — cursor pagination with per-sprint TODO/IN_PROGRESS/DONE counts; counts exclude `EPIC` and `SUBTASK`.
- `/api/sprints/:id` PATCH / DELETE.
- `/api/sprints/:id/start` and `/complete` — complete accepts `{ moveOpenTo: <sprintId | "new" | "backlog">, newSprintName? }`.
- `/api/settings/company` GET — accent color.
- `/api/apps/switcher` GET — 3×3 launcher grid.
- `/api/activity` GET / POST — backed by `QtUserActivity` (raw SQL since the local Prisma client was stale with the lock).

## Schema

- `QtUserActivity` table for the For You "Viewed" feed (multi-tenant, indexed by `(tenantId, userId, viewedAt)`).
- `QtIssue.type` left as `String` so we can extend with `STORY` / `BUG` / `SUBTASK` without a migration.

## Tests

API tests added for new behaviour:
- `__tests__/api/issues.test.ts` — GET/POST happy paths + 401 / 400 / 404; `excludeType` single & comma-separated translation; `parentId` filtering; SUBTASK + parentId persistence.
- `__tests__/api/issue-detail.test.ts` — GET/PATCH/DELETE happy paths + 401; cross-tenant 404; VIEWER 403 on PATCH; `sprintId: null` detach; negative `storyPoints` 400; cascade DELETE transaction for an Epic.
- `__tests__/api/project-detail.test.ts` — GET/PATCH 401 / 404 / 400.
- `__tests__/api/sprints-detail.test.ts` — PATCH / DELETE 401 / 404 / 403; ACTIVE-status DELETE 409; soft-delete + detach issues.
- `__tests__/api/projects.test.ts`, `apps-switcher.test.ts`, `activity.test.ts`, `settings-company.test.ts`.

Component / unit tests:
- `__tests__/components/spaces-grid.dom.test.tsx`.
- `__tests__/components/create-issue-modal.dom.test.tsx` — Priority field hidden for Epic work type.
- `__tests__/unit/eta-rollup.test.ts` — `rollUpEta`, `rollUpStartDate`, `rollUpDueDate` (empty input, ignore null/negative, summation, earliest / latest, invalid-date rejection).

## Tooling / standards

- TipTap installed at v2.27.2 (react / pm / starter-kit / link / image / placeholder / underline / text-align / table + table-row / -header / -cell). Hoisting fixed so app-local `node_modules` doesn't shadow the root with a v3 copy.
- App-level `CLAUDE.md` rule **#8**: components must stay under 300 lines; split when crossed (sub-components into siblings, static config into `*-meta.ts`, popovers into own files).

---

## Outstanding / future

These are out of scope for the items above but called out so they don't get lost:

- Pull the inline `SubtaskGridRow`, `SubtaskEtaCell`, the four detail-row pickers, and the Add-epic / Confirm-delete dialogs out of `edit-issue-modal.tsx` into siblings under `components/edit-issue-drawer/` to honour the new 300-line rule (the file is currently >1k lines).
- Wire **Labels**, **Team**, **Linked work items** (currently placeholders) once the schema is approved.
- Subtasks panel: real "Choose existing" search modal.
- Sprint / Backlog: bulk-select via row checkboxes (UI present, no actions yet).
- E2E tests (Playwright) for the create / edit / delete-with-subtasks flows.
