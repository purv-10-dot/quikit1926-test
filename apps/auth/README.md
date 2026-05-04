# @quikit/auth-service — auth.quikit.ai

Common authentication service for the QuikIT platform. Implements §3 and §16.1
of [`QuikIT-Database-Architecture-v4-EN.md`](../../c:/Users/user/Downloads/QuikIT-Database-Architecture-v4-EN.md).

Every other app in the monorepo (`admin`, `quikit` launcher, `quikscale`, and
future `quickcrm`, `quickpms`, etc.) **redirects unauthenticated users here**
instead of hosting its own login form. After sign-in, a shared NextAuth JWT is
set in a cookie; because every app is configured with the same
`NEXTAUTH_SECRET`, each one trusts the same token.

## Runs on

| env                       | default                 |
|---------------------------|-------------------------|
| `NEXTAUTH_URL`            | `http://localhost:3004` |
| `NEXT_PUBLIC_AUTH_URL`    | `http://localhost:3004` |
| `NEXT_PUBLIC_LAUNCHER_URL`| `http://localhost:3000` |
| `NEXT_PUBLIC_ADMIN_URL`   | `http://localhost:3005` |

## Pages

| Route                    | Purpose                                          |
|--------------------------|--------------------------------------------------|
| `/login`                 | Credentials sign-in                              |
| `/signup`                | Self-serve or invite-based account creation      |
| `/forgot-password`       | Request reset email                              |
| `/reset-password?token=` | Consume reset token, set new password            |
| `/verify-email?token=`   | Consume email-verify token                       |
| `/select-org`            | Multi-org user picker; auto-redirects for 1-org  |

## API

All routes share the `auth` Prisma schema. Routes tagged *(internal)* require
an `x-internal-secret` header matching `INTERNAL_SECRET`.

| Route                              | Method | Purpose                                           |
|------------------------------------|--------|---------------------------------------------------|
| `/api/auth/[...nextauth]`          | GET/POST | NextAuth credentials + session endpoints        |
| `/api/auth/signup`                 | POST   | Create a new user (optionally consuming an invite)|
| `/api/auth/forgot-password`        | POST   | Send password-reset email (silent-success)        |
| `/api/auth/reset-password`         | POST   | Consume reset token, update password              |
| `/api/auth/verify-email`           | POST   | Consume email-verify token                        |
| `/api/auth/select-org`             | POST   | Confirm user is a member, return role             |
| `/api/auth/me`                     | GET    | Current session user as JSON                      |
| `/api/org/memberships`             | GET    | List all orgs the current user belongs to         |
| `/api/verify-token` *(internal)*   | GET    | Server-to-server JWT validation                   |

## Integration from other apps

Any app that wants to defer auth to this service should set
`NEXT_PUBLIC_AUTH_URL` and use the shared middleware:

```ts
import { createMiddleware } from "@quikit/auth/middleware";

export const middleware = createMiddleware({
  loginRoute: "/login",
  publicRoutes: ["/login"],
  centralLoginUrl: `${process.env.NEXT_PUBLIC_AUTH_URL}/login`,
  centralSelectOrgUrl: `${process.env.NEXT_PUBLIC_AUTH_URL}/select-org`,
});
```

For runtime server-to-server token checks:

```ts
import { verifyTokenRemote } from "@quikit/auth/verify-token-remote";

const { valid, userId, activeOrgId } = await verifyTokenRemote({
  cookie: req.headers.get("cookie") ?? undefined,
});
```

## Local development

```bash
# Install (root)
npm install

# Run alongside the other apps (separate terminals)
npm run dev:auth          # this app → :3004
npm run dev:quikit        # launcher → :3000
npm run dev:admin         # super-admin → :3005
npm run dev:quikscale     # business app → :3002
```

> Note: central auth stays on **:3004**; QuikScale runs on **:3002** so they do not share a port.

## Schema coverage (v4)

The service reads/writes the following `auth.*` and `quikit.*` tables from the
shared Prisma schema:

- `auth.User` — credentials and flags (`isSuperAdmin`, `emailVerified`)
- `auth.VerificationToken` — email-verify, password-reset, org-invite tokens
  (token is hashed with SHA-256; plaintext never stored)
- `auth.OAuthAccount` — Google/Microsoft SSO linkages (future)
- `auth.Session` — active sessions (NextAuth DB sessions; JWT is primary)
- `quikit.OrgMember` — read-only, to list the user's orgs on `/select-org`
- `quikit.Org` — read-only, for org display names in the picker
