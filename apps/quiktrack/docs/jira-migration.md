# Jira → QuikTrack migration — how it works

Source code:
- UI: [`apps/quiktrack/app/(dashboard)/settings/migration/page.tsx`](../app/(dashboard)/settings/migration/page.tsx)
- API: [`apps/quiktrack/app/api/migration/jira/route.ts`](../app/api/migration/jira/route.ts)
- Driver: [`apps/quiktrack/lib/services/migration/migrate-jira.ts`](../lib/services/migration/migrate-jira.ts)
- HTTP client: [`apps/quiktrack/lib/services/migration/jira-client.ts`](../lib/services/migration/jira-client.ts)

---

## 1. What it does

A **one-shot, admin-triggered** importer that pulls every project, status, sprint, issue, comment and worklog out of an **Atlassian Jira Cloud** site and writes them into the current QuikTrack organisation (org/tenant).

- **Runs synchronously** inside one HTTP request — no background queue.
- `maxDuration = 300s` (Vercel cap). Big sites should run `dryRun` first to size, then split via `projectKeys`.
- **Idempotent for structural entities** — re-running upserts on natural keys (`orgId + projectKey`, `projectId + name`, `projectId + key`, etc.), so a partial failure can be safely retried. **Comments and worklog are NOT idempotent** — see §6.

## 2. Auth & permissions

| Layer | Check |
|---|---|
| QuikTrack-side | `requireAdmin()` — only org admins can call the API |
| Jira-side | HTTP Basic with **email + API token** (no OAuth). Token is sent server-side only, never persisted |
| Jira identity probe | `GET /rest/api/3/myself` runs first — fails fast on bad credentials before touching the DB |

## 3. End-to-end pipeline

```
[UI] Step 1 creds → Step 2 scope → Step 3 review → POST /api/migration/jira
                                                          │
                                                          ▼
                                                migrateFromJira(opts)
                                                          │
   1. JiraClient.whoami()                  ─── fail-fast auth probe
   2. GET /rest/api/3/field                ─── discover Story Points + Sprint custom-field IDs
   3. seedAllDefaultRoles(orgId)           ─── ensure QuikTrack default roles exist
   4. GET /rest/api/3/users/search (paged) ─── build Jira accountId → QtUser map
                                              · match by email (case-insensitive)
                                              · auto-create user if no match
                                              · grant OrgMember + UserAppAccess + default role
   5. GET /rest/api/3/project/search       ─── all projects (filter by projectKeys if given)
                                              for each project:
                                                migrateOneProject()
```

### Per-project pipeline (`migrateOneProject`)

```
QtProject upsert  ─── keyed on (orgId, projectKey)
   │                · Importing admin auto-joined as PROJECT_ADMIN
   │                · Jira project lead auto-joined as PROJECT_ADMIN (if mapped)
   ▼
QtIssueStatus     ─── GET /rest/api/3/project/{key}/statuses
                      Jira status.statusCategory.key → QuikTrack category
                      Default colours assigned per category
   ▼
QtIssueType       ─── GET /rest/api/3/issuetype/project?projectId={id}
   ▼
QtSprint          ─── Two parallel discovery paths (deduped by Jira sprint id):
                      path 1: GET /rest/agile/1.0/board?projectKeyOrId=...
                              then /rest/agile/1.0/board/{id}/sprint  (scrum boards only)
                      path 2: extracted from each issue's Sprint custom field
                              (the only path that works for team-managed/next-gen projects)
   ▼
QtIssue           ─── THREE sweeps so parent/epic links resolve:
                      sweep 1: issuetype = Epic
                      sweep 2: issuetype ≠ Epic AND ≠ Sub-task
                      sweep 3: issuetype = Sub-task   (expectsParent = true)

                      Each sweep uses POST /rest/api/3/search/jql with
                      token-based paging (`nextPageToken`) — the old GET
                      /search was deprecated and returns 410.

                      For every issue:
                        · Assignee + reporter auto-joined as project MEMBER
                        · Issue upserted by (projectId, key)
                        · Story Points read from auto-detected custom field
                        · Description: ADF → plain text (adfToPlainText)
   ▼
QtIssueComment    ─── if includeComments
                      GET /rest/api/3/issue/{key}/comment
                      ADF body → plain text
   ▼
QtTimesheetEntry  ─── if includeWorklog
                      GET /rest/api/3/issue/{key}/worklog
                      timeSpentSeconds / 3600 → hours
                      Comment ADF → plain text
```

---

## 4. Entity mapping (Jira → QuikTrack)

| Jira entity | QuikTrack model | Natural / idempotency key | Notes |
|---|---|---|---|
| User (Atlassian account) | `auth.User` + `OrgMember` + `UserAppAccess` + `QtUserAppRole` | `email` (lowercase) | If email missing or `accountType` is `app`/`customer` → recorded in `unresolvedUsers`. Auto-created users have `password = null`; they get in via Forgot Password / SSO. |
| Project | `QtProject` | `(orgId, projectKey)` | `projectTypeKey = "service_desk"` → QuikTrack `projectType = "service"`, otherwise `"software"`. `leadUserId` set from mapped Jira project lead. |
| Status | `QtIssueStatus` | `(projectId, name)` | Order index increments per project. Category drives default colour. |
| Issue type | `QtIssueType` | `(projectId, name)` | Color hardcoded `#64748b`. Name preserved verbatim (the Jira name, not the mapped enum). |
| Sprint | `QtSprint` | `(projectId, name)` | Discovered from both Agile boards and issue Sprint custom field, deduped by Jira sprint id. |
| Issue (any type) | `QtIssue` | `(projectId, key)` | Type mapped to enum, description ADF→text. An issue can sit on multiple sprints historically — we link it to the **last** sprint in the Jira array (Jira's convention for "current membership"). |
| Comment | `QtIssueComment` | _none — written as new rows_ | **Not idempotent** — re-running the import will duplicate comments. Author falls back to importing admin if Jira author can't be mapped. |
| Worklog | `QtTimesheetEntry` | _none — written as new rows_ | **Not idempotent** — re-running duplicates entries. Hours = `timeSpentSeconds / 3600`. |
| Attachment | `QtIssueAttachment` + S3 object | `(issueId, sourceSystem="jira", sourceAttachmentId)` | Downloaded from Jira with the same auth, uploaded to `tenants/{orgId}/quiktrack/issues/{projectId}/{issueId}/...`. Files > 25 MB are skipped. Failures counted, don't abort the issue. Idempotent: re-running won't duplicate. |
| Issue history / changelog | _(skipped)_ | — | Not in v1 scope. |
| Custom fields beyond Story Points | _(skipped)_ | — | Only Story Points and Sprint are auto-detected. |

## 5. Field-level value mappings

### Priority — `mapPriority()`

| Jira name | QuikTrack |
|---|---|
| `Highest` | `URGENT` |
| `High` | `HIGH` |
| `Medium` | `MEDIUM` |
| `Low` | `LOW` |
| `Lowest` | `LOW` |
| _anything else / missing_ | `MEDIUM` |

### Issue type — `mapIssueType()`

| Jira name | QuikTrack |
|---|---|
| `Epic` | `EPIC` |
| `Story` | `STORY` |
| `Bug` | `BUG` |
| `Sub-task` / `Subtask` | `SUBTASK` |
| _anything else_ | `TASK` |

### Status category — `mapStatusCategory()`

| Jira `statusCategory.key` | QuikTrack category | Default color |
|---|---|---|
| `indeterminate` | `IN_PROGRESS` | `#2563eb` (blue) |
| `done` | `DONE` | `#16a34a` (green) |
| `new` / `undefined` / missing | `BACKLOG` | `#94a3b8` (slate) |

### Sprint state — `mapSprintState()`

| Jira `state` | QuikTrack |
|---|---|
| `active` | `ACTIVE` |
| `closed` / `cancelled` | `COMPLETED` |
| `future` / anything else | `PLANNING` |

### Description / comment / worklog comment — `adfToPlainText()`

Atlassian Document Format JSON tree → plain text. Walks `text` nodes; emits newlines for `paragraph`, `heading`, `bulletList`, `orderedList`, `listItem`, `blockquote`, `codeBlock`. **Rich formatting (bold, links, mentions, embedded images) is lost** — content + URLs are preserved as text.

### Auto-created project memberships

| Who | Role | When |
|---|---|---|
| Importing admin | `PROJECT_ADMIN` | When `QtProject` row is upserted |
| Jira project lead (if mapped) | `PROJECT_ADMIN` | When `QtProject` row is upserted |
| Issue assignee | `MEMBER` | Per-issue, idempotent upsert |
| Issue reporter | `MEMBER` | Per-issue, idempotent upsert |

(All `qtProjectMember.upsert` calls use `(projectId, userId)` as the natural key, so re-running won't duplicate.)

---

## 6. Idempotency summary

| Re-running is safe for | Re-running is **NOT** safe for |
|---|---|
| Users (matched by email) | Comments (always inserted as new rows) |
| Projects (upsert by `orgId + projectKey`) | Worklog → timesheet entries (always new rows) |
| Statuses, types, sprints (upsert by `projectId + name`) | |
| Issues (upsert by `projectId + key`) | |
| Project memberships (upsert by `projectId + userId`) | |

**Practical implication:** if a comment-bearing import fails mid-way, re-running it will duplicate every comment that was already written. The safer recovery is `includeComments=false, includeWorklog=false` on retry, then a targeted re-import of the affected projects with those flags on. (A future iteration should add a `(issueId, jiraCommentId)` natural key on `QtIssueComment` to make comments idempotent.)

## 7. Resilience patterns

- **Rate limiting**: client throttles to ~8 req/s globally; honours `Retry-After` on `429` with up to 3 exponential retries.
- **Mixed pagination dialects**: `getAllPaged()` handles three Jira response shapes — `{ values, isLast, total }`, `{ issues, total }`, and bare arrays (the `/users/search` quirk). The bare-array case used to crash via `Array.prototype.values` collision; that's defended against.
- **Issue search**: uses the new `POST /rest/api/3/search/jql` (token paging) because the old `GET /search` returns 410 since the 2024 Atlassian deprecation.
- **Sprints**: dual-path discovery (Agile boards + Sprint custom field) covers both company-managed and team-managed projects — team-managed projects often don't expose boards via the Agile API.
- **Non-JSON Jira responses**: detected up-front; surfaces a clean "check the site domain" error instead of a `JSON.parse "Unexpected token <"`.
- **Statuses / issuetypes / boards endpoint failures**: caught and swallowed per-project so one bad endpoint doesn't abort the whole import.
- **Unmapped status name on an issue**: that issue is **skipped silently** (continues to next issue). Watch the final counts vs the Jira project's actual issue total to detect this.

## 8. Known limitations

1. **No background job** — request times out at 300s on Vercel.
2. **Comments + worklog duplicate on retry** (no natural key).
3. **Attachments > 25 MB are skipped** (counted in `attachments.skippedTooLarge`).
4. **Issue changelog / history not migrated**.
5. **Only Story Points + Sprint custom fields** are auto-detected — every other Jira custom field is dropped.
6. **Rich text → plain text only** (ADF formatting lost; images dropped).
7. **Privacy-mode users** (Jira accountId with no email) cannot be matched — listed in `report.unresolvedUsers` and any references default to the importing admin.
8. **Issue with unmapped status name** is silently skipped.
9. **Sprint membership history is flattened** — only the *last* sprint in the issue's Sprint array becomes its `sprintId`.

## 9. Report shape returned to the UI

```ts
{
  ok: boolean,
  error?: string,
  jiraAccount?: { email, accountId },          // who the API token belongs to
  counts: {
    users: { matched, created },
    projects, statuses, issueTypes, sprints,
    issues, comments, worklog,
    attachments: { imported, skippedTooLarge, failed }
  },
  projectsImported: [{ key, name, issueCount, sprintCount }],
  unresolvedUsers: string[],                   // Jira accountIds we couldn't map
  dryRun: boolean
}
```

`dryRun: true` runs every Jira API call (so counts are real) but skips **every** DB write. Use it to size the workload before committing.

---

## 10. Running it

1. Sign in to QuikTrack as an org admin.
2. Navigate to **Settings → Migration** (`/settings/migration`).
3. **Step 1** — paste your Jira site domain (e.g. `acme.atlassian.net` — no protocol, no path), your Atlassian account email, and an API token from <https://id.atlassian.com/manage-profile/security/api-tokens>.
4. **Step 2** — optionally restrict to specific Jira project keys, toggle comments / worklog inclusion, and choose Dry-run vs Live.
5. **Step 3** — review the plan and click **Run dry-run** (or **Start import** for live).
6. Review the report panel: per-project counts, unresolved Jira users, attachment imported / skipped / failed.
7. On success, the imported projects appear in QuikTrack's Spaces list.

**Recommended sequence for a real site:** dry-run all → review counts → live-run specific projects in batches via `projectKeys`.
