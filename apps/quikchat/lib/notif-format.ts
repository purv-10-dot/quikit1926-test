/**
 * Pure presentation helpers for the notification feed: the one-line summary per
 * type, the channel/DM label, relative time, and grouping by channel/DM. No
 * React here so it's trivially unit-tested.
 */
import type { NotificationDto } from "@/lib/shared";

interface Meta {
  channelName?: string;
  channelType?: string;
  actorName?: string;
  keyword?: string;
  emoji?: string;
  reason?: string;
}

export function metaOf(n: NotificationDto): Meta {
  return (n.meta ?? {}) as Meta;
}

export function actorName(n: NotificationDto): string {
  return metaOf(n).actorName || "Someone";
}

/** The trailing summary clause (the actor name is rendered separately, bold). */
export function summaryText(n: NotificationDto): string {
  const meta = metaOf(n);
  switch (n.type) {
    case "dm":
      return "sent you a message";
    case "keyword":
      return meta.keyword ? `keyword “${meta.keyword}”` : "matched a keyword";
    case "reaction":
      return meta.emoji ? `reacted ${meta.emoji} to your message` : "reacted to your message";
    case "thread_reply":
      return "replied in a thread";
    case "mention":
    default:
      return "mentioned you";
  }
}

/** Full single-line summary, e.g. "Maya Rao mentioned you". */
export function fullSummary(n: NotificationDto): string {
  return `${actorName(n)} ${summaryText(n)}`;
}

/** "#design" for group channels, "DM" for direct messages. */
export function channelLabel(n: NotificationDto): string {
  const meta = metaOf(n);
  if (meta.channelType === "dm") return "DM";
  return meta.channelName ? `#${meta.channelName}` : "#channel";
}

/** Group heading label — channels as "#name", DMs as the other person's name. */
export function groupLabel(n: NotificationDto): string {
  const meta = metaOf(n);
  if (meta.channelType === "dm") return meta.channelName || actorName(n) || "Direct message";
  return meta.channelName ? `#${meta.channelName}` : "#channel";
}

export interface NotifGroup {
  key: string;
  label: string;
  isDm: boolean;
  items: NotificationDto[];
}

/**
 * Group the feed by channel/DM, preserving first-seen order (so the group with
 * the newest item floats to the top, since the feed is desc).
 */
export function groupFeed(feed: NotificationDto[]): NotifGroup[] {
  const groups: NotifGroup[] = [];
  const byKey = new Map<string, NotifGroup>();
  for (const n of feed) {
    const key = n.channelId ?? `__${n.type}`;
    let group = byKey.get(key);
    if (!group) {
      group = { key, label: groupLabel(n), isDm: metaOf(n).channelType === "dm", items: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    group.items.push(n);
  }
  return groups;
}

/** Compact relative time: "now", "2m", "3h", "5d", else a short date. */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "";
  const sec = Math.max(0, Math.floor((now - then) / 1000));
  if (sec < 45) return "now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d`;
  return new Date(then).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
