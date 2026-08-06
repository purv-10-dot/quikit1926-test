import type { ChannelLastMessage, ChannelList, MessageDto } from "@/lib/shared";

export const TEMP_PREFIX = "temp-";
export const isTempId = (id: string) => id.startsWith(TEMP_PREFIX);
export function makeTempId(): string {
  // No Math.random reliance for determinism in tests is unnecessary here; this
  // only runs in the browser on send.
  return `${TEMP_PREFIX}${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

/**
 * Stable ascending order by `createdAt` (tiebreak `id`). The canonical
 * `["messages", channelId]` cache is ALWAYS held ascending (oldest→newest); the
 * API returns newest-first, so pages are reversed/sorted at the seams. This is
 * the defensive guard so a misordered insert can never render descending.
 */
export function sortMessagesAsc(list: MessageDto[]): MessageDto[] {
  return [...list].sort((a, b) => {
    const ta = new Date(a.createdAt).getTime();
    const tb = new Date(b.createdAt).getTime();
    if (ta !== tb) return ta - tb;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/** Seed the cache from a newest-first API page → ascending. */
export function seedFromApiPage(page: MessageDto[]): MessageDto[] {
  return sortMessagesAsc(page);
}

/**
 * Prepend an older (newest-first) history page to the front of the ascending
 * cache, de-duped, keeping the whole list ascending.
 */
export function prependOlder(existing: MessageDto[], olderPage: MessageDto[]): MessageDto[] {
  const seen = new Set(existing.map((m) => m.id));
  const fresh = olderPage.filter((m) => !seen.has(m.id));
  if (fresh.length === 0) return existing;
  return sortMessagesAsc([...fresh, ...existing]);
}

/**
 * Merge an inbound `message` / `system` event into a channel's ascending list.
 *   - already present (by id) → replace (idempotent re-delivery).
 *   - our own echo → reconcile the matching optimistic temp row in place.
 *   - otherwise → append (kept ascending by the render-seam sort).
 */
export function mergeMessageEvent(
  list: MessageDto[],
  incoming: MessageDto,
  meId: string | undefined,
): MessageDto[] {
  const next = [...list];

  const replaceAt = (idx: number) => {
    if (idx < 0) return false;
    next[idx] = incoming;
    return true;
  };

  const removeDuplicatesForLogicalMessage = (matchIdx: number) => {
    const logicalId = incoming.clientMessageId ?? incoming.id;
    if (!logicalId) return;
    for (let i = next.length - 1; i >= 0; i -= 1) {
      const msg = next[i];
      if (!msg) continue;
      const sameLogicalId =
        (msg.clientMessageId && incoming.clientMessageId && msg.clientMessageId === incoming.clientMessageId) ||
        (msg.id === incoming.id && incoming.id && msg.id === incoming.id);
      if (sameLogicalId && i !== matchIdx) next.splice(i, 1);
    }
  };

  const existingIdIndex = next.findIndex((m) => m.id === incoming.id);
  if (existingIdIndex >= 0) {
    replaceAt(existingIdIndex);
    if (incoming.clientMessageId) removeDuplicatesForLogicalMessage(existingIdIndex);
    return next.filter(Boolean);
  }

  // Exact reconcile by clientMessageId (idempotency id) when present.
  if (incoming.clientMessageId) {
    const idx = next.findIndex((m) => m.clientMessageId === incoming.clientMessageId);
    if (idx >= 0) {
      replaceAt(idx);
      removeDuplicatesForLogicalMessage(idx);
      return next.filter(Boolean);
    }
  }

  // Fallback: match our own optimistic temp row by content heuristic.
  if (meId && incoming.senderId === meId) {
    const idx = next.findIndex(
      (m) =>
        isTempId(m.id) &&
        m.senderId === meId &&
        m.type === incoming.type &&
        m.content === incoming.content,
    );
    if (idx >= 0) {
      replaceAt(idx);
      return next.filter(Boolean);
    }
  }

  return [...next, incoming];
}

/** Patch a known message in place (edit / delete / pin / reaction). No-op if absent. */
export function patchMessageEvent(list: MessageDto[], incoming: MessageDto): MessageDto[] {
  if (!list.some((m) => m.id === incoming.id)) return list;
  return list.map((m) => (m.id === incoming.id ? incoming : m));
}

interface BumpOpts {
  /** Is this channel the one currently open? */
  active: boolean;
  /** Did the current user send the message? */
  fromSelf: boolean;
}

/**
 * Move a channel to the top of its section, refresh its preview/time, and
 * adjust the unread count: +1 for an inbound message in a non-active channel,
 * reset to 0 while it's active. Unknown channels are left untouched.
 */
export function bumpChannelList(
  state: ChannelList,
  channelId: string,
  lastMessage: ChannelLastMessage,
  opts: BumpOpts,
): ChannelList {
  const apply = (items: ChannelList["priority"]) => {
    const idx = items.findIndex((c) => c.channelId === channelId);
    if (idx < 0) return null;
    const item = items[idx]!;
    const unreadCount = opts.active ? 0 : opts.fromSelf ? item.unreadCount : item.unreadCount + 1;
    const updated = { ...item, lastMessage, lastActivityAt: lastMessage.createdAt, unreadCount };
    return [updated, ...items.filter((_, i) => i !== idx)];
  };

  const priority = apply(state.priority);
  if (priority) return { ...state, priority };
  const recent = apply(state.recent);
  if (recent) return { ...state, recent };
  return state;
}

/**
 * DM channels (never groups) whose members include `userId` — the exact set of
 * `["last-seen", channelId]` queries a presence change for that user invalidates.
 *
 * Derived from the client's own `["channels"]` cache rather than from the event
 * payload, because the two producers of a presence event disagree: the app's
 * `publishFanout` for `presence_status` carries `channelIds`, while the gateway's
 * connect-time `broadcastSetStatus` seed does not. Reading the local list is
 * uniform across both and across the `presence` connectivity event, which never
 * carries channel ids at all.
 *
 * Groups are excluded deliberately: last-seen is a 1:1 readout (the route rejects
 * non-DMs) so a group can never hold such a query to invalidate.
 */
export function dmChannelIdsWithMember(state: ChannelList, userId: string): string[] {
  const ids: string[] = [];
  for (const c of [...state.priority, ...state.recent]) {
    if (c.type !== "dm") continue;
    if (!c.members.some((m) => m.id === userId)) continue;
    if (!ids.includes(c.channelId)) ids.push(c.channelId);
  }
  return ids;
}

/** Optimistically clear a channel's unread badge (on open). */
export function markChannelRead(state: ChannelList, channelId: string): ChannelList {
  const clear = (items: ChannelList["priority"]) =>
    items.map((c) => (c.channelId === channelId ? { ...c, unreadCount: 0 } : c));
  return { priority: clear(state.priority), recent: clear(state.recent) };
}

/**
 * Merge a `channel_updated` event (rename / description / avatar) into the
 * matching channel in place, so the sidebar + header + drawer update live
 * without a refetch. Only the fields present in the payload are changed.
 */
export function applyChannelUpdated(
  state: ChannelList,
  payload: { channelId: string; name?: string; description?: string | null; avatarUrl?: string },
): ChannelList {
  const update = (items: ChannelList["priority"]) =>
    items.map((c) =>
      c.channelId === payload.channelId
        ? {
            ...c,
            ...(payload.name !== undefined ? { name: payload.name } : {}),
            ...(payload.description !== undefined ? { description: payload.description } : {}),
            ...(payload.avatarUrl !== undefined ? { avatarUrl: payload.avatarUrl } : {}),
          }
        : c,
    );
  return { priority: update(state.priority), recent: update(state.recent) };
}

/** Remove a deleted channel from both lists (live `channel_deleted`). */
export function removeChannelFromList(state: ChannelList, channelId: string): ChannelList {
  const drop = (items: ChannelList["priority"]) =>
    items.filter((c) => c.channelId !== channelId);
  return { priority: drop(state.priority), recent: drop(state.recent) };
}

/** A `read`/`delivered` event updates receipts only when it's NOT the current user's own. */
export function shouldApplyRead(eventUserId: string, meId: string | undefined): boolean {
  return eventUserId !== meId;
}
export const shouldApplyDelivered = shouldApplyRead;

/**
 * Merge a `read` event into a channel's `memberReadAt` map so the tick state
 * recomputes live. Caller drops the current user's own `read` events via
 * `shouldApplyRead`.
 */
export function applyReadEvent(
  state: ChannelList,
  channelId: string,
  userId: string,
  readAt: string,
): ChannelList {
  const update = (items: ChannelList["priority"]) =>
    items.map((c) =>
      c.channelId === channelId
        ? { ...c, memberReadAt: { ...c.memberReadAt, [userId]: readAt } }
        : c,
    );
  return { priority: update(state.priority), recent: update(state.recent) };
}

/**
 * Merge a `delivered` event into a channel's `memberDeliveredAt` map (S14a),
 * mirroring `applyReadEvent`. Monotonic — never moves a member's watermark
 * backwards.
 */
export function applyDeliveredEvent(
  state: ChannelList,
  channelId: string,
  userId: string,
  deliveredAt: string,
): ChannelList {
  const merge = (existing: string | null | undefined): string =>
    existing && new Date(existing).getTime() >= new Date(deliveredAt).getTime()
      ? existing
      : deliveredAt;
  const update = (items: ChannelList["priority"]) =>
    items.map((c) =>
      c.channelId === channelId
        ? {
            ...c,
            memberDeliveredAt: {
              ...c.memberDeliveredAt,
              [userId]: merge(c.memberDeliveredAt[userId]),
            },
          }
        : c,
    );
  return { priority: update(state.priority), recent: update(state.recent) };
}
