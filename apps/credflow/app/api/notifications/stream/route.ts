/**
 * GET /api/notifications/stream
 *
 * Server-Sent Events feed of incoming notifications for the authenticated user.
 * The client's NotificationBell subscribes via EventSource; the server forwards
 * every publish on `quikcrm:notifications:<orgId>:<userId>` as an SSE event
 * named "notification".
 *
 * Transport selection:
 *   - Redis, when REDIS_URL is set AND the server is reachable — fans out across
 *     processes / instances in production.
 *   - In-process event bus (lib/notifications/local-bus.ts) otherwise — this is
 *     the normal path under `next dev`, where Redis usually isn't running. It
 *     means realtime works locally with zero external services.
 *
 * The route subscribes to EXACTLY ONE transport, so the dual publish in
 * realtime.ts (local bus + Redis) never double-delivers.
 *
 * Connection lifecycle:
 *   - A Redis subscriber is duplicated per connection (subscribe mode is sticky)
 *     and torn down on disconnect; the local-bus listener is removed likewise.
 *   - 25s heartbeat comments keep proxies / load-balancers from idling out.
 *   - `req.signal` "abort" closes the subscriber + the ReadableStream controller.
 *
 * Auth: NextAuth cookie (EventSource sends cookies same-origin by default).
 * Channel naming: `quikcrm:notifications:<orgId>:<userId>` — per-user, no
 * cross-user leakage.
 */

import { type NextRequest } from "next/server";
import { requireApiUser, isResponse } from "@/lib/auth/require";
import { getRedis, isRedisEnabled } from "@/lib/db/redis";
import { tenantUserNotificationChannel } from "@/lib/notifications/realtime";
import { subscribeLocalNotification } from "@/lib/notifications/local-bus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RedisClient = ReturnType<typeof getRedis>;

/**
 * Try to obtain a connected, reachable Redis subscriber. Returns null when
 * Redis is disabled or unreachable — the caller then falls back to the
 * in-process bus instead of failing the connection.
 */
async function tryRedisSubscriber(): Promise<RedisClient | null> {
  if (!isRedisEnabled()) return null;
  const sub = getRedis().duplicate();
  sub.on("error", () => {/* suppress noise from short-lived subscriber clone */});
  try {
    if (sub.status !== "ready" && sub.status !== "connecting") {
      await sub.connect();
    }
    await sub.ping();
    return sub;
  } catch (err) {
    sub.disconnect();
    console.warn(
      "[notifications:stream] Redis unreachable — using in-process bus:",
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}

export async function GET(req: NextRequest) {
  const user = await requireApiUser();
  if (isResponse(user)) return user;

  const channel = tenantUserNotificationChannel(user.orgId, user.userId);
  const redisSub = await tryRedisSubscriber();
  const transport = redisSub ? "redis" : "local";

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      let unsubscribeLocal: (() => void) | null = null;

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

      // ── Wire up whichever transport we selected ──────────────────────────────
      if (redisSub) {
        try {
          await redisSub.subscribe(channel);
        } catch (err) {
          console.warn(
            "[notifications:stream] subscribe failed:",
            err instanceof Error ? err.message : String(err),
          );
          controller.close();
          return;
        }
        // Redis delivers the raw JSON string we published; parse + forward.
        redisSub.on("message", (_chan, msg) => {
          try {
            sendEvent("notification", JSON.parse(msg) as unknown);
          } catch {
            /* ignore malformed payloads */
          }
        });
      } else {
        // In-process bus hands us the event object directly — no parse needed.
        unsubscribeLocal = subscribeLocalNotification(channel, (event) => {
          sendEvent("notification", event);
        });
      }

      // Hello frame so the client knows the connection is live (and which
      // transport — handy when debugging realtime locally).
      sendEvent("hello", { userId: user.userId, ts: Date.now(), transport });

      // 25s heartbeat keeps proxies/LBs from closing idle connections.
      const heartbeat = setInterval(
        () => writeFrame(`: ping ${Date.now()}\n\n`),
        25_000,
      );

      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        if (redisSub) {
          redisSub.unsubscribe(channel).catch(() => {});
          redisSub.quit().catch(() => {});
        }
        unsubscribeLocal?.();
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
