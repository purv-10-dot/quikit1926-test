import { createServer, type Server as HttpServer } from "node:http";
import { Server as IOServer } from "socket.io";
import { registerCallingHandlers } from "./calling";
import { FANOUT_CHANNEL, type FanoutEvent, type FanoutEventType } from "./fanout-contract";
import { logger } from "./logger";
import { createMetrics, type Metrics } from "./metrics";
import { markOffline, markOnline, onlineUserIds, refresh, type PresenceRedis } from "./presence";
import { broadcastConnectivity, broadcastSetStatus } from "./presence-broadcast";
import {
  assertMembership,
  getPresenceStatus,
  getPresenceStatuses,
  listChannelIdsForMember,
  listMemberUserIdsForChannels,
} from "./queries";
import { channelRoom, userRoom } from "./rooms";
import { startSweeper, type RingingRedis } from "./ringing";
import { verifyToken } from "./token";

/** Minimal shape of an ioredis subscriber (real ioredis or ioredis-mock). */
export interface FanoutSubscriber {
  subscribe(channel: string): Promise<unknown> | unknown;
  on(event: "message", listener: (channel: string, message: string) => void): unknown;
}

export interface GatewayOptions {
  tokenSecret: string;
  allowedOrigins: string[] | "*";
  /** Subscriber connection for the `quikchat:fanout` channel. */
  fanoutSubscriber: FanoutSubscriber;
  /** Optional Socket.IO Redis adapter factory (omit for single-instance / tests). */
  adapterFactory?: Parameters<IOServer["adapter"]>[0];
  /** Reports Redis health (adapter/pub connected). Defaults to always-true. */
  healthCheck?: () => boolean;
  /** Reports fan-out subscriber health (§2.8). Defaults to always-true. */
  fanoutHealthy?: () => boolean;
  /** Max inbound events (join/leave) per socket per window. Default 20. */
  wsEventLimit?: number;
  /** Inbound rate-limit window in ms. Default 10_000. */
  wsWindowMs?: number;
  /** Redis client for presence (omit to disable presence). */
  presenceRedis?: PresenceRedis;
  /** Presence key TTL in ms (heartbeat must arrive within this). Default 30_000. */
  presenceTtlMs?: number;
  /** Redis client backing the ringing timeout (§2.1). Omit to disable calling. */
  ringingRedis?: RingingRedis;
  /** Ringing sweep interval in ms. Default 5_000. */
  sweepIntervalMs?: number;
  /** Max inbound Socket.IO message size in bytes (§2.8). Default 1_000_000. */
  maxHttpBufferSize?: number;
  /** Pre-built metrics registry (§2.6). Omit to build one internally. */
  metrics?: Metrics;
  /** Optionally attach to an existing HTTP server instead of creating one. */
  httpServer?: HttpServer;
}

interface SocketBucket {
  count: number;
  resetAt: number;
}

/**
 * Re-send `presence_snapshot` every Nth heartbeat. The client heartbeats every
 * 15s (`createRealtimeClient`), so 4 puts the re-sync at ~60s. Piggybacking on
 * traffic that already exists means no server-side timer to own and nothing left
 * running when the client goes away.
 */
export const PRESENCE_RESYNC_EVERY = 4;

export interface Gateway {
  io: IOServer;
  httpServer: HttpServer;
  metrics: Metrics;
  /** Dispatch a fan-out event to rooms directly (also called by the subscriber). */
  dispatch: (evt: FanoutEvent) => void;
  close: () => Promise<void>;
}

/**
 * Build the realtime gateway. The gateway is fan-out + read-only authorization
 * only — it never writes a domain row.
 */
export function createGateway(opts: GatewayOptions): Gateway {
  const metrics = opts.metrics ?? createMetrics();
  const isHealthy = () =>
    (opts.healthCheck ? opts.healthCheck() : true) &&
    (opts.fanoutHealthy ? opts.fanoutHealthy() : true);

  const httpServer =
    opts.httpServer ??
    createServer((req, res) => {
      if (req.url === "/health") {
        const ok = isHealthy();
        res.writeHead(ok ? 200 : 503, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            status: ok ? "ok" : "degraded",
            service: "realtime-gateway",
            redis: opts.healthCheck ? opts.healthCheck() : true,
            fanoutSubscriber: opts.fanoutHealthy ? opts.fanoutHealthy() : true,
          }),
        );
        return;
      }
      if (req.url === "/metrics") {
        metrics
          .render()
          .then(({ body, contentType }) => {
            res.writeHead(200, { "content-type": contentType });
            res.end(body);
          })
          .catch(() => {
            res.writeHead(500, { "content-type": "text/plain" });
            res.end("metrics error");
          });
        return;
      }
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "not found" }));
    });

  const io = new IOServer(httpServer, {
    cors: { origin: opts.allowedOrigins, credentials: true },
    // §2.8 — cap inbound frame size explicitly (default socket.io is 1MB; we set
    // it so the value is intentional and tunable via env in index.ts).
    maxHttpBufferSize: opts.maxHttpBufferSize ?? 1_000_000,
  });
  if (opts.adapterFactory) io.adapter(opts.adapterFactory);

  const updateRoomsGauge = () => {
    try {
      metrics.rooms.set(io.of("/").adapter.rooms.size);
    } catch {
      // adapter may not expose rooms in every environment; best-effort gauge.
    }
  };

  // --- Handshake auth: verify the short-lived token, pin identity to socket ---
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token as string | undefined;
      if (!token) {
        logger.warn({ socketId: socket.id }, "ws auth rejected: no token provided");
        return next(new Error("Missing handshake token"));
      }
      const { userId, orgId } = verifyToken(token, opts.tokenSecret);
      socket.data.userId = userId;
      socket.data.orgId = orgId;
      next();
    } catch (err) {
      logger.warn(
        { socketId: socket.id, error: (err as Error).message },
        "ws auth rejected: unauthorized",
      );
      next(new Error("Unauthorized"));
    }
  });

  const presence = opts.presenceRedis;
  const presenceTtl = opts.presenceTtlMs ?? 30_000;

  io.on("connection", async (socket) => {
    const { userId, orgId } = socket.data as { userId: string; orgId: string };
    logger.info({ socketId: socket.id, orgId, userId }, "ws connect");
    metrics.connections.inc();

    // Populated below; `broadcastPresence` reads it through the closure so the
    // disconnect path uses whatever rooms we had managed to join.
    let channelIds: string[] = [];

    const broadcastPresence = (status: "online" | "offline", lastSeen?: string) =>
      broadcastConnectivity(io, orgId, userId, channelIds, status, lastSeen);

    /** Has `markOnline`'s `sadd` landed for THIS socket? Gates the release. */
    let presenceAdded = false;

    const releasePresence = async (): Promise<void> => {
      if (!presence) return;
      try {
        const { lastSocket, lastSeen } = await markOffline(presence, orgId, userId, socket.id);
        if (lastSocket) broadcastPresence("offline", lastSeen);
      } catch {
        // best-effort
      }
    };

    // --- disconnect: REGISTERED FIRST, before any await ---
    //
    // This listener used to be registered at the BOTTOM of this handler, after
    // the room joins and four sequential DB round-trips below. Socket.IO emits
    // `disconnect` once; a socket that died inside that window was already in
    // the presence set (markOnline's `sadd` runs early) but never got a listener
    // to take it back out. The id then sat in the set forever — not even ageing
    // out, because every LATER socket's `pexpire` refreshed the TTL under it. So
    // the user's real last tab would close, `scard` would still see the orphan,
    // `lastSocket` would be false, and no `presence:lastseen:` write and no
    // `offline` broadcast ever happened. That is permanent presence corruption
    // from a sub-second socket, and this app churns them: view switches tear the
    // client down, and React StrictMode double-invokes the effect in dev.
    //
    // Registering it here closes the window rather than compensating for it —
    // there is no reconciliation sweep, because there is nothing left to
    // reconcile.
    socket.on("disconnect", async (reason) => {
      logger.info({ socketId: socket.id, orgId, userId, reason }, "ws disconnect");
      metrics.connections.dec();
      updateRoomsGauge();
      // Firing mid-setup is the case this reordering exists for. Do NOT release
      // here when markOnline hasn't landed yet: our `srem` would race the
      // in-flight `sadd` and lose, re-creating the exact orphan we just fixed.
      // The connect path re-checks `socket.disconnected` immediately after
      // markOnline and releases there instead, so the id is always removed by
      // exactly one of the two paths.
      if (presenceAdded) await releasePresence();
    });

    // Personal room (fan-out targeting + channel_created joins).
    await socket.join(userRoom(orgId, userId));

    // Auto-join current channel rooms (read-only, org-scoped).
    try {
      channelIds = await listChannelIdsForMember(orgId, userId);
      for (const id of channelIds) await socket.join(channelRoom(orgId, id));
    } catch {
      // If the lookup fails the socket still works; it just starts with no
      // channel rooms and can `join` explicitly.
    }
    updateRoomsGauge();

    /**
     * Who is online in this socket's channels, plus their durable set-status.
     *
     * Sent on connect AND re-sent periodically from the heartbeat (see below).
     * `applySnapshot` on the client REPLACES its online set wholesale, so this
     * is idempotent and self-correcting — a client that missed a transition is
     * put right by the next one.
     */
    const sendPresenceSnapshot = async (): Promise<void> => {
      if (!presence) return;
      const candidates = await listMemberUserIdsForChannels(orgId, channelIds);
      const online = await onlineUserIds(presence, orgId, candidates);
      // Batched (single findMany) set-status read over the online candidates —
      // never one query per user. The snapshot carries each online user's
      // durable status so a fresh client renders the right dot immediately.
      const statuses = await getPresenceStatuses(orgId, online);
      const users = online.map((uid) => {
        const s = statuses.get(uid);
        return s
          ? {
              userId: uid,
              status: s.status,
              ...(s.statusMessage ? { statusMessage: s.statusMessage } : {}),
              ...(s.statusExpiresAt ? { statusExpiresAt: s.statusExpiresAt } : {}),
            }
          : { userId: uid };
      });
      socket.emit("presence_snapshot", { users });
    };

    // Presence: mark online (Redis), broadcast to shared-channel rooms only, and
    // seed this socket with a snapshot of who's already online in its channels.
    if (presence) {
      try {
        const { firstSocket } = await markOnline(presence, orgId, userId, socket.id, presenceTtl);
        presenceAdded = true;

        // The socket may have died while markOnline was in flight — the listener
        // above deliberately declined to act on it. Undo our own `sadd` and stop:
        // everything past this point (snapshot, heartbeat, join/leave, calling)
        // belongs to a socket that no longer exists.
        if (socket.disconnected) {
          await releasePresence();
          return;
        }

        if (firstSocket) {
          broadcastPresence("online");
          // Seed observers with this user's DURABLE set-status on connect (read
          // read-only). Closes the gap where an observer connected before this
          // user set their status and so never received the live change. Live
          // changes still ride the app → Redis → dispatch path.
          try {
            const own = await getPresenceStatus(orgId, userId);
            if (own)
              broadcastSetStatus(
                io,
                orgId,
                userId,
                channelIds,
                own.status,
                own.statusMessage,
                own.statusExpiresAt,
              );
          } catch {
            // best-effort seed
          }
        }
        await sendPresenceSnapshot();
      } catch {
        // presence is best-effort; the socket still works without it. markOnline
        // may or may not have got its `sadd` in before throwing, so assume it did
        // and let the disconnect path clean up — `srem` of a member that was
        // never added is a harmless no-op.
        presenceAdded = true;
        if (socket.disconnected) void releasePresence();
      }

      // Heartbeat: refresh the TTL, and every RESYNC_EVERY beats re-send the
      // snapshot so a client that missed a transition converges.
      //
      // CONVERGENT, NOT CORRECT: presence keys expire silently — a TTL lapse
      // broadcasts nothing — so an observer can hold a stale `online` until the
      // next re-sync lands. This bounds that staleness at roughly
      // RESYNC_EVERY × the client's heartbeat interval (~60s at today's 15s);
      // it does not make presence exact, and it is not a substitute for the
      // disconnect ordering above.
      let beats = 0;
      socket.on("heartbeat", () => {
        void refresh(presence, orgId, userId, socket.id, presenceTtl).catch(() => undefined);
        beats += 1;
        if (beats % PRESENCE_RESYNC_EVERY === 0) {
          void sendPresenceSnapshot().catch(() => undefined);
        }
      });
    }

    // Signal that rooms are joined (clients/tests wait on this before relying
    // on fan-out delivery).
    socket.emit("ready", { channelIds });

    // Per-socket inbound rate limit (join/leave floods).
    const limit = opts.wsEventLimit ?? 20;
    const windowMs = opts.wsWindowMs ?? 10_000;
    const allowInbound = (): boolean => {
      const now = Date.now();
      const b = (socket.data.rl as SocketBucket | undefined) ?? {
        count: 0,
        resetAt: now + windowMs,
      };
      if (now >= b.resetAt) {
        b.count = 0;
        b.resetAt = now + windowMs;
      }
      b.count += 1;
      socket.data.rl = b;
      return b.count <= limit;
    };

    // Join a channel after connect — authorized via the same org-aware check
    // the route handlers use. assertMembership THROWS on failure; the catch is
    // what blocks a non-member from reaching socket.join (do not change to a
    // boolean check — that would be an authz bypass).
    socket.on("join", async (channelId: string, ack?: (r: { ok: boolean }) => void) => {
      if (!allowInbound()) {
        socket.emit("error", { event: "join", channelId, message: "Rate limited" });
        ack?.({ ok: false });
        return;
      }
      try {
        await assertMembership(orgId, channelId, userId);
        await socket.join(channelRoom(orgId, channelId));
        updateRoomsGauge();
        ack?.({ ok: true });
      } catch {
        socket.emit("error", { event: "join", channelId, message: "Forbidden" });
        ack?.({ ok: false });
      }
    });

    socket.on("leave", (channelId: string) => {
      if (!allowInbound()) {
        socket.emit("error", { event: "leave", channelId, message: "Rate limited" });
        return;
      }
      void socket.leave(channelRoom(orgId, channelId));
    });

    // Typing: relay to the channel room EXCLUDING the sender. Membership is the
    // room membership (the socket must be joined to that channel's room).
    socket.on("typing", (payload: { channelId?: string }) => {
      if (!allowInbound()) return;
      const channelId = payload?.channelId;
      if (typeof channelId !== "string") return;
      if (!socket.rooms.has(channelRoom(orgId, channelId))) return; // not a member
      socket.to(channelRoom(orgId, channelId)).emit("typing", { channelId, userId });
    });

    // Calling signaling handlers (membership-gated relay, no DB writes). Only
    // wired when a ringing Redis is configured (§2.1 needs it).
    if (opts.ringingRedis) {
      registerCallingHandlers(io, socket as never, { ringingRedis: opts.ringingRedis });
    }
  });

  // --- §2.1 ringing sweeper: fire timeouts for expired records exactly once ---
  let stopSweeper: (() => void) | undefined;
  if (opts.ringingRedis) {
    stopSweeper = startSweeper(
      opts.ringingRedis,
      (rec) => {
        // Notify BOTH the initiator (call didn't connect) and the target (dismiss
        // the incoming toast). Rooms built from the record's orgId — never a payload.
        io.to(userRoom(rec.orgId, rec.initiatorId)).emit("call:timed_out", { callId: rec.callId });
        io.to(userRoom(rec.orgId, rec.targetUserId)).emit("call:timed_out", { callId: rec.callId });
        logger.info(
          {
            callId: rec.callId,
            orgId: rec.orgId,
            initiatorId: rec.initiatorId,
            targetUserId: rec.targetUserId,
          },
          "call ringing timed out (swept)",
        );
      },
      opts.sweepIntervalMs,
    );
  }

  // --- Redis subscriber: fan-out events → org-scoped rooms ---
  void Promise.resolve(opts.fanoutSubscriber.subscribe(FANOUT_CHANNEL)).then(() => {
    metrics.fanoutSubUp.set(1);
  });
  opts.fanoutSubscriber.on("message", (channel, message) => {
    if (channel !== FANOUT_CHANNEL) return;
    const startedAt = performance.now();
    let evt: FanoutEvent;
    try {
      evt = JSON.parse(message) as FanoutEvent;
    } catch {
      return;
    }
    dispatchFanout(io, evt);
    metrics.recordDispatch(evt.event as FanoutEventType, (performance.now() - startedAt) / 1000);
  });

  function dispatch(evt: FanoutEvent): void {
    dispatchFanout(io, evt);
  }

  async function close(): Promise<void> {
    stopSweeper?.();
    await io.close();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  }

  return { io, httpServer, metrics, dispatch, close };
}

/**
 * Route a fan-out event to the correct org-scoped room. The room is ALWAYS
 * built from `evt.orgId` — a payload can never make an event cross tenants.
 */
export function dispatchFanout(io: IOServer, evt: FanoutEvent): void {
  const { orgId, event, payload } = evt;

  if (event === "channel_created") {
    const p = payload as { channelId: string; memberIds: string[] };
    if (!p?.channelId || !Array.isArray(p.memberIds)) return;
    const rooms = p.memberIds.map((u) => userRoom(orgId, u));
    // Adapter-aware: joins matching sockets across all instances.
    void io.in(rooms).socketsJoin(channelRoom(orgId, p.channelId));
    return;
  }

  // Per-user event: deliver to the recipient's user room (the gateway joins it
  // on connect). Room built from orgId/userId — never from the payload.
  //
  // `.local`: every replica subscribes to the fanout channel and runs this same
  // function, so a cluster-wide emit here would double (triple, ...) deliver —
  // one dispatch per replica, each reaching the whole cluster via the adapter.
  // Restricting to `.local` makes each replica serve only its own sockets, so
  // the cluster-wide total is exactly one per connected socket.
  if (event === "notification") {
    if (!evt.userId) return;
    io.to(userRoom(orgId, evt.userId)).local.emit("notification", payload);
    return;
  }

  // Durable set-status change (app-published). Fans out like channel_created:
  // the payload names the author's channel ids and we relay to each channel
  // room. Rooms built from orgId — never from the payload.
  if (event === "presence_status") {
    const p = payload as {
      userId?: string;
      status?: string;
      statusMessage?: string;
      statusExpiresAt?: string;
      channelIds?: string[];
    };
    if (!p?.userId || !p.status || !Array.isArray(p.channelIds)) return;
    const out = {
      userId: p.userId,
      status: p.status,
      ...(p.statusMessage ? { statusMessage: p.statusMessage } : {}),
      ...(p.statusExpiresAt ? { statusExpiresAt: p.statusExpiresAt } : {}),
    };
    for (const cid of p.channelIds) io.to(channelRoom(orgId, cid)).local.emit("presence_status", out);
    return;
  }

  // Group details changed → relay to the channel room so members update the
  // channel in place. Room from orgId + top-level channelId — never the payload.
  if (event === "channel_updated") {
    const p = payload as { channelId?: string };
    if (!p?.channelId) return;
    io.to(channelRoom(orgId, evt.channelId)).local.emit("channel_updated", payload);
    return;
  }

  // Group deleted-for-everyone → relay to the channel room so members remove it
  // live. Sockets stay joined to the (now-defunct) room in the adapter, so this
  // still reaches every connected member. Room from orgId — never the payload.
  if (event === "channel_deleted") {
    const p = payload as { channelId?: string };
    if (!p?.channelId) return;
    io.to(channelRoom(orgId, evt.channelId)).local.emit("channel_deleted", payload);
    return;
  }

  // message / message_update / reaction / system / read → the channel room.
  // `system` is delivered as a `message` (it already carries a full MessageDto);
  // `read` carries { channelId, userId, readAt } for live read-receipts.
  const emitEvent = event === "system" ? "message" : event;
  io.to(channelRoom(orgId, evt.channelId)).local.emit(emitEvent, payload);
}
