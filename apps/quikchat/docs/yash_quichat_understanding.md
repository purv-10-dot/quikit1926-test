# QuikChat — Complete Product Understanding

> Personal understanding doc, written for Yash. Goal: explain what QuikChat *is*, *why* it exists, *who* uses it and with what permissions, *how* it's built, and *where it currently stands*. Everything below is grounded in the actual code and the existing internal docs under `apps/quikchat/docs/` (program plan, backlog, RBAC plan, runtime contract, mobile guide) as of 2026-08-20.

---

## 1. What is QuikChat?

QuikChat is the **team messaging & collaboration app** inside the QuikIT monorepo — the "Slack/Teams" of the QuikIT product suite. It sits alongside other apps (`quikscale`, `quikhrms`, `quikinsight`, `quikcrmexpress`, `admin`, etc.) that all share the same platform: one Postgres database, one auth system (`@quikit/auth`), one design system (`@quikit/ui`), and one org/tenant model. A user logs into the QuikIT platform once, and if their org has been granted access to the "quikchat" app, they see it in the app switcher and land on `/dashboard`.

It's a Next.js 14 app (runs on port **3011** locally) and its product surface covers:

- **Channels, groups, and DMs** — real-time text messaging
- **Voice/video calling** (1:1 and group) — built on **LiveKit**
- **Meetings & calendar** — scheduling, RSVP, Microsoft Outlook/Graph integration
- **Notifications** — mentions, DMs, keywords, reactions, thread replies, with per-channel and global preferences
- **An AI assistant** built into the chat itself (via QuikIT's central AI runtime) — rewrite/translate text, ask questions, and (in progress) document intelligence — "drop a file, get a summary, ask follow-up questions against it"
- **File/media sharing** with drag-and-drop upload (local disk or Google Cloud Storage, depending on deployment)
- **Admin settings**: roles & permissions, company settings, support tickets, and (newest) user invitations

### Why it exists

QuikIT is a multi-app platform (HRMS, sales/scale tooling, insights, CRM, etc.) built for organizations that need internal tooling without stitching together a dozen SaaS subscriptions. Every one of those apps eventually needs *some* way for people inside an org to talk to each other, share files, and hop on a call about what they're looking at — QuikChat is that shared communication layer, built once and reused across the whole suite rather than every app inventing its own chat widget. It plugs into the same org/user/auth substrate as everything else, so "who's in my org" and "who can see this" is already solved before QuikChat-specific logic even starts.

---

## 2. Where QuikChat fits in the monorepo

```
quikit1926/
├── apps/
│   ├── quikchat/        ← this app (port 3011)
│   ├── quikscale/       ← KPI/priority tracking app (donor of the RBAC-v2 pattern QuikChat copies)
│   ├── quikhrms/         etc.
│   └── admin/
├── packages/
│   ├── database/         ← shared Prisma schema (one schema.prisma, per-app Postgres *schemas*)
│   ├── auth/              ← shared NextAuth config, middleware, requireAdmin factories
│   ├── ui/                ← shared design system, Tailwind config, ThemeApplier
│   └── shared/             ← shared constants (ROLES, pagination, email templates, etc.)
└── services/
    └── realtime/           ← standalone Socket.IO gateway QuikChat talks to for live updates
```

QuikChat's own database tables all live in a dedicated Postgres schema (`app_quikchat`) inside the **same** shared database, and every model is prefixed `Qc*` (`QcChannel`, `QcMessage`, `QcCall`, …) to keep it visually distinct from other apps' tables in the one big `schema.prisma` file.

It depends on:
- `@quikit/database` — the Prisma client / shared schema
- `@quikit/auth` — session handling, `withOrgAuth`, `requireAdmin` factory, middleware
- `@quikit/ui` — shared components, theming (`ThemeApplier`, accent colors)
- `@quikit/shared` — shared constants, email templates, pagination helpers

And it has its **own** standalone real-time service (`services/realtime/`) — a Socket.IO gateway separate from the Next.js app — because chat needs sub-second push (typing indicators, message delivery, presence, incoming calls) that a request/response API can't give you.

---

## 3. The mental model: how a message gets from one person to another

1. User types in the **Composer** (`components/chat/Composer.tsx`) inside a channel.
2. Message is POSTed to `app/api/channels/[id]/messages` with a `clientMessageId` (a client-generated idempotency key — resending the same message twice, e.g. after a flaky network retry, never double-posts).
3. The API writes a `QcMessage` row scoped to `orgId` + `channelId`, then notifies the **realtime gateway** so every other connected member's socket gets a `message` event pushed instantly.
4. The gateway also fans out `typing`, `reaction`, `read`/`delivered` receipts, `presence`, and `notification` events the same way — the notification ones go to a **private per-user room** (`org:{orgId}:user:{userId}`), not the channel room, so a mention notification reaches you even in a channel you haven't opened yet.
5. On the recipient's screen, `ChatShell` → `ChatWorkspace` → `ConversationView` renders the new `MessageRow`, and `NotificationProvider` decides whether to also raise a toast/sound/badge based on that user's notification preferences (muted channel? DND? already looking at this exact channel — suppress the redundant ping).

This "API writes to Postgres, gateway pushes over websocket" split is the core architecture pattern repeated for messages, calls, presence, and notifications.

---

## 4. Roles & Permissions — the part with the most nuance

QuikChat actually has **two separate, independent role systems** layered on top of each other. This trips people up, so it's worth being explicit:

### 4.1 App-level roles (RBAC v2) — "what can this person do across all of QuikChat"

This is the *real* permission system, added specifically because QuikChat originally had **no** app-level RBAC at all — any org member granted access to the QuikChat app could do literally everything (create/delete any channel, moderate anything, configure the AI assistant, everything). `RBAC_PLAN.md` documents the fix, and it's a deliberate **copy of QuikScale's RBAC-v2 pattern**, not a bespoke QuikChat design — chosen so the whole platform has one mental model for "roles" instead of five slightly different ones per app.

**Four roles, seeded automatically per org (idempotently, on first load):**

| Role | System role? | Default? | What it means |
|---|---|---|---|
| **Admin** | Yes (`isSystem`) | No | Full grants across every permission leaf. Gets access purely through *seeded grants* — there is deliberately **no admin bypass** in code (`userCan()` never special-cases "is admin"). This is a strict design choice: it forces every capability to be explicit in the permission tree rather than hidden behind an "admins can do anything" escape hatch. |
| **Moderator** | No | No | Can moderate channels (update/delete others' channels) without full admin power (e.g. can't necessarily configure the AI assistant org-wide or manage app modules). |
| **Member** | No | Yes (`isDefault`) | The floor for a normal user — create/view channels, DMs, calls, use the assistant. Everyone lands here unless promoted. |
| **Guest** | No | No | Participate-only floor — narrower than Member, for people who shouldn't be creating channels or inviting others. |

**How a permission check actually works** (`lib/authz/permissions.ts`):

```
userCan(userId, orgId, resource, action)
  = (role grants: QcRolePermission rows for roles this user holds via QcUserAppRole)
    ∪
    (personal extras: QcUserPermissionExtra rows — one-off grants on top of role)
```

It **fails closed** — an unrecognized `(resource, action)` pair, or a missing `App` row for the "quikchat" slug, returns `false`/denies rather than defaulting open.

The full set of permissions is defined in code (`lib/authz/permissionsRegistry.ts`), not just in the database — it's a tree of modules → leaves:

- `Channel`: view / create / update / delete
  - `Channel.Public`: create (only some roles can make a *public* channel anyone can join)
  - `Channel.DM`: create
  - `Channel.Moderate`: update / delete (moderator-level channel admin power, distinct from being the *channel's own* admin)
- `Call`: create
  - `Call.Group`: create (group calls gated separately from 1:1 calls)
- `Assistant`: view / create
  - `Assistant.IngestPrivate` / `Assistant.IngestOrg`: create (who can feed documents into the AI knowledge base, and at what visibility)
  - `Assistant.Configure`: update (who can turn the assistant on/off for a channel or org)
- `App.Modules`: update (who can toggle whole feature modules — calls, assistant, KB — on/off for the org)

**Enforcement order**, top to bottom, every request: `Org has access to the QuikChat app at all → is this feature-module enabled for the org → does this user's role/extras grant this specific permission → does this user's channel-level role allow it → is the DB query itself scoped to this org`. If any layer says no, the request is denied — there's no single choke point you can bypass by hitting a different route.

Admins manage this whole system from **Settings → Roles & Permissions** (`app/(dashboard)/settings/roles/`) — a matrix UI (`RolePermissionMatrix.tsx`) for ticking which role gets which permission, plus a members modal for assigning people to roles.

### 4.2 Channel-level roles — "what can this person do inside *this one* channel"

Completely separate, much simpler, and older: `QcChannelMember.role` is just `"admin"` or `"member"` **per channel**. Being the admin of one channel (can rename it, remove members, etc.) has nothing to do with your app-level RBAC role — a QuikChat "Member" can absolutely be the "admin" of a channel they created. Don't confuse the two when reading code — `role` on `QcChannelMember` is channel-scoped; `QcUserAppRole` is the app-wide RBAC-v2 role.

### 4.3 Where roles show up in the UI

- **"Channel" vs "Group"** in the sidebar is *not* a role/permission distinction at all — it's a cosmetic label derived from two other fields (`type="group"` + `visibility="public"` displays as "Channel"; same type + `visibility="private"` displays as "Group"). Worth knowing so you don't go looking for a `kind` column that doesn't exist.
- **Settings → Users & Invites** (new, see §7) is where org admins invite new people and assign their initial app-level role.
- **Settings → Roles** is where admins edit the permission matrix itself.

---

## 5. Data model at a glance

All models below live in the shared `packages/database/prisma/schema.prisma`, schema `app_quikchat`, prefixed `Qc`. (There is deliberately **no committed SQL/DDL** for these tables — schema changes are applied by hand in a specific order across environments, a known piece of process debt tracked in the backlog.)

**Messaging core**
- `QcChannel` — a channel/group/DM/AI-chat container (`orgId`, `type`, `visibility`, `name`, …)
- `QcChannelMember` — who's in a channel, their channel-level `role`, read/delivered watermarks
- `QcMessage` — the message itself; supports threading (`parentMessageId`), reactions, pinning, and distinguishes human vs. AI-agent senders (`actorType`)
- `QcInvite` — a **channel-level** join-by-link invite (code, max uses, expiry) — distinct from the new org-level user invite system, see §7

**RBAC v2**
- `QcAppRole`, `QcUserAppRole`, `QcRolePermission`, `QcUserPermissionExtra` — the four tables backing everything in §4.1

**Notifications / presence**
- `QcNotification` — one row per notification event (mention, DM, keyword hit, reaction, thread reply)
- `QcUserNotificationSettings`, `QcNotificationPreference` (per-channel override), `QcNotificationKeyword`
- `QcUserPresence` — durable status (`available`/`busy`/`dnd`/`brb`/`away`/`appear_offline`) plus a **mutual** last-seen sharing flag (both people must opt in before either sees the other's last-seen, WhatsApp-style). Online/offline itself is *not* stored here — that's computed live by the realtime gateway from active socket connections.

**Meetings & calendar — two separate features, easy to conflate**
- `QcMeeting` + `QcMeetingAttendee` — the **chat-native** meeting flow: scheduled from inside a conversation, creates a real Microsoft Graph calendar event, posts a card into the chat, tracks RSVPs.
- `QcCalendarConnection` — a user's linked Microsoft account (OAuth, refresh token encrypted at rest).
- `QcCalendar` + `QcCalendarEvent` — a **separate, simpler personal calendar** feature reachable from the Calendar tab's "New meeting" button. It does *not* create attendees, does *not* create a Graph event, does *not* post a chat card, and its "join link" is currently a hardcoded placeholder. The backlog explicitly flags this as a "two-model trap" — grepping the schema for "meeting" finds both, and it's easy to wire a new feature to the wrong one.

**Calling**
- `QcCall` — a single call session (channel-scoped or ad-hoc, audio/video, status lifecycle `ringing → active → ended/missed/rejected/timed_out`), optionally linked to the `QcMeeting` it was started from.
- `QcCallParticipant` — who's in the call, their connection state, and a heartbeat timestamp used by a background sweep to reap calls where someone's client died without a clean hangup.

**AI**
- `QcAssistantConfig` — per-(org, channel) flag for whether the AI assistant is enabled (empty-string `channelId` row = the org-wide default).

---

## 6. Feature-by-feature explanation

### Channels, groups & DMs
The core messaging surface. `ChannelList` shows your sidebar; `ChatWorkspace`/`ConversationView` render the active conversation. Messages support text, media attachments, reactions, pinning, threading (replies), and forwarding to another channel. Drafts persist per-channel (so switching channels and back doesn't lose what you were typing) and uploads support drag-and-drop with retry.

### Calling (1:1 and group)
Built on **LiveKit** (self-hosted-capable WebRTC SFU). `components/calling/` has a full call UI: incoming-call toast, active-speaker detection, screen share, group call grid, host controls (mute-all, remove participant), rejoin banner if you get disconnected. A call can start ad-hoc from a conversation or from a scheduled `QcMeeting`. This track is marked **code-complete** in the program plan — what's outstanding is purely operational (LiveKit environment variables + `SFU_MODE=live` need to be configured in a deployed environment; it's a config/commercial-approval gap, not an engineering one).

### Meetings & Calendar
Two related but distinct flows (see the "two-model trap" note in §5):
1. **Chat-native scheduling** — from a conversation header, schedule a meeting; it creates a real Outlook calendar event via Microsoft Graph, invites attendees, posts a card in the chat, and tracks RSVPs.
2. **Personal calendar tab** — a simpler standalone calendar view for your own events, not tied to a specific chat conversation.
Recurrence, scheduling polls, and "find best meeting time" are explicitly not built yet.

### Notifications
Highly configurable: global defaults (per-channel-type and DM notification levels, sound, desktop, email), per-channel overrides (mute a specific noisy channel), keyword highlighting (get pinged when someone says a specific word even without an @mention), and Do Not Disturb windows with a "let priority notifications through anyway" option. The system is also smart about suppression — you don't get a redundant toast for a channel you're actively looking at.

### AI Assistant
QuikChat's AI features route through QuikIT's **central AI runtime** (`RUNTIME.md` documents this contract in detail) — never a raw LLM SDK call, per the platform-wide AI integration rule. Two capabilities exist today:
- **Composer actions** — rewrite/translate text, and (more speculative) AI-suggested smart replies.
- **A built-in AI chat** — a special per-user singleton channel (`type="ai"`) where every message routes to the assistant instead of other humans. It can now accept an attached document and summarize it in the reply. The next stage — "Add to KB" (explicitly ingest a document into a searchable knowledge base) and then ask follow-up questions against it — is built but was gated behind confirming the runtime's exact retrieval contract before shipping, following a deliberate "confirm the contract, don't guess it" development process for this feature.

### Voice/multilingual input
Two lightweight, zero-backend-cost experiments shipped to gauge demand: client-side Hindi/Hinglish transliteration and browser-native voice typing (Web Speech API). Both are explicitly flagged as *not* production-grade long-term answers (transliteration accuracy on casual typing was measured at only ~40%, and voice typing sends audio to the browser vendor with no data processing agreement in place) — if demand justifies it, the documented next step is a self-hosted AI4Bharat model instead of patching the current approach further.

### Settings
The settings module (`SettingsModule.tsx`) is a tabbed shell: Roles & Permissions, Company settings, Support tickets, Calendars, Devices, Theme, and (new) Users & Invites.

---

## 7. What's actively being built right now: the invitation flow

Current branch: `feature/quikchat-invitation-flow`. This closes a real gap that existed before: **QuikChat's own channel invites (`QcInvite`) can only add someone who is already an org member** — they add a `QcChannelMember` row, nothing more. There was no way to invite a genuinely new person (someone with no account, no org membership at all) into the org *through QuikChat*.

This feature adds that missing piece:

- A **mailer** (`lib/email/mailer.ts`) that sends real email via SMTP when configured, and falls back to writing `.eml` files to disk in dev (so you can test invite flows without an SMTP server).
- **`Settings → Users & Invites`** (admin-only, gated the same way as Roles & Permissions): lists everyone with QuikChat access — active and pending — with the ability to invite someone new (name, email, initial role, and a choice between a native password-based account or SSO) and resend a pending invite.
- Under the hood, inviting someone: creates/updates the central platform `User` + `OrgMember` records, grants `UserAppAccess` to QuikChat specifically, mirrors their chosen role into QuikChat's own RBAC-v2 tables, and emails them a link into the **platform's** shared accept-invite flow (not a QuikChat-specific one — acceptance is centralized).

So there are now, deliberately, **two separate invite systems that coexist**:
1. `QcInvite` — "invite an existing org member into this one channel" (link/code based).
2. The new `Settings → Users` flow — "bring a brand-new person into the org and grant them QuikChat access" (email based, creates real org membership).

---

## 8. Known gaps & open questions (worth knowing before you build on top of these areas)

- **Mobile has no auth story yet.** Every QuikChat API route requires a NextAuth session cookie; there's no bearer-token/PKCE path anywhere in the shared auth package. This blocks any native mobile client and needs a decision from the `@quikit/auth` owner before mobile work can start.
- **Search is only partially real.** The message-search feature currently emits events toward an external search service and SDK that don't exist yet — the emitter runs but has nowhere to actually deliver to. Whether chat content should be indexed at all (and at what visibility) is still an open product decision.
- **The two meeting/calendar models** (`QcMeeting` vs `QcCalendarEvent`, §5) are both alive and easy to accidentally cross-wire.
- **CI doesn't build or test QuikChat today** — the pipeline only builds `quikscale`, and its branch triggers don't match the naming convention this team actually uses.
- Several settings toggles in the UI aren't wired to anything real yet (desktop-app-specific toggles belong to the separate Electron app; read-receipt/typing-indicator privacy needs real server+gateway suppression logic, not just a UI switch).

---

## 9. Where to go for more detail

This document is a map, not the territory — for anything you're about to build or debug, go to the source doc, which will be more current than this summary:

| Topic | Doc |
|---|---|
| Overall program status, blockers, tracks | `apps/quikchat/docs/QUIKCHAT_PROGRAM_PLAN.md` |
| Reconciled build queue, shipped-this-cycle list, structural debt | `apps/quikchat/docs/QUIKCHAT_BACKLOG.md` |
| Full RBAC-v2 design (roles, permission tree, phases) | `apps/quikchat/docs/RBAC_PLAN.md` |
| AI runtime wire contract (assist + ingest endpoints) | `apps/quikchat/docs/RUNTIME.md` |
| Mobile client integration (auth, realtime, uploads) | `apps/quikchat/docs/MOBILE_INTEGRATION_GUIDE.md` |
| REST API surface | `apps/quikchat/docs/openapi.yaml` (viewable in-app at `/api-docs`) |
| Document-intelligence-in-chat build history | `apps/quikchat/docs/AI_DOCINTEL_PLAN.md` + session logs |
| Upload/CSP/GCS infra sessions | `CSP_GCS_SESSION.md`, `GCS_CREDS_SESSION.md`, `GCS_SERVER_UPLOAD_SESSION.md` |
| Multilingual/voice input options | `quikchat-multilingual-voice-input-options.md` |

---

*This doc reflects the state of the code and internal docs as of 2026-08-20 on branch `feature/quikchat-invitation-flow`. Re-verify specifics (file paths, exact permission names) against the source before relying on them, since this area of the product is actively evolving.*
