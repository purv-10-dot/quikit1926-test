# Functional Template — Design & Implementation Doc

**Status:** Draft (awaiting approval to implement)
**Author:** QuikTrack
**Date:** 2026-06-18

---

## 1. Summary

Today QuikTrack ships a single enabled space template: **Scrum** (sprints + a
backlog; the board only shows work once a sprint is started).

This adds a second template: **Functional**. A Functional space is a lighter,
Kanban-style workflow with **no sprints** — there is a backlog and a board, the
board shows *all* work organized by status (no "start a sprint" gate), the
backlog heading is **renamable**, and the board is labelled **"Activity Board"**.

Everything else (issue types, statuses, roles, permissions, all other tabs)
behaves exactly like a Scrum space.

---

## 2. Decisions (confirmed)

| # | Question | Decision |
|---|----------|----------|
| 1 | What feeds the board (no sprints)? | **All backlog tasks, Kanban-style** — board = every issue grouped by status column. No active-sprint gate. |
| 2 | How do we know a space is Functional? | **New `templateKey` column on `QtProject`** (persisted at creation). `"scrum"` \| `"functional"`. |
| 3 | Rename backlog scope | **Functional only.** Persisted per-space label; **inline edit** on the backlog heading. |
| 4 | Sprints in Functional | **Fully hidden** — no sprint creation, no sprint sections, no start-sprint. |
| 5 | Tabs shown in Functional | **All 9 tabs stay** (Summary, Timeline, Backlog, Board, Grouped Kanban, List, Task Table, Timesheet, Docs). Only behavior/labels differ. |
| 6 | Board name | **Fixed `"Activity Board"`** in Functional (Board tab + board heading). Not user-editable. Derived from `templateKey`, no extra field. |

### Scrum vs Functional at a glance

| Aspect | Scrum (existing) | Functional (new) |
|---|---|---|
| `templateKey` | `"scrum"` | `"functional"` |
| Sprints | Yes (create / start / complete) | **None — hidden everywhere** |
| Board feed | Issues in **ACTIVE** sprints only; empty board + CTA when no active sprint | **All issues** grouped by status (Kanban) |
| Board label | "Board" | **"Activity Board"** (fixed) |
| Backlog heading | "Backlog" (fixed) | "Backlog" by default, **renamable** (`backlogName`) |
| Tabs | All 9 | All 9 (unchanged) |
| Seeded statuses / types / roles | Defaults | **Same defaults** |

---

## 3. Data model changes

Two new fields on `QtProject` ([schema.prisma](../../../packages/database/prisma/schema.prisma)).

```prisma
model QtProject {
  ...
  /// Which template the space was created from. Drives runtime behavior:
  ///   "scrum"      → sprints + sprint-gated board (default; all existing spaces)
  ///   "functional" → no sprints; Kanban-style "Activity Board"; renamable backlog
  templateKey  String  @default("scrum")
  /// Custom backlog heading. Honored only for functional spaces; null → "Backlog".
  backlogName  String?
  ...
}
```

- **Backfill:** `@default("scrum")` means every existing space is treated as
  Scrum automatically. No data migration needed beyond the column add.
- **Migration:** lands as a separate Prisma migration. ⚠️ Per
  `apps/quiktrack/CLAUDE.md`, schema changes require integration-owner sign-off
  and migrations land separately from app code — this must be called out in the PR.

---

## 4. Implementation plan (file-by-file)

### 4.1 Creation flow

| File | Change |
|---|---|
| [templates-picker.tsx](../app/spaces/templates/_components/templates-picker.tsx) | Add a `functional` entry to `TEMPLATES` with `enabled: true`, a title ("Functional"), description, and an illustration. |
| [create-project-form.tsx](../app/spaces/new/_components/create-project-form.tsx) | Add `functional` to its local `TEMPLATES` map; **include `templateKey` in the POST body** (it currently sends none). |
| [validation/project.ts](../lib/validation/project.ts) | `createProjectSchema`: add `templateKey: z.enum(["scrum","functional"]).optional()`. `updateProjectSchema`: add `backlogName: z.string().max(120).nullable().optional()`. |
| [api/projects/route.ts](../app/api/projects/route.ts) | Persist `templateKey` (default `"scrum"`) on `qtProject.create`. |

### 4.2 Reading templateKey

- `GET /api/projects/[id]` already returns all scalar fields, so `templateKey`
  and `backlogName` are available with no route change.
- `PATCH /api/projects/[id]` already spreads `parsed.data`, so `backlogName`
  edits flow through once it's in `updateProjectSchema`.

### 4.3 Board — Kanban feed + label

[board-view.tsx](../app/(dashboard)/spaces/[id]/board/_components/board-view.tsx)

- Fetch the project's `templateKey`.
- **When `functional`:** render columns fed by issues **with no `sprintId`
  filter**. The issues API already treats an absent `sprintId` as "no sprint
  filter" (see [issues/route.ts](../app/api/issues/route.ts) — `sprintId`
  absent → all issues). So `BoardColumn` is rendered without the active-sprint
  gating, and the "no active sprint → empty columns + CTA" branch is skipped.
- **When `scrum`:** unchanged (current ACTIVE-sprint behavior).
- Board heading reads **"Activity Board"** when functional.

> Implementation note: `BoardColumn` currently takes a required `sprintId:
> string`. We'll either pass a sentinel (e.g. `""`/`"all"`) that makes the
> column omit the param, or make the prop optional. The column's fetch
> (`board-column.tsx`) sets `sprintId` in the query string unconditionally — it
> must omit it when in Kanban mode.

### 4.4 Header — Board tab label

[project-header.tsx](../app/(dashboard)/spaces/[id]/_components/project-header.tsx)

- The header already fetches `/api/projects/[id]`. Read `templateKey`.
- When functional, render the Board tab's label as **"Activity Board"**
  (the `path` stays `board`; only the visible label changes).

### 4.5 Backlog — hide sprints + inline rename

[backlog-view.tsx](../app/(dashboard)/spaces/[id]/backlog/_components/backlog-view.tsx)

- Fetch `templateKey` + `backlogName`.
- **When `functional`:**
  - Render **only the Backlog section** — suppress all sprint sections, the
    "Create sprint" control, and the Start-Sprint modal/affordances.
  - Replace the hardcoded `title="Backlog"` with `backlogName ?? "Backlog"`.
  - Add an **inline rename** affordance on the heading (edit icon / double-click
    → `PATCH /api/projects/[id]` with `{ backlogName }`). Shown only when
    functional.
- **When `scrum`:** unchanged.

---

## 5. Out of scope

- No change to seeded statuses, issue types, roles, or permissions — Functional
  uses the same defaults as Scrum.
- No change to the tab set (all 9 stay visible).
- No change to any Scrum-space behavior.
- The board name is not user-editable (fixed "Activity Board").

---

## 6. Risks / edge cases

- **Existing spaces:** all default to `scrum` via the column default — verified
  no behavior change for them.
- **`BoardColumn` prop contract:** making `sprintId` optional touches a shared
  component used by Scrum; the Scrum path must keep passing the active-sprint
  id list unchanged.
- **`backlogName` on a Scrum space:** ignored by design (only read in the
  functional branch), so a stray value is harmless.
- **Permissions:** Functional reuses the same `ProjectBacklog` / `Board` view
  grants — no new permission strings, so no `manifest.ts` change.

---

## 7. Test plan

- Create a Functional space → sprints absent in backlog; board shows all tasks
  by status; backlog renamable; Board tab + heading read "Activity Board".
- Create a Scrum space → unchanged (sprint-gated board, fixed "Backlog"/"Board").
- Existing spaces (no `templateKey`) → behave as Scrum.
- API tests for `POST /api/projects` (templateKey persisted) and
  `PATCH /api/projects/[id]` (backlogName update), per app testing rules.
