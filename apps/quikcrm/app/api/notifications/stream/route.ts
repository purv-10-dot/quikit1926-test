/**
 * GET /api/notifications/stream
 *
 * Server-Sent Events feed of incoming notifications for the authenticated user.
 * The client's NotificationBell subscribes via EventSource; the server forwards
 * every Redis publish on `quikcrm:notifications:<orgId>:<userId>` as an SSE
 * event named "notification".
 *
 * Connection lifecycle:
 *   - Redis subscriber is duplicated per connection (subscribe mode is sticky).
 *   - 25s heartbeat comments keep proxies / load-balancers from idling out.
 *   - `req.signal` "abort" closes the subscriber + the ReadableStream controller.
 *
 * Auth: NextAuth cookie (EventSource sends cookies same-origin by default).
 *
 * Graceful degradation:
 *   - When Redis is disabled → 503. The client catches this and falls back to
 *     polling via React Query's refetchInterval.
 *   - When Redis is unreachable at connection time → 503 (same).
 *
 * Channel naming: `quikcrm:notifications:<orgId>:<userId>`
 * Each user gets their own channel — no cross-user leakage.
 */

import { type NextRequest } from "next/server";
import { requireApiUser, isResponse } from "@/lib/auth/require";
import { getRedis, isRedisEnabled } from "@/lib/db/redis";
import { tenantUserNotificationChannel } from "@/lib/notifications/realtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await requireApiUser();
  if (isResponse(user)) return user;

  if (!isRedisEnabled()) {
    return new Response("Realtime unavailable: REDIS_URL is not set", {
      status: 503,
    });
  }

  const channel = tenantUserNotificationChannel(user.orgId, user.userId);
  const sub = getRedis().duplicate();
  sub.on("error", () => {/* suppress noise from short-lived subscriber clone */});

  // Verify Redis is reachable before handing the client an SSE response.
  // A 503 here lets EventSource enter its error state cleanly and our
  // client-side fallback (polling) kicks in instead of an orphaned stream.
  try {
    if (sub.status !== "ready" && sub.status !== "connecting") {
      await sub.connect();
    }
    await sub.ping();
  } catch (err) {
    sub.disconnect();
    console.warn(
      "[notifications:stream] Redis unreachable, returning 503:",
      err instanceof Error ? err.message : String(err),
    );
    return new Response("Realtime unavailable: Redis unreachable", {
      status: 503,
    });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;

      const writeFrame = (frame: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(frame));
        } catch {
          closed = true;
        }
      };

      const sendEvent = (event: string, data: unknown) => {
        writeFrame(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      };

      // Subscribe to the per-user channel.
      try {
        await sub.subscribe(channel);
      } catch (err) {
        console.warn(
          "[notifications:stream] subscribe failed:",
          err instanceof Error ? err.message : String(err),
        );
        controller.close();
        return;
      }

      // Forward Redis messages as SSE "notification" events.
      sub.on("message", (_chan, msg) => {
        try {
          const parsed = JSON.parse(msg) as unknown;
          sendEvent("notification", parsed);
        } catch {
          /* ignore malformed payloads */
        }
      });

      // Send a hello frame so the client knows the connection is live.
      sendEvent("hello", { userId: user.userId, ts: Date.now() });

      // 25s heartbeat keeps proxies/LBs from closing idle connections.
      const heartbeat = setInterval(
        () => writeFrame(`: ping ${Date.now()}\n\n`),
        25_000,
      );

      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        sub.unsubscribe(channel).catch(() => {});
        sub.quit().catch(() => {});
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      req.signal.addEventListener("abort", cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Disable Nginx-style buffering so events flush immediately.
      "X-Accel-Buffering": "no",
    },
  });
}
