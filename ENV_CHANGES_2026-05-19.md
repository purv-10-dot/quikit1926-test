# Environment Variable Changes — 2026-05-19

Complete list of every `.env*` file edited on 2026-05-19 across the
monorepo, what changed in each, and why.

---

## Summary

| File | Type | Action |
|---|---|---|
| `apps/quikit/.env.local` | live runtime | Added Google + Microsoft OAuth credentials block |
| `apps/admin/.env.local.example` | docs / example | Added `NEXT_PUBLIC_QUIKIT_URL` / `QUIKIT_URL` |
| `apps/quikit/.env.local.example` | docs / example | Fixed `QUIKIT_URL` dev port `:3000` → `:3001`; reworded `NEXT_PUBLIC_AUTH_URL` comment |

Three files total. No other `.env*` files were touched.

---

## 1. `apps/quikit/.env.local` (live runtime)

**Why:** The launcher's marketing-modal **Continue with Google** /
**Continue with Microsoft** buttons silently no-op'd because
`packages/auth/index.ts`'s `createAuthOptions` only registers a provider
when both env vars are present:

```ts
...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
  ? [GoogleProvider({ ... })]
  : [])
```

`apps/auth/.env.local` had the credentials; `apps/quikit/.env.local`
did not. NextAuth on `:3001` therefore had no Google or AzureAD
provider registered, and every SSO click resolved to nothing.

**Appended these vars** (values mirror `apps/auth/.env.local`):

| Variable | Used by |
|---|---|
| `GOOGLE_CLIENT_ID` | `GoogleProvider` registration in `createAuthOptions` |
| `GOOGLE_CLIENT_SECRET` | `GoogleProvider` registration in `createAuthOptions` |
| `MICROSOFT_CLIENT_ID` | `AzureADProvider` registration in `createAuthOptions` |
| `MICROSOFT_CLIENT_SECRET` | `AzureADProvider` registration in `createAuthOptions` |
| `MICROSOFT_TENANT_ID` | `AzureADProvider` registration (defaults to `"common"` if unset) |

The linter restructured the appended block into two logically-grouped
sections in the file ("Google SSO (OAuth 2.0)" and "local microsoft
calendar"); the variable names and values are unchanged.

**Action required outside the repo:** for SSO to complete the OAuth
round-trip locally, the Google Cloud Console and Microsoft Entra ID
app registrations for these `CLIENT_ID`s must include the launcher's
callback URLs as authorized redirect URIs:

- `http://localhost:3001/api/auth/callback/google`
- `http://localhost:3001/api/auth/callback/azure-ad`

Without those entries the provider returns `redirect_uri_mismatch`
after the consent screen.

---

## 2. `apps/admin/.env.local.example` (docs)

**Why:** Onboarding-email invitation links rendered by the Admin Portal
need to land users on the QuikIT launcher (`:3001`), not on the admin
app itself or the central auth host. The renderer reads
`NEXT_PUBLIC_QUIKIT_URL` / `QUIKIT_URL`, but the example file didn't
document them with the correct dev values — both were commented-out
placeholders under the unrelated "QuikIT OAuth" block.

**Added:**

```env
# Invitation links — the "Set Up My Account" button in onboarding emails
# points at `${NEXT_PUBLIC_QUIKIT_URL}/invitations/accept?token=…`. This must
# resolve to the QuikIT launcher (which auto-opens its marketing-page
# LoginModal on `?next=`), NOT the central auth host. :3001 in dev.
NEXT_PUBLIC_QUIKIT_URL=http://localhost:3001
QUIKIT_URL=http://localhost:3001
```

**Reworked:** removed the duplicate `# QUIKIT_URL=` and
`# NEXT_PUBLIC_QUIKIT_URL=` placeholders from the existing "QuikIT
OAuth" block (since they're now defined above with values) and added a
note that the same vars drive the invitation-email renderer:

```env
# QuikIT OAuth (leave blank for local CredentialsProvider mode).
# QUIKIT_URL / NEXT_PUBLIC_QUIKIT_URL are also used by the invitation-email
# renderer above — keep them in sync.
# QUIKIT_CLIENT_ID=
# QUIKIT_CLIENT_SECRET=
```

---

## 3. `apps/quikit/.env.local.example` (docs)

**Why:** Two outdated comments — the dev port hints were stale and
misleading anyone setting up a fresh checkout.

**Fixed (commented-out value):**

- Before: `# QUIKIT_URL=http://localhost:3000`
  (wrong — `:3000` is the auth host, not the launcher)
- After: `# QUIKIT_URL=http://localhost:3001`
  (matches `apps/quikit/package.json next dev -p 3001`)

**Fixed (comment text):**

- Before: `# Central credentials login (apps/auth, e.g. :3004). When set, /login on this app is not served locally —`
- After: `# Central credentials login (apps/auth, e.g. :3000 in dev). When set, /login on this app is not served locally —`

**Expanded** the comment around `QUIKIT_URL` to call out its role in
the invitation-email landing flow:

```env
# Base URL of THIS QuikIT launcher (OAuth issuer + invitation-email landing
# host). Local dev is :3001 (matches apps/quikit/package.json `next dev -p 3001`).
# The invitation-email renderer in lib/email.ts reads this to build the
# "Set Up My Account" link, so the user lands on the launcher's marketing
# LoginModal (image 1) rather than the auth app's dark Set-Password page.
# QUIKIT_URL=http://localhost:3001
```

---

## Files NOT touched

The following `.env*` files were **inspected** (to confirm
`QUIKIT_URL=http://localhost:3001` was already present) but **not
modified**:

- `apps/auth/.env.local` and `apps/auth/.env.local.example`
- `apps/admin/.env.local`
- `apps/quikscale/.env.local`, `apps/quikscale/.env`, `apps/quikscale/.env.example`
- `apps/quiktrack/.env.local`
- Any `.env*` file under `packages/`
- Root-level `.env*` files

Because every relevant app's runtime `.env.local` already had
`QUIKIT_URL=http://localhost:3001` set, the code change that switched
the email renderer's source from `NEXT_PUBLIC_AUTH_URL`/`NEXTAUTH_URL`
to `QUIKIT_URL`/`NEXT_PUBLIC_QUIKIT_URL` worked without any further
env-var edits.

---

## Production deploy notes

The only env change that matters for prod is **#1** — the OAuth
credential block.

| Env | Where to set it in production |
|---|---|
| `GOOGLE_CLIENT_ID` | Vercel `quik-it` project → Settings → Environment Variables |
| `GOOGLE_CLIENT_SECRET` | Vercel `quik-it` project (mark as **Sensitive**) |
| `MICROSOFT_CLIENT_ID` | Vercel `quik-it` project |
| `MICROSOFT_CLIENT_SECRET` | Vercel `quik-it` project (mark as **Sensitive**) |
| `MICROSOFT_TENANT_ID` | Vercel `quik-it` project |

These were added to local dev only; production currently has them on
the `quik-it-auth` project but not on the `quik-it` (launcher) project.
Without them in prod, the marketing-modal SSO buttons will fail the
same way they did in dev before yesterday's fix.

Also confirm the prod OAuth app registrations (Google Cloud Console,
Microsoft Entra ID) include the **production** launcher's callback URLs
in their authorized-redirect-URI lists:

- `https://<launcher-prod-host>/api/auth/callback/google`
- `https://<launcher-prod-host>/api/auth/callback/azure-ad`

Changes **#2** and **#3** are documentation-only — they're already
correct in the live `.env.local` of every checkout, so no production
action is needed for them.
