# Email Integration — Assignment Notifications

> Branch: `feature/kpi-email-notifications`
> Triggers covered today:
>   - `POST /api/kpi` — every KPI owner gets an email + in-app notification.
>   - `POST /api/priority` — the Priority owner gets an email + in-app notification.
>   - `POST /api/www` — every WWW assignee in `whoIds[]` gets an email + in-app notification (multi-assignee support).
>   - `PUT /api/www/[id]` — when the assignee list changes, the union of old + new assignees gets a "Your action item has been updated" email + in-app notification.

---

## 1. Goals

1. Set up a reusable SMTP email service for QuikScale.
2. After a KPI is saved, send the owner an email:
   - **Subject:** `You have been assigned a KPI`
   - **Body:** KPI name, quarter, year, creator name, link to the KPI.
3. Persist all dispatch attempts in the existing `Notification` table so the
   in-app inbox and the audit trail stay in sync.

---

## 2. Files Added

### `apps/quikscale/lib/services/email.ts`
Generic SMTP service.

- `getTransporter()` — lazy, cached `nodemailer` transporter. Reads:
  - `EMAIL_USER`, `EMAIL_PASSWORD` (or `EMAIL_PASSWORD_B64` — see §6).
  - `SMTP_HOST` (default `smtp.office365.com`).
  - `SMTP_PORT` (default `587`).
  - `SMTP_SECURE` (default `false` — STARTTLS).
  - `SMTP_TLS_CIPHERS` (optional, e.g. `SSLv3` for legacy Office 365).
  - When `secure=false`, sets `requireTLS: true` so STARTTLS is enforced.
- `sendEmail({ to, subject, html, text })` — wraps `transporter.sendMail`,
  returns `{ ok, messageId? , error? }`. Never throws.
- `buildKPIAssignmentEmail({...})` — produces `{ subject, html, text }`
  for the assignment template (HTML escaped; both rich and plain bodies).

### `apps/quikscale/lib/services/kpiNotifications.ts`
Domain-specific orchestrator for KPIs.

- `notifyKPIAssignment({ tenantId, kpiId, kpiName, quarter, year, creatorUserId, ownerUserIds })`
  1. Resolves the creator + every owner from `User` (id, email, name).
  2. `db.notification.createMany` — one `in_app` row per owner with
     `type: "kpi_assigned"`, `relatedEntityId: kpiId`, `relatedEntityType: "KPI"`.
  3. For every owner with an email — sends via `sendEmail`, then writes a
     **second** `Notification` row (`channel: "email"`, type
     `kpi_assigned_email_sent` or `kpi_assigned_email_failed`) so a full
     audit trail of dispatch outcomes lives in the DB.
  4. Email failures are logged and recorded but never thrown — KPI
     creation must not roll back because SMTP was unreachable.

### `apps/quikscale/lib/services/wwwNotifications.ts`
Domain-specific orchestrator for WWW action items.

- `notifyWWWAssignment({ tenantId, itemId, what, when, creatorUserId, ownerUserId })`
  1. Resolves creator + assignee from `User`.
  2. Writes one `in_app` `Notification` row, `type: "www_assigned"`,
     `relatedEntityType: "WWWItem"`.
  3. Sends the email via `sendEmail` then writes a second `Notification` row
     (`channel: "email"`, type `www_assigned_email_sent` or
     `www_assigned_email_failed`).
  4. Same fire-and-forget contract: never throws, never blocks the API.

### `apps/quikscale/lib/services/priorityNotifications.ts`
Domain-specific orchestrator for Priorities (mirrors the KPI flow for the
single-owner case).

- `notifyPriorityAssignment({ tenantId, priorityId, priorityName, quarter, year, creatorUserId, ownerUserId })`
  1. Resolves the creator + owner from `User`.
  2. Writes one `in_app` `Notification` row, `type: "priority_assigned"`,
     `relatedEntityType: "Priority"`.
  3. Sends the email via `sendEmail` then writes a second `Notification` row
     with `channel: "email"` and type `priority_assigned_email_sent` /
     `priority_assigned_email_failed`.
  4. Same fire-and-forget contract: never throws, never blocks the API.

---

## 3. Files Changed

### `apps/quikscale/app/api/www/route.ts` (POST handler)
Imports `notifyWWWAssignment` and, after `writeAuditLog`, fires:

```ts
if (item.who) {
  notifyWWWAssignment({
    tenantId,
    itemId: item.id,
    what: item.what,
    when: item.when,
    creatorUserId: userId,
    ownerUserId: item.who,
  }).catch(err => console.error("[POST /api/www] notifyWWWAssignment failed:", err));
}
```

### `apps/quikscale/app/(dashboard)/www/components/WWWPanel.tsx`
**Who?** is now a **multi-select** rendered with the shared `UserSelect`
(`mode="multi"`) from `@quikit/ui` — same component the KPI/Priority modals
use, so the WWW form now offers avatars + searchable dropdown + chip list of
selected users + per-row checkmarks. The dropdown stays open while the user
toggles multiple assignees. Form state holds `whoIds: string[]`; submit
payload sends `{ who: whoIds[0], whoIds }` so legacy single-owner consumers
(table sort, indexes) keep working.

### Multi-assignee storage
A new `whoIds: String[]` column was added to `WWWItem`. Migration:
`packages/database/prisma/migrations/20260504120000_add_www_who_ids/migration.sql`
backfills existing rows by setting `whoIds = ARRAY[who]`. The single `who`
column is preserved as the *primary* assignee (`= whoIds[0]`) so existing
indexes (`@@index([who])`, `@@index([tenantId, who])`), sort code, and
permission helpers (`canEditWWW`) keep working without change.

GET `/api/www` and PUT `/api/www/[id]` now hydrate the response with
`whoIds: string[]` and `who_users: Array<{ id, firstName, lastName, email }>`
in addition to the legacy `who` / `who_user` fields.

### `apps/quikscale/app/api/priority/route.ts` (POST handler)
Imports `notifyPriorityAssignment` and, after `writeAuditLog`, fires:

```ts
if (priority.owner) {
  notifyPriorityAssignment({
    tenantId,
    priorityId: priority.id,
    priorityName: priority.name,
    quarter: priority.quarter,
    year: priority.year,
    creatorUserId: userId,
    ownerUserId: priority.owner,
  }).catch(err => console.error("[POST /api/priority] notifyPriorityAssignment failed:", err));
}
```

### `apps/quikscale/app/api/kpi/route.ts` (POST handler)
Imports `notifyKPIAssignment` and, after `kPILog.create`, fires:

```ts
const ownerUserIds = isTeamLevel
  ? (validated.ownerIds ?? [])
  : validated.owner ? [validated.owner] : [];

if (ownerUserIds.length > 0) {
  notifyKPIAssignment({
    tenantId,
    kpiId: kpi.id,
    kpiName: kpi.name,
    quarter: kpi.quarter,
    year: kpi.year,
    creatorUserId: userId,
    ownerUserIds,
  }).catch(err => console.error("[POST /api/kpi] notifyKPIAssignment failed:", err));
}
```

Fire-and-forget so a slow SMTP server can never delay the API response.

### `apps/quikscale/.env`
Appended:

```
# EMAIL (SMTP)
EMAIL_USER="support@quikit.ai"
EMAIL_PASSWORD="Q!kS#uPp0rt$24%G4"
EMAIL_PASSWORD_B64="USFrUyN1UHAwcnQkMjQlRzQ="
SMTP_FROM="support@quikit.ai"
SMTP_HOST="smtp.office365.com"
SMTP_PORT="587"
SMTP_SECURE="false"
SMTP_TLS_CIPHERS="SSLv3"
APP_URL="http://localhost:3004"
```

### `apps/quikscale/package.json`
Dependencies added:

| Package | Version | Why |
|---|---|---|
| `nodemailer` | `^7.0.13` | SMTP client |
| `@types/nodemailer` (dev) | `^8.0.0` | TypeScript types |

---

## 4. Database — `Notification` Model (already existed)

Defined in `packages/database/prisma/schema.prisma:1456`. No migration required.

```prisma
model Notification {
  id                String    @id @default(cuid())
  tenantId          String
  userId            String
  title             String
  message           String    @db.Text
  type              String
  relatedEntityId   String?
  relatedEntityType String?
  read              Boolean   @default(false)
  readAt            DateTime?
  channel           String    @default("in_app")
  createdAt         DateTime  @default(now())

  @@index([tenantId, userId, read])
}
```

### Notification rows produced per KPI create

For a KPI assigned to N owners, this feature writes **2 × N** rows:

| `type`                          | `channel` | When written                          |
|---------------------------------|-----------|---------------------------------------|
| `kpi_assigned`                  | `in_app`  | Once per owner, immediately on save   |
| `kpi_assigned_email_sent`       | `email`   | After SMTP `250 OK`                   |
| `kpi_assigned_email_failed`     | `email`   | After SMTP error (with error message) |
| `priority_assigned`             | `in_app`  | Once on save (single owner)           |
| `priority_assigned_email_sent`  | `email`   | After SMTP `250 OK`                   |
| `priority_assigned_email_failed`| `email`   | After SMTP error (with error message) |
| `www_assigned`                  | `in_app`  | Once per assignee on save             |
| `www_assigned_email_sent`       | `email`   | After SMTP `250 OK`                   |
| `www_assigned_email_failed`     | `email`   | After SMTP error (with error message) |
| `www_reassigned`                | `in_app`  | Once per (old ∪ new) assignee on PUT when assignee list changes |
| `www_reassigned_email_sent`     | `email`   | After SMTP `250 OK`                   |
| `www_reassigned_email_failed`   | `email`   | After SMTP error (with error message) |

`relatedEntityId` is the new entity id, `relatedEntityType` is `"KPI"` or
`"Priority"`, so any inbox UI / drill-down can link straight back to it.

---

## 5. Email Templates

### KPI assignment

**Subject:** `You have been assigned a KPI`

**Plain-text body:**

```
Hi <ownerName>,

You have been assigned a new KPI by <creatorName>.

KPI: <kpiName>
Period: <quarter> <year>

View it here: <APP_URL>/kpi?highlight=<kpiId>

— QuikScale
```

### WWW action-item reassignment (PUT)

**Subject:** `Your action item has been updated`

**Plain-text body:**

```
Hi <recipientName>,

<updaterName> updated the assignees on an action item.

What: <what>
Updated by: <updaterName>
Previous assignees: <comma-joined names>
New assignees: <comma-joined names>

View it here: <APP_URL>/www?highlight=<itemId>

— QuikScale
```

The HTML body strikes-through the previous assignees and bolds the new ones.
Recipients are the **union** of the old and new assignee lists, so removed
people learn they're off the item and added people learn they're on it.
`notifyWWWReassignment` is a no-op when the lists are identical.

### WWW action-item assignment

**Subject:** `A new action item has been assigned to you`

**Plain-text body:**

```
Hi <ownerName>,

<creatorName> has assigned you a new action item on QuikScale.

What: <what>
When (deadline): <whenDate>

View it here: <APP_URL>/www?highlight=<itemId>

— QuikScale
```

`whenDate` is rendered with `toLocaleDateString("en-US", { year, month: "short", day })`.

### Priority assignment

**Subject:** `A Priority has been assigned to you`

**Plain-text body:**

```
Hi <ownerName>,

<creatorName> has assigned you a new Priority on QuikScale.

Priority: <priorityName>
Period: <quarter> <year>

View it here: <APP_URL>/priority?highlight=<priorityId>

— QuikScale
```

Both templates ship matching HTML bodies (styled table + CTA button) generated
by `buildKPIAssignmentEmail` / `buildPriorityAssignmentEmail` in
`lib/services/email.ts`. All dynamic values are HTML-escaped via the local
`escapeHtml` helper.

---

## 6. Gotcha — Next.js Env Expansion (`$24` problem)

`@next/env` runs every `.env` value through **dotenv-expand**, which
interprets `$VAR` and `${VAR}` references. The configured password
`Q!kS#uPp0rt$24%G4` contains `$24`, which expands to `""` because no env
variable named `24` exists. Result: the loaded password becomes
`Q!kS#uPp0rt%G4` (14 chars instead of 17), and Office 365 returns:

```
535 5.7.139 Authentication unsuccessful, the user credentials were incorrect.
```

### Fix
Pass the password as **base64** via `EMAIL_PASSWORD_B64` so the literal `$`
never appears in the env value. Code prefers `EMAIL_PASSWORD_B64` over
`EMAIL_PASSWORD` whenever it is set:

```ts
const passB64 = process.env.EMAIL_PASSWORD_B64;
const pass = passB64
  ? Buffer.from(passB64, "base64").toString("utf8")
  : process.env.EMAIL_PASSWORD;
```

Diagnostic line printed at transporter init confirms the loaded length:

```
[email] transporter ready host=smtp.office365.com port=587 secure=false user=support@quikit.ai passLen=17
```

`passLen=17` ⇒ full password reached nodemailer.

To regenerate the base64 value (e.g. after a password rotation):

```bash
node -e "console.log(Buffer.from('NEW_PASSWORD','utf8').toString('base64'))"
```

If running this in bash, read from a file (or use single quotes outside any
`$` interpolation context) so the shell does not expand `$N` first.

---

## 7. Verifying Locally

1. Restart `npm run dev` in `apps/quikscale` (Next.js caches env vars per
   process — env edits do not hot-reload).
2. Create a KPI assigned to a user that has an email on file.
3. Watch the dev console:

   ```
   [notifyKPIAssignment] kpiId=<id> recipients=<userId>
   [email] transporter ready host=smtp.office365.com port=587 secure=false user=support@quikit.ai passLen=17
   [email] sent to=<recipient> messageId=<...>
   ```

4. Confirm DB rows:

   ```sql
   SELECT id, userId, type, channel, message, "createdAt"
   FROM "Notification"
   WHERE "relatedEntityId" = '<kpiId>'
   ORDER BY "createdAt";
   ```

   Expect one `in_app` row + one `email` row per owner.

---

## 8. Failure Modes & Operator Notes

| Symptom in logs                                | Likely cause                                               | Action |
|-----------------------------------------------|-----------------------------------------------------------|--------|
| `passLen` ≠ real password length              | env-expansion ate a `$N`                                   | Use `EMAIL_PASSWORD_B64` |
| `535 5.7.139` with correct `passLen`          | SMTP AUTH disabled on the O365 mailbox                     | Admin: `Set-CASMailbox -Identity support@quikit.ai -SmtpClientAuthenticationDisabled $false`, or enable Authenticated SMTP in Admin Center |
| `535 5.7.3` / `5.7.57`                        | Basic auth blocked by MFA / Security Defaults              | Issue an app password for the mailbox and replace `EMAIL_PASSWORD_B64` |
| Connection timeout to `smtp.office365.com:587`| Outbound 587 blocked by network                            | Verify firewall / try from another network |
| `Email transporter not configured`            | `EMAIL_USER` / `EMAIL_PASSWORD(_B64)` missing              | Set env vars and restart dev server |

---

## 9. Out of Scope (future)

- Email queue / retry on transient SMTP failure (today the failed dispatch is
  recorded as a `kpi_assigned_email_failed` row but not retried).
- KPI **update** notifications (only **create** is wired today).
- Per-user notification preferences (mute / digest / channel selection).
- Templated emails for other lifecycle events (Priority assigned, KPI weekly
  miss, etc.) — the `email.ts` service is generic and ready to be reused.

---

## 10. Quick Reference

| Need to…                              | File                                                |
|---------------------------------------|-----------------------------------------------------|
| Change SMTP host / port               | `apps/quikscale/.env`                               |
| Change subject / body text            | `apps/quikscale/lib/services/email.ts` → `buildKPIAssignmentEmail` |
| Add a new notification trigger        | Call `sendEmail` from a new orchestrator alongside `kpiNotifications.ts` |
| Add a new notification type           | Pick a `type` string + write rows via `db.notification.create` |
| Rotate the SMTP password              | Update `EMAIL_PASSWORD_B64` (regenerate per §6)     |
