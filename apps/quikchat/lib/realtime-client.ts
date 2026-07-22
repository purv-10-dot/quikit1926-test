import { io, type Socket } from "socket.io-client";

export interface RealtimeClientOptions {
  url: string;
  /**
   * Fetches a fresh handshake token. Socket.IO calls this on every (re)connect,
   * so token refresh-on-reconnect is automatic. Defaults to the app endpoint.
   */
  getToken?: () => Promise<string>;
  /** Connect immediately (default true). */
  autoConnect?: boolean;
  /** Heartbeat interval (ms) to keep presence TTL alive. Default 15_000. */
  heartbeatMs?: number;
}

export interface RealtimeClient {
  socket: Socket;
  /** Join a channel room; resolves true if the gateway authorized it. */
  join(channelId: string): Promise<boolean>;
  leave(channelId: string): void;
  /** Tell the gateway this user is typing in a channel (ephemeral, no persistence). */
  typing(channelId: string): void;
  on(event: string, handler: (...args: unknown[]) => void): void;
  off(event: string, handler?: (...args: unknown[]) => void): void;
  disconnect(): void;
}

/** Default token fetcher — hits the app's `GET /api/realtime/token`. */
export async function fetchRealtimeToken(): Promise<string> {
  const res = await fetch("/api/realtime/token", { credentials: "include" });
  if (!res.ok) throw new Error(`realtime token fetch failed: ${res.status}`);
  const body = (await res.json()) as { token: string };
  return body.token;
}

/**
 * Thin wrapper over socket.io-client. This is the seam the UI session will build
 * the React `useRealtime` hook on — it is intentionally minimal here.
 */
export function createRealtimeClient(opts: RealtimeClientOptions): RealtimeClient {
  const getToken = opts.getToken ?? fetchRealtimeToken;

  const socket = io(opts.url, {
    autoConnect: opts.autoConnect ?? true,
    transports: ["polling", "websocket"],
    // Called on every (re)connect → fresh, short-lived token each time.
    auth: (cb) => {
      getToken()
        .then((token) => cb({ token }))
        .catch(() => cb({ token: "" }));
    },
  });

  // Heartbeat: refresh the server-side presence TTL while connected. The interval
  // runs only between `connect` and `disconnect` so it never fires offline.
  const heartbeatMs = opts.heartbeatMs ?? 15_000;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  const startHeartbeat = () => {
    if (heartbeat) return;
    heartbeat = setInterval(() => socket.emit("heartbeat"), heartbeatMs);
  };
  const stopHeartbeat = () => {
    if (heartbeat) clearInterval(heartbeat);
    heartbeat = undefined;
  };
  socket.on("connect", startHeartbeat);
  socket.on("disconnect", stopHeartbeat);

  return {
    socket,
    join: (channelId) =>
      new Promise<boolean>((resolve) => {
        socket.emit("join", channelId, (r: { ok: boolean } | undefined) => resolve(!!r?.ok));
      }),
    leave: (channelId) => {
      socket.emit("leave", channelId);
    },
    typing: (channelId) => {
      socket.emit("typing", { channelId });
    },
    on: (event, handler) => {
      socket.on(event, handler);
    },
    off: (event, handler) => {
      socket.off(event, handler);
    },
    disconnect: () => {
      stopHeartbeat();
      socket.disconnect();
    },
  };
}
