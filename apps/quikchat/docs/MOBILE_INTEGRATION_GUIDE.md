# QuikChat — Mobile Integration Guide

Companion to [`openapi.yaml`](./openapi.yaml) in this folder. That file
covers request/response shapes; this document covers the three things a
spec can't: how a mobile client authenticates, how it gets live updates,
and how file uploads actually work end to end.

---

## 1. Auth model — unresolved, read this before writing any networking code

**Bottom line: there is no bearer-token, PKCE, or any cookie-free auth
mechanism a mobile client can use against quikchat today.** This is the
single biggest blocker to mobile development starting — bigger than any
gap in the endpoint spec — so it's worth understanding exactly what was and
wasn't found before building anything.

### What quikchat actually requires

Every route in `openapi.yaml` (except the two explicitly public ones) is
wrapped in `withOrgAuth`, which resolves the caller via NextAuth's
`getServerSession(authOptions)` — i.e. **a valid `next-auth.session-token`
(or `__Secure-next-auth.session-token` in production) cookie**, with an org
already selected in that session's JWT. There is no fallback to an
`Authorization` header anywhere in this path.

### What was checked in `@quikit/auth` (the shared package every app uses)

- `verifyJWT` and `createMiddleware()` both resolve the session via
  NextAuth's `getToken()`, which decrypts the **cookie**-carried JWE. Not
  an Authorization-header parser.
- There **is** a `verifyTokenRemote` helper that accepts a `bearer` field —
  but it's server-to-server plumbing (one app's middleware calling a
  central `/api/verify-token` endpoint, gated by an internal shared
  secret), still ultimately checking the same NextAuth JWT, just forwarded
  from one server to another. Nothing a mobile client calls directly.
- The package does implement an OIDC provider, but as QuikIT web apps
  acting as OAuth *clients* against a central IdP (redirect URIs are
  `https://*.quikit.ai` web origins) — not a mobile deep-link / custom
  URI-scheme flow, and not exposed as a token-issuing endpoint mobile could
  hit.
- No mobile-specific NextAuth provider exists.

**Conclusion: `@quikit/auth` has no path for a native app that isn't a
browser holding a session cookie.**

### The one thing that already solved this problem — for a different app

`docs/MOBILE_FLUTTER_COOKIE_AUTH.md` (repo root) is a real, previously
written guide for quikinfra's Flutter team. It is worth reading in full
before deciding anything for quikchat, because its central point is a
direct rejection of the bearer-token approach:

> Replace JWT/Bearer-token auth with the same NextAuth session cookie the
> QuikInfra web app uses... **What NOT to use:** `Authorization: Bearer
> <nextauth-jwe>` only — `getServerSession` reads cookies primarily.

The pattern it prescribes:
1. Two `Dio` HTTP clients with **separate, host-scoped cookie jars** — one
   ephemeral (`CookieJar`) used only to talk to the central auth service,
   one persistent (`PersistCookieJar`, via `dio_cookie_manager`) attached
   to every feature-API call.
2. Login flow: `GET /api/auth/csrf` → `POST
   /api/auth/callback/credentials` (email+password+csrfToken) on the
   **central auth domain** → `GET /api/post-login?callbackUrl=...` → this
   redirects with a one-time handoff token → `GET
   /auth-handoff?token=...` **on the target app's own domain**, which sets
   that app's session cookie → optionally confirm with `GET
   /api/auth/session`.
3. Every subsequent API call rides the same persisted session cookie,
   automatically attached by `CookieManager` — no per-request token
   handling at all.

This is a real, working, previously-validated mechanism — but it was built
for **quikinfra**, targeting `apps/quikinfra/app/auth-handoff/route.ts`.
**quikchat does not have an equivalent `auth-handoff` route.** Whether one
should be added, and whether the cookie-jar pattern is the right choice for
quikchat specifically (vs. some token-based alternative that doesn't exist
yet anywhere in the monorepo), is a decision for whoever owns quikchat's
mobile rollout — not something this document or the OpenAPI spec should
presume.

### The other precedent found — and why it doesn't apply here

`apps/quiktrack` has a genuine bearer-token flow: `POST /api/v1/token`
exchanges email+password for a short-lived (1hr) HS256 JWT, built
specifically "for external Swagger/Scalar consumers and API scripts." It's
a real, working token issuance and verification path (`withOrgAuth`-style
wrapper there accepts either the token or a cookie session) — but it lives
entirely inside quiktrack's own code, outside `@quikit/auth`, and per
quiktrack's own project conventions can't be lifted into the shared package
without sign-off from that integration's owner. It answers "has anyone
built bearer-token auth here" (yes) but not "can quikchat use it" (not
without new shared-package work and an owner's approval).

### What this means for building against the spec today

Until a decision is made, treat `openapi.yaml`'s `sessionCookie` security
requirement as **aspirational for a native client**: it's what the server
actually requires right now, but no supported way exists yet for a mobile
app to obtain that cookie the way quikinfra's Flutter app does (quikchat
has no `auth-handoff` route). The two concrete paths forward, in the order
this investigation would recommend raising them:

1. **Extend the quikinfra cookie-jar pattern to quikchat** — add an
   `auth-handoff` route to quikchat mirroring quikinfra's, and reuse the
   Flutter-side `DioFactory`/`AuthRepository` pattern from
   `docs/MOBILE_FLUTTER_COOKIE_AUTH.md` almost verbatim. Lowest net-new
   backend work, proven pattern, but ties every mobile session to a
   cookie jar (no clean bearer-token story for e.g. background push
   registration or a future public API).
2. **Design a real mobile token flow in `@quikit/auth`**, generalizing
   quiktrack's `/api/v1/token` approach into the shared package so every
   app (not just quiktrack) gets it. More upfront work and requires
   buy-in beyond quikchat, but avoids permanently coupling mobile auth to
   cookie jars.

Neither is implemented. Don't build client networking code against an
assumed answer — confirm the direction with whoever owns this decision
before writing the mobile app's auth layer.

---

## 2. Realtime gateway contract

**A mobile client cannot get live updates by polling REST.** New messages,
edits, reactions, read/delivery receipts, presence, and incoming calls all
arrive exclusively over a Socket.IO connection to a separate realtime
gateway service (`services/realtime/`). The REST API in `openapi.yaml` has
no long-poll or SSE equivalent for these (the one exception, `assist`'s
SSE stream, is out of MVP scope).

### 2.1 Getting a handshake token

The NextAuth session cookie is httpOnly and isn't something a raw
Socket.IO handshake can use directly, so:

```
GET /api/realtime/token          (session-cookie auth, same as any REST call)
→ { "token": "<HS256 JWT>", "expiresIn": 60 }
```

The JWT payload is just `{ userId, orgId }`, signed with
`REALTIME_TOKEN_SECRET`, and expires in **60 seconds** — it's a
single-handshake credential, not a session token. **Re-fetch it on every
connect and every reconnect**, don't cache it.

### 2.2 Connecting

```js
io(REALTIME_WS_URL, {
  transports: ["websocket"],   // no "polling" — see below
  auth: (cb) => fetchRealtimeToken().then(token => cb({ token })),
});
```

Two things to carry over into a mobile Socket.IO client:

- **`auth` as a callback function, not a static value** — Socket.IO calls
  it fresh on every (re)connect attempt, which is what makes the 60-second
  token TTL workable. A static `auth: { token }` set once at connect time
  would fail every reconnect after the first minute.
- **`transports: ["websocket"]` only — long-polling is deliberately
  disabled.** This was a real production fix (commit `3607c219`,
  "websocket-only transport to remove the polling handshake affinity
  requirement"): Socket.IO's HTTP long-polling transport does its initial
  handshake over plain HTTP, and with multiple gateway replicas and no
  load-balancer session affinity, a client's next poll can land on a
  *different* replica than the one that started the handshake — producing
  "Session ID unknown" errors and connect/disconnect flapping. WebSocket
  skips that handshake dance entirely (one persistent connection, doesn't
  matter which replica it lands on). **This matters even more for mobile
  than web**: background/foreground transitions and network-switch
  (WiFi↔cellular) reconnects are exactly the scenario that would have hit
  this bug hardest. Do not re-enable polling as a mobile "compatibility"
  fallback — it reintroduces the affinity requirement that was
  specifically removed.

The server-side auth middleware verifies the JWT (HS256 only — pinned
against algorithm-confusion attacks) and pins `userId`/`orgId` to the
socket. On connect, the gateway **automatically joins the socket to every
channel room the user is already a DB member of** and emits `ready`.
**Mobile clients do not need to manually join every channel on connect** —
only channels not already covered by that auto-join (e.g. one just joined
via the REST `join` endpoint mid-session) need an explicit `join` emit.

Send a `heartbeat` event every ~15s while connected to keep server-side
presence alive.

### 2.3 Event catalogue

**Client → server (emit):**

| Event | Payload | Ack |
|---|---|---|
| `join` | `channelId: string` | `{ ok: boolean }` |
| `leave` | `channelId: string` | — |
| `typing` | `{ channelId }` | — |
| `heartbeat` | — | — |
| `call:invite` / `call:accepted` / `call:reject` / `call:cancel` / `call:end` | `{ callId, ... }` | `{ ok }` |

**Server → client (emit):**

| Event | Payload | Delivered to |
|---|---|---|
| `ready` | `{ channelIds: string[] }` | own socket, on connect |
| `presence_snapshot` | `{ users: [...] }` | own socket, on connect |
| `message` | `MessageDto` | channel room (also carries system messages) |
| `message_update` | message patch | channel room |
| `reaction` | reaction DTO | channel room |
| `read` | `{ channelId, userId, readAt }` | channel room |
| `delivered` | delivery watermark | channel room |
| `channel_updated` | `{ channelId, name?, description?, avatarUrl? }` | channel room |
| `channel_deleted` | `{ channelId, memberIds? }` | channel room |
| `typing` | `{ channelId, userId }` | channel room, excluding sender |
| `notification` | app-defined payload | **per-user room**, not channel room |
| `presence` / `presence_status` | `{ userId, status, ... }` | channel rooms the user belongs to |
| `call_group_started` | `{ callId, channelId, initiatorId, type }` | channel room |
| `call:ringing` / `call:unavailable` / `call:rejected` / `call:cancelled` / `call:ended` / `call:timed_out` | `{ callId, ... }` | the relevant participant's user room |
| `error` | `{ event, channelId?, message }` | own socket, on a rejected `join`/`leave` |

`notification` is the one event that does **not** arrive via the channel
room a mobile client just joined — it's routed to a private per-user room
(`org:{orgId}:user:{userId}`), so it fires regardless of which channels
are currently open, which is exactly what a mobile push/badge integration
needs to key off.

Room naming is always prefixed `org:{orgId}:...`, so cross-tenant delivery
is structurally impossible even if application logic has a bug — useful to
know when debugging "why didn't I get this event," since a mismatched
`orgId` in the handshake JWT is a likely first suspect.

---

## 3. Upload flow — three steps, not a multipart POST

The natural first assumption — "upload is one `multipart/form-data` POST"
— is wrong for this API. It's a three-step signed-URL flow:

```
1. POST /api/uploads/sign
   body: { channelId, filename, contentType, size }
   → { uploadUrl, method: "PUT", headers: { Content-Type, X-Upload-Token }, objectPath, maxBytes, expiresAt }

2. PUT <uploadUrl>              (uploadUrl is "/api/uploads/local" or "/api/uploads/gcs")
   headers: exactly the headers object returned in step 1
   body: raw file bytes (NOT multipart — the whole request body IS the file)
   → { ok: true, objectPath }

3. POST /api/channels/{id}/messages
   body: { type: "Media", data: { objectPath, ... }, content: "" }
   → MessageDto (server resolves objectPath to a fresh signed media URL on every read)
```

Things worth getting right on the mobile side:

- **The token from step 1 goes in the `X-Upload-Token` request header for
  step 2 — never in the URL.** This is a recent, deliberate fix: the token
  is HMAC-signed and can run ~450 characters, and an on-prem IIS/http.sys
  reverse proxy in this deployment's path rejects URL path segments over
  ~260 chars. A custom header (not `Authorization`, to avoid colliding
  with IIS Windows Auth / edge auth layers) sidesteps that limit entirely.
  If you're porting web client code that used to build a URL like
  `/api/uploads/gcs/{token}`, that route **no longer exists** (removed in
  this refactor) — use the flat `PUT /api/uploads/gcs` with the header
  instead.
- **Step 2 requires no session cookie at all.** Auth for that single
  request is entirely the upload token — it's deliberately excluded from
  the app's normal auth middleware so a raw `PUT` with the right header
  succeeds independent of cookie/session state. Don't be surprised that a
  request with no auth headers except `X-Upload-Token` still works.
  Conversely, don't add a session cookie or Authorization header to this
  request expecting it to matter — it's ignored.
  The `Content-Type` header on the PUT must match, byte-for-byte (ignoring
  a `;charset=...` suffix), the `contentType` that was declared in step 1
  — a mismatch is a `400`, not silently accepted.
- **The signed upload token expires in 5 minutes and is single-use in
  intent** (it's bound to one `objectPath`) — sign immediately before
  uploading, don't pre-fetch a batch of upload targets for later use.
- **Downloads differ by storage driver, and this matters for how a mobile
  client renders media:**
  - Local driver: `GET /api/uploads/local/{token}` — the token is in the
    **path**, not a header, specifically because this URL needs to be
    usable as a plain `<img src>`/video URL, and a mobile equivalent
    (loading straight into an image view / video player) should do the
    same — no custom header needed or possible on that request.
  - GCS driver: there's no equivalent proxy route in this app at all — the
    URL embedded in a `MessageDto`'s `data.mediaUrl` (or a channel's
    `avatarUrl`) is already a direct, time-limited (10 min) signed
    `storage.googleapis.com` URL. Just load it directly; don't route it
    through the quikchat backend.
  - Either way, the URL you get back from a message/channel read is
    **freshly minted on that read** — don't persist and reuse a media URL
    across app sessions; re-fetch the message/channel to get a valid one.

---

## Summary

| Question | Answer |
|---|---|
| Can a mobile client authenticate today? | **No.** No token/PKCE mechanism exists; the working precedent (quikinfra's cookie-jar bridge) has no quikchat equivalent yet. Needs a decision before mobile work starts. |
| How does a mobile client get live updates? | Socket.IO to the realtime gateway, websocket-only, using a 60s token from `GET /api/realtime/token`, re-fetched every reconnect. |
| How do uploads work? | Sign → PUT raw bytes with token in `X-Upload-Token` header (not URL, not multipart) → send message referencing the object path. |

See [`openapi.yaml`](./openapi.yaml) for the full endpoint-level contract
covering channels, messages, uploads, and the realtime token endpoint.
