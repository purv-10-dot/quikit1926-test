/**
 * Pure reducers for the notification bell state. The bell tracks unread
 * *notifications* (mentions/dms/keywords/reactions) — distinct from the channel
 * list's unread *messages* (S04). Kept pure + serializable for easy testing; the
 * NotificationProvider holds one of these in React state and reconciles the
 * `unreadCount` with the server's returned value after each mutation.
 */
import type { NotificationDto } from "@/lib/shared";

export interface NotifState {
  feed: NotificationDto[];
  unreadCount: number;
  byChannel: Record<string, number>;
}

export function emptyNotifState(): NotifState {
  return { feed: [], unreadCount: 0, byChannel: {} };
}

export function seed(
  feed: NotificationDto[],
  unreadCount: number,
  byChannel: Record<string, number>,
): NotifState {
  return { feed, unreadCount: Math.max(0, unreadCount), byChannel: { ...byChannel } };
}

const bump = (by: Record<string, number>, channelId: string | null, delta: number) => {
  if (!channelId) return by;
  const next = { ...by };
  const v = (next[channelId] ?? 0) + delta;
  if (v > 0) next[channelId] = v;
  else delete next[channelId];
  return next;
};

/** Inbound realtime event: prepend (de-dupe by id) and bump the badge if unread. */
export function applyInbound(state: NotifState, n: NotificationDto): NotifState {
  if (state.feed.some((f) => f.id === n.id)) return state; // already have it
  const feed = [n, ...state.feed];
  if (n.isRead) return { ...state, feed };
  return {
    feed,
    unreadCount: state.unreadCount + 1,
    byChannel: bump(state.byChannel, n.channelId, 1),
  };
}

/** Append an older page (de-duped). Counts are unchanged (page rows may be read or unread). */
export function appendPage(state: NotifState, rows: NotificationDto[]): NotifState {
  const seen = new Set(state.feed.map((f) => f.id));
  const fresh = rows.filter((r) => !seen.has(r.id));
  return { ...state, feed: [...state.feed, ...fresh] };
}

export function markReadLocal(state: NotifState, ids: string[]): NotifState {
  const idSet = new Set(ids);
  let cleared = 0;
  let byChannel = state.byChannel;
  const feed = state.feed.map((n) => {
    if (idSet.has(n.id) && !n.isRead) {
      cleared += 1;
      byChannel = bump(byChannel, n.channelId, -1);
      return { ...n, isRead: true };
    }
    return n;
  });
  return { feed, unreadCount: Math.max(0, state.unreadCount - cleared), byChannel };
}

export function markAllReadLocal(state: NotifState): NotifState {
  return {
    feed: state.feed.map((n) => (n.isRead ? n : { ...n, isRead: true })),
    unreadCount: 0,
    byChannel: {},
  };
}

export function markChannelReadLocal(state: NotifState, channelId: string): NotifState {
  let cleared = 0;
  const feed = state.feed.map((n) => {
    if (n.channelId === channelId && !n.isRead) {
      cleared += 1;
      return { ...n, isRead: true };
    }
    return n;
  });
  return {
    feed,
    unreadCount: Math.max(0, state.unreadCount - cleared),
    byChannel: bump(state.byChannel, channelId, -(state.byChannel[channelId] ?? 0)),
  };
}

export function clearAllLocal(): NotifState {
  return emptyNotifState();
}

/** Override the authoritative unread count with the server's returned value. */
export function reconcileCount(state: NotifState, serverCount: number): NotifState {
  if (!Number.isFinite(serverCount)) return state;
  return { ...state, unreadCount: Math.max(0, serverCount) };
}
