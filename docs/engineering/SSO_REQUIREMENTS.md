# SSO Login Requirements — Google + Microsoft

**Audience:** DevOps / Infra team
**Requested by:** Product (Ashwin)
**Date:** 2026-04-22
**Scope:** Enable "Sign in with Google" and "Sign in with Microsoft" on **QuikScale** and **Admin Panel** only.
**Not in scope:** Super Admin portal (password + TOTP only — never SSO).

---

## 1. TL;DR — what we need from you

1. Create a **Google OAuth Client** and share `Client ID` + `Client Secret`
2. Register a **Microsoft (Azure AD) multi-tenant app** and share `Client ID`, `Client Secret`, `Tenant ID`
3. Provide values for **dev**, **UAT**, and **prod** environments (9 env vars × 2 apps = 18 Vercel entries)
4. Confirm you've added the **redirect URIs** listed in §4
5. Return the filled-in checklist in §7

We'll handle the code side. No infra changes needed (no new servers, no DNS, no firewall rules).

---

## 2. Policy summary (locked decisions)

| Decision | Value | Why |
|---|---|---|
| Who can log in via SSO? | **Invitation-only** — OAuth only works if the user's email is already an invited/active member in our DB | Prevents anyone on the internet with a Gmail from creating accounts |
| Account linking | **Auto-link if email is verified by provider** (Google always verifies; we'll reject Microsoft accounts where email is not verified) | Seamless UX for existing users |
| Microsoft scope | **`organizations` endpoint** (multi-tenant — any enterprise Azure AD tenant. Rejects personal `hotmail.com`/`outlook.com`) | Enterprise-only, broadest coverage without opening to personal accounts |
| Password login | **Kept in parallel** — users can use password OR SSO | No forced migration; existing users unaffected |
| Apps in scope | **QuikScale** + **Admin Panel** | Super Admin stays password-only |

---

## 3. What to create — step-by-step

### 3.1 Google OAuth Client

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Pick or create a project — recommended: **"QuikScale-SSO"** (one project is enough; a single Client ID works for all 3 environments since we'll whitelist multiple redirect URIs)
3. **APIs & Services** → **OAuth consent screen**
   - User type: **External**
   - App name: **QuikScale**
   - User support email: `devops@moreyeahs.com` (or whichever address you use)
   - App logo: upload QuikScale logo (optional but recommended — users see this on the Google consent page)
   - Authorized domains: add `moreyeahs.com` (and any other tenant domains that'll use SSO — we can add more later)
   - Scopes: `openid`, `email`, `profile` (the defaults — nothing extra needed)
   - Publishing status: **In production** (needed for external users — until this is done, only test users can log in)
4. **Credentials** → **Create Credentials** → **OAuth client ID**
   - Application type: **Web application**
   - Name: **QuikScale + Admin (all envs)**
   - Authorized JavaScript origins: (see §4.1)
   - Authorized redirect URIs: (see §4.1)
5. Copy the generated **Client ID** and **Client Secret** → put into §7

### 3.2 Microsoft (Azure AD) App Registration

1. Go to [Azure Portal](https://portal.azure.com) → **Microsoft Entra ID** (formerly Azure AD) → **App registrations** → **+ New registration**
2. Configure:
   - Name: **QuikScale SSO**
   - Supported account types: **"Accounts in any organizational directory (Any Microsoft Entra ID tenant - Multitenant)"**
     - ⚠️ Do NOT pick "single tenant" or "multitenant + personal Microsoft accounts"
   - Redirect URI: leave blank for now — we'll add them in the next step
   - Click **Register**
3. From the new app's Overview page, copy:
   - **Application (client) ID** → put into §7
   - **Directory (tenant) ID** → NOT the value we send, we use the literal string `organizations` instead (see §5), but save this in case we ever want to restrict to your Azure tenant only
4. **Authentication** tab → **+ Add a platform** → **Web**
   - Redirect URIs: add all the URIs in §4.2
   - Front-channel logout URL: leave blank
   - Implicit grant: leave all unchecked
   - Click **Configure**
5. **Certificates & secrets** → **+ New client secret**
   - Description: `QuikScale SSO prod`
   - Expires: **24 months** (set a calendar reminder to rotate before expiry — expired secrets will break login)
   - Click **Add**
   - ⚠️ **Copy the `Value`** (not the Secret ID) immediately — it's only shown once. Put into §7
6. **API permissions** tab → confirm the defaults are present:
   - `Microsoft Graph` → `User.Read`, `email`, `openid`, `profile`
   - If anything is missing: **+ Add a permission** → **Microsoft Graph** → **Delegated permissions** → check the missing ones → **Add**
   - **No admin consent required** for these scopes — users consent on first login

---

## 4. Redirect URIs to whitelist

These must be added **exactly** as written (trailing slash matters, case matters).

### 4.1 Google — Authorized redirect URIs

Add all 6:

```
# QuikScale
http://localhost:3004/api/auth/callback/google
https://quikscale-dev.vercel.app/api/auth/callback/google
https://quikscale.vercel.app/api/auth/callback/google

# Admin
http://localhost:3005/api/auth/callback/google
https://quik-it-admin-dev.vercel.app/api/auth/callback/google
https://quik-it-admin.vercel.app/api/auth/callback/google
```

**Authorized JavaScript origins** (for Google — required separately, no `/api/...` path):

```
http://localhost:3004
https://quikscale-dev.vercel.app
https://quikscale.vercel.app
http://localhost:3005
https://quik-it-admin-dev.vercel.app
https://quik-it-admin.vercel.app
```

> 📝 **Action item for DevOps:** confirm the exact production URLs — the above are our best guess from the Vercel project names. If the prod domain is actually `app.moreyeahs.com` or a custom domain, replace accordingly and tell us.

### 4.2 Microsoft — Redirect URIs

Add all 6 under the **Web** platform:

```
# QuikScale
http://localhost:3004/api/auth/callback/azure-ad
https://quikscale-dev.vercel.app/api/auth/callback/azure-ad
https://quikscale.vercel.app/api/auth/callback/azure-ad

# Admin
http://localhost:3005/api/auth/callback/azure-ad
https://quik-it-admin-dev.vercel.app/api/auth/callback/azure-ad
https://quik-it-admin.vercel.app/api/auth/callback/azure-ad
```

Microsoft does not need separate JavaScript origins — one list of redirect URIs is enough.

---

## 5. Environment variables

Same values go to **two Vercel projects** (`quikscale`, `admin`) in **three environments each** (Development, Preview, Production) = 6 env groups.

| Variable | Value | Notes |
|---|---|---|
| `GOOGLE_CLIENT_ID` | (from §3.1 step 5) | Safe to share internally |
| `GOOGLE_CLIENT_SECRET` | (from §3.1 step 5) | **Secret** — do not paste in Slack/email |
| `AZURE_AD_CLIENT_ID` | (from §3.2 step 3) | Safe |
| `AZURE_AD_CLIENT_SECRET` | (from §3.2 step 5) | **Secret** |
| `AZURE_AD_TENANT_ID` | literal string `organizations` | Enables multi-tenant. Do NOT paste the GUID — we want any enterprise Azure tenant, not one specific one |
| `SSO_ALLOWED_DOMAINS` | `moreyeahs.com` (extend as needed) | Comma-separated. We hard-fail the login if the user's email domain isn't in this list. Leave empty to allow any invited user regardless of domain. |

**Dev env** (Vercel "Development") may use the same values as Preview since local dev runs against the same OAuth client.

### 5.1 How to set in Vercel

For each project (`quikscale`, `admin`):

1. **Vercel dashboard** → project → **Settings** → **Environment Variables**
2. Add each variable with:
   - Key: exactly as in the table above (case-sensitive)
   - Value: filled in from §3
   - Environments: tick **Development**, **Preview**, **Production** (same values across all 3 since we whitelisted all URLs on one OAuth client)
3. Click **Save**
4. Trigger a redeploy so the new vars take effect (next push, or manual redeploy from the Deployments tab)

---

## 6. Ongoing responsibilities (post-launch)

| Who | What | Cadence |
|---|---|---|
| DevOps | Rotate Microsoft client secret before expiry (set a calendar reminder for 23 months after creation) | Every ~23 months |
| DevOps | Rotate Google client secret if compromise suspected (no forced expiry) | On-demand |
| DevOps | Add new tenant domains to `SSO_ALLOWED_DOMAINS` when new org onboards | On new-tenant onboarding |
| DevOps | Add redirect URIs when we launch on a new custom domain (e.g. `app.moreyeahs.com` instead of `*.vercel.app`) | On domain change |
| Product | Test both SSO buttons after each major auth-package release | Per release |

---

## 7. Checklist — please fill in and return

Return this table (or a gist / 1Password share / whatever your team prefers for secrets). Put secrets in a secure channel — not email, not Slack DMs.

### Google

- [ ] OAuth consent screen configured (app name, support email, logo, domains)
- [ ] OAuth consent screen status: **In production**
- [ ] All 6 redirect URIs from §4.1 added
- [ ] All 6 JavaScript origins from §4.1 added
- [ ] `GOOGLE_CLIENT_ID` = `__________________________________`
- [ ] `GOOGLE_CLIENT_SECRET` = **share via secure channel** (1Password / Bitwarden / sealed env)

### Microsoft

- [ ] App registration created (multitenant — "Accounts in any organizational directory")
- [ ] All 6 redirect URIs from §4.2 added under Web platform
- [ ] API permissions: `User.Read`, `email`, `openid`, `profile` confirmed
- [ ] `AZURE_AD_CLIENT_ID` = `__________________________________`
- [ ] `AZURE_AD_CLIENT_SECRET` = **share via secure channel**
- [ ] Client secret expiry date: `__________` (dd/mm/yyyy — needs rotation before this date)
- [ ] `AZURE_AD_TENANT_ID` = `organizations` (literal string — no action needed unless we ask you to change it)

### Vercel (both projects, all 3 envs)

- [ ] QuikScale — `Development` env updated
- [ ] QuikScale — `Preview` env updated
- [ ] QuikScale — `Production` env updated
- [ ] Admin — `Development` env updated
- [ ] Admin — `Preview` env updated
- [ ] Admin — `Production` env updated
- [ ] Confirmation: a redeploy has been triggered on both projects (date of redeploy: __________)

### Other

- [ ] Confirmed production URLs (if not `quikscale.vercel.app` / `quik-it-admin.vercel.app`): provide here → `__________`
- [ ] Initial `SSO_ALLOWED_DOMAINS` list agreed: `__________` (default: `moreyeahs.com`)

---

## 8. What Product will do (for your reference — not blocking you)

Once you return the checklist, Product side will:

1. Add `GoogleProvider` + `AzureADProvider` to `packages/auth/index.ts`
2. Extend the `signIn()` callback to:
   - Block unknown emails (must match an existing `User` in DB — invitation-only)
   - Reject unverified Microsoft emails (`profile.email_verified === false`)
   - Enforce `SSO_ALLOWED_DOMAINS` check
3. Add "Sign in with Google" + "Sign in with Microsoft" buttons to the QuikScale and Admin login pages
4. Add a small `oauthProviders: String[]` column to `User` so the UI can show which SSO methods a user has linked (optional, non-breaking)
5. Ship a test matrix:
   - OAuth for invited user → succeeds, session created
   - OAuth for un-invited user → rejected with "You haven't been invited to this workspace" message
   - OAuth for wrong-domain user → rejected with "Your organization isn't allowed"
   - OAuth for unverified-email Microsoft user → rejected
   - Password login unaffected for all existing users
6. No database migration needed beyond the optional `oauthProviders` column

**Estimated Product effort:** 1-1.5 days once credentials are in place.

---

## 9. Security notes

- OAuth tokens are **not stored** in our DB. We only use them during the login handshake; after that the user has a normal NextAuth JWT session.
- Client secrets are **never** committed to git. They live only in Vercel Environment Variables + your secret store (1Password/Bitwarden/etc.).
- If a client secret leaks: rotate immediately in Google/Azure console, update Vercel env vars, redeploy. Users stay logged in via existing JWT — only new logins break until the new secret is live.
- Super Admin portal is **intentionally excluded**. Even if requested later, adding SSO there requires a separate security review because it would expose tenant-wide god-mode capabilities to any compromised SSO account.

---

## 10. Questions? Who to ask

- **Product / code side:** Ashwin (ashwin@moreyeahs.com)
- **Secret sharing channel:** agreed with DevOps — (fill in: 1Password vault / sealed env file / etc.)
- **Emergency (if SSO login is broken in prod):** page Product, then DevOps. Fallback: password login still works, so users aren't locked out.

---

*This document is a living spec. Anything unclear, flag it here or in the engineering channel and we'll update.*
