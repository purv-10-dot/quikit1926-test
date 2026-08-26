# AI-Runtime Enabler — Decisions

AI-Runtime enabler work on `feature/demo-unified`. QuikPilot Phase 0's own
decisions live separately in `QuikPilot-Decisions-Log.md` on
`quikpilot-phase0` — different workstream, different branch. Keep them in
separate files: the two branches have not met yet, and a same-named file with
unrelated content would merge badly.

Durable decisions and deferred work, newest first. Each entry records what was
decided, why, and what was deliberately NOT done — the last part is the one
that saves the next session.

---

## 2026-08-20 — Issue routes accept an id or a key

**Session:** `session-issue-key-resolution.md`

The AI Runtime created `QUIKSC-290`, called `GET /api/issues/QUIKSC-290`, got a
404, and correctly told the user *"it might be a key instead of an ID"* — then
could not act, because nothing converted one into the other and `list_issues`
had no lookup parameter.

**Decided.** The eight manifest issue operations that share `ISSUE_ID_DESC` now
resolve either form through `lib/mcp/resolveIssue.ts` — one indexed query
matching `id` OR `key`, org-scoped, never a format sniff:

`get_issue`, `update_issue`, `delete_issue`, `summarize_issue`,
`list_issue_comments`, `add_issue_comment`, `move_issue`, `link_issues`
(plus `link_issues`' `targetIssueId`, so the self-link guard compares like
with like).

**All eight, not just the failing one.** `ISSUE_ID_DESC` is shared across all
eight operations. Converting three would have forced a second constant for the
rest — reintroducing exactly the wording drift the shared constant exists to
prevent.

**The real finding was not the lookup.** Five of the routes reused the raw
`params.id` *after* the lookup, for queries and one write. With a key those do
not throw — they return an empty result inside a 200, or store the key in a
cuid foreign-key column (`sourceIssueId` on `POST /links`). The rule is now
*resolve once at the top, then never touch the path param again*, enforced by
`__tests__/unit/issue-id-resolution-guard.test.ts` rather than by comment.

**Not done, deliberately.**

- **Non-manifest issue routes stay id-only** — `/history`, `/watch`,
  `/attachments`, `/releases`, `/remote-links`, `/transitions`,
  `/transition-log`, `/transition-screen`, `/full`, `/development`,
  `/comments/[commentId]`, `/links/[linkId]`. No AI operation reaches them and
  the browser always has the cuid. Adding the resolver to one of them opts it
  into the guard test automatically.
- **`log_time`'s `issueId`** (`POST /api/timesheets`) still takes a cuid only.
  Different route, out of scope; its manifest description remains accurate.
- **No code change to `list_issues`' `search`** — see the next entry.

---

## 2026-08-20 — `list_issues` search: documented, not narrowed

**Session:** `session-issue-key-resolution.md` (§3, revised mid-session)

The session brief asked for a `search` parameter on `GET /api/issues` covering
key and title but **not** description, reasoning that a wrong match is worse
than no match once the resolved id flows into a write.

**The premise was wrong.** `search` already existed, already covered key,
title AND description, and was already wired into the board, backlog, list,
grouped-kanban and saved-filter search boxes. So the request was not *add a
lookup* but *remove a capability humans already use* — and the "wrong match is
worse than none" reasoning was written for the former.

**Decided.** No code change. The manifest now describes what is actually
there — substring match over key, title and description, case-insensitive —
with an explicit steer that it is **not** an exact lookup, that a description
hit may merely mention the phrase, and that a caller holding a key should use
`get_issue` instead, which resolves exactly.

**Why not a narrowed opt-in parameter** (`searchFields=key,title`), which was
the better answer in isolation: `list_issues` requires `projectId`, so `search`
was never the key-recovery path — the runtime must already know the project.
Key recovery is `get_issue`'s job, and the entry above gives it exactly that.
A new parameter would have solved a problem that was already solved.

Honest description of real behaviour beat a new parameter.

---

## Deferred

### `list_sprints` — no `search` parameter

Sprint lookup fails in the same shape as the issue failure above
("summarise the June Sprint") and has done twice in the AI Runtime's testing.
`GET /api/sprints` takes `projectId` and no name filter, and sprint routes
remain id-only — `where: { id }` with no key or name fallback.

**Why it can wait, where the issue equivalent could not.** Sprints are few per
project, so a client-side scan of `list_sprints?projectId=…` is viable. The
issue equivalent was not: 279 issues in QuikScale alone, and scanning them
breaks against `limit`. The AI Runtime is working around it in the meantime.

Note that `SPRINT_ID_DESC` in `lib/api/aiManifest.ts` still correctly states
that sprints are id-only. If sprint resolution is added, that description, the
id/key asymmetry note above it, and the scope list in
`__tests__/unit/issue-id-resolution-guard.test.ts` all need updating together.
