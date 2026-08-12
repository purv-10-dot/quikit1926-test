# QuikChat — Backlog

Reconciled against the 47-row **Production Go-Live Checklist**, the **reachability
sweep**, and items found during implementation. Updated 10 Aug 2026.

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
- Upload token moved from the URL path to an `X-Upload-Token` header. **Written
  and tested; commit status unconfirmed as of the last `git status`.**

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
- Notification/badge suppression for the open channel + square avatars.
  **Done; commit status unconfirmed.**

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

**Documentation**
- `docs/openapi.yaml` — OpenAPI 3.0.3, MVP surface, passes `redocly lint` clean.
- `docs/MOBILE_INTEGRATION_GUIDE.md` — auth model, realtime contract, upload flow.
- **Commit status unconfirmed.**

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
| 1 | **Swagger UI at `/api-docs`** | Prompt written, not yet built. Interactive "Try it out" works in-browser via the session cookie. **Must carry a banner** stating mobile/native auth is unresolved — otherwise a working "Try it out" implies auth is solved when it isn't. |
| 2 | **Scroll-back pagination** | `prependOlder` + the `before` cursor exist and work; `fetchMessages` is never called with a cursor. Opening a conversation only ever loads the newest page — **history is unreadable**. Largest remaining functional gap. |
| 3 | **Channels/Groups vocabulary + sidebar grouping** | See §2. Prompt written, not sent. Absorbs several smaller items. |
| 4 | **Seven fake Settings toggles** | Read receipts, typing indicators, auto-start, open-in-background, keep-running-on-close, register-as-workspace-app, confirm-on-leaving-meeting. All local `useState`, no effect. Wire them or relabel honestly. Highest trust damage per line. |
| 5 | **Four inert `CallsModule` buttons** | Chat / Org chart / Video call / Call have no `onClick`. `channelId`/`otherUserId` already in scope. |
| 6 | **Mount `RemovedFromCallToast`** | A kicked participant's window just closes with no explanation. The toast exists and is tested. |
| 7 | **Realtime connection-status indicator** | A dead socket and a live one are indistinguishable. `connected` already exists in `ChatWorkspace`. More consequential now that polling fallback is removed. |
| 8 | **Link Preview** | De-risked — `quiklms/lib/ssrf.ts` is a production-grade SSRF guard (validates resolved IP; blocks RFC1918/loopback/link-local/CGNAT). Copy in, add OpenGraph fetcher + card. |
| 9 | **Audit Logs** | Confirmed absent. Platform `AuditLog` exists. Needs scope: which actions are auditable? |
| 10 | **Hover toolbar overflow** | Reply/pin/more toolbar clips outside the pane for single-character messages. |
| 11 | **Multi-calendar switching** | `fetchCalendars`/`patchCalendar` exist with routes and no callers. (Edit/delete now shipped.) |
| 12 | **Make silent env fallbacks loud** | `SFU_MODE`, `RUNTIME_MODE` warn only when *misconfigured*, not when absent. (Calendar's is now handled.) |
| 13 | **SSO silent fallback** | Partially-set `QUIKIT_URL`/`CLIENT_ID`/`CLIENT_SECRET` silently swaps to local credentials login; the code comment admits this causes a login loop in prod. Reported during the secrets work, deliberately not fixed — it's shared-auth territory. |

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
| **agenda** | ✅ `description` | ✅ `description` | ✅ sent as `body.content` | **Free — already persisted.** Was labelled three ways in one control; settled to "Agenda" (Nov 2025). |
| **location** | ❌ | ✅ `location` | ❌ not sent | **Migration** on `QcMeeting` + send `location` |
| **allDay** | ❌ | ✅ `allDay` | ❌ not sent | **Migration** on `QcMeeting` + send `isAllDay` |
| **recurrence** | ❌ | ❌ | ❌ not sent | **Migration** on both. Largest — Graph `recurrence` is a nested pattern/range object, not a scalar. |
| **attendee required/optional** | ❌ | n/a | ⚠️ hardcoded `type: "required"` | **Migration** for a column, then **one line** in `microsoft.ts` |

> ⚠️ **`location` and `allDay` already exist — on `QcCalendarEvent`, not on
> `QcMeeting`.** Someone will grep the schema, find them, and price these as
> free. They are not. For the meeting flow both need a migration
> (`packages/database`, → Pravin), and `microsoft.ts` sends neither today.

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

### Regression we caused, and fixed (Nov 2025)

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

## 2. Channels vs Groups — vocabulary + grouping (queue item 3)

**Decided.** No schema change. Label derived from existing columns:

| `type` | `visibility` | UI says |
|---|---|---|
| `group` | `private` | **Group** |
| `group` | `public` | **Channel** |

Scope:
- Sidebar grouped into **Channels / Groups / Direct Messages**, collapsible, each
  with its own `+`. (Section-level `+` also avoids a sixth header icon — the row
  is already at ~168px of 312px usable.)
- **Create channel** → `NewGroupModal` in channel mode: visibility locked public,
  name required, dropdown replaced with plain copy.
- **Create group** → private, dropdown removed.
- **Row glyph**, per the corrected spec: **Channel** → full-size `#` at the same
  visual weight as a person's avatar (not the current small grey-background
  glyph); **Group** → initials/photo, same treatment as a DM. This is a
  three-way change to `Avatar`'s current two-way `group` boolean.
- **Conversion via the info drawer**, both directions. **Must show a confirmation
  stating plainly that the entire message history becomes visible to everyone in
  the org.** Permission-gated on the creation grant. The confirmation copy is
  part of the deliverable.
- Discover's empty state gains an action: *"No channels yet — create one."*
- The `"dm"` `ListFilter` branch (implemented, unreachable) finally gets a caller.

**Verify before building:** what `perms.has("Channel.Public", "create")` resolves
to for a **non-admin**. If regular members lack it, the Channels section is
read-only for most of the org.

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
- **`QUIKIT_URL` still baked as `dummy-quikit.local`** in the deployed image's
  CSP — the build-arg was never passed. **`LIVEKIT_URL` has the identical
  build-time-baked problem** and would silently omit LiveKit from `connect-src`,
  breaking calls in prod the same way.
- **Socket sticky sessions** — being addressed by the websocket-only change;
  confirm the churn stops once deployed.
- **Audio / Video / Screen Share (3 rows)** — code done and merged. Rows move on
  `SFU_MODE=live` + credentials + commercial approval. Not engineering.
- **Calendar going live** — Microsoft per-user OAuth is fully built (encrypted
  refresh tokens, rotation, HMAC-signed state). All six env vars from the old
  standalone app are supported, including `MICROSOFT_TENANT` and
  `MICROSOFT_CALENDAR_REDIRECT_URL`. Needs: the six values copied over, the new
  redirect URI added to the **existing** Azure app registration, and
  `CALENDAR_MODE=microsoft`. No new registration required.
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
| `"new-chat"` deep link | `DesktopBridge` no-op with a TODO. |
| Non-chromeless `ChannelList` branches | Dead — every caller passes `chromeless`. Delete or keep as a variant. |

**Cleanup:** `mediaKind` in `lib/upload.ts`; `ColorThemePicker.tsx` (constants
only, no component); duplicate `GET /api/org/roles/[id]/permissions`;
**`--qc-r-sm` is referenced at 3 call sites in `theme.css` but never defined in
`:root`** — pre-existing dead token.

---

## 9. Quality items

- **Orphaned group** — the sole admin can leave while members remain, leaving
  nobody able to add members, change roles, or delete. Options: auto-promote
  (WhatsApp) or require-assign-owner-first (Teams). A hard block alone is wrong —
  it traps the last admin. Currently warns in the confirm copy, doesn't prevent.
- **Roster staleness on leave** — `leave()` publishes no fanout, so remaining
  members see the "left the chat" system message live while the member list stays
  stale until refetch. The two visibly disagree.
- **Presence self-healing** — online-set seeded once at connect, no re-sync on drift.
- **Voice-note input-level indicator** — the app records, uploads and sends a
  completely silent voice note when the wrong mic is selected. No warning. Cost
  real debugging time this cycle.
- **Local-driver download path** — `LocalDriver.createDownloadUrl` still returns
  a token-in-path URL, the same shape that broke uploads. **Latent, not live** —
  UAT runs the GCS driver, which mints direct `storage.googleapis.com` signed
  URLs. Would bite any environment running the local driver behind a proxy.
  Harder to fix than uploads: those URLs are consumed by native `<img>`/`<a>`/
  `<video>` elements that can't attach a header.
- **Scroll-to-divider on open** — Teams/WhatsApp scroll to the unread line; a
  divider above a large unread block is currently off-screen.
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
- **Committed DDL for QuikChat has never existed** — `create_app_quikasset.sql`
  and `create_app_quikfinance.sql` are in `packages/database/sql/`; there is no
  `create_app_quikchat.sql`. The gap was never "recent migrations went missing" —
  a fresh database has never been reproducible from this repo. The three queued
  SQL files (last-seen privacy, RBAC substrate, one-default index) cover 4 of the
  22 tables; the remaining 18 are the artifact that actually closes it.
- **`postCallSummary` silent branches** — "call not found" / "no channel to post
  to" return with no log line.
- **`timeout-sweep.ts` uses `console.error`** — bypasses pino.
- **`/api/livekit/webhook` logs `{ error: e }` raw** — same anti-pattern as the
  GCS leak, lower risk today.
- **`services/realtime/src/calling.ts`** — logs `socketId` but not `callId`,
  already in scope in every catch. Cheapest diagnostic win available.
- **`PATCH /api/calls/:id` has no test file** — accept/reject/end/timeout/heartbeat.

---

## 10. Structural

- **30 excluded Vitest files** — real coverage that never runs, including
  `app/api/uploads/sign/route.test.ts`. The `.env.local` fix (Part A) recovered
  one non-excluded test; the 30 remain. Blocked on a decision: re-home to
  Playwright, or add a test database. **CI has no Postgres service**, so
  un-excluding them would pass locally and fail there.
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
- **7 pre-existing `no-unused-vars` lint errors**; `npm run lint` is red.
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
| location | ❌ | `location` | not sent | **Migration** (Pravin) |
| allDay | ❌ | `allDay` | not sent | **Migration** (Pravin) |
| recurrence | ❌ | ❌ | not sent | **Migration + program** — Graph wants a nested pattern/range object |
| attendee required/optional | ❌ | n/a | hardcoded `"required"` | **Migration**, then one line in `microsoft.ts` |

⚠️ `location` and `allDay` exist — **on `QcCalendarEvent`, not `QcMeeting`.**
A schema grep will say "we already have location." For the meeting flow we do not.

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
- #3, #8, #9 — blocked on migrations. Send to Pravin via Teams.
- #5 poll, #6 find-best-time, #7 availability scheduler, #10 recurrence —
  greenfield programs, no scaffolding exists. Size separately; not bug fixes.

**New defect found during intake:** `CalendarModule.tsx:232` hardcodes
`joinUrl: "https://meet.quikchat.dev/new"` on an event that creates no meeting
and notifies nobody. Same fabrication pattern the calendar stub was cleaned up
to avoid.