import { type NextRequest } from "next/server";
import { requireApiUser, isResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { getRedis, isRedisEnabled } from "@/lib/db/redis";
import { tenantLeadChannel } from "@/lib/services/leads/realtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/leads/stream
 *
 * Server-Sent Events feed of lead changes for the caller's tenant. The kanban
 * (and any future "live" surface) subscribes via EventSource — the server
 * forwards every Redis publish on `quikcrm:leads:<orgId>` as an SSE event.
 *
 * Connection lifecycle:
 *   - Redis subscriber is duplicated per connection (subscribe mode is sticky).
 *   - 25s heartbeat comments keep proxies / load balancers from idling out.
 *   - `req.signal` "abort" closes the subscriber + the controller.
 *
 * Auth: NextAuth cookie (EventSource sends cookies same-origin). Module ACL is
 * enforced — `leads:view` is required just like the JSON endpoints.
 *
 * Vercel note: long-lived SSE hits the function-timeout cap on Vercel
 * (10s/60s/900s by tier). EventSource auto-reconnects, so it still works there,
 * but for a clean prod story migrate to Pusher / Ably / a long-lived host.
 */
export async function GET(req: NextRequest) {
  const user = await requireApiUser();
  if (isResponse(user)) return user;
  try {
    await assertModule(user, "leads", "view");
  } catch {
    return new Response("Forbidden", { status: 403 });
  }

  if (!isRedisEnabled()) {
    return new Response("Realtime unavailable: REDIS_URL is not set", { status: 503 });
  }

  const channel = tenantLeadChannel(user.orgId);
  const sub = getRedis().duplicate();
  // Suppress ioredis 'unhandled error event' noise on this short-lived clone.
  sub.on("error", () => {});

  // Prove Redis is reachable BEFORE we hand the client an SSE response — if
  // the daemon is down we want a clean 503 (so EventSource enters error state
  // and our client-side give-up logic kicks in) rather than an open stream
  // that immediately closes.
  try {
    if (sub.status !== "ready" && sub.status !== "connecting") {
      await sub.connect();
    }
    await sub.ping();
  } catch (err) {
    sub.disconnect();
    console.warn(
      "[realtime] Redis unreachable, returning 503:",
      err instanceof Error ? err.message : String(err),
    );
    return new Response("Realtime unavailable: Redis unreachable", { status: 503 });
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

      try {
        await sub.subscribe(channel);
      } catch (err) {
        console.warn(
          "[realtime] subscribe failed:",
          err instanceof Error ? err.message : String(err),
        );
        controller.close();
        return;
      }

      sub.on("message", (_chan, msg) => {
        try {
          const parsed = JSON.parse(msg) as unknown;
          sendEvent("lead", parsed);
        } catch {
          /* ignore malformed payloads */
        }
      });

      sendEvent("hello", { orgId: user.orgId, ts: Date.now() });

      const heartbeat = setInterval(() => writeFrame(`: ping ${Date.now()}\n\n`), 25000);

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
      // Disable buffering on Nginx-style proxies so events flush immediately.
      "X-Accel-Buffering": "no",
    },
  });
}
