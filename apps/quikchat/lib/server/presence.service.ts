/**
 * Rich presence set-status (Teams-style). The app OWNS every write to
 * QcUserPresence; the realtime gateway only reads it (write-free invariant).
 *
 * On write we persist the durable status, then publish a `presence_status`
 * fan-out event carrying the author's channel ids so the gateway relays the
 * change to each shared-channel room — other connected clients update live.
 * Ephemeral state (online / offline / on_call) is NOT stored here; it is derived
 * by the gateway and reconciled client-side (see lib/presence-store.ts).
 */
import { db as prisma } from "@quikit/database";
import { publishFanout } from "@/lib/shared";
import type { OrgContext } from "@/lib/shared";
import { isSetStatus, type SetStatus } from "@/lib/presence-store";

export { isSetStatus };
export type { SetStatus };

export interface PresenceDto {
  status: SetStatus;
  statusMessage: string | null;
  /** ISO instant the status auto-reverts to available (null = never). */
  statusExpiresAt: string | null;
}

const DEFAULT: PresenceDto = { status: "available", statusMessage: null, statusExpiresAt: null };

type PresenceRow = { status: string; statusMessage: string | null; statusExpiresAt: Date | null };

function toDto(row: PresenceRow): PresenceDto {
  return {
    status: isSetStatus(row.status) ? row.status : "available",
    statusMessage: row.statusMessage,
    statusExpiresAt: row.statusExpiresAt ? row.statusExpiresAt.toISOString() : null,
  };
}

/** True when a stored expiry is in the past (status should read as available). */
function isExpired(row: Pick<PresenceRow, "statusExpiresAt">): boolean {
  return row.statusExpiresAt != null && row.statusExpiresAt.getTime() <= Date.now();
}

/**
 * The caller's current set-status (defaults to `available` when never set OR
 * when a timed status has lapsed). Lazy read-time expiry — no sweeper: an expired
 * row reads as available and is cleared best-effort so the DB self-heals.
 */
export async function getMyPresence(ctx: OrgContext): Promise<PresenceDto> {
  const row = await prisma.qcUserPresence.findUnique({
    where: { orgId_userId: { orgId: ctx.orgId, userId: ctx.userId } },
    select: { status: true, statusMessage: true, statusExpiresAt: true },
  });
  if (!row) return DEFAULT;
  if (isExpired(row)) {
    // Best-effort lazy clear (fire-and-forget) — never blocks the read.
    void prisma.qcUserPresence
      .update({
        where: { orgId_userId: { orgId: ctx.orgId, userId: ctx.userId } },
        data: { status: "available", statusMessage: null, statusExpiresAt: null },
      })
      .catch(() => undefined);
    return DEFAULT;
  }
  return toDto(row);
}

/** Channel ids the user is a member of — the fan-out target for a status change. */
async function myChannelIds(ctx: OrgContext): Promise<string[]> {
  const rows = await prisma.qcChannelMember.findMany({
    where: { orgId: ctx.orgId, userId: ctx.userId },
    select: { channelId: true },
  });
  return rows.map((r) => r.channelId);
}

/**
 * Set the caller's status (+ optional message + optional expiry), upsert, then
 * publish the change so other clients sharing a channel update live. Returns the
 * persisted DTO. `expiresAt` is an absolute ISO instant computed client-side
 * (so end-of-day/week honour the user's timezone); a non-future/invalid value is
 * clamped to null ("until I change it"). Reset = status "available", expiresAt null.
 */
export async function setMyPresence(
  ctx: OrgContext,
  patch: { status: SetStatus; statusMessage?: string | null; expiresAt?: string | null },
): Promise<PresenceDto> {
  const statusMessage = patch.statusMessage?.trim() || null;
  const statusExpiresAt = normalizeExpiry(patch.expiresAt);
  const row = await prisma.qcUserPresence.upsert({
    where: { orgId_userId: { orgId: ctx.orgId, userId: ctx.userId } },
    create: { orgId: ctx.orgId, userId: ctx.userId, status: patch.status, statusMessage, statusExpiresAt },
    update: { status: patch.status, statusMessage, statusExpiresAt },
    select: { status: true, statusMessage: true, statusExpiresAt: true },
  });

  // Persist-then-publish: relay to every shared-channel room via the gateway.
  const channelIds = await myChannelIds(ctx);
  if (channelIds.length > 0) {
    await publishFanout({
      orgId: ctx.orgId,
      channelId: "",
      event: "presence_status",
      payload: {
        userId: ctx.userId,
        status: row.status,
        ...(row.statusMessage ? { statusMessage: row.statusMessage } : {}),
        ...(row.statusExpiresAt ? { statusExpiresAt: row.statusExpiresAt.toISOString() } : {}),
        channelIds,
      },
    });
  }

  return toDto(row);
}

/** Absolute future instant → Date; null/past/invalid → null (no expiry). */
function normalizeExpiry(iso?: string | null): Date | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms) || ms <= Date.now()) return null;
  return new Date(ms);
}
