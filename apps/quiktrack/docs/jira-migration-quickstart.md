# Jira → QuikTrack migration — quickstart

A one-shot, admin-triggered importer that pulls a Jira Cloud site into your QuikTrack org. Detailed reference: [`jira-migration.md`](./jira-migration.md).

---

## Before you start

You need:

1. **QuikTrack admin access** for the target org.
2. **A Jira Cloud account** with read access to every project you want to migrate.
3. **A Jira API token** — generate at <https://id.atlassian.com/manage-profile/security/api-tokens>.
4. **Your Jira site domain** — e.g. `acme.atlassian.net` (no `https://`, no `/jira`, no trailing slash).

---

## What gets migrated

| ✅ Migrated | ⚠️ Notes |
|---|---|
| Users (by email; auto-created if no match) | Privacy-mode users with no email can't be matched — listed in the report |
| Projects | One QuikTrack project per Jira project |
| Statuses + categories | Default colors per category |
| Issue types | Names preserved verbatim |
| Sprints (scrum boards + team-managed) | Issue linked to its last sprint historically |
| Issues (Epics → Stories → Sub-tasks, in that order) | Description converted to HTML with inline images |
| Comments | Plain text only (formatting lost) |
| Worklog → Timesheet entries | Hours = seconds / 3600 |
| **Attachments** | Downloaded from Jira, re-uploaded to QuikTrack's S3 bucket. Inline images survive in descriptions. Files > 25 MB skipped. |
| Project memberships | Admin + Jira lead → `PROJECT_ADMIN`; assignee + reporter → `MEMBER` |

**Not migrated:** issue changelog/history, custom fields beyond Story Points, rich-text formatting in comments/worklog.

---

## Running it

1. Sign in to QuikTrack as an org admin.
2. Go to **Settings → Migration** (`/settings/migration`).
3. **Step 1 — Connect.** Paste site domain, your Atlassian email, the API token. The system probes Jira immediately and fails fast on bad creds.
4. **Step 2 — Choose.**
   - **Project keys** — leave blank to import everything, or list specific keys like `PROJ, MOBILE`.
   - **Include comments** — recommended on.
   - **Include worklog** — recommended on.
   - **Dry-run** — recommended for the **first run**. Hits Jira so counts are real, but writes nothing to the DB.
5. **Step 3 — Review & run.**
6. Read the report panel:
   - Per-project issue / sprint counts
   - Users matched / created
   - Attachments imported / skipped (> 25 MB) / failed
   - Unresolved Jira users (privacy mode)

---

## Recommended sequence for a real site

```
1. Dry-run with no project filter         → see total scope
2. Live-run 1–2 small projects             → sanity check
3. Live-run remaining projects in batches  → split by projectKeys if many
```

The whole import runs in **one HTTP request** (Vercel cap: 300s). Big sites should be split into batches via the project-keys input.

---

## Re-running / idempotency

| Safe to re-run | Will duplicate on re-run |
|---|---|
| Users (matched by email) | **Comments** (no natural key) |
| Projects (key: `orgId + projectKey`) | **Worklog → timesheet entries** (no natural key) |
| Statuses, issue types, sprints (`projectId + name`) | |
| Issues (`projectId + key`) | |
| Attachments (`issueId + sourceSystem + sourceAttachmentId`) | |
| Project memberships (`projectId + userId`) | |

**If a comment-bearing import fails mid-way:** retry with **Include comments OFF + Include worklog OFF**, then a targeted re-run of just the affected projects with those flags back on.

---

## Auto-created users — what happens to them

Jira users with no matching QuikTrack account are created with:
- `password = null` — they cannot sign in with a password.
- Granted **OrgMember**, **UserAppAccess**, and the default QuikTrack member role.
- They sign in via **Forgot Password** (sets a password) or via SSO if your org has it configured.

---

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `Jira auth failed` | Wrong domain (should be `acme.atlassian.net`, not a full URL) or revoked API token |
| `Jira returned non-JSON …` | Domain wrong — usually a `/jira` or `/browse` path that shouldn't be there |
| `users.created` is huge | Most Jira users don't exist in QuikTrack yet — expected on first run |
| `attachments.failed` non-zero | Look at server logs — usually a single large file that timed out; rerun the affected project |
| `attachments.skippedTooLarge` non-zero | Files > 25 MB — limit is enforced at the importer |
| Empty inline image in an imported description | The attachment failed to upload, or filename in ADF alt doesn't match — check the Attachments section on that issue |
| Imported issues show wrong assignee | The Jira user is privacy-mode (no email) — falls back to importing admin; listed in `unresolvedUsers` |

---

## Where things live

| Surface | File |
|---|---|
| UI | [`app/(dashboard)/settings/migration/page.tsx`](../app/(dashboard)/settings/migration/page.tsx) |
| API | [`app/api/migration/jira/route.ts`](../app/api/migration/jira/route.ts) |
| Driver | [`lib/services/migration/migrate-jira.ts`](../lib/services/migration/migrate-jira.ts) |
| Jira HTTP client + ADF converters | [`lib/services/migration/jira-client.ts`](../lib/services/migration/jira-client.ts) |
| Attachment S3 helpers | [`lib/s3.ts`](../lib/s3.ts) |
| Detailed reference doc | [`jira-migration.md`](./jira-migration.md) |
