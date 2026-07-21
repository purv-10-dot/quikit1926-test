/**
 * Pure typing-indicator state. Each `typing {channelId, userId}` relay refreshes
 * an expiry for that user in that channel; entries auto-expire after a TTL so a
 * dropped "stop" (the gateway never sends one — typing is fire-and-forget) can't
 * leave a stuck indicator.
 *
 * Time is injected (`now`) so the reducer stays pure and testable; React drives
 * it with `Date.now()` plus a short interval to prune.
 */

/** channelId → (userId → expiresAt epoch ms). */
export type TypingState = Readonly<Record<string, Readonly<Record<string, number>>>>;

/** How long a single `typing` event keeps a user marked typing. */
export const TYPING_TTL_MS = 5_000;

export function emptyTyping(): TypingState {
  return {};
}

/** Mark `userId` typing in `channelId` until `now + ttlMs`. */
export function applyTyping(
  state: TypingState,
  evt: { channelId: string; userId: string },
  now: number,
  ttlMs: number = TYPING_TTL_MS,
): TypingState {
  if (!evt?.channelId || !evt?.userId) return state;
  const channel = state[evt.channelId] ?? {};
  return {
    ...state,
    [evt.channelId]: { ...channel, [evt.userId]: now + ttlMs },
  };
}

/** Drop expired entries (and empty channels). Returns same ref if nothing changed. */
export function pruneTyping(state: TypingState, now: number): TypingState {
  let changed = false;
  const next: Record<string, Record<string, number>> = {};
  for (const [channelId, users] of Object.entries(state)) {
    const live: Record<string, number> = {};
    for (const [userId, expiresAt] of Object.entries(users)) {
      if (expiresAt > now) live[userId] = expiresAt;
      else changed = true;
    }
    if (Object.keys(live).length > 0) next[channelId] = live;
    else if (Object.keys(users).length > 0) changed = true;
  }
  return changed ? next : state;
}

/** User ids currently typing in a channel (excluding expired). */
export function whoIsTyping(state: TypingState, channelId: string, now: number): string[] {
  const users = state[channelId];
  if (!users) return [];
  return Object.entries(users)
    .filter(([, expiresAt]) => expiresAt > now)
    .map(([userId]) => userId);
}
