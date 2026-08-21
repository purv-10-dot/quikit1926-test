# QuikChat — Backlog

Reconciled against the 47-row **Production Go-Live Checklist**, the **reachability
sweep**, and items found during implementation. Updated 13 Aug 2026.

Supersedes the pending sections of `QUIKCHAT_PROGRAM_PLAN.md`; external-service
detail (Search contract, AI Runtime interface) still lives there.

---

## What the sweep showed, and what happened to it

The sweep found thirteen features **built, tested, and unreachable** — finished
code with no path a user could take to it. Four have since been restored
(Discover, mark-all-read/clear-all, leave channel/group, calendar edit/delete);
the rest are in the queue below.

The two consequences still hold and are worth keeping in view:

1. **"Done" has meant "code exists", not "a user can reach it."** No test in the
   suite catches an unmounted component or an uncalled prop — every test mounts
   its subject directly.
2. **The go-live checklist was validated by reading source.** Rows marked Done
   may be code-complete but unreachable. Re-check any row that depends on a UI
   entry point before shipping.

A third emerged during this cycle, from the gitignore/alias/exclusion findings:
**green tests have repeatedly been green about a smaller set than anyone
believed.** Worth treating as a standing risk, not three coincidences.

A fourth, from the meeting-fields work: **a test can be green because of the
environment it runs in.** The all-day timezone test passed with its
`timeZone: "UTC"` pin removed, because this machine is IST — any positive offset
hides the bug, and so does UTC. Only a negative-offset viewer exposes it.
Output-only assertions were worthless; the test had to assert the mechanism
(`toLocaleDateString` receives `timeZone: "UTC"`). **Assert the mechanism when
the environment can mask the output.**

---

## ✅ Shipped this cycle

Committed unless noted.

**Security**
- `UPLOAD_TOKEN_SECRET` / `AGENT_JWT_SECRET` fail-fast at boot
  (`assertProductionSecrets` in `instrumentation.ts`) — collects all missing
  secrets and throws once with the full list. **This fired on UAT on first
  deploy**, proving UAT had been signing upload tokens with the hardcoded
  source-visible dev value. `AGENT_JWT_SECRET` was already set (the error listed
  only the one).
- Calendar stub no longer fabricates plausible free/busy data — returns the
  already-existing `"unknown"` shape, which lights up the existing hatched
  "availability unknown" UI rather than inventing new UI.
- LiveKit provider failures now logged (`errName`/`errMessage`/`errCode`/
  `errStatus` only, never the raw error — verified by a planted-secret
  regression test). Missing config now throws instead of silently no-opping.
- GCS write failures logged with the same discipline.
- Upload token moved from the URL path to an `X-Upload-Token` header
  (`77e36728`) — the 451-char token exceeded IIS's 260-char path-segment limit,
  which is what broke uploads on-prem.

**Features**
- Unread messages divider (resolved against complete, not stale-cached data;
  clears on own send).
- Per-channel composer draft persistence.
- Pane-wide drag & drop upload.
- Failed-upload retry (file stays staged with caption).
- Leave channel/group, with copy differing for public channel vs private group.
- Mark-all-read / clear-all in Activity; `NotificationBell` retired.
- Discover channels entry point restored to the sidebar header.
- Calendar event edit + delete.
- Voice typing (Web Speech API).
- Last seen with mutual privacy.
- Notification/badge suppression for the open channel + square avatars
  (`0a6575dc`) — you were being notified about the conversation you were reading.

**Infrastructure / correctness**
- Gateway fan-out delivered `.local` per replica — fixed N-fold duplicate
  notifications (two replicas = two notifications). Verified with a real
  two-instance test and a negative control.
- WebSocket-only transport, removing the polling-handshake session-affinity
  requirement (commit `3607c219`).
- Vitest now loads `.env.local` (it was reading `.env`, which doesn't exist) —
  recovered `notifications/settings/route.test.ts`, which had never run.
- Vitest workspace subpath-export resolver — recovered
  `SettingsModule.test.tsx` (12 tests), silently unrunnable since the
  `common_setup75` merge.
- Privacy-switch fast-toggle revert fixed.
- MessageList/Composer key collision fixed — **this was a user-visible bug**, not
  cosmetic: a private DM's messages rendered inside a different conversation.
- `.gitignore` pattern `uploads/` was silently excluding
  `app/api/uploads/**` from every build. Root cause of the multi-day UAT upload
  outage; the pattern never matched its intended target (`.uploads`) either.

**RBAC / access**
- App access asserted on the **API surface** (`28d37ccf`) — `withAuth` verifies a
  JWT and an orgId and nothing else, and middleware skips `/api/*`, so the only
  gate was the dashboard layout, which route handlers never run. Any same-org
  user without QuikChat could drive every QuikChat API while the UI refused to
  load for them. Cached 30s; `session/validate` stays uncached so a revoked user
  can still learn they were revoked.
- **`App`-row boot assertion** (`28d37ccf`, edge-bundle fix `51dbcd84`) — with no
  `App` row for slug `quikchat`, `userCan()` is false for everything and the app
  still serves chat, silently shedding every permission-gated feature. Throws in
  production only when the row is *definitively* absent; a failed query logs and
  continues, because a DB blip must not become a crash loop.
- **`isDefault` convergence** (`e77317c7`) + the **`ensureSeeded` ordering fix**
  (`db659ee3`) — the seeder's demote-before-create cleared the flag under
  concurrency, leaving zero defaults, which made the Admin Portal preselect
  **admin** for every new invitee. The repair then shipped unreachable: it sat
  below `ensureUserRole`'s fast-path return, so it only ran on orgs that did not
  need it. Same lesson as the presence race — fixed at one layer, still broken at
  the other.
- **Zero-defaults paths closed** (`28d37ccf`) — PATCH clearing the last default
  and DELETE removing the default role both 409 now; POST demote+create is
  transactional so a failed create cannot leave zero.
- **Invite error distinction** (`28d37ccf`) — one sentence ("may have expired,
  been revoked, or reached its limit") was shown for *every* failure, including
  wrong-org and no-app-access, where it is simply false. The server already sent
  four accurate messages; the page was discarding them.
- Roster fanout on **leave / remove / role-change** (`85775886`) — the "left the
  chat" system message fanned out while the member list did not, so the two
  visibly disagreed until a refetch.

**Realtime**
- **Gateway presence race** (`fb43984c`) — a socket that died *during* the
  connect handler was added to the presence set and never removed, because the
  `disconnect` listener was registered after four DB round-trips. The orphan
  never aged out either: every later socket's `pexpire` refreshed the TTL under
  it. Net effect, the user's real last tab closed and no `presence:lastseen:`
  write and no `offline` broadcast ever happened.
- **`refresh()` was `pexpire` alone** (`fb43984c`) — a no-op on an already-expired
  key, so a client whose heartbeat lapsed stayed connected but permanently
  invisible to `onlineUserIds`, with nothing able to put it back.
- Reconnect indicator **unhidden** (`85775886`) — it was fully built and then
  killed by a `display: none` in a "hidden chrome" CSS rule. With polling
  fallback gone there is no degraded mode left, so silence was the worst option.

**Features**
- **`/api-docs`** with app-access gating (`8fc56f96`) — the spec describes
  unvalidated request bodies; it is a reconnaissance document, not a marketing
  page, so the route checks entitlement explicitly rather than inheriting it.
- **Scroll-back pagination** (`f3a869e4`) — `prependOlder` and the `before`
  cursor existed and were never called, so history was unreadable. Ships with a
  compound `(createdAt, id)` cursor (a createdAt-only cursor silently skips one
  of two messages sharing a timestamp at a page boundary), divider landing, and
  an `overflow-anchor` fix for a double-count.
- **Channels/Groups vocabulary** (`def52036`) — see §2.
- **Meeting location / all-day / optional attendees** (`d707af1c`,
  schema `63735b13`) — all-day is stored midnight-UTC with an exclusive end and
  rendered from UTC parts; storing it correctly is only half the fix, since
  `toLocaleDateString` still shows the 13th to a UTC−5 viewer.

**Tooling**
- `LIVEKIT_URL` / `QUIKIT_URL` passed as build-args into the CSP bake
  (`3ac500eb`) — they were baked as placeholders, silently omitting LiveKit from
  `connect-src`.
- **Dead-controls sweep** (`1b311ed3`) — every control that did nothing was wired
  or removed.
- **`errorFields` consolidated** (`85775886`) — one implementation, four call
  sites, with a planted-secret test; raw `{ error: e }` logging can serialise
  whatever the throw site attached.
- **eslint config fixed** (`674a1955`) — it set `argsIgnorePattern` but never
  `varsIgnorePattern`, so the `_`-prefix convention the code follows was flagged
  as errors for function variables. Four of the five "pre-existing lint errors"
  were correct code.

**Documentation**
- `docs/openapi.yaml` — OpenAPI 3.0.3, MVP surface, passes `redocly lint` clean.
- `docs/MOBILE_INTEGRATION_GUIDE.md` — auth model, realtime contract, upload flow.
- This app's `docs/` are now tracked (`d106469e`) — the root `*.md` ignore rule
  had been silently excluding them, so every doc here was untracked.
- Both committed in `8fc56f96`.

---

## 🔴 0. Blocking — mobile auth is unsolved

Found while writing the OpenAPI spec, and it outranks everything else on this
list for the mobile workstream.

There is **no bearer-token, PKCE, or non-cookie auth path** in `@quikit/auth` or
QuikChat. Everything resolves via `getToken()`/`getServerSession()` against a
NextAuth cookie — no `Authorization`-header fallback anywhere.

Two real precedents exist, neither directly usable:
- `docs/MOBILE_FLUTTER_COOKIE_AUTH.md` (built for quikinfra's Flutter app)
  prescribes carrying the NextAuth cookie via a cookie-jar bridge, and
  **explicitly lists Bearer-only auth as "what NOT to use."**
- `apps/quiktrack` has a real `POST /api/v1/token` (email+password → 1hr HS256
  JWT), built app-locally, outside the shared package, and per quiktrack's own
  CLAUDE.md not liftable without its integration owner's sign-off.

**Needs a decision from whoever owns `@quikit/auth`.** A React Native app cannot
start on a clean design until this is settled — the spec documents endpoints
accurately but a developer reading it still cannot log in.

---

## 1. Build queue — in order

| # | Item | Note |
|---|---|---|
| 1 | **Link Preview** | De-risked — `quiklms/lib/ssrf.ts` is a production-grade SSRF guard (validates resolved IP; blocks RFC1918/loopback/link-local/CGNAT). Copy in, add OpenGraph fetcher + card. |
| 2 | **Audit Logs** | Confirmed absent. Platform `AuditLog` exists. Needs scope: which actions are auditable? |
| 3 | **Hover toolbar overflow** | Reply/pin/more toolbar clips outside the pane for single-character messages. |
| 4 | **Multi-calendar switching** | `fetchCalendars`/`patchCalendar` exist with routes and no callers. (Edit/delete now shipped.) |
| 5 | **Make silent env fallbacks loud** | `SFU_MODE`, `RUNTIME_MODE` warn only when *misconfigured*, not when absent. (Calendar's is now handled.) |
| 6 | **SSO silent fallback** | Partially-set `QUIKIT_URL`/`CLIENT_ID`/`CLIENT_SECRET` silently swaps to local credentials login; the code comment admits this causes a login loop in prod. Reported during the secrets work, deliberately not fixed — it's shared-auth territory. |

---

## Settings toggles — removed, and who owns what happens next

All seven "fake" toggles were **removed**, not wired: none had a persistence
column and none had a consumer, and a toggle that persists a value nothing
reads is the same bug in a new place. What is left needs an owner:

- **Four desktop toggles → `quikchat-desktop/`, not us.** Auto-start, open in
  background, keep running on close, and register-as-workspace-app are Electron
  **main-process** settings. `window.electron` (see `types/electron.d.ts`)
  exposes `unread`, `deepLinks` and `notifications` — and nothing for any of
  them, so in a browser they could never do anything. **These are not "too big";
  they are someone else's repo.** The ask is concrete: the desktop preload must
  expose get/set for the four, after which the web side is a small settings
  panel. Until then, re-adding them here is re-adding a lie.
- **Read receipts + typing indicators → a real feature, not a wiring job.**
  Honouring them means the server suppressing read-receipt fan-out and typing
  events per user, AND every other client respecting the sender's choice.
  Server + gateway work; needs a design before an estimate.
- **Confirm-on-leaving-a-meeting → no consumer to hook into.** The only
  leave-confirm in the app is `InfoDrawer`'s CHANNEL leave. If we want this, the
  call UI needs a leave confirmation first.

Privacy now holds `shareLastSeen` alone, which is genuinely wired
(`PUT /api/me/presence`). The "System" and "Meeting" sections emptied entirely
and were removed with their headers.

---

## Meeting flow — field inventory (the answer to QA's list)

**Read this before estimating any "add field X to meetings" ticket.** There are
**two unrelated models**, and a schema grep will find the wrong one:

- **`QcMeeting` + `QcMeetingAttendee`** — what the chat meeting flow creates
  (ConversationHeader → `SchedulingModal` → Graph → meeting card). This is the
  one QA filed against.
- **`QcCalendarEvent`** — the S17 personal calendar. What CalendarModule's
  "New meeting" creates. No attendees, no Graph event, no chat card.

| Field | `QcMeeting` | `QcCalendarEvent` | Graph (`microsoft.ts`) | Verdict |
|---|---|---|---|---|
| **agenda** | ✅ `description` | ✅ `description` | ✅ sent as `body.content` | **Free — already persisted.** Was labelled three ways in one control; settled to "Agenda" (Aug 2026). |
| **location** | ✅ | ✅ `location` | ✅ `location.displayName` | **Done in code** (`d707af1c`) — SQL pending on UAT |
| **allDay** | ✅ | ✅ `allDay` | ✅ `isAllDay` | **Done in code** — stored midnight-UTC, exclusive end, rendered from UTC parts |
| **recurrence** | ❌ | ❌ | ❌ not sent | **Still a program.** Graph `recurrence` is a nested pattern/range object, not a scalar, and exceptions need their own storage. |
| **attendee required/optional** | ✅ | n/a | ✅ `type: "optional"` | **Done in code** — the `microsoft.ts` hardcode is gone |

> ⚠️ **The two-model trap is now sharper, not gone.** Both models carry
> `location` and `allDay`, so a schema grep finds them twice and neither hit
> tells you which flow a ticket means. `CalendarModule`'s "New meeting" still
> creates a `QcCalendarEvent` — no attendees, no Graph event, no chat card.
>
> **This table and §11's are the same facts.** §11 is the QA-facing copy; update
> both or neither. They had already drifted apart once.

**Greenfield — separate programs, no scaffolding exists** (grepped for
poll/recurrence/rrule/best-time): scheduling **poll**, **recurrence**, and
multi-day **"find best time"**. The nearest existing thing is `FreeBusyGrid`,
which *renders* busy blocks but has no suggestion logic — a visualization, not
a solver.

### Meeting join — open rows (from the `/meeting/{id}/join` work)

- **Meeting access is channel-derived, and it should probably be
  meeting-scoped.** The QuikChat join link needs a QuikChat account **and**
  membership of the meeting's channel — the token route requires call
  participation, and participants come from the meeting's attendee list, which
  is itself drawn from channel members. So an external guest invited by email
  and an internal colleague who simply isn't in the channel **fail identically**.
  This is the constraint that limits the value of shipping both links: the
  QuikChat one is narrower than "has an account". A real fix is probably
  meeting-scoped access (an attendee can join the call without being a channel
  member) and is a bigger design question than a session — **not solved, filed
  deliberately.**
- **Starting a group call marks every channel member as being on a call**,
  whether or not they ever open it — `createCall` inserts a `QcCallParticipant`
  per member in `connected` state, and its one-call-per-user guard then blocks
  every one of them from starting or joining any other call until it ends.
  Pre-existing, and previously rare because group calls were started by hand.
  **A working meeting-join link makes it routine** — expect it several times a
  day once calendar invites carry the link. The meeting path narrows the blast
  radius (participants are attendees, not all channel members) but does not fix
  the underlying rule.
- **The race is reasoned, not covered.** `getOrStartMeetingCall`'s claim relies
  on Postgres row locks serialising two conditional `updateMany`s. The unit
  tests use mocked Prisma and prove branch logic only. Real verification needs a
  DB-backed test (blocked: no Postgres in CI) or a two-context Playwright spec.

### Related defects found while inventorying

- **CalendarModule's "New meeting" is not a meeting, and fabricates a join
  link.** `CalendarModule.tsx` sets
  `joinUrl: "https://meet.quikchat.dev/new"` — a hardcoded placeholder — on a
  personal `QcCalendarEvent` with no attendees and no Graph event. A user
  schedules what they believe is a meeting, is shown a join link that goes
  nowhere, and **no one else is ever told about it**. Same fabrication pattern
  the stub provider was deliberately cleaned up to avoid. Should be fixed or
  the control relabelled; **do not let this queue behind the 11 QA items.**
- **Attendee picker is channel-members-only.** The new filter narrows the
  candidates already passed in. Widening to org-wide search (`UserPicker`
  already does debounced search against a `q` endpoint) changes *who can be
  invited*, which is an RBAC Phase 3 product decision — deliberately not taken.

### Regression we caused, and fixed (Aug 2026)

Setting `CALENDAR_MODE=microsoft` made `microsoft.ts` throw for any organizer
without a `QcCalendarConnection`; `calendar.service` relays that as a 502 and
the modal rendered the provider's string verbatim. Under `stub` it could never
fire, so **every unconnected user** started failing to create meetings the
moment the mode flipped. `SchedulingModal` now reads `["calendar-connection"]`
(cached, invalidated by Settings on connect/disconnect) and offers a
**"Connect your Microsoft calendar"** action instead. Non-blocking, and the 502
path is still handled because a connection can be revoked between check and
submit.

---

## 2. Channels vs Groups — the derived-label rule

**Shipped** (`def52036`). No schema change; the label is derived from two columns
that already existed. Kept here because this table is the current rule and every
future surface needs it — `type` alone cannot tell a Channel from a Group.

| `type` | `visibility` | UI says |
|---|---|---|
| `group` | `private` | **Group** |
| `group` | `public` | **Channel** |

Implemented as `kindOf()` in `ChannelList.tsx`; `Avatar` takes a three-way
`variant` (`person` / `group` / `channel`) rather than the old `group` boolean.
Conversion between the two is deliberately **not** built — see §9.

---

## 3. Blocked on a decision only you can make

**Search — Global / Message / File (3 Must Have rows).** QuikChat writes an
*emitter*, not a search engine (~1 day). Blocked on: **does chat message content
get indexed at all?** (a) metadata only, (b) public channels only — DMs excluded,
(c) everything with per-entity ACL. Also blocked on Sagar confirming the contract
is final and a service timeline. **File Search needs splitting** — *find by name*
is Sagar's; *ask about contents* is already live through the runtime.

**Smart Replies.** Blocked on cost — fires per inbound message per user. AI
Runtime measuring real per-call cost on UAT. **Killing this row is acceptable.**

---

## 4. Owned by AI Runtime

Requirements sent and acknowledged. Order: **Rewrite → Translate → Smart
Replies**. Runtime is building a generic handler; QuikChat is first consumer.
Hinglish is the real test case for Translate — 30 team-written samples to send
(not real user messages, for data-handling reasons).

---

## 5. Blocked on others / infra

- **IIS `UrlSegmentMaxLength`** — the on-prem IIS/ARR proxy rejects URL path
  segments over 260 chars, which is what broke uploads (451-char token). Routed
  around in-app via the header change, but worth raising as defence in depth.
  **QuikTrack uploads work on identical infra because its upload URL is short** —
  that was the control that proved the diagnosis.
- **OPS ACTION: pass `QUIKIT_URL` and `LIVEKIT_URL` as build-args to the docker
  build.** The code side is **fixed** (`3ac500eb`) — both are now wired through
  the CSP bake. But a Dockerfile `ARG` with a default is only as good as the
  build that supplies it: omit either and the placeholder is baked silently,
  which is how `QUIKIT_URL` shipped as `dummy-quikit.local` and how `LIVEKIT_URL`
  would have omitted LiveKit from `connect-src` and broken calls in prod. See the
  wider ARG-default row in §9 — ten more entries have the same shape.
- **Socket sticky sessions** — being addressed by the websocket-only change;
  confirm the churn stops once deployed.
- **Audio / Video / Screen Share (3 rows)** — code done and merged. Rows move on
  `SFU_MODE=live` + credentials + commercial approval. Not engineering.
- **Calendar is live** — `CALENDAR_MODE=microsoft` is set; the per-user OAuth
  path (encrypted refresh tokens, rotation, HMAC-signed state) is in use.
  **The caveat that remains is per-user connection:** this is per-user OAuth, not
  domain-wide delegation, so **each attendee must connect their own calendar**
  before their availability is real. An unconnected attendee renders as
  "unknown", which is honest but is not the same as free — and organizers
  without a connection get a "Connect your Microsoft calendar" prompt rather than
  a 502 (see the Aug 2026 regression above).
- **Crash Reporting** — correct Sentry seam; depends on `SENTRY_DSN`.

---

## 6. Needs verification — not ours

Email/Password + Google + Microsoft SSO login (3 rows, in `@quikit/auth`) ·
HTTPS/TLS · Backup & DR · Performance benchmarks.
Note `/auth/outlook/callback` is Microsoft Graph *email*, not Entra ID SSO login.

---

## 7. Definition questions

**QuikCRM / QuikTrack / QuikHRMS / QuikFinance integration (4 rows).**
`AppSwitcher` is a generic cross-app *navigation* launcher, identical for every
app. If that counts as integration: Done. If it means surfacing another app's
data in chat: nothing exists. Needs the sheet author's intent.

**Android / iOS (2 rows).** React Native team building it. QuikChat's obligation
is API surface — spec and guide now written; **auth remains the blocker (§0).**

---

## 8. Lower priority — finished but disconnected

| Item | Note |
|---|---|
| `statusMessageOf` | Custom status message: write side works, nothing displays it. |
| Camera picker | `cameraConstraint`/`MEDIA_DEVICE_KIND` unused; `CallControls` still enumerates inline. File comment names this pending "Session B". |

*(The `new-chat` deep link, the non-chromeless `ChannelList` branches,
`mediaKind`, `ColorThemePicker` and the undefined `--qc-r-sm` token were all
cleared in the dead-controls sweep, `1b311ed3`. The reported duplicate
`GET /api/org/roles/[id]/permissions` was not reproducible.)*

---

## 9. Quality items

- **Orphaned group** — the sole admin can leave while members remain, leaving
  nobody able to add members, change roles, or delete. Options: auto-promote
  (WhatsApp) or require-assign-owner-first (Teams). A hard block alone is wrong —
  it traps the last admin. Currently warns in the confirm copy, doesn't prevent.
- **Voice-note input-level indicator** — the app records, uploads and sends a
  completely silent voice note when the wrong mic is selected. No warning. Cost
  real debugging time this cycle.
- **Local-driver download path** — `LocalDriver.createDownloadUrl` still returns
  a token-in-path URL, the same shape that broke uploads. **Latent, not live** —
  UAT runs the GCS driver, which mints direct `storage.googleapis.com` signed
  URLs. Would bite any environment running the local driver behind a proxy.
  Harder to fix than uploads: those URLs are consumed by native `<img>`/`<a>`/
  `<video>` elements that can't attach a header.
- **⚠️ DEPLOY ORDER: meeting fields need their SQL on UAT before the code ships**
  — `QcMeeting.location`, `QcMeeting.allDay` and `QcMeetingAttendee.optional`
  exist **locally only** (applied by hand with `psql`, not by Pravin). Prisma
  hard-errors on `SELECT … "allDay"` against a table without the column, so
  deploying this code first breaks **every meeting read**, not just the new
  fields — the meeting card, the calendar list and `/meeting/[id]/join` all go
  down, not degrade. Code cannot defend against it: the column is in the
  generated client's SELECT list whether or not the feature is used. The SQL
  must run on each environment BEFORE the code reaches it. Same note is in the
  PR description.
- **Recurrence for meetings** — deliberately excluded from the field additions.
  Graph's `recurrence` is a nested `{ pattern, range }` object, not a scalar, and
  exceptions to a series need their own storage regardless of whether the series
  is an RRULE string, a JSON blob or child rows. Sizing it as a column addition
  would commit us to the wrong shape before the decision is made. Poll and
  find-best-time likewise.
- **Group ↔ Channel conversion** — deliberately excluded from the vocabulary
  change. Flipping a private Group to a public Channel makes **the entire
  message history visible to everyone in the org, retroactively** — there is no
  "from here on" boundary in the model. That makes the confirmation copy the
  actual deliverable, not the mutation: it has to state plainly what becomes
  visible and to whom, and it cannot be a generic "Are you sure?". Gated on the
  same `Channel.Public:create` grant as creation. The reverse direction
  (Channel → Group) is less dangerous but not free either — people who joined a
  public channel would silently lose access, so it needs its own copy about who
  gets removed. Needs UX sign-off on both strings before any code.
- **The un-tick of a backfilled grant is still transient** — a real limitation of
  the roles UI as shipped, not an edge case. `backfillRoleGrants` re-applies each
  role's `*_BACKFILL` list on every seed pass, so un-ticking any pair on that
  list in Settings → Roles brings it back within the 5-minute cache window. As of
  now that is **7 of Member's 9 grants** (everything except `Channel.Public`,
  which this session moved to the NEW_ORG-only list, and which is therefore the
  only one an admin can actually revoke). The admin sees the checkbox clear,
  reloads later, and finds it ticked again — with nothing explaining why.
  A real fix needs to distinguish "never granted" from "deliberately revoked",
  i.e. a tombstone table or a per-role seeded-version marker → schema change →
  Pravin. Until then, treat every BACKFILL-list pair as mandatory, and put new
  policy-shaped grants in the NEW_ORG list only.
- **PRODUCT DECISION NEEDED: `GET /api/invites/[code]` is world-readable, and
  that contradicts the accept path's stated threat model.** The preview endpoint
  has no org check and no session requirement — anyone holding a code gets the
  channel's name, description, visibility, member count, expiry and remaining
  uses, cross-org. Meanwhile `acceptInvite` used to collapse "wrong org" into a
  404 specifically *"to not leak the invite's existence to another tenant"*.
  Both cannot be right: either the preview is too open, or the 404 was theatre.
  This session chose honesty at accept (403 "different organisation") on the
  grounds that it discloses strictly less than the preview the user just loaded
  — but the underlying question belongs to whoever owns the invite product, not
  to a session note. **Decide:** (i) keep the preview public — the code IS the
  secret, as its docblock says — and accept stays honest; or (ii) gate the
  preview to same-org callers, which changes the landing page for cross-org
  visitors from "here's the channel" to "not available" and needs UX sign-off.
- **Onboarding outsiders through QuikChat invites (option (b))** — a QuikChat
  channel invite cannot bring in someone who is not already an org member with
  app access: `acceptInvite` writes only `QcChannelMember`, never `OrgMember` or
  `UserAppAccess`. Supporting it means routing through the platform's invite
  model (`OrgMember.status="invited"` + `inviteAppIds` + `invitationToken`,
  auto-accepted in `signIn`/`jwt`), which already exists in `@quikit/auth` and
  already grants `UserAppAccess`. So the real question is not "build onboarding
  in QuikChat" but **"which URL do you hand someone — the platform invite or the
  channel link?"** — a product decision with a cross-package implementation, not
  a QuikChat bug. Note it does NOT remove the need for the error distinctions
  shipped this session: expired / revoked / limit-reached still need to be told
  apart afterwards.
- **`lib/server/rate-limit-gate.test.ts` is dead AND wrong** — it is the only
  test of `withOrgAuth`, it is in `vitest.config.ts`'s exclude list so it never
  runs, and it mocks `getRawSession`, which the wrapper stopped using when it
  moved to `withAuth`. So it asserts against a shape that no longer exists. That
  combination is why the API-surface app-access gap survived review: the wrapper
  every route depends on had no executable coverage at all. `lib/orgAuth.appaccess.test.ts`
  now covers the entitlement gate specifically; the rate-limit and request-id
  assertions still need re-homing into a runnable, mock-backed file.
- **`ensureUserRole` deliberately mixes org-level and per-user seeding** —
  Phase 3 restructuring hazard, recorded so the coupling reads as intentional.
  The function does two things: `ensureSeeded` (org-level — creates roles, tops
  up grants, converges `isDefault`) and the per-user role bind. **The org call
  must stay ABOVE the `if (existing) return` fast path.** It originally sat
  below it, which made the org-level repair reachable only when the *caller* had
  no binding — so it never ran on any org where every user was already bound,
  i.e. every mature org. That shipped: four roles sat at `isDefault = false`
  while the Admin Portal preselected `admin` for every new invitee, with nothing
  in the log because nothing was failing, only nothing running.
  Splitting the two concerns (e.g. calling `ensureSeeded` from `withOrgAuth`) is
  cleaner in principle but costs more than it buys today: it means editing
  `withOrgAuth` **and** `(dashboard)/page.tsx`, duplicating the call at both, and
  `ensureUserRole`'s bind path still needs it regardless. Revisit only if a third
  caller appears. Whoever does it must keep a regression test for the warm-org
  case — `seed.test.ts` › "warm org — every user already bound".
- **`PATCH /api/org/roles/[id]` can clear the LAST default role** — sending
  `isDefault: false` for the only default is accepted, leaving the org with zero
  defaults. That is not a cosmetic gap: zero defaults is precisely the state that
  makes the Admin Portal's invite modal preselect **admin** for every newly
  invited user (it falls back to `data[0]` ordered `isSystem DESC`). Today
  `convergeDefaultRole` repairs it on the next seed pass, so the window is up to
  the 5-minute cache TTL — but the route should refuse the write rather than rely
  on a background repair. Fix is a guard in the PATCH handler (409 when the
  target is the last default and `isDefault: false`). The queued partial unique
  index does NOT cover this: it prevents two defaults, not zero.
- **SQL lives in Teams, not the repo — and QuikChat has never had committed
  DDL.** Three SQL files were committed (`fca9ea2b`, `b24db519`) and then
  **removed** (`40d31ca2`, 603 deletions): Pravin's rule is no SQL in the repo at
  all, Teams only. Recording that here so nobody re-adds them thinking it was an
  oversight. Note this also means a fresh database has never been reproducible
  from this repo — `create_app_quikasset.sql` and `create_app_quikfinance.sql`
  exist under `packages/database/sql/`; there is no `create_app_quikchat.sql`,
  and none of the 22 `app_quikchat` tables has committed DDL.
  **Four scripts are now pending with Pravin, and the order matters:**
  1. **last-seen privacy** — one additive column, independent.
  2. **RBAC substrate** — must be a **no-op** on UAT. If it creates anything,
     UAT has diverged from `schema.prisma` and that is the finding; stop.
  3. **one-default index** — only **after** `convergeDefaultRole` has run a pass,
     because the partial unique index rejects an org that already holds two
     defaults.
  4. **meeting fields** — must land **before** the code deploys, not after; see
     the DEPLOY ORDER row above.
- **`pruneUnknownGrants` makes the registry the sole authority for grants.**
  Every seed pass deletes any `QcRolePermission` row whose `(resource, action)`
  the registry no longer recognises. That is intentional and safe — such rows are
  already inert, because `userCan` validates against the registry before it
  queries — but it means **removing a resource from `permissionsRegistry.ts`
  destroys its grant rows**, org-wide, on the next request. Retiring a resource
  is therefore a data operation, not just a code edit. Reinstating one restores
  the leaf but not the grants.
- **`REALTIME_TOKEN_SECRET` is not in `assertProductionSecrets`.** It *is* in
  `.env.example`, so this is narrowly about the boot assertion: the required list
  is `UPLOAD_TOKEN_SECRET` and `AGENT_JWT_SECRET` only. If it is unset in
  production the gateway cannot verify handshake tokens and **nothing fails the
  boot** — the same silent-degradation shape the assertion was written to prevent
  for the other two.
- **Deep-link `?channel=` races the channels query.** The effect fires
  `selectChannel(initialChannelId)` on mount (the `didDeepLink` ref in
  `ChatWorkspace`, cited by name — the line reference in an earlier revision of
  this doc had already rotted). `captureOpenedUnread` reads
  `qc.getQueryData(["channels"])`, which on a cold mount is `undefined`, so the
  unread snapshot the divider is built from is zero and the divider does not
  render. A comment in that file claims the case is covered; it is not.
- **`NotificationsModule`'s Activity pane cannot reach history.** It renders
  `ConversationView` against the same `["messages", channelId]` cache as the main
  workspace, but **without the pagination props** — those were deliberately left
  optional and wired only in `ChatWorkspace`. So scroll-back works in the chat
  pane and silently does nothing in Activity. *(Unverified: the surface was
  described from memory; confirm which pane before sizing.)*
- **`SettingsModule.test.tsx` does not cover the Settings controls.** Its 12
  tests cover notifications, privacy and roles — the panes Settings *hosts* —
  not the module's own controls. Worth knowing before trusting the count: this is
  the file that was silently unrunnable until the subpath-export resolver fix, so
  it reads as freshly-validated coverage and is narrower than it looks.
- **`prisma db push` is blocked platform-wide, which is why there are zero
  migration rows.** `public._prisma_migrations` is empty — verified. The reported
  cause is drift on `public.SupportTicket_ticketNo_seq` producing **P1014**.
  *(Unverified: nothing in the repo records the failure, and confirming it means
  running `db push`, which was not done. The empty migrations table is the
  confirmed part.)*
- **Collation probe was run against local dev, not Neon.** The reported result
  (`English_India.1252`) is a Windows collation and cannot be Neon's, so whatever
  it proved was about the developer's machine. *(Unverified: no trace of the
  probe survives in the repo — re-run it against Neon before relying on it.)*
- **`postCallSummary` silent branches** — "call not found" / "no channel to post
  to" return with no log line.
- **`PATCH /api/calls/:id` has no test file** — accept/reject/end/timeout/heartbeat.

---

## 10. Structural

- **⚠️ vitest is split 4.1.10 / 3.2.4, and it is fragile but NOT blocking.**
  `common_setup89` upgraded nine-plus workspaces to vitest **4.1.10**
  (`packages/ai-sdk`, `packages/auth`, `packages/shared`, `admin`, `auth`,
  `quikasset`, others) but left `apps/quikchat` and `services/realtime` on
  **3.2.4**. npm hoists 4.x to the root; 3.2.4 gets nested copies whose transitive
  deps (`loupe`, `strip-literal`, …) are never placed, so vitest exits before
  running a single test — `ERR_MODULE_NOT_FOUND`, one package at a time.
  Confirmed with `npm ls vitest`. Not a local corruption and not a bad merge
  resolution: **anyone merging 89 hits it.** Regenerating the lock cannot fix it —
  the conflict is in the `package.json` files, not the lock.
  Two exits: upgrade both workspaces to 4.1.10 (a real 3→4 migration — attempted
  once, and `vitest.config.ts` was then rejected with `code: 'InvalidArg'` in
  `resolvePlugins`, most likely the `yamlRaw()` plugin), or a root `overrides`
  entry pinning 3.2.4 (which drags nine workspaces backwards and is outside our
  scope line). **This belongs to whoever owns 89.**
  Last verified baseline is **142 files / 1318 tests**, post-`common_setup96`.
  **CORRECTED (18 Aug):** an earlier revision of this row said neither suite
  could start. That was wrong. The `ERR_MODULE_NOT_FOUND` failures were a broken
  *install* — incremental `npm install`s layered onto 89's lockfile during the
  merge — not an inherent consequence of the version split. A clean `npm ci`
  repairs it; `node_modules/loupe` is keyed in `package-lock.json` and installed
  at the hoisted root. What remains true: we are the only two workspaces still on
  vitest 3, which makes the nested tree fragile across merges. Worth aligning
  when convenient; the ask upstream is small, not urgent.
- **A lock-file conflict on a merge is not a conflict to resolve — it is a
  question of whose dependency graph you want.** `--theirs` on
  `package-lock.json` imports the other branch's entire resolution, including
  version choices your workspaces never made; `--ours` keeps yours and risks
  missing packages the other branch added. Neither is automatic, and the symptom
  surfaces far downstream as missing modules rather than as a version error.
- **30 excluded Vitest files** — real coverage that never runs, including
  `app/api/uploads/sign/route.test.ts`. The `.env.local` fix (Part A) recovered
  one non-excluded test; the 30 remain. Blocked on a decision: re-home to
  Playwright, or add a test database. **CI has no Postgres service**, so
  un-excluding them would pass locally and fail there.
- **🔴 RAISE WITH THE RUNTIME TEAM: disabling the assistant module orphans
  in-flight approval requests, and it is the trace gap arriving through a
  different door.** `GET /api/ai/requests` is gated on `moduleKey: "assistant"`
  and 404s when the module is off — correct, since an approval request is an
  artefact of the assistant and the only rows a disabled tenant could see are
  historical. But a request already **pending** when the module is switched off
  becomes unactionable: nobody in that tenant can list it, so nobody can approve
  or reject it, **the proposed write executes nothing, and it expires silently.**
  No one in the tenant ever learns it happened.
  That is precisely the gap the terminal-rows change closed from the other
  direction — an unactioned write must remain *visible as unactioned* rather than
  vanishing. Here it vanishes because the surface is gone rather than because the
  list filtered it out.
  **Not only ours to fix, and not only to record:** expiry is the runtime's
  sweep, so the runtime team needs to decide what a disabled consumer means for
  requests already in their ledger — reject-on-disable, notify the requester, or
  hold and surface on re-enable. Weakening our module gate to leak the list is
  the wrong answer; the question belongs upstream. Loosening the gate for
  *pending rows only* is a possible middle path if they want one.
- **The `@sentry/node` v8 pin — the partial-bump pattern, second instance.**
  `common_setup96` moved `@sentry/nextjs` to 10.69.0, hoisting `@sentry/node`
  v10, while `apps/quikchat` still pinned `@sentry/node` 8.26.0. npm nested the
  pin and `tsc` resolved the nested copy — whose declared dependency
  `@sentry/types` was **absent from the tree entirely**, since v9+ folded it into
  `@sentry/core` and nothing in the new tree asks for it. With `Options`
  unresolvable, `NodeOptions` collapsed to `BaseNodeOptions`, and
  `init({ dsn })` failed typecheck. **The error named a type that was not the
  problem**, and `error-tracking.ts` was never wrong — fixed by dropping the pin.
  Same shape as the vitest split: a shared dependency moves for some workspaces
  and not others, and the failure surfaces somewhere unrelated to the cause.
  Two instances in two merges. Worth a dependency check after every
  `common_setup` merge rather than waiting for a symptom.
- **`vitest.config.ts` documents a mechanism that has never existed.** A comment
  states quikchat is "pinned via root package.json overrides". Root `overrides`
  holds only `react`/`react-dom`; what actually pins it is the ordinary exact
  `"vitest": "3.2.4"` in this app's own `package.json`, nested by npm because the
  root hoists 4.1.10. That comment is the origin of the false "local patch"
  belief corrected above. **Third comment this cycle asserting something untrue**
  — `seedRole`'s docblock and the Dockerfile cache-bust note were the others. A
  comment that states a safety or mechanism property is worth verifying, not
  trusting. One-line fix, in scope, not yet done.
- **CI never builds QuikChat — only quikscale.** `ci.yml` runs lint, typecheck
  and test across all apps via turbo, then builds **one** app
  (`cd apps/quikscale && npm run build`, line 109). `next build` for QuikChat runs
  only in `UAT.yml`'s docker image build, i.e. at deploy time. So a QuikChat build
  break survives a **fully green** CI and surfaces only when UAT deploys — which
  is exactly what happened: the branch was un-buildable on origin for several
  commits with lint, typecheck and 1261 tests all passing, and it was found by
  accident. Since fixed (`51dbcd84`); `next build` verified clean locally before
  the `common_setup89` merge. **The CI gap itself remains open.** One line to fix;
  `.github/` is out of scope, so hand it to whoever owns CI.
- **No global line-ending normalisation.** `.gitattributes` exists but pins only
  `*.sh`, `Dockerfile` and `*.Dockerfile` to LF. There is no `* text=auto`, so
  every other file is unnormalised — hence the "LF will be replaced by CRLF"
  warning on nearly every file touched this cycle. Cheap to fix, and it removes a
  permanent source of spurious diffs.
- **`.env.production` does not exist — the silent-default risk is in the
  Dockerfile.** Roughly twelve `ARG`s carry placeholder defaults
  (`NEXTAUTH_URL`, `NEXT_PUBLIC_AUTH_URL`, `NEXT_PUBLIC_QUIKIT_URL`,
  `NEXT_PUBLIC_QUIKCHAT_URL`, `NEXT_PUBLIC_REALTIME_WS_URL` →
  `https://placeholder.com`; `QUIKIT_CLIENT_ID` → `dummy-client-id`;
  `QUIKIT_CLIENT_SECRET` → `dummy-client-secret`; …). Omit a build-arg and the
  placeholder is **baked into the image with no error**. `LIVEKIT_URL` and
  `QUIKIT_URL` were exactly this bug and are now closed (`3ac500eb`); the rest
  are not. A build-time assertion that rejects placeholder values in a
  production build would close the class.
- **CI never fires on working branches.** `ci.yml` triggers on `dev`/`uat`/`main`;
  the team uses `common_setup*`/`UAT`/`Prod`. Filters are case-sensitive — `UAT`
  never matches `uat`, and `dev` doesn't exist. No lint, typecheck, test or
  coverage gate runs on any branch anyone works on. Not ours to fix
  (`.github/` out of scope) — hand to whoever owns CI.
- **Playwright coverage lags.** One spec (last-seen), which earned its keep
  immediately by catching the stale-cache privacy bug that manual two-window
  testing missed. Gaps jsdom structurally cannot cover: drag & drop (mocked
  `DataTransfer`), the unread divider (no layout engine), draft persistence
  (real localStorage).
- **No test catches an unreachable feature.** Every test mounts its subject
  directly, so an unmounted component or uncalled prop passes cleanly. Worth a
  lint rule or a periodic repeat of the sweep.
- **DEP0169 `url.parse()` deprecation warning** — traced to
  `next/dist/server/lib/router-server.js`, called per-request in Next 14.0.4's
  own dev-server routing. Not our code, not our dependencies. Upstream; leave it.

## 11. Meeting scheduling — QA intake (11 items, Aug 2026)

Two models, and conflating them is the trap:
- `QcMeeting` + `QcMeetingAttendee` — the chat meeting flow. This is QA's flow.
- `QcCalendarEvent` — S17 personal calendar, what CalendarModule creates.

| Field | QcMeeting | QcCalendarEvent | Graph | Verdict for the meeting flow |
|---|---|---|---|---|
| agenda | `description` | `description` | sent | **Done** — was one field under three names |
| location | ✅ | `location` | ✅ `location.displayName` | **Done in code** — SQL pending on UAT |
| allDay | ✅ | `allDay` | ✅ `isAllDay` | **Done in code** — SQL pending on UAT |
| recurrence | ❌ | ❌ | not sent | **Still a program** — Graph wants a nested pattern/range object; exceptions need their own storage |
| attendee required/optional | ✅ | n/a | ✅ `type: "optional"` | **Done in code** — SQL pending on UAT |

⚠️ **The two-model trap still applies.** `QcMeeting` now has `location`/`allDay`
too, so a schema grep finds them on *both* models — which is more confusing, not
less. `CalendarModule`'s "New meeting" still creates a `QcCalendarEvent` with no
attendees, no Graph event and no chat card; the chat flow is `QcMeeting`. Check
which model a ticket means before estimating it.

**Status against QA's list**
- #2 agenda — done (settled on one label across both editors).
- #11 attendee search — done (filters channel members). Org-wide search is a
  follow-up, tangled with RBAC Phase 3.
- #4 availability — was the stub honestly reporting `"unknown"`. Fixed by
  `CALENDAR_MODE=microsoft`. **Requires each attendee to connect individually**
  (per-user OAuth, not domain-wide delegation) — unconnected users legitimately
  render as "unknown".
- #1 meeting icon — no dead control; all three entry points have handlers.
  QA's report predates the mode flip, so it was almost certainly CalendarModule,
  which creates a personal event with no attendees and no chat card.
- #3 location, #8 all-day, #9 attendee required/optional — **done in code**
  (`d707af1c`), pending only the UAT SQL. See the DEPLOY ORDER row in §9: the
  columns exist locally only, and the code must not reach an environment before
  the SQL does.
- #5 poll, #6 find-best-time, #7 availability scheduler, #10 recurrence —
  greenfield programs, no scaffolding exists. Size separately; not bug fixes.

**New defect found during intake:** `CalendarModule.tsx:232` hardcodes
`joinUrl: "https://meet.quikchat.dev/new"` on an event that creates no meeting
and notifies nobody. Same fabrication pattern the calendar stub was cleaned up
to avoid.
---

## Approval card + decision relays (18 Aug 2026) — what shipped and what did not

Shipped: `ApprovalCard` (one component, two adapters in `lib/approval-card.ts`),
the "Your approvals" section in Activity, `POST /api/ai/requests/{id}/approve`
and `.../reject`, and the live-turn wiring for `approval_needed`.

### 🔴 RAISE WITH THE RUNTIME TEAM: two gaps, one fix — a generated string persisted on the ledger row

Both need the same thing from the runtime, and neither is a nice-to-have.

1. **`AssistApprovalRow` carries no `summary`.** The SSE frame has one; the
   ledger row does not. The consequence is not cosmetic: **the Activity card is
   the only surface a user reaches after the turn ends**, and it is the one
   showing `quiktrack_create_issue` where the live card showed a sentence. The
   card that survives is the worse card.
   We are NOT synthesising one from `toolName` + `toolInput`. That is precisely
   the coupling `summary` exists to prevent — it would put our guess at another
   app's semantics in front of the user at the moment they authorise a write, and
   it would silently rot every time QuikTrack renamed an argument. So the card
   falls back to the raw tool name, which is honest and poor.
2. **There is no outcome string.** A terminal row renders its `status` and, on
   `failed`, the target app's `error`. What it should say is what actually
   happened — "Created QTRK-902". It must come from the **list**, not only from
   the approve response: a decision answered on one device would otherwise show
   nothing on another, and nothing at all after a reload.

Seams are left for both in `ApprovalCardModel` and `SettledLine`, and **no field
names were invented** — when the runtime ships them, the adapters gain two lines.
Documented as an open ask at the foot of `docs/RUNTIME.md`.

### Activity is not a paginating surface, and this did not make it one

`GET /api/ai/requests` carries `limit`/`offset` and returns `total`, but Activity
has no pagination anywhere (the feed's "See all activity" belongs to the
notification store, not to a page cursor). `ApprovalsSection` asks for the
relay's default page and, when `total` exceeds what came back, renders
`Showing N of M` — no load-more control. **If that caption starts appearing
routinely, that is the signal to give Activity real paging, not to raise the
limit.** Silent truncation was the alternative and it reads as "these are all of
them", which on a list of pending writes is the one thing it must not say.

### Fixed here: the stub's `toolInput` had no snake_case key

`stub.ts` was written so "a consumer that normalises interiors breaks against the
stub rather than only against UAT" — but every fixture interior was already
camelCase (`projectId`, `assigneeId`), so the guard was decorative and a
normalising consumer passed every local run. `custom_field_7` is now on the
pending fixture and asserted. A fifth fixture row was also added whose approval
answers `status: "failed"` at HTTP 200 (`STUB_FAILING_REQUEST_ID`) — that is the
single most misreadable response on this surface and it was previously
unreachable locally. The stub also latches decisions per instance so a second tap
gets a real 409; approval is deliberately not idempotent and had no local
expression of that before.

### Still open

- **The persisted channel-visible card** — the fast-follow. Today the live card
  is ephemeral: dismissing it, reloading, or opening the channel on another
  device leaves Activity as the only route back to the request. That is
  deliberate for v1 (a card in history would outlive the request it describes),
  but it means the chat transcript has no trace that a write was ever proposed.
- **`RATE.approvalDecision` is a flood ceiling, not a concurrency guard.** 30/60s.
  The double-tap guard is the card's synchronous ref latch plus the runtime's
  409 — a rate limit that let the second tap through 29 times before refusing
  would be no guard at all. Do not "harden" one by tightening the other.
- **Module-gate consequence, unchanged and still upstream:** a request already
  pending when the assistant module is switched off is now unactionable through
  three routes rather than one. Same question, same owner — see the row above.

---

## Approvals, follow-up (18 Aug 2026) — outcomeSummary, cancelled, unknown-status audit

Three runtime changes landed the day after the card shipped. Wired
`outcomeSummary`, added `cancelled`, and audited unknown-`status` handling.

### The unknown-`status` audit came back better than expected — and the reason is reusable

The worry was that `status` might have the same hole `riskClass` had: an
unrecognised value falling through to a pending-shaped card, so `cancelled`
arriving before we knew about it would have shown Approve/Reject on a request
nobody can action. **It would not have.** Verified by driving raw rows through
the adapter into rendered DOM: `cancelled`, `quarantined`, `PENDING`, `pending `
and `""` were all non-actionable already.

The reason is structural, and worth remembering because it decides how much
defensive code a future field needs:

- **`riskClass` needed a normaliser** because the safe value (`high_risk`) lives
  *inside* the known set. An unfamiliar value has to be actively mapped onto it;
  left alone it renders unstyled, which reads as mild. So: normalise, plus a CSS
  base rule as the second enforcement.
- **`status` needed nothing** because the safe behaviour is "not actionable", and
  every gate is a *positive check for `"pending"`* rather than a denylist of
  terminal states. Unknown values fall safe by construction, at each gate
  independently.

Rule of thumb: when the safe default is inside the known set, you need a
normaliser; when it is outside, a positive check for the one live value gets it
free. Written up next to both gates in `lib/approval-card.ts` and
`contracts.ts`.

Two real findings survived the audit:

1. **`status: ""` rendered a blank outcome box.** Small, and worse than it
   sounds: an empty bordered box reads as a rendering bug rather than a data
   problem, and sends whoever hits it looking in the wrong place. Now
   `String(status).trim() || "Unrecognised state"` — `String()` because the
   switch is exhaustive over the union so TS narrows to `never`, while the whole
   point is that non-union values (including non-strings) arrive at runtime.
2. **No test drove the property end-to-end.** Two existed and each assumed the
   other's guarantee — the adapter test checked `viewerMayAct === false`, the
   card test handed the card a model already marked terminal. Neither would catch
   a regression loosening both. **This is a repeat pattern here** (the
   `olderThanCursor` composition test, the `ensureSeeded` ordering,
   `SettingsModule.test.tsx`). Now covered raw-row → adapter → DOM, including a
   positive control asserting a `pending` row still *gets* buttons — otherwise
   "no buttons" passes trivially forever.

### 🔴 NOT OURS: cancel-pending

The runtime exposes an endpoint to cancel a pending request, and we are not
calling it. It needs an **org-admin user token**, and QuikChat reads module state
but does not own toggling it — that is the admin portal's job. Wiring a cancel
button here would put an administrative action behind a chat surface with the
wrong credential, and would imply QuikChat can disable a module it cannot
disable. If cancel-on-disable is wanted, it belongs next to the toggle that
causes it. Related: the pending-requests-orphaned-on-disable row above, which is
the same question from the other side.

### `total` was correct code that could never fire

`ApprovalsSection`'s "Showing N of M" footer is driven by
`total - requests.length`. The live endpoint used to return the **page size** as
`total`, so that was always 0 and the footer never rendered. Our stub modelled it
as the unpaged count from the start, so the behaviour was right locally and
unreachable in UAT — a case where the stub being stricter than the real service
hid nothing but also proved nothing. The runtime now returns a real `COUNT(*)`
and the footer starts working with no client change. Asserted explicitly in
`approvals.test.ts` so the stub cannot drift back.

### Still open

- **The proposal `summary` on the ledger row** — the last remaining runtime ask,
  down from two. Generator exists, unwired, ships with emission. Until then the
  Activity card shows a raw `toolName`. Not synthesising one; see RUNTIME.md.
- **The persisted channel-visible card** — unchanged, still the fast-follow.

---

## New chat for the AI conversation (20 Aug 2026) — what shipped, and two findings

Shipped: a context-reset marker. `POST /api/channels/[id]/ai-reset` writes one
`SystemActivity` row carrying `data.kind = "ai_context_reset"`, and `buildHistory`
stops the pushed `history` at the NEWEST such row. Nothing is deleted.

The option was chosen on one measurement, not on taste: the runtime holds no
conversation state of its own. `docs/RUNTIME.md` says `channelId` is telemetry
only, the wire body carries no thread handle, and the runtime team has been
getting clean runs all week by hand-deleting `QcMessage` rows — which only works
if pushed `history` is the entire context. A marker can therefore express
everything deleting the rows expressed, and costs no migration: the row type,
the fanout, the `SystemActivity` divider renderer and the `buildHistory` filter
all already existed.

### 🔴 TELL THE RUNTIME TEAM: hand-deleting QcMessage rows strands the KB scope

The week-long workaround has a cost nobody would predict from "clear the chat".
An AI chat's retrieval scope is not stored as conversation state — it is derived
by `kb.service#listChannelKbSourceFileIds`, which queries **Media messages** in
the channel carrying an ingest marker. Delete the messages and the documents stay
ingested in the runtime's KB while the chat silently loses every pointer to them:
the "This chat / All my docs" control empties, and scoped retrieval quietly
becomes a plain turn with no error anywhere.

This is the strongest argument for the marker over clear-in-place, and it applies
retroactively — any AI chat cleared by hand this week has lost its doc scope and
will need those documents re-added. Worth checking before anyone else reaches for
`DELETE FROM`.

### Unreachable: `leave()`'s AI-chat branch

`channels.service#leave` has a `channel?.type === "ai"` branch that deletes the
channel, its members and all its messages. Nothing can reach it: `InfoDrawer`
gates both **Leave** and **Delete** on `isGroup`, so an AI chat exposes neither
control. Server code with no caller — the same family as the thirteen the sweep
found, and found the same way (reading the server while costing a feature, not by
any test).

Filed, deliberately not wired. "New chat" is the reset users actually asked for,
and wiring a delete-everything button next to it would offer a destructive
shortcut to a problem that no longer needs one. If it is ever wired, the KB-scope
consequence above applies to it too.

---

## Persisted approval card (20 Aug 2026) — what shipped, and the one fact in two places

The approval card is now a real message (`MessageType: "ApprovalRequest"`),
written at proposal time by the assist relay and patched when a decision lands.
The ephemeral live-turn card is unchanged and still there; the two **hand over**
rather than stack — see `liveApprovalIsPersisted` in `ConversationView`.
Collapsing them into one is still the follow-up.

### The finding that decided the design

`GET /ai/requests` is scoped to the caller by the minted token and there is no
fetch-one endpoint. **An observer's ledger does not contain the requester's row.**
So "store a pointer, render from the ledger" — the obvious design, and the one
`Meeting` uses via `injectMeetingData` — was never available for the
channel-visible card. Not slow: absent. The 24h terminal-row retention rules it
out a second time, since the message outlives the ledger entry.

Hence a snapshot in `data`, and hence the section below.

### 🔒 Security: `messages.send` had no type allow-list

`POST /api/channels/[id]/messages` hands its `readJson` body straight to
`send()`, which did `dto.type ?? "Text"` with no validation. That was harmless
only by accident: a forged `Meeting` renders empty because its card needs a
server-hydrated projection. A card rendering from a client-supplied `data`
snapshot removes the accident — an accepted forged `ApprovalRequest` would show
"Priya approved — QUIKSC-290 created" in any channel the sender belongs to. The
buttons would 404 (the runtime scopes decisions on its own token) so nothing
would be written; the outcome line is the lie, and that is enough.

`CLIENT_SENDABLE_TYPES` now gates `send()`, which also closes `Delete`.
`forward()` refuses `ApprovalRequest` for the same reason. Both are pinned by
`lib/server/messages-type-guard.test.ts` — that file IS the enforcement; delete
it and a one-line change can reopen the hole silently.

### Which copy of `status` is authoritative

The message is authoritative for **display**; the runtime stays authoritative
for **decisions**. That asymmetry is forced, not chosen, and it is what makes
divergence produce a wrong screen and never a wrong write — every approve/reject
still goes to the runtime, which 409s a stale one.

They CAN diverge: any decision not taken through our relay (a direct runtime
call, another client, the expiry sweep, a module-disable cancel). Three layers
bound it:

1. **The card's expiry clock** — off `expiresAt`, no server involved. Covers the
   commonest case (expired unactioned) for free.
2. **`POST /api/channels/[id]/approvals/reconcile`** on channel open, gated on
   one of the viewer's own still-pending cards being loaded. The requester is
   the only person the token-scoped ledger answers for, and running it repairs
   the card for every observer, because the fanout goes to the channel.
3. **`unconfirmedAt`** — set when reconciliation sees the whole ledger and the
   request is not in it. The card then says "This may already have been
   answered — we couldn't confirm what happened" instead of offering buttons.

Bound: drift lasts until the requester next opens the channel, and at most the
24h the ledger retains. Past that the card says it does not know. **It never
guesses `expired`** — that would be the plausible-looking wrong value nobody
notices, which is the `isDefault` shape this whole design is avoiding.

⚠️ The reconciler concludes "gone" from ABSENCE, so absence has to be real. A
failed ledger read never reaches it (the route throws first) and a partial page
sets `ledgerComplete: false`, which permits repairs but forbids conclusions. Two
tests in the route suite and one in the service suite exist only for this.

### Reachable in the stub, not only in a test

`assist()` could not emit `approval_needed` at all before, so the entire
proposal path was UAT-or-unit-test only. It now parks a write on a `/approve`
prompt. `STUB_AGED_REQUEST_ID` (`/approve-aged`) parks one whose ledger row is
**deliberately missing** — its absence IS the fixture, modelling a request aged
out of the 24h window, which is the only route to the `unconfirmed` card. Do not
"complete" the fixture set by adding a row for it; `parked.test.ts` guards that.

### 🔴 STILL WITH THE RUNTIME TEAM — one ask, now three fields

Unchanged and still blocking a sentence the runtime themselves asked for
("Priya approved — QUIKSC-290 created"):

- **proposal `summary` on `AssistApprovalRow`** — the original ask. The persisted
  card sidesteps it (it captures the sentence off the SSE frame, the one moment
  it exists), so **Activity is now the only surface still showing a raw
  `toolName`.** Narrower than before, not fixed.
- **an actor display name.** `decisionBy` is a raw user id, which is why
  `decidedByViewer` is a boolean — printing `u-7f3a91` at someone is worse than
  the passive voice. Nothing here can name Priya.
- **`decisionAgentId`.** Named as live in the brief but **present nowhere in our
  tree** — not on `AssistApprovalRow`, not on `AssistApprovalDecision`. It is the
  missing divergence DETECTOR: a decision carrying no QuikChat agent id is known
  to have been taken elsewhere, which would turn layer 2 from a blind sweep into
  a positive signal.

### Still open

- **Collapsing the two cards.** They hand over correctly; one of them should
  eventually stop existing.
- **The double unread.** A proposal and its decision are a message and a patch,
  so only the proposal bumps `unreadCount` — but it does bump it, for every
  observer. Accepted; bound it later rather than lose the proposal trace.
- **`RUNTIME_TOKEN_DEBUG`** — still dormant in the tree, left until the runtime
  team confirms the tool-catalog question is closed. Removing it drops 5 tests.

---

## Naming the approver, `decisionAgentId`, and the debug flag (21 Aug 2026)

### The runtime cannot name people, and should not learn how

Approvals reach the runtime on an agent JWT carrying only `userId`/`orgId`;
naming a person means a lookup against a platform table they do not own. Line
drawn: **they say what happened, we say who.** `decisionBy` is resolved against
the channel roster the card already holds.

Only ONE of the three card surfaces needed it, and the reason the other two did
not is worth keeping:

| Surface | Roster? | Third-party name reachable? |
|---|---|---|
| Live turn | yes (`channel.members`) | No — the actor is always the viewer; "you" wins |
| Activity | **no**, and no channel either (`AssistApprovalRow` has no `channelId`) | No — the ledger is token-scoped and v1 has requester == approver, so `decisionBy` is the viewer or null. A name would be unreachable code, not a gap. |
| Persisted card | yes (`actions.members`) | **Yes — the only one.** |

When approver ≠ requester ships, Activity becomes reachable and has no channel
to resolve from. Seam left in `fromApprovalRow`; deliberately not built for.

`decidedByViewer` stayed a boolean and gained `decidedByName` beside it, so the
precedence is viewer → name → passive. The rule the boolean existed to enforce —
**never print the raw id** — is unchanged and now covers three more ways to fail:
a departed member, no roster at all (`MessageRowActions` is optional the whole
way down from `MessageList`), and a blank `displayName`.

The assistant bot is excluded explicitly. It IS in `channel.members`, so an
agent-decided row would otherwise render as a colleague named "Assistant" on the
one surface whose entire purpose is who-decided-what.

### The subtlety that took two attempts: `withOutcome`

The actor line suppresses the fallback `statusLabel`, or the card states one fact
twice. But suppressing a line only works if something still carries what it said,
and **approving is not the same event as executing** — the whole reason `failed`
exists is that the first can succeed and the second fail. So `"X approved this"`
alone silently drops the outcome on exactly the rows with no `outcomeSummary`.

First fix folded the outcome in unconditionally — which put our generic wording
back on every row the runtime had already described properly, the same redundancy
one layer along. A pre-existing test caught it (`not.toMatch(/action completed/i)`
when a summary is present). The clause now appears only when the sentence is
standing in for the suppressed label:

```
no outcomeSummary → "You approved this — the action completed"
   outcomeSummary → "You approved this"  +  "Created QTRK-903 in QuikTrack."
```

One wording change to an existing assertion: the settled line for your own
rejection now reads "You declined this" rather than the passive "Rejected". The
state is pinned by `data-outcome` instead, so that test no longer depends on
wording at all.

### `decisionAgentId` is not a divergence detector

We asked for it as one. It cannot be one, and the reason is structural: the
reconcile pass only examines cards where OUR copy is still `pending`, and a
pending card has no decision on our side to compare against. The field can only
be populated on the ledger copy of a row we have **already decided to patch**, so
it changes no repair, no PATCH count, and no `unconfirmed` trigger (that fires on
a row's absence; this is a field on a present row).

Wired anyway, for the thing it IS good for: at the moment we patch, it separates
"our own `applyApprovalDecision` failed silently" (our bug) from "decided
elsewhere" (expected). Those were indistinguishable in the logs. **A log
dimension, never control flow** — see the note on the contract, which exists so
nobody wires it as a branch later.

### Reachable in the stub

`STUB_DEPARTED_REQUEST_ID` / `/approve-departed` parks a write whose ledger row
is decided by `u-departed-9f21` — a user in no roster anywhere. Reconcile patches
the card from it, the name fails to resolve, and the passive fallback renders.
That path is now reachable by hand in seconds instead of requiring someone to
actually leave the org. It joins the other two shaped-by-what-they-lack fixtures;
`parked.test.ts` guards all three against being "completed".

### Removed

`RUNTIME_TOKEN_DEBUG` and `logRuntimeTokenPayload` are gone — flag, helper, call
site, the 5-test describe, and the now-unused `errorFields` import. The 4 claim
assertions in `token.test.ts` stay; they were always the durable half, and the
comment there now says so without pointing at a flag that no longer exists.
