# Session — accept issue keys on get_issue, and add search to list_issues

**Branch:** `feature/demo-unified`, own commit
**Requested by:** AI Runtime, from a live failure trace
**Scope:** two small additions to existing routes. No new concepts.

---

## 1. What failed, and why the manifest fix didn't prevent it

The chained-parameter descriptions shipped and work — the manifest now says *"The issue's `id`
from `list_issues` or `get_issue` — a cuid such as `cmsrk1p2h0007…`"*.

The assistant read that correctly. It created `QUIKSC-290`, then a few turns later called
`GET /api/issues/QUIKSC-290`, got a 404, and told the user unprompted: *"The ID might be
incorrect, or it might be a key instead of an ID."*

**It diagnosed its own failure and still could not act.** It knew `QUIKSC-290` was a key. It had
no way to turn one into the other, and neither does the runtime — `list_issues` has no lookup
parameter, so the only path is fetching every issue in a project (279 for QuikScale) and scanning
client-side, which breaks against `limit`.

The underlying problem is an asymmetry we created: **`list_projects` accepts `search`, and
project routes accept `id` or `projectKey`. Issues accept neither.** So the model is rewarded for
passing a human identifier to a project and punished for the same pattern on an issue. A first
success teaching the wrong generalisation is harder to recover from than a uniform rule in either
direction.

---

## 2. Part one — `get_issue` accepts a key

**There is already a resolver.** `lib/mcp/resolveIssue.ts` exports `resolveIssueIdOrKey`, covered
by `__tests__/unit/mcp-resolve-issue.test.ts`. Read both before writing anything.

It does one indexed query:

```ts
where: { orgId, isDeleted: false, OR: [{ id: value }, { key: value.toUpperCase() }] }
```

So this is **not** a format sniff and must not become one. No regex on cuid shape, no guessing —
one lookup that matches either column. The uppercasing means `QUIKSC-290` from our own create
response round-trips correctly, which is the exact path that failed.

**Wire it into the REST route** at `app/api/issues/[id]/route.ts` so the existing `id` path
parameter accepts either form. Same shape as projects accepting `id` or `projectKey` — one
argument, two accepted values, no manifest change on the runtime's side.

Decide and report which of these the change applies to, rather than assuming:

- `GET /api/issues/[id]` — definitely, this is the failure
- `PATCH` / `DELETE` on the same file — probably, for the same reason a user will say
  `QUIKSC-290` when asking to update or delete
- `app/api/issues/[id]/comments`, `/move`, `/full`, `/summary` — check whether they resolve the
  issue themselves or receive it from a shared helper

If a shared helper already resolves the issue for several of these, change it there once rather
than in each route.

**Careful with `resolveIssueIdOrKey`'s org scoping.** It takes `orgId` and filters on it. The
route must pass `ctx.orgId`, never a value from the request — this is a lookup by a
human-guessable identifier, so cross-org leakage is the thing to prevent.

---

## 3. Part two — `search` on `list_issues`

Add a `search` query parameter to `GET /api/issues`, matching `list_projects`'s existing `search`
in shape and behaviour. Read that implementation and follow it.

**Key and title only. Not description.** This is a deliberate limit, and the reasoning belongs in
a comment because someone will otherwise "improve" it later:

> A hundred issues mention "login redirect" in their body; one is titled it. A lookup that
> returns the wrong issue is worse than one that returns none — especially now that the resolved
> id flows into a write. Key and title are near-unique; description is not, and the model has no
> way to tell a good match from a plausible one. Missing a match means the user rephrases; a
> wrong match means we update the wrong issue.

Key matching should be case-insensitive and match the same way `resolveIssueIdOrKey` does, so the
two behave consistently.

**Then update the manifest** — `list_issues` gains `search` with a description saying what it
covers (key and title) and, explicitly, what it does not (description). The runtime reads these
descriptions and acts on them, so stating the limit is as useful as stating the capability.

---

## 4. Not in this session

**`list_sprints` search — deferred, deliberately.** Sprint lookup fails in the same shape
("summarise the June Sprint") and has done twice in the runtime's testing. It is less urgent only
because sprints are few per project, so a client-side scan of `list_sprints?projectId=…` is
viable where the issue equivalent is not. The runtime is working around it in the meantime. Do
not add it here; do note it wherever the team tracks follow-ups.

No description search. No changes to `list_projects`. No new routes.

---

## 5. Verification

1. `NODE_OPTIONS=--max-old-space-size=8192 npm run typecheck -w apps/quiktrack` — clean, run alone.
2. `npx eslint` clean on changed files.
3. `__tests__/unit/mcp-resolve-issue.test.ts` must pass **unmodified** — if it needed editing, the
   resolver changed when it should only have gained a caller.
4. New tests: `GET /api/issues/[id]` resolves a cuid; resolves a key; resolves a lowercase key;
   404s on an unknown key; **404s on a key belonging to another org** (the important one);
   `search` matches on key; matches on title; does **not** match on a description-only hit.
5. `npx vitest run __tests__/api/agent-jwt-write-routes.test.ts __tests__/unit/agent-jwt-session-guard.test.ts __tests__/api/agent-jwt-routes.test.ts` — 100 must still pass.

*(If vitest will not start: this branch has a vite 8 / rolldown packaging issue on Windows —
`rm -rf node_modules/rolldown/node_modules/@rolldown/binding-win32-x64-msvc` immediately before
running, with no npm command in between. If it still fails, say so and report which checks you
could and could not run.)*

---

## 6. STOP AND READ BACK

**Do not write any code yet.**

Read `lib/mcp/resolveIssue.ts`, its test, `app/api/issues/[id]/route.ts`, `app/api/issues/route.ts`,
`app/api/projects/route.ts` (for the `search` precedent), and `lib/api/aiManifest.ts`. Then report:

1. Which routes you propose changing for Part 1, and whether a shared helper covers several of
   them.
2. How `list_projects` implements `search`, quoted, and how closely you will match it.
3. Whether `resolveIssueIdOrKey`'s signature needs changing to serve a REST route, or whether it
   is usable as-is. **If it needs changing, stop and say so** — it has an existing caller in
   `lib/mcp/`.
4. Anything in the manifest that will need updating beyond `list_issues`'s new parameter.
5. Any route where accepting a key would change behaviour beyond lookup — e.g. somewhere the raw
   `id` value is stored, logged, or returned to the caller.
6. Any question you would otherwise have guessed the answer to.

**Wait for approval before making a single edit.**
