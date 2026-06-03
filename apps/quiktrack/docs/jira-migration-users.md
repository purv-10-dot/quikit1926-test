# Migrating Jira users → QuikTrack — full guide

How to get **every** Jira user across to QuikTrack, including the ones that show up under "Unresolved Jira users (privacy mode)" after a migration.

For the general migration flow see [`jira-migration-quickstart.md`](./jira-migration-quickstart.md). Full reference: [`jira-migration.md`](./jira-migration.md).

---

## TL;DR

| Jira user type | What the importer does today | Action needed |
|---|---|---|
| Email is publicly visible | Matched by email if exists, else **auto-created** with `password = null` | None — works out of the box |
| Email visibility = "Only you" / "Private" | **Skipped** — listed in `unresolvedUsers`; any references fall back to the importing admin | Have the user flip email visibility, then re-run |
| Account type = `app` / `customer` | Filtered out (bots / customer portal users) | None — we don't want them anyway |
| Active = false (deactivated) | Filtered out | None |

The only category that needs work is the second row — **privacy-mode users**. The rest of this doc is about getting them in.

---

## 1. Why some users get skipped

The Jira REST endpoint `/rest/api/3/users/search` returns:

```json
[
  { "accountId": "712020:abc…", "emailAddress": "alice@acme.com", "displayName": "Alice" },
  { "accountId": "712020:def…", "emailAddress": null,             "displayName": "Bob"   }
]
```

QuikTrack identifies people **by email**. So:

- Alice → matched (or created) and the rest of the import wires her up as assignee / reporter / commenter normally.
- Bob → no email to match on. The importer records `712020:def…` in `unresolvedUsers` and continues. Anywhere Bob was referenced in Jira (assigned, reporting, commenting) the QuikTrack row gets either the importing admin or `null` for that field — see `migrateOneProject` in [migrate-jira.ts](../lib/services/migration/migrate-jira.ts).

The `emailAddress` becomes `null` whenever the user's Atlassian profile **Email visibility** is set to **"Only you"** (default for new accounts since 2018).

---

## 2. The fix — make every email visible, then re-run

### Option A — Org-wide (preferred, if you're a Jira admin)

If you have Atlassian Organisation admin rights (different from a site/Jira admin), you can force email visibility for everyone in the org:

1. Go to <https://admin.atlassian.com>.
2. Pick your organisation.
3. **Security → Identity providers** → if you use Atlassian-managed accounts, this is where the org-wide profile policy lives.
4. Under your organisation's user policy, set **Email address visibility = Anyone** (or **Visible to organisation**).
5. Wait ~5 minutes for Atlassian to propagate.
6. Re-run the QuikTrack migration. The `unresolvedUsers` count should drop to 0 (or just bots / deactivated users).

Note: depending on your Atlassian plan, this setting may not be available. In that case fall back to **Option B**.

### Option B — Per user (always works, but tedious)

Each affected user (you have their `accountId` from the migration report — match it to a person via Jira's user directory) does the following themselves:

1. Sign in to Atlassian.
2. Open <https://id.atlassian.com/manage-profile/profile-and-visibility>.
3. Scroll to **Contact** → **Email**.
4. Change visibility from **"Only you"** to **"Anyone"** (public) or at minimum **"Your organization"**.
5. Save.

They do not need to take any further action — they will not be emailed by the import itself, and they keep their original Jira credentials. The change is one-way and trivial to revert.

### Option C — You add them by hand in QuikTrack first

If you can't or won't change the user's Atlassian visibility, **pre-create** the QuikTrack user **before** the migration:

1. In QuikTrack **Settings → User Management → Add User**.
2. Use the user's **real corporate email** (whatever they would have entered on Atlassian).
3. Pick `Member` (or whatever role you want).
4. Save.

Now they have a QuikTrack `auth.User` row with the real email. **But** the migration still won't link them — because the importer matches Jira `accountId` → email, and Jira still hides that email. So this option alone doesn't help.

The only way Option C helps is if you **combine it with B**: the user fixes visibility, then the importer sees their email and finds the existing QuikTrack row. Use it only if you want to pre-seed roles before the import.

---

## 3. Re-running after fixing visibility

Re-running the migration is **safe** for users — the importer:

- Matches existing QuikTrack accounts by email (idempotent).
- Skips creating duplicates.
- Adds OrgMember + UserAppAccess + default QuikTrack role if missing.

What's **not** safe to re-run is **comments and worklog** — they get duplicated. So when re-running solely to pick up newly-visible users, untick **Include comments** and **Include worklog** in Step 2.

Per-project breakdown idempotency:

| Re-running re-imports | Re-running duplicates |
|---|---|
| Users | Comments |
| Projects, statuses, sprints, issue types | Worklog → Timesheet entries |
| Issues (with refreshed assignee/reporter/description) | |
| Project memberships | |
| **Attachments** (since 2026-06-01) | |

After re-running, the affected issues should now have the correct `assigneeId` / `reporterId`, and previously-orphaned comment author bylines stay attributed to the actor (we don't go back and fix comment authors — that's a known limitation).

---

## 4. Verifying what got migrated

### From the report card

After the import the UI shows:

```
USERS (matched / created)
8 / 12
```

- **matched** — already had a QuikTrack auth.User with the same email → linked.
- **created** — brand new auth.User created from Jira data.

Both groups get OrgMember + UserAppAccess + default Member role.

### From the database (one-off check)

```sql
-- All QuikTrack auth.Users that came in via Jira are recognisable because
-- they have password = NULL (Jira-imported) AND createdAt close to your
-- migration run timestamp.
SELECT u.email, u.firstName, u.lastName, u."createdAt"
FROM auth."User" u
WHERE u.password IS NULL
ORDER BY u."createdAt" DESC
LIMIT 50;
```

Or via the QuikTrack admin panel — **Settings → User Management** lists everyone with QuikTrack access in your org.

---

## 5. What auto-created users can / can't do

When the importer creates a brand-new QuikTrack user (the "created" half of the matched/created count), the row looks like:

| Field | Value |
|---|---|
| `email` | The Jira email (lowercased) |
| `password` | `NULL` — cannot sign in with credentials |
| `firstName` / `lastName` | Parsed from Jira `displayName` (split on first space) |
| `mustChangePassword` | `false` |
| `inviteMethod` (on OrgMember) | `"native"` |
| `status` (on OrgMember) | `"active"` |

To sign in they need to either:

- **Use Forgot Password** on the QuikTrack login page → sets a password via the email link, then signs in normally.
- **Use SSO** if your org has Google / Microsoft SSO configured on QuikTrack — the auth callback auto-links the existing User row.

No invitation email is sent for Jira-imported users — they're created silently. If you want them to know they have access, send a manual message pointing them at QuikTrack's `/login` page.

---

## 6. Common pitfalls

| Symptom | Cause | Fix |
|---|---|---|
| Same person counted twice in `created` | Their Jira email differs from their existing QuikTrack email (e.g. `firstname@acme.com` vs `f.lastname@acme.com`) | Merge manually in DB or delete the duplicate; future invites use the right email |
| `unresolvedUsers` still has entries after Option A | Some users were created **before** the org policy was set; their per-user setting overrides the policy | Have them follow Option B |
| Issue assigned to "(importing admin)" instead of the real Jira assignee | That Jira user was privacy-mode at import time | Fix visibility, re-run with comments/worklog **off**, the issue's assignee will be re-linked |
| User created but they can't sign in | `password = NULL`. They need to use **Forgot Password** | Tell them, or send them the QuikTrack `/login` URL |
| `accountType = customer` users missing | Those are Jira Service Desk portal users — we deliberately skip them | Add them manually via Settings → User Management if you need them |

---

## 7. Where in the code

| What | File / function |
|---|---|
| Filter Jira users (active + accountType) | [`migrate-jira.ts` lines 290-298](../lib/services/migration/migrate-jira.ts#L290-L298) |
| Match by email | [`migrate-jira.ts` lines 300-312](../lib/services/migration/migrate-jira.ts#L300-L312) |
| Auto-create new user | [`migrate-jira.ts` lines 326-340](../lib/services/migration/migrate-jira.ts#L326-L340) |
| Record unresolved accountIds | [`migrate-jira.ts` lines 302-304](../lib/services/migration/migrate-jira.ts#L302-L304) |
| Grant OrgMember + UserAppAccess + role | [`migrate-jira.ts` `ensureMembershipAndAccess`](../lib/services/migration/migrate-jira.ts#L999-L1041) |
