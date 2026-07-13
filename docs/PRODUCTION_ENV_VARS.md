# Production / Vercel Environment Variables

This is the deploy checklist for the env vars touched by the
forgot-password + URL-refactor change set on 2026-05-20. Every variable
below is read through `requireProdEnv()` (or its equivalent) — if it is
**unset in production the app will throw at request time**, by design, so
a missing env never silently falls back to a Vercel preview URL.

Each table groups vars by **Vercel project** (one project per app). Set
all rows in **Project Settings → Environment Variables** for the
**Production** environment (and Preview if you use it).

---

## 1. Marketing / Launcher (Vercel project: `quikit`)

`apps/quikit` — port 3001 in dev.

| Variable | Required in prod? | Used by | Notes |
|---|---|---|---|
| `NEXT_PUBLIC_LOGIN_URL` | ✅ Yes | [`static-page.tsx`](../apps/quikit/app/(marketing)/_components/static-page.tsx) | Where the marketing "Log in" CTA navigates. Usually `https://<auth-host>/login`. |
| `NEXT_PUBLIC_LAUNCHER_URL` | ✅ Yes | [`launcher/route.ts`](../apps/quikit/app/api/apps/launcher/route.ts), middleware, email link builders | Public origin of the launcher itself, e.g. `https://app.quikit.ai`. |
| `NEXT_PUBLIC_QUIKIT_URL` | Alias for the above | several callers fall back to this if `NEXT_PUBLIC_LAUNCHER_URL` is unset | Set one of the two; setting both is fine. |
| `QUIKIT_URL` | Optional server-side mirror | server-only readers (cron, internal email helpers) | Same value as `NEXT_PUBLIC_QUIKIT_URL`. Only needed if the public var is not exposed to that runtime. |
| `NEXTAUTH_URL` | ✅ Yes | NextAuth | Must equal the launcher's public origin. |
| `NEXTAUTH_SECRET` | ✅ Yes | NextAuth | 32+ random bytes. |
| `DATABASE_URL` | ✅ Yes | `@quikit/database` | Postgres connection string. |
| `REDIS_URL` | ✅ Yes (recommended) | Rate limiter, OTP store, password-reset audit flag | Without it the app falls back to per-instance in-memory state — fine for single-instance dev, broken on Vercel's multi-instance runtime. |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | ✅ Yes | `lib/email.ts` | The reset email + invite email both send through this. If unset, the app logs a dev trace and the user receives nothing. |
| `RESEND_API_KEY` | Optional alternative to SMTP | `lib/email.ts` | Used only when SMTP vars are absent. |

### Per-app launcher tile URLs (optional but recommended)

The `/api/apps/launcher` route prefers an env var per app slug before
falling back to the DB row. Set these if you want to override the DB:

| Variable | Target app |
|---|---|
| `ADMIN_URL` | admin portal |
| `QUIKSCALE_URL` | quikscale |
| `QUIKASSET_URL` | quikasset (`https://asset.quikit.ai`) |
| `QUIKVC_URL` | quikvc |
| `QUIKINFRA_URL` | quikinfra |
| (`QUIKIT_URL` itself) | launcher tile |

---

## 2. Auth Host (Vercel project: `auth`)

`apps/auth` — port 3000 in dev.

| Variable | Required in prod? | Used by | Notes |
|---|---|---|---|
| `NEXT_PUBLIC_AUTH_URL` | ✅ Yes | [`lib/email.ts`](../apps/auth/lib/email.ts), middleware | Public origin of this auth host, e.g. `https://auth.quikit.ai`. Used to build verification-email links. |
| `NEXT_PUBLIC_LAUNCHER_URL` | ✅ Yes | [`login/page.tsx`](../apps/auth/app/login/page.tsx), [`set-password/page.tsx`](../apps/auth/app/(auth)/set-password/page.tsx), [`invitations/accept/page.tsx`](../apps/auth/app/invitations/accept/page.tsx), [`forgot-password/route.ts`](../apps/auth/app/api/auth/forgot-password/route.ts) | Where to send the user after sign-in / accept. Must equal the launcher's public origin. |
| `NEXT_PUBLIC_ADMIN_URL` | ✅ Yes for super-admins | middleware | Where super-admins land after sign-in. |
| `AUTH_CORS_ORIGINS` | ✅ Yes | [`lib/cors.ts`](../apps/auth/lib/cors.ts) | **Comma-separated allow-list** of origins that may call `/api/auth/forgot-password` etc. cross-origin. Example: `https://app.quikit.ai,https://marketing.quikit.ai`. Without this, the dev fallback (`http://localhost:3000,http://localhost:3001`) is used, which means **prod browsers will be blocked**. |
| `NEXTAUTH_URL` | ✅ Yes | NextAuth | Same value as `NEXT_PUBLIC_AUTH_URL`. |
| `NEXTAUTH_SECRET` | ✅ Yes | NextAuth | Must match the launcher's secret so JWTs cross-validate. |
| `DATABASE_URL` | ✅ Yes | `@quikit/database` | Same DB as the launcher. |
| `REDIS_URL` | ✅ Yes | OTP store, rate limiter, reset audit flag | See notes on the launcher; same constraint. |
| `SMTP_*` / `RESEND_API_KEY` | ✅ Yes | `lib/email.ts` | Auth host emails (verification, OTP-style fallbacks). |

### OAuth providers

| Variable | Required if you use Google SSO |
|---|---|
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | ✅ |

| Variable | Required if you use Microsoft SSO |
|---|---|
| `AZURE_AD_CLIENT_ID`, `AZURE_AD_CLIENT_SECRET`, `AZURE_AD_TENANT_ID` | ✅ |

---

## 3. Admin Portal (Vercel project: `admin`)

`apps/admin` — port 3002 in dev.

| Variable | Required in prod? | Used by | Notes |
|---|---|---|---|
| `NEXT_PUBLIC_QUIKIT_URL` | ✅ Yes | [`lib/email.ts`](../apps/admin/lib/email.ts) | Launcher origin — invitation links from the admin portal point at `<launcher>/invitations/accept?token=…` so the launcher modal can open. |
| `QUIKIT_URL` | Alias | same | Set one of the two. |
| `NEXTAUTH_URL`, `NEXTAUTH_SECRET` | ✅ Yes | NextAuth | `NEXTAUTH_SECRET` must match every other app in the monorepo. |
| `DATABASE_URL` | ✅ Yes | `@quikit/database` | Shared DB. |
| `REDIS_URL` | ✅ Yes (recommended) | Cache / rate limiter | |
| `SMTP_*` / `RESEND_API_KEY` | ✅ Yes | `lib/email.ts` | Org-admin invitation emails. |

---

## 4. Per-app projects (quikscale, quiktrack, quikinfra, …)

Each app project needs at least:

| Variable | Notes |
|---|---|
| `NEXTAUTH_URL`, `NEXTAUTH_SECRET` | Same secret across all apps. |
| `DATABASE_URL` | Shared DB. |
| `NEXT_PUBLIC_QUIKIT_URL` / `NEXT_PUBLIC_LAUNCHER_URL` | Some apps deep-link back to the launcher (logout, app switcher). |
| `REDIS_URL` | Rate limiter. |

App-specific keys (per-app SSO callbacks, payment keys, etc.) live in
each app's own `CLAUDE.md` and `docs/13-app-ports-and-env.md`.

---

## 5. Sanity checks after deploy

1. **CORS allow-list** — `curl -i -X OPTIONS https://<auth-host>/api/auth/forgot-password -H "Origin: https://<launcher-host>" -H "Access-Control-Request-Method: POST"`. The response must include `Access-Control-Allow-Origin: https://<launcher-host>`.
2. **Forgot-password email link** — trigger a reset on prod and confirm the "Set Up My Account" URL in the email starts with the launcher's public origin (NOT a Vercel preview hostname, NOT localhost).
3. **Marketing "Log in" CTA** — view source on the marketing landing; the `data-quikit-login` anchor's `href` must be the auth host's `/login`, not `quik-it-auth.vercel.app/login`.
4. **Redis connectivity** — hit the launcher health endpoint or check Vercel logs for `[forgot-password] redis flag write failed` warnings.
5. **Temporary passwords** — first-time invites and self-service password resets each generate a unique 12-char temp password via `generateTempPassword()` from `@quikit/shared/temp-password`. The plaintext is emailed to the user (and returned in the invite-create API response for admin UIs to display once); the database only stores the bcrypt hash.

---

## 6. What changed on 2026-05-20

- **Default passwords removed**: the previous `DEFAULT_INVITE_PASSWORD` / `DEFAULT_RESET_PASSWORD` constants are gone. Every invite and reset now generates a unique friendly 12-char temp password via `@quikit/shared/temp-password`. The plaintext is emailed to the user and returned once in the invite-create API response so admin UIs can show it. Old historical values (`Quikit123`, `MoreYeahs@123`) are no longer used anywhere.
- **All previously-hardcoded prod URLs** (`https://quik-it-auth.vercel.app`, `https://quikit-marketing.vercel.app`) **were removed from runtime code** in `apps/auth`, `apps/quikit`, `apps/admin`. They are now driven entirely by the env vars listed above via `requireProdEnv`.
- **CORS** for `/api/auth/forgot-password` (and siblings) is driven by `AUTH_CORS_ORIGINS` only — the previous hardcoded Vercel hostnames in the allow-list are gone.
- **Forgot-password flow** is now same-origin to the launcher (no env var needed in the modal). The launcher hosts `POST /api/auth/forgot-password` which mints a single-use invitation token, sends the standard Native-Invite email with a freshly-generated temporary password, and lands the user on the same `/invitations/accept?token=…` screen used by first-time invites.
