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
import { readLastSeen } from "./presence-redis";

export { isSetStatus };
export type { SetStatus };

export interface PresenceDto {
  status: SetStatus;
  statusMessage: string | null;
  /** ISO instant the status auto-reverts to available (null = never). */
  statusExpiresAt: string | null;
  /** Mutual last-seen visibility. Default on; see `getEffectiveLastSeen`. */
  shareLastSeen: boolean;
}

const DEFAULT: PresenceDto = {
  status: "available",
  statusMessage: null,
  statusExpiresAt: null,
  shareLastSeen: true,
};

type PresenceRow = {
  status: string;
  statusMessage: string | null;
  statusExpiresAt: Date | null;
  shareLastSeen: boolean;
};

function toDto(row: PresenceRow): PresenceDto {
  return {
    status: isSetStatus(row.status) ? row.status : "available",
    statusMessage: row.statusMessage,
    statusExpiresAt: row.statusExpiresAt ? row.statusExpiresAt.toISOString() : null,
    shareLastSeen: row.shareLastSeen,
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
    select: { status: true, statusMessage: true, statusExpiresAt: true, shareLastSeen: true },
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
    // Expiry resets the STATUS only — `shareLastSeen` is a privacy preference,
    // not part of the timed status, so it survives the revert (and the lazy
    // clear above deliberately doesn't touch it either).
    return { ...DEFAULT, shareLastSeen: row.shareLastSeen };
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
 * Set the caller's status (+ optional message + optional expiry) and/or their
 * `shareLastSeen` privacy flag, upsert, then publish the change so other clients
 * sharing a channel update live. Returns the persisted DTO. `expiresAt` is an
 * absolute ISO instant computed client-side (so end-of-day/week honour the user's
 * timezone); a non-future/invalid value is clamped to null ("until I change it").
 * Reset = status "available", expiresAt null.
 *
 * `status` is OPTIONAL so a privacy-only patch (`{ shareLastSeen }`) doesn't have
 * to restate the current status and risk clobbering it. The two groups are
 * written independently: omitting `status` leaves status/statusMessage/
 * statusExpiresAt untouched, and omitting `shareLastSeen` leaves the flag alone.
 */
export async function setMyPresence(
  ctx: OrgContext,
  patch: {
    status?: SetStatus;
    statusMessage?: string | null;
    expiresAt?: string | null;
    shareLastSeen?: boolean;
  },
): Promise<PresenceDto> {
  // A status write carries its message + expiry with it (existing semantics: an
  // omitted message/expiry on a status change clears them). A patch WITHOUT
  // `status` must not touch any of the three.
  const statusData =
    patch.status !== undefined
      ? {
          status: patch.status,
          statusMessage: patch.statusMessage?.trim() || null,
          statusExpiresAt: normalizeExpiry(patch.expiresAt),
        }
      : {};
  const shareData =
    patch.shareLastSeen !== undefined ? { shareLastSeen: patch.shareLastSeen } : {};

  const row = await prisma.qcUserPresence.upsert({
    where: { orgId_userId: { orgId: ctx.orgId, userId: ctx.userId } },
    create: {
      orgId: ctx.orgId,
      userId: ctx.userId,
      // A first-write privacy-only patch still needs a status; the column
      // default and this fallback agree on "available".
      status: patch.status ?? "available",
      statusMessage: patch.status !== undefined ? patch.statusMessage?.trim() || null : null,
      statusExpiresAt: patch.status !== undefined ? normalizeExpiry(patch.expiresAt) : null,
      ...shareData,
    },
    update: { ...statusData, ...shareData },
    select: { status: true, statusMessage: true, statusExpiresAt: true, shareLastSeen: true },
  });

  // Persist-then-publish: relay to every shared-channel room via the gateway.
  // Skipped for a privacy-only patch — the `presence_status` event carries no
  // `shareLastSeen` and observers derive nothing from it, so publishing would be
  // a no-op fan-out to every shared channel.
  const channelIds = patch.status !== undefined ? await myChannelIds(ctx) : [];
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

/**
 * Another user's EFFECTIVE last-seen instant, or null when it must not be shown.
 *
 * WhatsApp-style mutual privacy, resolved cheapest-check-first so the common
 * hidden cases never touch the network:
 *   1. `appear_offline` on the subject hides it outright — no Redis call.
 *      Read-time expiry is applied first (same lazy rule as `getMyPresence`), so
 *      a LAPSED timed `appear_offline` reads as available and does NOT hide it —
 *      otherwise one stale row would suppress last-seen forever.
 *   2. Mutual opt-in: BOTH viewer and subject must have `shareLastSeen`. A
 *      missing row means the user never opened settings ⇒ the column default,
 *      `true`. Still no Redis call when either side has opted out.
 *   3. Only then read the gateway-written Redis key.
 *
 * Callers get a bare `string | null` and MUST NOT distinguish "hidden by
 * privacy" from "never recorded" in the UI — that difference is itself a leak.
 * Both rows come from ONE query, not one per user.
 */
export async function getEffectiveLastSeen(
  ctx: OrgContext,
  subjectUserId: string,
): Promise<string | null> {
  // Your own last seen is never a readout you need; skip the work entirely.
  if (subjectUserId === ctx.userId) return null;

  const rows = await prisma.qcUserPresence.findMany({
    where: { orgId: ctx.orgId, userId: { in: [ctx.userId, subjectUserId] } },
    select: { userId: true, status: true, statusExpiresAt: true, shareLastSeen: true },
  });
  const viewer = rows.find((r) => r.userId === ctx.userId);
  const subject = rows.find((r) => r.userId === subjectUserId);

  // (1) appear_offline — honouring lazy expiry.
  if (subject && !isExpired(subject) && subject.status === "appear_offline") return null;

  // (2) mutual opt-in (absent row ⇒ default true).
  if (!(viewer?.shareLastSeen ?? true) || !(subject?.shareLastSeen ?? true)) return null;

  // (3) the only path that reaches Redis.
  return readLastSeen(ctx.orgId, subjectUserId);
}

/** Absolute future instant → Date; null/past/invalid → null (no expiry). */
function normalizeExpiry(iso?: string | null): Date | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms) || ms <= Date.now()) return null;
  return new Date(ms);
}
