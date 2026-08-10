/**
 * Thin read-only chat queries against the central `@quikit/database` client.
 *
 * The standalone gateway imported `assertMembership` from `@quikit/auth` and
 * `listChannelIdsForMember` / `listMemberUserIdsForChannels` from
 * `@quikit/database`. Those importable helpers do NOT exist in the merged
 * monorepo — membership is done inline in `apps/quikchat/lib/server/*`. So the
 * gateway owns these queries, mirroring the app's query shapes exactly. The
 * gateway is read-only: it never writes a domain row.
 */
import { db } from "@quikit/database";

/**
 * Assert that `userId` may act on `channelId` within `orgId`. Resolves on
 * success; **throws** on failure (channel not in org, or no member row).
 *
 * Throwing (not returning a boolean) is deliberate and load-bearing: the socket
 * `join` handler is `try { await assertMembership(...); await socket.join(...) }
 * catch { Forbidden }`. A boolean-returning helper ported into that shape would
 * let a non-member fall through to `socket.join` — an authz bypass. A plain
 * `Error` is fine; the `join` catch is type-agnostic (we intentionally do NOT
 * import the app's `HttpError`). Mirrors `apps/quikchat/lib/authz.ts`.
 */
export async function assertMembership(
  orgId: string,
  channelId: string,
  userId: string,
): Promise<void> {
  const channel = await db.qcChannel.findUnique({ where: { id: channelId } });
  if (!channel || channel.orgId !== orgId) {
    throw new Error("forbidden");
  }
  const member = await db.qcChannelMember.findUnique({
    where: { orgId_channelId_userId: { orgId, channelId, userId } },
  });
  if (!member) {
    throw new Error("forbidden");
  }
}

/**
 * Channel ids a user is a member of (auto-join on connect). Org-scoped.
 * Mirrors the membership lookup in `channels.service.ts#listForUser`.
 */
export async function listChannelIdsForMember(orgId: string, userId: string): Promise<string[]> {
  const rows = await db.qcChannelMember.findMany({
    where: { orgId, userId },
    select: { channelId: true },
  });
  return rows.map((r) => r.channelId);
}

/**
 * Distinct member user-ids across a set of channels (presence snapshot).
 * Mirrors the member fan-out in `channels.service.ts#discover`.
 */
export async function listMemberUserIdsForChannels(
  orgId: string,
  channelIds: string[],
): Promise<string[]> {
  if (channelIds.length === 0) return [];
  const rows = await db.qcChannelMember.findMany({
    where: { orgId, channelId: { in: channelIds } },
    select: { userId: true },
  });
  return [...new Set(rows.map((r) => r.userId))];
}

/** A user's durable set-status, as read from QcUserPresence (read-only). */
export interface PresenceStatusRow {
  status: string; // available | busy | dnd | brb | away | appear_offline
  statusMessage: string | null;
  /** ISO expiry instant (null = never). Carried so clients can time the revert. */
  statusExpiresAt: string | null;
}

type RawRow = { status: string; statusMessage: string | null; statusExpiresAt: Date | null };

/**
 * Apply LAZY read-time expiry (no sweeper). A timed status past its instant reads
 * as `available` with no expiry — the gateway NEVER writes, it only reads and
 * resolves. The app clears the row lazily on the owner's next GET.
 */
function resolveExpiry(r: RawRow): PresenceStatusRow {
  if (r.statusExpiresAt != null && r.statusExpiresAt.getTime() <= Date.now()) {
    return { status: "available", statusMessage: null, statusExpiresAt: null };
  }
  return {
    status: r.status,
    statusMessage: r.statusMessage,
    statusExpiresAt: r.statusExpiresAt ? r.statusExpiresAt.toISOString() : null,
  };
}

/**
 * Batched read of durable set-status for a set of users. ONE `findMany` over the
 * candidate ids the snapshot already computes — never N per-user queries. The
 * gateway is read-only: this seeds the connect-time snapshot, it never writes.
 */
export async function getPresenceStatuses(
  orgId: string,
  userIds: string[],
): Promise<Map<string, PresenceStatusRow>> {
  const out = new Map<string, PresenceStatusRow>();
  if (userIds.length === 0) return out;
  const rows = await db.qcUserPresence.findMany({
    where: { orgId, userId: { in: userIds } },
    select: { userId: true, status: true, statusMessage: true, statusExpiresAt: true },
  });
  for (const r of rows) out.set(r.userId, resolveExpiry(r));
  return out;
}

/** A single user's durable set-status (read-only, read-time expiry). Seeds on connect. */
export async function getPresenceStatus(
  orgId: string,
  userId: string,
): Promise<PresenceStatusRow | null> {
  const row = await db.qcUserPresence.findUnique({
    where: { orgId_userId: { orgId, userId } },
    select: { status: true, statusMessage: true, statusExpiresAt: true },
  });
  return row ? resolveExpiry(row) : null;
}
