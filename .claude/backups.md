# QuikIT — Backup Registry

**Purpose:** This file lists every backup snapshot of the QuikIT repository. Every time a backup is created, **append a new row to §2 and update the "Last updated" line above the registry**. Do NOT rewrite or compact existing rows — the history itself is part of the audit trail.

**Last updated:** 2026-04-12 09:46 IST (post-R10h snapshot — Meeting Rhythm + Performance People phases complete)

---

## 1. How backups work in this repo

Backups are **local-only git branches** that point at a parentless commit produced by `git commit-tree`. They preserve a snapshot of the entire working tree at a point in time without:

- disturbing the working directory
- creating a merge commit
- adding to the feature/dev/uat/main linear history
- consuming any extra disk (git dedupes by tree hash)

They are **never pushed to origin** by convention — backups are your personal safety net. Origin only tracks the real release path: `feature/* → dev → uat → main`.

### Creating a backup

```bash
# At any point when you want to snapshot the current HEAD:
TS=$(date +%Y%m%d-%H%M%S)
git commit-tree HEAD^{tree} -p HEAD -m "backup: <reason> (${TS})" \
  | xargs -I{} git branch "backup/<slug>-${TS}" {}
```

**Slug conventions:**
- `pre-<thing>` for "before I start X" snapshots — e.g. `pre-teams-kpi`, `pre-analysis`, `pre-r7-push`
- `post-<thing>` for "after X is complete and merged" — e.g. `post-r7-push`, `post-release-v1.2`
- Always timestamp in `YYYYMMDD-HHMMSS` (local time) so branches sort chronologically

After creating the backup, **append a new row to §2 below** and bump the "Last updated" line at the top of this file.

### Listing backups

```bash
git branch -l "backup/*"
git log --oneline --graph backup/pre-testing-harness-20260411-090937   # inspect one
```

### Restoring from a backup

```bash
# 1. Inspect what would change
git diff HEAD..backup/<name>

# 2a. Checkout the exact snapshot (read-only browse)
git checkout backup/<name>

# 2b. Reset current branch to match the backup (DESTRUCTIVE — stash first!)
git stash                                    # if you have unsaved work
git reset --hard backup/<name>

# 2c. Cherry-pick individual files from the backup into your current branch
git checkout backup/<name> -- path/to/file.ts
```

### Pruning old backups

Keep every backup that represents a logical milestone — they cost nothing on disk after `git gc`. Only delete a backup if:

1. It's older than 6 months **and**
2. It sits before a tagged release on main (so the release tag is a better landmark anyway)

```bash
git branch -D backup/<name>      # local delete; also scrub from this file
```

---

## 2. Registry

Ordered chronologically (oldest first). Each row lists: name, hash, ISO date (local time), reason, the commit the snapshot sits **in front of** (parent), and the repo state captured.

| # | Branch | Hash | Date | Reason | Parent commit | Repo state snapshot |
|---|---|---|---|---|---|---|
| 1 | `backup/pre-teams-kpi-20260410-163306` | `328ab68` | 2026-04-10 16:33 | Safety net before the "Team KPI Phase 1/2" feature work started | `a4a4ae5` (`Merge uat into main`) | Pre-Team-KPI main state. Before OPSP rebuild, before the testing harness, no `withTenantAuth` helper, no AuditLog helper, no rateLimit helper. |
| 2 | `backup/pre-analysis-20260411-010643` | `0061d0a` | 2026-04-11 01:06 | Safety net before the full-codebase analysis and R1/R2 cleanup began | `a4a4ae5` (`Merge uat into main`) | Same baseline as row 1. Taken independently before the code-analysis scorecard work started. |
| 3 | `backup/pre-testing-harness-20260411-090937` | `3d943d9` | 2026-04-11 09:09 | Safety net before the Vitest/Testing-Library/Playwright harness was wired into the repo and R1/R2 cleanup commits landed | `7d3bb54` (`feat: major OPSP rebuild + Team KPI Phase 1/2 + inconsistency fixes`) | Post-OPSP-rebuild, post-Team-KPI Phase 1/2. No tests, no CI coverage ratchet, no AuditLog/rateLimit/sanitizeHtml helpers, no OPSP decomposition. |
| 4 | `backup/pre-r7-push-20260412-005146` | `d7f411a` | 2026-04-12 00:51 | Safety net taken **after** the R3-R7 cleanup rounds were complete locally but **before** anything was committed/pushed — captures the working tree exactly as it was when I started `git add`-ing | `12c19de` (`feat: testing harness + 2-round code cleanup (175 tests, 13 tasks green)`) | R3-R7 work complete in the working tree: +168 tests (175→343), OPSP 2225→1363, KPIModal 1090→968, LogModal 1017→846, withTenantAuth 8→24, AuditLog/rateLimit/sanitizeHtml/quarterGen helpers live, blue→accent sweep reverted for 4 locked tables, Table IDs text-gray-900, CLAUDE.md 🔒 LOCKED TABLES section added, sidebar w-full fix, AddButton component. **Uncommitted state.** |
| 5 | `backup/post-r7-push-20260412-005840` | `e42712c` | 2026-04-12 00:58 | Safety net **after** the R3-R7 commit landed and was promoted through `feature → dev → uat → main` with all 343 tests green on every branch | `5ea60aa` (`feat: R3-R7 cleanup rounds + theming lockdown + sidebar fix`) | Same code as row 4 but now committed as `5ea60aa` and promoted through all 4 branches (feature/dev/uat/main). Use this as the restore point for "everything working just before any further changes." |
| 6 | `backup/post-r10h-20260412-094624` | `78a4205` | 2026-04-12 09:46 | Safety net after Meeting Rhythm module (R8–R9) + Performance People phases (R10a–h) completed locally. **Uncommitted** — ~50 modified/new files in working tree. | `5ea60aa` (`feat: R3-R7 cleanup rounds + theming lockdown + sidebar fix`) | Full Meeting Rhythm: 8 pages + 4 API routes + 5 Scaling Up template seeds + MeetingCadenceList shared component + TemplateModal CRUD + 130 meeting tests. Full Performance People: 3 new Prisma models (Goal, OneOnOne, FeedbackEntry) + 6 API routes + 5 pages (Cycle Hub, Self-Assessment, Goals, 1:1s, Feedback) + review schema extended to 7-state workflow + sidebar split into Analytics (4 items) + People (7 items) + 24 schema tests. AddButton shared component (6 tests). Semantic table colors locked (4 tables). Blue→accent sweep complete except avatar palettes. Sidebar w-full fix. 497 tests total, 10/10 turbo green. Coverage baseline: 21.1% lines (lib/api at 91%). **All local — not committed or pushed yet.** |

---

## 3. Quick-restore cheatsheet

If something breaks and you need to go back to a known-good state:

```bash
# The most recent "everything green" state (use this 99% of the time):
# NOTE: This is an UNCOMMITTED snapshot — it captures the working tree
# with ~50 new/modified files including Meeting Rhythm + Performance People.
git reset --hard backup/post-r10h-20260412-094624

# The last COMMITTED + PUSHED state (R3-R7 on all 4 branches):
git reset --hard backup/post-r7-push-20260412-005840

# Just before the R7 push, if you want to re-do the commit differently:
git reset --hard backup/pre-r7-push-20260412-005146

# Back to the pre-testing-harness baseline (wipes all R1-R7 work):
git reset --hard backup/pre-testing-harness-20260411-090937

# Back to the pre-Team-KPI baseline (wipes OPSP rebuild + Team KPI + all cleanup):
git reset --hard backup/pre-teams-kpi-20260410-163306
```

**Before any destructive reset:**

```bash
git status                                    # check you have nothing unsaved
git stash push -u -m "pre-restore safety"     # if you do
git log --oneline -10                          # note the current HEAD in case you change your mind
```

After a reset, you can always get back to the branch tip with:

```bash
git reflog                                    # find the commit you came from
git reset --hard HEAD@{N}
```

---

## 4. What is NOT backed up here

- **Database contents** — the Postgres dev DB is separate. Use `pg_dump` if you need DB snapshots.
- **`.env.local` files** — intentional; secrets never get stored in git, backup or otherwise.
- **`node_modules/` and `.next/` build output** — derived artifacts, restore via `npm install` and `npm run dev`.
- **`coverage/` HTML reports** — regenerate with `npx vitest run --coverage`.
- **Uncommitted working-tree changes that existed before the snapshot** — `commit-tree` captures `HEAD^{tree}`, which is the last committed state, not your working dir. If you need to preserve uncommitted work, `git stash` first and include the stash in the backup note.

---

## 5. Policy

1. **Create a backup before any destructive or large refactor.** Rule of thumb: if you're about to run a command with `--hard`, `--force`, `rm`, `rebase -i`, or touch more than ~10 files at once, snapshot first.
2. **Create a backup after every successful promotion to main.** That's the `post-*-push` convention — gives you a clean landmark you can always roll back to.
3. **Update this file in the same session the backup is created.** Do not let the registry drift from the actual `backup/*` branches.
4. **Never push backup branches to origin** unless the user explicitly asks. They are personal safety nets.
5. **Never reuse backup branch names.** Timestamps prevent collisions automatically.
