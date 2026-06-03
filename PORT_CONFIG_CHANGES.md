# Port Configuration Changes — Local Dev Routing Fix

Date: 2026-05-29
Scope: Local development environment only. **Production unchanged.**

This document records two related rounds of changes made to fix the local
dev login flow (clicking "Login" on a sub-app's landing page should bounce
through the central auth host and land back on that sub-app's dashboard
— same as production).

---

## Background — the bug

Locally, clicking **Login** on `http://localhost:3003` (QuikScale marketing)
sent the user to `localhost:3000/login`, but after authenticating they landed
on `localhost:3001/apps` (the launcher) instead of `localhost:3003/dashboard`.

In production the same flow correctly returned the user to
`https://quikscale.vercel.app/dashboard`.

**Root cause:**
[`apps/auth/app/api/post-login/route.ts`](apps/auth/app/api/post-login/route.ts)
contains an allow-list (`DEFAULT_ALLOWED_ORIGINS`) of permitted
cross-origin callback URLs. The list only contains **production HTTPS
origins** (`https://quikscale.vercel.app`, `https://scale.quikit.ai`, …).
Localhost origins are not in it, so any `callbackUrl` pointing at
`http://localhost:3003` fell through to `launcherFallback()` =
`${QUIKIT_URL}/apps`.

The route exposes an env-var extension hook:
```ts
function allowedOrigins(): Set<string> {
  const extra = (process.env.AUTH_ALLOWED_RETURN_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim().replace(/\/$/, ""))
    .filter(Boolean);
  return new Set([...DEFAULT_ALLOWED_ORIGINS, ...extra]);
}
```

`AUTH_ALLOWED_RETURN_ORIGINS` was not set in `apps/auth/.env.local`, so the
allow-list ran with prod URLs only and rejected localhost callbacks.

---

## Round 1 — `AUTH_ALLOWED_RETURN_ORIGINS` env var added

**Goal:** make the post-login bridge honour `http://localhost:*` callback URLs
in local dev so the flow matches production behaviour.

### Files changed (1)

#### `apps/auth/.env.local`
Added at the end:
```env
# Local dev: extend the post-login allow-list so cross-origin callbackUrls
# pointing at localhost sub-apps (quikscale:3003, quiktrack:3004, etc.) are
# honoured by /api/post-login. Without this the bridge falls back to the
# launcher's /apps page (the prod allow-list is HTTPS-only).
# Auth itself is :3001 (same-origin, no bridge needed); launcher is :3000.
AUTH_ALLOWED_RETURN_ORIGINS=http://localhost:3000,http://localhost:3002,http://localhost:3003,http://localhost:3004,http://localhost:3005,http://localhost:3006,http://localhost:3007
```

> Note: this list was later updated to reflect the Round 2 port swap.
> Auth itself (`:3001`) is excluded because same-origin callbacks skip the
> bridge entirely.

---

## Round 2 — Port swap: auth ↔ quikit (launcher)

**Goal:** align local dev ports with the desired layout where the launcher
runs on `:3000` (the "front door") and the central auth host runs on `:3001`.

### Target port mapping

| App | `npm run dev` port | URL |
|---|---|---|
| **quikit (launcher)** | **3000** | `http://localhost:3000` |
| **auth** | **3001** | `http://localhost:3001` |
| admin | 3002 | `http://localhost:3002` |
| quikscale | 3003 | `http://localhost:3003` |
| quiktrack | 3004 | `http://localhost:3004` |
| quikvc | 3005 | `http://localhost:3005` |
| quikinfra | 3006 | `http://localhost:3006` |
| quiksocial | 3007 | `http://localhost:3007` |

Before the swap, auth was on `:3000` and quikit was on `:3001`.

### Files changed (10)

#### Package.json dev scripts (2)
| File | Before | After |
|---|---|---|
| `apps/auth/package.json` | `"dev": "next dev -p 3000"` | `"dev": "next dev -p 3001"` |
| `apps/quikit/package.json` | `"dev": "next dev -p 3001"` | `"dev": "next dev -p 3000"` |

`start` ports were left untouched — they're for `next start` (production builds)
which is rarely used locally.

#### `apps/auth/.env.local`
| Var | Before | After |
|---|---|---|
| `NEXTAUTH_URL` | `http://localhost:3000` | `http://localhost:3001` |
| `QUIKIT_URL` | `http://localhost:3001` | `http://localhost:3000` |
| `NEXT_PUBLIC_AUTH_URL` | `http://localhost:3000` | `http://localhost:3001` |
| `NEXT_PUBLIC_LAUNCHER_URL` | `http://localhost:3001/apps` | `http://localhost:3000` |
| `AUTH_ALLOWED_RETURN_ORIGINS` | (Round 1 list) | dropped `:3001`, added `:3000` |

> `NEXT_PUBLIC_LAUNCHER_URL` originally pointed at `…/apps`. It was changed
> to the bare origin (`http://localhost:3000`) so consumers that append
> their own path don't double up to `…/apps/apps`. Any consumer that
> expects the trailing `/apps` should append it itself.

#### `apps/quikit/.env.local`
| Var | Before | After |
|---|---|---|
| `NEXTAUTH_URL` | `http://localhost:3001` | `http://localhost:3000` |
| `NEXT_PUBLIC_AUTH_URL` | `http://localhost:3000` | `http://localhost:3001` |
| `QUIKIT_URL` | `http://localhost:3001` | `http://localhost:3000` |

Also updated OAuth-redirect-URI comments inside the same file to reference
the new auth host port (`:3001` → instructions for Google/Microsoft consent
screens).

#### `apps/admin/.env.local`
| Var | Before | After |
|---|---|---|
| `QUIKIT_URL` | `http://localhost:3001` | `http://localhost:3000` |
| `NEXT_PUBLIC_QUIKIT_URL` | `http://localhost:3001` | `http://localhost:3000` |
| `NEXT_PUBLIC_AUTH_URL` | `http://localhost:3000` | `http://localhost:3001` |

#### `apps/quikscale/.env.local`
| Var | Before | After |
|---|---|---|
| `NEXT_PUBLIC_SUPER_ADMIN_URL` | `http://localhost:3001` | `http://localhost:3000` |
| `QUIKIT_URL` | `http://localhost:3001` | `http://localhost:3000` |
| `NEXT_PUBLIC_QUIKIT_URL` | `http://localhost:3001` | `http://localhost:3000` |
| `NEXT_PUBLIC_AUTH_URL` | `http://localhost:3000` | `http://localhost:3001` |

`apps/quikscale/.env` (separate from `.env.local`) contains only quikscale's
own port (`:3003`) and `APP_URL=http://localhost:3003`. Not affected.

#### `apps/quiktrack/.env.local`
Same four variables as quikscale, identical before/after values.

#### `apps/quikinfra/.env.local`
Same four variables as quikscale, identical before/after values.

#### `apps/quiksocial/.env.local`
| Var | Before | After |
|---|---|---|
| `NEXT_PUBLIC_AUTH_URL` | `http://localhost:3000` | `http://localhost:3001` |
| `QUIKIT_URL` | `http://localhost:3001` | `http://localhost:3000` |
| `NEXT_PUBLIC_QUIKIT_URL` | `http://localhost:3001` | `http://localhost:3000` |

---

## What was NOT changed (and why)

### Code-level hardcoded fallbacks
Several files in `apps/**` and `packages/**` contain dev fallbacks like:
```ts
requireProdEnv("NEXT_PUBLIC_AUTH_URL", "http://localhost:3000")
```
These only activate when the env var is missing. Because every
`.env.local` listed above sets the relevant var explicitly, these
fallbacks never fire in practice.

Leaving them untouched means **revoke is a pure env-file revert** — no
code needs to be rolled back. If the fallbacks need to match the new
layout for cold-start safety, that's a separate follow-up.

Known fallbacks worth noting (for future cleanup):
| File | Line | Fallback |
|---|---|---|
| `packages/shared/lib/login-url.ts` | 28 | `DEFAULT_AUTH_URL_DEV = "http://localhost:3001"` (now matches new auth port — accidentally correct) |
| `apps/auth/app/login/page.tsx` | 51 | `NEXT_PUBLIC_LAUNCHER_URL` fallback `"http://localhost:3001"` (stale — was launcher's old port) |
| `apps/auth/app/(auth)/forgot-password/page.tsx` | 28 | `"http://localhost:3001"` (stale) |
| `apps/auth/app/(auth)/set-password/page.tsx` | 30 | `"http://localhost:3001"` (stale) |
| `apps/auth/app/api/auth/forgot-password/route.ts` | 59 | `"http://localhost:3001"` (stale) |
| `apps/auth/app/invitations/accept/page.tsx` | 34 | `"http://localhost:3001"` (stale) |
| `apps/auth/lib/email.ts` | 76 | `NEXT_PUBLIC_AUTH_URL` fallback `"http://localhost:3000"` (stale) |
| `apps/admin/lib/email.ts` | 122 | `NEXT_PUBLIC_QUIKIT_URL` fallback `"http://localhost:3001"` (stale) |
| `apps/quikit/lib/email.ts` | 179 | `"http://localhost:3001"` for NEXTAUTH_URL (stale — quikit is now :3000) |
| `apps/quikit/app/api/apps/launcher/route.ts` | 163-171 | `devLocalhostFallbacks` map — was already in the new layout before this swap |

### `apps/quikvc/.env.local`
File doesn't exist (only `.env.example`). No change made.

### Production URLs / Vercel deployments
`DEFAULT_ALLOWED_ORIGINS` in `apps/auth/app/api/post-login/route.ts`
already contains every prod origin. The only prod-relevant change is
the `AUTH_ALLOWED_RETURN_ORIGINS` env var, which is set only in
`apps/auth/.env.local` (local-only file, never committed).

---

## External dependencies to update (action required)

### OAuth provider redirect URIs

Google and Microsoft developer consoles register exact redirect URIs.
The auth host moved from `:3000` to `:3001`, so the OAuth apps need
new entries:

**Google Cloud Console** — OAuth 2.0 Client → Authorized redirect URIs:
- Add: `http://localhost:3001/api/auth/callback/google`
- (Keep the existing `:3000` entry if you want to be able to revoke
  cleanly; remove later once the swap is permanent.)

**Microsoft Entra (Azure AD)** — App registration → Authentication →
Redirect URIs:
- Add: `http://localhost:3001/api/auth/callback/azure-ad`
- (Same — keep `:3000` for revoke safety.)

Without these, "Continue with Google" / "Continue with Microsoft" buttons
will hit `redirect_uri_mismatch` and the OAuth flow will not complete.
Native email + password login is not affected.

---

## How to test

1. Stop all dev servers (`Ctrl+C` in every terminal).
2. Restart with new ports:
   ```powershell
   # Terminal 1 — auth, now on 3001
   cd QuikIT_New/apps/auth ; npm run dev

   # Terminal 2 — launcher (quikit), now on 3000
   cd QuikIT_New/apps/quikit ; npm run dev

   # Terminal 3 — quikscale (unchanged port 3003)
   cd QuikIT_New/apps/quikscale ; npm run dev
   ```
3. Browser test:
   - Open `http://localhost:3003` (QuikScale landing).
   - Click **Login**.
   - Verify URL shows `http://localhost:3001/login?callbackUrl=…` (auth on :3001).
   - Sign in.
   - **Expected**: land on `http://localhost:3003/dashboard` directly —
     not on `localhost:3000/apps` (launcher) and not on `localhost:3001/apps`.

If you land on `/apps` instead of `/dashboard`, the post-login bridge
rejected the callback origin. Re-check
`apps/auth/.env.local`'s `AUTH_ALLOWED_RETURN_ORIGINS` includes
`http://localhost:3003`.

---

## How to revoke

Because no application code was modified, revoke is a pure env-file +
package.json revert.

### Step 1 — swap dev-script ports back
- `apps/auth/package.json` → `"dev": "next dev -p 3000"`
- `apps/quikit/package.json` → `"dev": "next dev -p 3001"`

### Step 2 — swap `:3000` and `:3001` back in every `.env.local`
For each file in the table below, swap every `localhost:3000` ↔ `localhost:3001`.
**Other ports (3002–3007) are unchanged and need no edits.**

- `apps/auth/.env.local`
- `apps/quikit/.env.local`
- `apps/admin/.env.local`
- `apps/quikscale/.env.local`
- `apps/quiktrack/.env.local`
- `apps/quikinfra/.env.local`
- `apps/quiksocial/.env.local`

### Step 3 — restore `NEXT_PUBLIC_LAUNCHER_URL` path suffix (if relied upon)
The Round 2 edit dropped the `/apps` suffix. If any consumer expects
the env value to already include `/apps`, restore it:
```env
NEXT_PUBLIC_LAUNCHER_URL="http://localhost:3001/apps"
```

### Step 4 — `AUTH_ALLOWED_RETURN_ORIGINS`
Optional. The Round 1 env var can stay (it's harmless on prod where it's
unset, and on local it just extends the allow-list). To fully revert
Round 1 as well, delete the `AUTH_ALLOWED_RETURN_ORIGINS=…` line from
`apps/auth/.env.local`.

### Step 5 — restart all dev servers

No code changes to revert. Vercel production is untouched.

---

## File index — every file modified

```
apps/auth/.env.local                   # Round 1 + Round 2
apps/auth/package.json                 # Round 2 (dev port)
apps/quikit/.env.local                 # Round 2
apps/quikit/package.json               # Round 2 (dev port)
apps/admin/.env.local                  # Round 2
apps/quikscale/.env.local              # Round 2
apps/quiktrack/.env.local              # Round 2
apps/quikinfra/.env.local              # Round 2
apps/quiksocial/.env.local             # Round 2
QuikIT_New/PORT_CONFIG_CHANGES.md      # this file
```
