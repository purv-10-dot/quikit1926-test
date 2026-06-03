# QuikTrack — Jira Migration Guide

How the Atlassian Jira Cloud → QuikTrack importer works: which Jira APIs we call, in what order, how every entity is mapped, what fallbacks kick in, and what's intentionally **not** imported.

> **Source files referenced throughout:**
> - HTTP entry: [`app/api/migration/jira/route.ts`](app/api/migration/jira/route.ts)
> - Orchestrator: [`lib/services/migration/migrate-jira.ts`](lib/services/migration/migrate-jira.ts)
> - Jira HTTP client + ADF converters: [`lib/services/migration/jira-client.ts`](lib/services/migration/jira-client.ts)

---

## 1. High-Level Architecture

```
┌────────────────┐   POST /api/migration/jira         ┌────────────────────┐
│ QuikTrack UI   │ ─────────────────────────────────▶ │ /api/migration/jira│  (Next.js Route)
│ (Settings →    │ ◀───────  { success, report }  ─── │   requireAdmin     │
│  Migration)    │                                     └─────────┬──────────┘
└────────────────┘                                               │
                                                                 ▼
                                                  ┌──────────────────────────┐
                                                  │ migrateFromJira()        │
                                                  │ lib/services/migration/  │
                                                  │   migrate-jira.ts        │
                                                  └─────────┬────────────────┘
                                                            │
                  ┌─────────────────────────────────────────┴─────────────────────────────┐
                  │                                                                       │
                  ▼                                                                       ▼
       ┌────────────────────┐                                                  ┌──────────────────┐
       │ JiraClient         │   GET/POST                                       │ Neon Postgres    │
       │ (Atlassian REST)   │ ───────────▶  api.atlassian.net  ────────────▶  │ orgId-scoped     │
       │ Basic Auth         │   throttled @ 8 r/s, 429 retry                   │ upserts          │
       └────────────────────┘                                                  └──────────────────┘
                                                                                        │
                                                                                        ▼
                                                                              ┌──────────────────┐
                                                                              │ S3 (attachments) │
                                                                              └──────────────────┘
```

- Runs **synchronously inside a single Vercel serverless invocation**.
- Vercel timeout cap: 5 minutes ([`route.ts:86`](app/api/migration/jira/route.ts#L86) → `export const maxDuration = 300`).
- Throttle: 8 req/s with 429 exponential back-off ([`jira-client.ts:30`](lib/services/migration/jira-client.ts#L30)).
- All DB writes are **idempotent upserts keyed by stable identifiers** (orgId + projectKey, projectId + name, etc.) so a re-run is safe.
- A **dry-run mode** hits every Jira endpoint but skips DB writes — perfect for sizing the workload.

---

## 2. HTTP API — `POST /api/migration/jira`

| Field | Value |
|---|---|
| Auth | `requireAdmin` — only admin / super-admin app role allowed. |
| Content-Type | `application/json` |
| Max duration | 5 minutes |

### Request body (Zod-validated)

```json
{
  "domain": "acme.atlassian.net",
  "email": "you@example.com",
  "apiToken": "<atlassian api token>",
  "projectKeys": ["WEB", "API"],
  "includeComments": true,
  "includeWorklog": true,
  "dryRun": false,
  "userMappings": [
    { "accountId": "5b...", "email": "alice@acme.com", "firstName": "Alice", "lastName": "Carter" }
  ]
}
```

| Field | Required | Notes |
|---|---|---|
| `domain` | ✅ | Bare host (no protocol, no path). Normalised server-side. |
| `email` | ✅ | Atlassian account email used for the API token. |
| `apiToken` | ✅ | Created at https://id.atlassian.com/manage-profile/security/api-tokens |
| `projectKeys` | optional | Whitelist; omit to import everything. |
| `includeComments` | optional | Default `true`. |
| `includeWorklog` | optional | Default `true`. |
| `dryRun` | optional | Default `false`. When true, no DB writes. |
| `userMappings` | optional | CSV-sourced accountId → email overrides for privacy-mode users. See §5.3. |

### Response — `MigrationReport`

```json
{
  "success": true,
  "data": {
    "ok": true,
    "jiraAccount": { "email": "you@example.com", "accountId": "..." },
    "counts": {
      "users": { "matched": 12, "created": 3 },
      "projects": 2,
      "statuses": 11,
      "issueTypes": 8,
      "sprints": 6,
      "issues": 187,
      "comments": 412,
      "worklog": 88,
      "attachments": { "imported": 24, "skippedTooLarge": 1, "failed": 0 }
    },
    "projectsImported": [
      { "key": "WEB", "name": "Web", "issueCount": 92, "sprintCount": 3 },
      { "key": "API", "name": "API", "issueCount": 95, "sprintCount": 3 }
    ],
    "unresolvedUsers": ["5bfa..."],
    "dryRun": false
  }
}
```

Error responses use the standard envelope `{ success: false, error: "..." }`. A failed Jira auth probe returns **HTTP 502** with `report.error`.

---

## 3. Jira REST APIs Called

All endpoints run with Basic Auth (`email:apiToken`, base64). The HTTP client is a thin wrapper that handles throttling, 429 retries, and the three different pagination dialects Jira uses ([`jira-client.ts:133`](lib/services/migration/jira-client.ts#L133)).

| # | Method | Endpoint | Purpose | Pagination |
|---|---|---|---|---|
| 1 | GET | `/rest/api/3/myself` | Auth probe — fail fast on bad creds | — |
| 2 | GET | `/rest/api/3/field` | Custom-field discovery (Story Points, Sprint) | — |
| 3 | GET | `/rest/api/3/users/search?startAt&maxResults` | All workspace users (email may be redacted) | `values[]` |
| 4 | GET | `/rest/api/3/user/email/bulk?accountId=...&accountId=...` | Bulk email lookup — privacy-mode fallback #1 | chunked 80/call |
| 5 | GET | `/rest/api/3/user/bulk?accountId=...&accountId=...` | Bulk user object — privacy-mode fallback #2 | chunked 50/call |
| 6 | GET | `/rest/api/3/project/search?startAt&maxResults` | All projects (filtered by `projectKeys` if provided) | `values[]` |
| 7 | GET | `/rest/api/3/project/{key}/statuses` | Statuses per project | — (grouped) |
| 8 | GET | `/rest/api/3/issuetype/project?projectId={id}` | Issue types per project | — |
| 9 | GET | `/rest/agile/1.0/board?projectKeyOrId={key}` | Agile boards for a project | `values[]` |
| 10 | GET | `/rest/agile/1.0/board/{boardId}/sprint` | Sprints for a scrum board | `values[]` |
| 11 | **POST** | `/rest/api/3/search/jql` | Issue search (the modern POST endpoint) | `nextPageToken` |
| 12 | GET | `/rest/api/3/issue/{key}/comment` | Comments per issue | `values[]` |
| 13 | GET | `/rest/api/3/issue/{key}/worklog` | Worklog (time tracking) per issue | `values[]` |
| 14 | GET | binary attachment URL | Attachment download | — |

**Important:** Issue search uses the **POST `/rest/api/3/search/jql`** endpoint with token-based paging (Atlassian deprecated the old `GET /rest/api/3/search` in 2024 — it returns 410 now). The migration code handles this at [`migrate-jira.ts:723-735`](lib/services/migration/migrate-jira.ts#L723-L735).

### Pagination dialects we handle

Jira's API is inconsistent. The client normalises three shapes:
1. `{ values: [...], isLast, total, maxResults, startAt }` — most endpoints.
2. `{ issues: [...], total, startAt }` — legacy issue search.
3. Bare top-level array — `/users/search` and some bulk endpoints.

See `getAllPaged()` in [`jira-client.ts:133-165`](lib/services/migration/jira-client.ts#L133-L165).

---

## 4. The 10-Step Migration Sequence

Every step is logged in the returned `MigrationReport`. Steps 5 onward are **per-project** loops.

### Step 1 — Auth Probe
**Jira:** `GET /rest/api/3/myself` → returns `accountId, emailAddress`.
**Failure mode:** wrong domain or invalid token → `{ ok: false, error: "Jira auth failed: ..." }`. Returns 502.

### Step 2 — Custom Field Discovery
**Jira:** `GET /rest/api/3/field`
Finds the dynamic field IDs (Atlassian assigns customer-specific IDs) for:
- **Story Points** — matches name `"Story Points"` or `"Story point estimate"`.
- **Sprint** — matches name `"Sprint"`.

These IDs are embedded in the `fields=...` parameter on subsequent issue fetches.

### Step 3 — User Discovery + Privacy-Mode Fallback Chain
**Jira:** `GET /rest/api/3/users/search?startAt&maxResults` (paginated; filters out `app` and `customer` account types).

If a user has **privacy mode on**, `emailAddress` is `null`. The importer runs a 3-step fallback to recover their emails:

| # | Fallback | Endpoint | What it does |
|---|---|---|---|
| 1 | Bulk email | `GET /rest/api/3/user/email/bulk?accountId=...` | Atlassian-gated (some tenants disable this). Chunks 80 IDs per call. |
| 2 | Bulk user | `GET /rest/api/3/user/bulk?accountId=...` | User-token-friendly. Returns the full user record. Chunks 50 IDs per call. |
| 3 | Admin CSV | (not Jira) | Admin pastes accountId → email mapping in the UI; used as final fallback. |

Users still without an email after all 3 fallbacks land in `report.unresolvedUsers[]` and are silently skipped.

### Step 4 — Build the User Map
For each Jira human user:
- Match by email (case-insensitive) to existing `auth.User` row in Neon.
- If found → record in `Jira accountId → QtUser id` map; ensure `OrgMember` + `UserAppAccess` rows; counter `users.matched++`.
- If not found → auto-create `auth.User` (no password, splits `displayName` into firstName/lastName); same membership grants; counter `users.created++`.

Code: [`migrate-jira.ts:396-436`](lib/services/migration/migrate-jira.ts#L396-L436).

### Step 5 — Projects
**Jira:** `GET /rest/api/3/project/search`
For each project (filtered by `projectKeys` if provided):
- Upsert `QtProject` keyed on `(orgId, projectKey)`.
- Auto-add the **importing admin** as `PROJECT_ADMIN` (otherwise the listing endpoint hides the project from them).
- Auto-add the Jira **project lead** (if mapped) as `PROJECT_ADMIN`.

### Step 6 — Statuses
**Jira:** `GET /rest/api/3/project/{key}/statuses`
The response is grouped by issue type; the importer flattens, dedupes by status ID, and upserts `QtIssueStatus` per project with category mapping (§5.1) and traffic-light colors (gray / blue / green by category).

### Step 7 — Issue Types
**Jira:** `GET /rest/api/3/issuetype/project?projectId={id}`
Upserts `QtIssueType` per project, keyed on `(projectId, name)`.

### Step 8 — Sprints (Two Parallel Paths)
Jira is inconsistent here, so we try both:

**Path A — Agile boards API:**
- `GET /rest/agile/1.0/board?projectKeyOrId={key}` → list boards.
- Skip `kanban` boards (no sprints).
- For each scrum board: `GET /rest/agile/1.0/board/{id}/sprint`.

**Path B — Sprint custom field on issues:**
- For team-managed (next-gen) projects where boards return 403, the issue's `customfield_XXXXX` (Sprint) is harvested during the issue sweep.

Sprints are deduped by Jira sprint ID across both paths.

### Step 9 — Issues (3 Sweeps)
To ensure parent/epic links resolve correctly, issues are imported in three JQL-filtered sweeps:

| Sweep | JQL | Why |
|---|---|---|
| 1 | `project = "WEB" AND issuetype = Epic` | Epics first so children can link to them |
| 2 | `project = "WEB" AND issuetype != Epic AND issuetype != Sub-task` | Stories/Tasks/Bugs that may have epic links |
| 3 | `project = "WEB" AND issuetype = Sub-task` | Subtasks last, after their parents exist |

Each sweep uses `POST /rest/api/3/search/jql` with paged `nextPageToken`. Fields fetched:
- `summary, description, status, issuetype, priority, assignee, reporter, parent, duedate, created, updated, attachment`
- Plus `customfield_XXXXX` for Story Points and Sprint (auto-discovered in Step 2).

For each issue → `QtIssue` upsert keyed on `(orgId, projectId, key)`:
- **Description**: ADF → HTML via `adfToHtml()` ([`jira-client.ts:399-458`](lib/services/migration/jira-client.ts#L399-L458)). Preserves headings, paragraphs, lists, blockquotes, code blocks, tables, links, hard breaks, horizontal rules.
- Media nodes in ADF → `<img src="quiktrack-attachment:{jiraAttachmentId}">` placeholders → rewritten to real `/api/issues/{id}/attachments/{attId}` URLs after attachment upload.
- Mapping: see §5.

### Step 10 — Comments, Worklog, Attachments (per Issue)

**Comments** (if `includeComments=true`):
- `GET /rest/api/3/issue/{key}/comment`
- Each comment body (ADF) → plain text via `adfToPlainText()`.
- `QtIssueComment` keyed on `(orgId, issueId, userId, createdAt)` — author resolved via user map.

**Worklog** (if `includeWorklog=true`):
- `GET /rest/api/3/issue/{key}/worklog`
- Each worklog → `QtTimesheetEntry` with `userId, projectId, issueId, entryDate, hours`.
- `hours = timeSpentSeconds / 3600`. Date = `started` truncated to day.

**Attachments**:
- Each issue's `fields.attachment[]` array provides the binary URL.
- `jira.fetchBinary()` downloads (with same auth + throttle).
- Files over **25 MB** → skipped, counted in `attachments.skippedTooLarge`.
- Otherwise uploaded to **S3** via `putObject(buildIssueAttachmentKey(...))` and linked via `QtIssueAttachment`.
- **ADF inline media placeholders are rewritten** after upload completes, so embedded screenshots in descriptions show correctly.

---

## 5. Field-Level Mapping Reference

### 5.1 Status Category

Atlassian's `statusCategory.key` → QuikTrack `category`:

| Jira `statusCategory.key` | QuikTrack `category` | Default color |
|---|---|---|
| `"new"` | `BACKLOG` | `#94a3b8` (gray) |
| `"indeterminate"` | `IN_PROGRESS` | `#2563eb` (blue) |
| `"done"` | `DONE` | `#16a34a` (green) |
| `"undefined"` / other | `BACKLOG` (fallback) | gray |

Defined at [`migrate-jira.ts:153-157`](lib/services/migration/migrate-jira.ts#L153-L157).

### 5.2 Priority

| Jira priority name | QuikTrack `priority` |
|---|---|
| `"Highest"` | `URGENT` |
| `"High"` | `HIGH` |
| `"Medium"` (default fallback) | `MEDIUM` |
| `"Low"` | `LOW` |
| `"Lowest"` | `LOW` |

Defined at [`migrate-jira.ts:125-135`](lib/services/migration/migrate-jira.ts#L125-L135).

### 5.3 Issue Type

| Jira issue type name | QuikTrack `type` |
|---|---|
| `"Epic"` | `EPIC` |
| `"Story"` | `STORY` |
| `"Bug"` | `BUG` |
| `"Sub-task"` / `"Subtask"` | `SUBTASK` |
| anything else (Task, Improvement, etc.) | `TASK` |

Defined at [`migrate-jira.ts:137-151`](lib/services/migration/migrate-jira.ts#L137-L151).

### 5.4 Sprint State

| Jira sprint `state` | QuikTrack `status` |
|---|---|
| `"future"` | `PLANNING` |
| `"active"` | `ACTIVE` |
| `"closed"` / `"cancelled"` | `COMPLETED` |

Defined at [`migrate-jira.ts:159-163`](lib/services/migration/migrate-jira.ts#L159-L163).

### 5.5 User Resolution Chain

1. **`/users/search`** → if `emailAddress` present, use it.
2. **`/user/email/bulk`** → privacy-mode fallback #1.
3. **`/user/bulk`** → privacy-mode fallback #2.
4. **Admin CSV `userMappings`** → final fallback (see [`docs/jira-migration-csv-users.md`](docs/jira-migration-csv-users.md)).
5. **Still no email** → user added to `report.unresolvedUsers[]`; their issues are imported with `assignee=null`/`reporter=null`.

### 5.6 Field-by-Field Issue Mapping

| Jira Field | QuikTrack Field | Notes |
|---|---|---|
| `key` | `key` | Preserved verbatim (e.g. `WEB-42`) |
| `fields.summary` | `title` | |
| `fields.description` (ADF) | `description` (HTML) | Converted via `adfToHtml()` |
| `fields.status.name` | `statusId` | Looked up in `QtIssueStatus` by name |
| `fields.issuetype.name` | `type` | Via `mapIssueType()` |
| `fields.priority.name` | `priority` | Via `mapPriority()` |
| `fields.assignee.accountId` | `assigneeId` | Via user map |
| `fields.reporter.accountId` | `reporterId` | Via user map |
| `fields.parent.key` | `parentId` | Looked up in `issueMap` (post-sweep) |
| `fields.duedate` | `dueDate` | ISO date |
| `fields.created` | `createdAt` | Preserved |
| `fields.updated` | `updatedAt` | Preserved |
| `customfield_XXXXX` (Story Points) | `storyPoints` | Field ID discovered in Step 2 |
| `customfield_XXXXX` (Sprint) | `sprintId` | Last sprint in the array wins |
| `fields.attachment[]` | `QtIssueAttachment` rows | Downloaded + re-uploaded to S3 |

---

## 6. What's NOT Migrated (v1 scope)

Documented at [`migrate-jira.ts:24-28`](lib/services/migration/migrate-jira.ts#L24-L28):

- **Issue changelog / history** — only the final state is imported; field-change timeline is lost.
- **Custom fields** beyond Story Points and Sprint.
- **Labels** — present in Jira data but not currently mapped.
- **Components** — Jira's "Component" concept doesn't have a 1:1 in QuikTrack.
- **Versions / Fix Versions** — no equivalent in QuikTrack today.
- **Watchers** — not exported; users start with fresh watcher lists (auto-watch via mention/assignment still fires).
- **Voting** — Jira-specific feature, not in QuikTrack.
- **Workflow transitions / conditions** — only the current status is captured.
- **Service desk / Jira Service Management** specifics (queues, SLAs, request types).
- **Wiki / Confluence pages** — out of scope.
- **App users / customers** (`accountType: "app" | "customer"`) — explicitly filtered out at [`migrate-jira.ts:325-328`](lib/services/migration/migrate-jira.ts#L325-L328).

---

## 7. Edge Cases & Failure Handling

| Scenario | What happens |
|---|---|
| **Wrong domain** (`acme.atlassian.net/jira`) | Defensive normalisation strips protocol, path, trailing slash. |
| **HTML response instead of JSON** | Detected via `Content-Type`; error tells admin to check the domain. |
| **429 Too Many Requests** | Exponential back-off honouring `Retry-After`, up to 3 attempts. |
| **Privacy-mode user (no email)** | 3-step fallback (email/bulk → user/bulk → CSV). |
| **Attachment >25MB** | Skipped, counted in `attachments.skippedTooLarge`. |
| **Attachment download fails mid-stream** | Counted in `attachments.failed`; import continues. |
| **Kanban boards** (no sprints) | Skipped silently. |
| **Team-managed projects with no boards** | Falls back to sprint custom field harvest. |
| **Deprecated `GET /rest/api/3/search`** | Replaced by `POST /rest/api/3/search/jql` (Atlassian deprecation, 2024). |
| **Status doesn't match by name** | Issue lands on the first status as fallback. |
| **Issue type doesn't match in `typeMap`** | Falls back to `TASK`. |
| **Issue references unmapped user** | Field nulled out, import continues. |
| **Project already exists in QuikTrack** | Upserted by `(orgId, projectKey)`; re-running is safe. |
| **Issue already exists** | Upserted by `(orgId, projectId, key)`; comments/worklog/attachments may duplicate (see §10). |
| **Sprint with same name** | Found by name, not re-created. |
| **Vercel 5-min timeout** | Returns whatever was imported; admin uses `projectKeys` to chunk. |

---

## 8. Dry Run

Set `dryRun: true` in the request body. Behavior:
- Every Jira API call still fires (counts are accurate).
- **No DB writes happen** (no project/user/issue rows created).
- Synthetic placeholder IDs are used so subsequent loops don't crash.
- Useful for: sizing the workload, validating credentials, sanity-checking project selection.

The response shape is identical to a real run, with `report.dryRun: true`.

---

## 9. Performance Characteristics

| Metric | Value |
|---|---|
| Jira API throttle | 8 req/s |
| 429 retry | Up to 3 attempts, exponential back-off |
| Issue search page size | 100 |
| Vercel timeout | 5 minutes |
| Practical limit (single run) | ~1,000 issues + comments + attachments |
| Attachment size cap | 25 MB / file |
| Bulk email lookup batch | 80 accountIds |
| Bulk user lookup batch | 50 accountIds |

For Jira sites with **>1,000 issues** or many large attachments, run multiple imports scoped by `projectKeys` to stay under the timeout.

---

## 10. Re-Run Safety

The importer is **mostly idempotent**:

| Resource | Re-run behavior |
|---|---|
| `QtProject` | Upserted on `(orgId, projectKey)` — no duplicates. |
| `QtIssueStatus` | Looked up by name; no duplicates. |
| `QtIssueType` | Looked up by name; no duplicates. |
| `QtSprint` | Looked up by name; no duplicates. |
| `QtIssue` | Found by `(orgId, projectId, key)` — re-runs **update** not duplicate. |
| `QtIssueComment` | ⚠️ Currently **inserts unconditionally** — duplicates may appear on re-run. |
| `QtTimesheetEntry` | ⚠️ Currently **inserts unconditionally** — duplicates may appear on re-run. |
| `QtIssueAttachment` | ⚠️ Currently re-uploads + re-links on re-run. |
| `User` / `OrgMember` / `UserAppAccess` | Upserted by email; safe to re-run. |

**Recommendation:** For repeat imports of the same Jira project, restrict to projects you haven't already migrated, or first soft-delete the project's issues in QuikTrack.

---

## 11. UI Flow

Admin opens **Settings → Migration → Jira** and sees a form with:

1. Jira domain
2. Email + API token (with link to https://id.atlassian.com/manage-profile/security/api-tokens)
3. Project keys (optional CSV)
4. Include comments / worklog (toggles)
5. CSV mapping upload (for privacy-mode users — see [`docs/jira-migration-csv-users.md`](docs/jira-migration-csv-users.md))
6. **Run Dry Run** button → posts with `dryRun: true`
7. **Run Migration** button → posts with `dryRun: false`

After completion the UI renders the report counts (users matched/created, issues, comments, attachments, etc.) plus the per-project breakdown.

---

## 12. Required Atlassian API Token Scopes

The API token must have **Jira platform REST API** scope. Since Atlassian tokens are user-scoped (not OAuth), they inherit the user's product permissions:

- **Browse projects** for every project being imported
- **View issues** in each project
- **Read users** workspace-wide (auto-included for any token)
- **Read attachments** (auto-included; cookies forwarded by JiraClient)

No write permissions needed on the Jira side — we only read.

---

## 13. Sequence Diagram

```
Admin               QuikTrack API                       JiraClient                    Jira Cloud
  │                       │                                 │                              │
  │ POST /api/migration   │                                 │                              │
  │──────────────────────▶│                                 │                              │
  │                       │ migrateFromJira()               │                              │
  │                       │────────────────────────────────▶│ /rest/api/3/myself           │
  │                       │                                 │─────────────────────────────▶│
  │                       │                                 │◀──── { accountId } ──────────│
  │                       │                                 │ /rest/api/3/field            │
  │                       │                                 │─────────────────────────────▶│
  │                       │                                 │◀── customfield ids ──────────│
  │                       │                                 │ /rest/api/3/users/search     │
  │                       │                                 │─────────────────────────────▶│
  │                       │                                 │◀── users[] ──────────────────│
  │                       │ DB user upserts                 │                              │
  │                       │ /rest/api/3/project/search      │                              │
  │                       │                                 │─────────────────────────────▶│
  │                       │                                 │◀── projects[] ───────────────│
  │                       │     for each project:           │                              │
  │                       │       statuses, types, boards   │─────────────────────────────▶│
  │                       │       POST search/jql (3 sweeps)│─────────────────────────────▶│
  │                       │       comments + worklog        │─────────────────────────────▶│
  │                       │       attachment downloads      │─────────────────────────────▶│
  │                       │       S3 uploads                │                              │
  │                       │       DB upserts                │                              │
  │                       │                                 │                              │
  │◀──── MigrationReport ─│                                 │                              │
```

---

## 14. Quick Reference — File:Line Index

| What | Where |
|---|---|
| HTTP entry route | [`app/api/migration/jira/route.ts`](app/api/migration/jira/route.ts) |
| Zod request schema | [`route.ts:10-30`](app/api/migration/jira/route.ts#L10-L30) |
| `requireAdmin` gate | [`route.ts:41-42`](app/api/migration/jira/route.ts#L41-L42) |
| 5-min timeout | [`route.ts:86`](app/api/migration/jira/route.ts#L86) |
| Main orchestrator | [`migrate-jira.ts:229-468`](lib/services/migration/migrate-jira.ts#L229-L468) |
| Custom-field discovery | [`migrate-jira.ts:293-308`](lib/services/migration/migrate-jira.ts#L293-L308) |
| User map building | [`migrate-jira.ts:320-436`](lib/services/migration/migrate-jira.ts#L320-L436) |
| Privacy-mode fallback chain | [`migrate-jira.ts:341-394`](lib/services/migration/migrate-jira.ts#L341-L394) |
| Per-project pipeline | [`migrate-jira.ts:472+`](lib/services/migration/migrate-jira.ts#L472) |
| 3-sweep issue import (JQL) | [`migrate-jira.ts:700+`](lib/services/migration/migrate-jira.ts#L700) |
| POST `/search/jql` paging | [`migrate-jira.ts:723-735`](lib/services/migration/migrate-jira.ts#L723-L735) |
| Priority mapping | [`migrate-jira.ts:125-135`](lib/services/migration/migrate-jira.ts#L125-L135) |
| Issue-type mapping | [`migrate-jira.ts:137-151`](lib/services/migration/migrate-jira.ts#L137-L151) |
| Status-category mapping | [`migrate-jira.ts:153-157`](lib/services/migration/migrate-jira.ts#L153-L157) |
| Sprint-state mapping | [`migrate-jira.ts:159-163`](lib/services/migration/migrate-jira.ts#L159-L163) |
| HTTP client + throttle + 429 | [`jira-client.ts:73-117`](lib/services/migration/jira-client.ts#L73-L117) |
| Pagination handler | [`jira-client.ts:133-165`](lib/services/migration/jira-client.ts#L133-L165) |
| Bulk email recovery | [`jira-client.ts:185-231`](lib/services/migration/jira-client.ts#L185-L231) |
| Bulk user recovery | [`jira-client.ts:278-333`](lib/services/migration/jira-client.ts#L278-L333) |
| ADF → HTML | [`jira-client.ts:399-458`](lib/services/migration/jira-client.ts#L399-L458) |
| ADF → plain text | [`jira-client.ts:465-487`](lib/services/migration/jira-client.ts#L465-L487) |
| Binary attachment fetch | [`jira-client.ts:239-264`](lib/services/migration/jira-client.ts#L239-L264) |
| Privacy-mode CSV mapping guide | [`docs/jira-migration-csv-users.md`](docs/jira-migration-csv-users.md) |
| Operator quickstart | [`docs/jira-migration-quickstart.md`](docs/jira-migration-quickstart.md) |
| User-mapping deep dive | [`docs/jira-migration-users.md`](docs/jira-migration-users.md) |

---

*This doc reflects the production codebase as of 2026-06-03. Every API endpoint, mapping rule, and edge case is grounded in the source files above — no aspirational features.*
