# Implementation plan: fix MCP OAuth Dynamic Client Registration for Claude Desktop

## Problem

Connecting Claude Desktop to the QuikTrack MCP server (`https://uattrack.quikit.ai/api/mcp`) via OAuth fails during the very first step — Dynamic Client Registration (DCR, RFC 7591) against the QuikIT IdP (`https://uatapps.quikit.ai`). Claude Desktop surfaces a generic error:

> "Couldn't register with QuikTrack MCP's sign-in service. You can try again, or add an OAuth Client ID in the connector settings."

This blocks the intended zero-configuration OAuth connection path entirely. The PAT (Personal Access Token) connection method is unaffected and has been independently verified working.

## Root cause (confirmed, not hypothetical)

`POST /api/oauth/register` (`apps/quikit/app/api/oauth/register/route.ts`) unconditionally requires a `resource` field in the registration request body and rejects the request with `invalid_client_metadata: "resource is required and must be a valid URL"` if it's absent.

This is a non-standard requirement: RFC 7591 (Dynamic Client Registration) has no `resource` field. `resource` is an RFC 8707 concept, and it belongs on the **authorization** and **token** requests — not registration.

This was verified two ways:
1. Reproduced the exact failure by sending a registration request shaped like Claude Desktop's real one (its actual redirect URI, `https://claude.ai/api/mcp/auth_callback`, captured from a failed `/authorize` redirect) with no `resource` field — got the identical `invalid_client_metadata` error.
2. Confirmed Claude Desktop **does** send `resource` at the `/authorize` step (visible directly in its request URL: `...&resource=https%3A%2F%2Fuattrack.quikit.ai%2Fapi%2Fmcp`), consistent with RFC 8707's actual intended usage — just never at registration.

### Why this isn't a one-line fix

`authorize/route.ts` currently resolves which app to check the caller's `UserAppAccess` against purely from the registering client's stored `appId` — set at registration time from the (currently mandatory) `resource` field. It does not read any `resource` parameter itself today. Simply making `resource` optional at registration, without also changing `authorize.ts`, would let an unbound dynamic client through with **no app-access check at all** — a security regression, not just a compatibility fix.

Additionally, `OAuthClient.appId` (`packages/database/prisma/schema.prisma`) is a required, non-nullable field with a foreign key to `App`. Registering a client with no app binding requires a schema migration, not just an application-code change.

## Proposed fix

### Step 1 — Schema migration: make `OAuthClient.appId` nullable

`packages/database/prisma/schema.prisma`:
```prisma
model OAuthClient {
  id           String   @id @default(cuid())
  appId        String?          // was: String
  ...
  app          App?     @relation(fields: [appId], references: [id], onDelete: Cascade)  // was: App
}
```

New migration `packages/database/prisma/migrations/<timestamp>_oauth_client_nullable_app/migration.sql`:
```sql
ALTER TABLE "quikit"."OAuthClient" ALTER COLUMN "appId" DROP NOT NULL;
```

Per this repo's convention, this migration is hand-written and idempotent, and is **not applied automatically** — the build pipeline does not run `prisma migrate deploy`. It needs to be run by hand against the real UAT Postgres instance by whoever owns that access, before the code that depends on it goes live there.

### Step 2 — Add a shared app-resolution helper

`apps/quikit/lib/oauth.ts` — extract the existing resource→app matching logic (currently inlined in `register/route.ts`) into a shared, exported function:

```ts
export async function resolveAppByResource(
  resource: string,
): Promise<{ id: string; slug: string; baseUrl: string } | null> {
  // match resource's origin against every active app's effective origin
  // (resolveAppOrigin), same matching rule already used today
}
```

This will be called from both `register/route.ts` (when `resource` is given) and `authorize/route.ts` (as the new fallback), so the matching rule can't drift between the two call sites.

### Step 3 — Make `resource` optional at registration

`apps/quikit/app/api/oauth/register/route.ts`:
- If `resource` is present in the request body: keep today's behavior exactly — validate it, resolve the app via `resolveAppByResource`, 400 if it doesn't match any app, and bind `appId` to that app.
- If `resource` is absent (Claude Desktop's actual case): skip resolution entirely and create the client with `appId: null`.

### Step 4 — Resolve the app from `resource` at authorize time, as a fallback only

`apps/quikit/app/api/oauth/authorize/route.ts`:
- Select `appId` on the client lookup.
- If `client.appId` is set, resolve the app from it exactly as today (`db.app.findUnique`) — **unchanged behavior for every already-bound client**. A caller cannot pass a `resource` value to override or spoof the app an already-bound client is gated against.
- Only if `client.appId` is `null` (an unbound dynamic client), read the `resource` query parameter and resolve the app via `resolveAppByResource`. If present, the existing `UserAppAccess` gate applies to it exactly as it does for any other resolved app today. If `resource` is absent too, `app` stays `null` and the existing permissive behavior (no gate) applies — the same as today's behavior for any client with no associated app.

### Step 5 — Tests

- `apps/quikit/__tests__/api/oauthRegister.test.ts`: replace the existing "rejects a missing resource" case with a new case asserting a client registers successfully with `appId: null` when `resource` is omitted.
- `apps/quikit/__tests__/api/oauthAuthorizeAccess.test.ts`: update the existing mocks to reflect `client.appId`-based resolution (`db.app.findUnique` instead of `db.app.findFirst`), and add two new cases for the unbound-client path: (a) the access gate is correctly enforced when `resource` is supplied, (b) the old permissive behavior is preserved when it isn't.

### Step 6 — Verification

- `npx vitest run` on both affected test files.
- `npx tsc --noEmit` and `npx eslint` on all five changed files.
- Confirm `apps/quikit/app/api/oauth/token/route.ts` and the super-admin app-registry routes (`/api/super/apps/**`) don't assume a non-null `appId` anywhere — first-party clients (their only concern) are always app-bound, so they're expected to be unaffected.

### Step 7 — Rollout

1. Get integration-owner sign-off on the schema change (`OAuthClient.appId` → nullable) — this is shared IdP infrastructure used by every app on the platform, not QuikTrack-specific.
2. Apply the migration by hand against the UAT Postgres instance.
3. Deploy the updated `apps/quikit` code to `uatapps.quikit.ai`.
4. Re-test the Claude Desktop → QuikTrack MCP OAuth connection end-to-end, starting from a clean slate (no manually-registered workaround client), confirming auto-DCR now succeeds.
5. Once verified on UAT, carry the same migration + code change through the normal `dev → uat → main` release path for production.

## Risk / rollback

- The migration is additive and backward-compatible (loosening a constraint, not tightening one) — existing rows and existing first-party clients are unaffected.
- The `authorize.ts` change only adds a new resolution path for clients that currently have no working resolution path at all (`appId` lookup fails silently today for any client not tied to an app) — it cannot make an already-bound client less restricted.
- Rollback is a straight revert of the code changes; the nullable-column migration does not need to be reverted for that (a non-null-with-nulls-present state would only arise if new unbound clients were created in the interim, which would need cleanup before re-tightening the column).

## Open questions before implementing

- Confirm with the integration owner that widening `OAuthClient.appId` to nullable is acceptable, given it's shared, platform-wide auth infrastructure.
- Confirm whether any other consumer of `OAuthClient.appId` (outside `apps/quikit`) assumes non-null — a repo-wide search should be run once this is scheduled for implementation.
