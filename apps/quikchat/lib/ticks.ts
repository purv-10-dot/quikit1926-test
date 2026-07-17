/**
 * Three-state delivery/read ticks for OWN messages (S14a). All-members
 * semantics: a message is "delivered"/"read" only when EVERY non-sender member
 * has a watermark at-or-after the message's createdAt. DMs (one other member)
 * collapse to this naturally.
 */
import type { MessageDto, PublicUser } from "@/lib/shared";
import { isTempId } from "./realtime-cache";

// Mirror of `ASSISTANT_BOT_USER_ID` in @quikit/shared. Defined locally (not
// value-imported) so this client module never pulls the shared barrel's
// server-only deps (ioredis/sentry) into the browser bundle. The ticks test
// imports the shared constant and asserts the exclusion, guarding drift.
const ASSISTANT_BOT_USER_ID = "quikchat-assistant-bot";

export type TickState = "sending" | "sent" | "delivered" | "read";

/**
 * The members whose ack a message waits on: everyone except the sender AND any
 * `ai_agent` participant (S14b Step 0) — the assistant bot never reads/delivers,
 * so leaving it in would pin every human's ticks at "sent".
 */
function recipients(message: MessageDto, members: PublicUser[]): PublicUser[] {
  return members.filter((m) => m.id !== message.senderId && m.id !== ASSISTANT_BOT_USER_ID);
}

function allAtOrAfter(
  message: MessageDto,
  recips: PublicUser[],
  watermarks: Record<string, string | null>,
): boolean {
  const created = new Date(message.createdAt).getTime();
  return recips.every((r) => {
    const t = watermarks[r.id];
    return !!t && new Date(t).getTime() >= created;
  });
}

/** Every non-sender member has delivered ≥ createdAt. */
export function isDeliveredToAll(
  message: MessageDto,
  members: PublicUser[],
  memberDeliveredAt: Record<string, string | null>,
): boolean {
  const recips = recipients(message, members);
  if (recips.length === 0) return false;
  return allAtOrAfter(message, recips, memberDeliveredAt);
}

/** Every non-sender member has read ≥ createdAt. */
export function isReadByAll(
  message: MessageDto,
  members: PublicUser[],
  memberReadAt: Record<string, string | null>,
): boolean {
  const recips = recipients(message, members);
  if (recips.length === 0) return false;
  return allAtOrAfter(message, recips, memberReadAt);
}

/**
 * Tick for an own message:
 *   - "sending"   optimistic temp row (not yet persisted)
 *   - "sent"      persisted; nobody (yet) delivered — also the only state when
 *                 there are no other members (nobody to deliver to)
 *   - "delivered" all non-sender members received it
 *   - "read"      all non-sender members read it
 */
export function tickState(
  message: MessageDto,
  members: PublicUser[],
  memberReadAt: Record<string, string | null>,
  memberDeliveredAt: Record<string, string | null>,
): TickState {
  if (isTempId(message.id)) return "sending";
  if (isReadByAll(message, members, memberReadAt)) return "read";
  if (isDeliveredToAll(message, members, memberDeliveredAt)) return "delivered";
  return "sent";
}

// ---- "Message info" per-member audience (Step 4) ----

export interface AudienceEntry {
  user: PublicUser;
  /** The read/delivered timestamp (null for pending). */
  at: string | null;
}
export interface MessageAudience {
  read: AudienceEntry[];
  delivered: AudienceEntry[];
  pending: AudienceEntry[];
}

/**
 * Partition the non-sender members into Read by / Delivered to / Pending for the
 * "Message info" view. A member is counted at the highest state reached
 * (read > delivered > pending), each relative to the message's createdAt.
 */
export function partitionMessageAudience(
  message: MessageDto,
  members: PublicUser[],
  memberReadAt: Record<string, string | null>,
  memberDeliveredAt: Record<string, string | null>,
): MessageAudience {
  const created = new Date(message.createdAt).getTime();
  const result: MessageAudience = { read: [], delivered: [], pending: [] };
  for (const user of recipients(message, members)) {
    const rd = memberReadAt[user.id];
    const dl = memberDeliveredAt[user.id];
    if (rd && new Date(rd).getTime() >= created) result.read.push({ user, at: rd });
    else if (dl && new Date(dl).getTime() >= created) result.delivered.push({ user, at: dl });
    else result.pending.push({ user, at: null });
  }
  return result;
}
