/**
 * Pure presence state for the chat UI. The gateway is the source of truth
 * (Redis-only); this is just a client-side projection of the `presence` and
 * `presence_snapshot` events into a set of currently-online user ids, plus the
 * last-seen timestamp for users that have gone offline.
 *
 * Pure and serializable so it is trivially testable and safe to hold in React
 * state — no timers, no sockets.
 */

export interface PresenceState {
  /** User ids currently online (in channels this client shares). */
  online: ReadonlySet<string>;
  /** Last-seen ISO timestamp per user that has gone offline. */
  lastSeen: Readonly<Record<string, string>>;
}

export interface PresenceEvent {
  userId: string;
  status: "online" | "offline";
  lastSeen?: string;
}

export interface PresenceSnapshot {
  userIds: string[];
}

export function emptyPresence(): PresenceState {
  return { online: new Set(), lastSeen: {} };
}

/** Seed/replace the online set from a snapshot (sent on socket connect). */
export function applySnapshot(state: PresenceState, snap: PresenceSnapshot): PresenceState {
  return { online: new Set(snap.userIds ?? []), lastSeen: state.lastSeen };
}

/** Apply a single presence transition. Returns the same reference if unchanged. */
export function applyPresence(state: PresenceState, evt: PresenceEvent): PresenceState {
  if (!evt?.userId) return state;
  const online = new Set(state.online);
  if (evt.status === "online") {
    if (state.online.has(evt.userId)) return state;
    online.add(evt.userId);
    // Coming online clears any stale last-seen marker.
    const { [evt.userId]: _removed, ...lastSeen } = state.lastSeen;
    return { online, lastSeen };
  }
  // offline
  const had = state.online.has(evt.userId);
  online.delete(evt.userId);
  const lastSeen = evt.lastSeen
    ? { ...state.lastSeen, [evt.userId]: evt.lastSeen }
    : state.lastSeen;
  if (!had && lastSeen === state.lastSeen) return state;
  return { online, lastSeen };
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
