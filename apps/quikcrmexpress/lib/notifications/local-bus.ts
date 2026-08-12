/**
 * In-process notification pub/sub — the realtime transport for single-process
 * deployments (most importantly `next dev`, where Redis usually isn't running).
 *
 * `next dev` serves every API route handler AND the SSE stream route from ONE
 * Node process, so an in-memory EventEmitter is enough to bridge a
 * createNotification() call to an open SSE connection — no Redis required.
 *
 * In multi-process / multi-instance production you still want Redis to fan out
 * across instances (see realtime.ts): the SSE route subscribes to Redis when it
 * is reachable and only falls back to this bus when it is not. Because the SSE
 * route attaches a listener to EXACTLY ONE transport, publishing to both Redis
 * and this bus never double-delivers within a process.
 *
 * The emitter lives on globalThis so it survives Next.js dev HMR module reloads
 * (same pattern as lib/db/prisma.ts and lib/db/redis.ts).
 */

import { EventEmitter } from "node:events";
import type { NotificationEvent } from "./realtime";

declare global {
  // eslint-disable-next-line no-var
  var __notificationBus: EventEmitter | undefined;
}

function bus(): EventEmitter {
  if (!globalThis.__notificationBus) {
    const emitter = new EventEmitter();
    // One open bell tab → one listener per (tenant,user) channel. With many
    // concurrent dev sessions this can exceed Node's default cap of 10 and
    // print a spurious MaxListenersExceededWarning. 0 = unlimited.
    emitter.setMaxListeners(0);
    globalThis.__notificationBus = emitter;
  }
  return globalThis.__notificationBus;
}

/** Publish a notification event to in-process subscribers. Never throws. */
export function publishLocalNotification(
  channel: string,
  event: NotificationEvent,
): void {
  bus().emit(channel, event);
}

/**
 * Subscribe to a channel. Returns an unsubscribe function — the SSE route must
 * call it on disconnect so listeners don't leak across reconnects.
 */
export function subscribeLocalNotification(
  channel: string,
  handler: (event: NotificationEvent) => void,
): () => void {
  bus().on(channel, handler);
  return () => {
    bus().off(channel, handler);
  };
}
