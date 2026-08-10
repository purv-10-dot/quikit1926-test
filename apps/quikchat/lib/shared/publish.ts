import { EventEmitter } from "node:events";
import type { Redis } from "ioredis";

/**
 * Persist-then-publish fan-out seam.
 *
 * Services persist via Prisma, then call `publishFanout(...)`.
 *   - The in-process EventEmitter ALWAYS fires (keeps `__getPublishedForTest()`
 *     and local consumers working — tests need no Redis).
 *   - When `REDIS_URL` is set, the event is ALSO published to Redis channel
 *     `quikchat:fanout`, which the `quikchat-realtime` gateway consumes.
 * Signature and event vocabulary are fixed — see PUBLISH-SEAM.md.
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

const emitter = new EventEmitter();

// Test spy buffer. Only populated while capture is enabled (tests opt in via
// `__resetPublishedForTest()`), so production never accumulates memory.
let captureForTest = false;
let published: FanoutEvent[] = [];

// Lazy singleton ioredis publisher. Created on first use ONLY when REDIS_URL is
// set, so the in-process/test path never loads or connects to Redis.
let redisPubPromise: Promise<Redis> | null = null;

async function getRedisPub(): Promise<Redis | null> {
  if (!process.env.REDIS_URL) return null;
  if (!redisPubPromise) {
    redisPubPromise = import("ioredis").then(
      ({ default: RedisCtor }) => new RedisCtor(process.env.REDIS_URL!),
    );
  }
  return redisPubPromise;
}

export async function publishFanout(evt: FanoutEvent): Promise<void> {
  if (captureForTest) published.push(evt);
  // Always fire in-process.
  emitter.emit(evt.event, evt);
  emitter.emit("*", evt);
  // Additionally publish to Redis when configured.
  const pub = await getRedisPub();
  if (pub) {
    try {
      await pub.publish(FANOUT_CHANNEL, JSON.stringify(evt));
    } catch {
      // Best-effort: a Redis hiccup must not fail the originating request.
      // The row is already persisted; realtime delivery is at-most-once here.
    }
  }
}

/** Subscribe to fan-out events in-process (used by tests / future local consumers). */
export function onFanout(listener: (evt: FanoutEvent) => void): () => void {
  emitter.on("*", listener);
  return () => emitter.off("*", listener);
}

/** Test hook: enable capture and clear the buffer. */
export function __resetPublishedForTest(): void {
  captureForTest = true;
  published = [];
}

/** Test hook: read everything published since the last reset. */
export function __getPublishedForTest(): FanoutEvent[] {
  return published;
}
