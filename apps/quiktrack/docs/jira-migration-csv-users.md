# Jira migration — CSV user mapping (proposal)

> Status: **Design proposal, not yet implemented.** Approve and Claude will build it.

A workaround for the Atlassian privacy-mode problem (see [`jira-migration-users.md`](./jira-migration-users.md) for context). Instead of relying on Atlassian to release emails through the API, the admin uploads a small CSV that maps every Jira accountId → real corporate email. The importer consults that CSV whenever Jira refuses to give us an email, and proceeds as if Atlassian had returned the address normally.

---

## 1. Why this works

Every Jira reference — issue assignee, reporter, comment author, worklog author, attachment uploader, project lead, sprint memberships — points at a user by **`accountId`**, not by email. The importer maintains an in-memory `accountId → quiktrackUserId` map that drives every link. Today it builds that map by:

1. Pulling `/users/search` from Jira.
2. For each user, looking up an existing `auth.User` by email — match by email is the only deterministic key QuikTrack has.

Atlassian hides the email for privacy-mode users → step 2 fails → that accountId never lands in the map → every issue / sprint / comment that referenced that user falls back to "importing admin" or `null`.

A CSV mapping fills the gap **at exactly the right point**: when step 2 fails, consult the CSV for the email and continue. The rest of the import — issues, sprints, attachments, comments, worklog — works unchanged, because all of it routes through the same `accountId → quiktrackUserId` map.

No code change is needed for issues, sprints, comments, worklog, or attachments. Only the user-resolution pass changes.

---

## 2. CSV format

One row per Jira accountId that needs mapping. Header row required.

```csv
accountId,email,firstName,lastName
712020:03582292-0f6f-4e48-9518-80496583c979,alice@moreyeahs.com,Alice,Sharma
5a5b904481e1b76853573fad,bob@moreyeahs.com,Bob,Verma
712020:021240a8-bee1-495c-8f1c-738b9580dfb6,carol@moreyeahs.com,Carol,Reddy
712020:5fe62865-7545-472f-8cc8-d2c273059513,david@moreyeahs.com,David,Singh
712020:a7ef8a62-4aba-4dba-9b91-842a79177a15,eve@moreyeahs.com,Eve,Patel
712020:bc6a6f71-1698-4e88-b475-4040a85432eb,frank@moreyeahs.com,Frank,Khan
64194d3d7222b08f3e722330,grace@moreyeahs.com,Grace,Mishra
712020:040269fa-8ece-419b-b131-4811171b65cb,heidi@moreyeahs.com,Heidi,Jain
```

### Field rules

| Field | Required | Notes |
|---|---|---|
| `accountId` | ✅ | Copy verbatim from the dry-run report's `unresolvedUsers` list. Both modern (`712020:uuid`) and legacy (`5a5b904481e1b76853573fad`) formats accepted. |
| `email` | ✅ | Lowercased on read. Must match the user's real corporate email — that's the key QuikTrack uses to match existing `auth.User` rows or to seed a new one. |
| `firstName` | optional | If omitted, taken from Jira `displayName` (first space-separated token). |
| `lastName` | optional | If omitted, taken from Jira `displayName` (everything after the first space). |

Encoding: UTF-8. Line endings: `\n` or `\r\n`. Quote fields containing commas: `"Lastname, Junior"`.

---

## 3. How the admin gets the data

Two paths, neither requires Jira API access:

### A. From the dry-run report (recommended)

1. Run a **dry-run** migration in QuikTrack.
2. The success screen shows **"X unresolved Jira users (privacy mode)"** with the accountIds listed.
3. Copy that list — those are the rows you need in column 1.
4. For each accountId, ask the person directly (Slack / Teams DM) for their email, or look them up in Jira's UI (open any issue they're assigned to → click their avatar → the profile page may show their email if you're in the same workspace).
5. Fill in columns 2-4.
6. Save as `.csv`.

### B. From Jira's UI

The Jira UI shows the email on the user profile page when you're logged in (different rules from the API). Visit:

```
https://<your-site>.atlassian.net/jira/people/<accountId>
```

This will redirect to the user's profile if you're authorised to see it. Their email is shown directly.

---

## 4. Workflow in the migration wizard

```
Step 1 — Connect to Jira         [unchanged]
Step 2 — Choose what to import   [+ "User mapping CSV" file picker added]
Step 3 — Review & run             [unchanged]

Run dry-run → see unresolvedUsers list →
   open CSV, fill in mappings →
   upload CSV on Step 2 →
Run live → unresolvedUsers should drop to ~0
```

The CSV upload is **optional**. If omitted, the importer behaves exactly as today — privacy-mode users go to `unresolvedUsers` and their references fall back to the importing admin.

---

## 5. How the importer consumes the CSV

Single change to the user-resolution pass in [`migrate-jira.ts`](../lib/services/migration/migrate-jira.ts). The fallback chain becomes:

```
For each Jira user with emailAddress = null:
  1. Try /user/email/bulk           (400 for user tokens — graceful skip)
  2. Try /user/bulk                  (returns user but Atlassian redacts email)
  3. Try CSV mapping by accountId    ← NEW
  4. Otherwise → unresolvedUsers
```

If step 3 returns a row:
- `emailAddress` is set to the CSV's email.
- `displayName` is overridden with `"<firstName> <lastName>"` only if either is supplied.

The rest of the loop runs unchanged: match-or-create `auth.User` by email → `userMap.set(accountId, quiktrackUserId)` → every downstream issue/sprint/comment resolves correctly.

---

## 6. What gets mapped automatically once the CSV is in place

After the CSV is consumed, **every entity** that referenced one of those accountIds is wired up correctly — no per-entity mapping needed:

| Entity | Field that uses the mapped accountId |
|---|---|
| **Issues** | `assigneeId`, `reporterId`, project membership (auto-join) |
| **Comments** | `userId` (comment author) |
| **Worklog → Timesheet** | `userId` (time author) |
| **Attachments** | `uploadedBy` |
| **Project lead** | `leadUserId` on `QtProject` |
| **Sprints** | sprints don't store user references — nothing to map |
| **Project memberships** | `QtProjectMember.userId` for both assignee + reporter auto-joins |

So once `accountId → email → quiktrackUserId` is resolved for the 8 unresolved users, every issue/comment/etc. attributing them gets the right user without any extra mapping work.

---

## 7. Idempotency and re-running

The CSV path inherits all the idempotency rules already documented in [`jira-migration.md`](./jira-migration.md):

| Re-running with the same CSV | Outcome |
|---|---|
| Users (mapped via CSV) | Idempotent — same email → matched, not duplicated |
| Issues | Idempotent — upsert by `(projectId, key)`; assignee/reporter refresh |
| Attachments | Idempotent — `(issueId, sourceSystem, sourceAttachmentId)` unique |
| Comments | **Not idempotent** — duplicates each run. Turn OFF on re-run. |
| Worklog | **Not idempotent** — duplicates each run. Turn OFF on re-run. |

So if you ran the original import without the CSV (comments + worklog ON), and now want to re-run with the CSV to fix users → **turn comments + worklog OFF on the re-run.** Issues/attachments will safely re-link to the right users.

---

## 8. Edge cases

| Scenario | What the importer does |
|---|---|
| CSV row's email matches an existing QuikTrack `auth.User` | User is matched (no duplicate created). Granted OrgMember + UserAppAccess + default role if missing. |
| CSV row's email is brand new | Auto-creates `auth.User` with `password = NULL`. Same as today's flow for users Jira *did* release the email for. |
| CSV row's email is malformed | That row is skipped, accountId stays unresolved. Logged in server output. |
| Same email used for two different accountIds | Both accountIds map to the same QuikTrack user — fine, this is what merging Jira accounts would naturally do. |
| Same accountId appears twice in CSV | Last row wins (or first — we'll pick one and document; design call). |
| Jira returned an email AND the CSV maps the same accountId | Jira's email wins; CSV is the fallback, not an override. |
| accountId in CSV that isn't in Jira | Row ignored — the importer only consults the CSV when it has an unresolved accountId from Jira. |

---

## 9. What about people who left the company / deactivated accounts

Jira keeps them in `/users/search` even if `active = false`, but the importer **filters out inactive users** (see line 296 of `migrate-jira.ts`). If a deactivated user wrote comments / created issues, their references will still hit the CSV path — so include them in the CSV with their old email. The auto-created QuikTrack user can later be deactivated in **Settings → User Management** if you don't want them appearing.

---

## 10. Estimated implementation effort

If approved, Claude will:

1. Extend `MigrationOptions` with `userMappings?: Array<{accountId, email, firstName?, lastName?}>` — ~10 lines in `migrate-jira.ts`.
2. Add a `.csv` file input on Step 2 of the migration UI, with a lightweight client-side CSV parser — ~50 lines in `apps/quiktrack/app/(dashboard)/settings/migration/page.tsx`.
3. Pass the parsed array through `/api/migration/jira/route.ts` (it's already a POST endpoint; just thread the new field through) — ~5 lines.
4. Consume the CSV in the user-resolution loop as step 3 of the fallback chain — ~15 lines.

Total: **~80 lines, ~30 minutes to implement, ~10 minutes to test**.

No new packages. No DB schema change. No tests of existing flows break — the CSV is optional and only used when Jira fails to return an email.

---

## 11. Privacy and audit considerations

- The CSV is uploaded once per migration run; **it is not stored on the server**. It lives in memory for the duration of the import, then is discarded.
- The CSV file the admin uploads is **never sent to Atlassian** — it's purely a client-side hint for our importer.
- Any emails in the CSV must match real corporate addresses; we treat them as authoritative for the purposes of matching/creating QuikTrack users. **Bad emails in the CSV result in bad user assignments** — same as a typo when manually adding a user.
- The auto-created users follow the same rules as today: `password = NULL`, must use Forgot Password or SSO to sign in.

---

## 12. Decision needed

Approve this design and Claude will implement it as a single PR with the four numbered changes from §10. No external dependencies. Total dev time ~40 minutes including local smoke test.
