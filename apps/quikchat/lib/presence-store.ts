/**
 * Pure presence state for the chat UI. The gateway is the source of truth for
 * ephemeral connectivity (Redis-only) and the app owns durable set-status
 * (QcUserPresence). This store is the SINGLE client-side reconciliation point:
 * it holds the two streams separately and computes the effective status.
 *
 * Two independent inputs reach the store:
 *   1. `presence` events (gateway-emitted, EPHEMERAL): a user's connectivity —
 *      "online" / "offline", plus "on_call" while they're in a live call.
 *   2. `presence_status` events (app-published, DURABLE): a user's chosen
 *      set-status — "available" / "busy" / "dnd" / "away" (+ optional message).
 *
 * Only the client sees both streams, so precedence is resolved HERE (not on the
 * gateway, which would otherwise need to know the app's durable state, nor on
 * the app, which can't see the ephemeral state):
 *
 *   offline        (no socket)              — a real disconnect wins over everything
 *   appear_offline (set, "be invisible")    — masks to offline; OUTRANKS on_call so a
 *                                             live call never outs an invisible user
 *   on_call        (in a live call)         — overrides busy/dnd/brb/away/available
 *   set-status     (busy/dnd/brb/away/available)
 *   online         (socket, no set-status)
 *
 * A set-status may carry an expiry (`expiresAt`, epoch ms). Once past, it is
 * treated as absent (falls through to `online`) — read-time/lazy, no sweeper.
 *
 * Pure and serializable so it is trivially testable and safe to hold in React
 * state — no timers, no sockets.
 */

/** Durable, user-chosen status (persisted in QcUserPresence). */
export type SetStatus = "available" | "busy" | "dnd" | "brb" | "away" | "appear_offline";

/** Ephemeral connectivity emitted by the gateway. */
export type Connectivity = "online" | "on_call" | "offline";

/** Resolved status the UI renders (set-status ∪ ephemeral). */
export type EffectiveStatus = SetStatus | "on_call" | "online" | "offline";

export interface PresenceState {
  /**
   * User ids currently connected (connectivity !== offline). Retained for
   * back-compat with callers that only need a boolean online check
   * (`onlineUserIds` / `isOnline` / `onlineCount`).
   */
  online: ReadonlySet<string>;
  /** Connectivity for connected users (absent ⇒ offline). "on_call" while live. */
  connectivity: Readonly<Record<string, "online" | "on_call">>;
  /**
   * Durable set-status per user. Retained across offline (resurfaces on reconnect).
   * `expiresAt` (epoch ms) marks a timed status; once past it reads as absent.
   */
  setStatus: Readonly<Record<string, { status: SetStatus; message?: string; expiresAt?: number }>>;
  /**
   * Last-seen ISO timestamp per user that has gone offline, as broadcast by the
   * gateway.
   *
   * ⚠️ RAW — DO NOT RENDER THIS. The gateway emits it unconditionally and it has
   * passed through NONE of `getEffectiveLastSeen`'s rules: not the subject's
   * `appear_offline`, not the mutual `shareLastSeen` opt-in. Wiring it into a
   * header would silently bypass every privacy guarantee this feature exists to
   * enforce, and it would look entirely reasonable in review.
   *
   * Nothing reads it today (kept only so the store models the full event). The DM
   * header goes through `GET /api/channels/:id/last-seen` — the only code path
   * that applies the privacy rules — and ChatWorkspace's presence handlers
   * invalidate that query so it re-reads. If you need a peer's last-seen, refetch
   * that route; never reach in here.
   */
  lastSeen: Readonly<Record<string, string>>;
}

/** A single ephemeral connectivity transition (gateway `presence` event). */
export interface PresenceEvent {
  userId: string;
  status: Connectivity;
  lastSeen?: string;
}

/** A durable set-status change (app `presence_status` event / gateway seed). */
export interface PresenceStatusEvent {
  userId: string;
  status: SetStatus;
  statusMessage?: string;
  /** ISO instant when the status auto-reverts to available (null/omitted = never). */
  statusExpiresAt?: string | null;
}

/**
 * Connect-time snapshot. Lists the users the gateway seeds for this client
 * (online candidates), each with their durable set-status if any.
 *
 * NOTE (coordinated change): the shape changed from the legacy `{ userIds }` to
 * `{ users }`. The gateway and this store must ship together — an old client
 * against a new gateway (or vice versa) would mis-read the snapshot. In the
 * single-repo dev setup both rebuild together. `applySnapshot` still tolerates
 * the legacy `{ userIds }` shape so a partial deploy degrades to online/offline
 * rather than crashing.
 */
export interface PresenceSnapshot {
  users?: Array<{
    userId: string;
    status?: SetStatus;
    statusMessage?: string;
    statusExpiresAt?: string | null;
  }>;
  /** @deprecated legacy binary shape — tolerated, seeds online-only. */
  userIds?: string[];
}

const SET_STATUSES: readonly SetStatus[] = [
  "available",
  "busy",
  "dnd",
  "brb",
  "away",
  "appear_offline",
];
export function isSetStatus(v: unknown): v is SetStatus {
  return typeof v === "string" && (SET_STATUSES as readonly string[]).includes(v);
}

/** Parse an ISO expiry into epoch ms; undefined for null/absent/invalid. */
function parseExpiry(iso?: string | null): number | undefined {
  if (!iso) return undefined;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? undefined : ms;
}

export function emptyPresence(): PresenceState {
  return { online: new Set(), connectivity: {}, setStatus: {}, lastSeen: {} };
}

/** Seed/replace connectivity + set-status from a snapshot (sent on socket connect). */
export function applySnapshot(state: PresenceState, snap: PresenceSnapshot): PresenceState {
  const online = new Set<string>();
  const connectivity: Record<string, "online" | "on_call"> = {};
  // Retain any set-status we already knew, then overlay the snapshot's.
  const setStatus: Record<string, { status: SetStatus; message?: string; expiresAt?: number }> = {
    ...state.setStatus,
  };

  if (Array.isArray(snap.users)) {
    for (const u of snap.users) {
      if (!u?.userId) continue;
      online.add(u.userId);
      connectivity[u.userId] = "online";
      if (isSetStatus(u.status)) {
        const expiresAt = parseExpiry(u.statusExpiresAt);
        setStatus[u.userId] = {
          status: u.status,
          ...(u.statusMessage ? { message: u.statusMessage } : {}),
          ...(expiresAt != null ? { expiresAt } : {}),
        };
      }
    }
  } else if (Array.isArray(snap.userIds)) {
    // Legacy binary shape — online-only.
    for (const id of snap.userIds) {
      online.add(id);
      connectivity[id] = "online";
    }
  }
  return { online, connectivity, setStatus, lastSeen: state.lastSeen };
}

/** Apply a single ephemeral connectivity transition. Same ref if unchanged. */
export function applyPresence(state: PresenceState, evt: PresenceEvent): PresenceState {
  if (!evt?.userId) return state;

  if (evt.status === "offline") {
    const had = state.online.has(evt.userId);
    const online = new Set(state.online);
    online.delete(evt.userId);
    const { [evt.userId]: _c, ...connectivity } = state.connectivity;
    const lastSeen = evt.lastSeen
      ? { ...state.lastSeen, [evt.userId]: evt.lastSeen }
      : state.lastSeen;
    if (!had && lastSeen === state.lastSeen) return state;
    // NOTE: setStatus is intentionally retained — a user's chosen status is
    // durable and must resurface (via precedence) when they reconnect.
    return { online, connectivity, setStatus: state.setStatus, lastSeen };
  }

  // online | on_call — the user has at least one socket.
  const conn: "online" | "on_call" = evt.status === "on_call" ? "on_call" : "online";
  if (state.online.has(evt.userId) && state.connectivity[evt.userId] === conn) return state;
  const online = new Set(state.online);
  online.add(evt.userId);
  const connectivity = { ...state.connectivity, [evt.userId]: conn };
  // Coming online clears any stale last-seen marker.
  const { [evt.userId]: _removed, ...lastSeen } = state.lastSeen;
  return { online, connectivity, setStatus: state.setStatus, lastSeen };
}

/** Apply a durable set-status change. Same ref if unchanged. */
export function applyStatus(state: PresenceState, evt: PresenceStatusEvent): PresenceState {
  if (!evt?.userId || !isSetStatus(evt.status)) return state;
  const prev = state.setStatus[evt.userId];
  const message = evt.statusMessage || undefined;
  const expiresAt = parseExpiry(evt.statusExpiresAt);
  if (prev && prev.status === evt.status && prev.message === message && prev.expiresAt === expiresAt) {
    return state;
  }
  const setStatus = {
    ...state.setStatus,
    [evt.userId]: {
      status: evt.status,
      ...(message ? { message } : {}),
      ...(expiresAt != null ? { expiresAt } : {}),
    },
  };
  return { ...state, setStatus };
}

/**
 * Effective status the UI renders — the precedence resolution (see file header):
 * offline(no socket) > appear_offline > on_call > set-status > online. A timed
 * set-status past its `expiresAt` (relative to `now`) is treated as absent.
 */
export function statusOf(
  state: PresenceState,
  userId: string,
  now: number = Date.now(),
): EffectiveStatus {
  if (!state.online.has(userId)) return "offline";
  const set = state.setStatus[userId];
  const active = set && (set.expiresAt == null || now < set.expiresAt);
  // appear_offline masks to offline and OUTRANKS on_call — invisibility must not
  // be broken by taking a call.
  if (active && set!.status === "appear_offline") return "offline";
  if (state.connectivity[userId] === "on_call") return "on_call";
  if (active) return set!.status;
  return "online";
}

/**
 * Earliest future set-status expiry (epoch ms) across all users, or null. Used
 * by the client to schedule a single re-resolve timer at the next deadline.
 */
export function nextExpiry(state: PresenceState, now: number = Date.now()): number | null {
  let min: number | null = null;
  for (const id of Object.keys(state.setStatus)) {
    const exp = state.setStatus[id]?.expiresAt;
    if (exp != null && exp > now && (min == null || exp < min)) min = exp;
  }
  return min;
}

/** Optional free-text status message for a user (only meaningful when set). */
export function statusMessageOf(state: PresenceState, userId: string): string | undefined {
  return state.setStatus[userId]?.message;
}

export function isOnline(state: PresenceState, userId: string): boolean {
  return state.online.has(userId);
}

/** Count of the given users that are online — used for the header "N online". */
export function onlineCount(state: PresenceState, userIds: string[]): number {
  let n = 0;
  for (const id of userIds) if (state.online.has(id)) n += 1;
  return n;
}
