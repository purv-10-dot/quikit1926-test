/**
 * Gateway-owned copy of the fan-out wire protocol.
 *
 * TECH-DEBT (Phase 3 — v2 envelope): this is a byte-for-byte duplicate of
 * `apps/quikchat/lib/shared/publish.ts`. It MUST stay in sync with that file —
 * the app publishes `JSON.stringify(FanoutEvent)` to the `quikchat:fanout`
 * Redis channel and this gateway parses it. Phase 0 deliberately duplicates the
 * type (rather than importing from the app) to keep the service self-contained
 * and avoid editing the uncommitted `apps/quikchat` on `feature/quikchat-port`.
 * Phase 3 unifies both sides onto a shared v2 envelope.
 *
 * If you change one side, change the other. See PUBLISH-SEAM.md.
 */

export const FANOUT_CHANNEL = "quikchat:fanout";

export type FanoutEventType =
  | "message"
  | "message_update"
  | "reaction"
  | "channel_created"
  // Group details changed (rename / description / avatar) — APP-PUBLISHED on
  // PATCH /api/channels/[id]. Relayed to the channel room so members update the
  // channel in place. Payload: { channelId, name?, description?, avatarUrl? }
  | "channel_updated"
  // Group deleted-for-everyone — APP-PUBLISHED on the admin delete route.
  // Relayed to the channel room so members remove it live. Payload:
  //   { channelId, memberIds?: string[] }
  | "channel_deleted"
  | "system"
  | "read"
  // Per-member delivery watermark (S14a) — channel-room relayed like `read`.
  | "delivered"
  // Per-user: routed to the recipient's user room (not a channel room). See `userId`.
  | "notification"
  // Ephemeral, gateway-relayed (not app-published): emitted straight to rooms.
  | "presence"
  // Durable set-status change (available|busy|dnd|brb|away|appear_offline).
  // APP-PUBLISHED on write to /api/me/presence. Fans out like `channel_created`:
  // the payload carries the author's channel ids and the gateway relays to each
  // `channel:{orgId}:{id}` room. Payload:
  //   { userId, status, statusMessage?, statusExpiresAt?: string, channelIds: string[] }
  | "presence_status"
  | "typing"
  // A group call started (CALL-3 §3). APP-PUBLISHED from POST /api/calls/group.
  // Relayed to the channel room like `channel_updated` — every member with the
  // channel open gets a live "join" nudge; a member who's offline still finds
  // the call later via GET /api/calls/active (they're already a
  // QcCallParticipant from call creation). Payload:
  //   { callId, channelId, initiatorId, type: "audio" | "video" }
  | "call_group_started";

export interface FanoutEvent {
  orgId: string;
  channelId: string;
  event: FanoutEventType;
  payload: unknown;
  /**
   * Target recipient for per-user events (`notification`). When set, the gateway
   * delivers to `org:{orgId}:user:{userId}` instead of the channel room. The room
   * is always built from `orgId`/`userId` here — never from the payload.
   */
  userId?: string;
}
