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
}

/**
 * Annotate a chronological (ascending) message list with grouping + divider
 * flags. A new author row starts when: it's the first message, the sender
 * changes, either side is a SystemActivity, or the gap exceeds the window.
 */
export function buildMessageRows(
  messages: MessageDto[],
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
    return { message, showAuthor, showDateDivider };
  });
}
