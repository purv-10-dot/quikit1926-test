# Flow E — Client-Side Storage & Session Management (code-verified)

*Added to answer three follow-up questions the Redis trace above does not cover: (1) what we use Redis for — answered throughout Flows A–D; (2) **do we store in localStorage or in memory?**; (3) **do we manage sessions?** This section traces the browser side (`localStorage` / `sessionStorage`) and the real session mechanism (NextAuth JWT cookie + central SSO + the shared Redis session id). Source-verified on branch `gourav-uat-hrms`, base dir `apps/quikhrms`.*

## Direct answers (one line each)

- **Where do we store data — localStorage or in memory?** Both, for *different, non-authoritative* things. The browser uses `localStorage` for device prefs + a small amount of dev/tenant scratch data, and `sessionStorage` for a *legacy* token pair. The server uses a per-process **in-memory LRU** as the first cache layer (see Flow C §0). **Neither browser storage nor the LRU is a source of truth — Postgres is.**
- **Do we manage sessions?** Yes — the session is a **NextAuth JWT held in an httpOnly cookie**, issued by **QuikIT's central SSO** (OAuth2/OIDC). It is *not* stored in `localStorage`/`sessionStorage`. A **shared Redis session id** lets a logout in HRMS (or any sibling app) soft-invalidate the session everywhere. The Redis `session-valid` / `central-member` verdicts in Flow C §4–5 sit on top of this.

---

## PART 1 — Browser storage: `localStorage` and `sessionStorage`

### `sessionStorage` — legacy per-tab token pair

`src/lib/auth/token-store.ts` keeps two values in `sessionStorage` (per-tab, not shared across tabs):

| Key | What | Lifetime | File:line |
|---|---|---|---|
| `hrms_token` | short-lived access JWT (legacy Bearer header) | tab close | `token-store.ts:11,17,27` |
| `hrms_refresh` | long-lived refresh token (legacy `/auth/refresh`) | tab close | `token-store.ts:12` |

**Important:** these are the **legacy** custom-auth tokens (`client-cleanup.ts:22` literally calls them "the legacy sessionStorage token pair"). The live auth path is the NextAuth cookie in PART 2 — **the real session is not in `sessionStorage`**. The token store is read/written via `getToken`/`setTokens`/`clearToken` and wiped on logout.

### `localStorage` — device prefs + dev/tenant scratch

| Key | What | Scope | Survives logout? | File:line |
|---|---|---|---|---|
| `hrms.theme` | dark/light dashboard theme | device pref | **Yes** (deliberate) | set `top-bar.tsx:307`; read pre-hydration `app/layout.tsx:47` |
| `quikhrms-theme` | marketing-site theme | device pref | **Yes** | set `(marketing)/_components/nav.tsx:61`; read `(marketing)/layout.tsx:39` |
| `hrms.sidebarCollapsed` | sidebar collapsed state | device pref | **Yes** (deliberate) | read `sidebar.tsx:285`; set `sidebar.tsx:292` |
| `hrms.orgId` | dev no-login tenant id | dev identity | **No** — cleared | read `realtime-provider.tsx:25` |
| `hrms.userId` | dev no-login user id | dev identity | **No** — cleared | read `realtime-provider.tsx:26` |
| `hrms.roles` | dev role spoofing | dev identity | **No** — cleared | read `use-api.ts:16`, `payroll/runs/[id]/page.tsx:553` |
| `hrms.roles.impersonate` | dev role impersonation | dev identity | **No** — cleared | `client-cleanup.ts:11` |
| `hrms.asset.customCategories` | user-added asset categories (tenant data) | tenant scratch | **No** — cleared | read `assets/page.tsx:45`; set `:225,238,267` |

**What is NOT in browser storage:** no real session token, no permissions, no employee/profile data, no business records. The only tenant-scoped item is the asset-category scratch list, and it is explicitly cleared on logout so it can't leak to the next user on a shared machine.

### Logout / expiry cleanup — `clearClientSessionState()`

`src/lib/auth/client-cleanup.ts:25-36`, called on logout and session expiry **before** navigating away:

1. `abortAllInflight()` — cancels every in-flight GET so an old user's responses can't land.
2. `clearToken()` — wipes the `sessionStorage` `hrms_token` / `hrms_refresh` pair.
3. Removes the **session-scoped** `localStorage` keys (`SESSION_SCOPED_LOCAL_KEYS`, `client-cleanup.ts:9-15`): `hrms.roles`, `hrms.roles.impersonate`, `hrms.asset.customCategories`, `hrms.orgId`, `hrms.userId`.

**Device prefs (`hrms.theme`, `hrms.sidebarCollapsed`) deliberately persist** (`client-cleanup.ts:4-7`) — they carry no tenant data, and re-applying them on every login would be hostile UX.

---

## PART 2 — Session management (NextAuth JWT cookie + central SSO)

**Yes, HRMS manages sessions** — but as an SSO client of QuikIT, not with its own login DB. Config: `src/lib/auth.ts`.

### Where the session actually lives

- **A NextAuth JWT in an httpOnly cookie**, signed with `NEXTAUTH_SECRET`. `session.strategy = "jwt"`, `maxAge` seven days (`auth.ts:92-93`). The cookie — not `localStorage` — is the session.
- Identity comes from **QuikIT's OAuth2/OIDC IdP** (`clientId "quikhrms"`, OIDC discovery via `wellKnown`, `id_token` verified) — `auth.ts:58-84`. HRMS has no local password/login table for SSO users.
- The JWT carries `id` (central user id), `email`, `orgId`, `membershipRole`, and a **`sessionId`** minted by the central IdP (`auth.ts:111-120`).

### The `jwt` callback — soft-revocation every cycle (`auth.ts:95-122`)

- On initial sign-in, profile claims are copied onto the token.
- On later requests, throttled to `SESSION_CHECK_INTERVAL` (thirty seconds, `auth.ts:28,104`), it calls `isAuthSessionActive(token.sessionId)` against the **shared Redis session store** (`@quikit/auth/session-store`). If the session was revoked (central logout, admin force-logout, sibling-app sign-out) → returns `{}`, dropping all claims so middleware/`withAuth` treat the request as unauthenticated.
- **Fails open** when Redis is unavailable (a transient cache outage doesn't log everyone out).

### The `signOut` event — one logout, everywhere (`auth.ts:135-160`)

1. `revokeAuthSession(sessionId)` deletes the shared Redis session id → invalidates the session **centrally and across every sibling app** (without this, `/login` auto-SSO would silently sign the user straight back in).
2. `invalidateUserAuthCaches(id, orgId)` busts this user's process-local auth caches (`session-valid`, `central-member`, `perms`, `employee-me`) so nothing lingers past the cookie.

### Server-side enforcement (ties back to Flow C)

Every API request runs through `withAuth` → `resolveIdentity` (`src/lib/with-auth.ts`), which reads the JWT from the cookie via `getToken`, then applies the two Redis **verdict** caches already traced in Flow C:

- **`session-valid:{authUserId}`** (TTL sixty seconds, Flow C §4) — central session still valid? Re-checks central `/api/verify-token` on miss; fail-open.
- **`central-member:{orgId}:{authUserId}`** (TTL one-hundred-twenty seconds, Flow C §5) — central org membership / app access still live? Re-checks central member lookup on miss; fail-open; reconciles the local `Employee` row (suspend/reactivate/role remap).

So Redis only holds **boolean session verdicts**, never the session itself. The durable session is the cookie + the central SSO session record; HRMS is a stateless verifier.

### Redis vs cookie vs browser-storage split

| Layer | Holds | Source of truth? |
|---|---|---|
| **httpOnly NextAuth cookie** | the JWT session (id, orgId, sessionId, role) | yes (for the session) |
| **Shared Redis session store** | the `sessionId` liveness flag (cross-app revoke) | yes (for "is this session alive?") |
| **Redis verdict caches** | `session-valid` / `central-member` booleans, TTL-bounded | no (re-derivable from central) |
| **`sessionStorage`** | legacy `hrms_token` / `hrms_refresh` | no (legacy, not the live path) |
| **`localStorage`** | device prefs + dev identity + asset scratch | no |

### Degraded mode (no Redis)

The cookie session still works; `isAuthSessionActive` / `session-valid` / `central-member` all **fail open**, so users stay logged in and each request falls back to verifying against central over HTTP. The only loss is instant cross-app revocation — a central logout propagates within the verdict TTL (≤ one-hundred-twenty seconds) instead of immediately.

---

## Summary for the reviewer

- **localStorage vs in-memory:** browser `localStorage` = device prefs (theme, sidebar) + small dev/tenant scratch; `sessionStorage` = a *legacy* token pair; server `in-memory LRU` = the hot first cache layer (Flow C §0). None is authoritative — **Postgres is**.
- **Sessions:** managed as a **NextAuth JWT cookie via QuikIT central SSO**, with a **shared Redis session id** for cross-app soft-revocation and two short-lived Redis verdict caches for server-side enforcement. The session is **never** kept in `localStorage`/`sessionStorage`.
