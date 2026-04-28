# QuikVC ↔ QuikIT auth integration

QuikVC is an SSO client of the QuikIT platform IdP. This doc covers what's
required to wire it up end-to-end so login + org-select work the same way
they do in QuikScale.

## What's already in code

- `lib/auth.ts` switches between `createOAuthClientOptions` (SSO mode) and
  `createAuthOptions` (standalone credentials) based on env presence.
- `middleware.ts` uses the platform `createMiddleware`. SSO redirects all
  unauthenticated requests to `/login` which auto-triggers `signIn("quikit")`.
- `/login/page.tsx` triggers the SSO redirect on mount.
- `/select-org/page.tsx` handles multi-tenant users, with role-aware redirect
  to `/home` (VC roles) or `/dashboard` (founder / investor).
- `/api/org/memberships` + `/api/org/select` use the shared @quikit/auth
  factories with `appSlug: "quikvc"` filtering.
- `OrgSwitcher` dropdown in the VC layout for in-app tenant switching.

## What's required at the platform (one-time per environment)

### 1. Register QuikVC in the App registry

Either via the QuikIT super-admin UI (`/app-registry`) or directly:

```sql
-- Already created by seed-quikvc.ts; idempotent upsert.
INSERT INTO public."App" (id, slug, name, description, "baseUrl", status)
VALUES (
  'app_quikvc',
  'quikvc',
  'QuikVC',
  'AI-powered VC operating system',
  'https://app.quikvc.com',  -- per environment
  'active'
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  "baseUrl" = EXCLUDED."baseUrl";
```

`baseUrl` is what the QuikIT launcher's "Launch" button navigates to.

### 2. Provision an OAuth client

QuikIT acts as the IdP, QuikVC is a confidential OAuth client:

```sql
-- One row per environment (dev / uat / prod).
INSERT INTO public."OAuthClient" (id, "appId", "clientId", "clientSecret", "redirectUris")
VALUES (
  'oauth_quikvc_prod',
  'app_quikvc',
  'quikvc',
  '<bcrypt-hash-of-secret>',
  ARRAY['https://app.quikvc.com/api/auth/callback/quikit']
);
```

Then set in QuikVC's environment:

```bash
QUIKIT_URL=https://app.quikit.com
QUIKIT_CLIENT_ID=quikvc
QUIKIT_CLIENT_SECRET=<plaintext-secret>
NEXTAUTH_URL=https://app.quikvc.com
NEXTAUTH_SECRET=<random-32-chars>
```

When all three `QUIKIT_*` env vars are present, `lib/auth.ts` uses the OAuth
provider. When absent (local dev), it falls back to `createAuthOptions`
which is a credentials provider against the local DB — useful for bootstrap.

### 3. Grant users access to QuikVC

The `appSlug: "quikvc"` filter on the org-switcher requires `UserAppAccess`
rows. The seed handles this automatically for ValleyNXT users; for production,
either:

- Bulk-grant via the super-admin UI (`/organizations/[id]/users` → enable QuikVC)
- Or insert directly: one `UserAppAccess` per (userId, tenantId, appId) tuple

Without this row, even users with valid `Membership` rows will see "No QuikVC
access" on `/select-org`.

## Local development

Two paths:

### Path A: full SSO

Run QuikIT (port 3004) + QuikVC (port 3008):

```bash
# In one terminal
cd apps/quikit && npm run dev

# In another
cd apps/quikvc && npm run dev
```

Set in `apps/quikvc/.env.local`:

```bash
QUIKIT_URL=http://localhost:3004
QUIKIT_CLIENT_ID=quikvc-dev
QUIKIT_CLIENT_SECRET=<dev-secret>
NEXTAUTH_URL=http://localhost:3008
NEXTAUTH_SECRET=any-string-32-chars-long-suffices
```

### Path B: dev bypass

Skip SSO entirely, render against the seeded ValleyNXT tenant:

```bash
# .env.local
QUIKVC_DEV_BYPASS=1
QUIKVC_DEV_ROLE=fund-admin    # analyst | partner | fund-admin | ic-member | founder | investor
```

The middleware no-ops, `lib/dev-session.ts` synthesises a session with the
chosen role. Useful for testing admin paths without setting up SSO.

## Smoke checklist after deploy

1. `GET /api/org/memberships` returns the user's tenants where they have
   QuikVC access (not all their tenants).
2. `POST /api/org/select` rejects with 403 when `tenantId` is a tenant where
   the user has no QuikVC `UserAppAccess`.
3. Visiting `/admin` as analyst shows the "Restricted area" panel; as
   fund-admin renders the admin index.
4. Org-switcher dropdown shows the current tenant's `Tenant.name`, not
   the hardcoded "ValleyNXT Ventures".
5. Logging out from QuikIT global signs out QuikVC too (single-sign-out
   semantic via session JWT expiry).
