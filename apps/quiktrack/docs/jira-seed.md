# Seeding dummy data into Jira Cloud

A standalone Node script that populates a Jira Cloud site with realistic-looking dummy projects, sprints, issues, and comments. Built to give the QuikTrack [Jira migration importer](./jira-migration.md) something interesting to chew on.

- **Script:** [`apps/quiktrack/scripts/seed-jira.mjs`](../scripts/seed-jira.mjs)
- **Runs against:** any Atlassian Jira Cloud site you have **admin** rights to
- **Side-effect surface:** creates projects + sprints + issues + comments. Does **not** delete anything. Not all writes are idempotent — see §6.

---

## 1. Prerequisites

| Requirement | Why |
|---|---|
| **Node.js 18+** | Uses built-in `fetch` (no dependencies) |
| **Atlassian account with admin rights** on the target Jira site | Project creation requires admin |
| **Atlassian API token** | Auth via HTTP Basic (email + token) |

Create a token at <https://id.atlassian.com/manage-profile/security/api-tokens> → **Create API token** → use the **Copy** button (never retype — it's easy to confuse `1`/`l` or `O`/`0`).

## 2. Quick start

### PowerShell

```powershell
$env:JIRA_DOMAIN    = "pms72898.atlassian.net"
$env:JIRA_EMAIL     = "you@example.com"
$env:JIRA_API_TOKEN = "<paste token here>"

# Dry-run first — no Jira calls, just prints what would happen
node apps/quiktrack/scripts/seed-jira.mjs --dry-run

# Real run — default: 12 projects with 8–14 issues each
node apps/quiktrack/scripts/seed-jira.mjs

# When done — drop the token from your shell session
Remove-Item Env:JIRA_API_TOKEN
```

### bash / zsh

```bash
JIRA_DOMAIN=pms72898.atlassian.net \
JIRA_EMAIL=you@example.com \
JIRA_API_TOKEN=<paste> \
node apps/quiktrack/scripts/seed-jira.mjs --dry-run
```

## 3. Required environment variables

| Variable | Notes |
|---|---|
| `JIRA_DOMAIN` | Bare host — `acme.atlassian.net`. No protocol, no path. The script strips them defensively but cleaner inputs cleaner outputs. |
| `JIRA_EMAIL` | The Atlassian-account email tied to the token. Must match the account that owns the token. |
| `JIRA_API_TOKEN` | The full token string. Atlassian tokens start with `ATATT…` and are ~190 chars long. |

Missing any of the three → script exits with code 2 and a clear "Missing env var: …" line.

## 4. Flags

| Flag | Default | Purpose |
|---|---|---|
| `--projects=N` | `12` | How many projects to create. Clamped to `[1, 30]`. |
| `--issues-min=N` | `8` | Lower bound for issues-per-project (clamped `[1, 50]`). |
| `--issues-max=N` | `14` | Upper bound for issues-per-project (clamped to `[issues-min, 50]`). |
| `--no-projects` | _off_ | Skip project creation; reuse existing projects (up to `--projects`). Useful for adding more issues to a site you already seeded. |
| `--dry-run` | _off_ | Print every HTTP call the script *would* make. No requests are sent. Auth probe is also mocked, so don't take "Authenticated as undefined" as a real result. |

## 5. What gets created (per project)

```
Project (scrum-template, software)
  ├─ Auto-created scrum board (Jira creates this for free)
  ├─ Sprint #1  — past / closed   (started ~28 days ago, ended ~14 days ago)
  ├─ Sprint #2  — active          (started ~3 days ago, ends ~11 days from now)
  ├─ Sprint #3  — future          (no dates yet)
  ├─ 1 Epic     — "Epic: <noun> rollout"
  └─ 8–14 issues — mix of Story / Task / Bug
        ├─ ~55% transitioned to "In Progress" or "Done"
        ├─ ~60% attached to an active or future sprint
        ├─ Stories link under the Epic via the parent field
        └─ 0–2 comments per issue (plain text)
```

### Field values

| Field | Source |
|---|---|
| Project key | `<NAME-PREFIX><2-char random suffix>` — e.g. `ECOM0O`, `HR0B`. Suffix keeps re-runs from colliding. |
| Project name | From a fixed list of 15 realistic SaaS-product names (see `PROJECT_NAMES` in the script). |
| Project type / template | `software` / `com.pyxis.greenhopper.jira:gh-simplified-scrum-classic` — picked specifically so the script can create sprints (kanban templates can't). |
| Project lead | The authenticated user (`/myself.accountId`). |
| Issue type | Weighted random — Stories and Tasks more common than Bugs. |
| Issue title | `<verb> <noun>` from `TITLE_TEMPLATES` × `NOUNS`. |
| Priority | Random from `Highest / High / Medium / Medium / Medium / Low / Lowest` (weighted to Medium). |
| Description | Single-paragraph ADF doc. |
| Sprint goal | One of: "Ship the MVP", "Reduce bug backlog by 30%", "Onboard 3 new customers", "Cut p95 latency in half", "Migrate to v2 schema". |
| Comment text | One of 7 templated lines (`COMMENTS` array). |

To change any of the above, edit the constants near the top of [`seed-jira.mjs`](../scripts/seed-jira.mjs).

## 6. Idempotency / re-runs

| Object | Idempotent? | Behaviour on re-run |
|---|---|---|
| Project | **Partially** | The random 2-char suffix means new keys are picked, so re-running creates **new** projects. But Jira rejects projects with **duplicate names** (any case) — those get a `400` and are logged as `skipped`. |
| Sprint | **No** | Every run creates new sprints inside the target board. |
| Issue | **No** | Every run creates new issues. |
| Comment | **No** | Every run creates new comments. |

If you want to keep adding issues to projects you already seeded — without creating new projects — use `--no-projects`. The script will pick up the first N existing projects and seed sprints + issues into them.

## 7. Rate limiting & resilience

| Behaviour | Detail |
|---|---|
| Throttle | ≥170 ms between any two requests → ~6 req/s |
| 429 handling | Honours `Retry-After`, up to 3 retries with exponential back-off |
| Non-fatal errors | Project create failures (duplicate name, missing admin) → logged, script continues |
| Per-issue failures | Sprint-attach, transition, and comment failures are swallowed silently so one bad issue doesn't take the whole run down |

## 8. Output (real run)

```
Seeding https://pms72898.atlassian.net as pms72898@gmail.com
Authenticated as PMS

→ Project 1/12: E-commerce Platform (ECOM06)
→ Project 2/12: Mobile Banking App (MBNK0E)
  skipped: POST /rest/api/3/project → 400 Bad Request {"errors":{"projectName":"A project with that name already exists."}}
…

=== Seeding ECOM06 — E-commerce Platform ===
  ✓ 11 issues, 3 sprints, epic=ECOM06-1
…

Done.
```

The `=== Seeding ===` section only iterates over **successfully created** projects, so if one was skipped it won't appear there.

## 9. Cleaning up after a test

Jira Cloud does **not** offer a one-shot "delete all projects" API. Options:

1. **Manual delete via UI** — Project settings → ⋯ → Move to trash. Trashed projects are auto-purged after 90 days, or can be permanently deleted from Settings → Projects → Trash.
2. **Per-project API delete** — `DELETE /rest/api/3/project/{key}` — admin only. A future iteration of this script could add a `--purge-keys=ECOM06,MBNK0E` flag if needed.
3. **Drop the Jira site entirely** — Settings → Billing → Delete site. Nuclear; affects everything on that site.

For a throwaway test site, option 3 is the easiest reset.

## 10. Common issues

| Symptom | Likely cause | Fix |
|---|---|---|
| `Missing env var: JIRA_…` | Env var not set, or set in a different shell session | Re-set `$env:JIRA_*` in the same window before running |
| `401 Unauthorized` with `WWW-Authenticate: OAuth realm=...` and empty body | Token is wrong, revoked, or belongs to a different account | Create a fresh token in the browser using **Copy** — do not retype |
| `403 Forbidden` on `POST /rest/api/3/project` | Not a site admin | Either get admin, or use `--no-projects` against existing ones |
| `400 projectName: A project with that name already exists` | Re-running creates fresh keys but reuses the fixed name list | Expected — the script logs `skipped:` and carries on |
| `no scrum board found — skipping sprints` | Project wasn't created with the scrum template (e.g. when reusing an existing kanban project via `--no-projects`) | Either pick a different project, or change the template constant in the script |
| Issues created but none in sprints | Sprint creation succeeded but the project is **team-managed** ("next-gen") — sprint-attach API is sometimes 403 on those | The seeder swallows the error; issues still exist, just in the backlog. Use a company-managed (classic) project for full coverage. |

## 11. Security notes

The script reads the token from `process.env.JIRA_API_TOKEN`. It is **never** logged, written to disk, or echoed back. But:

- **Never paste a token into chat, PR descriptions, or screenshots.** Once visible, it must be considered compromised and rotated.
- **Don't commit `.env.local` or any file with a real token.** The repo's `.gitignore` blocks `.env*` but verify with `git check-ignore .env.local` before assuming.
- **Rotate after a test run** if you're not 100% sure the token stayed in your shell session.
- **Tokens grant the full scope of your account** — they can create, edit, and delete every project and issue you can. Treat them like passwords.

## 12. What this script does **not** do

- Doesn't create attachments (the Jira importer doesn't migrate them anyway — see [`jira-migration.md`](./jira-migration.md) §8).
- Doesn't create issue links (blocks, relates-to, duplicates).
- Doesn't create custom fields or workflows — uses the defaults the scrum template ships with.
- Doesn't create users — every issue is reported by the script-runner. To exercise the importer's user-matching logic, add real Atlassian users to the site through the UI before running.
- Doesn't create worklog entries. The importer migrates them via Tempo or Jira's built-in worklog API, but the seed script skips them today. Easy to add — see Jira's `/rest/api/3/issue/{key}/worklog` endpoint.

---

## Pairing with the migration importer

Once seeded:

1. Sign into QuikTrack as an org admin.
2. Open **Settings → Migration**.
3. Step 1: site domain `pms72898.atlassian.net`, your Atlassian email, the **current** token.
4. Step 2: leave project keys blank to import everything; keep **Dry run** on; keep comments + worklog enabled.
5. Step 3: **Run dry-run**. The report should show roughly:
   - `projects` ≈ 12
   - `issues` ≈ 120–170
   - `sprints` ≈ 36
   - `comments` ≈ 60–200
   - `worklog` = 0 (the seeder doesn't write any)
6. If the counts look right, flip Dry-run off and re-run live to actually populate QuikTrack.

The expected import path for each entity is documented in [`jira-migration.md`](./jira-migration.md) §4.
