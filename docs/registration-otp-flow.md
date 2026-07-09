# Self-Serve Registration, OTP Verification, Email & Redis — Architecture

> Scope: this document describes **only** the self-serve workspace **sign-up flow** added to QuikIT —
> the 3-step registration, **6-digit OTP** verification, **email** delivery, **Redis** usage, the
> **database** tables involved, and how to extend the same machinery for **2FA** later.
> It does not cover the existing invite-based `/signup` flow (that is unrelated and untouched).

---

## 1. Overview & architecture

| Layer | Responsibility | Where |
|---|---|---|
| **Central IdP** | Registration, OTP, login, sessions | `apps/auth` |
| **Launcher** | Workspace UI (`/apps`, app activation, trials) | `apps/quikit` |
| **Redis** | Ephemeral OTP + pending-registration + session state (with in-memory fallback for dev) | `@quikit/redis` (`getRedis()`) |
| **Postgres (Neon)** | Durable user / org / membership / subscription data | `@quikit/database` (Prisma) |

**Design rule:** the OTP and the not-yet-created workspace details live in **Redis** (short-lived,
auto-expiring). Only a password-less, unverified `User` row is written to Postgres up front; the
**Org + membership + subscription are created only once the user finishes** (sets a password). This
guarantees an abandoned sign-up never leaves orphan Org/Subscription rows behind.

```
Step 1  POST /api/auth/register        Step 2  POST /api/auth/verify-otp     Step 3  POST /api/auth/register/complete
┌─────────────────────────────┐        ┌────────────────────────────┐       ┌──────────────────────────────────────┐
│ create unverified User (DB)  │        │ verify OTP (Redis)         │       │ consume reset token + pending (Redis) │
│ store org name (Redis)       │  ───►  │ mint one-shot reset token  │ ───►  │ set password + emailVerified (DB)     │
│ store + email 6-digit OTP    │        │ (Redis)                    │       │ create Org + OrgMember + Subscription  │
└─────────────────────────────┘        └────────────────────────────┘       │ auto sign-in → /apps                   │
                                                                             └──────────────────────────────────────┘
```

---

## 2. Sign-up flow (3 steps)

UI: a single page with three internal steps — `apps/auth/app/register/page.tsx`
(workspace → OTP → set-password), with a 5-minute countdown, resend, and auto sign-in on success.

### Step 1 — Create workspace → `POST /api/auth/register`
File: `apps/auth/app/api/auth/register/route.ts`

1. Validate `fullName`/`firstName+lastName`, `email`, `organizationName` (Zod). **No password here.**
2. Rate-limit per IP and per email (`@quikit/shared/rateLimit`).
3. If a **complete** account exists (`password` OR `emailVerified` OR any membership) → `409`.
   If an **incomplete** unverified user exists → reuse it (idempotent retry).
4. **Insert/refresh** the unverified `User` row (Postgres): `password = null`, `emailVerified = null`.
5. **Redis:** `storePendingRegistration(userId, { organizationName })`.
6. **Redis:** `generateOtp()` → `storeOtp(userId, hashOtp(otp), REGISTRATION_OTP_TTL_SECONDS=300)`.
7. **Email** the 6-digit code (`sendRegistrationOtpEmail`, best-effort).
8. Return `{ success, email, expiresInSeconds: 300 }`.

### Step 2 — Verify OTP → `POST /api/auth/verify-otp` (reused, shared with password-reset)
File: `apps/auth/app/api/auth/verify-otp/route.ts`

1. Rate-limit per IP. Look up user by `email`.
2. `verifyOtp(userId, otp)` — timing-safe compare; wrong code increments an attempts counter;
   after **5** wrong attempts the OTP is deleted (must resend). Success deletes the OTP.
3. On success: `generateResetToken()` → `storeResetToken(token, userId)` (Redis, TTL 300s).
4. Return `{ success, resetToken, expiresInSeconds: 300 }`. (Generic `400` on any failure — no enumeration.)

> **CORS:** this handler is wrapped with `withCors` (+ an `OPTIONS` `preflight`) from `apps/auth/lib/cors.ts`,
> so the central IdP's OTP verification can be called cross-origin (other apps / the Flutter mobile client).
> The unknown-email branch still calls `verifyOtp` on a dummy id to equalize latency (no user enumeration).

### Step 3 — Set password & finish → `POST /api/auth/register/complete`
File: `apps/auth/app/api/auth/register/complete/route.ts`

1. `consumeResetToken(resetToken)` → `userId` (atomic single-use; null if expired/used).
2. `consumePendingRegistration(userId)` → `{ organizationName }` (atomic read+delete).
3. One DB transaction:
   - **Update** `User`: `password = bcrypt(pw, 10)`, `emailVerified = now()`.
   - **Insert** `Org` (`plan: "startup"`, `billingEmail`, `createdBy`), slug auto-deduped.
   - **Insert** `OrgMember` (`role: org_admin`, `status: active`, `acceptedAt: now()`, `createdBy: userId`).
   - **Insert** `Subscription` (`status: active`, `planSlug: startup`, `source: self_serve_registration`).
     > Workspace-level subscription is `active` (non-gating). The **14-day trial is per-app** on
     > `OrgAppAccess.trialEndsAt`, set later when the user activates an app from the launcher.
4. Client then calls NextAuth `signIn("credentials", …)` → lands on the launcher `/apps`.

### Resend → `POST /api/auth/register/resend-otp`
File: `apps/auth/app/api/auth/register/resend-otp/route.ts` — for an in-progress (unverified)
sign-up only: regenerate OTP, refresh the pending-registration TTL, re-email. Always returns success
(anti-enumeration), rate-limited.

---

## 3. OTP generation & verification

All in `apps/auth/lib/otp-store.ts` (Redis-backed, with a process-local `Map` fallback when no
`REDIS_URL`):

| Function | What it does |
|---|---|
| `generateOtp()` | 6-digit zero-padded code via `crypto.randomInt` (e.g. `"048217"`). |
| `hashOtp(otp)` | `sha256(otp)` — only the **hash** is stored, never the raw OTP. |
| `storeOtp(userId, hash, ttl)` | `SET otp:reset:<userId> <hash> EX <ttl>` and clears the attempts counter. Registration passes `ttl = 300` (5 min); password-reset uses the default `180` (3 min). |
| `verifyOtp(userId, otp)` | Timing-safe (`crypto.timingSafeEqual`) compare. Wrong → `INCR` attempts (TTL-aligned); on the 5th wrong attempt deletes the OTP (`{ ok:false, locked:true }`). Success deletes OTP + counter. |
| `generateResetToken()` / `storeResetToken()` / `consumeResetToken()` | 256-bit URL-safe one-shot token; `consume` is an atomic `MULTI(GET, DEL)` so a token works once. |
| `storePendingRegistration` / `peekPendingRegistration` / `consumePendingRegistration` | Hold/refresh/atomically-claim the pending org name keyed by `userId`. |

---

## 4. Database — tables, columns, references, insert/update

> The OTP itself is **never** stored in Postgres (it lives in Redis). `auth.VerificationToken` exists
> for other flows (e.g. email-verify links) but is **not used** by the OTP registration path.

| Table (schema) | Key columns used | Inserted | Updated |
|---|---|---|---|
| `auth.User` | `id, email, firstName, lastName, password, emailVerified` | Step 1 (`password=null, emailVerified=null`) | Step 3 (`password`, `emailVerified=now`) |
| `quikit.Org` | `id, name, slug, plan, billingEmail, createdBy` | Step 3 | — |
| `quikit.OrgMember` | `orgId, userId, role, status, acceptedAt, createdBy` | Step 3 (`org_admin`, `active`) | — |
| `quikit.Subscription` | `orgId (unique), status, planSlug, source` | Step 3 (`active`) | on upgrade/activation |
| `quikit.OrgAppAccess` | `orgId, appId, enabled, trialEndsAt` | on app activation (launcher) | on upgrade |
| `public.Plan` | `slug, name, priceMonthly, …` | seeded (migration / `db:seed:plans`) | super-admin UI |

**Reference / FK map:**

```
auth.User (id) ──┐
                 ├──< quikit.OrgMember (userId, orgId) >── quikit.Org (id)
quikit.Org (id) ─┤
                 ├──1:1── quikit.Subscription (orgId @unique → Org.id)
                 └──< quikit.OrgAppAccess (orgId, appId → quikit.App.id)
```

`Subscription.orgId` is a **unique FK** to `Org.id` (one subscription per org). `OrgMember` is the
many-to-many join between `User` and `Org` carrying the role. **Note:** the `Org.subscription` field
in the Prisma schema is a *relation* (virtual back-reference) — it is **not** a column on the `Org`
table; the data lives in the `Subscription` table.

---

## 5. OTP expiry & resend

- **Expiry is automatic** via Redis key TTL — no cron/cleanup needed. Registration OTP TTL =
  `REGISTRATION_OTP_TTL_SECONDS = 300` (5 min). Once it lapses the key is gone; verification fails and
  only **Resend** can issue a new one. The UI shows a live 5:00 countdown and disables verify at 0.
- **Resend** (`/api/auth/register/resend-otp`) generates a fresh OTP, re-emails it, and refreshes the
  pending-registration window. The attempts counter resets with each new OTP (fresh 0/5).

---

## 6. Email triggering

File: `apps/auth/lib/email.ts` → `sendRegistrationOtpEmail({ to, otp })` renders a branded HTML email
("Confirm your email", code, "expires in 5 minutes"). Delivery picks the first configured transport:

1. **SMTP** (nodemailer) if `SMTP_HOST/SMTP_USER/SMTP_PASS` set →
2. **Resend** if `RESEND_API_KEY` set →
3. **Console log** (dev) — prints the OTP to the server log so you can copy it.

Email sending is **best-effort / try-catch'd** — a transport failure never blocks the API response
(the user can resend).

---

## 7. Redis usage & keys

`getRedis()` (`@quikit/redis`) returns the client or `null`; every helper falls back to an in-memory
`Map` with manual TTL when Redis is absent (single-instance dev only).

| Key | Value | TTL | Purpose | Defined in |
|---|---|---|---|---|
| `otp:reset:<userId>` | `sha256(otp)` | 300s (reg) / 180s (reset) | the active OTP hash | `lib/otp-store.ts` |
| `otp:reset-attempts:<userId>` | wrong-attempt counter | matches OTP | brute-force lockout (max 5) | `lib/otp-store.ts` |
| `otp:reset-token:<token>` | `userId` | 300s | one-shot token bridging verify → complete | `lib/otp-store.ts` |
| `reg:pending:<userId>` | JSON `{ organizationName }` | 1800s (30 min) | pending workspace details | `lib/otp-store.ts` |
| `auth:session:<sessionId>` | `{ userId, createdAt }` | 30 days | login session (soft-revocation) | `packages/auth/session-store.ts` |

> The key prefix is `otp:reset:` because the same store powers both password-reset and registration —
> the registration flow just passes a longer TTL. Functionally they are independent (keyed by `userId`).

---

## 8. How Redis and the DB interact in the flow

| Step | Postgres | Redis |
|---|---|---|
| 1. register | **INSERT** unverified `User` | **SET** `reg:pending:<userId>`, **SET** `otp:reset:<userId>` |
| 2. verify-otp | read `User` by email | **GET/DEL** `otp:reset:*`, **SET** `otp:reset-token:<token>` |
| 3. complete | **UPDATE** `User`; **INSERT** `Org/OrgMember/Subscription` | **GETDEL** `otp:reset-token:<token>` + `reg:pending:<userId>` |
| resend | read `User` | **SET** new `otp:reset:<userId>`, refresh `reg:pending` |

Why split this way: Redis holds everything **ephemeral and abandon-able** (codes, tokens, the pending
org name) so it self-cleans on TTL; Postgres only gains durable rows the user actually committed to.
The `User` is created early (so `verify-otp` can find it by email and key the OTP by `userId`), but the
Org/Subscription wait until completion.

---

## 9. Future: 2FA at login (reusing this machinery)

The OTP store is already the exact shape a login-time 2FA challenge needs. To add 2FA later **without
new infrastructure**:

1. After a successful password check in the NextAuth `authorize`/`signIn` step, if the user has 2FA
   enabled, **don't** issue the full session yet. Instead:
   - `generateOtp()` → `storeOtp(userId, hash, ttl)` under a dedicated namespace, e.g.
     **`otp:2fa:<userId>`** (add a `twoFaKey` alongside `otpKey` in `otp-store.ts`), and email/SMS it.
   - Mark a **pending-2FA** marker in Redis (e.g. `2fa:pending:<challengeId> = userId`, short TTL),
     return the `challengeId` to the client.
2. A `POST /api/auth/2fa/verify` endpoint calls `verifyOtp(userId, code)`; on success it consumes the
   pending marker and **then** creates the real session (`createAuthSession` → `auth:session:<id>`).
3. The 5-attempt lockout, TTL expiry, and resend logic all come for free from `otp-store.ts`.

A `User.twoFactorEnabled` boolean (new column) would gate whether step 1 triggers the challenge. No
change to the registration flow is required.

---

## 10. File reference index

| Path | Role |
|---|---|
| `apps/auth/app/register/page.tsx` | 3-step registration UI (workspace → OTP → password) |
| `apps/auth/app/api/auth/register/route.ts` | Step 1 — create user + store OTP/pending + email |
| `apps/auth/app/api/auth/verify-otp/route.ts` | Step 2 — verify OTP → mint reset token (shared) |
| `apps/auth/app/api/auth/register/complete/route.ts` | Step 3 — set password + provision org/subscription |
| `apps/auth/app/api/auth/register/resend-otp/route.ts` | Resend OTP for in-progress sign-up |
| `apps/auth/lib/otp-store.ts` | OTP + reset-token + pending-registration (Redis/in-memory) |
| `apps/auth/lib/email.ts` | `sendRegistrationOtpEmail` + transport fallback (SMTP → Resend → console) |
| `apps/auth/lib/cors.ts` | `withCors` / `preflight` — cross-origin wrapper for `verify-otp` |
| `apps/auth/lib/tokens.ts` | `generateToken` / `hashToken` (used elsewhere; OTP uses otp-store) |
| `packages/auth/session-store.ts` | Redis session store (`auth:session:<id>`) |
| `packages/redis` | `getRedis()` client |
| `packages/database/prisma/schema.prisma` | `User`, `Org`, `OrgMember`, `Subscription`, `OrgAppAccess`, `Plan` |
| `packages/shared/lib/constants.ts` | `TRIAL_DURATION_DAYS`, `SUBSCRIPTION_STATUS`, roles |
