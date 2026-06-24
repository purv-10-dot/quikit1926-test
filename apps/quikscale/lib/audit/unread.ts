/**
 * Pure unread-count logic (no DB) so the rule is unit-testable.
 *
 * An event is UNREAD for a viewer when it was created AFTER the viewer's
 * high-water mark (lastReadAt) AND was NOT authored by that viewer — editors
 * implicitly "read" their own actions (AC-1.35). When the viewer has no read
 * marker yet, every not-authored-by-them event counts as unread.
 */
export interface UnreadEvent {
  actorUserId: string;
  createdAt: string | Date;
}

export function computeUnreadCount(
  events: ReadonlyArray<UnreadEvent>,
  lastReadAt: string | Date | null | undefined,
  currentUserId: string,
): number {
  const cutoff = lastReadAt ? new Date(lastReadAt).getTime() : 0;
  let count = 0;
  for (const e of events) {
    if (e.actorUserId === currentUserId) continue;
    if (new Date(e.createdAt).getTime() > cutoff) count++;
  }
  return count;
}
