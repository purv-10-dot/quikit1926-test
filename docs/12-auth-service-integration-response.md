# Reply to Suyash — Auth Service Integration

**From:** Pravin (Auth / Platform)
**To:** Suyash (AI Runtime)
**Date:** 2026-05-05
**Status:** P0 + P1-A items addressed in branch `feature_auth_merge`. P1-B-1 needs your sign-off on the option below before we build it.
**Source request:** `request-to-pravin (1).md`

---

## TL;DR

Most of your "compatibility findings" are stale — the auth service already uses the claim names and the `org_admin` role value you wanted. Concretely:

- **Canonical JWT claim names**: `id`, `orgId`, `membershipRole` (NextAuth also auto-fills `sub` = `id`). — **See the 2026-08-19 amendment at the end of this doc: the auto-fill claim is true for sign-in-flow sessions but was NOT true for `issue-agent-jwt`, and that gap caused a real outage.**
- **Canonical org admin role value**: `org_admin` (not `admin`). `"admin"` is a legacy fallback in `ADMIN_TIER_ROLES` for rows seeded before 2026-05-04 — do not write new code that emits it.
- I am **not renaming anything**. Update your spec to match the names listed above.

P1-A code lands in this branch:

- New endpoint `POST /api/auth/internal/issue-agent-jwt` at `apps/auth/app/api/auth/internal/issue-agent-jwt/route.ts`.
- New Prisma model `AgentJwtIssuance` in the `auth` schema (migration `20260505_add_agent_jwt_issuance` — review before applying).
- `AuthContext` extended with `actingAs` and `actingAgentId` (additive, default `'user'`/`null`, every existing app route is backward compatible).
- `INTERNAL_SERVICE_ALLOWLIST` exported from `@quikit/shared` so we can grow it without touching the endpoint.

P1-B-1 (granular permissions) needs your decision before I build — see §6.

---

## 1. P0-1 — `verify-token` exact contract

The endpoint already exists at `apps/auth/app/api/verify-token/route.ts`. Contract:

| Field | Value |
|---|---|
| Method | **GET** (not POST) |
| URL | `https://auth.quikit.ai/api/verify-token` |
| Auth header | `x-internal-secret: <INTERNAL_SECRET>` (required) |
| Token source | `Authorization: Bearer <jwt>` **OR** `Cookie: next-auth.session-token=<jwt>` (`__Secure-next-auth.session-token` in production) |
| Body | none (GET) |
| Caching | none server-side. Rate limiting is also intentionally absent (internal secret already gates it). Set your Redis cache to whatever TTL ≤ 5 minutes works for you — the JWT itself is re-validated against the live DB every 5 minutes inside `verifyJWT`, so a 4-minute Redis TTL on your side is reasonable. |

**Success response (200):**

```json
{
  "valid": true,
  "userId": "usr_abc...",
  "email": "user@example.com",
  "activeOrgId": "org_xyz...",   // null if no org selected
  "orgRole": "org_admin",         // | "member" | "super_admin" | null
  "isSuperAdmin": false
}
```

**Failure responses:**

| Case | Status | Body |
|---|---|---|
| Wrong/missing `x-internal-secret` | 403 | `{ "valid": false, "error": "Forbidden" }` |
| Token absent, expired, signature-bad, session revoked, or membership invalidated | 200 | `{ "valid": false }` |

Yes, the failed-token shape is intentionally minimal — it's the same envelope for any token rejection so you don't get a useful oracle for distinguishing expired vs. forged. If you need richer diagnostics in dev, look at `apps/auth` server logs.

**curl example:**

```bash
curl https://auth.quikit.ai/api/verify-token \
  -H "x-internal-secret: $INTERNAL_SECRET" \
  -H "Authorization: Bearer $USER_JWT"
```

If you want a POST variant (token in body) for size reasons, file an issue and I'll add it; the current shape is fine for typical session JWTs (~800 bytes).

---

## 2. P0-2 — Claim name reconciliation

Update your spec; we are not changing the auth service. Decisions:

| Your spec | Canonical (current code) | Notes |
|---|---|---|
| `sub` | **`id`** | NextAuth auto-fills `sub` to the same value, but the field your code should read is `id`. Don't add another. ⚠️ **Amended 2026-08-19** — the auto-fill does not happen on `issue-agent-jwt`; that route now sets `sub` explicitly. Both are present and identical. See the amendment section. |
| `activeOrgId` | **`orgId`** | Lives on JWT and `AuthContext`. The `verify-token` response already exposes it as `activeOrgId` for backward-compat with your spec — but inside JWTs it's just `orgId`. |
| `orgRole` | **`membershipRole`** | The JWT field is `membershipRole`. `withAuth` then re-exposes it as `ctx.orgRole` (kept for backward-compat with app code that already reads it). |
| `org_admin` | **`org_admin`** | Already canonical. See §7 P1-B-2. |

Where these are defined:

- JWT shape: [packages/auth/types.ts:30-46](packages/auth/types.ts#L30-L46)
- `AuthContext`: [packages/auth/with-auth.ts:4-12](packages/auth/with-auth.ts#L4-L12)
- Role constants: [packages/shared/lib/constants.ts:52-75](packages/shared/lib/constants.ts#L52-L75)

---

## 3. P1-A-1 — `issue-agent-jwt` endpoint

Built at [apps/auth/app/api/auth/internal/issue-agent-jwt/route.ts](apps/auth/app/api/auth/internal/issue-agent-jwt/route.ts).

**Request:**

```
POST https://auth.quikit.ai/api/auth/internal/issue-agent-jwt
Headers:
  content-type: application/json
  x-internal-secret: <INTERNAL_SECRET>
  x-trace-id: <trace_id>            # optional; passed through to audit row
Body:
{
  "userId": "usr_xxx",
  "orgId": "org_xxx",
  "ttlSeconds": 300,
  "requestingService": "ai-runtime",
  "reason": "scheduled_briefing:agent_001",
  "actingAs": "ai_agent",
  "actingAgentId": "agent_001"      // optional; required only when actingAs="ai_agent"
}
```

**Success (200):**

```json
{
  "token": "<jwt-signed-with-NEXTAUTH_SECRET>",
  "expiresAt": "2026-05-05T12:34:56.000Z"
}
```

**Failure shape (uniform):**

```json
{ "error": { "code": "<enum>", "message": "<human>", "traceId": "<trace_id|null>" } }
```

| Status | `code` | When |
|---|---|---|
| 401 | `UNAUTHORIZED` | `x-internal-secret` missing/wrong |
| 403 | `FORBIDDEN` | `requestingService` not on allowlist |
| 404 | `NOT_FOUND` | `(userId, orgId)` is not an active membership |
| 422 | `VALIDATION_ERROR` | Body fails Zod validation |
| 500 | `INTERNAL_ERROR` | Anything else |

**Decisions on your open questions:**

- **Q-1 `ttlSeconds` min/max/default**: min `60`, max `900` (15 min), default `300`. Anything outside [60, 900] returns 422. Why: 60s is enough for one hop; 15 min is the hard upper bound — anything longer should re-mint, not reuse. Default matches your spec.
- **Q-2 `actingAs` enum**: closed enum — `"user" | "ai_agent" | "platform_service" | "scheduled_job"`. Anything else → 422. Defaults to `"user"` if omitted.
- **Claim names in the minted JWT**: camelCase, matching the rest of our JWT shape — `actingAs`, `actingAgentId`. (No snake_case anywhere in our JWTs.)
- **Issuer**: ~~I am **not** setting a custom `iss`. NextAuth's `encode()` doesn't expose `iss` cleanly, and adding it would require swapping to a hand-rolled JWT — risky for marginal value.~~ ⚠️ **Reversed 2026-08-19.** The stated reason was wrong: `encode()` passes its `token` object straight into `jose`'s `EncryptJWT`, so any key in that object becomes a claim — `iss` is one line alongside `actingAs`, no hand-rolled JWT involved. `iss: "auth-service-internal"` is now emitted (constant `AGENT_JWT_ISSUER` in `@quikit/shared`). It is **emitted only, not enforced** — see the amendment section for why enforcement must not go into the shared session path.
- **TTL semantics**: `expiresAt = iat + ttlSeconds`. The cookie/Bearer is rejected by `verifyJWT` once expired (NextAuth handles it).

**Minted JWT shape** (callers can use it transparently with any `withAuth`):

```json
{
  "id": "usr_xxx",
  "sub": "usr_xxx",
  "iss": "auth-service-internal",
  "email": "user@example.com",
  "orgId": "org_xxx",
  "membershipRole": "org_admin",
  "isSuperAdmin": false,
  "actingAs": "ai_agent",
  "actingAgentId": "agent_001",
  "iat": 1730800000,
  "exp": 1730800300,
  "jti": "..."
}
```

`sub` and `id` deliberately carry the **same** value. Read either; they will never disagree. `actingAgentId` is present only when the caller supplied one — required for `actingAs: "ai_agent"`, optional for `platform_service` / `scheduled_job`.

Note: agent JWTs deliberately **do not** carry a `sessionId`. They are short-lived and not session-bound (you re-mint on demand) — wiring them through Redis session-store would be the wrong abstraction.

---

## 4. P1-A-2 — `requestingService` allowlist

Confirmed list of 4 services for v1:

```
ai-runtime
search
comms
launcher
```

Defined in [packages/shared/lib/internal-services.ts](packages/shared/lib/internal-services.ts). To add a service, send a PR to that file — no auth-service deploy required.

---

## 5. P1-A-3 — `ctx.actingAs` and `ctx.actingAgentId` in `withAuth`

Added (additive, backward compatible):

```typescript
export interface AuthContext {
  userId: string;
  orgId: string;
  orgRole: string;
  permissions: string[];
  isSuperAdmin: boolean;
  email: string | null;
  actingAs: 'user' | 'ai_agent' | 'platform_service' | 'scheduled_job';  // default 'user'
  actingAgentId: string | null;                                            // default null
}
```

Existing app routes that don't touch these fields keep working unchanged. Audit log code in your AI runtime can now do `actorType = ctx.actingAs` and the human-vs-agent distinction will be preserved.

---

## 6. P1-A-4 — `auth.AgentJwtIssuance` audit table

Single table, single row per attempt (success **and** failure), `status` + `errorCode` distinguish. Migration in `packages/database/prisma/migrations/20260505_add_agent_jwt_issuance/`. Model:

```prisma
model AgentJwtIssuance {
  id                String   @id @default(cuid())
  requestingService String
  userId            String
  orgId             String
  agentId           String?
  reason            String
  ttlSeconds        Int
  actingAs          String
  traceId           String?
  status            String   // "success" | "unauthorized" | "forbidden" | "not_found" | "validation_error" | "internal_error"
  errorCode         String?
  issuedAt          DateTime @default(now())

  @@index([userId, issuedAt])
  @@index([requestingService, issuedAt])
  @@schema("auth")
}
```

The endpoint always writes a row in a `try { ... } finally` block — including on early failures (bad secret, bad service). The only path that skips the audit is a 500 inside the `prisma.create` call itself (which we cannot self-audit; check server logs).

---

## 7. P1-B — Permissions and role value

### P1-B-1 — Granular permissions: my recommendation

This is the only item I am **not** building unilaterally. It needs a product call. My recommendation:

**Ship Option B in v1, plan Option A for v2.**

- **Option B (use `OrgMember.customPermissions`)** is already wired in the schema. We can populate it from the org admin UI in days, surface it on the JWT in one auth-service deploy, and your tool execution checks start working with real data. Cost: granularity is one flat list per (user, org), no per-app scoping.
- **Option A (`UserAppPermission` table)** is the proper long-term shape — per-app permission strings, RBAC granularity per app. But it touches the `quikit` schema, requires admin UI changes, and we have not yet sized it.
- **Option C (live endpoint)** is operationally expensive — a network call per token verification — and gives us nothing structural that A doesn't already give us with one fewer hop.

**What I need from you (Suyash):**
- "Yes, ship B now and we'll plan A for v2" → I will add `permissions: token.permissions` to the JWT callback and the AuthContext mapping in this branch (small change, ~15 lines).
- "We need A" → file a v2 design doc; we'll size it.

**Your interim workaround** (synthesize a permission list from `membershipRole`) is fine for dev/demo. Just don't ship it to a customer.

### P1-B-2 — Canonical role value: `org_admin`

Already canonical in code. `"admin"` survives only as a backward-compat fallback in `ADMIN_TIER_ROLES` ([packages/shared/lib/constants.ts:71-75](packages/shared/lib/constants.ts#L71-L75)) for rows seeded pre-2026-05-04. **All new code must emit `org_admin`.** Your check `{"org_admin", "admin"}` is correct as a defensive read but should narrow to `org_admin` once we've confirmed no live rows still use `admin` (we will do this in a separate cleanup).

---

## 8. P2 — Acknowledged, on backlog

| Item | Owner | Status |
|---|---|---|
| Dual-secret rotation (`INTERNAL_SECRET_PRIMARY` / `_SECONDARY`) | Auth | Backlogged. Will add when the first secret is rotated. |
| Audit forwarding to `audit.quikit.ai` from issuance | Auth | Backlogged. The local `AgentJwtIssuance` table covers Phase 1. |
| Rate limiting on `issue-agent-jwt` (per-tuple, per-service) | Auth | Backlogged. Will add when we observe sustained traffic — current internal-secret gate + allowlist is sufficient until then. |

---

## 9. `App.baseUrl` confirmation

Confirmed: the column is `baseUrl` ([packages/database/prisma/schema.prisma:35-61](packages/database/prisma/schema.prisma#L35-L61)). Use `App.baseUrl` for service-to-service calls. There is no `backendUrl` and there will not be one — apps are deployed monolithically (frontend + API at the same origin), so a separate backend URL would only invite drift.

---

## What's left for you

1. Confirm Option B for permissions (§6) so I can wire the JWT.
2. Update the AI Runtime spec to use `id` / `orgId` / `membershipRole` / `org_admin`.
3. Pull this branch (`feature_auth_merge`) and integrate against the new endpoint. The endpoint is fully functional once the migration is applied:
   ```
   npx prisma migrate dev --name add_agent_jwt_issuance
   ```

Slack me when you've decided on B vs A and I'll ship the JWT permissions update same day.

— Pravin

---

# Amendment — 2026-08-19

Three claims in the original reply were wrong or incomplete. They are corrected inline above and explained here. This section is additive; the original text is struck through rather than deleted, because it was delivered to another team and they built against it.

## 1. `sub` was missing from agent JWTs entirely

**What I said** (§2, TL;DR): "NextAuth auto-fills `sub` to the same value... Don't add another."

**What was true:** NextAuth stamps `sub` in its *sign-in flow* (`core/routes/callback.js`), before the `jwt` callback. `issue-agent-jwt` does not go through that flow — it hand-builds a payload and passes it straight to `encode()`, which adds only `iat`, `exp`, `jti`. **No `sub` was ever set on an agent JWT.**

QuikTrack's verifier requires `sub`. The result was a 100% failure rate on genuinely-minted tokens, presenting as a bare `null` → 401 that was indistinguishable from a forged token. It cost another team most of a day to isolate.

**Fixed:** the route now sets `sub: user.id` alongside `id`. This is conformance to the convention this document already declared, not a new one — next-auth stamps `sub` natively, and all 17 `auth-handoff` routes already stamp `sub` and `id` side by side.

## 2. The reason given for declining `iss` was factually wrong

I wrote that `encode()` "doesn't expose `iss` cleanly" and that adding it "would require swapping to a hand-rolled JWT." Neither is true — `encode({ token })` passes `token` into `new EncryptJWT(token)`, so any key becomes a claim.

That sentence is why the platform had no issuer claim for three months. `iss` is now emitted.

**Emitted, not enforced — and the sequencing is not optional.** Agent JWTs are minted with the *same* `NEXTAUTH_SECRET`-derived key as ordinary session cookies, so the two are separated by claim shape, not cryptography. `iss` exists to make that boundary explicit. But `verifyJWT`/`getToken` serves session cookies **and** Bearer agent JWTs through one code path, and no session cookie carries `iss` — so requiring `iss` inside the shared `withAuth` would reject every logged-in user across all 17 apps. Enforce only in the agent-JWT branch, and only after emit is visible in logs: **emit → verify-and-log → enforce.**

## 3. `actingAgentId` — the contract stands, the verifier was wrong

§3 documents `actingAgentId` as required only when `actingAs: "ai_agent"`. The minter honours that. QuikTrack's verifier required it for *every* non-`user` value, so `platform_service` and `scheduled_job` tokens minted successfully and were then rejected.

**Resolved on the verifier side**, deliberately: tightening the minter instead would have contradicted this document and QuikScale's RBAC doc, and would have pre-committed QuikFlow's scheduled-job design to supplying an agent identity it has no natural source for.

## Still open — a trap worth knowing about

`actingAs` **defaults to `"user"`** when the caller omits it (§3, Q-2). Every agent-JWT verifier rejects `actingAs: "user"`. So omitting `actingAs` yields a token that mints with a 200 and can never authenticate — a third route to a silent 401. **Always send `actingAs` explicitly.** The default is retained for backward compatibility; a future major revision should make the field required.

## Contract test

The mismatch survived because both sides tested against their own assumptions — QuikTrack's suite hand-minted tokens with raw `jose` and hand-wrote `sub`, so it never exercised the real minter. There is now a contract test (`apps/quiktrack/__tests__/unit/agent-jwt.test.ts`) that calls next-auth's real `encode()` with this exact payload and asserts the real verifier accepts it. **If you change the claim set, that test is the thing to update.**
