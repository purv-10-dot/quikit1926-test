import type { MessageDto } from "@/lib/shared";
import { sameCalendarDay } from "./format";

/** Default grouping window — consecutive same-sender msgs within 5 min group. */
export const GROUP_WINDOW_MS = 5 * 60 * 1000;

export interface MessageRowModel {
  message: MessageDto;
  /** Render avatar + author + time (first row of a group / after a divider). */
  showAuthor: boolean;
  /** Insert a date divider above this row (calendar day changed). */
  showDateDivider: boolean;
  /** Insert the "unread messages" divider above this row. */
  showUnreadDivider: boolean;
}

/**
 * Annotate a chronological (ascending) message list with grouping + divider
 * flags. A new author row starts when: it's the first message, the sender
 * changes, either side is a SystemActivity, or the gap exceeds the window.
 *
 * `unreadDividerMessageId` is resolved ONCE, elsewhere, by `findUnreadDivider`
 * — this function just marks whichever row matches. It is deliberately an
 * id, not a position: this runs on every render as `messages` grows (new
 * arrivals), and a position recomputed against a growing array would drift
 * forward each time, chasing the newest message instead of staying where the
 * user's unread messages actually began.
 */
export function buildMessageRows(
  messages: MessageDto[],
  unreadDividerMessageId: string | null = null,
  windowMs = GROUP_WINDOW_MS,
): MessageRowModel[] {
  return messages.map((message, i) => {
    const prev = i > 0 ? messages[i - 1] : undefined;
    const gap = prev
      ? new Date(message.createdAt).getTime() - new Date(prev.createdAt).getTime()
      : 0;
    const showAuthor =
      !prev ||
      prev.senderId !== message.senderId ||
      message.type === "SystemActivity" ||
      prev.type === "SystemActivity" ||
      gap > windowMs;
    const showDateDivider = !prev || !sameCalendarDay(prev.createdAt, message.createdAt);
    const showUnreadDivider = message.id === unreadDividerMessageId;
    return { message, showAuthor, showDateDivider, showUnreadDivider };
  });
}

export interface UnreadDivider {
  /** The oldest message that should carry the divider above it. */
  messageId: string;
  /**
   * How many non-self messages sit at-or-after the boundary IN THE ARRAY
   * THIS WAS RESOLVED AGAINST — not necessarily the `unreadCount` passed in.
   * The caller MUST render this value, not `unreadCount`, as the divider's
   * label count. This is the fix for a real bug: `messages` can be an
   * incomplete snapshot at the moment this resolves (React Query serves a
   * stale cached page synchronously before a background refetch catches up
   * — see ChatWorkspace's messagesQuery, no staleTime/gcTime override), while
   * `unreadCount` is captured fresh and correctly from a DIFFERENT source
   * (the channels list). Labelling with the input `unreadCount` while
   * positioning against a short array is how "7 unread messages" rendered
   * with only 6 messages below it — two numbers from two different moments,
   * kept "in sync" only by convention. Returning both from one resolution
   * makes that disagreement structurally impossible: whatever position this
   * lands on, `count` is a byproduct of that exact same walk.
   */
  count: number;
}

/**
 * Resolve the "unread messages" divider: the oldest message that should
 * carry it, and how many messages that resolution actually found — or null
 * when there's nothing unread.
 *
 * `unreadCount` (from `ChannelListItem`, computed server-side in
 * channels.service.ts) counts only messages from OTHER members — mirrored
 * here via the same `senderId !== currentUserId` rule — so this walks
 * backward from the newest message, counting only non-self messages, until
 * `unreadCount` of them have been counted; the message where the count is
 * satisfied is the boundary, and `count` is `unreadCount` unchanged. If fewer
 * such messages are loaded than `unreadCount` claims (older history not
 * paged in yet, or a stale cache not yet caught up — see `UnreadDivider`),
 * this falls back to the oldest currently-loaded message, and `count` is
 * however many were ACTUALLY found — smaller than `unreadCount` — so a
 * caller rendering `count` can never show a number the position disagrees
 * with.
 */
export function findUnreadDivider(
  messages: MessageDto[],
  currentUserId: string,
  unreadCount: number,
): UnreadDivider | null {
  if (unreadCount <= 0 || messages.length === 0) return null;
  let remaining = unreadCount;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]!.senderId !== currentUserId) {
      remaining -= 1;
      if (remaining === 0) return { messageId: messages[i]!.id, count: unreadCount };
    }
  }
  const found = unreadCount - remaining;
  return found > 0 ? { messageId: messages[0]!.id, count: found } : null;
}
