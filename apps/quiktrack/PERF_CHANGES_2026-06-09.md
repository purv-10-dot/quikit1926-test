# QuikTrack Performance Changes — 2026-06-09 (QA / Test Guide)

Performance pass on the QuikTrack app (`apps/quiktrack`, port 3004). Three themes:
1. **Middleware** — stop a per-navigation remote auth round-trip in dev.
2. **Data fetching** — route reads through React Query (shared cache, dedup, no dev double-fetch); add a `/full` aggregate endpoint for the work-item view.
3. **Bundles** — code-split the rich-text editor app-wide; lazy-load heavy modals; dodge a `@quikit/ui` barrel import.

No DB schema changes. No `packages/` changes. No new top-level dependencies.

---

## How to run / verify

```powershell
# stop any running dev server first (it holds port 3004 + the Prisma DLL)
cd apps/quiktrack ; npm run dev          # dev (fastest iteration)
# or, to test the production behavior + bundle sizes:
cd apps/quiktrack ; npm run build ; npm start
```

In the browser, open **DevTools → Network**, tick **Disable cache**, and watch request counts + timing.

> **Tests:** `npm run test` (vitest) currently fails to start on **Node 18** (this repo needs Node ≥ 20.12 for vitest/rolldown). Run the suite on a Node-20 machine / CI. All TypeScript + ESLint checks pass locally.

---

## 1. Middleware — remote session validation gated to production

**File:** `middleware.ts`
**Change:** added `enforceRemoteSessionValidation: process.env.NODE_ENV === "production"`. In dev, navigations no longer make a blocking HTTP call to the auth app (:3001) on every page. Production behavior is **unchanged** (still validates).

**Impact / test:**
- ✅ Dev: navigating between pages should feel noticeably faster; Network shows no `/api/verify-token` round-trip gating each page.
- ✅ Auth still works: log out → protected routes (`/dashboard`, `/spaces/...`) redirect to login; log in → lands back correctly.
- ✅ Production build (`npm start` with `NODE_ENV=production`): session validation still enforced (revoked/expired sessions bounce to login).
- ⚠️ **Regression watch:** confirm a logged-in user is NOT unexpectedly logged out in dev, and that an expired session still redirects in a prod build.

---

## 2. React Query data fetching (shared cache + dedup)

**New file:** `lib/hooks/useApiData.ts` — thin React Query wrapper over the `{ success, data }` envelope (60s cache, `select` to unwrap, `url=null` to disable).

Project lookups now use **shared query keys** across every space view, so members/statuses/sprints are fetched once and reused on navigation (and the dev React-StrictMode double-fetch collapses to one request).

**Files changed:**
- `components/issue-full-view/issue-full-view.tsx`
- `components/issue-full-view/issue-details-panel.tsx` (members now passed as a prop, not refetched)
- `components/linked-work-items.tsx` (links read via React Query; create/unlink/auto-link now invalidate)
- `components/issue-attachments.tsx`
- `components/issue-activity.tsx` (comments/history/worklogs; posting a comment updates cache)
- `app/(dashboard)/spaces/[id]/backlog/_components/backlog-view.tsx`
- `app/(dashboard)/spaces/[id]/board/_components/board-view.tsx`
- `app/(dashboard)/spaces/[id]/task-table/_components/task-table-view.tsx`
- `app/(dashboard)/spaces/[id]/grouped-kanban/_components/grouped-kanban-view.tsx`
- `app/(dashboard)/spaces/[id]/timeline/_components/timeline-view.tsx`

**Impact / test — for EACH view (backlog, board, task-table, grouped-kanban, timeline) + the work-item view:**
- ✅ Assignee avatars render, status dropdowns populate, sprint pickers populate.
- ✅ **Add People modal:** add/remove a member → avatar stacks / assignee lists update across views without a page reload (now via cache invalidation).
- ✅ Navigating backlog ↔ board ↔ work item does NOT refetch members/statuses/sprints (Network shows them cached).
- ✅ **Board specifically:** create/rename/reorder/delete a status column still works (statuses stay locally editable there — not converted).
- ⚠️ **Regression watch:** empty states (e.g. "No linked work items", "No comments yet") still show correctly; loading skeletons still appear on first load.

---

## 3. Work-item aggregate endpoint `/api/issues/[id]/full`

**New files:** `app/api/issues/[id]/full/route.ts`, `__tests__/api/issue-full.test.ts`
**Wiring:** `components/issue-full-view/issue-full-view.tsx` now fetches `/full` and seeds the sibling caches (links/comments/history/attachments) inside its queryFn. Because child panels mount only after the issue loads (skeleton gate), they read warm cache → **opening a work item is ~1 request instead of ~6.**

**Impact / test — open a work item (`/spaces/[id]/work/[issueId]` or the slide-over):**
- ✅ **Network:** a single `GET /api/issues/<id>/full` fires; the separate `links` / `comments` / `history` / `attachments` requests should NOT fire on open (served from seeded cache).
- ✅ Issue title/description, Details panel (assignee, priority, sprint, dates, reporter), subtasks, linked items, comments, history, attachments all render.
- ✅ Edit a field (status/assignee/sprint/date) → persists and the panel reflects it (issue refetches via `/full`, re-seeding the rest).
- ✅ Post a comment → appears immediately; add/remove a linked item → list updates; switch Activity tabs (All/Comments/History/Work log).
- ✅ **Permissions:** a non-member / cross-tenant user gets 404 from `/full` (same as the individual routes).
- ⚠️ **Regression watch:** the data shown via `/full` must match what the individual endpoints returned — spot-check a comment's author name, a linked item's status badge, an attachment thumbnail.

---

## 4. Rich-text editor code-split (app-wide bundle reduction)

**New file:** `components/rich-text-editor-lazy.tsx` (wraps the editor in `next/dynamic`, `ssr: false`).
**Changed:** `components/rich-text-editor.tsx` now exports its props type; **6 consumers** repointed to the lazy wrapper:
`create-issue-modal.tsx`, `edit-issue-modal.tsx`, `issue-activity.tsx`, `issue-full-view/issue-header-sections.tsx`, `spaces/[id]/docs/_components/doc-editor.tsx`, `share/[token]/_components/public-doc.tsx`.

**Impact / test — anywhere the editor appears:**
- ✅ **Comment box** (work-item Activity), **issue description** edit, **Create issue** modal, **Edit issue** modal, **Docs** editor (`/spaces/[id]/docs/...`), **public shared doc** (`/share/[token]`).
- ✅ Editor still works: typing, formatting toolbar, slash menu, `@`-mentions, emoji picker, image insert/paste, tables.
- ⚠️ **Expected behavior change:** a brief load placeholder the first time an editor surface mounts (chunk loads on demand). This is intentional and one-time per session.
- ⚠️ **Regression watch:** public shared doc (`/share/[token]`) renders its content (now client-loaded). Confirm content appears.

---

## 5. Lazy modals + `@quikit/ui` Pagination (board & list bundles)

- **Board** (`board-view.tsx`) and **List** (`list-view.tsx`): `EditIssueModal` now loaded via `next/dynamic` (only when a card/row is opened).
- **List** Pagination: new local `components/pagination.tsx` replaces the `@quikit/ui` barrel import (which pulled framer-motion + canvas-confetti). Marked `TODO(integration)`; behavior identical.

**Impact / test:**
- ✅ **Board:** click a card → edit modal opens (brief first-open load), edits save, board refreshes.
- ✅ **List:** click a row → edit modal opens and works; **pagination control**: Previous/Next, "Rows per page" selector, "Showing X-Y of N" count all work; CSV import/export modal still works.
- ⚠️ **Regression watch:** the list pagination looks/behaves identical to before (it's a faithful copy).

---

## 6. Bundle sizes (production build, First Load JS)

Verify with `npm run build` — the `/spaces/[id]/*` routes should be in the ~99–152 kB range (were 337–458 kB):

| View | Before | After |
|---|---|---|
| backlog | 402 kB | ~152 kB |
| board | 393 kB | ~114 kB |
| list | 458 kB | ~99 kB |
| task-table | 381 kB | ~131 kB |
| grouped-kanban | 400 kB | ~150 kB |
| timeline | 381 kB | ~130 kB |
| work/[issueId] | 377 kB | ~126 kB |
| docs/[docId], docs/new | 354 kB | ~103 kB |
| share/[token] | 337 kB | ~86 kB |

---

## 7. Cleanup (no behavior impact)

- Removed 10 orphaned Prisma engine temp files (`node_modules/.prisma/client/query_engine-windows.dll.node.tmp*`, ~184 MB). The real engine is intact; nothing to test.

---

## Hand-offs (outside this app's scope)

1. **Run the test suite on Node ≥ 20.12 / CI** — vitest can't start on Node 18 here.
2. **Integration owner:** add `"sideEffects": false` to `packages/ui/package.json` (one line). This makes `@quikit/ui` tree-shakeable for every app and lets the local `components/pagination.tsx` copy be reverted. Until then, the local copy is the workaround.

---

## Quick regression checklist

- [ ] Dev navigation is fast; login/logout/protected-route redirects still work.
- [ ] Each space view: avatars/statuses/sprints load; Add-People updates them live.
- [ ] Board: status columns create/rename/reorder/delete.
- [ ] Work item: opens with 1 `/full` request; edit/comment/link/attachment all work; cross-tenant = 404.
- [ ] Editor works everywhere (comment, description, create/edit modal, docs, public share).
- [ ] List pagination + CSV import/export work.
- [ ] `npm run build` succeeds; `/spaces/*` bundles in the ~100–150 kB range.
