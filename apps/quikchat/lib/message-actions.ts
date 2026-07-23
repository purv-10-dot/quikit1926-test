import type { Mention, MessageDto, ReactionSummary } from "@/lib/shared";

/** Replace a message in an ascending list by id (no-op if absent). */
export function updateInList(
  list: MessageDto[],
  id: string,
  fn: (m: MessageDto) => MessageDto,
): MessageDto[] {
  return list.map((m) => (m.id === id ? fn(m) : m));
}

/**
 * Optimistically toggle the caller's reaction, keeping the same shape the
 * server emits (`ReactionSummary[]` sorted by count desc). The `reaction` echo
 * later reconciles to the authoritative state by id.
 */
export function toggleReactionOptimistic(
  message: MessageDto,
  emoji: string,
  meId: string,
): MessageDto {
  const map = new Map<string, string[]>();
  for (const r of message.reactions) map.set(r.emoji, [...r.userIds]);

  const users = map.get(emoji) ?? [];
  if (users.includes(meId)) {
    const next = users.filter((u) => u !== meId);
    if (next.length === 0) map.delete(emoji);
    else map.set(emoji, next);
  } else {
    map.set(emoji, [...users, meId]);
  }

  const reactions: ReactionSummary[] = [...map.entries()]
    .map(([e, userIds]) => ({ emoji: e, count: userIds.length, userIds }))
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count);

  return { ...message, reactions };
}

/** Optimistic in-place edit (content + recomputed mentions + edited marker). */
export function applyEditOptimistic(
  message: MessageDto,
  content: string,
  mentions: Mention[],
  editedAt: string,
): MessageDto {
  return { ...message, content, mentions, editedAt };
}

/** Optimistic delete-for-everyone tombstone (matches the server shape). */
export function applyDeleteOptimistic(message: MessageDto): MessageDto {
  return {
    ...message,
    type: "Delete",
    content: "",
    data: null,
    reactions: [],
    mentions: [],
  };
}

/** Optimistic pin/unpin flip. */
export function applyPinOptimistic(message: MessageDto, pinned: boolean): MessageDto {
  return { ...message, isPinned: pinned };
}
