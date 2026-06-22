/**
 * QuikScale real-time relay.
 *
 * A small, stateless-by-design Socket.io server. It does NO database access —
 * it only:
 *   1. authenticates each connection with a short-lived handshake token,
 *   2. joins the socket to its tenant (org) and team rooms,
 *   3. subscribes to the Redis Pub/Sub channel that the Vercel API routes
 *      publish to, and relays each signal to the matching org room.
 *
 * Deploy this OFF Vercel (Railway / Render / Fly / a container) — Vercel
 * serverless functions cannot hold the long-lived WebSocket connections this
 * needs. Required env: NEXTAUTH_SECRET (or REALTIME_JWT_SECRET), REDIS_URL,
 * REALTIME_ALLOWED_ORIGINS, PORT.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { getRedis } from "@quikit/redis";
import {
  REALTIME_CHANNEL,
  REALTIME_EVENT,
  orgRoom,
  teamRoom,
  verifyRealtimeToken,
  type RealtimeSignal,
  type RealtimeTokenClaims,
} from "@quikit/realtime/server";

const PORT = Number(process.env.PORT ?? 4001);
const ORIGINS = (process.env.REALTIME_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const httpServer = createServer((req: IncomingMessage, res: ServerResponse) => {
  // Health check for the platform load balancer.
  if (req.url === "/health" || req.url === "/") {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("ok");
    return;
  }
  res.writeHead(404);
  res.end();
});

const io = new Server(httpServer, {
  cors: {
    // Empty allow-list in dev → reflect any origin. In prod, set the env var.
    origin: ORIGINS.length > 0 ? ORIGINS : true,
    credentials: true,
  },
});

// --- Multi-instance scaling (safe with a single instance too) ---------------
const redis = getRedis();
if (redis) {
  io.adapter(createAdapter(redis, redis.duplicate()));
} else {
  console.warn(
    "[realtime] REDIS_URL is not set — the server will accept connections but " +
      "CANNOT relay events (no Pub/Sub bridge). Set REDIS_URL to enable real-time.",
  );
}

// --- Auth: verify the short-lived handshake token ---------------------------
io.use((socket, next) => {
  const token = (socket.handshake.auth?.token ?? socket.handshake.query?.token) as
    | string
    | undefined;
  const claims = verifyRealtimeToken(token);
  if (!claims) {
    console.warn(
      `[realtime] rejected connection: ${token ? "invalid/expired token" : "no token in handshake"}`,
    );
    next(new Error("unauthorized"));
    return;
  }
  (socket.data as { claims: RealtimeTokenClaims }).claims = claims;
  next();
});

// --- Join tenant + team rooms -----------------------------------------------
io.on("connection", (socket) => {
  const { orgId, teamId, userId } = (socket.data as { claims: RealtimeTokenClaims }).claims;
  socket.join(orgRoom(orgId));
  if (teamId) socket.join(teamRoom(orgId, teamId));
  console.log(`[realtime] connected user=${userId} org=${orgId}${teamId ? ` team=${teamId}` : ""} (${io.engine.clientsCount} total)`);
  socket.on("disconnect", (reason) => {
    console.log(`[realtime] disconnected user=${userId} (${reason})`);
  });
});

// --- Bridge: Redis Pub/Sub → room emit --------------------------------------
if (redis) {
  const sub = redis.duplicate();
  sub.subscribe(REALTIME_CHANNEL, (err) => {
    if (err) {
      console.error("[realtime] failed to subscribe to channel:", err.message);
    } else {
      console.log(`[realtime] subscribed to "${REALTIME_CHANNEL}"`);
    }
  });
  sub.on("message", (channel: string, raw: string) => {
    if (channel !== REALTIME_CHANNEL) return;
    let sig: RealtimeSignal;
    try {
      sig = JSON.parse(raw) as RealtimeSignal;
    } catch {
      return;
    }
    // Route by the server-trusted orgId on the signal — never anything a client sent.
    if (!sig?.orgId) return;
    io.to(orgRoom(sig.orgId)).emit(REALTIME_EVENT, sig);
  });
}

httpServer.listen(PORT, () => {
  console.log(`[realtime] listening on :${PORT}`);
});

// Graceful shutdown.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    io.close();
    httpServer.close();
    process.exit(0);
  });
}
