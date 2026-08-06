# LiveKit Calling Integration

Productionizes QuikChat's calling feature on LiveKit Cloud (paid SFU). Covers both
1:1 and group calls, replacing the previous split architecture (raw WebRTC mesh
for 1:1, LiveKit for group-only) with a single LiveKit-backed path end to end.

App: `apps/quikchat`. Signaling gateway: `services/realtime`.

## Why

Before this change, group calls used LiveKit but 1:1 calls used a hand-rolled
`RTCPeerConnection` mesh with Metered.live TURN credentials. That left two
call stacks to maintain, and the LiveKit path itself was not production-safe:
group calls defaulted to a stub SFU provider, tokens for every participant were
minted by the call initiator and handed out in a JSON response (and then placed
in a popup's URL query string), rooms were keyed per-channel instead of
per-call, and a `RoomEvent.Disconnected` handler was mapped to a persistent
"Reconnecting…" banner instead of ending the call.

## Architecture

**Before:**
- 1:1 calls: `lib/webrtc.ts` (raw `RTCPeerConnection`) + Socket.IO offer/answer/
  ICE relay in `services/realtime/src/calling.ts` + Metered.live TURN via
  `lib/server/calling/ice-provider.*`.
- Group calls: LiveKit, but tokens for all members minted by the initiator and
  returned in the `POST /api/calls/group` response body, then carried in the
  call popup's URL query string.

**After:**
- Every call (1:1 or group) connects to a LiveKit room named `call-<QcCall.id>`.
- Each participant mints their **own** LiveKit token from
  `POST /api/calls/:id/token`, verified against `QcCallParticipant` membership.
  No token is ever returned to anyone other than its owner, and none travel in
  a URL.
- The realtime gateway (`services/realtime`) keeps the **pre-connect** ring
  lifecycle only — `call:invite` / `call:ringing` / `call:accepted` /
  `call:reject` / `call:cancel` / `call:end` / the Redis-backed ringing-timeout
  sweep. It no longer relays SDP or ICE candidates; LiveKit media doesn't touch
  this gateway at all.
- `lib/use-livekit-room.ts` is a shared client hook wrapping the LiveKit `Room`
  connection (participants, mute/camera/screen-share state, reconnect
  handling). It backs both `LiveKitGroupCall.tsx` (group grid UI) and the new
  `LiveKitOneToOneCall.tsx` (1:1 UI, via the existing `CallWindow`).
- `app/call/[callId]/page.tsx` is reduced from ~890 lines of mesh/signaling
  code to: fetch own token → render the matching component based on the
  server-reported `isGroup`/`isHost` flags.

## Configuration

New env vars (`apps/quikchat/.env.example`):

| Var | Purpose |
|---|---|
| `SFU_MODE` | `"live"` to use real LiveKit; anything else (default) uses the in-process stub. Requires all three vars below or falls back to stub with a logged warning. |
| `LIVEKIT_URL` | LiveKit Cloud project WebSocket URL (`wss://<project>.livekit.cloud`) or self-hosted equivalent. Server-only; also used by `next.config.js` to whitelist the origin in the CSP `connect-src`. |
| `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` | From the LiveKit Cloud dashboard (Settings → Keys). Server-only. |

Removed: `ICE_MODE`, `TURN_URLS`, `TURN_USERNAME`, `TURN_CREDENTIAL`,
`STUN_URLS`, `METERED_API_KEY` — the coturn/Metered TURN seam is gone along
with the mesh it served.

**Deployment step required outside this repo:** configure the LiveKit Cloud
project's webhook URL to point at `https://<quikchat-host>/api/livekit/webhook`
(same API key/secret as above — no separate webhook secret).

## Change log by phase

### Phase 1 — Config, CSP, mode validation
- `next.config.js`: derive the LiveKit origin from `LIVEKIT_URL` and add it
  (wss + https forms) to the CSP `connect-src`.
- `lib/server/calling/sfu-provider.ts`: `selectSFUMode()` now requires
  `LIVEKIT_URL` **and** `LIVEKIT_API_KEY` **and** `LIVEKIT_API_SECRET` together
  (previously URL alone was enough, so `SFU_MODE=live` with no key/secret
  silently ran a provider that would throw on every call). Logs the active
  mode / misconfig warning once, mirroring `ice-index.ts`'s existing pattern.

### Phase 2 — Token security and room lifecycle
- **New:** `POST /api/calls/:id/token` — mints a LiveKit token for the calling
  user only, after verifying `QcCallParticipant` membership and call status.
  Idempotently ensures the room exists. Grants `roomAdmin` only to the call's
  initiator. Token TTL bounded to 4 hours (the call model's hard duration
  cap), replacing an unbounded/24h token that could rejoin a room long after
  the call it was minted for had ended.
- `POST /api/calls/group`: no longer mints or returns any participant's token;
  returns `{ call, roomId }` only.
- Room IDs moved from per-**channel** (`channel-<channelId>`) to per-**call**
  (`call-<QcCall.id>`) — a channel's second call no longer reuses the first
  call's room.
- `PATCH /api/calls/:id` (`action: "end"`): now explicitly deletes the LiveKit
  room for group calls instead of relying solely on the room's idle timeout.
  `emptyTimeout` lowered from 300s to 60s as the remaining safety net.
- Client: `ChatWorkspace.tsx` and `app/call/[callId]/page.tsx` no longer carry
  a token, room id, or LiveKit URL in the popup's URL query string — the call
  page fetches its own token after opening.

### Phase 3 — Group call discoverability
- **New fan-out event** `call_group_started` (`lib/shared/publish.ts` +
  `services/realtime/src/fanout-contract.ts`, kept in sync per that file's
  documented invariant): published when a group call starts, relayed to the
  channel room. `ChatWorkspace.tsx` shows a live "join" toast to other members
  (skipping the initiator, who already has their own window open).
- `GET /api/calls/active`'s rejoin banner now actually reopens a group call
  window (`openGroupCallWindow`) instead of only showing a toast. 1:1 rejoin
  still shows an informational toast only — reconstructing the mesh's
  caller/callee state without a saved remote identity isn't solved here.

### Phase 4 — 1:1 calls migrated onto LiveKit; mesh deleted
- **New:** `lib/use-livekit-room.ts` — the shared LiveKit `Room` hook described
  above.
- **New:** `components/calling/LiveKitOneToOneCall.tsx` — 1:1 call UI, reusing
  `CallWindow` fed by the shared hook instead of `RTCPeerConnection` streams.
- `components/calling/CallWindow.tsx`: converted from managing mute/camera
  state internally (mutating raw `MediaStreamTrack.enabled`) to a controlled
  component (`isMuted`/`onToggleMute`/`isCameraOff`/`onToggleCamera` props).
  The old internal approach bypassed LiveKit's own mute API, which is what
  every other participant's client relies on for accurate remote-mute UI.
- `components/calling/LiveKitGroupCall.tsx`: rebuilt on the shared hook; gained
  a `callType` prop so audio calls stop requesting camera access (previously
  unconditional regardless of call type).
- **Bug fix, found while extracting the hook:** `RoomEvent.Disconnected` was
  mapped to `setIsReconnecting(true)` — but per the LiveKit SDK, `Disconnected`
  fires only once reconnection has *already been exhausted* (or the room was
  deleted/we were kicked); the transient state is `Reconnecting`/`Reconnected`.
  The old mapping meant a permanently-dead call showed "Reconnecting…" forever
  with no way out. Now `Reconnecting`/`Reconnected` drive the banner, and a
  genuine `Disconnected` ends the call via the same path as the hang-up button.
- `app/call/[callId]/page.tsx`: rewritten. Fetches its own token for every
  call (1:1 or group) and renders `LiveKitOneToOneCall` or `LiveKitGroupCall`
  based on the token response's `isGroup`. The realtime socket connection is
  now used only for the pre-connect ring lifecycle on 1:1 calls (group calls
  don't open a socket in the call window at all — they rely on LiveKit's own
  `terminalDisconnect` signal).
- **Deleted:** `lib/webrtc.ts`, `lib/webrtc.test.ts`,
  `lib/server/calling/ice-provider.ts` (+ `.real.ts`, `.stub.ts`, `.test.ts`),
  `lib/server/calling/ice-index.ts`, `app/api/calls/ice-config/`.
- `services/realtime/src/calling.ts`: removed the `call:ready`, `call:offer`,
  `call:answer`, `call:ice-candidate` handlers (SDP/ICE relay — no longer
  needed). `call:invite`/`call:accepted`/`call:reject`/`call:cancel`/
  `call:end` and the Redis-backed ringing-timeout sweep are unchanged.
- `vitest.setup.ts`: removed the jsdom `RTCPeerConnection`/`RTCSessionDescription`
  /`RTCIceCandidate` polyfills (nothing left references them); kept the
  `navigator.mediaDevices` polyfill (still used by voice-recorder/screen-share/
  device-settings tests) and the module-level `livekit-client` mock.

### Phase 5 — Webhooks, host controls, mute-track fix
- **New:** `POST /api/livekit/webhook` — LiveKit's server-side event feed,
  signature-verified via `WebhookReceiver` (not gated by `withOrgAuth`; LiveKit
  is not one of our authenticated users). Handles:
  - `room_finished` → ends the call server-side if it's still `active`/`ringing`
    (safety net for a crashed browser that never sent `PATCH .../end`).
    Guarded to skip calls already in a terminal-but-not-"ended" state
    (`rejected`/`missed`/`timed_out`) — a 1:1 caller joins their room
    immediately on invite, before the callee answers, so a rejected/timed-out
    call's room can still finish after the call already reached that terminal
    status, and `calling.endCall`'s state machine would otherwise throw on
    that transition.
  - `participant_left` → marks that one `QcCallParticipant` disconnected
    immediately, rather than waiting up to ~90s on the heartbeat sweep. Doesn't
    end the call — one member leaving a group call isn't a call-ending event
    in the existing state machine.
- **New:** `PATCH /api/calls/:id/participants/:identity` (`action:
  "mute"|"unmute"|"remove"`) and `POST /api/calls/:id/mute-all` — host-only
  (call initiator) participant management, gated the same way the LiveKit
  `roomAdmin` grant is. Wires up `GroupCallGrid`'s `onToggleMute`/`onRemove`/
  `onMuteAll` props, which were previously dead (`() => {}` / a self-mute-only
  branch that could never fire since the participant list never shows mute/
  remove buttons for yourself).
- `LiveKitGroupCall.tsx`: `isAdmin` passed to `GroupCallGrid` is now
  `isHost` (from the token response) instead of hardcoded `true` — every
  group-call participant previously saw host controls, whether or not they
  started the call.
- **Bug fix, `lib/server/calling/sfu-provider.livekit.ts`:**
  - `mapParticipant()` compared `track.source` (LiveKit's numeric protobuf
    `TrackSource` enum — `CAMERA=1`, `MICROPHONE=2`, …) against the string
    literals `"CAMERA"`/`"MICROPHONE"`. That comparison was never true, so
    `isMuted`/`hasVideo`/`hasScreenShare` from `listParticipants()` never
    reflected the real track state.
  - `muteParticipant()` / `muteAllParticipants()` filtered on
    `TrackSource.CAMERA` — muting a participant turned off their **camera**,
    not their microphone. Both now target `TrackSource.MICROPHONE`.

## New API surface

| Route | Method | Auth | Purpose |
|---|---|---|---|
| `/api/calls/:id/token` | POST | participant | Mint the caller's own LiveKit token. |
| `/api/calls/:id/participants/:identity` | PATCH | host only | `mute` / `unmute` / `remove` another participant. |
| `/api/calls/:id/mute-all` | POST | host only | Mute every other participant's microphone. |
| `/api/livekit/webhook` | POST | LiveKit signature | Server-side room/participant event feed. |

## Testing

- Unit/component tests updated or added alongside every change above
  (`sfu-provider.test.ts`, `sfu-provider.livekit.test.ts`,
  `LiveKitGroupCall.test.tsx`, `LiveKitOneToOneCall.test.tsx`,
  `CallWindow.test.tsx`, `ChatWorkspace.test.tsx`,
  `gateway.dispatch.test.ts`, `calling.test.ts`, plus new route tests for
  the token/participants/mute-all/webhook routes).
- The new route test files are **excluded from the default `vitest run`**,
  matching this repo's existing convention for DB-backed integration tests
  (see the exclusion list and comment in `apps/quikchat/vitest.config.ts` —
  the same treatment already applied to `app/api/calls/group/route.test.ts`
  and ~30 other files, pending re-home to Playwright e2e). They were
  typechecked against the real Prisma-generated types but could not be
  executed against a live seeded database in the environment this work was
  done in.
- Last full non-DB-backed run: 865+/866 passing (the one pre-existing,
  unrelated failure is `app/api/notifications/settings/route.test.ts` failing
  on a missing local `DATABASE_URL` — present before this work and unrelated
  to calling).

## Known limitations / follow-ups

- **1:1 rejoin isn't wired.** The rejoin banner only reopens group calls; a
  1:1 call rejoin would need the other participant's id/name, which the
  `GET /api/calls/active` summary doesn't carry today.
- **Removing one participant from a group call doesn't distinguish "left"
  from "ended."** `calling.service.ts`'s state machine treats any `action:
  "end"` as ending the call for every participant. A host removing one member
  via the new participant-management route disconnects them from LiveKit only
  (no DB write) — that member's own client then runs its normal hang-up path,
  which currently ends the call for everyone. This is pre-existing behavior,
  not introduced by this change; fixing it needs a "left" state distinct from
  "ended" in the call model.
- **Cost:** 1:1 calls now bill LiveKit participant-minutes instead of running
  free peer-to-peer.
