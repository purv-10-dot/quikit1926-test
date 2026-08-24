import { HttpError } from "@/lib/auth-shims";
import { db as prisma } from "@quikit/database";
import {
  type MessageDto,
  type Mention,
  type ParentPreview,
  type PublicUser,
  type ReactionSummary,
} from "@/lib/shared";
import { getGuestUserIds } from "@/lib/authz/permissions";

/** A QcMessage row as returned by Prisma. */
export interface MessageRow {
  id: string;
  orgId: string;
  channelId: string;
  senderId: string | null;
  actorType: string;
  type: string;
  content: string;
  data: unknown;
  reactions: unknown;
  parentMessageId: string | null;
  isPinned: boolean;
  clientMessageId: string | null;
  editedAt: Date | null;
  createdAt: Date;
}

/**
 * Load PublicUser projections for a set of user ids (deduped).
 *
 * `orgId` is optional and additive: pass it to also populate `isGuest` (one
 * extra indexed query, batched alongside the user fetch) for surfaces that
 * render the "External" badge (channel members, channel list, org directory).
 * Callers that don't need the badge (calendar attendees, call history, the
 * AI-agent name-flattening paths) can omit it — behavior is identical to
 * before this field existed.
 */
export async function loadPublicUsers(
  userIds: Array<string | null | undefined>,
  orgId?: string,
): Promise<Map<string, PublicUser>> {
  const ids = Array.from(new Set(userIds.filter((id): id is string => !!id)));
  if (!ids.length) return new Map();
  const [users, guestIds] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: ids } } }),
    orgId ? getGuestUserIds(orgId, ids) : Promise.resolve(new Set<string>()),
  ]);
  return new Map(users.map((u) => [u.id, toPublicUser(u, guestIds.has(u.id))]));
}

export function toPublicUser(
  user: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    avatar: string | null;
    email?: string;
  },
  isGuest?: boolean,
): PublicUser {
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ");
  return {
    id: user.id,
    displayName: fullName || user.email || "Unknown",
    avatarUrl: user.avatar ?? null,
    ...(isGuest ? { isGuest: true } : {}),
  };
}

/** Resolve a single display name (for system-message text). */
export async function displayNameOf(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(" ");
  return fullName || "Someone";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function summarizeReactions(value: unknown): ReactionSummary[] {
  const reactions = asRecord(value) ?? {};
  return Object.entries(reactions)
    .map(([emoji, userIds]) => ({
      emoji,
      count: Array.isArray(userIds) ? userIds.length : 0,
      userIds: Array.isArray(userIds) ? (userIds as string[]) : [],
    }))
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count);
}

/**
 * Map a QcMessage row (+ optional parent) to the clean MessageDto. Mentions are
 * lifted out of `data` into their own field; the rest of `data` (media,
 * forwardedFrom, …) is preserved.
 */
export function toMessageDto(m: MessageRow, parent: MessageRow | null): MessageDto {
  const rawData = asRecord(m.data);
  const mentions: Mention[] = Array.isArray(rawData?.mentions)
    ? (rawData!.mentions as Mention[])
    : [];

  let data: Record<string, unknown> | null = null;
  if (rawData) {
    const { mentions: _drop, ...rest } = rawData;
    data = Object.keys(rest).length ? rest : null;
  }

  const parentPreview: ParentPreview | null = parent
    ? {
        id: parent.id,
        senderId: parent.senderId,
        type: parent.type,
        content: parent.content,
      }
    : null;

  return {
    id: m.id,
    channelId: m.channelId,
    senderId: m.senderId,
    actorType: m.actorType === "ai_agent" ? "ai_agent" : "human",
    type: m.type as MessageDto["type"],
    content: m.content,
    data,
    parentMessageId: m.parentMessageId,
    parentPreview,
    isPinned: m.isPinned,
    reactions: summarizeReactions(m.reactions),
    mentions,
    clientMessageId: m.clientMessageId ?? null,
    createdAt: m.createdAt.toISOString(),
    editedAt: m.editedAt ? m.editedAt.toISOString() : null,
  };
}

export function iso(d: Date): string {
  return d.toISOString();
}

// --- request parsing ---

/** Parse a JSON body, tolerating an empty/invalid body (returns {}). */
export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export { HttpError };
